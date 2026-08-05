// modules/animego/ag-player.js
// Модуль управления плеером, псевдо-фуллскрином и хоткеями на AnimeGO

(function () {
    'use strict';

    function injectPseudoFsStyleAnimeGo() {
        if (document.getElementById('ag-pseudo-fs-style')) return;
        const style = document.createElement('style');
        style.id = 'ag-pseudo-fs-style';
        style.textContent = `
            body.ag-no-scroll { overflow: hidden !important; }
            .ag-pseudo-fs-active { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; background: #000 !important; width: 100vw !important; height: 100vh !important; margin: 0 !important; padding: 0 !important; max-width: none !important; max-height: none !important; transform: none !important; border-radius: 0 !important; }
            .ag-pseudo-fs-active .player-video__online, .ag-pseudo-fs-active .player-video, .ag-pseudo-fs-active .player-video__main, .ag-pseudo-fs-active .player__video, .ag-pseudo-fs-active #video-player { height: 100% !important; width: 100% !important; padding: 0 !important; margin: 0 !important; max-width: none !important; max-height: none !important; transform: none !important; border-radius: 0 !important; }
            .ag-pseudo-fs-active iframe { width: 100% !important; height: 100% !important; position: absolute !important; inset: 0 !important; border: none !important; max-width: none !important; max-height: none !important; transform: none !important; border-radius: 0 !important; }
            .ag-pseudo-fs-active .player-video-bar, .ag-pseudo-fs-active .player-video__side { display: none !important; }
            .ag-pseudo-fs-active *:has(.ag-pseudo-fs-active) { transform: none !important; perspective: none !important; will-change: auto !important; filter: none !important; contain: none !important; z-index: auto !important; opacity: 1 !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    window.agInitPlayerControls = function (settings, getAnimeId) {
        injectPseudoFsStyleAnimeGo();

        let _savedScrollY = 0;

        const setPseudoFS = (enable, sourceWindow = null) => {
            const container = document.querySelector('.player__video') || document.querySelector('#video-player') || document.querySelector('.player-video');
            if (!container) return;
            const isActive = container.classList.contains('ag-pseudo-fs-active');

            const shouldDisable = (enable === 'disable') || (enable === 'toggle' && isActive);

            document.body.classList.add('ag-fs-transitioning');

            const screenW = window.screen.width;
            const screenH = window.screen.height;

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

                container.style.setProperty('width', screenW + 'px', 'important');
                container.style.setProperty('height', screenH + 'px', 'important');

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
                    container.style.removeProperty('width');
                    container.style.removeProperty('height');
                    document.body.classList.remove('ag-fs-transitioning');
                }, 400);
            }

            void document.body.offsetHeight;
        };

        const handleResume = () => {
            const btn = document.querySelector('.resume-button');
            if (btn && !btn.dataset.agDone) {
                btn.dataset.agDone = '1';

                const activateMarathon = () => {
                    const currentId = getAnimeId ? getAnimeId() : null;
                    if (currentId) sessionStorage.setItem('ag_active_marathon_id', currentId);
                    if (settings.autoFS) {
                        setTimeout(() => {
                            setPseudoFS('enable');
                            const container = document.querySelector('.player__video') || document.querySelector('#video-player');
                            if (container) {
                                container.querySelector('iframe')?.contentWindow.postMessage({ type: 'AG_FS_STATE', active: true }, '*');
                            }
                        }, 300);
                    }
                };

                btn.addEventListener('mousedown', activateMarathon);
                btn.addEventListener('click', activateMarathon);
            }
        };

        const checkMarathon = () => {
            const activeId = sessionStorage.setItem ? sessionStorage.getItem('ag_active_marathon_id') : null;
            const currentId = getAnimeId ? getAnimeId() : null;
            return (activeId && currentId && activeId === currentId);
        };

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') setPseudoFS('disable');
        });

        return { setPseudoFS, handleResume, checkMarathon };
    };
})();
