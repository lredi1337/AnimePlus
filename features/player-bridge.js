// features/player-bridge.js
// Сторона страницы для протокола content-kodik.js (postMessage AG_*), общая для всех сайтов-провайдеров:
//   AG_GET_DATA / AG_PLAYER_READY → AG_DATA (название/серия), AG_FS_STATE, AS_DATA_UPDATE (опенинг/эндинг)
//   AG_EPISODE_CHANGED            → обновить номер серии и таймкоды
//   AG_PSEUDO_FS {action}         → псевдо-фуллскрин контейнера плеера
//   AG_NAV {dir}                  → provider.navigate()
//   AG_START_MARATHON             → автопсевдо-фуллскрин (настройка autoFS)
// Таймкоды: сначала с самого сайта (provider.getSkipData), иначе AniSkip по ID Shikimori.

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

    async function fetchAniSkip(shikimoriId, episode) {
        if (!shikimoriId) return null;
        try {
            const res = await fetch(`https://api.aniskip.com/v2/skip-times/${shikimoriId}/${parseFloat(episode) || 1}?types=op&types=ed&episodeLength=0`);
            const json = await res.json();
            if (!json || !json.found) return null;
            const range = (type) => {
                const r = json.results.find(x => x.skipType === type);
                return r ? { start: r.interval.startTime, end: r.interval.endTime } : { start: 0, end: 0 };
            };
            return { op: range('op'), ed: range('ed') };
        } catch (e) {
            return null;
        }
    }

    const NO_MARKS = { op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } };

    window.AgFeatures = window.AgFeatures || {};

    window.AgFeatures.playerBridge = function ({ provider, scope, settings }) {
        injectStyle();
        let fsContainer = null;
        let savedScrollY = 0;
        let skipCache = { key: null, data: null };

        const post = (win, msg) => { try { win && win.postMessage(msg, '*'); } catch (e) {} };
        const broadcast = (msg, extra) => {
            const wins = new Set(provider.getPlayerWindows());
            if (extra) wins.add(extra);
            wins.forEach(w => post(w, msg));
        };

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

        const setPseudoFs = (action, source) => {
            const container = provider.getPlayerContainer();
            const isActive = !!fsContainer;
            const enable = action === 'enable' || (action === 'toggle' && !isActive);
            if (enable && !isActive && container) {
                savedScrollY = window.scrollY;
                fsContainer = container;
                applyAncestors(container);
                container.classList.add('ag-pfs-active');
                document.body.classList.add('ag-no-scroll');
                document.documentElement.classList.add('ag-pfs-root');
                window.agSendMessage({ action: 'fullscreen_on' });
            } else if (!enable && isActive) {
                fsContainer.classList.remove('ag-pfs-active');
                clearAncestors();
                fsContainer = null;
                document.body.classList.remove('ag-no-scroll');
                document.documentElement.classList.remove('ag-pfs-root');
                window.agSendMessage({ action: 'fullscreen_off' });
                requestAnimationFrame(() => window.scrollTo(0, savedScrollY));
            }
            broadcast({ type: 'AG_FS_STATE', active: !!fsContainer }, source);
        };

        const sendSkipData = async (target) => {
            const episode = provider.getEpisode();
            const info = await provider.getTitleInfo();
            if (!info) return;
            const key = `${info.pageKey}#${episode}`;
            if (skipCache.key !== key) {
                let shikimoriId = info.shikimoriId;
                if (!shikimoriId) {
                    const resolved = await window.agSendMessage({ action: 'resolve_shikimori_id', titles: info.titles, year: info.year, kind: info.kind });
                    shikimoriId = resolved && resolved.id;
                }
                const data = (await provider.getSkipData(episode)) || (await fetchAniSkip(shikimoriId, episode)) || NO_MARKS;
                skipCache = { key, data, malId: shikimoriId };
            }
            if (scope.disposed) return;
            // ID Shikimori совпадает с MAL: по нему плеер находит отпечатки песен
            broadcast({ type: 'AS_DATA_UPDATE', data: skipCache.data, malId: skipCache.malId }, target);
        };

        const fromPlayer = (e) => {
            if (window.isValidOrigin && window.isValidOrigin(e.origin)) return true;
            return Array.from(document.querySelectorAll('iframe')).some(f => f.contentWindow === e.source);
        };

        scope.listen(window, 'message', async (e) => {
            const data = e.data;
            if (!data || typeof data.type !== 'string' || !data.type.startsWith('AG_') || !fromPlayer(e)) return;

            switch (data.type) {
                case 'AG_GET_DATA':
                case 'AG_PLAYER_READY': {
                    if (data.episode) provider.getEpisode(data.episode);
                    const info = await provider.getTitleInfo();
                    const episode = provider.getEpisode();
                    const num = parseInt(episode, 10) || 1;
                    post(e.source, {
                        type: 'AG_DATA',
                        prevTitle: num > 1 ? `${num - 1} серия` : '',
                        nextTitle: `${num + 1} серия`,
                        currentTitle: `${episode} серия - ${info ? info.title : document.title}`
                    });
                    post(e.source, { type: 'AG_FS_STATE', active: !!fsContainer });
                    sendSkipData(e.source);
                    break;
                }
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
                case 'AG_START_MARATHON':
                    if (settings.autoFS) scope.timeout(() => setPseudoFs('enable', e.source), 300);
                    break;
            }
        });

        scope.listen(document, 'keydown', (e) => {
            if (e.key === 'Escape' && fsContainer) setPseudoFs('disable');
        });

        // Сайт пересоздаёт iframe при смене серии (ru.yummyani.me) — переносим режим на новый контейнер
        scope.observe(() => {
            if (!fsContainer) return;
            const current = provider.getPlayerContainer();
            if (current && current !== fsContainer) {
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
