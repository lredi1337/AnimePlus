// modules/animego/ag-jutsu-search.js
// Тайтлы Shikimori, которых нет на AnimeGO, в выдаче поиска сайта. Карточка повторяет разметку самого сайта,
// а ведёт на синтетическую страницу /anime/shiki-<id> (ag-synthetic.js): там зритель сам выбирает, где смотреть

(function () {
    'use strict';

    let isRenderingJutsuSearch = false;

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

    // Оценка на постере, как у самого сайта: rating-badge positive / neutral / negative
    function ratingClass(score) {
        if (score >= 7) return 'positive';
        if (score >= 5) return 'neutral';
        return 'negative';
    }

    /** Карточка выдачи в разметке AnimeGO (снята с выдачи сайта) */
    function buildItem(item) {
        const el = (tag, cls, text) => {
            const node = document.createElement(tag);
            if (cls) node.className = cls;
            if (text) node.textContent = text;
            return node;
        };
        const title = item.russian || item.name;
        const a = el('a', 'ajax-search__item d-flex list-group-item list-group-item-action ag-shiki-item');
        a.href = `/anime/shiki-${item.id}`;
        // Синтетическую страницу строит расширение при обычной загрузке, переход силами Turbo её не покажет
        a.dataset.turbo = 'false';
        a.setAttribute('aria-selected', 'false');
        a.setAttribute('role', 'button');

        const picture = el('div', 'me-3 position-relative');
        const score = parseFloat(item.score);
        if (score > 0) picture.append(el('div', `rating-badge ${ratingClass(score)}`, score.toFixed(1)));
        const frame = el('span', 'd-block ajax-search__item-picture image__picture aspect-ratio-5-7');
        const img = el('img', 'img-fluid rounded');
        img.alt = title;
        img.referrerPolicy = 'no-referrer';
        img.src = item.poster || '';
        img.dataset.agPosterId = item.id;
        img.dataset.agPosterRu = item.russian || '';
        img.dataset.agPosterEn = item.name || '';
        frame.append(img);
        picture.append(frame);

        const body = el('div', 'ajax-search__item-body mw-0');
        body.append(el('div', 'ajax-search__item-title h5 fw-normal mb-1 text-line-clamp', title));
        if (item.name && item.name !== title) {
            const orig = el('div', 'fw-lighter small mb-2 text-line-clamp', item.name);
            orig.style.setProperty('--lines-to-show', '1');
            body.append(orig);
        }
        const meta = [getKindLabel(item.kind), item.year].filter(Boolean);
        if (meta.length) {
            const row = el('div', 'ajax-search__item-genres mb-2 d-flex gap-1');
            meta.forEach((text, i) => {
                if (i) {
                    const slash = el('span', 'fw-lighter', '/');
                    slash.setAttribute('aria-hidden', 'true');
                    row.append(slash);
                }
                const wrap = el('span');
                wrap.append(el('span', 'ajax-search__item-genres__link', text));
                row.append(wrap);
            });
            body.append(row);
        }
        if (item.genres && item.genres.length) {
            const box = el('div', 'd-none d-sm-block');
            const line = el('span', 'text-line-clamp');
            line.style.setProperty('--lines-to-show', '2');
            item.genres.forEach((genre, i) => {
                if (i) line.append(', ');
                line.append(el('span', 'ajax-search__item-genres__link', genre));
            });
            box.append(line);
            body.append(box);
        }
        a.append(picture, body);
        return a;
    }

    window.agInitJutsuSearchEnhancer = function () {
        function renderNativeJutsuItems(results, query) {
            if (isRenderingJutsuSearch || !query || query.length < 2) return;
            isRenderingJutsuSearch = true;

            try {

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

                if (!resContainer) resContainer = document.getElementById('site-search-results');
                if (!resContainer) return;

                if (resContainer.dataset.agRenderedQuery === query && resContainer.querySelector('.ag-shiki-item')) {
                    return;
                }

                const nativeItems = Array.from(resContainer.querySelectorAll('.ajax-search__item:not(.ag-shiki-item)'));

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

                resContainer.querySelectorAll('.ag-shiki-item').forEach(el => el.remove());

                const newJutsuElements = [];
                if (results && results.length > 0) {
                    results.forEach(item => {
                        if (isDuplicateAnime(item, existingAnimeTitles)) {
                            return;
                        }

                        if (item.russian) existingAnimeTitles.push(item.russian);
                        if (item.name) existingAnimeTitles.push(item.name);

                        if (!item.id) return;
                        const a = buildItem(item);
                        newJutsuElements.push({ element: a, score: calculateRelevanceScore(query, item.russian, item.name) });
                    });
                }

                newJutsuElements.sort((a, b) => b.score - a.score);
                // Постер без картинки у Shikimori: настоящий постер подставит общий механизм (ui-utils.js)
                if (window.agBindPostersIn) newJutsuElements.forEach(({ element }) => window.agBindPostersIn(element));

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
                            break;
                        }
                    }

                    if (!inserted) {
                        resContainer.appendChild(el);
                    }
                });

                // Счётчик «Аниме N» над выдачей учитывает и наши карточки. Сайт пересоздаёт выдачу при каждом вводе,
                // поэтому число сайта запоминаем в самом счётчике
                const counter = resContainer.parentElement && resContainer.parentElement.querySelector('h4 .badge');
                if (counter) {
                    if (!counter.dataset.agNative) counter.dataset.agNative = counter.textContent.trim();
                    const native = parseInt(counter.dataset.agNative, 10);
                    if (!isNaN(native)) counter.textContent = String(native + newJutsuElements.length);
                }

                resContainer.dataset.agRenderedQuery = query;
            } catch (e) {
                console.error("Error rendering Jut-su search items:", e);
            } finally {
                isRenderingJutsuSearch = false;
            }
        }

        // Сайт строит выдачу по запросу и пересоздаёт её при каждом вводе: дорисовываем свои пункты после него
        let lastSearch = null;
        let redrawTimer = null;
        const watchSiteResults = () => {
            new MutationObserver(() => {
                if (!lastSearch || redrawTimer) return;
                redrawTimer = setTimeout(() => {
                    redrawTimer = null;
                    if (lastSearch) renderNativeJutsuItems(lastSearch.results, lastSearch.query);
                }, 100);
            }).observe(document.getElementById('site-search-results') || document.body, { childList: true, subtree: true });
        };

        const handleSearchInput = (inputEl) => {
            if (!inputEl || inputEl.dataset.agJutsuAttached) return;
            inputEl.dataset.agJutsuAttached = 'true';

            let searchTimeout = null;

            inputEl.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                clearTimeout(searchTimeout);
                lastSearch = null;

                if (query.length < 2) return;

                searchTimeout = setTimeout(() => {
                    chrome.runtime.sendMessage({
                        action: "search_shikimori_anime",
                        query: query
                    }, (res) => {
                        // Пока ждали ответ, зритель мог ввести что-то ещё
                        if (inputEl.value.trim() !== query) return;
                        const results = res && res.results ? res.results : [];
                        lastSearch = { results, query };
                        renderNativeJutsuItems(results, query);
                    });
                }, 250);
            });
        };

        const searchInputs = document.querySelectorAll('input[type="search"], input[name="q"], .header-search input, .navbar-search input');
        searchInputs.forEach(handleSearchInput);
        if (searchInputs.length) watchSiteResults();

        return { renderNativeJutsuItems, handleSearchInput };
    };
})();
