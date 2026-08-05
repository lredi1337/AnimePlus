(function () {
    function createWatchButton(text, bgGradient, borderColor, hoverBg, onClick) {
        const btn = document.createElement('a');
        btn.href = '#';
        btn.innerHTML = text;
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            flex: 1;
            min-width: 0;
            width: 100%;
            background: ${bgGradient};
            color: #fff;
            padding: 10px 14px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 700;
            font-size: 13.5px;
            cursor: pointer;
            border: 1px solid ${borderColor};
            box-shadow: 0 4px 10px rgba(0,0,0,0.25);
            transition: all 0.2s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            text-align: center;
            box-sizing: border-box;
            white-space: nowrap;
        `;


        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            onClick();
        };

        btn.onmousedown = (e) => {
            e.stopPropagation();
        };

        btn.onmouseover = () => {
            btn.style.background = hoverBg;
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = '0 6px 8px rgba(0,0,0,0.3)';
        };
        btn.onmouseout = () => {
            btn.style.background = bgGradient;
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 4px 6px rgba(0,0,0,0.2)';
        };

        return btn;
    }

    function injectAnimeGoButton() {
        if (document.getElementById('animego-redirect-container')) return;

        let title = '';
        let origTitle = '';
        const hostname = window.location.hostname;
        let targetContainer;

        if (hostname.includes('shikimori')) {
            const h1 = document.querySelector('h1');
            if (h1 && h1.textContent) {
                const parts = h1.textContent.split('/');
                title = parts[0].trim();
                origTitle = parts[1] ? parts[1].trim() : parts[0].trim();
            }
            targetContainer = document.querySelector('.c-poster .c-image') || document.querySelector('.c-image') || document.querySelector('.c-poster');
        }

        if (!title || !targetContainer) return;

        const btnContainer = document.createElement('div');
        btnContainer.id = 'animego-redirect-container';
        btnContainer.setAttribute('data-target-title', title);
        btnContainer.style.cssText = `
            margin-top: 8px;
            margin-bottom: 6px;
            width: 100%;
            display: flex;
            gap: 8px;
            justify-content: center;
        `;

        let isSearching = false;

        const mainBg = 'linear-gradient(135deg, #456484 0%, #2b3e55 100%)';
        const mainBorder = '#5a7b9e';
        const mainHover = 'linear-gradient(135deg, #577b9e 0%, #365270 100%)';

        const mainBtn = createWatchButton(
            '▶ Смотреть&nbsp;с&nbsp;<b>Anime+</b>',
            mainBg,
            mainBorder,
            mainHover,
            () => {
                if (isSearching) return;
                isSearching = true;
                mainBtn.innerHTML = '▶ Ищем на сайтах...';
                mainBtn.style.opacity = '0.75';
                mainBtn.style.pointerEvents = 'none';

                chrome.runtime.sendMessage({
                    action: "search_both_portals",
                    queryTitle: title,
                    origTitle: origTitle
                }, (res) => {
                    btnContainer.innerHTML = '';

                    const animegoInfo = res && res.animego;
                    const jutsuInfo = res && res.jutsu;

                    const hasAnimeGo = animegoInfo && animegoInfo.isDirect;
                    const hasJutsu = jutsuInfo && jutsuInfo.isDirect;

                    if (hasAnimeGo && hasJutsu) {
                        const agBg = 'linear-gradient(135deg, #2b333e 0%, #1e242c 100%)';
                        const agBorder = 'rgba(239, 68, 68, 0.5)';
                        const agHover = 'linear-gradient(135deg, #3b4656 0%, #252d37 100%)';

                        const jsBg = 'linear-gradient(135deg, #2b333e 0%, #1e242c 100%)';
                        const jsBorder = 'rgba(59, 130, 246, 0.5)';
                        const jsHover = 'linear-gradient(135deg, #3b4656 0%, #252d37 100%)';

                        const btnAnimeGo = createWatchButton(
                            '<span style="color:#f87171; font-weight:800;">AnimeGO</span>',
                            agBg,
                            agBorder,
                            agHover,
                            () => window.open(animegoInfo.url, '_blank')
                        );
                        const btnJutsu = createWatchButton(
                            '<span style="color:#60a5fa; font-weight:800;">JUT-SU</span>',
                            jsBg,
                            jsBorder,
                            jsHover,
                            () => window.open(jutsuInfo.url, '_blank')
                        );
                        btnContainer.appendChild(btnAnimeGo);
                        btnContainer.appendChild(btnJutsu);

                    } else if (hasAnimeGo) {
                        window.open(animegoInfo.url, '_blank');
                        const agBg = 'linear-gradient(135deg, #2b333e 0%, #1e242c 100%)';
                        const agBorder = 'rgba(239, 68, 68, 0.5)';

                        const btnAnimeGo = createWatchButton(
                            '▶ Смотреть на&nbsp;<b style="color:#f87171;">AnimeGO</b>',
                            agBg,
                            agBorder,
                            'linear-gradient(135deg, #3b4656 0%, #252d37 100%)',
                            () => window.open(animegoInfo.url, '_blank')
                        );
                        btnContainer.appendChild(btnAnimeGo);

                    } else if (hasJutsu) {
                        window.open(jutsuInfo.url, '_blank');
                        const jsBg = 'linear-gradient(135deg, #2b333e 0%, #1e242c 100%)';
                        const jsBorder = 'rgba(59, 130, 246, 0.5)';

                        const btnJutsu = createWatchButton(
                            '▶ Смотреть на&nbsp;<b style="color:#60a5fa;">JUT-SU</b>',
                            jsBg,
                            jsBorder,
                            'linear-gradient(135deg, #3b4656 0%, #252d37 100%)',
                            () => window.open(jutsuInfo.url, '_blank')
                        );
                        btnContainer.appendChild(btnJutsu);

                    } else {
                        const fallbackUrl = (jutsuInfo && jutsuInfo.url)
                            ? jutsuInfo.url
                            : `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(title)}`;
                        window.open(fallbackUrl, '_blank');

                        const fbBg = 'linear-gradient(135deg, #2b333e 0%, #1e242c 100%)';
                        const fbBorder = 'rgba(255, 255, 255, 0.2)';

                        const btnFallback = createWatchButton(
                            '▶ Искать на&nbsp;<b>JUT-SU</b>',
                            fbBg,
                            fbBorder,
                            'linear-gradient(135deg, #3b4656 0%, #252d37 100%)',
                            () => window.open(fallbackUrl, '_blank')
                        );
                        btnContainer.appendChild(btnFallback);
                    }
                });
            }
        );



        btnContainer.appendChild(mainBtn);

        if (hostname.includes('shikimori')) {
            const iconBar = targetContainer.querySelector('.profile-actions') || 
                            targetContainer.querySelector('.b-user_rate') || 
                            targetContainer.querySelector('.c-status') ||
                            targetContainer.querySelector('.b-add_to_list');
            if (iconBar) {
                iconBar.insertAdjacentElement('beforebegin', btnContainer);
            } else {
                const coverElem = targetContainer.querySelector('a[href*="/posters/"]') ||
                                  targetContainer.querySelector('a[data-lightbox]') ||
                                  targetContainer.querySelector('.cover') ||
                                  targetContainer.querySelector('picture') ||
                                  targetContainer.querySelector('img');
                if (coverElem) {
                    coverElem.insertAdjacentElement('afterend', btnContainer);
                } else {
                    targetContainer.appendChild(btnContainer);
                }
            }
        } else {
            targetContainer.appendChild(btnContainer);
        }
    }




    function injectButtonWithRetry() {
        injectAnimeGoButton();
        setTimeout(injectAnimeGoButton, 1000);
        setTimeout(injectAnimeGoButton, 2000);
    }

    setInterval(() => {
        const currentUrl = location.href;
        const isAnimePage = currentUrl.match(/\/(animes|anime)\/[a-z0-9_\-]+/i) !== null;

        if (isAnimePage) {
            let hasTarget = false;
            let currentRealTitle = '';

            if (location.hostname.includes('shikimori')) {
                const h1 = document.querySelector('h1');
                const titleGot = h1 && h1.textContent && h1.textContent.trim().length > 0;
                if (titleGot) currentRealTitle = h1.textContent.split('/')[0].trim();

                const wrapper = document.querySelector('.c-image') || document.querySelector('.c-poster') || document.querySelector('.m-poster') || document.querySelector('.b-db_entry');
                hasTarget = titleGot && wrapper !== null;
            }

            const oldContainer = document.getElementById('animego-redirect-container');

            if (hasTarget && !oldContainer) {
                injectAnimeGoButton();
            } else if (hasTarget && oldContainer) {
                const currentBtnTarget = oldContainer.getAttribute('data-target-title');
                if (currentBtnTarget !== currentRealTitle) {
                    oldContainer.remove();
                    injectAnimeGoButton();
                }
            }
        } else {
            const oldContainer = document.getElementById('animego-redirect-container');
            if (oldContainer) oldContainer.remove();
        }
    }, 1000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectButtonWithRetry);
    } else {
        injectButtonWithRetry();
    }
})();
