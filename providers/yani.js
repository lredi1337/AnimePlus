// providers/yani.js
// Провайдер платформы YummyAnime (old.yummyani.me — серверная вёрстка, ru.yummyani.me — React SPA).
// Обе версии работают поверх одного JSON API:
//   GET /api/anime/{slug}?need_videos=true → remote_ids.shikimori_id, other_titles, year, type,
//       videos[{ number, iframe_url, skips: { opening: {time, length}, ending: {...} } }]
// Классы вёрстки обфусцированы (Y56k, pQCG…) и меняются при каждой сборке, поэтому:
//   - номер серии берём из параметра episode= в URL iframe Kodik (сайт меняет src при выборе серии);
//   - список серий ищем структурно: контейнер, все дочерние элементы которого — числа;
//   - ID Shikimori — из API (или из ссылки shikimori.*/animes/{id} на странице).

(function () {
    'use strict';

    const { BaseProvider } = window.AgProviders;

    const slugFromPath = () => (location.pathname.match(/^\/catalog\/item\/([^/?#]+)/) || [])[1] || null;

    const findKodikFrame = () => Array.from(document.querySelectorAll('iframe'))
        .find(f => /kodik/i.test(f.src || '')) || null;

    // Кнопки серий. ru.yummyani.me: [role="button"][data-selected] (обёртка div + кнопка «просмотрено»);
    // old.yummyani.me: контейнер, все дочерние элементы которого — числа
    const findEpisodeButtons = () => {
        const semantic = Array.from(document.querySelectorAll('[role="button"][data-selected]')).filter(b => /^\d+$/.test(b.textContent.trim()));
        if (semantic.length) return semantic;
        const list = Array.from(document.querySelectorAll('div, ul'))
            .find(el => el.children.length >= 2 && Array.from(el.children).every(c => c.children.length === 0 && /^\d+$/.test(c.textContent.trim())));
        return list ? Array.from(list.children) : [];
    };

    // ---------- Меню «Озвучка» и «Плеер» (react-select): пункты появляются только при открытии ----------

    const SITE_MARK_MIN_SEC = 60;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const MENU_HIDE_ID = 'ag-shell-menu-hide';

    const findSelectControl = (word) => {
        const value = Array.from(document.querySelectorAll('[class*="singleValue"]')).find(e => e.textContent.trim().startsWith(word));
        return value ? value.closest('[class*="-control"]') : null;
    };

    const selectValue = (word) => {
        const control = findSelectControl(word);
        const value = control && control.querySelector('[class*="singleValue"]');
        return value ? value.textContent : '';
    };

    /** «Озвучка AniLibria (28 эп.)» или «Озвучка AniLibria28 / 2855.5K» → имя и число серий */
    function parseSelectText(word, text) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim().replace(new RegExp(`^${word}\\s*`), '');
        const brackets = clean.match(/^(.*?)\s*\((\d+)\s*эп\.?\)\s*$/);
        if (brackets) return { title: brackets[1].trim(), count: brackets[2] };
        const pair = clean.match(/^(.*?)\s*(\d+)\s*\/\s*\d+/);
        if (pair) return { title: pair[1].trim(), count: pair[2] };
        return { title: clean, count: '' };
    }

    // Пункты только этого меню: на старом сайте в разметке всегда есть ещё и пункты выбора языка
    const menuOptions = (control) => Array.from(control.parentElement.querySelectorAll('[class*="-option"]'));

    // Открытие меню сайта незаметно для зрителя. В полном экране браузер не отдаёт фокус полям вне плеера,
    // а без фокуса сам блок выбора не открывается, поэтому нажимаем стрелку: она открывает меню и без него
    async function openMenu(word, action) {
        const control = findSelectControl(word);
        if (!control || menuOptions(control).length) return null;
        const focused = document.activeElement;
        const { scrollX, scrollY } = window;
        const style = document.createElement('style');
        style.id = MENU_HIDE_ID;
        style.textContent = '[class*="-menu"] { opacity: 0 !important; }';
        document.head.appendChild(style);
        const arrow = control.querySelector('[class*="indicatorContainer"]') || control;
        const press = () => arrow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        try {
            press();
            let options = [];
            for (let i = 0; i < 12 && !options.length; i++) {
                await sleep(50);
                options = menuOptions(control);
            }
            return await action(options, press);
        } finally {
            style.remove();
            // Фокус и прокрутку возвращаем: иначе перестанут работать клавиши плеера, а страница подпрыгнет
            if (focused && focused.focus) focused.focus({ preventScroll: true });
            window.scrollTo(scrollX, scrollY);
        }
    }

    // Запрос списков и выбор зрителя могут совпасть, а меню за раз открыто только одно
    let menuQueue = Promise.resolve();
    const withOpenMenu = (word, action) => {
        const run = menuQueue.then(() => openMenu(word, action));
        menuQueue = run.catch(() => {});
        return run;
    };

    const readSelect = (word) => withOpenMenu(word, async (options, close) => {
        const current = parseSelectText(word, selectValue(word)).title;
        const list = options.map((el, index) => {
            const parsed = parseSelectText(word, el.textContent);
            return { index, title: parsed.title, count: parsed.count, selected: parsed.title === current, type: /субтитр|subtitles/i.test(parsed.title) ? 'subtitles' : 'voice' };
        });
        close();
        return list;
    });

    const chooseSelect = (word, match) => withOpenMenu(word, async (options, close) => {
        const target = options.find((el, index) => match(parseSelectText(word, el.textContent), index));
        if (!target) {
            close();
            return false;
        }
        target.click();
        return true;
    });

    class YaniProvider extends BaseProvider {
        constructor(site, settings) {
            super(site, settings);
            this.apiPromise = null;
            this.apiSlug = null;
            this.msgEpisode = null;
            this.playerPicked = false;
        }

        isTitlePage() {
            return !!slugFromPath();
        }

        loadApi() {
            const slug = slugFromPath();
            if (!slug) return Promise.resolve(null);
            if (this.apiPromise && this.apiSlug === slug) return this.apiPromise;
            this.apiSlug = slug;
            this.apiPromise = fetch(`/api/anime/${encodeURIComponent(slug)}?need_videos=true`, { credentials: 'omit' })
                .then(r => r.ok ? r.json() : null)
                .then(j => (j && j.response) || null)
                .catch(() => null);
            return this.apiPromise;
        }

        async getTitleInfo() {
            const slug = slugFromPath();
            if (!slug) return null;
            const api = await this.loadApi();

            // Резерв без API: ссылка на Shikimori прямо на странице
            let shikimoriId = api?.remote_ids?.shikimori_id || null;
            if (!shikimoriId) {
                const link = Array.from(document.querySelectorAll('a[href*="shikimori."]')).find(a => /\/animes\/[a-z]?\d+/i.test(a.href) && !/oauth/.test(a.href));
                const m = link && link.href.match(/\/animes\/[a-z]?(\d+)/i);
                if (m) shikimoriId = parseInt(m[1], 10);
            }

            const h1 = (document.querySelector('h1')?.innerText || '').trim();
            const title = api?.title || h1;
            const titles = [...new Set([title, h1, ...(api?.other_titles || [])].filter(Boolean))];

            return {
                pageKey: `${this.site.id}:${slug}`,
                title: h1 || title,
                origTitle: (api?.other_titles || []).find(t => /^[\x20-\x7e]+$/.test(t)) || title,
                titles,
                year: api?.year ? String(api.year) : '',
                kind: api?.type?.alias || '',
                shikimoriId: shikimoriId ? parseInt(shikimoriId, 10) : null
            };
        }

        getEpisode(msgEpisode) {
            // Активная серия в списке сайта — меняется сразу по клику, ещё до загрузки нового iframe
            const selected = document.querySelector('[role="button"][data-selected="1"]');
            if (selected && /^\d+$/.test(selected.textContent.trim())) return selected.textContent.trim();
            const frame = findKodikFrame();
            if (frame) {
                try {
                    const ep = new URL(frame.src).searchParams.get('episode');
                    if (ep) return ep;
                } catch (e) {}
            }
            if (msgEpisode && msgEpisode !== '0') this.msgEpisode = String(msgEpisode);
            return this.msgEpisode || '1';
        }

        getPlayerContainer() {
            const frame = findKodikFrame();
            return frame ? (frame.parentElement?.parentElement || frame.parentElement) : null;
        }

        getPlayerWindows() {
            const frame = findKodikFrame();
            return frame && frame.contentWindow ? [frame.contentWindow] : [];
        }

        /** Списки для панели плеера: Kodik открыт сайтом на одну серию и своих списков не имеет */
        async getShellSite() {
            const heading = (document.querySelector('h1')?.innerText || '').trim();
            const current = this.getEpisode();
            const episodes = findEpisodeButtons().map((el, index) => {
                const label = el.textContent.trim();
                return { index, label, title: label, selected: label === String(current) };
            });
            // Меню читаем только когда выбор на сайте изменился: открывать их при каждом запросе незачем
            const key = `${slugFromPath()}|${selectValue('Озвучка')}|${selectValue('Плеер')}`;
            if (this.shellMenusKey !== key) {
                const voices = await readSelect('Озвучка');
                const players = await readSelect('Плеер');
                if (voices && voices.length) {
                    this.shellMenus = { voices: await this.keepKodikVoices(voices), players: players || [] };
                    this.shellMenusKey = key;
                }
            }
            return { title: heading, episodes, ...(this.shellMenus || { voices: [], players: [] }) };
        }

        // Панель работает только в Kodik: озвучка без него увела бы зрителя в чужой плеер
        async keepKodikVoices(voices) {
            const api = await this.loadApi();
            const names = new Set((api?.videos || []).filter(v => /kodik/i.test(v.data?.player || '')).map(v => parseSelectText('Озвучка', v.data?.dubbing).title));
            return names.size ? voices.filter(v => names.has(v.title)) : voices;
        }

        async shellPick(kind, index) {
            if (kind === 'episodes') {
                const el = findEpisodeButtons()[index];
                if (el) el.click();
                return;
            }
            if (kind === 'players') {
                await chooseSelect('Плеер', (_, i) => i === index);
                return;
            }
            if (kind === 'voices') {
                const before = selectValue('Озвучка');
                const episode = String(this.getEpisode());
                if (!await chooseSelect('Озвучка', (_, i) => i === index)) return;
                for (let i = 0; i < 14 && selectValue('Озвучка') === before; i++) await sleep(100);
                // При смене озвучки сайт всегда ставит первый плеер, поэтому Kodik возвращаем сами
                await sleep(100);
                if (!/kodik/i.test(selectValue('Плеер'))) await chooseSelect('Плеер', parsed => /kodik/i.test(parsed.title));
                // Новый сайт при этом открывает первую серию, а зритель хотел сменить только озвучку
                await sleep(300);
                if (String(this.getEpisode()) !== episode) findEpisodeButtons().find(b => b.textContent.trim() === episode)?.click();
            }
        }

        // Плеер выбирает сам сайт (React-селект «Плеер Kodik»); вмешиваться не нужно
        // Наши функции плеера работают только в Kodik, а сайт по умолчанию может открыть другой плеер.
        // Меню появляется не сразу: runtime зовёт этот метод повторно, пока он не вернёт true
        selectPreferredPlayer() {
            if (this.playerPicked || findKodikFrame()) return true;
            if (this.playerPicking || !findSelectControl('Плеер')) return false;
            this.playerPicking = true;
            chooseSelect('Плеер', (option) => /kodik/i.test(option.title))
                // null: меню сейчас открыл сам зритель, попробуем позже. false: Kodik у этого тайтла нет
                .then((result) => { this.playerPicked = result !== null; })
                .catch(() => {})
                .finally(() => { this.playerPicking = false; });
            return false;
        }

        navigate(dir) {
            const buttons = findEpisodeButtons();
            if (!buttons.length) return false;
            const current = parseInt(this.getEpisode(), 10) || 1;
            const target = dir === 'next' ? current + 1 : current - 1;
            const btn = buttons.find(c => c.textContent.trim() === String(target));
            if (!btn) return false;
            btn.click();
            return true;
        }

        /** Тайминги сайта зависят от озвучки, а она меняет адрес кадра */
        getSkipKey() {
            return findKodikFrame()?.src || '';
        }

        // Таймкоды опенинга/эндинга есть прямо в API сайта — точнее, чем AniSkip
        async getSkipData(episode) {
            const api = await this.loadApi();
            const videos = (api?.videos || []).filter(v => String(v.number) === String(episode) && v.skips);
            const src = findKodikFrame()?.src || '';
            const exact = videos.find(v => v.iframe_url && src.includes(v.iframe_url.replace(/^https?:/, '').split('?')[0]));
            const video = exact || videos.find(v => v.skips.opening || v.skips.ending);
            if (!video) return null;
            // Метка этой озвучки точна, а у другой озвучки время может быть сдвинуто. Короткий эндинг сайта — это
            // титры озвучки в конце файла, а не песня: такую часть провайдер не отдаёт, и её время берётся из AniSkip
            const toRange = (s) => s && s.length >= SITE_MARK_MIN_SEC ? { start: s.time, end: s.time + s.length, ...(exact ? { trusted: true } : {}) } : { start: 0, end: 0 };
            return { op: toRange(video.skips.opening), ed: toRange(video.skips.ending) };
        }

        getTitleAnchor() {
            return document.querySelector('h1')?.parentElement || null;
        }

        getNavAnchor() {
            const top = document.querySelector('nav a[href="/catalog/top"], a[href="/catalog/top"]');
            return top ? (top.closest('li, [data-variant], nav > div, .fM') || top) : null;
        }

        // ru.yummyani.me: пункты шапки сжимаются (flex-shrink:1, min-width:0), а подписи не переносятся —
        // лишний пункт наезжает на соседние. Поэтому «Топ Shikimori» живёт в выпадающем меню «АНИМЕ»
        getTopMenuSample() {
            return document.querySelector('header .db a[href="/catalog/schedule"]');
        }

        requiredSelectors() {
            return [['title', ['h1']]];
        }

        mount(scope) {
            this.msgEpisode = null;
            this.playerPicked = false;
            // ru.yummyani.me кладёт поверх Kodik свою кнопку полного экрана, и она дублирует кнопку новой оболочки.
            // Классы меняются при каждой сборке сайта, поэтому узнаём её по значку
            const style = document.createElement('style');
            style.textContent = 'body:has(iframe[src*="kodik"]) button:has(> svg > path[d^="M2.75 2.5a.25"]) { display: none !important; }';
            document.head.appendChild(style);
            scope.add(() => style.remove());
        }
    }

    window.AgProviders.register('yani', YaniProvider);
})();
