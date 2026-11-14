// features/player-bridge.js
// Сторона страницы для протокола content-player.js (postMessage AG_*), общая для всех сайтов-провайдеров:
//   AG_GET_DATA / AG_PLAYER_READY → AG_DATA (название/серия), AG_FS_STATE, AS_DATA_UPDATE (опенинг/эндинг)
//   AG_EPISODE_CHANGED            → обновить номер серии и таймкоды
//   AG_PSEUDO_FS {action}         → псевдо-фуллскрин контейнера плеера
//   AG_NAV {dir}                  → provider.navigate()
//   AG_START_MARATHON             → режим марафона для тайтла
// Таймкоды: метки Kodik и самого сайта (provider.getSkipData). Остальное плеер находит по звуку.

(function () {
    'use strict';

    const STYLE_ID = 'ag-provider-pfs-style';
    const injectStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            body.ag-no-scroll { overflow: hidden !important; }
            /* ru.yummyani.me: html { scrollbar-gutter: stable } резервирует 8px под полосу прокрутки даже при
               overflow:hidden — fixed-элемент туда не заходит, справа оставалась полоса. Сбрасываем на время режима */
            html.ag-pfs-root { overflow: hidden !important; scrollbar-gutter: auto !important; }

            /* Изоляция контекста наложения (Stacking Context) для предков плеера:
               на old.yummyani.me .content-block внутри flex #main-page имеет z-index: 1 и отсекает дочерний z-index,
               из-за чего header.fixed (z-index 6) и #chatter (z-index 3) перекрывали плеер.
               Сбрасываем transform/filter/contain/will-change, поднимаем z-index и открываем overflow */
            .ag-pfs-ancestor,
            html.ag-pfs-root body *:has(> .ag-pfs-active) {
                z-index: 2147483640 !important;
                transform: none !important;
                perspective: none !important;
                contain: none !important;
                filter: none !important;
                will-change: auto !important;
                overflow: visible !important;
                clip-path: none !important;
                mask: none !important;
                backdrop-filter: none !important;
            }

            .ag-pfs-active { position: fixed !important; inset: 0 !important; z-index: 2147483646 !important;
                width: 100vw !important; height: 100vh !important; max-width: none !important; max-height: none !important;
                margin: 0 !important; padding: 0 !important; background: #000 !important; border-radius: 0 !important; transform: none !important;
                display: block !important; }
            .ag-pfs-active > div { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
                margin: 0 !important; padding: 0 !important; max-width: none !important; max-height: none !important; transform: none !important; }
            .ag-pfs-active iframe { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important;
                border: 0 !important; border-radius: 0 !important; z-index: 2147483647 !important; }

            /* Скрываем нативные плавающие/фиксированные элементы страниц при открытом псевдофулскрине */
            html.ag-pfs-root :is(
                header,
                .header,
                #chatter,
                #to-top,
                .to-top,
                #scroll-top,
                .sidebar-block.fixed,
                .notice-container,
                .modal-container,
                .chat-container,
                .chat-fullscreen-bg,
                .emojis-dialog,
                .dark-overlay,
                .preview-anime,
                .message-block.fixed,
                [class*="scroll-to-top"],
                [class*="to-top"],
                [id*="to-top"],
                [id*="scroll-top"]
            ):not(.ag-pfs-active):not(.ag-pfs-ancestor) {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
                z-index: -1 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    };

    const MARATHON_KEY = 'ag_active_marathon_id';
    const RELOAD_EVERY_MS = 5 * 60 * 1000;
    // Смена плеера: столько новый плеер может загружаться, столько времени без отчёта значит, что видео стоит
    const HANDOFF_TTL_MS = 60000;
    const STILL_PLAYING_MS = 3500;
    const HANDOFF_UNCLAIMED_MS = 8000;
    const MIN_EPISODE_SEC = 60;
    const FRAME_CHECK_MS = 400;
    const NO_MARKS = { op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } };

    window.AgFeatures = window.AgFeatures || {};

    window.AgFeatures.playerBridge = function ({ provider, scope, settings, site }) {
        injectStyle();
        let fsContainer = null;
        let savedScrollY = 0;
        let nativeFs = false;
        let skipCache = { key: null, data: null };
        // Какой плеер сейчас смотрят: у другого плеера берём метки Kodik этой же серии и озвучки
        let playerNow = null;

        const post = (win, msg) => { try { win && win.postMessage(msg, '*'); } catch (e) {} };
        const broadcast = (msg, extra) => {
            const wins = new Set(provider.getPlayerWindows());
            if (extra) wins.add(extra);
            wins.forEach(w => post(w, msg));
        };

        const postDeep = (win, msg) => {
            post(win, msg);
            try {
                for (let i = 0; i < win.length; i++) postDeep(win[i], msg);
            } catch (e) {}
        };

        // Смена плеера или озвучки: новый кадр продолжает с той же серии и того же места и запускается сам, даже если перед этим стояла пауза.
        // Старый плеер при смене плеера сразу замолкает, чтобы не играть параллельно. При смене озвучки его кадр сайт заменит сам
        let lastPlayed = null;
        let handoff = null;
        const rememberHandoff = () => {
            if (!lastPlayed) return;
            const now = Date.now();
            const playing = now - lastPlayed.at < STILL_PLAYING_MS;
            handoff = { episode: lastPlayed.episode, time: lastPlayed.time + (playing ? (now - lastPlayed.at) / 1000 : 0), volume: lastPlayed.volume, play: true, at: now };
        };
        // Сайт мог и не сменить плеер: тогда старый так и стоял бы на паузе, а новый не появился бы. Продолжает тот, что сейчас виден
        const resumeIfUnclaimed = (claim) => {
            scope.timeout(() => {
                if (handoff !== claim || !handoff) return;
                const msg = { type: 'AG_HANDOFF', episode: handoff.episode, time: handoff.time, volume: handoff.volume, play: handoff.play };
                handoff = null;
                const wins = new Set(provider.getPlayerWindows());
                document.querySelectorAll('iframe').forEach((frame) => {
                    if (frame.offsetWidth > 0 && wins.has(frame.contentWindow)) postDeep(frame.contentWindow, msg);
                });
            }, HANDOFF_UNCLAIMED_MS);
        };
        const startHandoff = () => {
            rememberHandoff();
            broadcast({ type: 'AG_PAUSE' });
            resumeIfUnclaimed(handoff);
        };
        scope.listen(document, 'ag-player-switch', startHandoff);
        scope.listen(document, 'ag-voice-switch', rememberHandoff);

        // Кадр скрытой вкладки сам не узнает, что его снова показали: ширина уже открывавшегося кадра после скрытия не обнуляется
        const shownFrames = new WeakMap();
        scope.interval(() => {
            const wins = new Set(provider.getPlayerWindows());
            document.querySelectorAll('iframe').forEach((frame) => {
                if (!frame.contentWindow || !wins.has(frame.contentWindow)) return;
                const shown = frame.offsetWidth > 0;
                if (shownFrames.get(frame) === shown) return;
                shownFrames.set(frame, shown);
                postDeep(frame.contentWindow, { type: 'AG_FRAME_SHOWN', shown });
            });
        }, FRAME_CHECK_MS);

        const applyAncestors = (el) => {
            let cur = el && el.parentElement;
            while (cur && cur !== document.body && cur !== document.documentElement) {
                cur.classList.add('ag-pfs-ancestor');
                cur = cur.parentElement;
            }
        };

        const clearAncestors = () => {
            document.querySelectorAll('.ag-pfs-ancestor').forEach(el => el.classList.remove('ag-pfs-ancestor'));
        };

        const applyFs = (container) => {
            fsContainer = container;
            applyAncestors(container);
            container.classList.add('ag-pfs-active');
            document.body.classList.add('ag-no-scroll');
            document.documentElement.classList.add('ag-pfs-root');
        };

        const setPseudoFs = async (action, source) => {
            const container = provider.getPlayerContainer();
            const isActive = !!fsContainer;
            const enable = action === 'enable' || (action === 'toggle' && !isActive);
            if (enable && !isActive && container) {
                savedScrollY = window.scrollY;
                // Настоящий полный экран живёт на блоке, который переживает смену плеера
                const stable = (provider.getFullscreenContainer && provider.getFullscreenContainer()) || container;
                nativeFs = await window.AgNativeFs.request(stable);
                applyFs(nativeFs ? stable : container);
                // Браузер не разрешил настоящий полный экран (автозапуск без нажатия): разворачиваем окно
                if (!nativeFs) window.agSendMessage({ action: 'fullscreen_on' });
            } else if (!enable && isActive) {
                const wasNative = nativeFs;
                nativeFs = false;
                fsContainer.classList.remove('ag-pfs-active');
                clearAncestors();
                fsContainer = null;
                document.body.classList.remove('ag-no-scroll');
                document.documentElement.classList.remove('ag-pfs-root');
                if (wasNative) window.AgNativeFs.exit();
                else window.agSendMessage({ action: 'fullscreen_off' });
                requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
            }
            broadcast({ type: 'AG_FS_STATE', active: !!fsContainer }, source);
        };

        // Выход средствами браузера: Esc, F11. Если сайт сам заменил блок плеера, полный экран снимается не по воле зрителя
        window.AgNativeFs.onExit(() => {
            if (!nativeFs || !fsContainer) return;
            if (!fsContainer.isConnected && provider.getPlayerContainer()) {
                nativeFs = false;
                applyFs(provider.getPlayerContainer());
                window.agSendMessage({ action: 'fullscreen_on' });
                return;
            }
            setPseudoFs('disable');
        });

        // Метки этой серии и озвучки у Kodik точнее общих: они показываются сразу, ещё до начала песни
        const kodikMarksFor = async (episode) => {
            if (!playerNow || playerNow.player === 'kodik') return null;
            const trust = (marks) => (marks ? {
                op: marks.op ? { ...marks.op, trusted: true, kodik: true } : null,
                ed: marks.ed ? { ...marks.ed, trusted: true, kodik: true } : null
            } : null);
            if (provider.getKodikMarks) return trust(await provider.getKodikMarks(episode, playerNow.voice));
            const url = provider.getKodikUrl ? provider.getKodikUrl() : null;
            if (!url) return null;
            return trust(await window.agSendMessage({ action: 'get_kodik_marks', url, episode, voice: playerNow.voice, season: playerNow.season, duration: playerNow.duration }));
        };

        // Ответы сети приходят в любом порядке: метки считаются только для самого свежего запроса
        let skipRequest = 0;
        const sendSkipData = async (target) => {
            const request = ++skipRequest;
            const episode = provider.getEpisode();
            const info = await provider.getTitleInfo();
            if (!info) return;
            const key = `${info.pageKey}#${episode}#${provider.getSkipKey ? provider.getSkipKey() : ''}#${playerNow ? `${playerNow.player}|${playerNow.voice}|${playerNow.season}` : ''}`;
            if (skipCache.key !== key) {
                let shikimoriId = info.shikimoriId;
                if (!shikimoriId) {
                    const resolved = await window.agSendMessage({ action: 'resolve_shikimori_id', titles: info.titles, year: info.year, kind: info.kind });
                    shikimoriId = resolved && resolved.id;
                }
                const own = await provider.getSkipData(episode);
                const kodik = await kodikMarksFor(episode);
                const known = (part) => (kodik && kodik[part] ? kodik[part] : (own && own[part].end > 0 ? own[part] : null));
                // Чего нет у Kodik и сайта, плеер найдёт по звуку
                const data = { op: known('op') || NO_MARKS.op, ed: known('ed') || NO_MARKS.ed };
                if (request !== skipRequest) return;
                skipCache = { key, data, malId: shikimoriId };
            }
            if (scope.disposed || request !== skipRequest) return;
            // ID Shikimori совпадает с MAL: по нему плеер находит отпечатки песен
            broadcast({ type: 'AS_DATA_UPDATE', data: skipCache.data, malId: skipCache.malId, episode }, target);
        };

        // Досмотрена последняя серия тайтла: плеер предлагает оценить его и открыть продолжение
        let finale = null;
        const showFinale = async (target, episode) => {
            const tracker = window.__agProgressTrackerActive;
            if (!tracker || !tracker.titleId) return;
            try {
                const id = await tracker.titleId();
                if (!id) return;
                const res = await window.agSendMessage({ action: 'get_title_finale', id, episode: provider.getEpisode(episode != null ? String(episode) : null) });
                if (scope.disposed || !res || !res.finished) return;
                finale = { id, sequel: res.sequel || null };
                post(target, { type: 'AG_FINALE', canRate: !!res.canRate, sequel: finale.sequel ? { title: finale.sequel.title, kind: finale.sequel.kind, year: finale.sequel.year } : null });
            } catch (e) {}
        };
        // Продолжение открывается на этом же сайте. Если его здесь нет, остаётся страница Shikimori: кнопка Anime+ на ней найдёт его на других сайтах
        const openSequel = async () => {
            if (!finale || !finale.sequel) return;
            const { id } = finale.sequel;
            let url = null;
            try {
                const res = site ? await window.agSendMessage({ action: 'resolve_site_url', siteId: site.id, shikimoriId: id }) : null;
                const found = res && res.url ? new URL(res.url) : null;
                const foundSite = found && found.protocol === 'https:' ? window.AgSites.byHost(found.hostname) : null;
                if (foundSite && foundSite.id === site.id) url = found.href;
            } catch (e) {}
            if (scope.disposed) return;
            // Нажатие было в кадре плеера, и новую вкладку отсюда браузер заблокировал бы: открываем в этой
            location.href = url || `https://shikimori.io/animes/${id}`;
        };

        // Команды принимаются только от плееров и сайтов из списка: любой кадр страницы не годится, реклама тоже кадр
        const fromPlayer = (e) => !!(window.isValidOrigin && window.isValidOrigin(e.origin));

        scope.listen(window, 'message', async (e) => {
            const data = e.data;
            if (!data || typeof data.type !== 'string' || !data.type.startsWith('AG_') || !fromPlayer(e)) return;

            switch (data.type) {
                case 'AG_GET_DATA':
                case 'AG_PLAYER_READY': {
                    if (data.episode) provider.getEpisode(data.episode);
                    const info = await provider.getTitleInfo();
                    const episode = provider.getEpisode();
                    post(e.source, {
                        type: 'AG_DATA',
                        currentTitle: `${episode} серия - ${info ? info.title : document.title}`
                    });
                    post(e.source, { type: 'AG_FS_STATE', active: !!fsContainer });
                    // Марафон: зритель уже запускал этот тайтл, следующая серия стартует сама
                    if (info && sessionStorage.getItem(MARATHON_KEY) === String(info.pageKey)) {
                        post(e.source, { type: 'AG_MARATHON_CONFIRM' });
                    }
                    sendSkipData(e.source);
                    break;
                }
                case 'AG_GET_START': {
                    const about = await provider.getTitleInfo();
                    // Серию могли смотреть и на другом сайте: учёт просмотра знает место остановки на всех
                    const tracker = window.__agProgressTrackerActive;
                    const last = tracker && tracker.lastWatched ? await tracker.lastWatched() : (window.agLastWatched ? window.agLastWatched() : null);
                    post(e.source, { type: 'AG_START', season: provider.getWantedSeason(about), last });
                    break;
                }
                // Плеер потерял одноразовую ссылку на видео: новую выдаёт только страница сайта
                case 'AG_RELOAD_PAGE': {
                    const key = `ag_reload_${location.pathname}`;
                    let last = 0;
                    try { last = Number(sessionStorage.getItem(key)) || 0; } catch (err) {}
                    if (Date.now() - last < RELOAD_EVERY_MS) break;
                    try { sessionStorage.setItem(key, String(Date.now())); } catch (err) {}
                    location.reload();
                    break;
                }
                case 'AG_SHELL_GET':
                    if (provider.getShellSite) post(e.source, { type: 'AG_SHELL_SITE', site: await provider.getShellSite() });
                    break;
                case 'AG_VIDEO_PROGRESS':
                    if (data.isEnded) lastPlayed = null;
                    else if (data.duration >= MIN_EPISODE_SEC) lastPlayed = { episode: data.episode, time: data.currentTime, volume: data.volume, at: Date.now() };
                    break;
                case 'AG_PLAYER_NOW':
                    playerNow = { player: data.player, voice: data.voice, season: data.season, duration: data.duration };
                    sendSkipData(e.source);
                    break;
                case 'AG_GET_HANDOFF':
                    if (handoff && data.visible && Date.now() - handoff.at < HANDOFF_TTL_MS) {
                        post(e.source, { type: 'AG_HANDOFF', episode: handoff.episode, time: handoff.time, volume: handoff.volume, play: handoff.play });
                        handoff = null;
                    }
                    break;
                case 'AG_SHELL_PICK':
                    if (data.kind === 'players') startHandoff();
                    if (data.kind === 'voices') rememberHandoff();
                    if (provider.shellPick) {
                        await provider.shellPick(data.kind, Number(data.index));
                        scope.timeout(async () => post(e.source, { type: 'AG_SHELL_SITE', site: await provider.getShellSite() }), 600);
                    }
                    break;
                case 'AG_EPISODE_CHANGED':
                    provider.getEpisode(data.episode);
                    sendSkipData(e.source);
                    break;
                case 'AG_PSEUDO_FS':
                    setPseudoFs(data.action, e.source);
                    break;
                case 'AG_NAV': {
                    const handled = provider.navigate(data.dir === 'prev' ? 'prev' : 'next');
                    if (!handled) {
                        post(e.source, { type: 'AG_SWITCH_KODIK_EPISODE', dir: data.dir });
                    }
                    break;
                }
                case 'AG_EPISODE_END':
                    if (data.duration >= MIN_EPISODE_SEC) showFinale(e.source, data.episode);
                    break;
                case 'AG_FINALE_RATE': {
                    if (!finale) break;
                    const res = await window.agSendMessage({ action: 'shiki_set_score', id: finale.id, score: Number(data.score) });
                    post(e.source, { type: 'AG_FINALE_RATED', ok: !!(res && res.success), score: Number(data.score) });
                    break;
                }
                case 'AG_FINALE_NEXT':
                    openSequel();
                    break;
                case 'AG_START_MARATHON': {
                    const started = await provider.getTitleInfo();
                    if (started) sessionStorage.setItem(MARATHON_KEY, String(started.pageKey));
                    break;
                }
            }
        });

        scope.listen(document, 'keydown', (e) => {
            if (e.key === 'Escape' && fsContainer) setPseudoFs('disable');
        });

        // Сайт пересоздаёт iframe при смене серии (ru.yummyani.me) — переносим режим на новый контейнер
        scope.observe(() => {
            if (!fsContainer) return;
            const current = provider.getPlayerContainer();
            if (current && current !== fsContainer && !nativeFs) {
                fsContainer.classList.remove('ag-pfs-active');
                clearAncestors();
                current.classList.add('ag-pfs-active');
                applyAncestors(current);
                fsContainer = current;
            }
        }, { root: document.body, wait: 200 });

        // Уход со страницы (SPA) — снять фуллскрин, иначе страница останется заблокированной
        scope.add(() => {
            if (fsContainer) setPseudoFs('disable');
            clearAncestors();
        });
    };
})();
