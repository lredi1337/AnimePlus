(async function () {
    'use strict';

    let settings = await window.getSettings();
    if (settings.global_enabled === false) return;

    // Защита: запускаем только внутри iframe и только на страницах поддерживаемых сайтов
    // (список сайтов — modules/shared/sites.js; позволяет безопасно использовать широкие разрешения манифеста)
    if (window === window.top) return;

    // Плеер определяем по адресу кадра: всё, что зависит от него, находится в адаптере.
    // Адреса переехавших сайтов, добавленные зрителем, нужны раньше: по ним отличаются кадры сайта от плеера
    if (globalThis.AgSites && globalThis.AgSites.ready) await globalThis.AgSites.ready;
    const player = globalThis.AgPlayerAdapters.current();
    if (!player) return;
    const isKodik = player.id === 'kodik';

    // Кадр должен встроить сайт из списка: иначе оболочка не запускается (modules/player/frame/link.js)
    const link = globalThis.AgFrameLink.connect();
    if (!link) return;
    const { toTop, isParentSiteOrigin } = link;

    toTop({ type: 'AG_GET_DATA' });

    // ==========================================
    // --- ЛОГИКА ВНУТРИ ПЛЕЕРА (IFRAME) ---
    // ==========================================
    let rewindSum = 0, rewindTimer = null;
    // Место, с которого продолжить в видео, которое ещё не появилось (смена плеера)
    let pendingSeek = null;
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

    // Серии: какая открыта, переключение и сообщения странице сайта (modules/player/frame/episodes.js)
    const episodes = globalThis.AgFrameEpisodes.create({
        player, isKodik, link, isShown,
        getShell: () => playerShell,
        // Переключает сам плеер в конце серии: следующая запускается сама. Иначе серию выбрал зритель
        onSwitch: (force) => {
            if (!force) return onViewerPickedEpisode();
            viewerPickedEpisode = false;
            if (releaseHold) releaseHold();
            releaseHold = null;
            ownStartTries = 0;
            ownStartAt = 0;
        }
    });
    const getLocalEpisodeData = episodes.current;
    const reportActiveEpisode = episodes.report;
    const switchKodikEpisode = episodes.switchEpisode;
    const isDleNavSite = episodes.isDleNavSite;
    const shouldUseLocalNav = episodes.shouldUseLocalNav;

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
            toTop({ type: 'AG_PSEUDO_FS', action: 'toggle' });
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
            else toTop({ type: 'AG_NAV', dir: 'next' });
        }
        else if (combo === settings.keys.prev) {
            e.preventDefault(); e.stopPropagation();
            if (shouldUseLocalNav()) { switchKodikEpisode('prev'); }
            else toTop({ type: 'AG_NAV', dir: 'prev' });
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
            toTop({ type: 'AG_PSEUDO_FS', action: 'disable' });
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
        // Досмотрена последняя серия тайтла (features/player-bridge.js)
        if (e.data?.type === 'AG_FINALE' && playerShell && playerShell.showFinale) {
            playerShell.showFinale({ canRate: !!e.data.canRate, sequel: e.data.sequel || null }, {
                rate: (score) => toTop({ type: 'AG_FINALE_RATE', score }),
                next: () => toTop({ type: 'AG_FINALE_NEXT' })
            });
        }
        if (e.data?.type === 'AG_FINALE_RATED' && playerShell && playerShell.finaleRated) {
            playerShell.finaleRated(!!e.data.ok, Number(e.data.score));
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
    toTop({ type: 'AG_PLAYER_READY', episode: isShown() ? getKodikEpisode() : undefined });

    document.addEventListener('change', (e) => {
        if (e.target.matches('.serial-series-box select, .serial-series, select[name="series"], .series-select, .serial-series select')) {
            const ep = e.target.value || (e.target.options[e.target.selectedIndex] ? e.target.options[e.target.selectedIndex].text.match(/\d+/)?.[0] : "1");
            toTop({ type: 'AG_PLAYER_READY', episode: isShown() ? ep : undefined });
        }
    });

    function sendFs(action) { toTop({ type: 'AG_PSEUDO_FS', action: action }); }
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

    // Кнопки «Пропустить» и «Вернуться» живут только в оболочке плеера и выглядят по её теме.
    // Без оболочки их нет: пропуск работает сам и клавишей, у Kodik остаётся родная кнопка. Пустышки не попадают на страницу
    const offPage = { skip: document.createElement('button'), undo: document.createElement('button') };
    const skipUi = () => (playerShell && playerShell.skipButtons && playerShell.skipButtons()) || offPage;

    function setupSmartSkip(v) {
        // Оболочка может появиться позже видео: кнопки берутся при каждом обращении
        let undoTimer = null;
        const showUndo = (part, startOfSong) => {
            skipUi().undo.style.display = 'block';
            skipUi().undo.onclick = (e) => {
                e.stopPropagation();
                skipMemory.keepWatching(part);
                skipUi().undo.style.display = 'none';
                v.currentTime = startOfSong;
            };
            clearTimeout(undoTimer);
            undoTimer = setTimeout(() => { skipUi().undo.style.display = 'none'; }, 6000);
        };
        v.addEventListener('loadstart', () => {
            skipMemory.reset();
            skipUi().undo.style.display = 'none';
        });

        let lastTimeUpdate = 0;
        v.addEventListener('timeupdate', () => {
            const now = Date.now();
            if (now - lastTimeUpdate < 500) return;
            lastTimeUpdate = now;

            // Элемент кнопки Kodik есть всегда, а настоящая метка только у активной: её обрабатывает блок авто-скипа ниже
            // В новом плеере родная кнопка скрыта: там всегда показываем свою
            if (!playerShell && document.querySelector('.fp-skip-button.active')) {
                skipUi().skip.style.display = "none";
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
                skipUi().skip.textContent = "Пропустить опенинг";
                skipTarget = skipData.op.end;
            } else if (isEdTarget) {
                skipUi().skip.textContent = "Пропустить эндинг";
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
                    skipUi().skip.style.display = "none";
                    showUndo(part, startOfSong);
                }
                else {
                    // Зритель снова в песне: «Вернуться» уже не нужна и не должна закрывать «Пропустить» на том же месте
                    clearTimeout(undoTimer);
                    skipUi().undo.style.display = 'none';
                    skipUi().skip.style.display = "block";
                    skipUi().skip.onclick = (e) => { e.stopPropagation(); markSongSkipped(); v.currentTime = skipTarget; };
                }
            } else { skipUi().skip.style.display = "none"; }
        });
    }

    // Медиаклавиши клавиатуры и наушников. Название серии приходит в ответ на AG_GET_DATA
    function setupMediaSession(v) {
        if (!('mediaSession' in navigator)) return;
        const nav = (dir) => {
            if (shouldUseLocalNav()) switchKodikEpisode(dir);
            else toTop({ type: 'AG_NAV', dir });
        };
        try {
            navigator.mediaSession.metadata = new MediaMetadata({ title: 'Anime+', artist: 'Anime+' });
            const now = () => player.video() || v;
            navigator.mediaSession.setActionHandler('seekforward', () => { now().currentTime += 5; });
            navigator.mediaSession.setActionHandler('seekbackward', () => { now().currentTime -= 5; });
            navigator.mediaSession.setActionHandler('previoustrack', () => nav('prev'));
            navigator.mediaSession.setActionHandler('nexttrack', () => nav('next'));
        } catch (e) { console.warn("MediaSession not fully supported."); }
        toTop({ type: 'AG_GET_DATA' });
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
                    toTop({ type: 'AG_START_MARATHON' });
                    // Серия может смениться и без перезагрузки кадра: следующая запускается сама
                    canAutoPlay = true;
                }, { once: true });
            }
            if (!playerControlsReady) {
                playerControlsReady = true;
                setupSmartSkip(v);
                setupMediaSession(v);
                episodes.watch(() => { ownStartTries = 0; });
            } else if (!isKodik) {
                setupSmartSkip(v);
            }

            // Серия дошла до конца. Событие ended до других обработчиков не доходит (его гасит handleEndedEvent),
            // а на последней серии видео останавливается за мгновение до конца, поэтому страница узнаёт о конце отсюда
            let endReportedAt = 0;
            const reportEpisodeEnd = () => {
                if (!(v.duration >= globalThis.AgFrameProgress.MIN_EPISODE_SEC) || Date.now() - endReportedAt < 5000) return;
                endReportedAt = Date.now();
                toTop({ type: 'AG_EPISODE_END', episode: getLocalEpisodeData().current, duration: v.duration });
            };

            let isHandlingEnded = false;
            const handleEndedEvent = (e) => {
                if (e) {
                    try {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    } catch (err) {}
                }

                if (isHandlingEnded || episodes.sinceSwitch() < 3000) return;
                isHandlingEnded = true;
                reportEpisodeEnd();
                episodes.markSwitched();

                if (settings.autoNext) {
                    if (shouldUseLocalNav()) {
                        switchKodikEpisode('next', true);
                    } else {
                        toTop({ type: 'AG_NAV', dir: 'next' });
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
                    reportEpisodeEnd();
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
                const notNative = nativeRange.manual || /^audio/.test(nativeRange.source || '');
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
                        toTop({ type: 'AG_START_MARATHON' });
                    }, { once: true });
                }
            }
        }
    };
    new MutationObserver(onPlayerChange).observe(document.body, { childList: true, subtree: true });
    // Чужие плееры создают видео по-разному, в том числе в Shadow DOM, куда наблюдатель не заглядывает
    if (!isKodik) setInterval(onPlayerChange, 1000);

    // Звук, ход просмотра и место остановки (modules/player/frame/sound.js, progress.js)
    const sound = globalThis.AgFrameSound.create({ getSettings: () => settings, adState: (v) => player.adState(v) });
    const MIN_EPISODE_SEC = globalThis.AgFrameProgress.MIN_EPISODE_SEC;
    globalThis.AgFrameProgress.start({
        player, isKodik, link, sound, audioSkip,
        getEpisode: () => getLocalEpisodeData(),
        takePendingSeek: () => {
            const seek = pendingSeek;
            pendingSeek = null;
            return seek;
        }
    });

    // Озвучка: выбор зрителя для тайтла, иначе по приоритетам (modules/player/frame/voice.js)
    const voice = await globalThis.AgFrameVoice.start({ getSettings: () => settings, isKodik, player, listsReady: () => ownListsReady });

    // Смена плеера или озвучки: та же серия, то же место (modules/player/frame/takeover.js)
    const takeover = globalThis.AgFrameTakeover.create({
        player, link, sound, getSettings: () => settings, listsReady: () => ownListsReady, minEpisodeSec: MIN_EPISODE_SEC,
        setPendingSeek: (time) => { pendingSeek = time; }
    });

    // Плеер со всеми сезонами открывает то последний сезон и серию, то первый. Страница знает, какой сезон на ней открыт и где зритель остановился
    const START_WAIT_MS = 10000;
    const START_STEP_MS = 300;
    const settle = () => new Promise(r => setTimeout(r, globalThis.AgFrameTakeover.SETTLE_MS));
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
        voice.select();
        if ((player.read('voices').find(o => o.selected) || {}).title !== voiceBefore) await settle();
        // Плеер сменили: серию выберет передача места
        if (watching() || takeover.pending()) return;
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
                takeover.takeOver();
                checkAndClickPlayButton();
            });
        };
        window.addEventListener('message', onStart);
        toTop({ type: 'AG_GET_START' });
        // Сайт может и не ответить: без него плеер остаётся как есть
        noAnswer = setTimeout(() => {
            window.removeEventListener('message', onStart);
            ownListsReady = true;
            takeover.takeOver();
        }, START_WAIT_MS);
    }

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
        toTop({ type: 'AG_PLAYER_NOW', player: player.id, voice, season, duration });
    };
    setInterval(reportPlayerNow, PLAYER_NOW_MS);
    const askHandoff = () => {
        clearInterval(handoffAsk);
        let tries = 0;
        const ask = () => {
            if (!isShown() || ++tries > HANDOFF_ASK_TRIES) return clearInterval(handoffAsk);
            if (!player.video() && !document.querySelector('.play_button, .play_background')) return undefined;
            clearInterval(handoffAsk);
            toTop({ type: 'AG_GET_HANDOFF', visible: true });
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
            toTop({ type: 'AG_SHELL_GET' });
        }, 1000);
        toTop({ type: 'AG_SHELL_GET' });
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
            onVoicePicked: (name) => voice.remember(name),
            takingOver: takeover.takingOver,
            onOwnVoiceChange: takeover.keepPlaceOnVoice,
            isShown,
            guide: globalThis.AgGuide && globalThis.AgGuideFox ? {
                mark: globalThis.AgGuide.mark,
                fox: globalThis.AgGuideFox.svg,
                tipsSeen: async () => (await globalThis.AgGuide.read()).tipsDone,
                tipsDone: () => globalThis.AgGuide.patch({ tipsDone: true, switchTipDone: true }).catch(() => {}),
                switchTipSeen: async () => (await globalThis.AgGuide.read()).switchTipDone,
                demo: globalThis.AgGuide.switchDemo
            } : null,
            sitePick: (kind, index) => toTop({ type: 'AG_SHELL_PICK', kind, index }),
            refreshSite: () => toTop({ type: 'AG_SHELL_GET' }),
            reloadPage: () => toTop({ type: 'AG_RELOAD_PAGE' }),
            nav: (dir) => {
                if (shouldUseLocalNav()) {
                    switchKodikEpisode(dir);
                } else {
                    toTop({ type: 'AG_NAV', dir });
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
        toTop({ type: 'AG_SHELL_GET' });
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
            toTop({ type: 'AG_RELOAD_PAGE' });
        }, 2000);
    }
})();