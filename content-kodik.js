(async function () {
    'use strict';

    let settings = await window.getSettings();
    if (settings.global_enabled === false) return;

    // Защита: запускаем только внутри iframe и только на страницах поддерживаемых сайтов
    // (список сайтов — modules/shared/sites.js; позволяет безопасно использовать широкие разрешения манифеста)
    if (window === window.top) return;

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
            || /kodik|anivod|aniboom|dbcode|kombik|tube-storage|aniqizm/.test(refHost);

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
            const sel = document.querySelector('.serial-translations-box select, .serial-translations select, select[name="translation"]');
            return sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.split(' (')[0].trim() : '';
        },
        getEpisode: () => {
            const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"]');
            return (sel && sel.value) || new URLSearchParams(window.location.search).get('episode') || '';
        },
        onTimings: (timings) => {
            skipData = timings;
        }
    }) : null;

    if (audioSkip) {
        const script = [...document.scripts].find(s => !s.src && s.textContent.includes('parseSkipButton('));
        if (script) audioSkip.setNative(globalThis.AgAudioSkip.parseNativeMarks(script.textContent));
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

    const checkAndClickPlayButton = () => {
        if (!settings.autoPlay || !canAutoPlay) return false;
        
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

    const reportActiveEpisode = () => {
        const data = getLocalEpisodeData();
        window.top.postMessage({ type: 'AG_EPISODE_CHANGED', episode: data.current }, '*');
    };

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
        const v = document.querySelector('video.fp-engine') || document.querySelector('video');
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
            if (e.data.site.episodes.length || e.data.site.voices.length) siteListsReady = true;
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
    window.top.postMessage({ type: 'AG_PLAYER_READY', episode: getKodikEpisode() }, '*');

    document.addEventListener('change', (e) => {
        if (e.target.matches('.serial-series-box select, .serial-series, select[name="series"], .series-select, .serial-series select')) {
            const ep = e.target.value || (e.target.options[e.target.selectedIndex] ? e.target.options[e.target.selectedIndex].text.match(/\d+/)?.[0] : "1");
            window.top.postMessage({ type: 'AG_PLAYER_READY', episode: ep }, '*');
        }
    });

    function sendFs(action) { window.top.postMessage({ type: 'AG_PSEUDO_FS', action: action }, '*'); }
    function doRewind(s, v) {
        rewindSum += s;
        clearTimeout(rewindTimer);
        rewindTimer = setTimeout(() => { v.currentTime += rewindSum; rewindSum = 0; if (v.paused) v.play(); }, 450);
    }
    // Метка Kodik без известных таймингов: примерная длина песни для запоминания возврата к ней
    const NATIVE_SKIP_RANGE_SEC = 120;

    function setupSmartSkip(v) {
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

        const btn = document.createElement('div');
        btn.id = 'ag-smart-skip';
        document.body.appendChild(btn);

        // Кнопка «Вернуться» после автопропуска: ошибка исправляется одним нажатием
        const undoBtn = document.createElement('div');
        undoBtn.id = 'ag-skip-undo';
        undoBtn.innerText = '↩ Вернуться';
        document.body.appendChild(undoBtn);
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
            navigator.mediaSession.setActionHandler('seekforward', () => { v.currentTime += 5; });
            navigator.mediaSession.setActionHandler('seekbackward', () => { v.currentTime -= 5; });
            navigator.mediaSession.setActionHandler('previoustrack', () => nav('prev'));
            navigator.mediaSession.setActionHandler('nexttrack', () => nav('next'));
        } catch (e) { console.warn("MediaSession not fully supported."); }
        window.top.postMessage({ type: 'AG_GET_DATA' }, '*');
    }

    // Серии переключаются внутри Kodik: страница сайта узнаёт номер только от нас
    function watchLocalEpisodes() {
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

    const iframeObserver = new MutationObserver(() => {
        checkAndClickPlayButton();

        const v = document.querySelector('video');
        if (v && !v.dataset.agInit) {
            v.dataset.agInit = '1';
            if (!playerControlsReady) {
                playerControlsReady = true;
                setupSmartSkip(v);
                setupMediaSession(v);
                watchLocalEpisodes();
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
                if (!settings.autoNext && v.duration && (v.duration - v.currentTime <= 0.3) && !v.paused) {
                    try {
                        v.pause();
                        v.currentTime = Math.max(0, v.duration - 0.1);
                    } catch (err) {}
                }
            }, true);
        }

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
                if (isVisible && !outsideSong && !skipMemory.isKept(nativePart) && settings[nativeSetting] !== false && (text.includes('пропустить') || text.includes('skip')) && Math.abs(curTime - lastSkipTime) > 30) {

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
                if (canAutoPlay) {
                    playBtn.dataset.agAutoclicked = '1';
                    setTimeout(() => { if (playBtn) playBtn.click(); }, 600);
                } else {
                    playBtn.addEventListener('click', () => {
                        window.top.postMessage({ type: 'AG_START_MARATHON' }, '*');
                    }, { once: true });
                }
            }
        }
    });
    iframeObserver.observe(document.body, { childList: true, subtree: true });

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

    const attachProgressReporter = (v) => {
        if (trackedVideos.has(v)) return;
        trackedVideos.add(v);
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
    const bindAudioSkip = (v) => {
        if (!audioSkip || v.dataset.agAudioBound) return;
        v.dataset.agAudioBound = '1';
        const check = () => { if (v.duration > 300) audioSkip.bind(v); };
        v.addEventListener('loadedmetadata', check);
        v.addEventListener('durationchange', check);
        check();
    };

    const scanVideos = () => document.querySelectorAll('video').forEach((v) => {
        attachProgressReporter(v);
        bindAudioSkip(v);
    });
    scanVideos();
    let videoScanTimer = null;
    new MutationObserver(() => {
        if (videoScanTimer) return;
        videoScanTimer = setTimeout(() => { videoScanTimer = null; scanVideos(); }, 500);
    }).observe(document.documentElement, { childList: true, subtree: true });


    // Озвучка, выбранная пользователем: плеер перезагружается при смене озвучки, поэтому выбор хранится вне страницы
    const voiceChoice = globalThis.AgVoiceChoice;
    const titleVoiceKey = () => {
        const name = (document.title || '').trim();
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
        if (isKodikVoiceDone || !settings) return false;
        // Выбор пользователя действует даже при выключенном автовыборе: это его решение, а не автоматика
        if (!chosenVoice && settings.auto_select_voice === false) return false;
        const savedList = settings.voice_priority_list || (window.DEFAULT_SETTINGS ? window.DEFAULT_SETTINGS.voice_priority_list : ["Anilibria", "Studio Band"]);
        const priorityList = settings.auto_select_voice === false ? [] : savedList;
        if (!chosenVoice && (!priorityList || priorityList.length === 0)) return false;

        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '').trim();

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
    }, 4000);

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
        const releaseBoot = () => { if (globalThis.AgKodikShellBoot) globalThis.AgKodikShellBoot.release(); };
        if (playerShell) return;
        if (!globalThis.AgKodikShell) return releaseBoot();
        const config = await chrome.runtime.sendMessage({ action: 'get_remote_config' }).catch(() => null);
        if (config && config.kodikShell === false) return releaseBoot();
        playerShell = globalThis.AgKodikShell.create({
            getSettings: () => settings,
            expectsAutoStart: () => canAutoPlay && settings.autoPlay !== false,
            patchSettings: async (patch) => {
                settings = await window.agPatchSettings(patch);
                return settings;
            },
            getTimings: () => skipData,
            toggleFs: () => sendFs('toggle'),
            openSettings: () => chrome.runtime.sendMessage({ action: 'open_settings' }).catch(() => {}),
            onVoicePicked: (voice) => rememberChoice(voice),
            guide: globalThis.AgGuide && globalThis.AgGuideFox ? {
                mark: globalThis.AgGuide.mark,
                fox: globalThis.AgGuideFox.svg,
                tipsSeen: async () => (await globalThis.AgGuide.read()).tipsDone,
                tipsDone: () => globalThis.AgGuide.patch({ tipsDone: true }).catch(() => {})
            } : null,
            sitePick: (kind, index) => window.top.postMessage({ type: 'AG_SHELL_PICK', kind, index }, '*'),
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
})();