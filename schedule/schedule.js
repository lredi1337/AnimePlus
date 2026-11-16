// schedule/schedule.js
// Расписание онгоингов: собственная страница расширения, от вёрстки сайтов не зависит. Неделя с понедельника по воскресенье,
// каждый тайтл стоит в своём дне всю неделю: вышедшая серия получает метку «вышла» и остаётся на месте.
// Серии недели, память о них и список зрителя отдаёт фон (get_week_schedule, modules/bg-schedule.js),
// фильтры применяются здесь и хранятся в настройках (ag_settings.schedule). Правила: modules/shared/schedule-core.js.
// Режимы те же, что у Топа (modules/shared/ext-page.js): поверх сайта из значка и вкладкой из окна расширения.

(function () {
    'use strict';

    const X = window.AgExtPage;
    const S = window.AgSchedule;
    const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const HOUR = 60 * 60 * 1000;
    const RELOAD_AFTER_MS = 10 * 60 * 1000;
    const REPAINT_AFTER_MS = 60 * 1000;
    const SWITCHES = [
        ['hideCn', 'Китайское', (e) => e.cn],
        ['hideKids', 'Детское', (e, sign) => sign.kids],
        ['hideShort', 'Короткие серии, до 10 минут', (e, sign) => sign.short],
        ['hideUnrated', 'Без оценки на Shikimori', (e) => !(e.score > 0)]
    ];

    const h = (tag, attrs = {}, ...children) => {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'style') node.style.cssText = v;
            else if (v !== false && v != null) node.setAttribute(k, v);
        });
        children.flat().forEach(c => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
        return node;
    };
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'серия' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'серии' : 'серий');
    const uniqueTitles = (entries) => [...new Map(entries.map(e => [e.id, e])).values()];

    /** Метка времени на постере. Время выхода — японский эфир по данным Shikimori */
    function whenLabel(entry, now, isToday) {
        if (entry.at <= now) return { text: 'вышла', cls: 'is-out' };
        if (isToday) {
            const left = entry.at - now;
            if (left < HOUR) return { text: `через ${Math.max(1, Math.round(left / 60000))} мин`, cls: 'is-soon' };
            if (left < 3 * HOUR) return { text: `через ${Math.round(left / HOUR)} ч`, cls: 'is-soon' };
        }
        return { text: hhmm(new Date(entry.at)), cls: '' };
    }

    function render(ctx, sites, settings) {
        let { site, origin } = ctx;
        let f = S.filters(settings);
        let query = '';
        let data = null;
        let failed = false;
        let loadedAt = 0;
        let paintedAt = 0;
        let scrolledToToday = false;

        document.documentElement.classList.toggle('is-embed', ctx.embed);
        const save = () => { Promise.resolve(window.agPatchSettings({ schedule: f })).catch(() => {}); };
        const change = (patch) => { f = { ...f, ...patch }; save(); paint(); };
        const badgeOf = (x) => h('span', { class: 'sch__badge', style: `background:${x.color};color:${window.AgUI.onAccent(x.color)}` }, x.short);

        // ---------- Заголовок: поиск, сайт или закрытие ----------
        const search = h('input', { class: 'sch__search', type: 'search', placeholder: 'Найти тайтл', 'aria-label': 'Найти тайтл в расписании', autocomplete: 'off' });
        search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); paint(); });
        let headSide = '';
        if (ctx.embed) {
            const close = h('button', { class: 'sch__close', type: 'button', 'aria-label': 'Закрыть', title: 'Закрыть (Esc)' }, window.AgUI.iconEl('close', 16));
            close.addEventListener('click', () => X.tellDock({ type: 'close' }));
            headSide = close;
        } else if (ctx.pick) {
            const current = h('span', { style: 'display:flex;align-items:center;gap:8px' });
            const showCurrent = () => current.replaceChildren(badgeOf(site), site.name);
            showCurrent();
            const toggle = h('button', { class: 'sch__picker-btn', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': 'На каком сайте открывать тайтл' },
                current, h('span', { class: 'sch__picker-arrow', 'aria-hidden': 'true' }, '▾'));
            const options = sites.map(x => h('button', { class: 'sch__site', type: 'button', role: 'option', 'aria-selected': String(x.id === site.id), 'data-site': x.id }, badgeOf(x), x.name));
            const list = h('div', { class: 'sch__picker-list', role: 'listbox', hidden: '' }, options);
            const picker = h('div', { class: 'sch__picker' }, toggle, list);
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
                origin = await X.workingOrigin(x);
                options.forEach(o => o.setAttribute('aria-selected', String(o === option)));
                showCurrent();
                feed.querySelectorAll('.sch__busy, .sch__choices').forEach(el => el.remove());
                X.rememberPick(x);
            }));
            headSide = [h('span', { class: 'sch__label' }, 'Открывать на'), picker];
        }

        // ---------- Быстрые фильтры и панель ----------
        const days = h('nav', { class: 'sch__days', 'aria-label': 'Дни недели' });
        const mineChip = h('button', { class: 'sch__chip sch__chip--soft', type: 'button', hidden: '', title: 'Тайтлы из списка «Смотрю» на Shikimori' }, 'Мой список');
        const freshChip = h('button', { class: 'sch__chip sch__chip--soft', type: 'button', title: 'Тайтлы, которые начались в последние три месяца' }, 'Новинки сезона');
        const typeBox = h('span', { style: 'display:contents' });
        const filtersBtn = h('button', { class: 'sch__chip', type: 'button', 'aria-expanded': 'false' });
        const count = h('span', { class: 'sch__count', role: 'status' });
        mineChip.addEventListener('click', () => change({ mine: !f.mine }));
        freshChip.addEventListener('click', () => change({ fresh: !f.fresh }));

        const switches = SWITCHES.map(([key, label]) => {
            const n = h('span', { class: 'sch__n' });
            const b = h('button', { class: 'sch__sw', type: 'button', 'data-key': key }, h('i'), label, n);
            b.addEventListener('click', () => change({ [key]: !f[key] }));
            return b;
        });
        const seg = (key, options) => {
            const box = h('div', { class: 'sch__seg', role: 'group' });
            for (const [value, label] of options) {
                const b = h('button', { type: 'button', 'data-value': String(value) }, label);
                b.addEventListener('click', () => change({ [key]: value }));
                box.append(b);
            }
            box.sync = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === String(f[key]))));
            return box;
        };
        const segLong = seg('long', [[0, 'Показывать'], [30, 'Скрыть от 30 серий'], [50, 'от 50'], [100, 'от 100']]);
        const segMin = seg('min', S.MIN_STEPS.map(v => [v, v ? `от ${v}` : 'Любая']));
        const segSort = seg('sort', [['time', 'По времени'], ['score', 'По оценке']]);
        const longNote = h('p');
        const hiddenNote = h('p', { style: 'margin-top:0' });
        const hiddenList = h('div', { class: 'sch__hidden' });
        const genreBox = h('div', { class: 'sch__genres' });
        const panel = h('section', { class: 'sch__panel', id: 'schPanel', hidden: '', 'aria-label': 'Фильтры расписания' },
            h('div', { class: 'sch__group' }, h('h2', {}, 'Не показывать'), switches),
            h('div', { class: 'sch__group' },
                h('h2', {}, 'Длинные сериалы'), segLong, longNote,
                h('h2', {}, 'Оценка на Shikimori'), segMin, h('p', {}, 'Тайтлы без оценки проходят: у премьер её ещё нет.')),
            h('div', { class: 'sch__group' },
                h('h2', {}, 'Порядок внутри дня'), segSort,
                h('h2', {}, 'Скрытые тайтлы'), hiddenNote, hiddenList),
            h('div', { class: 'sch__group sch__group--wide' },
                h('h2', {}, 'Скрыть жанры'), genreBox, h('p', {}, 'Тайтлы из вашего списка «Смотрю» видны всегда, какие бы фильтры ни стояли.')));
        filtersBtn.setAttribute('aria-controls', 'schPanel');
        filtersBtn.addEventListener('click', () => {
            panel.hidden = !panel.hidden;
            filtersBtn.setAttribute('aria-expanded', String(!panel.hidden));
        });

        const feed = h('main', { class: 'sch__feed' });
        const note = h('div', { class: 'sch__note' });
        const scroll = h('div', { class: 'sch__scroll' },
            days,
            h('div', { class: 'sch__quick' }, mineChip, freshChip, h('span', { class: 'sch__sep', 'aria-hidden': 'true' }), typeBox, h('span', { class: 'sch__sep', 'aria-hidden': 'true' }), filtersBtn, count),
            panel, feed, note);
        const app = document.getElementById('app');
        app.replaceChildren(
            h('header', { class: 'sch__head' },
                h('h1', {}, window.AgUI.iconEl('calendar', 22), 'Расписание'),
                h('span', { class: 'sch__hint' }, ctx.embed ? `Выход серий в Японии. Тайтл откроется на ${site.name}` : 'Выход серий в Японии, время по вашим часам'),
                h('div', { class: 'sch__tools' }, search, headSide)),
            scroll);
        // Поверх сайта прокручивается окно под заголовком, во вкладке — вся страница
        const scrollBox = ctx.embed ? scroll : null;

        if (ctx.embed) {
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape') X.tellDock({ type: 'close' }); });
            document.addEventListener('mousedown', (e) => { if (!app.contains(e.target)) X.tellDock({ type: 'close' }); });
        }

        // ---------- Тайтл ----------
        const openItem = async (card, entry) => {
            if (card.querySelector('.sch__busy, .sch__choices')) return;
            const poster = card.querySelector('.sch__poster');
            const busy = h('div', { class: 'sch__busy' }, `Ищем на ${site.name}…`);
            poster.append(busy);
            const target = site;
            const url = await X.findOnSite(target, origin, { id: entry.id, titles: [entry.name, entry.russian].filter(Boolean), year: String(entry.airedOn || '').slice(0, 4) });
            if (target !== site) { busy.remove(); return; } // пока искали, зритель выбрал другой сайт
            if (url) { window.AgSchedulePage.navigate(url); return; }
            busy.remove();
            poster.append(h('div', { class: 'sch__choices' },
                h('span', {}, `Нет на ${site.name}`),
                h('a', { href: `https://shikimori.io/animes/${entry.id}`, target: '_blank', rel: 'noopener' }, 'Shikimori ↗')));
        };

        const makeCard = (entry, now, isToday) => {
            const watching = data.watching;
            const mine = !!watching && Object.hasOwn(watching, entry.id);
            const out = entry.at <= now;
            const seen = mine && out && entry.ep <= watching[entry.id];
            const title = entry.russian || entry.name;
            const img = h('img', {
                alt: '', decoding: 'async', loading: 'lazy', referrerpolicy: 'no-referrer',
                src: entry.poster ? window.agNormalizePosterUrl(entry.poster) : '',
                'data-ag-poster-id': entry.id, 'data-ag-poster-ru': entry.russian || '', 'data-ag-poster-en': entry.name || ''
            });
            const when = whenLabel(entry, now, isToday);
            let tag = '';
            if (mine && out) tag = h('span', { class: `sch__tag ${seen ? 'is-seen' : 'is-mine'}` }, seen ? 'Просмотрено' : 'Не смотрели');
            else if (mine) tag = h('span', { class: 'sch__tag is-mine' }, 'В списке');
            else if (entry.ep === 1) tag = h('span', { class: 'sch__tag' }, 'Премьера');
            const hide = h('button', { class: 'sch__hide', type: 'button', title: 'Не показывать этот тайтл', 'aria-label': `Не показывать: ${title}` }, '×');
            hide.addEventListener('click', (e) => {
                e.stopPropagation();
                change({ hidden: [...f.hidden, entry.id], hiddenNames: { ...(f.hiddenNames || {}), [entry.id]: title } });
            });
            const meta = [`${entry.ep} серия${entry.episodes ? ` из ${entry.episodes}` : ''}`, entry.kind];
            if (entry.cn) meta.push('Китай');
            const card = h('div', { class: `sch__card${mine ? ' is-mine' : ''}${seen ? ' is-seen' : ''}`, role: 'button', tabindex: '0', title, 'data-id': entry.id },
                h('div', { class: 'sch__poster' }, img,
                    h('span', { class: `sch__when ${when.cls}` }, when.text),
                    entry.score > 0 ? h('span', { class: 'sch__score' }, `★ ${Number(entry.score).toFixed(1)}`) : '',
                    tag, hide),
                h('div', { class: 'sch__title' }, title),
                h('div', { class: 'sch__meta' }, meta.join(' · ')));
            card.addEventListener('click', () => openItem(card, entry));
            card.addEventListener('keydown', (e) => {
                if (e.target !== card || (e.key !== 'Enter' && e.key !== ' ')) return;
                e.preventDefault();
                openItem(card, entry);
            });
            return card;
        };

        // ---------- Отрисовка ----------
        const spy = () => {
            const line = days.getBoundingClientRect().bottom + 30;
            let current = null;
            feed.querySelectorAll('.sch__day').forEach(sec => { if (sec.getBoundingClientRect().top <= line) current = sec.dataset.day; });
            if (current === null) { const first = feed.querySelector('.sch__day'); current = first ? first.dataset.day : null; }
            days.querySelectorAll('.sch__chip').forEach(b => b.classList.toggle('is-on', b.dataset.day === current));
        };
        (scrollBox || window).addEventListener('scroll', spy, { passive: true });

        const reset = () => {
            query = '';
            search.value = '';
            change({ ...S.DEFAULT_FILTERS, hiddenNames: {} });
        };
        const resetLink = (text) => {
            const b = h('button', { class: 'sch__link', type: 'button' }, text);
            b.addEventListener('click', reset);
            return b;
        };

        function syncControls(shownTitles, now) {
            const titles = uniqueTitles(data.entries);
            mineChip.hidden = !data.watching;
            mineChip.setAttribute('aria-pressed', String(f.mine));
            freshChip.setAttribute('aria-pressed', String(f.fresh));

            const kinds = [...new Set(titles.map(e => e.kind))].sort((a, b) => titles.filter(e => e.kind === b).length - titles.filter(e => e.kind === a).length);
            typeBox.replaceChildren(...kinds.map((kind) => {
                const b = h('button', { class: 'sch__chip sch__chip--soft', type: 'button', 'aria-pressed': String(f.types.includes(kind)), 'data-kind': kind },
                    kind, h('span', { class: 'sch__n' }, titles.filter(e => e.kind === kind).length));
                b.addEventListener('click', () => change({ types: f.types.includes(kind) ? f.types.filter(k => k !== kind) : [...f.types, kind] }));
                return b;
            }));

            switches.forEach((b, i) => {
                b.setAttribute('aria-pressed', String(!!f[SWITCHES[i][0]]));
                b.querySelector('.sch__n').textContent = titles.filter(e => SWITCHES[i][2](e, S.flags(e, now))).length;
            });
            [segLong, segMin, segSort].forEach(box => box.sync());
            const long = f.long ? titles.map(e => ({ e, len: S.flags(e, now).len })).filter(x => x.len >= f.long).sort((a, b) => b.len - a.len) : [];
            longNote.textContent = f.long
                ? (long.length ? `Сейчас это ${long.length}: ${long.slice(0, 3).map(x => `${x.e.russian || x.e.name} (${x.len})`).join(', ')}${long.length > 3 ? ' и другие' : ''}.` : 'На этой неделе таких нет.')
                : 'Например, «Ван-Пис» и «Детектив Конан».';

            const genreCount = new Map();
            titles.forEach(e => (e.genres || []).forEach(g => genreCount.set(g, (genreCount.get(g) || 0) + 1)));
            // Выбранный жанр остаётся в списке, даже если на этой неделе его нет: иначе его не снять
            f.noGenres.forEach(g => { if (!genreCount.has(g)) genreCount.set(g, 0); });
            genreBox.replaceChildren(...[...genreCount].filter(([g]) => g !== 'Детское').sort((a, b) => b[1] - a[1]).map(([g, n]) => {
                const b = h('button', { type: 'button', 'aria-pressed': String(f.noGenres.includes(g)), 'data-genre': g }, `${g} ${n}`);
                b.addEventListener('click', () => change({ noGenres: f.noGenres.includes(g) ? f.noGenres.filter(x => x !== g) : [...f.noGenres, g] }));
                return b;
            }));

            hiddenNote.textContent = f.hidden.length ? 'Нажмите на тайтл, чтобы вернуть его.' : 'Пока ничего. Крестик на постере убирает тайтл из расписания.';
            hiddenList.replaceChildren(...f.hidden.map((id) => {
                const known = titles.find(e => e.id === id);
                const name = (f.hiddenNames && f.hiddenNames[id]) || (known && (known.russian || known.name)) || `Тайтл ${id}`;
                const b = h('button', { type: 'button', title: `Вернуть: ${name}` }, name);
                b.addEventListener('click', () => {
                    const names = { ...(f.hiddenNames || {}) };
                    delete names[id];
                    change({ hidden: f.hidden.filter(x => x !== id), hiddenNames: names });
                });
                return b;
            }));

            const active = SWITCHES.filter(([key]) => f[key]).length + (f.long ? 1 : 0) + (f.min ? 1 : 0) + f.noGenres.length + (f.hidden.length ? 1 : 0);
            filtersBtn.replaceChildren(window.AgUI.iconEl('sliders', 14), active ? `Фильтры · ${active}` : 'Фильтры');
            count.replaceChildren(`Тайтлов: ${shownTitles} из ${titles.length}`);
            const base = S.DEFAULT_FILTERS;
            const changed = query || Object.keys(base).some(key => JSON.stringify(f[key]) !== JSON.stringify(base[key]));
            if (changed) count.append(' · ', resetLink('Сбросить'));
        }

        function paint() {
            const now = Date.now();
            paintedAt = now;
            feed.replaceChildren();
            if (!data) {
                days.replaceChildren();
                if (failed) {
                    const retry = h('button', { class: 'sch__link', type: 'button' }, 'Повторить');
                    retry.addEventListener('click', load);
                    note.replaceChildren('Не удалось загрузить расписание. ', retry);
                } else {
                    note.textContent = 'Загрузка…';
                }
                return;
            }
            const start = S.weekStart(now);
            const todayIndex = (new Date(now).getDay() + 6) % 7;
            const shown = data.entries.filter(e => S.passes(e, f, { query, watching: data.watching, now }));
            const byScore = (a, b) => b.score - a.score || a.at - b.at;
            const byTime = (a, b) => a.at - b.at || b.score - a.score;
            days.replaceChildren();
            for (let i = 0; i < 7; i++) {
                // Полдень: дата дня не съезжает в неделю с переводом часов
                const date = new Date(start + i * S.DAY + 12 * HOUR);
                const items = shown.filter(e => e.day === i).sort(f.sort === 'score' ? byScore : byTime);
                const isToday = i === todayIndex;
                const tab = h('button', { class: `sch__chip${items.length ? '' : ' is-empty'}${isToday ? ' is-today' : ''}`, type: 'button', 'data-day': i },
                    `${SHORT[date.getDay()]} ${date.getDate()}`, h('span', { class: 'sch__n' }, items.length));
                tab.addEventListener('click', () => {
                    const target = feed.querySelector(`.sch__day[data-day="${i}"]`);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                days.append(tab);
                if (!items.length) continue;
                const heading = isToday ? `Сегодня, ${WEEKDAYS[date.getDay()]}` : `${cap(WEEKDAYS[date.getDay()])}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
                feed.append(h('section', { class: `sch__day${isToday ? ' is-today' : ''}`, 'data-day': i },
                    h('h2', {}, heading, h('small', {}, `${items.length} ${plural(items.length)}`)),
                    h('div', { class: 'sch__grid' }, items.map(e => makeCard(e, now, isToday)))));
            }
            if (window.agBindPostersIn) window.agBindPostersIn(feed);

            if (!data.entries.length) {
                note.replaceChildren(h('b', {}, 'На этой неделе серий нет'), 'Shikimori не отдал ни одного онгоинга.');
            } else if (!shown.length) {
                note.replaceChildren(h('b', {}, 'Под эти фильтры ничего не подошло'), 'Ослабьте фильтры или ', resetLink('сбросьте их'));
            } else {
                note.replaceChildren();
            }
            syncControls(uniqueTitles(shown).length, now);

            // Страница открывается на сегодняшнем дне, прошедшие дни недели остаются выше
            if (!scrolledToToday) {
                scrolledToToday = true;
                const today = feed.querySelector('.sch__day.is-today');
                if (today && today !== feed.querySelector('.sch__day')) today.scrollIntoView({ block: 'start' });
            }
            spy();
        }

        async function load() {
            failed = false;
            if (!data) paint();
            const res = await window.agSendMessage({ action: 'get_week_schedule' });
            loadedAt = Date.now();
            // Сеть не ответила, а серии этой недели фон помнит: показываем их
            if (res && Array.isArray(res.entries) && (res.loaded || res.entries.length)) data = { entries: res.entries, watching: res.watching || null };
            else if (!data) failed = true;
            paint();
        }

        // Вкладку могли оставить открытой: при возвращении метки времени и сами серии обновляются
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - loadedAt > RELOAD_AFTER_MS) load();
            else if (data && Date.now() - paintedAt > REPAINT_AFTER_MS && !feed.querySelector('.sch__busy, .sch__choices')) paint();
        });

        load();
        if (ctx.embed) app.querySelector('.sch__close').focus();
    }

    async function start() {
        // Адреса переехавших сайтов, которые зритель добавил сам, читаются из хранилища
        await window.AgSites.ready;
        const ctx = X.readContext(location.search);
        const app = document.getElementById('app');
        const say = (text) => app.replaceChildren(h('p', { class: 'sch__note' }, text));
        if (!ctx) return say('Откройте расписание со значка Anime+ на сайте с аниме или из окна расширения.');
        const settings = await window.getSettings();
        if (!ctx.pick) return render(ctx, [], settings);
        const picked = await X.pickContext(ctx);
        if (!picked) return say('Все сайты выключены: включите хотя бы один в окне расширения.');
        return render(picked.ctx, picked.sites, settings);
    }

    // Переход на тайтл. Поверх сайта его делает значок: кадр не может сам увести страницу сайта.
    // В тестах подменяется: в jsdom переход на другой адрес не работает
    const navigate = (url) => {
        if (document.documentElement.classList.contains('is-embed')) X.tellDock({ type: 'open', url });
        else location.assign(url);
    };

    window.AgSchedulePage = { start, navigate, whenLabel };
    if (!window.AG_SCHEDULE_NO_AUTOSTART) start();
})();
