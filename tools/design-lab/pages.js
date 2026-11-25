// tools/design-lab/pages.js
// Страницы, общие для всех стилей: Топ поверх сайта (значок лисы), «Случайное» и Топ в общем виде, подбор и настройки.
// Окно расширения и расписание — в pages-real.js.
// Разметка одна, а вид задаёт стиль: цвета, шрифты, рамки и тени — через переменные --k-* в styles/*.css.
// Подбор работает на настоящей логике расширения (modules/shared/pick-core.js) и настоящем каталоге.

(function () {
    'use strict';

    const LAB = window.LAB;
    const D = window.LAB_DATA;
    const h = LAB.h;
    const esc = h.esc;
    const FOX = '../../assets/logo.svg';
    const DAY = 864e5;
    const time = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const pages = LAB.pages = {};

    // ---------- Серии недели для «Расписания» в меню лисы ----------
    const weekStart = (() => { const d = new Date(D.builtAt || Date.now()); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
    const week = (() => {
        const list = [];
        for (const x of D.schedule) {
            const at = new Date(x.at).getTime();
            // Вышедшая на этой неделе серия: следующая через неделю, значит, эта была на неделю раньше
            if (x.ep > 1 && at - 7 * DAY >= weekStart && at - 7 * DAY < weekStart + 7 * DAY) list.push({ ...x, ep: x.ep - 1, time: at - 7 * DAY });
            if (at >= weekStart && at < weekStart + 7 * DAY) list.push({ ...x, time: at });
        }
        return list.sort((a, b) => a.time - b.time);
    })();

    // ---------- Топ поверх сайта: значок лисы и его меню ----------
    const compactTop = (ctx) => {
        const items = ctx.top.items.slice(0, 18);
        return `<div class="k-panel__bar">
                <b class="k-panel__title">Топ Shikimori</b>
                <div class="k-tabs">${h.KINDS.slice(0, 4).map(([v, l]) => `<button type="button" class="k-tab" data-act="kind" data-v="${v}" aria-pressed="${ctx.top.kind === v}">${l}</button>`).join('')}</div>
                <span class="k-mute">Тайтл откроется на AnimeGO — на этом сайте</span>
            </div>
            <div class="k-panel__grid">${items.map(t => `<a class="k-tile" ${h.openTop(t)}><span class="k-tile__cover">${h.img(t.poster)}<b class="k-rank">${t.rank}</b><i class="k-score">★ ${t.score}</i></span><span class="k-tile__name">${esc(t.ru)}</span></a>`).join('')}</div>`;
    };
    const compactSchedule = () => {
        const today = week.filter(x => new Date(x.time).toDateString() === new Date(D.builtAt).toDateString());
        return `<div class="k-panel__bar"><b class="k-panel__title">Сегодня в расписании</b><span class="k-mute">${today.length} серий</span></div>
            <ul class="k-panel__list">${today.map(x => `<li><a href="https://shikimori.io/animes/${x.id}" target="_blank" rel="noopener"><b class="k-time">${time(new Date(x.time))}</b>${h.img(x.poster)}<span><b>${esc(x.ru)}</b><small>Серия ${x.ep}${x.total ? ` из ${x.total}` : ''}</small></span></a></li>`).join('')}</ul>`;
    };
    const compactRandom = (ctx) => {
        const t = ctx.random.item;
        const here = (t.sites || []).find(s => s.id === 'animego');
        return `<div class="k-panel__random">
                ${h.img(t.poster, 'k-panel__poster')}
                <div><b class="k-panel__title">${esc(t.ru)}</b><p class="k-mute">★ ${t.score} · ${esc(h.facts(t))} · ${esc(t.genres.slice(0, 3).join(', '))}</p><p class="k-panel__desc">${esc(t.description)}</p>
                <div class="k-row">${here ? `<a class="k-btn is-primary" href="${esc(here.url)}" target="_blank" rel="noopener">Открыть на этом сайте</a>` : '<span class="k-mute">На этом сайте не нашлось</span>'}<button type="button" class="k-btn" data-act="next">Другое аниме</button></div></div>
            </div>`;
    };

    pages.onsite = (ctx) => {
        const st = ctx.ui;
        const panel = st.dock === 'top' ? compactTop(ctx) : st.dock === 'schedule' ? compactSchedule() : st.dock === 'random' ? compactRandom(ctx) : '';
        const menu = [['rate', '★', 'Оценить этот тайтл'], ['top', '♛', 'Топ Shikimori'], ['schedule', '▦', 'Расписание'], ['random', '⚄', 'Случайное аниме']];
        return `<div class="k k-site-scene">
            <img class="k-scene-bg is-sharp" src="site.jpg" alt="Главная страница AnimeGO">
            ${panel ? `<div class="k-scene-dim" data-act="dock" data-v="closed"></div><section class="k-panel k-card" aria-label="Поверх сайта">${panel}<button type="button" class="k-icon k-panel__close" data-act="dock" data-v="closed" aria-label="Закрыть">×</button></section>` : ''}
            ${st.dock === 'menu' ? `<nav class="k-dock-menu k-card">${menu.map(([v, i, l]) => `<button type="button" data-act="dock" data-v="${v}"><i>${i}</i>${l}</button>`).join('')}</nav>` : ''}
            <button type="button" class="k-fox" data-act="dock" data-v="${st.dock === 'menu' ? 'closed' : 'menu'}" aria-label="Меню Anime+"><img src="${FOX}" alt=""></button>
            <aside class="k-scene-hint k-card"><b>Значок лисы на сайте</b><span>Нажмите на лису: меню с Топом, расписанием и случайным аниме. Вёрстка сайта не меняется — всё открывается поверх.</span></aside>
        </div>`;
    };

    // ---------- «Случайное аниме» и «Топ» в общем виде: так они выглядят сейчас в расширении («Классический») ----------
    pages.random = (ctx) => {
        const t = ctx.random.item;
        const thumbs = t.shots.slice(0, 8);
        return `<div class="k"><div class="k-wrap">
            <header class="k-head k-head--bar">
                <h1>Случайное аниме</h1>
                <span class="k-mute">${esc(ctx.random.filters)}</span><button type="button" class="k-link" data-act="settings">Изменить</button>
                <span class="k-spacer"></span>
                <button type="button" class="k-btn is-primary" data-act="next">⚄ Другое аниме</button>
            </header>
            <article class="k-card k-rnd" data-spin="${ctx.random.spin}">
                <span class="k-rnd__bg" style="background-image:url('${esc(t.poster)}')"></span>
                ${h.img(t.poster, 'k-rnd__poster', t.ru)}
                <div class="k-rnd__info">
                    <h2>${esc(t.ru)}</h2>
                    ${t.en !== t.ru ? `<div class="k-mute">${esc(t.en)}</div>` : ''}
                    <div class="k-row is-wrap"><span class="k-tag is-score">★ ${t.score}</span><span class="k-tag">${esc(h.kind(t))}</span><span class="k-tag">${t.year || ''}</span>${h.eps(t) ? `<span class="k-tag">${h.eps(t)}</span>` : ''}${h.status(t) ? `<span class="k-tag is-live">${h.status(t)}</span>` : ''}</div>
                    <div class="k-mute">${esc(t.genres.slice(0, 4).join(' · '))}</div>
                    <p class="k-rnd__desc ${ctx.random.descOpen ? 'is-open' : ''}">${esc(t.description)}</p>
                    <button type="button" class="k-link" data-act="desc">${ctx.random.descOpen ? 'Свернуть' : 'Подробнее'}</button>
                    <section class="k-rnd__watch"><div class="k-row is-between"><b class="k-label">Смотреть на</b><a class="k-btn is-ghost" href="https://shikimori.io/animes/${t.id}" target="_blank" rel="noopener">Shikimori ↗</a></div><div class="k-row is-wrap">${h.siteLinks(t, 'k-sitebtn')}</div></section>
                </div>
                <section class="k-rnd__shots"><b class="k-label">Кадры · ${t.shots.length}</b><div>${thumbs.map((s, i) => `<button type="button" data-act="shot" data-v="${i}" aria-label="Кадр ${i + 1}">${h.img(s.thumb)}${i === 7 && t.shots.length > 8 ? `<span>+${t.shots.length - 8}</span>` : ''}</button>`).join('')}</div></section>
            </article>
            ${ctx.random.history.length ? `<section class="k-rnd__past"><b class="k-label">Уже выпадали</b><div>${ctx.random.history.map(x => `<button type="button" class="k-tile" data-act="history" data-v="${x.id}"><span class="k-tile__cover">${h.img(x.poster)}</span><span class="k-tile__name">${esc(x.ru)}</span></button>`).join('')}</div></section>` : ''}
        </div></div>`;
    };

    pages.top = (ctx) => {
        const top = ctx.top;
        return `<div class="k"><div class="k-wrap">
            <header class="k-head k-head--bar">
                <h1>♛ Топ Shikimori</h1>
                <span class="k-spacer"></span>
                <span class="k-label">Открывать на</span>${h.sitePicker(top, 'k-picker')}
            </header>
            <div class="k-row is-wrap"><div class="k-tabs">${h.KINDS.map(([v, l]) => `<button type="button" class="k-tab" data-act="kind" data-v="${v}" aria-pressed="${top.kind === v}">${l}</button>`).join('')}</div>
                <span class="k-spacer"></span><span class="k-label">Оценка</span><div class="k-tabs">${h.BANDS.map(([v, l]) => `<button type="button" class="k-tab" data-act="band" data-v="${v}" aria-pressed="${top.band === v}">${l}</button>`).join('')}</div></div>
            <div class="k-topgrid">${top.items.map(t => `<a class="k-tile" ${h.openTop(t)}><span class="k-tile__cover">${h.img(t.poster)}<b class="k-rank">#${t.rank}</b><i class="k-score">★ ${t.score}</i></span><span class="k-tile__name">${esc(t.ru)}</span><small class="k-mute">${esc(h.facts(t))}</small></a>`).join('') || '<p class="k-mute">Под эти фильтры в презентации тайтлов нет</p>'}</div>
            ${top.more ? `<div class="k-row is-center"><button type="button" class="k-btn" data-act="more">Показать ещё</button></div>` : ''}
        </div></div>`;
    };

    // ---------- Настройки: те же разделы, что в расширении (options/) ----------
    const SKINS = [['compact', 'Классика'], ['minimal', 'Тихий'], ['glass', 'Стекло'], ['cinema', 'Кино'], ['islands', 'Острова'], ['custom', 'Своя тема']];
    const KEYS = [['fs', 'На весь экран'], ['skip', 'Пропустить песню или перемотать на 89 секунд'], ['next', 'Следующая серия'], ['prev', 'Предыдущая серия'], ['forward', 'Вперёд на 5 секунд'], ['rewind', 'Назад на 5 секунд'], ['mute', 'Выключить и вернуть звук'], ['volUp', 'Громче на 5%'], ['volDown', 'Тише на 5%'], ['speedUp', 'Быстрее'], ['speedDown', 'Медленнее']];
    const KEY_NAMES = { arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', ' ': 'Пробел', escape: 'Esc', enter: 'Enter' };
    LAB.keyLabel = (k) => String(k).split('+').map(p => (p === 'shift' ? 'Shift' : KEY_NAMES[p] || (p.length === 1 ? p.toUpperCase() : p))).join(' + ');
    const ACCENTS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
    const PANES = [['look', 'Оформление'], ['player', 'Вид плеера'], ['voice', 'Озвучка'], ['keys', 'Клавиши'], ['random', 'Случайное аниме'], ['help', 'Помощь']];
    // Как в расширении: темы две, пока зритель не выбрал сам, отмечена родная тема стиля
    const THEMES = [['light', '☀ Светлая'], ['dark', '☾ Тёмная']];
    const shownTheme = (look) => {
        if (look.theme !== 'auto') return look.theme;
        const v = look.variants.find(x => x.id === look.variant);
        return (v && v.native) || 'dark';
    };
    const SCORES = ['any', '6.0', '6.5', '7.0', '7.5', '8.0', '8.5'];
    const RKINDS = [['tv', 'Сериалы'], ['movie', 'Фильмы'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешлы']];
    const sw = (act, on, label, v = '') => `<button type="button" class="k-switch" role="switch" aria-checked="${on}" data-act="${act}" data-v="${v}"><i></i>${label}</button>`;

    function playerPreview(st) {
        const t = D.random[3] || D.random[0];
        const frame = (t.shots[2] || t.shots[0] || {}).full || t.poster;
        return `<div class="k-pv sk-${st.skin} ${st.labels ? 'has-labels' : ''} ${st.thumb ? 'has-thumb' : ''}" style="--pv-accent:${st.accent}">
            <img src="${esc(frame)}" alt="" referrerpolicy="no-referrer">
            <span class="k-pv__title">${esc(t.ru)} · Серия 7</span>
            <span class="k-pv__skip">Пропустить опенинг ▸</span>
            <div class="k-pv__bar">
                <i class="k-pv__track"><s></s><b></b></i>
                <span class="k-pv__btns"><em>⏮</em><em class="is-big">▶</em><em>⏭</em><em>+89</em><small>07:42 / 23:50</small></span>
                <span class="k-pv__right"><em data-l="Серии">☰</em><em data-l="Озвучка">🎙︎</em><em data-l="Плеер">▣</em><em>⚙</em><em>⛶</em></span>
            </div>
        </div>`;
    }

    pages.settings = (ctx) => {
        const st = ctx.ui;
        let pane = '';
        if (st.setPane === 'look') {
            const look = ctx.look;
            pane = `<h2>Оформление</h2>
                <p class="k-mute">Окно расширения, «Случайное аниме», Топ, расписание, подбор и эти настройки. Плеер оформляется в разделе «Вид плеера».</p>
                <b class="k-label">Тема</b>
                <div class="k-row"><div class="k-theme" role="group" aria-label="Тема">${THEMES.map(([v, l]) => `<button type="button" data-act="theme" data-v="${v}" aria-pressed="${shownTheme(look) === v}">${l}</button>`).join('')}</div></div>
                <b class="k-label k-gap">Стиль</b>
                <div class="k-look">${look.variants.map(v => {
                    const t = look.theme === 'auto' ? v.native : look.theme;
                    return `<button type="button" class="k-look__card ${v.id === look.variant ? 'is-on' : ''}" data-act="look" data-v="${v.id}" aria-pressed="${v.id === look.variant}">
                        <img src="previews/${v.id}-${t}.jpg" alt="Как выглядит «${esc(v.name)}», ${t === 'light' ? 'светлая' : 'тёмная'} тема" onerror="this.style.visibility='hidden'">
                        <b>${esc(v.name)}</b><small>${esc(v.tagline)}</small>${v.id === look.variant ? '<em>Выбран сейчас</em>' : ''}
                    </button>`;
                }).join('')}</div>`;
        } else if (st.setPane === 'player') {
            pane = `<h2>Вид плеера</h2><p class="k-mute">Одна оболочка на всех плеерах сайтов. Образец меняется сразу.</p>
                ${playerPreview(st)}
                <div class="k-skins">${SKINS.map(([id, name]) => `<button type="button" class="k-skin ${st.skin === id ? 'is-on' : ''}" data-act="set-skin" data-v="${id}" aria-pressed="${st.skin === id}"><span class="k-skin__mini sk-${id}"><i></i></span>${name}</button>`).join('')}</div>
                <div class="k-set-grid">
                    <div class="k-card k-set-box"><b class="k-label">Кнопки</b>${sw('set-labels', st.labels, 'Подписи у кнопок «Серии», «Озвучка», «Плеер»')}${sw('set-thumb', st.thumb, 'Ползунок шкалы виден всегда')}</div>
                    <div class="k-card k-set-box"><b class="k-label">Акцент</b><span class="k-mute">Шкала, текущая серия, пропуск</span><div class="k-row is-wrap">${ACCENTS.map(c => `<button type="button" class="k-swatch ${st.accent === c ? 'is-on' : ''}" style="--c:${c}" data-act="set-accent" data-v="${c}" aria-label="Цвет ${c}"></button>`).join('')}</div></div>
                </div>`;
        } else if (st.setPane === 'voice') {
            pane = `<h2>Озвучка</h2>
                ${sw('set-autovoice', st.autoVoice, 'Автовыбор озвучки: плеер сам включает первую из списка, какая есть у серии')}
                <p class="k-mute">Приоритет: выше — важнее</p>
                <ol class="k-voices">${st.voices.map((v, i) => `<li class="k-card"><span class="k-voices__n">${i + 1}</span><b>${esc(v)}</b><button type="button" class="k-icon" data-act="voice-up" data-v="${i}" aria-label="Выше" ${i ? '' : 'disabled'}>↑</button><button type="button" class="k-icon" data-act="voice-down" data-v="${i}" aria-label="Ниже" ${i < st.voices.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="k-icon" data-act="voice-del" data-v="${i}" aria-label="Убрать">×</button></li>`).join('')}</ol>
                <div class="k-row"><button type="button" class="k-btn" data-act="voice-add">Добавить AniDUB</button></div>`;
        } else if (st.setPane === 'keys') {
            pane = `<h2>Клавиши</h2><p class="k-mute">Нажмите на клавишу справа, затем на нужную на клавиатуре. Esc отменяет. Работает и здесь.</p>
                <div class="k-keys">${KEYS.map(([id, label]) => `<div class="k-keys__row"><span>${label}</span><button type="button" class="k-kbd ${st.keyWait === id ? 'is-wait' : ''}" data-act="key-wait" data-v="${id}">${st.keyWait === id ? 'Нажмите клавишу…' : esc(LAB.keyLabel(st.keys[id]))}</button></div>`).join('')}</div>`;
        } else if (st.setPane === 'random') {
            pane = `<h2>Случайное аниме</h2><p class="k-mute">Для «Случайного аниме» в окне расширения и в меню лисы на сайте.</p>
                <b class="k-label">Минимальная оценка на Shikimori</b>
                <div class="k-row is-wrap">${SCORES.map(s => `<button type="button" class="k-chip" data-act="set-score" data-v="${s}" aria-pressed="${st.rScore === s}">${s === 'any' ? 'Без ограничений' : `От ${s}`}</button>`).join('')}</div>
                <b class="k-label k-gap">Типы</b>
                <div class="k-row is-wrap">${RKINDS.map(([v, l]) => `<button type="button" class="k-chip" data-act="set-kind" data-v="${v}" aria-pressed="${st.rKinds.includes(v)}">${l}</button>`).join('')}</div>
                <p class="k-mute k-gap">Сейчас: ${st.rScore === 'any' ? 'любая оценка' : `оценка от ${st.rScore}`} · ${st.rKinds.length ? st.rKinds.map(k => RKINDS.find(x => x[0] === k)[1]).join(', ') : 'типы не выбраны'}</p>`;
        } else {
            pane = `<h2>Помощь</h2>
                <div class="k-set-grid">
                    <form class="k-card k-set-box" data-act="noop" onsubmit="return false">
                        <b class="k-label">Написать нам</b>
                        <span class="k-mute">Ошибка или идея. Если что-то сломалось, укажите сайт, тайтл и серию.</span>
                        <div class="k-row">${['Ошибка', 'Идея'].map(x => `<button type="button" class="k-chip" data-act="help-type" data-v="${x}" aria-pressed="${st.helpType === x}">${x}</button>`).join('')}</div>
                        <textarea class="k-input" rows="5" placeholder="Например: AnimeGO, «Фрирен», 12 серия — не пропускается опенинг"></textarea>
                        <div class="k-row is-end"><button type="button" class="k-btn is-primary" data-act="toast" data-v="В презентации письмо не отправляется">Отправить</button></div>
                    </form>
                    <div class="k-card k-set-box"><b class="k-label">Экскурсия</b><span class="k-mute">Лиса заново покажет, что умеет расширение.</span><div class="k-row"><button type="button" class="k-btn" data-act="toast" data-v="В расширении лиса начнёт экскурсию">Повторить экскурсию</button></div></div>
                </div>`;
        }
        return `<div class="k"><div class="k-wrap k-settings">
            <nav class="k-card k-set-nav"><b class="k-set-brand"><img src="${FOX}" alt="">Настройки</b>${PANES.map(([id, l]) => `<button type="button" data-act="set-pane" data-v="${id}" aria-current="${st.setPane === id}">${l}</button>`).join('')}</nav>
            <section class="k-set-pane">${pane}</section>
        </div></div>`;
    };

    // ---------- Подбор: настоящая логика расширения ----------
    const P = window.AgPick;
    const cat = P && window.PICK_CATALOG ? P.unpack(window.PICK_CATALOG) : null;
    const pk = { view: 'start', state: null, current: null, picked: new Set(), env: { year: new Date().getFullYear(), stable: { veteran: 'mid' }, recent: new Set(), recentLiked: new Set(), recentShown: new Set(), seen: new Set() } };
    const POSTER = 'https://shikimori.io/uploads/poster/animes/';
    const pUrl = (t) => (t.poster ? POSTER + t.poster : '');
    const ANSWERS = [['yes', 'Да'], ['prob', 'Скорее да'], ['skip', 'Не важно'], ['probno', 'Скорее нет'], ['no', 'Нет']];
    const nextQ = () => {
        if (P.shouldStop(cat, pk.state, pk.env)) return finish();
        pk.current = P.nextQuestion(cat, pk.state, pk.env);
        if (pk.current && pk.current.stable) { pk.state.askedVeteran = true; pk.current = P.nextQuestion(cat, pk.state, pk.env); }
        if (!pk.current) return finish();
        pk.picked = new Set();
        pk.view = 'ask';
    };
    const finish = () => {
        const r = P.pickResults(cat, pk.state, pk.env, 8, [], Math.random);
        pk.state.shown = r.list;
        pk.state.roles = r.roles;
        pk.view = 'results';
    };
    LAB.pickAct = (act, v) => {
        if (!cat) return;
        if (act === 'pk-start') { pk.state = P.newState(v || undefined); nextQ(); }
        else if (act === 'pk-ans') { P.answer(pk.state, pk.current, v); nextQ(); }
        else if (act === 'pk-opt') { const id = /^\d+$/.test(v) ? Number(v) : v; if (pk.picked.has(id)) pk.picked.delete(id); else pk.picked.add(id); }
        else if (act === 'pk-next') { P.answer(pk.state, pk.current, 'pick', [...pk.picked]); nextQ(); }
        else if (act === 'pk-back') { const last = P.undo(pk.state); if (last) { pk.current = P.question(last.q, cat); pk.picked = new Set(); pk.view = 'ask'; } }
        else if (act === 'pk-show') finish();
        else if (act === 'pk-more') { pk.current = P.nextQuestion(cat, pk.state, pk.env); if (pk.current) { pk.picked = new Set(); pk.view = 'ask'; } }
        else if (act === 'pk-restart') pk.view = 'start';
    };

    pages.pick = () => {
        if (!cat) return '<div class="k"><div class="k-wrap"><p>Каталог подбора не загрузился: соберите данные (build-data.js)</p></div></div>';
        if (pk.view === 'start') {
            return `<div class="k"><div class="k-wrap">
                <section class="k-card k-pick-start">
                    <img src="${FOX}" alt="">
                    <div>
                        <h1>Не знаете, что посмотреть?</h1>
                        <p class="k-mute">Задам несколько вопросов и предложу сразу несколько разных вариантов. Это настоящая логика подбора из расширения и его каталог: ${cat.length} тайтлов.</p>
                        <div class="k-row"><button type="button" class="k-btn is-primary" data-act="pk-start" data-v="">Начать подбор</button></div>
                        <div class="k-row">${[['short', 'Что-то короткое'], ['nodark', 'Без мрачного'], ['laugh', 'Посмеяться'], ['surprise', 'Удиви меня']].map(([v, l]) => `<button type="button" class="k-chip" data-act="pk-start" data-v="${v}">${l}</button>`).join('')}</div>
                    </div>
                </section>
            </div></div>`;
        }
        if (pk.view === 'ask') {
            const q = pk.current;
            const prog = P.progress(cat, pk.state, pk.env);
            let body;
            if (q.liked) {
                body = `<div class="k-pick-liked">${q.shown.map(t => `<button type="button" class="k-tile ${pk.picked.has(t.id) ? 'is-on' : ''}" data-act="pk-opt" data-v="${t.id}" aria-pressed="${pk.picked.has(t.id)}"><span class="k-tile__cover">${h.img(pUrl(t))}</span><span class="k-tile__name">${esc(t.ru)}</span></button>`).join('')}</div>
                    <div class="k-row is-end"><button type="button" class="k-btn is-primary" data-act="pk-next">${pk.picked.size ? 'Дальше' : q.none}</button></div>`;
            } else if (q.choice) {
                body = `<div class="k-row is-wrap">${q.options.map(o => `<button type="button" class="k-chip is-big" data-act="pk-opt" data-v="${o.id}" aria-pressed="${pk.picked.has(o.id)}">${esc(o.label)}</button>`).join('')}</div>
                    <div class="k-row is-end"><button type="button" class="k-btn is-primary" data-act="pk-next">${pk.picked.size ? 'Дальше' : q.none}</button></div>`;
            } else {
                body = `<div class="k-pick-answers">${ANSWERS.map(([v, l]) => `<button type="button" class="k-btn ${v === 'yes' ? 'is-yes' : v === 'no' ? 'is-no' : ''}" data-act="pk-ans" data-v="${v}">${l}</button>`).join('')}</div>`;
            }
            const trail = pk.state.answers.map(a => P.answerLabel(a, cat)).filter(Boolean);
            return `<div class="k"><div class="k-wrap">
                <section class="k-card k-pick-ask">
                    <div class="k-pick-meter"><span>Подходит <b>${prog.alive}</b> из ${prog.total}</span><i class="k-progress"><s style="width:${Math.max(4, 100 - prog.alive / prog.total * 100).toFixed(1)}%"></s></i><span>вопрос ${pk.state.answers.length + 1}</span></div>
                    <div class="k-pick-q"><img src="${FOX}" alt=""><div><h1>${esc(q.t[0])}</h1>${q.hint ? `<p class="k-mute">${esc(q.hint)}</p>` : ''}</div></div>
                    ${body}
                    <div class="k-row is-between"><button type="button" class="k-btn is-ghost" data-act="pk-back" ${pk.state.answers.length ? '' : 'disabled'}>← Назад</button><button type="button" class="k-btn" data-act="pk-show">Хватит, покажите</button></div>
                    ${trail.length ? `<div class="k-row is-wrap">${trail.map(l => `<span class="k-tag ${l.yes ? 'is-yes' : 'is-no'}">${esc(l.text)}</span>`).join('')}</div>` : ''}
                </section>
                <aside class="k-card k-pick-leaders"><b class="k-label">Пока впереди</b>${prog.leaders.map(t => `<span>${h.img(pUrl(t))}<b>${esc(t.ru)}</b></span>`).join('')}</aside>
            </div></div>`;
        }
        const [first, ...rest] = pk.state.shown.map(id => cat.byId.get(id));
        const why = P.whyDistinct(rest.map(t => t.id), pk.state, pk.env, cat);
        const fact = (t) => [t.kind === 'movie' ? 'фильм' : `${t.eps || '?'} эп.`, t.year].filter(Boolean).join(' · ');
        return `<div class="k"><div class="k-wrap">
            <header class="k-head"><h1>Вот что нашлось</h1><div class="k-row is-wrap">${pk.state.answers.map(a => P.answerLabel(a, cat)).filter(Boolean).map(l => `<span class="k-tag ${l.yes ? 'is-yes' : 'is-no'}">${esc(l.text)}</span>`).join('')}</div><button type="button" class="k-btn" data-act="pk-more">Изменить ответы</button><button type="button" class="k-btn is-ghost" data-act="pk-restart">Начать заново</button></header>
            ${first ? `<a class="k-card k-pick-hero" href="https://shikimori.io/animes/${first.id}" target="_blank" rel="noopener">
                <span class="k-pick-hero__bg" style="background-image:url('${esc(pUrl(first))}')"></span>
                ${h.img(pUrl(first), 'k-pick-hero__poster')}
                <span class="k-pick-hero__info"><i class="k-role is-top">Лучше всего подходит</i><b>${esc(first.ru)}</b><small>${esc(first.en)}</small><em>★ ${first.score} · ${esc(fact(first))}</em><span>Почему вам: ${esc(P.whyFor(first, pk.state, pk.env, cat).join(', '))}</span></span>
            </a>` : ''}
            <h2 class="k-sub">Ещё варианты</h2>
            <div class="k-pick-grid">${rest.map(t => `<a class="k-tile" href="https://shikimori.io/animes/${t.id}" target="_blank" rel="noopener"><span class="k-tile__cover">${h.img(pUrl(t))}<i class="k-role is-${pk.state.roles[t.id] || 'more'}">${esc(P.ROLES[pk.state.roles[t.id]] || P.ROLES.more)}</i><i class="k-score">★ ${t.score}</i></span><span class="k-tile__name">${esc(t.ru)}</span><small class="k-mute">${esc(fact(t))} · ${esc((why[t.id] || []).join(', '))}</small></a>`).join('')}</div>
        </div></div>`;
    };
})();
