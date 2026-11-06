// top/top.js
// «Топ Shikimori»: собственная страница расширения, от вёрстки сайтов не зависит. Два режима:
//   - поверх сайта (frame.html?embed=1): кадр внутри значка (features/fox-dock.js). Сайт фиксирован: site=<id>&origin=<адрес>.
//     Нажатие на тайтл просит значок открыть его на этом сайте (postMessage), закрытие — тоже через значок;
//   - вкладкой из окна расширения (pick=1): зритель сам выбирает сайт, выбор запоминается (ag_top_site).
// Весь рейтинг Shikimori подгружается по мере прокрутки.

(function () {
    'use strict';

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
    const PICK_KEY = 'ag_top_site';
    const MESSAGE_SOURCE = 'anime-plus-top';
    const KINDS = [['', 'Все'], ['tv', 'Сериалы'], ['movie', 'Фильмы'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешлы']];

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
    // Возвращает номер страницы или null при ошибке; isStale — выбрали другой диапазон.
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

    // Адрес из параметров принимаем, только если он ведёт на этот же сайт (в том числе на его новое зеркало)
    const sameSiteUrl = (raw, site) => {
        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
            const owner = window.AgSites.byHost(url.hostname);
            return owner && owner.id === site.id ? url : null;
        } catch (e) {
            return null;
        }
    };

    /** Режим и сайт из адреса страницы. Без сайта и без выбора сайта — null */
    function readContext(search) {
        const params = new URLSearchParams(search);
        const embed = params.get('embed') === '1';
        const pick = !embed && params.get('pick') === '1';
        const site = window.AgSites.byId(params.get('site') || '');
        if (!site) return pick ? { site: null, origin: '', embed, pick } : null;
        const origin = (sameSiteUrl(params.get('origin') || '', site) || new URL(site.home)).origin;
        return { site, origin, embed, pick };
    }

    /** Сайты, из которых можно выбирать во вкладке: включённые в настройках */
    async function pickableSites() {
        const settings = (await chrome.storage.local.get(['ag_settings'])).ag_settings || {};
        return window.AgSites.searchable().filter(s => window.AgSites.isEnabled(settings, s.id));
    }

    // Рабочий адрес сайта: у переезжающих сайтов это последний открытый зрителем (providers/vost.js)
    async function workingOrigin(site) {
        const { ag_site_home: homes = {} } = await chrome.storage.local.get(['ag_site_home']);
        const url = sameSiteUrl(homes[site.id] || '', site);
        return (url || new URL(site.home)).origin;
    }

    /** Сообщение значку на странице сайта (только в режиме поверх сайта) */
    const tellDock = (message) => window.parent.postMessage({ source: MESSAGE_SOURCE, ...message }, '*');

    function render(ctx, sites = []) {
        let { site, origin } = ctx;
        document.title = 'Топ Shikimori';
        document.documentElement.classList.toggle('is-embed', ctx.embed);

        let kind = '';
        let renderToken = 0;
        let band = SCORE_BANDS[0];
        let page = 0;
        let hasMore = true;
        let loading = false;
        let shownIds = new Set();

        const grid = h('div', { class: 'top__grid' });
        const status = h('div', { class: 'top__note' });
        const tabs = KINDS.map(([value, label]) => h('button', { class: 'top__tab', type: 'button', 'aria-pressed': String(value === kind), 'data-kind': value }, label));
        const scoreTabs = SCORE_BANDS.map(b => h('button', { class: 'top__tab top__tab--score', type: 'button', 'aria-pressed': String(b === band), 'data-score': b.id }, b.label));
        const badgeOf = (x) => h('span', { class: 'top__site-badge', style: `background:${x.color};color:${window.AgUI.onAccent(x.color)}` }, x.short);
        const hint = h('span', { class: 'top__hint' }, `Тайтл откроется на ${site.name}`);

        let headSide = '';
        if (ctx.embed) {
            const close = h('button', { class: 'top__close', type: 'button', 'aria-label': 'Закрыть', title: 'Закрыть (Esc)' }, window.AgUI.iconEl('close', 16));
            close.addEventListener('click', () => tellDock({ type: 'close' }));
            headSide = close;
        } else if (ctx.pick) {
            // Выбор сайта выпадающим списком: запоминается и меняется в любой момент
            const current = h('span', { class: 'top__picker-current' });
            const showCurrent = () => current.replaceChildren(badgeOf(site), site.name);
            showCurrent();
            const toggle = h('button', { class: 'top__picker-btn', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': 'На каком сайте открывать тайтл' },
                current, h('span', { class: 'top__picker-arrow', 'aria-hidden': 'true' }, '▾'));
            const options = sites.map(x => h('button', { class: 'top__site', type: 'button', role: 'option', 'aria-selected': String(x.id === site.id), 'data-site': x.id }, badgeOf(x), x.name));
            const list = h('div', { class: 'top__picker-list', role: 'listbox', hidden: '' }, options);
            const picker = h('div', { class: 'top__picker' }, h('span', { class: 'top__scores-label' }, 'Открывать на'), h('div', { class: 'top__picker-box' }, toggle, list));

            const setOpen = (open) => {
                list.hidden = !open;
                toggle.setAttribute('aria-expanded', String(open));
                if (open) (list.querySelector('[aria-selected="true"]') || options[0]).focus();
            };
            toggle.addEventListener('click', () => setOpen(list.hidden));
            document.addEventListener('mousedown', (e) => { if (!picker.contains(e.target)) setOpen(false); });
            picker.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !list.hidden) { setOpen(false); toggle.focus(); }
                if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !list.hidden) {
                    e.preventDefault();
                    const i = options.indexOf(document.activeElement);
                    options[(i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length].focus();
                }
            });
            options.forEach(option => option.addEventListener('click', async () => {
                const x = sites.find(s => s.id === option.dataset.site);
                setOpen(false);
                toggle.focus();
                if (x.id === site.id) return;
                site = x;
                origin = await workingOrigin(x);
                options.forEach(o => o.setAttribute('aria-selected', String(o === option)));
                showCurrent();
                hint.textContent = `Тайтл откроется на ${x.name}`;
                grid.querySelectorAll('.top__busy, .top__choices').forEach(el => el.remove());
                chrome.storage.local.set({ [PICK_KEY]: x.id }).catch(() => {});
            }));
            hint.hidden = true;
            headSide = picker;
        }

        const app = document.getElementById('app');
        app.replaceChildren(
            h('header', { class: 'top__bar' },
                h('div', { class: 'top__head' },
                    h('h1', {}, window.AgUI.iconEl('trophy', 22), 'Топ Shikimori'),
                    hint,
                    headSide),
                h('div', { class: 'top__tabs' }, tabs),
                h('div', { class: 'top__scores', role: 'group', 'aria-label': 'Оценка Shikimori' }, h('span', { class: 'top__scores-label' }, 'Оценка'), scoreTabs)),
            h('main', { class: 'top__body' }, grid, status)
        );
        // Поверх сайта список прокручивается внутри окна, во вкладке — вся страница
        const scrollBox = ctx.embed ? app.querySelector('.top__body') : null;

        if (ctx.embed) {
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tellDock({ type: 'close' }); });
            // Нажатие на затемнение вокруг окна закрывает Топ
            document.addEventListener('mousedown', (e) => { if (!app.contains(e.target)) tellDock({ type: 'close' }); });
        }

        const openItem = async (card, item) => {
            if (card.querySelector('.top__busy, .top__choices')) return;
            const poster = card.querySelector('.top__poster');
            const busy = h('div', { class: 'top__busy' }, `Ищем на ${site.name}…`);
            poster.append(busy);

            const titles = [item.name, item.russian].filter(Boolean);
            const year = item.aired_on ? String(item.aired_on).slice(0, 4) : '';
            const target = site;
            const here = await window.agSendMessage({ action: 'resolve_site_url', siteId: target.id, titles, year, shikimoriId: item.id });
            if (target !== site) { busy.remove(); return; } // пока искали, зритель выбрал другой сайт
            const found = here && here.url ? sameSiteUrl(new URL(here.url, origin).href, site) : null;
            // Сайт с зеркалами: открываем на том адресе, где зритель сейчас
            if (found) { window.AgTopPage.navigate(site.mirrors ? origin + found.pathname + found.search : found.href); return; }

            // AnimeGO: тайтла нет в каталоге — страница из данных Shikimori (modules/animego/ag-synthetic.js)
            if (site.shikiPage) { window.AgTopPage.navigate(origin + site.shikiPage.replace('{id}', item.id)); return; }

            busy.remove();
            poster.append(h('div', { class: 'top__choices' },
                h('span', {}, `Нет на ${site.name}`),
                h('a', { href: `https://shikimori.io/animes/${item.id}`, target: '_blank', rel: 'noopener' }, 'Shikimori ↗')));
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
            const card = h('div', { class: 'top__card', role: 'button', tabindex: '0', title: item.russian || item.name },
                h('div', { class: 'top__poster' }, img,
                    rank <= NUMBERED_RANKS ? h('span', { class: 'top__rank' }, `#${rank}`) : '',
                    h('span', { class: 'top__score' }, `★ ${item.score || '?'}`)),
                h('div', { class: 'top__title' }, item.russian || item.name || ''),
                h('div', { class: 'top__meta' }, [String(item.kind || '').toUpperCase(), year, item.episodes ? `${item.episodes} эп.` : ''].filter(Boolean).join(' · '))
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

        const showRetry = (action) => {
            const retry = h('a', { class: 'top__retry', href: '#', role: 'button' }, 'Повторить');
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
            const near = scrollBox
                ? scrollBox.scrollTop + scrollBox.clientHeight >= scrollBox.scrollHeight - 700
                : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 700;
            if (near) loadMore();
        };
        (scrollBox || window).addEventListener('scroll', loadIfNearEnd, { passive: true });
        window.addEventListener('resize', loadIfNearEnd, { passive: true });

        const restart = async () => {
            const token = ++renderToken;
            const isStale = () => token !== renderToken;
            page = 0;
            hasMore = true;
            loading = false;
            shownIds = new Set();
            tabs.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.kind === kind)));
            scoreTabs.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.score === band.id)));
            grid.replaceChildren();
            if (scrollBox) scrollBox.scrollTop = 0;
            else window.scrollTo(0, 0);

            if (band.below) {
                status.textContent = 'Ищем тайтлы с такой оценкой…';
                const start = await findStartPage(kind, band, isStale);
                if (isStale()) return;
                if (start === null) {
                    showRetry(restart);
                    return;
                }
                page = start - 1;
            }
            loadMore();
        };

        scoreTabs.forEach(t => t.addEventListener('click', () => {
            if (t.dataset.score === band.id) return;
            band = SCORE_BANDS.find(b => b.id === t.dataset.score);
            restart();
        }));
        tabs.forEach(t => t.addEventListener('click', () => {
            if (t.dataset.kind === kind) return;
            kind = t.dataset.kind;
            restart();
        }));
        restart();
        if (ctx.embed) app.querySelector('.top__close').focus();
    }

    async function start() {
        // Адреса переехавших сайтов, которые зритель добавил сам, читаются из хранилища
        await window.AgSites.ready;
        const ctx = readContext(location.search);
        const app = document.getElementById('app');
        if (!ctx) {
            app.replaceChildren(h('p', { class: 'top__note' }, 'Откройте Топ со значка Anime+ на сайте с аниме или из окна расширения.'));
            return;
        }
        if (!ctx.pick) {
            render(ctx);
            return;
        }
        // Вкладка из окна расширения: сайт из прошлого выбора, иначе тот, что открыт рядом, иначе первый включённый
        const sites = await pickableSites();
        const { [PICK_KEY]: saved } = await chrome.storage.local.get([PICK_KEY]);
        const site = sites.find(x => x.id === saved) || sites.find(x => ctx.site && x.id === ctx.site.id) || sites[0];
        if (!site) {
            app.replaceChildren(h('p', { class: 'top__note' }, 'Все сайты выключены: включите хотя бы один в окне расширения.'));
            return;
        }
        render({ ...ctx, site, origin: ctx.site && ctx.site.id === site.id ? ctx.origin : await workingOrigin(site) }, sites);
    }

    // Переход на тайтл. Поверх сайта его делает значок: кадр не может сам увести страницу сайта.
    // В тестах подменяется: в jsdom переход на другой адрес не работает
    const navigate = (url) => {
        if (document.documentElement.classList.contains('is-embed')) tellDock({ type: 'open', url });
        else location.assign(url);
    };

    window.AgTopPage = { readContext, start, navigate };
    if (!window.AG_TOP_NO_AUTOSTART) start();
})();
