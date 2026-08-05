// modules/jutsu/jt-top.js
// Движок страницы «ТОП-100 по версии Shikimori» и переадресатор на Jut-Su

(function () {
    'use strict';

    let topCurrentType = 'shikimori';
    let topCurrentKind = '';
    let topCurrentPage = 1;
    let topIsLoading = false;

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

    const fetchFallbackCover = async (title) => {
        if (!title) return null;
        try {
            const searchResponse = await new Promise((resolve) => {
                try {
                    chrome.runtime.sendMessage({
                        action: "fetch_shikimori",
                        url: `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=1`
                    }, (response) => {
                        if (chrome.runtime.lastError) resolve(null);
                        else resolve(response);
                    });
                } catch (err) {
                    resolve(null);
                }
            });
            const resJson = searchResponse && searchResponse.data ? searchResponse.data : {};
            if (resJson.data && resJson.data[0] && resJson.data[0].attributes && resJson.data[0].attributes.posterImage) {
                return resJson.data[0].attributes.posterImage.original || resJson.data[0].attributes.posterImage.medium;
            }
        } catch (e) {
            console.error("Error fetching fallback cover:", e);
        }
        return null;
    };

    let coverResolveQueue = [];
    let isResolvingCovers = false;

    const startCoverResolver = () => {
        if (isResolvingCovers || coverResolveQueue.length === 0) return;
        isResolvingCovers = true;

        const processNext = async () => {
            if (coverResolveQueue.length === 0) {
                isResolvingCovers = false;
                return;
            }
            const query = coverResolveQueue.shift();
            try {
                const form = new FormData();
                form.append('do', 'search');
                form.append('subaction', 'search');
                form.append('story', query);

                const res = await fetch('/index.php?do=search', { method: 'POST', body: form });
                const text = await res.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');
                const firstItem = doc.querySelector('.jutsu-item');
                if (firstItem) {
                    const imgEl = firstItem.querySelector('.jutsu-item__img img');
                    if (imgEl) {
                        let coverUrl = imgEl.getAttribute('src');
                        if (coverUrl) {
                            chrome.storage.local.get(['ag_native_covers'], (res) => {
                                const cache = res.ag_native_covers || {};
                                cache[query.toLowerCase()] = coverUrl;
                                chrome.storage.local.set({ ag_native_covers: cache });
                            });
                            const docImgs = document.querySelectorAll(`img[data-ag-title="${query.toLowerCase()}"]`);
                            docImgs.forEach(img => {
                                img.src = coverUrl;
                            });
                        }
                    }
                }
            } catch (err) {
                console.error("Error resolving cover for:", query, err);
            }
            setTimeout(processNext, 300);
        };

        processNext();
    };

    const renderAnimeCard = (anime, rank, nativeCovers) => {
        const title = anime.russian || anime.name;
        const score = anime.score || '?';
        const year = anime.aired_on ? anime.aired_on.split('-')[0] : '';
        const type = anime.kind ? anime.kind.toUpperCase() : 'TV';
        const episodesText = anime.episodes ? (anime.episodes + ' эп.') : type;

        const queryTitle = title.split('/')[0].split('[')[0].trim();
        let rawPoster = cachedCover || anime.ag_resolved_poster || (anime.image ? (anime.image.original || anime.image.preview) : '');
        let posterUrl = (window.agNormalizePosterUrl && rawPoster) ? window.agNormalizePosterUrl(rawPoster) : rawPoster;

        if (!cachedCover) {
            if (!coverResolveQueue.includes(queryTitle)) {
                coverResolveQueue.push(queryTitle);
            }
        }

        const safeTitleStr = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeRuStr = (anime.russian || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeEnStr = (anime.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        return `
            <div class="jutsu-item jutsu-item--short p-relative cd-exp-link grid-item has-overlay-on-img" style="cursor: pointer;">
                <div class="jutsu-item__img cd-img ar-2-3 icon icon-play has-overlay-on-img__trg">
                    <img src="${posterUrl}" alt="${title}" loading="lazy" data-ag-title="${queryTitle.toLowerCase()}" onerror="if(window.agHandlePosterError) window.agHandlePosterError(this, '${safeTitleStr}', ${anime.id || 'null'}, '${safeRuStr}', '${safeEnStr}');">
                </div>
                <div class="jutsu-item__desc">
                    <a class="jutsu-item__title cd-exp-link__trg ag-top-link" href="#" data-query="${queryTitle}" data-orig="${anime.name || ''}" data-year="${year}" data-type="${type}">${title}</a>
                </div>
                <div class="jutsu-item__meta ar-2-3 d-flex fd-column jc-space-between ai-flex-start">
                    <div class="jutsu-item__label jutsu-item__label-rating cd-flex jc-center">★ ${score}</div>
                    <div class="jutsu-item__label jutsu-item__label-series cd-flex">${episodesText}</div>
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
                    fallbackUrl: `/?do=search&subaction=search&story=${encodeURIComponent(query)}`
                }, (res) => {
                    if (res && res.url) {
                        window.location.href = res.url;
                    } else {
                        window.location.href = `/?do=search&subaction=search&story=${encodeURIComponent(query)}`;
                    }
                });
            });
        });
    };

    const resolveFallbackCoversAsync = (items) => {
        items.forEach(async (item) => {
            let pUrl = item.image ? ('https://shikimori.io' + (item.image.preview || item.image.original || '')) : '';
            const isPlaceholder = !pUrl || pUrl.includes('/assets/') || pUrl.includes('missing') || pUrl.includes('404');
            if (isPlaceholder) {
                chrome.runtime.sendMessage({
                    action: "resolve_jutsu_cover",
                    id: item.id,
                    russian: item.russian || item.name,
                    name: item.name
                }, (res) => {
                    const realUrl = res ? (res.poster || res.url) : null;
                    if (realUrl) {
                        item.ag_resolved_poster = realUrl;
                        const queryTitle = (item.russian || item.name || '').split('/')[0].split('[')[0].trim();
                        const imgs = document.querySelectorAll(`img[data-ag-title="${queryTitle.toLowerCase()}"]`);
                        imgs.forEach(img => {
                            img.src = realUrl;
                        });
                    }
                });
            }
        });
    };

    const loadTopPage = async (container) => {
        if (topIsLoading) return;
        topIsLoading = true;

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
                    topCurrentPage = 1;
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
                        url: `https://shikimori.one/api/animes?limit=50&order=ranked&page=1${kindParam}`
                    }, (response) => {
                        if (chrome.runtime.lastError) resolve(null);
                        else resolve(response);
                    });
                } catch (err) {
                    resolve(null);
                }
            });

            const data1 = shikiResponse1 && shikiResponse1.data ? shikiResponse1.data : [];
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
            resolveFallbackCoversAsync(data1);
            startCoverResolver();

            if (data1.length === 50) {
                chrome.runtime.sendMessage({
                    action: "fetch_shikimori",
                    url: `https://shikimori.one/api/animes?limit=50&order=ranked&page=2${kindParam}`
                }, (shikiResponse2) => {
                    const data2 = shikiResponse2 && shikiResponse2.data ? shikiResponse2.data : [];
                    if (data2 && data2.length > 0 && grid) {
                        renderCardBatch(data2, 50, grid, nativeCovers);
                        resolveFallbackCoversAsync(data2);
                        startCoverResolver();
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
        } finally {
            topIsLoading = false;
        }
    };

    const handleNavigation = (urlPath) => {
        if (urlPath === '/top-shikimori') {
            topCurrentType = 'shikimori';
            topCurrentPage = 1;

            const contentContainer = document.querySelector('.jutsu-content');
            if (!contentContainer) {
                window.location.replace('/?show_ag_top=' + topCurrentType);
                return true;
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
            document.body.addEventListener('click', (e) => {
                const link = e.target.closest('a[href="/top-shikimori"]');
                if (link) {
                    e.preventDefault();
                    const path = link.getAttribute('href');
                    if (window.location.pathname !== path) {
                        if (handleNavigation(path)) {
                            history.pushState(null, '', path);
                        } else {
                            window.location.href = path;
                        }
                    }
                }
            });
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
        const targetYear = urlParams.get('ag_year') || '';

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

            const shikiUrl = `https://shikimori.one/api/animes?limit=50&order=ranked&page=${shikiPage}${kindParam}`;

            const shikiRes = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: "fetch_shikimori",
                    url: shikiUrl
                }, resolve);
            });

            const data = shikiRes && shikiRes.data ? shikiRes.data : [];
            const targetItem = data[indexInPage];

            let queryTitle = fallbackQuery;
            let itemYear = targetYear;

            if (targetItem) {
                queryTitle = (targetItem.russian || targetItem.name || fallbackQuery).split('/')[0].split('[')[0].trim();
                itemYear = targetItem.aired_on ? targetItem.aired_on.split('-')[0] : targetYear;
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
                window.location.href = `/?do=search&subaction=search&story=${encodeURIComponent(queryTitle)}`;
            }
        } catch (err) {
            console.error("Error processing Shikimori index N fallback", err);
        }
    };

    window.handleJutsuSearch = async function () {
        if (!window.location.search.includes('story=') && !window.location.search.includes('do=search') && !window.location.pathname.includes('/search')) return;

        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('story') || urlParams.get('q');
        if (!searchQuery) return;

        const agRussian = urlParams.get('ag_russian') || searchQuery;
        const agName = urlParams.get('ag_name') || '';
        const agYear = urlParams.get('ag_year') || '';

        const getCandidatesFromDoc = (doc) => {
            const candidates = [];
            const blocks = Array.from(doc.querySelectorAll('.all_anime_global, .all_anime_content, .jutsu-item, .short-story, .b-card, div[class*="all_anime"]'));
            for (const block of blocks) {
                const linkEl = block.querySelector('a.all_anime_title, .all_anime_title a, .jutsu-item__title a, a.jutsu-item__title, a.short-link') || block.querySelector('a[href]');
                if (!linkEl) continue;

                let href = linkEl.getAttribute('href') || '';
                if (!href || href.includes('privacy') || href.includes('rules') || href.includes('user/') || href.includes('do=search') || href.includes('subaction=')) continue;
                if (href.startsWith('/')) href = 'https://jut-su.net' + href;

                const titleText = linkEl.textContent.trim();
                candidates.push({ titleText, href });
            }
            return candidates;
        };

        const candidates = getCandidatesFromDoc(document);
        if (candidates.length === 1) {
            window.location.replace(candidates[0].href);
        }
    };
})();
