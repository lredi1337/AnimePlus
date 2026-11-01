// modules/jutsu/jt-top.js
// Движок страницы «ТОП-100 по версии Shikimori» и переадресатор на Jut-Su

(function () {
    'use strict';

    let topCurrentType = 'shikimori';
    let topCurrentKind = '';
    let renderToken = 0;

    // Инъекция CSS стилей для Топ-100 на Jut-Su
    const injectTopStyles = () => {
        if (document.getElementById('ag-jutsu-top-styles')) return;
        const style = document.createElement('style');
        style.id = 'ag-jutsu-top-styles';
        style.textContent = `
            #ag-top-container { width: 100%; min-height: 400px; padding-bottom: 30px; }
            .ag-load-more-btn { display: block; width: 100%; padding: 15px; margin: 20px 0; background: #202636; color: white; text-align: center; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; border: 1px solid #2d3548; }
            .ag-load-more-btn:hover { background: #3b82f6; border-color: #3b82f6; }
            .ag-spinner-container { text-align: center; padding: 50px 0; width: 100%; color: #8892b0; font-weight: bold; }
            .ag-spinner { display: inline-block; width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-left-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
            .ag-spinner-text { margin-top: 12px; font-size: 14px; }
            @keyframes spin { 100% { transform: rotate(360deg); } }

            /* Скрытие основного контента при открытом топе */
            body.ag-top-active .jutsu-main { display: none !important; }
            body.ag-top-active .message-info { display: none !important; }

            /* Корректное отображение рейтинга ★ 9.27 в одну строку */
            .jutsu-item__label-rating {
                width: auto !important;
                min-width: 44px !important;
                padding: 3px 7px !important;
                white-space: nowrap !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex-direction: row !important;
                gap: 3px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                line-height: 1.2 !important;
            }
        `;
        document.head.appendChild(style);
    };

    const renderSpinner = () => `<div class="ag-spinner-container"><div class="ag-spinner"></div><div class="ag-spinner-text">Загрузка топа...</div></div>`;

    const renderAnimeCard = (anime, rank, nativeCovers) => {
        const title = anime.russian || anime.name;
        const score = anime.score || '?';
        const year = anime.aired_on ? anime.aired_on.split('-')[0] : '';
        const type = anime.kind ? anime.kind.toUpperCase() : 'TV';
        const episodesText = anime.episodes ? (anime.episodes + ' эп.') : type;

        const queryTitle = title.split('/')[0].split('[')[0].trim();
        // Сначала постер Shikimori; обложка, найденная ранее на самом Jut-Su (кэш ag_native_covers), —
        // только запасной вариант в цепочке agBindPoster. Раньше её ставили первой и массово искали
        // обложки на Jut-Su для всех 100 тайтлов, подменяя корректные постеры Shikimori.
        const nativeCover = nativeCovers ? (nativeCovers[queryTitle.toLowerCase()] || '') : '';
        const rawPoster = anime.ag_resolved_poster || (anime.image ? (anime.image.original || anime.image.preview) : '');
        const posterUrl = window.agIsPlaceholderPoster(rawPoster) ? '' : window.agNormalizePosterUrl(rawPoster);
        const esc = window.agEscapeHtml;

        return `
            <div class="jutsu-item jutsu-item--short p-relative cd-exp-link grid-item has-overlay-on-img" style="cursor: pointer;">
                <div class="jutsu-item__img cd-img ar-2-3 icon icon-play has-overlay-on-img__trg">
                    <img src="${esc(posterUrl)}" alt="${esc(title)}" decoding="async" referrerpolicy="no-referrer" data-ag-title="${esc(queryTitle.toLowerCase())}" data-ag-poster-id="${anime.id || ''}" data-ag-poster-ru="${esc(anime.russian || title || '')}" data-ag-poster-en="${esc(anime.name || '')}" data-ag-poster-native="${esc(nativeCover)}">
                </div>
                <div class="jutsu-item__desc">
                    <a class="jutsu-item__title cd-exp-link__trg ag-top-link" href="#" data-query="${esc(queryTitle)}" data-orig="${esc(anime.name || '')}" data-year="${esc(year)}" data-type="${esc(type)}">${esc(title)}</a>
                </div>
                <div class="jutsu-item__meta ar-2-3 d-flex fd-column jc-space-between ai-flex-start">
                    <div class="jutsu-item__label jutsu-item__label-rating cd-flex jc-center">★ ${esc(score)}</div>
                    <div class="jutsu-item__label jutsu-item__label-series cd-flex">${esc(episodesText)}</div>
                </div>
            </div>
        `;
    };

    const renderCardBatch = (items, startRankOffset, grid, nativeCovers) => {
        items.forEach((item, idx) => {
            const rank = startRankOffset + idx + 1;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderAnimeCard(item, rank, nativeCovers);
            const cardEl = tempDiv.firstElementChild;
            if (grid) grid.appendChild(cardEl);

            cardEl.addEventListener('click', async (e) => {
                e.preventDefault();
                const linkEl = cardEl.querySelector('.ag-top-link');
                let query = linkEl ? linkEl.getAttribute('data-query') : (item.russian || item.name);
                const origTitle = linkEl ? linkEl.getAttribute('data-orig') : (item.name || '');
                const targetYear = linkEl ? linkEl.getAttribute('data-year') : (item.aired_on ? item.aired_on.split('-')[0] : '');
                const targetType = linkEl ? linkEl.getAttribute('data-type') : (item.kind || '');
                if (linkEl) linkEl.textContent = 'Ищем...';

                chrome.runtime.sendMessage({
                    action: "resolve_direct_jutsu_url",
                    russian: item.russian || query,
                    name: origTitle,
                    year: targetYear,
                    kind: targetType,
                    fallbackUrl: `/?do=search&subaction=search&story=${encodeURIComponent(query)}&ag_from=animeplus`
                }, (res) => {
                    if (res && res.url) {
                        window.location.href = res.url;
                    } else {
                        window.location.href = `/?do=search&subaction=search&story=${encodeURIComponent(query)}&ag_from=animeplus`;
                    }
                });
            });
        });
    };

    const loadTopPage = async (container) => {
        // Токен вместо флага загрузки: клик по вкладке во время загрузки больше не теряется,
        // а устаревший ответ просто отбрасывается
        const token = ++renderToken;
        const isStale = () => token !== renderToken || !container.isConnected;

        injectTopStyles();

        const activeTabClass = (kind) => topCurrentKind === kind ? 'class="is-active"' : '';

        container.innerHTML = `
            <div class="jutsu-sect font-main">
                <div class="jutsu-sect__head cd-flex ai-center jc-space-between">
                    <div>
                        <h1 class="jutsu-sect__title icon cd-flex icon2 icon2-film">Топ 100 Shikimori</h1>
                        <p class="jutsu-sect__subtitle cd-nowrap">Самые популярные тайтлы по версии мировой базы Shikimori</p>
                    </div>
                </div>

                <div class="jutsu-sect__tabs2 cd-flex" id="ag-top-tabs">
                    <button type="button" data-kind="" ${activeTabClass('')}>Все</button>
                    <button type="button" data-kind="tv" ${activeTabClass('tv')}>Сериалы</button>
                    <button type="button" data-kind="movie" ${activeTabClass('movie')}>Фильмы</button>
                    <button type="button" data-kind="ova" ${activeTabClass('ova')}>OVA</button>
                    <button type="button" data-kind="ona" ${activeTabClass('ona')}>ONA</button>
                    <button type="button" data-kind="special" ${activeTabClass('special')}>Спешлы</button>
                </div>

                <div class="jutsu-sect__content grid-items grid-items--count" id="ag-top-grid">
                    ${renderSpinner()}
                </div>
            </div>
        `;

        document.querySelectorAll('#ag-top-tabs button').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const newKind = btn.getAttribute('data-kind');
                if (topCurrentKind !== newKind) {
                    topCurrentKind = newKind;
                    loadTopPage(container);
                }
            };
        });

        try {
            const cacheRes = await new Promise(r => chrome.storage.local.get(['ag_native_covers'], r));
            const nativeCovers = cacheRes.ag_native_covers || {};
            let kindParam = topCurrentKind ? `&kind=${topCurrentKind}` : '';

            const shikiResponse1 = await new Promise((resolve) => {
                try {
                    chrome.runtime.sendMessage({
                        action: "fetch_shikimori",
                        url: `https://shikimori.io/api/animes?limit=50&order=ranked&page=1${kindParam}`
                    }, (response) => {
                        if (chrome.runtime.lastError) resolve(null);
                        else resolve(response);
                    });
                } catch (err) {
                    resolve(null);
                }
            });

            if (isStale()) return;
            const data1 = shikiResponse1 && Array.isArray(shikiResponse1.data) ? shikiResponse1.data : [];
            const grid = container.querySelector('#ag-top-grid');
            if (grid) grid.innerHTML = '';

            if (!data1 || data1.length === 0) {
                const errorMsg = document.createElement('div');
                errorMsg.className = 'ag-load-more-btn';
                errorMsg.style.background = 'transparent';
                errorMsg.style.cursor = 'default';
                errorMsg.style.gridColumn = '1 / -1';
                errorMsg.innerText = 'Ошибка загрузки данных. Пожалуйста, обновите страницу и попробуйте снова.';
                if (grid) grid.appendChild(errorMsg);
                return;
            }

            renderCardBatch(data1, 0, grid, nativeCovers);
            window.agBindPostersIn(grid);

            if (data1.length === 50) {
                chrome.runtime.sendMessage({
                    action: "fetch_shikimori",
                    url: `https://shikimori.io/api/animes?limit=50&order=ranked&page=2${kindParam}`
                }, (shikiResponse2) => {
                    if (isStale()) return;
                    const data2 = shikiResponse2 && Array.isArray(shikiResponse2.data) ? shikiResponse2.data : [];
                    if (data2 && data2.length > 0 && grid) {
                        renderCardBatch(data2, 50, grid, nativeCovers);
                        window.agBindPostersIn(grid);
                    }

                    const msg = document.createElement('div');
                    msg.className = 'ag-load-more-btn';
                    msg.style.background = 'transparent';
                    msg.style.cursor = 'default';
                    msg.style.gridColumn = '1 / -1';
                    msg.innerText = 'Это весь Топ-100!';
                    if (grid) grid.appendChild(msg);
                });
            } else {
                const msg = document.createElement('div');
                msg.className = 'ag-load-more-btn';
                msg.style.background = 'transparent';
                msg.style.cursor = 'default';
                msg.style.gridColumn = '1 / -1';
                msg.innerText = 'Это весь Топ-100!';
                if (grid) grid.appendChild(msg);
            }

        } catch (e) {
            console.error("Top load error:", e);
            const grid = container.querySelector('#ag-top-grid');
            if (grid && !isStale()) grid.innerHTML = '<div class="ag-load-more-btn" style="background: transparent; cursor: default; grid-column: 1 / -1;">Ошибка загрузки Топа. Обновите страницу.</div>';
        }
    };

    const handleNavigation = (urlPath) => {
        if (urlPath === '/top-shikimori') {
            topCurrentType = 'shikimori';

            const contentContainer = window.agFind('jutsu', 'content');
            if (!contentContainer) {
                // Встроиться некуда. С текущей страницы переходим обычной навигацией (return false),
                // а если мы уже на /top-shikimori без разметки — открываем Топ поверх главной.
                // Раньше здесь был location.replace с return true, и следующий pushState отменял переход
                if (location.pathname === urlPath) window.location.replace('/?show_ag_top=' + topCurrentType);
                return false;
            }

            document.body.classList.add('ag-top-active');

            let topContainer = document.getElementById('ag-top-container');
            if (topContainer) topContainer.remove();

            topContainer = document.createElement('div');
            topContainer.id = 'ag-top-container';
            contentContainer.appendChild(topContainer);

            loadTopPage(topContainer);
            return true;
        }

        document.body.classList.remove('ag-top-active');
        const topContainer = document.getElementById('ag-top-container');
        if (topContainer) topContainer.remove();
        return false;
    };

    const injectTopButtons = () => {
        const top100Link = document.querySelector('a[href*="/top100/"]');
        if (top100Link) {
            const top100Li = top100Link.closest('li');
            if (top100Li && !document.querySelector('.ag-top-injected')) {
                const shikiLi = document.createElement('li');
                shikiLi.className = 'ag-top-injected';
                shikiLi.innerHTML = '<a href="/top-shikimori" title="ТОП-100 по версии Shikimori">Топ Shikimori</a>';
                top100Li.after(shikiLi);
            }
        }
        document.querySelectorAll('.ag-random-injected').forEach(el => el.remove());

        if (!window.jtTopClickListenerBound) {
            window.jtTopClickListenerBound = true;
            // capture-фаза: срабатываем раньше скриптов меню сайта; Ctrl/Shift-клик открывает вкладку как обычно
            document.addEventListener('click', (e) => {
                const link = e.target.closest && e.target.closest('a[href="/top-shikimori"]');
                if (link && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    const path = link.getAttribute('href');
                    if (window.location.pathname !== path) {
                        if (handleNavigation(path)) {
                            history.pushState(null, '', path);
                        } else {
                            window.location.href = path;
                        }
                    }
                }
            }, true);
        }
    };

    window.jtInjectTopButtons = function (navCb) {
        injectTopButtons();
    };

    window.jtInitTopPageEnhancer = function () {
        injectTopButtons();

        window.addEventListener('popstate', () => {
            if (!handleNavigation(window.location.pathname)) {
                window.location.reload();
            }
        });

        const urlParams = new URLSearchParams(window.location.search);
        const showTopParams = urlParams.get('show_ag_top');
        if (showTopParams) {
            const targetPath = '/top-shikimori';
            history.replaceState(null, '', targetPath);
            handleNavigation(targetPath);
        } else {
            handleNavigation(window.location.pathname);
        }
    };

    window.handleRankIndexFallback = async function () {
        if (!window.location.search.includes('ag_rank=')) return;

        const urlParams = new URLSearchParams(window.location.search);
        const targetRank = parseInt(urlParams.get('ag_rank'));
        if (!targetRank || isNaN(targetRank)) return;

        const targetKind = urlParams.get('ag_kind') || '';
        const fallbackQuery = urlParams.get('ag_query') || '';

        const lockKey = `ag_rank_opened_${targetKind}_${targetRank}`;
        if (sessionStorage.getItem(lockKey)) return;
        sessionStorage.setItem(lockKey, '1');

        try {
            const shikiPage = Math.ceil(targetRank / 50);
            const indexInPage = (targetRank - 1) % 50;

            let kindParam = '';
            if (targetKind && targetKind !== 'all') {
                kindParam = `&kind=${targetKind}`;
            }

            const shikiUrl = `https://shikimori.io/api/animes?limit=50&order=ranked&page=${shikiPage}${kindParam}`;

            const shikiRes = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: "fetch_shikimori",
                    url: shikiUrl
                }, resolve);
            });

            const data = shikiRes && shikiRes.data ? shikiRes.data : [];
            const targetItem = data[indexInPage];

            let queryTitle = fallbackQuery;

            if (targetItem) {
                queryTitle = (targetItem.russian || targetItem.name || fallbackQuery).split('/')[0].split('[')[0].trim();
            }

            const form = new FormData();
            form.append('do', 'search');
            form.append('subaction', 'search');
            form.append('story', queryTitle);

            const searchRes = await fetch('/index.php?do=search', { method: 'POST', body: form });
            const text = await searchRes.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const results = Array.from(doc.querySelectorAll('.jutsu-item'));
            let bestMatchUrl = null;

            if (results.length > 0) {
                const resLink = results[0].querySelector('.jutsu-item__title a, a.jutsu-item__title') || results[0].querySelector('a');
                if (resLink) bestMatchUrl = resLink.href;
            }

            if (bestMatchUrl) {
                window.location.href = bestMatchUrl;
            } else {
                window.location.href = `/?do=search&subaction=search&story=${encodeURIComponent(queryTitle)}&ag_from=animeplus`;
            }
        } catch (err) {
            console.error("Error processing Shikimori index N fallback", err);
        }
    };

    // Автопереход со страницы поиска Jut-Su на страницу тайтла, если поиск открыло само расширение
    // (параметры ag_from / ag_russian). Раньше переход срабатывал только при ровно одном блоке выдачи,
    // а Jut-Su выводит каждую карточку дважды — переход не происходил никогда.
    window.handleJutsuSearch = async function () {
        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('story') || urlParams.get('q');
        if (!searchQuery) return;

        const fromExtension = urlParams.has('ag_from') || urlParams.has('ag_russian') || urlParams.has('ag_name');
        if (!fromExtension) return; // обычный поиск пользователя не трогаем

        // Защита от зацикливания при возврате кнопкой «Назад»
        const lockKey = `ag_search_redirect_${searchQuery}`;
        if (sessionStorage.getItem(lockKey)) return;

        const titles = [urlParams.get('ag_russian'), urlParams.get('ag_name'), searchQuery].filter(Boolean);
        const targetYear = urlParams.get('ag_year') || '';

        const collectCards = () => {
            const cards = new Map();
            document.querySelectorAll('.jutsu-item').forEach(item => {
                const link = item.querySelector('a.jutsu-item__title, .jutsu-item__title a, a[href$=".html"]');
                const href = link && link.getAttribute('href');
                if (!href || !/\.html$/.test(href) || /do=search|subaction=/.test(href)) return;
                const abs = new URL(href, location.origin).href;
                if (cards.has(abs)) return; // дубликаты карточек (две сетки в разметке)
                cards.set(abs, {
                    href: abs,
                    title: link.textContent.trim(),
                    year: (item.querySelector('.jutsu-item__subtitle')?.textContent.match(/\d{4}/) || [''])[0]
                });
            });
            return [...cards.values()];
        };

        const cards = collectCards();
        if (cards.length === 0) return;

        // Общая логика сравнения названий (modules/shared/title-match.js): текст, сезон, год
        const best = window.AgTitleMatch.pickBest(cards, { titles, year: targetYear }, { minScore: 250 });
        if (best) {
            sessionStorage.setItem(lockKey, '1');
            window.location.replace(best.href);
        }
    };
})();
