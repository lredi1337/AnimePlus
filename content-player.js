(async function () {
    'use strict';

    let settings = await window.getSettings();
    if (settings.global_enabled === false) return;

    // Защита: запускаем только внутри iframe и только на страницах поддерживаемых сайтов
    // (список сайтов — modules/shared/sites.js; позволяет безопасно использовать широкие разрешения манифеста)
    if (window === window.top) return;

    // Плеер определяем по адресу кадра: всё, что зависит от него, находится в адаптере
    const player = globalThis.AgPlayerAdapters.current();
    if (!player) return;
    const isKodik = player.id === 'kodik';

    const siteHosts = globalThis.AgSites ? globalThis.AgSites.allHosts() : ['animego.me', 'animego.org', 'jut-su.net'];
    const hostOf = (u) => { try { return new URL(u).hostname; } catch (e) { return ''; } };
    const isSiteHost = (h) => !!h && siteHosts.some(d => h === d || h.endsWith('.' + d));

    const ref = document.referrer || '';
    const urlParams = new URLSearchParams(window.location.search);
    const embedDomain = (urlParams.get('d') || '').toLowerCase();
    const embedRef = urlParams.get('ref') || '';
    const refHost = hostOf(ref);
    const parentSite = globalThis.AgSites ? (
        globalThis.AgSites.byHost(refHost) ||
        globalThis.AgSites.byHost(embedDomain) ||
        globalThis.AgSites.byHost(hostOf(embedRef))
    ) : null;

    try {
        const isAllowed = !ref
            || isSiteHost(refHost)
            || isSiteHost(embedDomain)
            || isSiteHost(hostOf(embedRef))
            // Kodik внутри обёртки другого плеера
            || /kodik|anivod|aniboom|dbcode|kombik|tube-storage|aniqizm/.test(refHost)
            // Кадр перезагрузил сам себя: адрес источника теперь он сам
            || refHost === window.location.hostname;

        if (!isAllowed) return;
    } catch (e) {
        return;
    }

    // Команды плееру принимаем только от страниц поддерживаемых сайтов (точное совпадение домена)
    const isParentSiteOrigin = (origin) => /^https:\/\//.test(origin || '') && isSiteHost(hostOf(origin));

    window.top.postMessage({ type: 'AG_GET_DATA' }, '*');

    // ==========================================
    // --- ЛОГИКА ВНУТРИ ПЛЕЕРА (IFRAME) ---
    // ==========================================
    let rewindSum = 0, rewindTimer = null;
    // Смена плеера: откуда продолжить и до какого времени считаем, что этот плеер запускается сам
    const TAKEOVER_WAIT_MS = 45000;
    let handoff = null;
    let pendingSeek = null;
    let takeoverUntil = 0;
    // Кадр, который уже показывали, после скрытия сохраняет ширину, поэтому о скрытии сообщает страница
    let hiddenByPage = false;
    const isShown = () => !!window.innerWidth && !hiddenByPage;
    let canAutoPlay = false;
    let skipData = { op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } };
    const skipMemory = globalThis.AgSkipMemory.create();
    const markSongSkipped = () => { if (globalThis.AgGuide) globalThis.AgGuide.mark('skip'); };
    // Перехват на всём документе: видео рекламы и серии — разные элементы, а события видео не всплывают
    document.addEventListener('seeking', (e) => skipMemory.onSeek(e.target.currentTime), true);
    let currentSkipTarget = null;
    let playerShell = null;
    let siteListsReady = false;

    // Пропуск по звуку: уточняет тайминги, дальше работает обычная логика пропуска
    const audioSkip = globalThis.AgAudioSkip ? globalThis.AgAudioSkip.create({
        getSettings: () => settings,
        getVoice: () => {
            if (!isKodik) return (playerShell && playerShell.current('voices') || {}).title || '';
            const sel = document.querySelector('.serial-translations-box select, .serial-translations select, select[name="translation"]');
            return sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.split(' (')[0].trim() : '';
        },
        getEpisode: () => {
            if (!isKodik) return getLocalEpisodeData().current;
            const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"]');
            return (sel && sel.value) || new URLSearchParams(window.location.search).get('episode') || '';
        },
        onTimings: (timings) => {
            skipData = timings;
        }
    }) : null;

    if (audioSkip) {
        const script = [...document.scripts].find(s => !s.src && s.textContent.includes('parseSkipButton('));
        if (script) audioSkip.setNative(globalThis.AgAudioSkip.parseNativeMarks(script.textContent), globalThis.AgAudioSkip.marksFromSite(script.textContent));
    }

    const triggerKodikPlay = (btn) => {
        if (!btn || btn.dataset.agAutoclicked === '1') return;
        btn.dataset.agAutoclicked = '1';
        setTimeout(() => {
            const opts = { bubbles: true, cancelable: true, view: window };
            btn.dispatchEvent(new MouseEvent('mousedown', opts));
            btn.dispatchEvent(new MouseEvent('mouseup', opts));
            btn.click();
            
            const childBtn = btn.querySelector('.play_button') || btn.querySelector('a') || btn.querySelector('svg');
            if (childBtn) {
                childBtn.dispatchEvent(new MouseEvent('mousedown', opts));
                childBtn.dispatchEvent(new MouseEvent('mouseup', opts));
                childBtn.dispatchEvent(new MouseEvent('click', opts));
            }
            
            if (btn.parentElement) {
                btn.parentElement.dispatchEvent(new MouseEvent('mousedown', opts));
                btn.parentElement.dispatchEvent(new MouseEvent('mouseup', opts));
                btn.parentElement.click();
            }
        }, 150);
    };

    // Плеер может быть ещё не готов принять запуск, поэтому пробуем несколько раз
    // Быстрые нажатия подряд в списках заставляют плеер перезагрузить кадр, а его ссылка одноразовая. Сезон, озвучка и серия меняются по очереди
    let ownListsReady = isKodik;
    const OWN_START_TRIES = 8;
    const OWN_START_EVERY_MS = 1500;
    let ownStartTries = 0;
    let ownStartAt = 0;
    // Серию выбрал сам зритель: она ждёт его нажатия. Сама запускается только следующая серия в конце просмотра.
    // Пока только на сайтах DLE: на остальных смену серии ведёт страница, и там поведение прежнее
    let viewerPickedEpisode = false;
    const holdsAutoStart = () => viewerPickedEpisode && isDleNavSite();
    let releaseHold = null;
    const onViewerPickedEpisode = () => {
        viewerPickedEpisode = true;
        if (releaseHold) releaseHold();
        releaseHold = player.startsPickedEpisode && isDleNavSite() ? globalThis.AgPlayerAdapters.holdPickedEpisode(player) : null;
    };
    const checkAndClickPlayButton = () => {
        // Скрытая вкладка плеера на сайте запускаться не должна
        if (!settings.autoPlay || !canAutoPlay || !isShown() || holdsAutoStart()) return false;

        if (!isKodik) {
            if (!ownListsReady) return false;
            const v = player.video();
            if (!v || player.started(v) || player.adState(v) !== 'none') return false;
            if (ownStartTries >= OWN_START_TRIES || Date.now() - ownStartAt < OWN_START_EVERY_MS) return false;
            ownStartTries++;
            ownStartAt = Date.now();
            player.start(v);
            return false;
        }
        
        const allElements = document.querySelectorAll('button, a, div, span');
        for (const el of allElements) {
            if (el.childNodes.length === 1 && el.textContent.trim().toLowerCase().includes('продолжить просмотр')) {
                if (!el.dataset.agAutoclicked) {
                    triggerKodikPlay(el);
                    return true;
                }
            }
        }

        const playBtn = document.querySelector('.play_button') || 
                        document.querySelector('.play_background') || 
                        document.querySelector('.play_background a') || 
                        document.querySelector('.play_background svg') ||
                        document.querySelector('a.play_button') ||
                        document.querySelector('.triangle');
        if (playBtn && !playBtn.dataset.agAutoclicked) {
            triggerKodikPlay(playBtn);
            return true;
        }
        return false;
    };

    let autoplayCheck = setInterval(() => {
        if (checkAndClickPlayButton()) {
            clearInterval(autoplayCheck);
        }
    }, 100);
    setTimeout(() => clearInterval(autoplayCheck), 15000);

    const isJutsu = (document.referrer || '').includes('jut-su.net') || window.location.href.includes('d=jut-su.net');

    // Только список серий. В Kodik три одинаковых выпадающих списка (сезоны, серии, озвучки), и общий
    // .dropdown-content .item находит их все: активным оказывался пункт сезона, а «следующим» — всегда первая серия
    const KODIK_SERIES_ITEMS = '.serial-series-box .dropdown-content .item, .serial-series .dropdown-content .item, .series-select .dropdown-content .item';

    const hasLocalEpisodeControls = () => {
        const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
        const items = document.querySelectorAll(KODIK_SERIES_ITEMS);
        return !!(sel || items.length > 0);
    };

    const isDleNavSite = () => {
        const checkHost = refHost || embedDomain || hostOf(embedRef);
        return isJutsu || (parentSite && parentSite.platform === 'dle') ||
            /yummyanime\.tv|animego\.online|yammyanime\.club|jut-su\.net/.test(checkHost);
    };

    const shouldUseLocalNav = () => {
        if (isDleNavSite()) return true;
        const checkHost = refHost || embedDomain || hostOf(embedRef);
        const isPageNavSite = /animego\.(me|org)|yummyani\.me/.test(checkHost);
        if (!isPageNavSite && hasLocalEpisodeControls()) return true;
        return false;
    };

    let lastSwitchTime = 0;

    /**
     * Переключает текущую серию в Kodik плеере (вперед/назад)
     * @param {'next'|'prev'} dir - Направление переключения
     * @param {boolean} [force=false] - Игнорировать защитный дебаунс по времени
     */
    const switchKodikEpisode = (dir, force = false) => {
        const debounceMs = (window.AG_CONSTANTS && window.AG_CONSTANTS.EPISODE_SWITCH_DEBOUNCE_MS) || 800;
        const now = Date.now();
        if (!force && (now - lastSwitchTime < debounceMs)) return false;
        lastSwitchTime = now;
        // С force переключает сам плеер в конце серии, без него зритель
        if (force) {
            viewerPickedEpisode = false;
            if (releaseHold) releaseHold();
            releaseHold = null;
            ownStartTries = 0;
            ownStartAt = 0;
        } else {
            onViewerPickedEpisode();
        }

        if (!isKodik) {
            const list = player.read('episodes');
            const target = list[list.findIndex(o => o.selected) + (dir === 'next' ? 1 : -1)];
            if (!target || !list.some(o => o.selected)) return false;
            player.choose('episodes', target.index);
            setTimeout(reportActiveEpisode, 200);
            return true;
        }

        // 1. Попробуем найти элементы кастомного выпадающего списка
        const items = Array.from(document.querySelectorAll(KODIK_SERIES_ITEMS));
        if (items.length > 0) {
            let activeIdx = items.findIndex(item => item.classList.contains('selected') || item.classList.contains('active') || item.classList.contains('current'));
            if (activeIdx === -1) {
                const curEp = getLocalEpisodeData().current;
                if (curEp) {
                    activeIdx = items.findIndex(item => (item.textContent || '').match(/\d+/)?.[0] === String(curEp));
                }
            }
            if (activeIdx !== -1) {
                let newIdx = activeIdx;
                if (dir === 'next' && activeIdx < items.length - 1) {
                    newIdx = activeIdx + 1;
                } else if (dir === 'prev' && activeIdx > 0) {
                    newIdx = activeIdx - 1;
                }
                if (newIdx !== activeIdx && items[newIdx]) {
                    const targetItem = items[newIdx];
                    const opts = { bubbles: true, cancelable: true, view: window };
                    targetItem.dispatchEvent(new MouseEvent('mousedown', opts));
                    targetItem.dispatchEvent(new MouseEvent('mouseup', opts));
                    targetItem.click();
                    setTimeout(() => {
                        reportActiveEpisode();
                    }, 200);
                    return true;
                }
            }
        }

        // 2. Если кастомных элементов нет или не сработало, используем стандартный select
        const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
        if (sel && sel.tagName === 'SELECT' && sel.options && sel.options.length > 0) {
            let curIdx = sel.selectedIndex;
            if (curIdx === -1) {
                const curEp = getLocalEpisodeData().current;
                if (curEp) {
                    curIdx = Array.from(sel.options).findIndex(opt => (opt.text || opt.value || '').match(/\d+/)?.[0] === String(curEp));
                }
            }
            let newIdx = curIdx;
            if (dir === 'next' && curIdx < sel.options.length - 1) {
                newIdx = curIdx + 1;
            } else if (dir === 'prev' && curIdx > 0) {
                newIdx = curIdx - 1;
            }
            if (newIdx !== curIdx && newIdx >= 0 && sel.options[newIdx]) {
                sel.selectedIndex = newIdx;
                sel.options[newIdx].selected = true;
                sel.dispatchEvent(new Event('input', { bubbles: true }));
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                setTimeout(() => {
                    reportActiveEpisode();
                }, 200);
                return true;
            }
        }

        // Список серий есть, значит мы на краю сезона: дальше переключать нечего.
        // Нативная кнопка Kodik здесь не годится: с последней серии она уводит в следующий сезон
        if (items.length > 0 || sel) return false;

        // 3. Fallback: только для плееров без списка серий — кнопки «Дальше >» / «< Назад»
        if (dir === 'next') {
            const nextBtn = document.querySelector('.serial-next, [class*="next-series"], [class*="next-episode"]') ||
                Array.from(document.querySelectorAll('button, a, div, span')).find(el => {
                    if (el.children.length > 2 || el.id === 'ag-n') return false;
                    const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                    return t === 'дальше' || t === 'дальше >' || t === 'следующая серия';
                });
            if (nextBtn) {
                const opts = { bubbles: true, cancelable: true, view: window };
                nextBtn.dispatchEvent(new MouseEvent('mousedown', opts));
                nextBtn.dispatchEvent(new MouseEvent('mouseup', opts));
                nextBtn.click();
                setTimeout(() => {
                    reportActiveEpisode();
                }, 200);
                return true;
            }
        } else if (dir === 'prev') {
            const prevBtn = document.querySelector('.serial-prev, [class*="prev-series"], [class*="prev-episode"]') ||
                Array.from(document.querySelectorAll('button, a, div, span')).find(el => {
                    if (el.children.length > 2 || el.id === 'ag-p') return false;
                    const t = (el.innerText || el.textContent || '').trim().toLowerCase();
                    return t === 'назад' || t === '< назад' || t === 'предыдущая серия';
                });
            if (prevBtn) {
                const opts = { bubbles: true, cancelable: true, view: window };
                prevBtn.dispatchEvent(new MouseEvent('mousedown', opts));
                prevBtn.dispatchEvent(new MouseEvent('mouseup', opts));
                prevBtn.click();
                setTimeout(() => {
                    reportActiveEpisode();
                }, 200);
                return true;
            }
        }
        return false;
    };

    const getLocalEpisodeData = () => {
        if (!isKodik) {
            const own = (playerShell && playerShell.current('episodes')) || player.read('episodes').find(o => o.selected);
            return { current: (own && own.label) || new URLSearchParams(window.location.search).get('episode') || '1', prev: '', next: '' };
        }

        const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
        if (sel && sel.tagName === 'SELECT' && sel.options && sel.options.length > 0) {
            const curIdx = sel.selectedIndex >= 0 ? sel.selectedIndex : Array.from(sel.options).findIndex(o => o.selected);
            const prevOpt = curIdx > 0 ? sel.options[curIdx - 1] : null;
            const nextOpt = curIdx >= 0 && curIdx < sel.options.length - 1 ? sel.options[curIdx + 1] : null;
            const curOpt = curIdx >= 0 ? sel.options[curIdx] : null;

            if (curOpt) {
                return {
                    current: (curOpt.text || curOpt.value).match(/\d+/)?.[0] || "1",
                    prev: prevOpt ? (prevOpt.text || prevOpt.value).match(/\d+/)?.[0] || "" : "",
                    next: nextOpt ? (nextOpt.text || nextOpt.value).match(/\d+/)?.[0] || "" : ""
                };
            }
        }

        const items = Array.from(document.querySelectorAll(KODIK_SERIES_ITEMS));
        if (items.length > 0) {
            let activeIdx = items.findIndex(item => item.classList.contains('selected') || item.classList.contains('active') || item.classList.contains('current'));
            if (activeIdx === -1) {
                const seriesTextEl = document.querySelector('.serial-series-box .text, .series-select .text, .serial-series .text');
                const epMatch = (seriesTextEl?.textContent || '').match(/\d+/);
                if (epMatch) {
                    activeIdx = items.findIndex(item => (item.textContent || '').match(/\d+/)?.[0] === epMatch[0]);
                }
            }
            if (activeIdx !== -1) {
                const curItem = items[activeIdx];
                const prevItem = items[activeIdx - 1];
                const nextItem = items[activeIdx + 1];

                return {
                    current: curItem ? (curItem.textContent || '').match(/\d+/)?.[0] || "1" : "1",
                    prev: prevItem ? (prevItem.textContent || '').match(/\d+/)?.[0] || "" : "",
                    next: nextItem ? (nextItem.textContent || '').match(/\d+/)?.[0] || "" : ""
                };
            }
        }

        // Fallback: Check any element in iframe DOM displaying "39 серия"
        const allNodes = document.querySelectorAll('button, div, span, a, p, select option:checked');
        for (const el of allNodes) {
            if (el.children.length > 3) continue;
            const txt = (el.innerText || el.textContent || '').trim();
            const epMatch = txt.match(/^(\d+)\s*сери[яи]/i) || txt.match(/\b(\d+)\s*сери[яи]/i);
            if (epMatch) {
                const num = parseInt(epMatch[1]);
                if (num > 0) {
                    return { current: num.toString(), prev: (num > 1 ? (num - 1).toString() : ""), next: (num + 1).toString() };
                }
            }
        }

        // Check side navigation arrows in iframe
        const nextArrow = document.querySelector('[class*="next"], .ag-next-ep');
        const prevArrow = document.querySelector('[class*="prev"], .ag-prev-ep');
        if (nextArrow) {
            const nMatch = nextArrow.textContent.match(/\d+/);
            if (nMatch && parseInt(nMatch[0]) > 1) {
                const ep = parseInt(nMatch[0]) - 1;
                return { current: ep.toString(), prev: (ep > 1 ? (ep - 1).toString() : ""), next: nMatch[0] };
            }
        }
        if (prevArrow) {
            const pMatch = prevArrow.textContent.match(/\d+/);
            if (pMatch && parseInt(pMatch[0]) >= 1) {
                const ep = parseInt(pMatch[0]) + 1;
                return { current: ep.toString(), prev: pMatch[0], next: (ep + 1).toString() };
            }
        }

        return { current: "1", prev: "", next: "" };
    };

    // Скрытая вкладка плеера открыта на своей серии: её номер подменил бы серию того плеера, который смотрят
    const reportActiveEpisode = () => {
        if (!isShown()) return;
        const data = getLocalEpisodeData();
        window.top.postMessage({ type: 'AG_EPISODE_CHANGED', episode: data.current }, '*');
    };

    // Плеер сообщил новые списки: серию могли сменить его собственные кнопки или автопереход
    document.addEventListener('ag-player-lists', reportActiveEpisode);

    // Свои клавиши Kodik перематывает сам: без перехвата нажатие срабатывало дважды, а стрелки уводили на 10-20 секунд.
    // Поэтому слушаем раньше плеера и не отдаём ему ни нажатие, ни отпускание, ни повтор при удержании
    const interceptedKeys = new Set();
    document.addEventListener('keydown', (e) => {
        // Поля ввода плеера (поиск серии) получают клавиши как обычно
        if (e.composedPath().some(n => n.tagName === 'INPUT')) return;

        const pressed = [];
        if (e.ctrlKey) pressed.push('ctrl');
        if (e.altKey) pressed.push('alt');
        if (e.shiftKey) pressed.push('shift');
        if (!['control', 'alt', 'shift', 'meta'].includes(e.key.toLowerCase())) {
            pressed.push(e.key.toLowerCase());
        }
        const combo = pressed.join('+');

        // Первым в кадре бывает пустой служебный элемент video: серия идёт в fp-engine
        const v = player.video() || document.querySelector('video');
        if (!v) return;

        if (Object.values(settings.keys).includes(combo)) {
            interceptedKeys.add(e.code);
            if (e.repeat) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        } else if (e.repeat) {
            return;
        }

        if (combo === settings.keys.fs) {
            e.preventDefault(); e.stopPropagation();
            window.top.postMessage({ type: 'AG_PSEUDO_FS', action: 'toggle' }, '*');
        }
        else if (combo === settings.keys.forward) {
            e.preventDefault(); e.stopPropagation();
            doRewind(5, v);
        }
        else if (combo === settings.keys.rewind) {
            e.preventDefault(); e.stopPropagation();
            doRewind(-5, v);
        }
        else if (combo === settings.keys.next) {
            e.preventDefault(); e.stopPropagation();
            if (shouldUseLocalNav()) { switchKodikEpisode('next'); }
            else window.top.postMessage({ type: 'AG_NAV', dir: 'next' }, '*');
        }
        else if (combo === settings.keys.prev) {
            e.preventDefault(); e.stopPropagation();
            if (shouldUseLocalNav()) { switchKodikEpisode('prev'); }
            else window.top.postMessage({ type: 'AG_NAV', dir: 'prev' }, '*');
        }
        else if (combo === settings.keys.skip) {
            e.preventDefault(); e.stopPropagation();
            if (currentSkipTarget) {
                markSongSkipped();
                v.currentTime = currentSkipTarget;
            } else {
                v.currentTime += 89;
            }
        }
        else if (e.key === 'Escape') {
            window.top.postMessage({ type: 'AG_PSEUDO_FS', action: 'disable' }, '*');
        }
    }, true);
    document.addEventListener('keyup', (e) => {
        if (!interceptedKeys.delete(e.code)) return;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    window.addEventListener('message', (e) => {
        if (!isParentSiteOrigin(e.origin)) return;

        if (e.data?.type === 'AG_SHELL_SITE' && playerShell) {
            playerShell.setSite(e.data.site);
            siteListsReady = true;
        }

        if (e.data?.type === 'AG_MARATHON_CONFIRM') {
            canAutoPlay = true;
            checkAndClickPlayButton();
        }
        if (e.data?.type === 'AG_FS_STATE') {
            document.body.dataset.agFsState = e.data.active;
        }

        if (e.data?.type === 'AG_DATA' && 'mediaSession' in navigator && navigator.mediaSession.metadata) {
            navigator.mediaSession.metadata.title = e.data.currentTitle || 'Anime+';
        }

        if (e.data?.type === 'AS_DATA_UPDATE') {
            // Метки другой серии: страница ошиблась номером. Не берём их и сообщаем настоящий
            if (e.data.episode != null && player.read('episodes').length > 1 && String(getLocalEpisodeData().current) !== String(e.data.episode)) {
                reportActiveEpisode();
                return;
            }
            if (audioSkip) {
                audioSkip.setTitle(e.data.malId, e.data.data);
            } else {
                skipData = e.data.data;
            }
        }

        if (e.data?.type === 'AG_SWITCH_KODIK_EPISODE') {
            switchKodikEpisode(e.data.dir, true);
        }

    });

    window.agOnSettingsChange((fresh) => {
        settings = fresh;
    });

    const syncFsState = () => {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        document.body.dataset.agFsState = isFS ? "true" : "false";
    };
    document.addEventListener('fullscreenchange', syncFsState);
    document.addEventListener('webkitfullscreenchange', syncFsState);

    const getKodikEpisode = () => {
        if (!isKodik) return getLocalEpisodeData().current;
        const sel = document.querySelector('.serial-series-box select, .serial-series, select[name="series"], .series-select, .serial-series select');
        if (sel) {
            if (sel.tagName === 'SELECT') {
                return sel.value || (sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text.match(/\d+/)?.[0] : "1");
            } else {
                const active = sel.querySelector('.active, .current');
                if (active) return active.textContent.match(/\d+/)?.[0] || "1";
            }
        }
        return "1";
    };
    window.top.postMessage({ type: 'AG_PLAYER_READY', episode: isShown() ? getKodikEpisode() : undefined }, '*');

    document.addEventListener('change', (e) => {
        if (e.target.matches('.serial-series-box select, .serial-series, select[name="series"], .series-select, .serial-series select')) {
            const ep = e.target.value || (e.target.options[e.target.selectedIndex] ? e.target.options[e.target.selectedIndex].text.match(/\d+/)?.[0] : "1");
            window.top.postMessage({ type: 'AG_PLAYER_READY', episode: isShown() ? ep : undefined }, '*');
        }
    });

    function sendFs(action) { window.top.postMessage({ type: 'AG_PSEUDO_FS', action: action }, '*'); }
    function doRewind(s, v) {
        rewindSum += s;
        clearTimeout(rewindTimer);
        rewindTimer = setTimeout(() => { v.currentTime += rewindSum; rewindSum = 0; if (v.paused) v.play(); }, 450);
    }
    // Плеер сам уводит с последней серии дальше, например в первый сезон. Переключаем только внутри списка
    const atLastOwnEpisode = () => {
        if (isKodik) return false;
        const list = player.read('episodes');
        return list.length > 0 && !!list[list.length - 1].selected;
    };
    const STOP_BEFORE_END_SEC = 1;
    // Метка Kodik без известных таймингов: примерная длина песни для запоминания возврата к ней
    const NATIVE_SKIP_RANGE_SEC = 120;

    let skipBtn = null;
    let skipUndoBtn = null;
    function createSkipButtons() {
        const style = document.createElement('style');
        style.textContent = `
            #ag-smart-skip, #ag-skip-undo {
                position: fixed; right: 24px; bottom: 76px; z-index: 2147483647; display: none; padding: 10px 18px;
                font-family: ${window.AG_FONT || 'sans-serif'}; font-size: 14px; font-weight: 600; border-radius: 7px;
                cursor: pointer; pointer-events: auto; user-select: none;
            }
            #ag-smart-skip { background: #fff; color: #111; }
            #ag-skip-undo { background: #101319; color: #fff; }
        `;
        document.head.appendChild(style);

        skipBtn = document.createElement('div');
        skipBtn.id = 'ag-smart-skip';
        document.body.appendChild(skipBtn);

        // Кнопка «Вернуться» после автопропуска: ошибка исправляется одним нажатием
        skipUndoBtn = document.createElement('div');
        skipUndoBtn.id = 'ag-skip-undo';
        skipUndoBtn.innerText = '↩ Вернуться';
        document.body.appendChild(skipUndoBtn);
    }

    function setupSmartSkip(v) {
        if (!skipBtn) createSkipButtons();
        const btn = skipBtn;
        const undoBtn = skipUndoBtn;
        let undoTimer = null;
        const showUndo = (part, startOfSong) => {
            undoBtn.style.display = 'block';
            undoBtn.onclick = (e) => {
                e.stopPropagation();
                skipMemory.keepWatching(part);
                undoBtn.style.display = 'none';
                v.currentTime = startOfSong;
            };
            clearTimeout(undoTimer);
            undoTimer = setTimeout(() => { undoBtn.style.display = 'none'; }, 6000);
        };
        v.addEventListener('loadstart', () => {
            skipMemory.reset();
            undoBtn.style.display = 'none';
        });

        let lastTimeUpdate = 0;
        v.addEventListener('timeupdate', () => {
            const now = Date.now();
            if (now - lastTimeUpdate < 500) return;
            lastTimeUpdate = now;

            // Элемент кнопки Kodik есть всегда, а настоящая метка только у активной: её обрабатывает блок авто-скипа ниже
            // В новом плеере родная кнопка скрыта: там всегда показываем свою
            if (!playerShell && document.querySelector('.fp-skip-button.active')) {
                btn.style.display = "none";
                currentSkipTarget = null;
                return;
            }

            const cur = v.currentTime;

            // Пропуск ставит плеер ровно на конец песни: эта точка уже не песня, иначе перемотка повторялась бы и мешала возврату
            const isOpTarget = skipData.op.end > 0 && cur >= skipData.op.start && cur < skipData.op.end - 1;
            const isEdTarget = skipData.ed.end > 0 && cur >= skipData.ed.start && cur < skipData.ed.end - 1;

            const part = isOpTarget ? 'op' : (isEdTarget ? 'ed' : null);
            // Зритель вернулся к песне сам: значит, хочет её посмотреть, и пропустить её можно только кнопкой
            const kept = !!part && skipMemory.isKept(part);
            let skipTarget = null;

            if (isOpTarget) {
                btn.innerText = "Пропустить опенинг";
                skipTarget = skipData.op.end;
            } else if (isEdTarget) {
                btn.innerText = "Пропустить эндинг";
                skipTarget = skipData.ed.end;
                // Прыжок в самый конец завершил бы серию, и плеер сам ушёл бы дальше
                if (v.duration && atLastOwnEpisode()) skipTarget = Math.min(skipTarget, v.duration - STOP_BEFORE_END_SEC);
            }

            currentSkipTarget = skipTarget;

            if (skipTarget) {
                const manualOnly = kept || skipData[part].manual || settings[part === 'op' ? 'autoSkipOp' : 'autoSkipEd'] === false;
                if (settings.autoSkip && !manualOnly) {
                    const startOfSong = skipData[part].start;
                    skipMemory.markSkipped(part, skipData[part]);
                    markSongSkipped();
                    v.currentTime = skipTarget;
                    btn.style.display = "none";
                    showUndo(part, startOfSong);
                }
                else { btn.style.display = "block"; btn.onclick = (e) => { e.stopPropagation(); markSongSkipped(); v.currentTime = skipTarget; }; }
            } else { btn.style.display = "none"; }
        });
    }

    // Медиаклавиши клавиатуры и наушников. Название серии приходит в ответ на AG_GET_DATA
    function setupMediaSession(v) {
        if (!('mediaSession' in navigator)) return;
        const nav = (dir) => {
            if (shouldUseLocalNav()) switchKodikEpisode(dir);
            else window.top.postMessage({ type: 'AG_NAV', dir }, '*');
        };
        try {
            navigator.mediaSession.metadata = new MediaMetadata({ title: 'Anime+', artist: 'Anime+' });
            const now = () => player.video() || v;
            navigator.mediaSession.setActionHandler('seekforward', () => { now().currentTime += 5; });
            navigator.mediaSession.setActionHandler('seekbackward', () => { now().currentTime -= 5; });
            navigator.mediaSession.setActionHandler('previoustrack', () => nav('prev'));
            navigator.mediaSession.setActionHandler('nexttrack', () => nav('next'));
        } catch (e) { console.warn("MediaSession not fully supported."); }
        window.top.postMessage({ type: 'AG_GET_DATA' }, '*');
    }

    // Серии переключаются внутри Kodik: страница сайта узнаёт номер только от нас
    function watchLocalEpisodes() {
        // Чужие плееры меняют серию без перезагрузки кадра и без событий: следим за самим списком
        if (!isKodik) {
            let last = null;
            setInterval(() => {
                const now = getLocalEpisodeData().current;
                if (now !== last) {
                    reportActiveEpisode();
                    ownStartTries = 0;
                }
                last = now;
            }, 1000);
            return;
        }
        if (!shouldUseLocalNav()) return;
        const checkInterval = setInterval(() => {
            const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
            const items = document.querySelectorAll(KODIK_SERIES_ITEMS);
            if ((sel && sel.options && sel.options.length > 0) || items.length > 0) {
                reportActiveEpisode();
                clearInterval(checkInterval);
            }
        }, 500);
        setTimeout(() => clearInterval(checkInterval), 10000);

        document.addEventListener('change', (e) => {
            if (e.target.matches('.serial-series-box select, .serial-series select, select[name="series"], .series-select')) {
                lastSwitchTime = Date.now();
                setTimeout(reportActiveEpisode, 100);
            }
        });

        document.addEventListener('click', (e) => {
            const target = e.target.closest(`${KODIK_SERIES_ITEMS}, .serial-next-button, .serial-next, [class*="next-series"], [class*="next-episode"]`);
            const isNextText = !target && (e.target.innerText || e.target.textContent || '').trim().toLowerCase().startsWith('дальше');
            if (target || isNextText) {
                lastSwitchTime = Date.now();
                setTimeout(reportActiveEpisode, 200);
            }
        });
    }

    let playerControlsReady = false;
    // Не отметка в разметке: плеер может подменить элемент его копией, и отметка скопируется, а обработчики нет
    const boundVideos = new WeakSet();

    const onPlayerChange = () => {
        checkAndClickPlayButton();

        const v = isKodik ? document.querySelector('video') : player.video();
        if (v && !boundVideos.has(v)) {
            boundVideos.add(v);
            if (player.onBind) player.onBind(v);
            // Событие перемотки не выходит из Shadow DOM и до общего обработчика не дойдёт
            if (player.deep) v.addEventListener('seeking', () => skipMemory.onSeek(v.currentTime));
            // У Kodik марафон начинается с нажатия на его кнопку запуска, у остальных с первого запуска серии
            if (!isKodik) {
                v.addEventListener('play', () => {
                    if (!settings.autoPlay) return;
                    window.top.postMessage({ type: 'AG_START_MARATHON' }, '*');
                    // Серия может смениться и без перезагрузки кадра: следующая запускается сама
                    canAutoPlay = true;
                }, { once: true });
            }
            if (!playerControlsReady) {
                playerControlsReady = true;
                setupSmartSkip(v);
                setupMediaSession(v);
                watchLocalEpisodes();
            } else if (!isKodik) {
                setupSmartSkip(v);
            }

            let isHandlingEnded = false;
            const handleEndedEvent = (e) => {
                if (e) {
                    try {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    } catch (err) {}
                }

                const now = Date.now();
                if (isHandlingEnded || (now - lastSwitchTime < 3000)) return;
                isHandlingEnded = true;
                lastSwitchTime = now;

                if (settings.autoNext) {
                    if (shouldUseLocalNav()) {
                        switchKodikEpisode('next', true);
                    } else {
                        window.top.postMessage({ type: 'AG_NAV', dir: 'next' }, '*');
                    }
                }

                setTimeout(() => {
                    isHandlingEnded = false;
                }, 3000);
            };

            // Захватываем событие ended на фазе погружения (capture = true),
            // предотвращая срабатывание дублирующих нативных обработчиков Kodik/Jut-Su
            v.addEventListener('ended', handleEndedEvent, true);
            v.onended = handleEndedEvent;

            // Если авто-переход выключен в настройках, блокируем нативные timeupdate редиректы сайта
            v.addEventListener('timeupdate', () => {
                if ((!settings.autoNext || (v.duration - v.currentTime <= 0.3 && atLastOwnEpisode())) && v.duration && (v.duration - v.currentTime <= 0.3) && !v.paused) {
                    try {
                        v.pause();
                        v.currentTime = Math.max(0, v.duration - 0.1);
                    } catch (err) {}
                }
            }, true);
        }

        // Кнопки пропуска других плееров ставятся по шаблону и песню не находят: их не нажимаем
        if (!isKodik) return;

        // --- ИСПРАВЛЕННЫЙ БЛОК AUTO-SKIP ---
        if (settings.autoSkip) {
            document.querySelectorAll('[class*="skip"]').forEach(btn => {
                const text = btn.textContent.toLowerCase();
                const isFpSkip = btn.classList.contains('fp-skip-button');

                const isVisible = isFpSkip ? btn.classList.contains('active') : (window.getComputedStyle(btn).display !== 'none');

                const video = document.querySelector('video');
                const curTime = video ? video.currentTime : 0;
                // Достаем время последнего клика (или -999, если еще не кликали)
                const lastSkipTime = parseFloat(btn.dataset.agSkipTime) || -999;

                // Если кнопка видима, текст подходит и с прошлого клика прошло больше 30 секунд
                const nativePart = video && video.duration && curTime >= video.duration / 2 ? 'ed' : 'op';
                const nativeSetting = nativePart === 'ed' ? 'autoSkipEd' : 'autoSkipOp';
                // После перемотки кнопка Kodik ещё мгновение активна и вернула бы зрителя к концу старой песни
                const nativeRange = skipData[nativePart];
                const outsideSong = nativeRange.end > 0 && (curTime < nativeRange.start - 1 || curTime >= nativeRange.end - 1);
                // Сразу после перемотки с опенинга в эндинг кнопка ещё ведёт к концу опенинга: это прыжок назад, а не пропуск
                const seekTo = parseFloat(btn.getAttribute('data-seek-to'));
                const staleTarget = seekTo <= curTime;
                // Метку уже признали неверной или её заменил звук: родная кнопка вела бы по старому времени
                const notNative = nativeRange.manual || /^(audio|shared)/.test(nativeRange.source || '');
                if (isVisible && !outsideSong && !staleTarget && !notNative && !skipMemory.isKept(nativePart) && settings[nativeSetting] !== false && (text.includes('пропустить') || text.includes('skip')) && Math.abs(curTime - lastSkipTime) > 30) {

                    // Записываем текущее время как время последнего скипа
                    btn.dataset.agSkipTime = curTime.toString();
                    skipMemory.markSkipped(nativePart, nativeRange.end > 0 ? nativeRange : { start: curTime, end: curTime + NATIVE_SKIP_RANGE_SEC });
                    markSongSkipped();

                    const seekTime = btn.getAttribute('data-seek-to');
                    if (seekTime && video) {
                        video.currentTime = parseFloat(seekTime);
                    } else {
                        const timeBeforeClick = video ? video.currentTime : null;
                        const opts = { bubbles: true, cancelable: true, view: window };
                        btn.dispatchEvent(new MouseEvent('mousedown', opts));
                        btn.dispatchEvent(new MouseEvent('mouseup', opts));
                        btn.click();

                        // Fallback: если клик был проигнорирован (isTrusted=false)
                        if (video && timeBeforeClick !== null) {
                            setTimeout(() => {
                                if (Math.abs(video.currentTime - timeBeforeClick) < 1) {
                                    const edEnd = skipData.ed.end;
                                    const opEnd = skipData.op.end;
                                    const cur = video.currentTime;

                                    if (edEnd > 0 && cur >= skipData.ed.start && cur <= skipData.ed.end) {
                                        video.currentTime = edEnd;
                                    } else if (opEnd > 0 && cur >= skipData.op.start && cur <= skipData.op.end) {
                                        video.currentTime = opEnd;
                                    }
                                }
                            }, 300);
                        }
                    }
                }
            });
        }
        // -----------------------------------

        if (settings.autoPlay) {
            const playBtn = document.querySelector('.play_button');
            if (playBtn && !playBtn.dataset.agAutoclicked) {
                if (canAutoPlay && !holdsAutoStart()) {
                    playBtn.dataset.agAutoclicked = '1';
                    setTimeout(() => { if (playBtn) playBtn.click(); }, 600);
                } else {
                    playBtn.addEventListener('click', () => {
                        window.top.postMessage({ type: 'AG_START_MARATHON' }, '*');
                    }, { once: true });
                }
            }
        }
    };
    new MutationObserver(onPlayerChange).observe(document.body, { childList: true, subtree: true });
    // Чужие плееры создают видео по-разному, в том числе в Shadow DOM, куда наблюдатель не заглядывает
    if (!isKodik) setInterval(onPlayerChange, 1000);

    // Отчёт о прогрессе видео для учёта серий (modules/progress-tracker.js на странице сайта).
    // Kodik создаёт <video> только после нажатия Play и пересоздаёт его при смене серии/озвучки,
    // поэтому следим за DOM постоянно, а не 15 секунд после загрузки.
    const trackedVideos = new WeakSet();
    const PROGRESS_THROTTLE_MS = 2000;
    const MIN_EPISODE_SEC = 60; // реклама короче и места остановки не запрашивает
    const RESUME_MAX_START_SEC = 5; // зритель уже сам ушёл дальше — не перематываем

    // Место остановки хранит страница сайта (modules/progress-tracker.js): серию и тайтл знает только она
    let resumeVideo = null;
    window.addEventListener('message', (e) => {
        if (e.data?.type !== 'AG_RESUME' || !isParentSiteOrigin(e.origin)) return;
        const v = resumeVideo;
        resumeVideo = null;
        if (!v || v.currentTime > RESUME_MAX_START_SEC) return;
        const time = Number(e.data.time);
        if (time > 0 && time < v.duration) v.currentTime = time;
    });

    // Браузер может не разрешить звук без нажатия в этом кадре: тогда видео идёт без звука, а звук вернётся при первом действии зрителя
    let soundWaiting = false;
    let soundVolume = 1;
    // Kodik глушит себя нулевой громкостью и запоминает её, поэтому одного снятия отметки «без звука» мало
    const isSilent = (v) => v.muted || v.volume === 0;
    const unmute = (v) => {
        v.muted = false;
        if (v.volume === 0) v.volume = soundVolume;
    };
    const muteUntilAction = (v) => {
        soundWaiting = true;
        v.muted = true;
        v.play().catch(() => {});
        // Нажатие по самому видео только возвращает звук: паузу зритель не просил. Кнопки и ползунок работают как обычно
        const keepPlaying = (e) => {
            if (e.composedPath().some(n => n.closest && n.closest('button, input, a, .slider, .panel'))) return;
            e.stopPropagation();
            e.preventDefault();
        };
        const restore = (e) => {
            soundWaiting = false;
            document.removeEventListener('pointerdown', restore, true);
            document.removeEventListener('keydown', restore, true);
            if (!settings.playerMuted) unmute(v);
            if (e.type === 'pointerdown') document.addEventListener('click', keepPlaying, { capture: true, once: true });
        };
        document.addEventListener('pointerdown', restore, true);
        document.addEventListener('keydown', restore, true);
    };
    // Плеер мог выключить звук сам, например запустившись без нажатия. Выключенным он остаётся, только если так решил зритель
    const SOUND_CHECK_MS = 400;
    const keepSound = (v) => {
        if (!isSilent(v) || soundWaiting || settings.playerMuted || v.paused || player.adState(v) !== 'none') return;
        soundWaiting = true;
        unmute(v);
        setTimeout(() => {
            soundWaiting = false;
            // Браузер останавливает видео, которому звук не разрешён
            if (v.paused) muteUntilAction(v);
        }, SOUND_CHECK_MS);
    };

    const attachProgressReporter = (v) => {
        if (trackedVideos.has(v)) return;
        trackedVideos.add(v);
        // Kodik обнуляет громкость и после старта, поэтому смотрим всё время, пока видео идёт
        v.addEventListener('timeupdate', () => keepSound(v));
        let lastSent = 0;
        // getLocalEpisodeData в худшем случае обходит весь DOM плеера — номер серии
        // пересчитываем не чаще раза в 10 с и при смене источника видео
        let episodeCache = null;
        let episodeCacheTs = 0;
        const getEpisodeCached = () => {
            if (!episodeCache || Date.now() - episodeCacheTs > 10000) {
                episodeCache = getLocalEpisodeData();
                episodeCacheTs = Date.now();
            }
            return episodeCache;
        };
        let resumeAsked = false;
        const askResume = () => {
            if (resumeAsked || !(v.duration >= MIN_EPISODE_SEC)) return;
            resumeAsked = true;
            // Плеер сменили: место известно точно, спрашивать страницу незачем
            if (pendingSeek !== null) {
                if (pendingSeek < v.duration) v.currentTime = pendingSeek;
                pendingSeek = null;
                return;
            }
            resumeVideo = v;
            window.top.postMessage({ type: 'AG_GET_RESUME', episode: getEpisodeCached().current }, '*');
        };
        v.addEventListener('loadstart', () => { episodeCache = null; resumeAsked = false; });
        v.addEventListener('loadedmetadata', askResume);
        v.addEventListener('durationchange', askResume);
        askResume();

        const report = (isEnded) => {
            const data = getEpisodeCached();
            window.top.postMessage({
                type: 'AG_VIDEO_PROGRESS',
                episode: data.current,
                currentTime: v.currentTime || 0,
                duration: Number.isFinite(v.duration) ? v.duration : 0,
                volume: v.volume,
                isEnded
            }, '*');
        };

        v.addEventListener('timeupdate', () => {
            const now = Date.now();
            if (now - lastSent < PROGRESS_THROTTLE_MS) return;
            lastSent = now;
            report(false);
        });
        v.addEventListener('ended', () => report(true));
    };

    // Реклама идёт в отдельном video: слушаем только саму серию
    const audioBound = new WeakSet();
    const bindAudioSkip = (v) => {
        if (!audioSkip || audioBound.has(v)) return;
        audioBound.add(v);
        const check = () => { if (v.duration > 300) audioSkip.bind(v); };
        v.addEventListener('loadedmetadata', check);
        v.addEventListener('durationchange', check);
        check();
    };

    const scanVideos = () => player.videos().forEach((v) => {
        attachProgressReporter(v);
        bindAudioSkip(v);
    });
    scanVideos();
    let videoScanTimer = null;
    new MutationObserver(() => {
        if (videoScanTimer) return;
        videoScanTimer = setTimeout(() => { videoScanTimer = null; scanVideos(); }, 500);
    }).observe(document.documentElement, { childList: true, subtree: true });
    if (!isKodik) setInterval(scanVideos, 1000);


    // Озвучка, выбранная пользователем: плеер перезагружается при смене озвучки, поэтому выбор хранится вне страницы
    const voiceChoice = globalThis.AgVoiceChoice;
    const titleVoiceKey = () => {
        // У других плееров заголовок кадра не содержит названия: их выбор хранит страница сайта
        const name = isKodik ? (document.title || '').trim() : '';
        return name ? `kodik:${name.toLowerCase()}` : '';
    };
    let chosenVoice = null;
    let rememberChoice = () => {};
    if (voiceChoice) {
        rememberChoice = (voice) => {
            chosenVoice = voiceChoice.voiceName(voice);
            isKodikVoiceDone = true;
            voiceChoice.set(titleVoiceKey(), voice);
            voiceChoice.tellPage(voice);
        };
        const VOICE_BOX = '.serial-translations-box, .serial-translations, .translation-select, [class*="translation"]';
        document.addEventListener('change', (e) => {
            if (!e.isTrusted || !e.target.matches || !e.target.matches('select') || !e.target.closest(VOICE_BOX)) return;
            const option = e.target.selectedOptions && e.target.selectedOptions[0];
            if (option) rememberChoice(option.textContent);
        }, true);
        document.addEventListener('click', (e) => {
            if (!e.isTrusted || !e.target.closest) return;
            const item = e.target.closest('.dropdown-content .item');
            if (item && item.closest(VOICE_BOX)) rememberChoice(item.textContent);
        }, true);
        chosenVoice = (await voiceChoice.get(titleVoiceKey())) || (await voiceChoice.askPage());
    }

    let isKodikVoiceDone = false;
    const findAndSelectPriorityVoiceKodik = () => {
        if (isKodikVoiceDone || !settings || !ownListsReady) return false;
        // Выбор пользователя действует даже при выключенном автовыборе: это его решение, а не автоматика
        if (!chosenVoice && settings.auto_select_voice === false) return false;
        const savedList = settings.voice_priority_list || (window.DEFAULT_SETTINGS ? window.DEFAULT_SETTINGS.voice_priority_list : ["Anilibria", "Studio Band"]);
        const priorityList = settings.auto_select_voice === false ? [] : savedList;
        if (!chosenVoice && (!priorityList || priorityList.length === 0)) return false;

        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '').trim();

        if (!isKodik) {
            const voices = player.read('voices');
            if (!voices.length) return false;
            const own = chosenVoice && voiceChoice ? voiceChoice.pick(voices, chosenVoice, o => o.title) : null;
            const match = (name) => voices.find((o) => {
                const a = clean(o.title);
                const b = clean(name);
                return a && b && (a.includes(b) || b.includes(a));
            });
            const hit = own || priorityList.map(match).find(Boolean);
            if (!hit) return false;
            isKodikVoiceDone = true;
            if (!hit.selected) player.choose('voices', hit.index);
            return true;
        }

        // 1. Check standard <select> elements (fastest, 0ms load)
        const voiceSelect = document.querySelector('.serial-translations-box select, .serial-translations select, select[name="translation"], select[name="voice"], [class*="translation"] select');
        if (voiceSelect && voiceSelect.options) {
            const options = Array.from(voiceSelect.options);
            if (chosenVoice && options.length > 0) {
                const own = voiceChoice.pick(options, chosenVoice, o => o.text || o.value);
                if (own) {
                    isKodikVoiceDone = true;
                    if (!own.selected) {
                        voiceSelect.selectedIndex = options.indexOf(own);
                        voiceSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        voiceSelect.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    return true;
                }
            }
            for (const priorityName of priorityList) {
                const prioClean = clean(priorityName);
                if (!prioClean) continue;

                for (let i = 0; i < options.length; i++) {
                    const optText = clean(options[i].text || options[i].value || '');
                    if (optText && (optText.includes(prioClean) || prioClean.includes(optText))) {
                        isKodikVoiceDone = true;
                        if (voiceSelect.selectedIndex !== i) {
                            voiceSelect.selectedIndex = i;
                            voiceSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            voiceSelect.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        return true;
                    }
                }
            }
        }

        // 2. Check custom Kodik dropdown items
        const dropdownItems = Array.from(document.querySelectorAll('.serial-translations-box .dropdown-content .item, .serial-translations .dropdown-content .item, .translation-select .dropdown-content .item, [class*="translation"] .dropdown-content .item'));

        if (dropdownItems.length > 0) {
            if (chosenVoice) {
                const own = voiceChoice.pick(dropdownItems, chosenVoice, el => el.innerText || el.textContent);
                if (own) {
                    isKodikVoiceDone = true;
                    if (!own.classList.contains('selected') && !own.classList.contains('active')) own.click();
                    return true;
                }
            }
            for (const priorityName of priorityList) {
                const prioClean = clean(priorityName);
                if (!prioClean) continue;

                for (const item of dropdownItems) {
                    const text = clean(item.innerText || item.textContent || '');
                    if (text && (text.includes(prioClean) || prioClean.includes(text))) {
                        isKodikVoiceDone = true;
                        if (!item.classList.contains('selected') && !item.classList.contains('active')) {
                            item.click();
                        }
                        return true;
                    }
                }
            }
        }

        return false;
    };

    findAndSelectPriorityVoiceKodik();

    let kodikCheckTimer = null;
    let lastKodikCheckTime = 0;

    const voiceObserver = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastKodikCheckTime < 300) return;
        lastKodikCheckTime = now;

        if (findAndSelectPriorityVoiceKodik()) {
            voiceObserver.disconnect();
            if (kodikCheckTimer) clearTimeout(kodikCheckTimer);
        }
    });
    if (document.documentElement) {
        voiceObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    kodikCheckTimer = setTimeout(() => {
        voiceObserver.disconnect();
    }, isKodik ? 4000 : 15000);

    // Плеер со всеми сезонами открывает то последний сезон и серию, то первый. Страница знает, какой сезон на ней открыт и где зритель остановился
    const START_WAIT_MS = 10000;
    const START_STEP_MS = 300;
    const STEP_SETTLE_MS = 3000;
    const settle = () => new Promise(r => setTimeout(r, STEP_SETTLE_MS));
    // Плеер ещё подключает видео: нажатие в этот момент откатывает его к первому сезону и даёт ошибку. Ждём, пока он постоит спокойно
    const STABLE_STEPS = 8;
    const STABLE_WAIT_MS = 30000;
    const waitStable = async () => {
        let calm = 0;
        for (let waited = 0; waited < STABLE_WAIT_MS; waited += START_STEP_MS) {
            // Плеер может рассказать о своих списках позже: узнав, что их нет, сразу перестаём ждать
            if (player.hasLists && !player.hasLists()) return false;
            calm = player.listsStable(player.video()) && player.read('episodes').length > 0 ? calm + 1 : 0;
            if (calm >= STABLE_STEPS) return true;
            await new Promise(r => setTimeout(r, START_STEP_MS));
        }
        return false;
    };
    const openWantedEpisode = async ({ season, last }) => {
        const watching = () => player.started(player.video());
        // Скрытая вкладка плеера на сайте подождёт, пока зритель её откроет
        while (!isShown()) await new Promise(r => setTimeout(r, START_STEP_MS));
        if (!await waitStable() || watching()) return;
        const wanted = player.read('seasons').find(o => o.label === String(season));
        if (wanted && !wanted.selected) {
            player.choose('seasons', wanted.index);
            await settle();
            if (watching()) return;
        }
        // Озвучки у сезонов разные, поэтому автовыбор идёт после сезона
        const voiceBefore = (player.read('voices').find(o => o.selected) || {}).title;
        ownListsReady = true;
        findAndSelectPriorityVoiceKodik();
        if ((player.read('voices').find(o => o.selected) || {}).title !== voiceBefore) await settle();
        // Плеер сменили: серию выберет передача места
        if (watching() || handoff) return;
        const list = player.read('episodes');
        const stopped = last ? list.findIndex(o => o.label === String(last.episode)) : -1;
        const target = stopped >= 0 ? list[last.finished ? Math.min(stopped + 1, list.length - 1) : stopped] : list[0];
        if (target && !target.selected) {
            player.choose('episodes', target.index);
            await settle();
        }
    };
    if (!isKodik) {
        let noAnswer = null;
        const onStart = (e) => {
            if (e.data?.type !== 'AG_START' || !isParentSiteOrigin(e.origin)) return;
            window.removeEventListener('message', onStart);
            clearTimeout(noAnswer);
            openWantedEpisode(e.data).catch(() => {}).finally(() => {
                ownListsReady = true;
                if (handoff) takeOver();
                checkAndClickPlayButton();
            });
        };
        window.addEventListener('message', onStart);
        window.top.postMessage({ type: 'AG_GET_START' }, '*');
        // Сайт может и не ответить: без него плеер остаётся как есть
        noAnswer = setTimeout(() => {
            window.removeEventListener('message', onStart);
            ownListsReady = true;
            if (handoff) takeOver();
        }, START_WAIT_MS);
    }

    const TAKEOVER_CHECK_MS = 1500;
    const TAKEOVER_NEAR_SEC = 15;
    const TAKEOVER_EXACT_SEC = 2;
    const TAKEOVER_RESTART_MS = 6000;
    const playOrMuted = (v) => v.play().catch((e) => {
        if (e.name !== 'NotAllowedError' || v.muted) return;
        muteUntilAction(v);
    });
    // Озвучка сменилась внутри плеера: кадр тот же, плеер перезагружает поток и может вернуться назад или встать.
    // Сначала даём ему подключить поток: нажатия и перемотка в этот момент его ломают
    const keepPlaceOnVoice = () => {
        const v = player.video();
        if (!v || !(v.duration >= MIN_EPISODE_SEC)) return;
        handoff = { episode: null, time: v.currentTime, play: true };
        takeoverUntil = Date.now() + TAKEOVER_WAIT_MS;
        setTimeout(() => { if (handoff) takeOver(); }, STEP_SETTLE_MS);
    };
    // Новый плеер после смены: та же серия, то же место, запуск, если видео шло
    const takeOver = async () => {
        const { episode, time, play } = handoff;
        handoff = null;
        window.focus();
        const list = player.read('episodes');
        const target = episode === null ? null : list.find(o => o.label === String(episode));
        if (target && !target.selected) {
            player.choose('episodes', target.index);
            await settle();
        }
        pendingSeek = time;
        // Плеер уже открывали раньше: его видео стоит на старом месте, и догонять надо сразу, даже если разница небольшая
        const opened = player.video();
        if (opened && opened.duration >= MIN_EPISODE_SEC && Math.abs(opened.currentTime - time) > TAKEOVER_EXACT_SEC) {
            opened.currentTime = time;
            pendingSeek = null;
        }
        // Плееры запускаются по-разному и могут сбросить время при старте, поэтому проверяем результат, а не надеемся на одну попытку
        const deadline = Date.now() + TAKEOVER_WAIT_MS;
        let startedAt = 0;
        let volumeSet = false;
        const check = setInterval(() => {
            const v = player.video();
            const finish = () => {
                clearInterval(check);
                takeoverUntil = 0;
            };
            if (Date.now() > deadline) return finish();
            // Повторное нажатие на кнопку запуска поставило бы только что запущенное на паузу: даём плееру время
            const startOnce = () => {
                if (Date.now() - startedAt < TAKEOVER_RESTART_MS) return;
                startedAt = Date.now();
                player.start(v);
            };
            // У Kodik видео появляется только после запуска
            if (!v) {
                if (play) startOnce();
                return undefined;
            }
            if (player.adState(v) !== 'none') return undefined;
            // Громкость зрителя переходит с ним в новый плеер
            if (!settings.playerMuted && !volumeSet) {
                volumeSet = true;
                if (v.volume > 0) v.volume = soundVolume;
            }
            // Плеер ещё подключает видео: нажатие сейчас пропадёт
            if (!player.listsStable(v)) return undefined;
            // Вперёд видео уходит само, пока идёт, а отставать ему не от чего: плеер просто начал сначала
            const near = v.currentTime > time - TAKEOVER_EXACT_SEC && v.currentTime - time < TAKEOVER_NEAR_SEC;
            if (!near && v.duration >= MIN_EPISODE_SEC && !v.seeking) {
                v.currentTime = time;
                pendingSeek = null;
            }
            if (!play) return near ? finish() : undefined;
            if (!v.paused) return near && v.readyState >= 3 ? finish() : undefined;
            if (player.started(v)) playOrMuted(v);
            else startOnce();
            return undefined;
        }, TAKEOVER_CHECK_MS);
    };
    window.addEventListener('message', (e) => {
        if (!isParentSiteOrigin(e.origin)) return;
        if (e.data?.type === 'AG_PAUSE') {
            const v = player.video();
            if (v && !v.paused) v.pause();
        }
        if (e.data?.type === 'AG_HANDOFF') {
            handoff = { episode: e.data.episode, time: Number(e.data.time) || 0, play: !!e.data.play };
            if (e.data.volume > 0) soundVolume = e.data.volume;
            if (handoff.play) takeoverUntil = Date.now() + TAKEOVER_WAIT_MS;
            if (ownListsReady) takeOver();
        }
    });
    // Только кадр с самим плеером: у Kodik есть и служебный невидимый кадр на том же домене. Плеер появляется не сразу
    const HANDOFF_ASK_MS = 500;
    const HANDOFF_ASK_TRIES = 40;
    let handoffAsk = null;
    // Страница подбирает метки под плеер, озвучку и серию
    let playerNowKey = '';
    const PLAYER_NOW_MS = 2000;
    const reportPlayerNow = () => {
        if (!isShown() || (!player.video() && !document.querySelector('.play_button, .play_background'))) return;
        const voice = (playerShell && playerShell.current('voices') || {}).title || '';
        const season = (player.read('seasons').find(o => o.selected) || {}).label || '';
        const v = player.video();
        const duration = v && v.duration >= MIN_EPISODE_SEC ? Math.round(v.duration) : 0;
        const key = isKodik ? player.id : `${player.id}|${voice}|${season}|${getLocalEpisodeData().current}|${duration}`;
        if (key === playerNowKey) return;
        playerNowKey = key;
        window.top.postMessage({ type: 'AG_PLAYER_NOW', player: player.id, voice, season, duration }, '*');
    };
    setInterval(reportPlayerNow, PLAYER_NOW_MS);
    const askHandoff = () => {
        clearInterval(handoffAsk);
        let tries = 0;
        const ask = () => {
            if (!isShown() || ++tries > HANDOFF_ASK_TRIES) return clearInterval(handoffAsk);
            if (!player.video() && !document.querySelector('.play_button, .play_background')) return undefined;
            clearInterval(handoffAsk);
            window.top.postMessage({ type: 'AG_GET_HANDOFF', visible: true }, '*');
            return undefined;
        };
        handoffAsk = setInterval(ask, HANDOFF_ASK_MS);
        ask();
    };
    askHandoff();

    // Сайт заполняет свои списки позже, чем запускается плеер, поэтому спрашиваем несколько раз, пока не ответит со списками
    const askSiteLists = () => {
        if (!playerShell || siteListsReady) return;
        let tries = 0;
        const ask = setInterval(() => {
            if (siteListsReady || ++tries > 15) return clearInterval(ask);
            window.top.postMessage({ type: 'AG_SHELL_GET' }, '*');
        }, 1000);
        window.top.postMessage({ type: 'AG_SHELL_GET' }, '*');
    };
    // Новая оболочка плеера. Откатывается на обычный Kodik при сбое и удалённо, если обновление Kodik её сломает
    const startPlayerShell = async () => {
        const releaseBoot = () => { if (globalThis.AgPlayerBoot) globalThis.AgPlayerBoot.release(); };
        if (playerShell) return;
        if (!globalThis.AgPlayerShell) return releaseBoot();
        const config = await chrome.runtime.sendMessage({ action: 'get_remote_config' }).catch(() => null);
        if (config && config.kodikShell === false) return releaseBoot();
        playerShell = globalThis.AgPlayerShell.create({
            getSettings: () => settings,
            expectsAutoStart: () => canAutoPlay && settings.autoPlay !== false && !holdsAutoStart(),
            onOwnEpisodePick: onViewerPickedEpisode,
            patchSettings: async (patch) => {
                settings = await window.agPatchSettings(patch);
                return settings;
            },
            getTimings: () => skipData,
            toggleFs: () => sendFs('toggle'),
            openSettings: () => chrome.runtime.sendMessage({ action: 'open_settings' }).catch(() => {}),
            onVoicePicked: (voice) => rememberChoice(voice),
            takingOver: () => Date.now() < takeoverUntil,
            onOwnVoiceChange: keepPlaceOnVoice,
            isShown,
            guide: globalThis.AgGuide && globalThis.AgGuideFox ? {
                mark: globalThis.AgGuide.mark,
                fox: globalThis.AgGuideFox.svg,
                tipsSeen: async () => (await globalThis.AgGuide.read()).tipsDone,
                tipsDone: () => globalThis.AgGuide.patch({ tipsDone: true, switchTipDone: true }).catch(() => {}),
                switchTipSeen: async () => (await globalThis.AgGuide.read()).switchTipDone,
                demo: globalThis.AgGuide.switchDemo
            } : null,
            sitePick: (kind, index) => window.top.postMessage({ type: 'AG_SHELL_PICK', kind, index }, '*'),
            refreshSite: () => window.top.postMessage({ type: 'AG_SHELL_GET' }, '*'),
            reloadPage: () => window.top.postMessage({ type: 'AG_RELOAD_PAGE' }, '*'),
            nav: (dir) => {
                if (shouldUseLocalNav()) {
                    switchKodikEpisode(dir);
                } else {
                    window.top.postMessage({ type: 'AG_NAV', dir }, '*');
                }
            }
        });
    };
    startPlayerShell().then(askSiteLists);
    // Кадр скрытой вкладки плеера стал видимым: зритель сменил плеер на сайте, и список плееров в этом кадре устарел
    let wasHidden = !window.innerWidth;
    const onShown = () => {
        playerNowKey = '';
        reportActiveEpisode();
        window.top.postMessage({ type: 'AG_SHELL_GET' }, '*');
        askHandoff();
    };
    window.addEventListener('resize', () => {
        if (wasHidden && window.innerWidth) onShown();
        wasHidden = !window.innerWidth;
    });
    window.addEventListener('message', (e) => {
        if (e.data?.type !== 'AG_FRAME_SHOWN' || !isParentSiteOrigin(e.origin)) return;
        const returned = hiddenByPage && e.data.shown;
        hiddenByPage = !e.data.shown;
        if (returned) onShown();
    });
    // Плеер потерял одноразовую ссылку. Скрытая вкладка страницу не перезагружает: её зритель не смотрит
    if (player.gone) {
        const checkGone = setInterval(() => {
            if (!isShown() || !player.gone()) return;
            clearInterval(checkGone);
            window.top.postMessage({ type: 'AG_RELOAD_PAGE' }, '*');
        }, 2000);
    }
})();