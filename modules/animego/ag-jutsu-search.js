// modules/animego/ag-jutsu-search.js
// Модуль интеграции нативного поиска Jut-Su в поисковую выдачу AnimeGO

(function () {
    'use strict';

    let lastJutsuResults = null;
    let lastJutsuQuery = '';
    let isRenderingJutsuSearch = false;

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    function cleanTitleForCompare(str) {
        if (!str) return '';
        return String(str).toLowerCase()
                  .replace(/\(\s*tv[^)]*\)/gi, '')
                  .replace(/[:.,\-\—!?]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
    }

    function isDuplicateAnime(item, existingAnimeTitles) {
        if (!existingAnimeTitles || existingAnimeTitles.length === 0) return false;

        const ruClean = cleanTitleForCompare(item.russian);
        const origClean = cleanTitleForCompare(item.name);

        for (const existingStr of existingAnimeTitles) {
            const existClean = cleanTitleForCompare(existingStr);
            if (!existClean || existClean.length < 3) continue;

            if (ruClean && ruClean === existClean) return true;
            if (origClean && origClean === existClean) return true;

            if (ruClean && ruClean.length >= 8 && existClean.length >= 8) {
                if (ruClean === existClean || existClean.includes(ruClean) || ruClean.includes(existClean)) return true;
            }
            if (origClean && origClean.length >= 8 && existClean.length >= 8) {
                if (origClean === existClean || existClean.includes(origClean) || origClean.includes(existClean)) return true;
            }
        }

        return false;
    }

    function getKindLabel(kind) {
        if (!kind) return '';
        const k = String(kind).toUpperCase();
        if (k === 'TV') return 'Сериал';
        if (k === 'MOVIE') return 'Фильм';
        if (k === 'OVA') return 'OVA';
        if (k === 'ONA') return 'ONA';
        if (k === 'SPECIAL' || k === 'TV_SPECIAL') return 'Спецвыпуск';
        if (k === 'MUSIC') return 'Клип';
        return kind;
    }

    function calculateRelevanceScore(queryStr, itemTitleStr, itemOrigStr) {
        if (!queryStr) return 0;
        const clean = (s) => String(s || '').toLowerCase().replace(/[:.,\-\—!?()]/g, ' ').replace(/\s+/g, ' ').trim();

        const q = clean(queryStr);
        const t = clean(itemTitleStr);
        const o = clean(itemOrigStr);

        if (!q || (!t && !o)) return 0;

        if (t === q || o === q) return 1000;
        if (t.startsWith(q) || o.startsWith(q)) return 850;
        if (q.startsWith(t) || q.startsWith(o)) return 700;
        if (t.includes(q) || o.includes(q)) return 600;

        const qWords = q.split(' ').filter(w => w.length > 1);
        if (qWords.length > 0) {
            let tMatched = 0;
            let oMatched = 0;

            qWords.forEach(w => {
                if (t.includes(w)) tMatched++;
                if (o.includes(w)) oMatched++;
            });

            const bestMatchCount = Math.max(tMatched, oMatched);
            const wordRatio = bestMatchCount / qWords.length;
            if (wordRatio > 0) {
                return 200 + Math.round(wordRatio * 300);
            }
        }

        return 0;
    }

    const AG_NO_POSTER_SVG = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="252" viewBox="0 0 180 252">
  <rect width="100%" height="100%" fill="#1a1e29"/>
  <rect x="2" y="2" width="176" height="248" rx="6" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="2"/>
  <text x="50%" y="46%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="sans-serif" font-size="32">🎬</text>
  <text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="#475569" font-family="sans-serif" font-size="11" font-weight="600" letter-spacing="1">НЕТ ОБЛОЖКИ</text>
</svg>
`);

    window.agInitJutsuSearchEnhancer = function (mainObserver) {
        function renderNativeJutsuItems(results, query) {
            if (isRenderingJutsuSearch || !query || query.length < 2) return;
            isRenderingJutsuSearch = true;

            try {
                lastJutsuResults = results;
                lastJutsuQuery = query;

                let resContainer = document.querySelector('.navbar_search-list') ||
                                   document.querySelector('.js-search-result') ||
                                   document.querySelector('.search-result') ||
                                   document.querySelector('.js-search-results') ||
                                   document.querySelector('.header-search-results') ||
                                   document.querySelector('.search-results');

                if (!resContainer) {
                    const modalBody = document.querySelector('.modal-body') || document.querySelector('#search-modal');
                    if (modalBody) {
                        resContainer = modalBody.querySelector('.navbar_search-list, .js-search-result, .search-result, .js-search-results, .search-results, .list-group');
                    }
                }

                if (!resContainer) return;

                if (resContainer.dataset.agRenderedQuery === query && resContainer.querySelector('.ag-jutsu-item')) {
                    return;
                }

                if (mainObserver) mainObserver.disconnect();

                const nativeItems = Array.from(resContainer.querySelectorAll('.ajax-search__item:not(.ag-jutsu-item)'));

                const existingAnimeTitles = [];
                nativeItems.forEach(el => {
                    const titleEl = el.querySelector('.ajax-search__item-title') || el;
                    if (titleEl && titleEl.textContent) {
                        existingAnimeTitles.push(titleEl.textContent);
                    }
                    const origEl = el.querySelector('.fw-lighter.small');
                    if (origEl && origEl.textContent) {
                        existingAnimeTitles.push(origEl.textContent);
                    }
                });

                resContainer.querySelectorAll('.ag-jutsu-item').forEach(el => el.remove());

                const newJutsuElements = [];
                if (results && results.length > 0) {
                    results.forEach(item => {
                        if (isDuplicateAnime(item, existingAnimeTitles)) {
                            return;
                        }

                        if (item.russian) existingAnimeTitles.push(item.russian);
                        if (item.name) existingAnimeTitles.push(item.name);

                        const titleStr = escapeHtml(item.russian || item.name);
                        const origStr = item.name ? escapeHtml(item.name) : '';
                        let posterUrl = item.poster || '';
                        if (!posterUrl || posterUrl.includes('missing') || posterUrl.includes('404') || posterUrl.includes('assets/globals') || posterUrl.includes('no-image') || posterUrl.includes('stub') || posterUrl.includes('no-poster')) {
                            posterUrl = AG_NO_POSTER_SVG;
                        }
                        const yearStr = item.year ? `${item.year}` : '';
                        const kindLabel = getKindLabel(item.kind);

                        let scoreFormatted = '';
                        let scoreClass = 'positive';
                        if (item.score) {
                            const num = parseFloat(item.score);
                            if (!isNaN(num) && num > 0) {
                                scoreFormatted = num.toFixed(1);
                                if (num < 6.0) scoreClass = 'negative';
                                else if (num < 7.5) scoreClass = 'neutral';
                                else scoreClass = 'positive';
                            }
                        }

                        const a = document.createElement('a');
                        a.className = 'ajax-search__item d-flex list-group-item list-group-item-action ag-jutsu-item';
                        a.href = item.jutsuUrl;
                        a.target = '_blank';
                        a.title = `Смотреть ${titleStr} на Jut.su`;
                        a.setAttribute('aria-selected', 'false');
                        a.setAttribute('role', 'button');
                        a.dataset.agJutsu = '1';
                        a.dataset.agRussian = item.russian || '';
                        a.dataset.agName = item.name || '';
                        a.dataset.agYear = item.year || '';
                        a.dataset.agKind = item.kind || '';

                        a.addEventListener('click', async (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            let targetUrl = item.jutsuUrl || a.href;
                            if (targetUrl && !targetUrl.includes('do=search') && !targetUrl.includes('subaction=')) {
                                window.open(targetUrl, '_blank');
                                return;
                            }

                            const russian = a.dataset.agRussian || item.russian || '';
                            const name = a.dataset.agName || item.name || '';
                            const year = a.dataset.agYear || item.year || '';
                            const kind = a.dataset.agKind || item.kind || '';
                            const searchQuery = russian || name;
                            const fallbackUrl = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(searchQuery)}&ag_russian=${encodeURIComponent(russian)}&ag_name=${encodeURIComponent(name)}&ag_year=${encodeURIComponent(year)}&ag_kind=${encodeURIComponent(kind)}`;

                            try {
                                const res = await new Promise((resolve) => {
                                    const timer = setTimeout(() => resolve(null), 250);
                                    chrome.runtime.sendMessage({
                                        action: "resolve_direct_jutsu_url",
                                        russian, name, year, kind, fallbackUrl
                                    }, (resp) => {
                                        clearTimeout(timer);
                                        resolve(resp);
                                    });
                                });

                                if (res && res.url) {
                                    window.open(res.url, '_blank');
                                } else {
                                    window.open(fallbackUrl, '_blank');
                                }
                            } catch (err) {
                                window.open(fallbackUrl, '_blank');
                            }
                        });

                        a.innerHTML = `
                            <div class="flex-shrink-0 me-3 position-relative">
                                <img class="rounded" src="${posterUrl}" alt="${titleStr}" style="width: 48px; height: 68px; object-fit: cover;" onerror="if(!this.src.includes('data:image')) this.src='${AG_NO_POSTER_SVG}';">
                            </div>
                            <div class="flex-grow-1 min-w-0 d-flex flex-column justify-content-center me-2">
                                <div class="ajax-search__item-title text-truncate fw-bold color-main">${titleStr}</div>
                                ${origStr ? `<div class="fw-lighter small text-truncate text-secondary mb-1">${origStr}</div>` : ''}
                                <div class="d-flex align-items-center gap-2 flex-wrap">
                                    <span class="badge ag-badge-jutsu">JUT-SU</span>
                                    ${kindLabel ? `<span class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25">${kindLabel}</span>` : ''}
                                    ${yearStr ? `<span class="badge bg-secondary bg-opacity-25 text-secondary border border-secondary border-opacity-25">${yearStr}</span>` : ''}
                                </div>
                            </div>
                            ${scoreFormatted ? `<div class="flex-shrink-0 d-flex align-items-center"><span class="ag-rating-badge ag-rating-badge--${scoreClass}">★ ${scoreFormatted}</span></div>` : ''}
                        `;

                        newJutsuElements.push({ element: a, score: calculateRelevanceScore(query, item.russian, item.name) });
                    });
                }

                newJutsuElements.sort((a, b) => b.score - a.score);

                let insertedCount = 0;
                newJutsuElements.forEach(itemObj => {
                    const el = itemObj.element;
                    const itemScore = itemObj.score;

                    let inserted = false;
                    for (let i = 0; i < nativeItems.length; i++) {
                        const natEl = nativeItems[i];
                        const natTitle = (natEl.querySelector('.ajax-search__item-title') || natEl).textContent;
                        const natOrig = natEl.querySelector('.fw-lighter.small')?.textContent || '';
                        const natScore = calculateRelevanceScore(query, natTitle, natOrig);

                        if (itemScore > natScore) {
                            resContainer.insertBefore(el, natEl);
                            inserted = true;
                            insertedCount++;
                            break;
                        }
                    }

                    if (!inserted) {
                        resContainer.appendChild(el);
                        insertedCount++;
                    }
                });

                resContainer.dataset.agRenderedQuery = query;
            } catch (e) {
                console.error("Error rendering Jut-su search items:", e);
            } finally {
                isRenderingJutsuSearch = false;
                if (mainObserver && document.body) {
                    mainObserver.observe(document.body, { childList: true, subtree: true });
                }
            }
        }

        const handleSearchInput = (inputEl) => {
            if (!inputEl || inputEl.dataset.agJutsuAttached) return;
            inputEl.dataset.agJutsuAttached = 'true';

            let searchTimeout = null;

            inputEl.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                clearTimeout(searchTimeout);

                if (query.length < 2) return;

                searchTimeout = setTimeout(() => {
                    chrome.runtime.sendMessage({
                        action: "search_shikimori_anime",
                        query: query
                    }, (res) => {
                        const results = res && res.results ? res.results : [];
                        renderNativeJutsuItems(results, query);
                    });
                }, 250);
            });
        };

        const searchInputs = document.querySelectorAll('input[type="search"], input[name="q"], .header-search input, .navbar-search input');
        searchInputs.forEach(handleSearchInput);

        return { renderNativeJutsuItems, handleSearchInput };
    };
})();
