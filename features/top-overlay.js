// features/top-overlay.js
// «Топ Shikimori»: пункт в меню сайта + модальное окно поверх страницы. Весь рейтинг Shikimori подгружается по мере прокрутки.
// Окно не зависит от вёрстки сайта (собственная разметка и стили), поэтому одинаково работает на всех сайтах.
// Клик по карточке: тайтл на текущем сайте (resolve_site_url по ID Shikimori) → иначе выбор других сайтов.

(function () {
    'use strict';

    const STYLE_ID = 'ag-top-overlay-style';
    const PAGE_SIZE = 50;
    const NUMBERED_RANKS = 100;
    // Только быстрый переход по рейтингу: это всё ещё Топ, а не поиск с фильтрами
    const SCORE_BANDS = [
        { id: '', label: 'Все', min: 1 },
        { id: '9', label: '9+', min: 9 },
        { id: '8', label: '8–9', min: 8, below: 9 },
        { id: '7', label: '7–8', min: 7, below: 8 },
        { id: '6', label: '6–7', min: 6, below: 7 },
        { id: '1', label: 'Ниже 6', min: 1, below: 6 }
    ];
    // Страниц рейтинга с оценкой сейчас около 400; запас — для поиска начала диапазона делением пополам
    const MAX_RANK_PAGE = 512;
    const PROBE_INTERVAL_MS = 220; // лимит Shikimori — 5 запросов в секунду
    const START_PAGES_KEY = 'ag_top_band_pages';
    const START_PAGE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
    const KINDS = [['', 'Все'], ['tv', 'Сериалы'], ['movie', 'Фильмы'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешлы']];

    const injectStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .ag-top-ov, .ag-top-ov * { box-sizing: border-box !important; }
            .ag-top-ov button {
                all: unset;
                box-sizing: border-box !important;
                font-family: inherit !important;
                cursor: pointer !important;
            }
            .ag-top-ov { position: fixed !important; inset: 0 !important; z-index: 2147483000 !important; background: var(--ap-scrim) !important; 
                display: flex !important; justify-content: center !important; align-items: center !important; padding: 32px 16px !important; overflow: hidden !important; font-family: var(--ap-font) !important; }
            .ag-top-ov__panel { position: relative !important; display: flex !important; flex-direction: column !important; width: min(1100px, 100%) !important; height: 100% !important; overflow: hidden !important; background: var(--ap-surface) !important; border: 1px solid var(--ap-hover) !important; border-radius: var(--ap-radius-lg) !important; padding: 0 !important; color: var(--ap-text) !important; box-shadow: 0 24px 64px rgba(0,0,0,.5) !important; }
            .ag-top-ov__bar { flex-shrink: 0 !important; padding: 20px 20px 14px !important; border-bottom: 1px solid var(--ap-line) !important; }
            .ag-top-ov__scroll { flex: 1 1 auto !important; min-height: 0 !important; overflow-y: auto !important; padding: 16px 20px 20px !important; scrollbar-width: thin !important; scrollbar-color: var(--ap-line-strong) transparent !important; }
            .ag-top-ov__head { display: flex !important; align-items: center !important; gap: 12px !important; margin-bottom: 14px !important; }
            .ag-top-ov__head h2 { display: flex !important; align-items: center !important; gap: 10px !important; margin: 0 !important; font-size: 20px !important; font-weight: 700 !important; color: #fff !important; }
            .ag-top-ov__close {
                all: unset !important;
                box-sizing: border-box !important;
                margin-left: auto !important;
                width: 36px !important;
                height: 36px !important;
                min-width: 36px !important;
                min-height: 36px !important;
                max-width: 36px !important;
                max-height: 36px !important;
                padding: 0 !important;
                line-height: 34px !important;
                text-align: center !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: var(--ap-radius) !important;
                border: 1px solid var(--ap-line) !important;
                background: transparent !important;
                background-color: transparent !important;
                color: #fff !important;
                font-size: 16px !important;
                cursor: pointer !important;
                box-shadow: none !important;
                text-transform: none !important;
            }
            .ag-top-ov__close:hover {
                background: var(--ap-hover) !important;
                background-color: var(--ap-hover) !important;
                color: #fff !important;
                border-color: var(--ap-line-strong) !important;
                box-shadow: none !important;
            }
            .ag-top-ov__tabs { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; margin-bottom: 0 !important; padding: 0 !important; background: none !important; }
            .ag-top-ov__tab {
                all: unset !important;
                box-sizing: border-box !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                height: auto !important;
                min-height: 28px !important;
                max-height: none !important;
                line-height: normal !important;
                padding: 6px 14px !important;
                border-radius: var(--ap-radius-sm) !important;
                border: 1px solid var(--ap-line) !important;
                background: transparent !important;
                background-color: transparent !important;
                color: var(--ap-text-2) !important;
                font: 600 12px var(--ap-font) !important;
                text-transform: none !important;
                white-space: nowrap !important;
                cursor: pointer !important;
                box-shadow: none !important;
            }
            .ag-top-ov__tab:hover {
                color: #fff !important;
                border-color: var(--ap-line-strong) !important;
                background: var(--ap-hover) !important;
                background-color: var(--ap-hover) !important;
                box-shadow: none !important;
            }
            .ag-top-ov__tab[aria-pressed="true"] {
                background: var(--ap-accent) !important;
                background-color: var(--ap-accent) !important;
                border-color: var(--ap-accent) !important;
                color: var(--ap-on-accent) !important;
                box-shadow: none !important;
            }
            .ag-top-ov__scores { display: flex !important; flex-wrap: wrap !important; align-items: center !important; gap: 4px !important; margin-top: 10px !important; }
            .ag-top-ov__scores-label { margin-right: 6px !important; font-size: var(--ap-fs-sm) !important; color: var(--ap-text-3) !important; }
            .ag-top-ov .ag-top-ov__tab--score { min-height: 24px !important; padding: 3px 9px !important; font-size: var(--ap-fs-sm) !important; font-weight: 500 !important; border-color: transparent !important; }
            .ag-top-ov .ag-top-ov__tab--score:hover { border-color: transparent !important; }
            .ag-top-ov .ag-top-ov__tab--score[aria-pressed="true"] { background: var(--ap-raised) !important; background-color: var(--ap-raised) !important; border-color: var(--ap-line-strong) !important; color: var(--ap-text) !important; }
            .ag-top-ov__grid { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)) !important; gap: 14px !important; width: 100% !important; padding: 0 !important; margin: 0 !important; }
            .ag-top-ov__card {
                content-visibility: auto !important;
                contain-intrinsic-size: auto 290px !important;
                position: relative !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 6px !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                line-height: normal !important;
                padding: 0 !important;
                margin: 0 !important;
                border: 0 !important;
                border-radius: 0 !important;
                background: none !important;
                background-color: transparent !important;
                box-shadow: none !important;
                color: inherit !important;
                text-align: left !important;
                text-transform: none !important;
                white-space: normal !important;
                cursor: pointer !important;
                font: inherit !important;
            }
            .ag-top-ov__card:hover {
                background: none !important;
                background-color: transparent !important;
                box-shadow: none !important;
            }
            .ag-top-ov__poster { position: relative !important; width: 100% !important; aspect-ratio: 5 / 7 !important; border-radius: var(--ap-radius) !important; overflow: hidden !important; background: var(--ap-raised) !important; box-shadow: none !important; }
            .ag-top-ov__poster img { width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; object-fit: cover !important; display: block !important; transition: transform .2s !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
            .ag-top-ov__poster img.ag-poster-placeholder { object-fit: contain !important; padding: 22% !important; opacity: .6 !important; }
            .ag-top-ov__card:hover img { transform: scale(1.04) !important; }
            .ag-top-ov__rank, .ag-top-ov__score { position: absolute !important; padding: 2px 7px !important; border-radius: 6px !important; font-size: 11px !important; font-weight: 700 !important; color: #fff !important; line-height: normal !important; height: auto !important; white-space: nowrap !important; text-transform: none !important; box-shadow: none !important; }
            .ag-top-ov__rank { top: 6px !important; left: 6px !important; background: rgba(0,0,0,.65) !important; }
            .ag-top-ov__score { bottom: 6px !important; right: 6px !important; background: rgba(0,0,0,.72) !important; color: var(--ap-warning) !important; }
            .ag-top-ov__title { font-size: 13px !important; font-weight: 600 !important; line-height: 1.3 !important; color: var(--ap-text) !important; text-transform: none !important; white-space: normal !important; display: -webkit-box !important; -webkit-line-clamp: 2 !important; -webkit-box-orient: vertical !important; overflow: hidden !important; }
            .ag-top-ov__meta { font-size: 11px !important; line-height: 1.3 !important; color: var(--ap-text-3) !important; text-transform: none !important; white-space: normal !important; }
            .ag-top-ov__busy { position: absolute !important; inset: 0 !important; display: grid !important; place-items: center !important; background: rgba(0,0,0,.6) !important; font-size: 12px !important; font-weight: 700 !important; border-radius: var(--ap-radius) !important; color: #fff !important; box-shadow: none !important; text-transform: none !important; }
            .ag-top-ov__choices { position: absolute !important; inset: auto 0 0 0 !important; padding: 6px !important; display: flex !important; flex-direction: column !important; gap: 4px !important; background: rgba(12,12,18,.95) !important; border-radius: 0 0 10px 10px !important; }
            .ag-top-ov__choices a { padding: 5px 8px !important; border-radius: 6px !important; background: rgba(255,255,255,.06) !important; color: #fff !important; font-size: 11px !important; font-weight: 700 !important; text-decoration: none !important; display: block !important; text-transform: none !important; line-height: normal !important; box-shadow: none !important; }
            .ag-top-ov__choices a:hover { background: rgba(255,255,255,.14) !important; color: #fff !important; }
            .ag-top-ov__note { padding: 28px 0 8px !important; text-align: center !important; font-size: var(--ap-fs-md) !important; color: var(--ap-text-3) !important; }
            .ag-top-ov__note:empty { display: none !important; }
            .ag-top-ov .ag-top-ov__retry { display: inline-block !important; margin-left: 8px !important; color: var(--ap-accent) !important; font-weight: 600 !important; text-decoration: underline !important; }
            .ag-top-nav-link { cursor: pointer; }
        `;
        (document.head || document.documentElement).appendChild(style);
    };

    const h = (tag, attrs = {}, ...children) => {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'style') node.style.cssText = v;
            else if (v !== false && v != null) node.setAttribute(k, v);
        });
        children.flat().forEach(c => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
        return node;
    };

    // Одна страница рейтинга или null при ошибке. score — нижняя граница оценки; порядок и номера страниц
    // от неё не меняются, а тайтлы без оценки (они в самом конце) отсекаются всегда
    const fetchTopPage = async (kind, page, minScore = 1) => {
        const kindParam = kind ? `&kind=${kind}` : '';
        const res = await window.agSendMessage({
            action: 'fetch_shikimori',
            url: `https://shikimori.io/api/animes?limit=${PAGE_SIZE}&order=ranked&score=${minScore}&page=${page}${kindParam}`
        });
        return res && Array.isArray(res.data) ? res.data : null;
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // У Shikimori нет фильтра «оценка до»: ищем страницу, где оценка впервые опускается ниже границы.
    // Возвращает номер страницы или null при ошибке; isStale — окно закрыли или выбрали другой диапазон.
    // Поиск занимает несколько секунд, а рейтинг меняется медленно, поэтому результат запоминаем
    const findStartPage = async (kind, band, isStale) => {
        const key = `${kind}|${band.id}`;
        const { [START_PAGES_KEY]: saved = {} } = await chrome.storage.local.get([START_PAGES_KEY]);
        const known = saved[key];
        // Страницей раньше: за это время граница могла сдвинуться, а лишнее отсеется по оценке
        if (known && Date.now() - known.ts < START_PAGE_TTL_MS) return Math.max(1, known.page - 1);

        let lo = 1;
        let hi = MAX_RANK_PAGE;
        while (lo < hi) {
            const startedAt = Date.now();
            const mid = Math.floor((lo + hi) / 2);
            const items = await fetchTopPage(kind, mid, band.min);
            if (isStale() || !items) return null;
            if (items.length === 0 || parseFloat(items[items.length - 1].score) < band.below) hi = mid;
            else lo = mid + 1;
            if (lo < hi) await sleep(PROBE_INTERVAL_MS - (Date.now() - startedAt));
            if (isStale()) return null;
        }
        const { [START_PAGES_KEY]: fresh = {} } = await chrome.storage.local.get([START_PAGES_KEY]);
        await chrome.storage.local.set({ [START_PAGES_KEY]: { ...fresh, [key]: { page: lo, ts: Date.now() } } });
        return lo;
    };

    function openOverlay({ site, settings, provider }) {
        if (document.querySelector('.ag-top-ov')) return;
        injectStyle();

        let kind = '';
        let renderToken = 0;
        let band = SCORE_BANDS[0];
        let page = 0;
        let hasMore = true;
        let loading = false;
        let shownIds = new Set();
        const grid = h('div', { class: 'ag-top-ov__grid' });
        const status = h('div', { class: 'ag-top-ov__note' });
        const tabs = KINDS.map(([value, label]) => h('button', { class: 'ag-top-ov__tab', type: 'button', 'aria-pressed': String(value === kind), 'data-kind': value }, label));
        const scoreTabs = SCORE_BANDS.map(b => h('button', { class: 'ag-top-ov__tab ag-top-ov__tab--score', type: 'button', 'aria-pressed': String(b === band), 'data-score': b.id }, b.label));
        const closeBtn = h('button', { class: 'ag-top-ov__close', type: 'button', 'aria-label': 'Закрыть' }, window.AgUI ? window.AgUI.iconEl('close', 16) : '✕');
        const panel = h('div', { class: 'ag-top-ov__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Топ Shikimori' },
            h('div', { class: 'ag-top-ov__bar' },
                h('div', { class: 'ag-top-ov__head' }, h('h2', {}, window.AgUI ? window.AgUI.iconEl('trophy', 20) : '', 'Топ Shikimori'), closeBtn),
                h('div', { class: 'ag-top-ov__tabs' }, tabs),
                h('div', { class: 'ag-top-ov__scores', role: 'group', 'aria-label': 'Оценка Shikimori' }, h('span', { class: 'ag-top-ov__scores-label' }, 'Оценка'), scoreTabs)),
            h('div', { class: 'ag-top-ov__scroll' }, grid, status)
        );
        const overlay = h('div', { class: 'ag-top-ov' }, panel);

        const prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        document.body.appendChild(overlay);

        const close = () => {
            renderToken++;
            overlay.remove();
            document.documentElement.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKey, true);
        };
        const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        closeBtn.focus();

        const openItem = async (card, item) => {
            if (card.querySelector('.ag-top-ov__busy, .ag-top-ov__choices')) return;
            const poster = card.querySelector('.ag-top-ov__poster');
            const busy = h('div', { class: 'ag-top-ov__busy' }, `Ищем на ${site.name}…`);
            poster.append(busy);

            const titles = [item.name, item.russian].filter(Boolean);
            const year = item.aired_on ? String(item.aired_on).slice(0, 4) : '';
            const here = await window.agSendMessage({ action: 'resolve_site_url', siteId: site.id, titles, year, shikimoriId: item.id });
            if (here && here.url) { location.href = here.url; return; }

            const fallbackUrl = provider.getTopFallbackUrl && provider.getTopFallbackUrl(item);
            if (fallbackUrl) { location.href = fallbackUrl; return; }

            busy.textContent = 'Ищем на других сайтах…';
            const others = window.AgSites.list.filter(s => s.id !== site.id && window.AgSites.isEnabled(settings, s.id)).map(s => s.id);
            const res = await window.agSendMessage({ action: 'resolve_all_sites', siteIds: others, titles, year, shikimoriId: item.id });
            busy.remove();
            const found = ((res && res.results) || []).filter(r => r.url);
            const links = found.map(r => {
                const s = window.AgSites.byId(r.siteId);
                return h('a', { href: r.url, target: '_blank', rel: 'noopener' }, `▶ ${s ? s.name : r.siteId}`);
            });
            links.push(h('a', { href: `https://shikimori.io/animes/${item.id}`, target: '_blank', rel: 'noopener' }, 'Shikimori ↗'));
            poster.append(h('div', { class: 'ag-top-ov__choices' }, found.length ? '' : h('span', { style: 'font-size:11px;color:#a3a2b3;padding:2px 4px' }, `Нет на ${site.name}`), links));
        };

        const makeCard = (item, rank) => {
            const img = h('img', {
                alt: item.russian || item.name || '',
                decoding: 'async',
                loading: 'lazy',
                referrerpolicy: 'no-referrer',
                src: item.image && !/missing/.test(item.image.original || '') ? window.agNormalizePosterUrl(item.image.original) : '',
                'data-ag-poster-id': item.id,
                'data-ag-poster-ru': item.russian || '',
                'data-ag-poster-en': item.name || ''
            });
            const year = item.aired_on ? String(item.aired_on).slice(0, 4) : '';
            const card = h('div', { class: 'ag-top-ov__card', role: 'button', tabindex: '0', title: item.russian || item.name },
                h('div', { class: 'ag-top-ov__poster' }, img,
                    rank <= NUMBERED_RANKS ? h('span', { class: 'ag-top-ov__rank' }, `#${rank}`) : '',
                    h('span', { class: 'ag-top-ov__score' }, `★ ${item.score || '?'}`)),
                h('div', { class: 'ag-top-ov__title' }, item.russian || item.name || ''),
                h('div', { class: 'ag-top-ov__meta' }, [String(item.kind || '').toUpperCase(), year, item.episodes ? `${item.episodes} эп.` : ''].filter(Boolean).join(' · '))
            );
            card.addEventListener('click', () => openItem(card, item));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openItem(card, item);
                }
            });
            return card;
        };

        const scrollBox = panel.querySelector('.ag-top-ov__scroll');

        const showRetry = (action) => {
            const retry = h('a', { class: 'ag-top-ov__retry', href: '#', role: 'button' }, 'Повторить');
            retry.addEventListener('click', (e) => { e.preventDefault(); action(); });
            status.replaceChildren('Не удалось загрузить. ', retry);
        };

        const loadMore = async () => {
            if (loading || !hasMore) return;
            loading = true;
            const token = renderToken;
            status.textContent = 'Загрузка…';
            const pageNo = page + 1;
            const items = await fetchTopPage(kind, pageNo, band.min);
            if (token !== renderToken) return;
            loading = false;

            if (!items) {
                showRetry(loadMore);
                return;
            }

            page = pageNo;
            // Номер считаем от начала рейтинга: с диапазоном оценок список начинается не с первого места.
            // Рейтинг меняется на ходу: тайтл может попасть и на соседнюю страницу
            const fresh = items
                .map((item, idx) => ({ item, rank: (pageNo - 1) * PAGE_SIZE + idx + 1 }))
                .filter(({ item }) => !shownIds.has(item.id) && !(band.below && parseFloat(item.score) >= band.below));
            fresh.forEach(({ item }) => shownIds.add(item.id));
            grid.append(...fresh.map(({ item, rank }) => makeCard(item, rank)));
            window.agBindPostersIn(grid);

            // Вся страница выше диапазона — это нормально: начало взято с запасом
            const aboveBand = band.below && items.length > 0 && parseFloat(items[items.length - 1].score) >= band.below;
            hasMore = items.length >= PAGE_SIZE && (fresh.length > 0 || aboveBand);
            if (hasMore) status.textContent = '';
            else if (shownIds.size === 0) status.textContent = band.id ? 'Тайтлов с такой оценкой нет' : 'Ничего не найдено';
            else status.textContent = band.id ? 'Это все тайтлы с такой оценкой' : 'Это все тайтлы с оценкой';
            loadIfNearEnd();
        };

        // Заранее, за пару рядов до конца; на высоком экране первой страницы может не хватить на всю высоту
        const loadIfNearEnd = () => {
            if (scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 700) loadMore();
        };
        scrollBox.addEventListener('scroll', loadIfNearEnd, { passive: true });

        const render = async () => {
            const token = ++renderToken;
            const isStale = () => token !== renderToken;
            page = 0;
            hasMore = true;
            loading = false;
            shownIds = new Set();
            tabs.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.kind === kind)));
            scoreTabs.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.score === band.id)));
            grid.replaceChildren();
            scrollBox.scrollTop = 0;

            if (band.below) {
                status.textContent = 'Ищем тайтлы с такой оценкой…';
                const start = await findStartPage(kind, band, isStale);
                if (isStale()) return;
                if (start === null) {
                    showRetry(render);
                    return;
                }
                page = start - 1;
            }
            loadMore();
        };

        scoreTabs.forEach(t => t.addEventListener('click', () => {
            if (t.dataset.score === band.id) return;
            band = SCORE_BANDS.find(b => b.id === t.dataset.score);
            render();
        }));
        tabs.forEach(t => t.addEventListener('click', () => {
            if (t.dataset.kind === kind) return;
            kind = t.dataset.kind;
            render();
        }));
        render();
        return close;
    }

    window.AgFeatures = window.AgFeatures || {};

    const STAR_ICON_PATH = 'M10 1.3l2.6 5.3 5.9.9-4.3 4.2 1 5.9L10 14.8l-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z';

    window.AgFeatures.topOverlay = function ({ provider, scope, site, settings }) {
        let closeOverlay = null;
        const open = () => {
            if (provider.beforeTopOpen) provider.beforeTopOpen();
            closeOverlay = openOverlay({ site, settings, provider });
        };
        scope.add(() => { if (closeOverlay) closeOverlay(); });

        // Клон нативного пункта выпадающего меню: вид и отступы сайта, шапка не теснится
        const injectIntoDropdown = (sample) => {
            const menu = sample.parentElement;
            if (menu.querySelector('.ag-top-nav-link')) return;
            document.querySelectorAll('.ag-top-nav-wrapper, .ag-top-nav-link').forEach(el => el.remove());

            const link = sample.cloneNode(true);
            ['data-hotkey-id', 'data-hotkey', 'itemprop', 'aria-current'].forEach(a => link.removeAttribute(a));
            link.setAttribute('href', '#ag-top-shikimori');
            link.classList.add('ag-top-nav-link');
            const label = link.querySelector('[itemprop="name"]') || link.querySelector('span');
            if (label) {
                label.removeAttribute('itemprop');
                label.textContent = 'Топ Shikimori';
            }
            const path = link.querySelector('svg path');
            if (path) path.setAttribute('d', STAR_ICON_PATH);
            menu.appendChild(link);
            scope.own(link);
        };

        const inject = () => {
            const sample = provider.getTopMenuSample();
            if (sample) {
                injectIntoDropdown(sample);
                return;
            }

            const anchor = provider.getNavAnchor();
            if (!anchor) return;

            const existing = document.querySelector('.ag-top-nav-link');
            // Если ссылка оказалась ошибочно внутри anchor (старый баг/грязный DOM) — чистим её
            if (existing && anchor.contains(existing)) {
                existing.remove();
            } else if (existing) {
                return;
            }

            // Копируем классы пункта меню сайта (без «активного» состояния), чтобы ссылка выглядела родной
            const cls = (c) => String(c || '').replace(/\b(is-)?active\b|\bcurrent\b/g, '').trim();
            const isWrapper = anchor.tagName !== 'A';
            const anchorLink = isWrapper ? (anchor.querySelector('a') || anchor) : anchor;

            const rawText = (anchorLink?.textContent || '').trim();
            const isUpper = rawText && rawText === rawText.toUpperCase() && /[А-ЯA-Z]/.test(rawText);
            const labelText = isUpper ? 'ТОП SHIKIMORI' : 'Топ Shikimori';

            const sampleSpan = anchorLink?.querySelector('span');
            const labelNode = sampleSpan
                // Без классов показа (d-none, d-xl-inline): у образца так бывает скрыта часть подписи
                ? h('span', { class: cls(sampleSpan.className).replace(/(^|\s)d-[\w-]+/g, '').trim() }, labelText)
                : document.createTextNode(labelText);

            const sampleSvg = anchorLink?.querySelector('svg');
            let iconNode = null;
            if (sampleSvg) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                svg.setAttribute('width', sampleSvg.getAttribute('width') || '12');
                svg.setAttribute('height', sampleSvg.getAttribute('height') || '12');
                svg.setAttribute('fill', sampleSvg.getAttribute('fill') || 'currentColor');
                svg.setAttribute('viewBox', sampleSvg.getAttribute('viewBox') || '0 0 20 20');
                if (sampleSvg.getAttribute('class')) svg.setAttribute('class', sampleSvg.getAttribute('class'));
                if (sampleSvg.getAttribute('style')) svg.setAttribute('style', sampleSvg.getAttribute('style'));
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', STAR_ICON_PATH);
                svg.appendChild(path);
                iconNode = svg;
            }

            const linkChildren = iconNode ? [iconNode, labelNode] : [labelNode];
            const link = h('a', {
                class: ('ag-top-nav-link ' + cls(anchorLink?.className)).trim(),
                href: '#ag-top-shikimori'
            }, ...linkChildren);

            let inserted;
            if (isWrapper) {
                const wrapper = anchor.cloneNode(false);
                wrapper.removeAttribute('id');
                if (wrapper.hasAttribute('data-selected')) wrapper.removeAttribute('data-selected');
                if (wrapper.hasAttribute('aria-current')) wrapper.removeAttribute('aria-current');
                wrapper.className = cls(anchor.className);
                wrapper.classList.add('ag-top-nav-wrapper');
                wrapper.appendChild(link);
                inserted = wrapper;
            } else {
                inserted = link;
            }

            anchor.after(inserted);
            scope.own(inserted);
        };

        // Остальные копии меню (мобильная панель): сайт может скопировать меню и до, и после нашей вставки
        const syncExtraMenus = () => {
            const primary = document.querySelector('.ag-top-nav-wrapper');
            if (!primary) return;
            provider.getExtraNavAnchors().forEach(anchor => {
                if (!anchor.parentElement || anchor.parentElement.querySelector('.ag-top-nav-link')) return;
                const copy = provider.createExtraNavItem ? provider.createExtraNavItem() : primary.cloneNode(true);
                anchor.after(copy);
                scope.own(copy);
            });
        };

        const injectAll = () => {
            inject();
            syncExtraMenus();
        };

        injectStyle();
        injectAll();
        scope.observe(injectAll, { root: document.body, wait: 400 });

        // Делегирование: ссылка может пересоздаваться сайтом (SPA), обработчик остаётся один
        scope.listen(document, 'click', (e) => {
            const link = e.target.closest && e.target.closest('.ag-top-nav-link, .ag-top-nav-wrapper');
            if (!link) return;
            e.preventDefault();
            e.stopPropagation();
            open();
        }, true);

        // Прямая ссылка: …#ag-top-shikimori
        if (location.hash === '#ag-top-shikimori') open();
    };
})();
