(function () {
    const { AgSites } = window;
    const CHOICE_BG ='linear-gradient(135deg, #2b333e 0%, #1e242c 100%)';
    const CHOICE_HOVER = 'linear-gradient(135deg, #3b4656 0%, #252d37 100%)';

    // Заголовок Shikimori: «Русское / Английское». Разделитель отбит пробелами,
    // а косая черта внутри названия (Fate/stay night) — нет
    function parseTitles(h1) {
        const parts = (h1 && h1.textContent ? h1.textContent : '').split(/\s+\/\s+/).map(t => t.trim());
        return { title: parts[0] || '', origTitle: parts[1] || parts[0] || '' };
    }

    function getShikimoriId() {
        const match = location.pathname.match(/\/animes?\/[a-z]*(\d+)/i);
        return match ? match[1] : null;
    }

    // Поиск по названию, когда прямой ссылки нет нигде. DLE-сайты сами перейдут на тайтл по ag_from
    function getSearchFallback(siteIds, title) {
        const sites = siteIds.map(id => AgSites.byId(id));
        const query = encodeURIComponent(title);
        const dle = sites.find(s => s.dle && s.dle.searchPath);
        if (dle) return { site: dle, url: `${dle.home}${dle.dle.searchPath}${query}&ag_from=animeplus` };
        const animego = sites.find(s => s.platform === 'animego');
        if (animego) return { site: animego, url: `${animego.home}/search/anime?q=${query}` };
        return null;
    }

    // Прямые ссылки на всех сайтах, включённых в настройках
    async function findOnSites(titles) {
        const { ag_settings: settings = {} } = await chrome.storage.local.get(['ag_settings']);
        const siteIds = AgSites.list.filter(s => AgSites.isEnabled(settings, s.id)).map(s => s.id);
        if (siteIds.length === 0) return { siteIds, found: [] };

        const res = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
                action: 'resolve_all_sites',
                siteIds,
                titles,
                shikimoriId: getShikimoriId()
            }, (response) => {
                void chrome.runtime.lastError;
                resolve(response);
            });
        });
        return { siteIds, found: ((res && res.results) || []).filter(r => r.url) };
    }

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
            ({ title, origTitle } = parseTitles(document.querySelector('h1')));
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
                const mainText = mainBtn.innerHTML;
                mainBtn.innerHTML = '▶ Ищем на сайтах...';
                mainBtn.style.opacity = '0.75';
                mainBtn.style.pointerEvents = 'none';

                // Открытие из ответа поиска браузер может заблокировать: жест пользователя к этому моменту
                // уже истёк. Поэтому после автооткрытия кнопка всегда остаётся на месте
                const openTitle = (url) => {
                    window.open(url, '_blank');
                    chrome.runtime.sendMessage({
                        action: 'add_watch_history',
                        item: { russian: title, name: origTitle, url }
                    }, () => { void chrome.runtime.lastError; });
                };

                const addChoice = (html, color, url) => {
                    const btn = createWatchButton(html, CHOICE_BG, `${color}80`, CHOICE_HOVER, () => openTitle(url));
                    btn.style.flex = 'none';
                    btnContainer.appendChild(btn);
                };

                const addNote = (text) => {
                    const note = createWatchButton(text, CHOICE_BG, 'rgba(255, 255, 255, 0.2)', CHOICE_HOVER, () => {});
                    note.style.opacity = '0.75';
                    note.style.pointerEvents = 'none';
                    note.style.whiteSpace = 'normal';
                    btnContainer.appendChild(note);
                };

                findOnSites([title, origTitle]).then(({ siteIds, found }) => {
                    // Пока шёл поиск, пользователь мог уйти на другой тайтл
                    if (!btnContainer.isConnected) return;
                    btnContainer.innerHTML = '';

                    if (found.length > 1) {
                        // Сайтов до семи: в ширину постера они влезают только столбиком
                        btnContainer.style.flexDirection = 'column';
                        found.forEach((r) => {
                            const site = AgSites.byId(r.siteId);
                            addChoice(`<span style="color:${site.color}; font-weight:800;">${site.name}</span>`, site.color, r.url);
                        });
                    } else if (found.length === 1) {
                        const site = AgSites.byId(found[0].siteId);
                        openTitle(found[0].url);
                        addChoice(`▶ Смотреть на&nbsp;<b style="color:${site.color};">${site.name}</b>`, site.color, found[0].url);
                    } else if (siteIds.length === 0) {
                        addNote('Все сайты выключены в Anime+');
                    } else {
                        const fallback = getSearchFallback(siteIds, title);
                        if (fallback) {
                            openTitle(fallback.url);
                            addChoice(`▶ Искать на&nbsp;<b>${fallback.site.name}</b>`, fallback.site.color, fallback.url);
                        } else {
                            addNote('Не найдено на включённых сайтах');
                        }
                    }
                }).catch(() => {
                    // Например, расширение обновилось и вкладка потеряла с ним связь
                    isSearching = false;
                    mainBtn.innerHTML = mainText;
                    mainBtn.style.opacity = '';
                    mainBtn.style.pointerEvents = '';
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

    const syncWatchButton = () => {
        const currentUrl = location.href;
        const isAnimePage = currentUrl.match(/\/(animes|anime)\/[a-z0-9_\-]+/i) !== null;

        if (isAnimePage) {
            let hasTarget = false;
            let currentRealTitle = '';

            if (location.hostname.includes('shikimori')) {
                const h1 = document.querySelector('h1');
                const titleGot = h1 && h1.textContent && h1.textContent.trim().length > 0;
                if (titleGot) currentRealTitle = parseTitles(h1).title;

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
    };

    // Shikimori меняет страницы без перезагрузки. Вместо вечного опроса раз в секунду —
    // наблюдатель DOM с объединением мутаций: в простое ничего не выполняется
    let syncTimer = null;
    new MutationObserver(() => {
        if (syncTimer) return;
        syncTimer = setTimeout(() => { syncTimer = null; syncWatchButton(); }, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('popstate', syncWatchButton);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectButtonWithRetry);
    } else {
        injectButtonWithRetry();
    }
})();
