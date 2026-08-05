// modules/jutsu/jt-player.js
// Модуль управления плеером, псевдо-фуллскрином и хоткеями Jut-Su

(function () {
    'use strict';

    function injectPseudoFsStyleJutsu() {
        if (document.getElementById('ag-pseudo-fs-style-jt')) return;
        const style = document.createElement('style');
        style.id = 'ag-pseudo-fs-style-jt';
        style.textContent = `
            body.ag-no-scroll { overflow: hidden !important; }
            body.ag-pseudo-fs-active #jutsu-page__player,
            body.ag-pseudo-fs-active .jutsu-page__player,
            body.ag-pseudo-fs-active .jutsu-page__player-video,
            body.ag-pseudo-fs-active #my-player,
            body.ag-pseudo-fs-active .tabs-block__content,
            .ag-pseudo-fs-active {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                z-index: 2147483647 !important;
                background: #000 !important;
                margin: 0 !important;
                padding: 0 !important;
                max-width: none !important;
                max-height: none !important;
                transform: none !important;
                border-radius: 0 !important;
            }
            body.ag-pseudo-fs-active iframe,
            .ag-pseudo-fs-active iframe {
                width: 100vw !important;
                height: 100vh !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                border: none !important;
                max-width: none !important;
                max-height: none !important;
                transform: none !important;
                border-radius: 0 !important;
                z-index: 2147483647 !important;
            }
            *:has(.ag-pseudo-fs-active) {
                transform: none !important;
                perspective: none !important;
                will-change: auto !important;
                filter: none !important;
                contain: none !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    window.jtInitPlayerControls = function (settings, getAnimeId) {
        injectPseudoFsStyleJutsu();

        const checkMarathon = () => {
            const activeId = sessionStorage.getItem('ag_active_marathon_id');
            const currentId = getAnimeId ? getAnimeId() : null;
            return (activeId && currentId && activeId === currentId);
        };

        let _savedScrollY = 0;

        const setPseudoFS = (enable, sourceWindow = null) => {
            const container = document.querySelector('.jutsu-page__player-video') ||
                              document.querySelector('#my-player') ||
                              document.querySelector('.tabs-block__content') ||
                              document.querySelector('#jutsu-page__player') ||
                              document.querySelector('.jutsu-page__player') ||
                              (document.querySelector('iframe') ? document.querySelector('iframe').parentElement : null);
            if (!container) return;

            const isActive = container.classList.contains('ag-pseudo-fs-active');
            const shouldDisable = (enable === 'disable') || (enable === 'toggle' && isActive);

            document.body.classList.add('ag-fs-transitioning');

            if (shouldDisable) {
                chrome.runtime.sendMessage({ action: "fullscreen_off" });
                if (sourceWindow) sourceWindow.postMessage({ type: 'AG_FS_STATE', active: false }, '*');
                const directIframe = container.querySelector('iframe');
                if (directIframe && directIframe.contentWindow !== sourceWindow) {
                    directIframe.contentWindow?.postMessage({ type: 'AG_FS_STATE', active: false }, '*');
                }

                let resizeTimer;
                let fallbackTimer;

                const onResize = () => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(finishExit, 100);
                };

                const finishExit = () => {
                    clearTimeout(fallbackTimer);
                    clearTimeout(resizeTimer);
                    if (document.activeElement && document.activeElement !== document.body) {
                        try { document.activeElement.blur(); } catch (e) {}
                    }
                    container.classList.remove('ag-pseudo-fs-active');
                    document.body.classList.remove('ag-pseudo-fs-active');
                    document.body.classList.remove('ag-no-scroll');
                    document.body.style.paddingRight = '';
                    container.style.removeProperty('width');
                    container.style.removeProperty('height');
                    document.body.classList.remove('ag-fs-transitioning');
                    window.removeEventListener('resize', onResize);

                    const targetY = _savedScrollY;
                    const restoreScroll = () => {
                        if (targetY > 0) {
                            window.scrollTo({ top: targetY, behavior: 'instant' });
                            document.documentElement.scrollTop = targetY;
                            document.body.scrollTop = targetY;
                        }
                    };

                    restoreScroll();
                    requestAnimationFrame(restoreScroll);
                    setTimeout(restoreScroll, 50);
                    setTimeout(restoreScroll, 150);
                };

                window.addEventListener('resize', onResize);
                fallbackTimer = setTimeout(finishExit, 600);
            } else {
                // Запоминаем текущую позицию скролла перед входом в фуллскрин
                const curY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
                if (curY > 0 || _savedScrollY === 0) {
                    _savedScrollY = curY;
                }

                const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
                if (scrollbarWidth > 0) {
                    document.body.style.paddingRight = `${scrollbarWidth}px`;
                }

                container.classList.add('ag-pseudo-fs-active');
                document.body.classList.add('ag-pseudo-fs-active');
                document.body.classList.add('ag-no-scroll');
                chrome.runtime.sendMessage({ action: "fullscreen_on" });

                if (sourceWindow) sourceWindow.postMessage({ type: 'AG_FS_STATE', active: true }, '*');
                const directIframe2 = container.querySelector('iframe');
                if (directIframe2 && directIframe2.contentWindow !== sourceWindow) {
                    directIframe2.contentWindow?.postMessage({ type: 'AG_FS_STATE', active: true }, '*');
                }

                setTimeout(() => {
                    document.body.classList.remove('ag-fs-transitioning');
                }, 400);
            }
        };

        window.addEventListener('message', (e) => {
            if (!e.origin.includes('kodik') && !e.origin.includes('dbcode') && !e.origin.includes('anivod') && !e.origin.includes('aniboom') && !e.origin.includes('kombik') && !e.origin.includes('tube-storage') && !e.origin.includes('aniqizm') && !e.origin.includes('jut-su.net')) return;

            if (e.data?.type === 'AG_EPISODE_CHANGED') {
                const ep = e.data.episode || "1";
                window.ag_current_episode = ep;
                if (window.jtSyncAniSkip) window.jtSyncAniSkip(ep, e.source);
            }

            if (e.data?.type === 'AG_GET_DATA') {
                const ep = window.ag_current_episode || "1";
                if (window.jtSyncAniSkip) window.jtSyncAniSkip(ep, e.source);
                const titleEl = document.querySelector('.jutsu-page__title-text h1')
                    || document.querySelector('h1')
                    || document.querySelector('.title_video');
                const animeTitle = titleEl ? titleEl.innerText.trim() : 'Jut-Su';
                e.source.postMessage({
                    type: 'AG_DATA',
                    currentTitle: animeTitle,
                    prevTitle: '',
                    nextTitle: ''
                }, '*');
                
                if (checkMarathon()) {
                    e.source.postMessage({ type: 'AG_MARATHON_CONFIRM' }, '*');
                }
                
                const isFs = document.body.classList.contains('ag-pseudo-fs-active');
                e.source.postMessage({ type: 'AG_FS_STATE', active: isFs }, '*');
            }

            if (e.data?.type === 'AG_START_MARATHON') {
                const currentId = getAnimeId ? getAnimeId() : null;
                if (currentId) sessionStorage.setItem('ag_active_marathon_id', currentId);
                if (settings.autoFS) {
                    setTimeout(() => {
                        setPseudoFS('enable', e.source);
                    }, 300);
                }
            }

            if (e.data?.type === 'AG_PSEUDO_FS') {
                setPseudoFS(e.data.action, e.source);
            }
        });

        let agJutsuMoveTimer = null;
        document.addEventListener('mousemove', () => {
            if (document.body.classList.contains('ag-pseudo-fs-active')) {
                if (agJutsuMoveTimer) return;
                agJutsuMoveTimer = setTimeout(() => { agJutsuMoveTimer = null; }, 150);
                const player = document.querySelector('.jutsu-page__player-video') || document.querySelector('#my-player') || document.querySelector('.tabs-block__content');
                const iframe = player ? player.querySelector('iframe') : null;
                if (iframe && iframe.contentWindow) {
                    try {
                        iframe.contentWindow.postMessage({ type: 'AG_MOUSE_MOVE' }, '*');
                    } catch (e) {}
                }
            }
        });

        document.addEventListener('wheel', (e) => {
            const playerBox = e.target.closest('.jutsu-page__player-video') || e.target.closest('#my-player') || e.target.closest('.tabs-block__content');
            if (!playerBox) return;
            const video = document.querySelector('video') || playerBox.querySelector('video');
            if (!video) return;

            e.preventDefault();
            const step = settings.volStep || 0.05;
            if (e.deltaY < 0) {
                video.volume = Math.min(1, video.volume + step);
            } else {
                video.volume = Math.max(0, video.volume - step);
            }
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setPseudoFS('disable');
        });

        return { setPseudoFS, checkMarathon };
    };
})();
