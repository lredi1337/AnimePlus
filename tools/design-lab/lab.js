// tools/design-lab/lab.js
// Общая часть презентации стилей: состояние, переключение стилей и страниц, «Другое аниме», кадры на весь экран,
// фильтры Топа и выбор сайта. Стили (styles/*.js) только рисуют разметку с data-act и сами ничего не слушают.

(function () {
    'use strict';

    const D = window.LAB_DATA;
    const LAB = window.LAB = { variants: [] };

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const KIND = { tv: 'Сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'Спешл' };
    const STATUS = { ongoing: 'Онгоинг', anons: 'Анонс' };
    const KINDS = [['', 'Все'], ['tv', 'Сериалы'], ['movie', 'Фильмы'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешлы']];
    const BANDS = [['', 'Все', 0, 99], ['9', '9+', 9, 99], ['8', '8–9', 8, 9], ['7', '7–8', 7, 8], ['6', '6–7', 6, 7]];
    const TOP_STEP = 40;

    LAB.h = {
        esc,
        kind: (t) => KIND[t.kind] || t.kind,
        eps: (t) => (t.kind === 'movie' ? '' : t.eps ? `${t.eps} эп.` : ''),
        status: (t) => STATUS[t.status] || '',
        facts: (t) => [KIND[t.kind] || t.kind, t.year, t.kind === 'movie' ? '' : t.eps ? `${t.eps} эп.` : ''].filter(Boolean).join(' · '),
        img: (src, cls = '', alt = '') => `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">`,
        site: (id) => D.sites.find(s => s.id === id),
        onAccent: (hex) => {
            const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
            if (!m) return '#fff';
            const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
            return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? '#14161c' : '#ffffff';
        },
        hue: (id) => (Number(id) * 47) % 360,
        KINDS, BANDS
    };
    // Кнопки сайтов, где тайтл нашёлся (ссылки настоящие) — стиль задаёт свой класс
    LAB.h.siteLinks = (t, cls) => (t.sites || []).map(s => {
        const site = LAB.h.site(s.id);
        if (!site) return '';
        return `<a class="${cls}" href="${esc(s.url)}" target="_blank" rel="noopener" style="--site:${site.color};--on-site:${LAB.h.onAccent(site.color)}"><b>${esc(site.short)}</b><span>${esc(site.name)}</span></a>`;
    }).join('');
    // «Открывать на»: кнопка и список сайтов
    LAB.h.sitePicker = (top, cls) => `<div class="site-menu ${cls}">
        <button type="button" class="${cls}__btn" data-act="site-menu" aria-haspopup="listbox" aria-expanded="${top.siteMenu}">
            <b style="--site:${top.site.color};--on-site:${LAB.h.onAccent(top.site.color)}">${esc(top.site.short)}</b><span>${esc(top.site.name)}</span><i aria-hidden="true">▾</i>
        </button>
        ${top.siteMenu ? `<div class="${cls}__list" role="listbox">${top.sites.map(s => `<button type="button" role="option" aria-selected="${s.id === top.site.id}" data-act="site" data-v="${s.id}"><b style="--site:${s.color};--on-site:${LAB.h.onAccent(s.color)}">${esc(s.short)}</b><span>${esc(s.name)}</span></button>`).join('')}</div>` : ''}
    </div>`;
    LAB.h.openTop = (t) => `href="https://shikimori.io/animes/${t.id}" data-act="open-top" data-v="${t.id}"`;
    // «Порядок просмотра» — как в расширении (modules/looks/look-pages.js): разметку готовит withFranchise
    LAB.h.franchise = (t, cls = '') => (t.franchiseHtml ? `<div class="lk-fr ${esc(cls)}">${t.franchiseHtml}</div>` : '');

    // ---------- Состояние ----------
    const state = {
        variant: null,
        page: 'random',
        // Случайное: порядок без повторов, пока не пройдены все двадцать
        order: [],
        pos: 0,
        history: [],
        descOpen: false,
        spin: 0,
        // «Порядок просмотра»: режим и раскрытые части, как на странице расширения (modules/shared/franchise-view.js)
        fr: window.AgFranchiseView ? window.AgFranchiseView.state() : null,
        // Топ
        kind: '',
        band: '',
        site: 'animego',
        shown: TOP_STEP,
        siteMenu: false,
        // Окно расширения, значок на сайте, расписание
        ui: {
            popupSites: false, popupKind: 'all', popupMusic: false, popupOn: true, popupLogged: false, popupTab: 'watching', siteOff: [],
            dock: 'top',
            // Расписание: фильтры по умолчанию — как у нового зрителя в расширении (schedule-core.js)
            schedF: window.AgSchedule ? window.AgSchedule.filters({}) : null, schedQ: '', schedPanel: false,
            // Настройки — значения по умолчанию как в расширении (config.js)
            setPane: 'look', skin: 'compact', labels: true, thumb: false, accent: '#ef4444', autoVoice: true,
            voices: ['Anilibria', 'Studio Band', 'Dream Cast', 'Дубляж', 'SHIZA Project', 'Subtitles'],
            keys: { fs: 'f', skip: 's', next: 'n', prev: 'p', forward: 'arrowright', rewind: 'arrowleft', mute: 'm', volUp: 'arrowup', volDown: 'arrowdown', speedUp: 'shift+.', speedDown: 'shift+,' },
            keyWait: null, rScore: '7.5', rKinds: ['tv', 'movie'], helpType: 'Ошибка'
        }
    };
    const PAGES = ['popup', 'random', 'top', 'onsite', 'schedule', 'pick', 'settings'];
    // Визуал: стиль и тема. 'auto' — та тема, для которой стиль задуман (variant.native). Выбор помнит браузер
    const LOOK_KEY = 'anime-plus-lab-look';
    state.theme = 'auto';
    try { const saved = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); if (saved) { state.theme = saved.theme || 'auto'; state.savedVariant = saved.variant; } } catch (e) { /* без памяти */ }
    const saveLook = () => { try { localStorage.setItem(LOOK_KEY, JSON.stringify({ variant: state.variant, theme: state.theme })); } catch (e) { /* без памяти */ } };
    const effTheme = (v) => (state.theme === 'auto' ? (v && v.native) || 'dark' : state.theme);

    function shuffleOrder() {
        const ids = D.random.map(t => t.id);
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
        state.order = ids;
        state.pos = 0;
    }
    shuffleOrder();

    const byId = new Map(D.random.map(t => [t.id, t]));
    const current = () => byId.get(state.order[state.pos]);
    // Разметка «Порядка просмотра» для шаблона — так же, как готовит её страница расширения (random/random.js)
    const withFranchise = (t) => ({ ...t, franchiseHtml: state.fr && t.franchise ? window.AgFranchiseView.html(t.franchise, state.fr, t.id, '../../icons/icon128.png') : '' });

    function topList() {
        const band = BANDS.find(b => b[0] === state.band) || BANDS[0];
        return D.top.filter(t => (!state.kind || t.kind === state.kind || (state.kind === 'special' && t.kind === 'tv_special'))
            && t.score >= band[2] && t.score < band[3]);
    }

    LAB.ctx = () => {
        const all = topList();
        return {
            data: D,
            random: { item: withFranchise(current()), history: state.history.map(id => byId.get(id)), descOpen: state.descOpen, spin: state.spin, filters: LAB.randomFilters || 'Оценка от 7.5 · Сериалы, Фильмы' },
            top: { items: all.slice(0, state.shown), total: all.length, more: all.length > state.shown, kind: state.kind, band: state.band, site: LAB.h.site(state.site), sites: D.sites, siteMenu: state.siteMenu },
            page: state.page,
            ui: state.ui,
            look: { variant: state.variant, theme: state.theme, variants: LAB.variants }
        };
    };

    // ---------- Отрисовка ----------
    const stage = () => document.getElementById('stage');
    let lastVariant = null;

    function render() {
        const v = LAB.variants.find(x => x.id === state.variant);
        const root = stage();
        document.querySelectorAll('[data-variant-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.variantTab === state.variant)));
        document.querySelectorAll('[data-page-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pageTab === state.page)));
        document.body.dataset.view = v ? 'variant' : 'intro';
        if (!v) { root.className = 'stage'; delete root.dataset.look; delete root.dataset.theme; root.innerHTML = LAB.intro(); return; }
        root.className = `stage v-${v.id} p-${state.page} t-${effTheme(v)}`;
        // Раскладки стилей (modules/looks/*.css) включаются атрибутами, как в расширении
        root.dataset.look = v.id;
        root.dataset.theme = effTheme(v);
        document.querySelectorAll('[data-theme-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeTab === effTheme(v))));
        const ctx = LAB.ctx();
        // Свои страницы у стиля — «Случайное» и «Топ»; остальные общие (pages.js), вид задают переменные стиля
        const draw = v[state.page] || LAB.pages[state.page];
        root.innerHTML = draw(ctx, LAB.h);
        document.getElementById('styleNote').innerHTML = `<b>${esc(v.name)}</b> — ${esc(v.tagline)}`;
        // Другой стиль или другая страница — с начала; фильтры и «Показать ещё» на месте
        if (lastVariant !== `${v.id}-${state.page}`) { window.scrollTo(0, 0); lastVariant = `${v.id}-${state.page}`; }
    }
    LAB.render = render;

    function go(variant, page) {
        if (variant !== undefined) { state.variant = variant; if (variant) saveLook(); }
        if (page) state.page = page;
        state.siteMenu = false;
        const hash = state.variant ? `#${state.variant}-${state.page}` : '';
        if (location.hash !== hash) history.replaceState(null, '', hash || location.pathname);
        render();
    }
    LAB.go = go;
    // Для проверки (shoot.js): тема без сохранения выбора
    LAB.setTheme = (t) => { state.theme = t; render(); };
    LAB.themeOf = (id) => effTheme(LAB.variants.find(x => x.id === id));

    function nextRandom() {
        state.history = [state.order[state.pos], ...state.history.filter(id => id !== state.order[state.pos])].slice(0, 12);
        state.pos++;
        if (state.pos >= state.order.length) shuffleOrder();
        state.descOpen = false;
        state.spin++;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function openHistory(id) {
        const cur = state.order[state.pos];
        state.history = [cur, ...state.history.filter(x => x !== id && x !== cur)].slice(0, 12);
        state.order.splice(state.pos, 0, id);
        state.order = state.order.filter((x, i) => i <= state.pos || x !== id);
        state.descOpen = false;
        state.spin++;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ---------- Кадры на весь экран ----------
    const lb = { shots: [], i: 0 };
    function lightbox(shots, i) {
        lb.shots = shots;
        lb.i = i;
        const box = document.getElementById('lightbox');
        box.hidden = false;
        paintLightbox();
        box.querySelector('.lb__close').focus();
    }
    function paintLightbox() {
        const box = document.getElementById('lightbox');
        const s = lb.shots[lb.i];
        const img = box.querySelector('img');
        img.src = s.thumb;
        const full = new Image();
        full.referrerPolicy = 'no-referrer';
        full.onload = () => { if (lb.shots[lb.i] === s) img.src = s.full; };
        full.src = s.full;
        box.querySelector('.lb__count').textContent = `${lb.i + 1} / ${lb.shots.length}`;
    }
    const closeLightbox = () => { document.getElementById('lightbox').hidden = true; };
    const lbStep = (d) => { lb.i = (lb.i + d + lb.shots.length) % lb.shots.length; paintLightbox(); };

    let toastTimer = 0;
    function toast(text) {
        const t = document.getElementById('toast');
        t.textContent = text;
        t.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
    }

    // ---------- Нажатия: все через data-act ----------
    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act], [data-variant-tab], [data-page-tab], [data-theme-tab]');
        if (!el) {
            if (state.siteMenu && !e.target.closest('.site-menu')) { state.siteMenu = false; render(); }
            return;
        }
        if (el.dataset.variantTab !== undefined) return go(el.dataset.variantTab || null);
        if (el.dataset.pageTab) return go(undefined, el.dataset.pageTab);
        if (el.dataset.themeTab) { state.theme = el.dataset.themeTab; saveLook(); return render(); }
        const act = el.dataset.act;
        const v = el.dataset.v;
        if (act === 'next') nextRandom();
        else if (act === 'history') openHistory(Number(v));
        else if (act === 'fr-open') {
            if (byId.has(Number(v))) openHistory(Number(v));
            else toast('В расширении здесь откроется карточка этого тайтла: в презентации его нет');
        } else if (act && act.startsWith('fr-')) { if (state.fr && window.AgFranchiseView.handle(state.fr, act, v)) render(); }
        else if (act === 'desc') { state.descOpen = !state.descOpen; render(); }
        else if (act === 'shot') lightbox(current().shots, Number(v));
        else if (act === 'kind') { state.kind = v; state.shown = TOP_STEP; render(); }
        else if (act === 'band') { state.band = v; state.shown = TOP_STEP; render(); }
        else if (act === 'site-menu') { state.siteMenu = !state.siteMenu; render(); }
        else if (act === 'site') { state.site = v; state.siteMenu = false; render(); toast(`Тайтлы будут открываться на ${LAB.h.site(v).name}`); }
        else if (act === 'more') { state.shown += TOP_STEP; render(); }
        else if (act === 'open-top') {
            e.preventDefault();
            window.open(`https://shikimori.io/animes/${v}`, '_blank', 'noopener');
            toast(`В расширении тайтл откроется на ${LAB.h.site(state.site).name}. В презентации — страница на Shikimori`);
        } else if (act === 'settings') { state.ui.setPane = 'random'; go(undefined, 'settings'); }
        else if (act === 'go') go(v, 'random');
        else if (act === 'page') go(undefined, v);
        else if (act === 'look') { state.variant = v; saveLook(); render(); toast(`Визуал: «${LAB.variants.find(x => x.id === v).name}»`); }
        else if (act === 'theme') { state.theme = v; saveLook(); render(); }
        else if (act === 'toast') toast(v);
        else if (act === 'popup-sites') { state.ui.popupSites = !state.ui.popupSites; render(); }
        else if (act === 'popup-kind') { state.ui.popupKind = v; render(); }
        else if (act === 'popup-music') { state.ui.popupMusic = !state.ui.popupMusic; render(); }
        else if (act && act.startsWith('set-') || act && /^(voice-|key-wait|help-type)/.test(act)) { settingsAct(act, v); render(); }
        else if (act === 'dock') {
            if (v === 'rate') { state.ui.dock = 'closed'; render(); toast('На странице тайтла лиса предложит оценку: звёзды уходят прямо в Shikimori'); }
            else { state.ui.dock = v; render(); }
        } else if (act === 'popup-power') { state.ui.popupOn = !state.ui.popupOn; render(); toast(state.ui.popupOn ? 'Anime+ включено' : 'Anime+ выключено на всех сайтах'); }
        else if (act === 'popup-site') { const off = new Set(state.ui.siteOff); if (off.has(v)) off.delete(v); else off.add(v); state.ui.siteOff = [...off]; render(); }
        else if (act === 'popup-login') { state.ui.popupLogged = true; render(); toast('В расширении откроется Shikimori; здесь — пример после входа'); }
        else if (act === 'popup-logout') { state.ui.popupLogged = false; render(); }
        else if (act === 'popup-tab') { state.ui.popupTab = v; render(); }
        else if (act === 'settings-help') { state.ui.setPane = 'help'; go(undefined, 'settings'); }
        else if (act === 'sched-day') { const sec = document.getElementById(`ks-day-${v}`); if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        else if (act === 'sched-fresh') { state.ui.schedF.fresh = !state.ui.schedF.fresh; render(); }
        else if (act === 'sched-type') { const t = state.ui.schedF.types; state.ui.schedF.types = t.includes(v) ? t.filter(x => x !== v) : [...t, v]; render(); }
        else if (act === 'sched-panel') { state.ui.schedPanel = !state.ui.schedPanel; render(); }
        else if (act === 'sched-flag') { state.ui.schedF[v] = !state.ui.schedF[v]; render(); }
        else if (act === 'sched-min') { state.ui.schedF.min = Number(v); render(); }
        else if (act && act.startsWith('pk-')) { LAB.pickAct(act, v); render(); window.scrollTo({ top: 0 }); }
        else if (act === 'lb-close') closeLightbox();
        else if (act === 'lb-prev') lbStep(-1);
        else if (act === 'lb-next') lbStep(1);
    });

    // Настройки: действия страницы pages.settings
    function settingsAct(act, v) {
        const u = state.ui;
        if (act === 'set-pane') { u.setPane = v; u.keyWait = null; }
        else if (act === 'set-skin') u.skin = v;
        else if (act === 'set-labels') u.labels = !u.labels;
        else if (act === 'set-thumb') u.thumb = !u.thumb;
        else if (act === 'set-accent') u.accent = v;
        else if (act === 'set-autovoice') u.autoVoice = !u.autoVoice;
        else if (act === 'set-score') u.rScore = v;
        else if (act === 'set-kind') u.rKinds = u.rKinds.includes(v) ? u.rKinds.filter(k => k !== v) : [...u.rKinds, v];
        else if (act === 'help-type') u.helpType = v;
        else if (act === 'key-wait') u.keyWait = u.keyWait === v ? null : v;
        else if (act === 'voice-up' || act === 'voice-down') {
            const i = Number(v);
            const j = act === 'voice-up' ? i - 1 : i + 1;
            if (j >= 0 && j < u.voices.length) [u.voices[i], u.voices[j]] = [u.voices[j], u.voices[i]];
        } else if (act === 'voice-del') u.voices.splice(Number(v), 1);
        else if (act === 'voice-add') { if (!u.voices.includes('AniDUB')) u.voices.push('AniDUB'); }
        if (state.ui.setPane === 'random' && /set-(score|kind)/.test(act)) {
            const k = { tv: 'Сериалы', movie: 'Фильмы', ova: 'OVA', ona: 'ONA', special: 'Спешлы' };
            LAB.randomFilters = `${u.rScore === 'any' ? 'Любая оценка' : `Оценка от ${u.rScore}`} · ${u.rKinds.map(x => k[x]).join(', ') || 'типы не выбраны'}`;
        }
    }

    // Поиск в расписании: перерисовка на каждую букву, курсор остаётся в поле
    document.addEventListener('input', (e) => {
        if (e.target.dataset.input !== 'sched-q') return;
        state.ui.schedQ = e.target.value;
        render();
        const box = document.querySelector('[data-input="sched-q"]');
        if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    });

    document.addEventListener('keydown', (e) => {
        // Перепривязка клавиши на странице настроек: следующее нажатие и есть новая клавиша
        if (state.ui.keyWait && state.page === 'settings') {
            e.preventDefault();
            if (e.key !== 'Escape' && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
                state.ui.keys[state.ui.keyWait] = `${e.shiftKey && e.key.length === 1 && !/[a-zа-я0-9]/i.test(e.key) ? 'shift+' : ''}${e.key.toLowerCase()}`;
            }
            state.ui.keyWait = null;
            render();
            return;
        }
        const box = document.getElementById('lightbox');
        if (!box.hidden) {
            if (e.key === 'Escape') closeLightbox();
            else if (e.key === 'ArrowLeft') lbStep(-1);
            else if (e.key === 'ArrowRight') lbStep(1);
            else return;
            e.preventDefault();
            return;
        }
        if (e.target.closest('input, textarea')) return;
        if (e.code === 'Space' && state.variant && state.page === 'random' && !e.target.closest('button, a')) { e.preventDefault(); nextRandom(); }
        if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey) { const v = LAB.variants[Number(e.key) - 1]; if (v) go(v.id); }
    });
    document.getElementById('lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });

    // Карточки и сетки с постерами: изображение не загрузилось — запасная заливка
    document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('is-broken'); }, true);

    // ---------- Обложка презентации ----------
    LAB.intro = () => {
        const sample = D.random.slice(0, LAB.variants.length);
        return `<section class="intro">
            <div class="intro__head">
                <h1>Шесть стилей для всего Anime+</h1>
                <p>«Классический» — то, как Anime+ выглядит сейчас; у каждого стиля есть светлая и тёмная тема (☀ / ☾ вверху справа), а выбрать их можно и в настройках, в разделе «Визуал расширения». Каждый стиль — рабочий прототип всех страниц расширения: окно расширения с «Музыкой», «Случайное аниме», Топ Shikimori, значок лисы и Топ поверх сайта, расписание, подбор и настройки с образцом плеера. Кнопки работают, данные настоящие: рейтинг и расписание Shikimori на ${esc(D.built)}, песни с AnimeThemes, сайты для «Случайного» нашло само расширение, подбор — настоящая логика и каталог расширения.</p>
                <p class="intro__keys">Клавиши: 1–6 — стиль, пробел — другое аниме, стрелки и Esc — в просмотре кадров. Страницы — справа вверху.</p>
            </div>
            <div class="intro__grid">${LAB.variants.map((v, i) => `
                <button class="intro__card" type="button" data-act="go" data-v="${v.id}" style="--sw1:${v.swatch[0]};--sw2:${v.swatch[1]};--sw3:${v.swatch[2]}">
                    <span class="intro__num">${i + 1}</span>
                    <span class="intro__poster"><img src="previews/${v.id}-${v.native}.jpg" alt="Как выглядит стиль «${esc(v.name)}»" onerror="this.onerror=null;this.src='${esc(sample[i].poster)}'"></span>
                    <span class="intro__name">${esc(v.name)}</span>
                    <span class="intro__tag">${esc(v.tagline)}</span>
                    <span class="intro__sw"><i></i><i></i><i></i></span>
                    <span class="intro__fonts">${esc(v.fonts)}</span>
                </button>`).join('')}
            </div>
        </section>`;
    };

    LAB.start = () => {
        const m = new RegExp(`^#([a-z]+)-(${PAGES.join('|')})$`).exec(location.hash);
        if (m && LAB.variants.some(v => v.id === m[1])) { state.variant = m[1]; state.page = m[2]; }
        else if (state.savedVariant && LAB.variants.some(v => v.id === state.savedVariant)) { state.variant = state.savedVariant; state.page = 'settings'; }
        document.getElementById('variantTabs').innerHTML = `<button type="button" data-variant-tab="">Обзор</button>` +
            LAB.variants.map((v, i) => `<button type="button" data-variant-tab="${v.id}"><span>${i + 1}</span>${esc(v.name)}</button>`).join('');
        render();
    };
})();
