// tools/design-lab/pages-real.js
// Окно расширения и расписание — так, как они устроены в расширении на самом деле (popup/popup.html, schedule/schedule.js):
// те же части в том же порядке, те же значки (modules/shared/ui-kit.js) и те же правила фильтров расписания
// (modules/shared/schedule-core.js). Стиль меняет только вид — через переменные --k-*.

(function () {
    'use strict';

    const LAB = window.LAB;
    const D = window.LAB_DATA;
    const h = LAB.h;
    const esc = h.esc;
    const S = window.AgSchedule;
    const icon = (name, size = 16) => (window.AgUI ? window.AgUI.icon(name, size) : '');
    const FOX = '../../assets/logo.svg';
    const DAY = 864e5;
    const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    const SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const time = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const KIND_UP = { tv: 'TV', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'Спешл' };

    // ---------- Окно расширения ----------
    // Список «Смотрю» — пример после входа: настоящие онгоинги, просмотрено на серию меньше вышедших
    const watching = D.schedule.filter(x => x.poster && x.score >= 7).slice(0, 9).map((x, i) => ({ ...x, seen: Math.max(1, x.ep - 1 - (i % 2)) }));
    const rewatching = D.top.filter(t => t.kind === 'tv').slice(0, 4).map(t => ({ ...t, seen: Math.max(1, Math.round((t.eps || 12) / 3)), total: t.eps }));

    LAB.pages.popup = (ctx) => {
        const st = ctx.ui;
        const off = new Set(st.siteOff || []);
        const cont = watching[0];
        const list = (st.popupTab === 'rewatching' ? rewatching : watching).filter(w => {
            const k = (w.kind || '').toLowerCase();
            if (st.popupKind === 'tv') return k === 'tv';
            if (st.popupKind === 'movie') return k === 'movie';
            if (st.popupKind === 'ova') return k === 'ova' || k === 'ona';
            return true;
        });
        const songs = (D.songs && D.songs[cont.id]) || [];
        const track = (s) => `<a class="kp__track" href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${cont.en} ${s.type}${s.n} ${s.title}`)}" target="_blank" rel="noopener"><b>${s.type}${s.n}</b><span>${esc(s.title)}<small>${esc(s.artist)}</small></span>${icon('play', 14)}</a>`;
        return `<div class="k k-popup-scene">
            <img class="k-scene-bg" src="site.jpg" alt="">
            <div class="k-toolbar"><span>animego.me</span><i class="k-ext-icon"><img src="${FOX}" alt=""></i></div>
            <section class="k-popup kp ${st.popupOn === false ? 'is-off' : ''}" aria-label="Окно расширения">
                <header class="kp__head">
                    <span class="kp__brand"><img src="${FOX}" alt="">Anime<b>+</b></span>
                    <button type="button" class="kp__sitebtn ${st.popupSites ? 'is-open' : ''}" data-act="popup-sites" aria-expanded="${st.popupSites}"><i class="kp__dot"></i>Выбрать сайт<span class="kp__chev">${st.popupSites ? '⌃' : '⌄'}</span></button>
                    <button type="button" class="kp__icon" data-act="page" data-v="settings" aria-label="Настройки" title="Настройки">${icon('gear', 18)}</button>
                    <button type="button" class="kp__power" role="switch" aria-checked="${st.popupOn !== false}" data-act="popup-power" aria-label="Anime+ включено"><i></i></button>
                </header>
                ${st.popupSites ? `<div class="kp__sites">
                    <p class="kp__hint">Нажмите на сайт, чтобы открыть его. Переключатель выключает Anime+ на сайте</p>
                    <ul class="kp__grid">${D.sites.map(s => `<li class="kp__tile ${off.has(s.id) ? 'is-off' : ''}">
                        <a class="kp__tile-open" href="${esc(s.home)}" target="_blank" rel="noopener"><b class="kp__badge" style="background:${s.color};color:${h.onAccent(s.color)}">${esc(s.short)}</b><span class="kp__tile-name">${esc(s.name)}</span><span class="kp__tile-host">${esc(new URL(s.home).host)}</span></a>
                        <button type="button" class="kp__switch" role="switch" aria-checked="${!off.has(s.id)}" data-act="popup-site" data-v="${s.id}" aria-label="Anime+ на ${esc(s.name)}"><i></i></button>
                    </li>`).join('')}</ul>
                </div>` : ''}
                ${st.popupLogged && !st.popupSites ? `<a class="kp__continue" href="https://shikimori.io/animes/${cont.id}" target="_blank" rel="noopener">
                    <span class="kp__continue-bg" style="background-image:url('${esc(cont.poster)}')"></span>
                    <img class="kp__continue-poster" src="${esc(cont.poster)}" alt="" referrerpolicy="no-referrer">
                    <span class="kp__continue-body"><small>Продолжить</small><b>${esc(cont.ru)}</b><em>Серия ${cont.seen + 1} · AnimeGO</em><i class="kp__progress"><s style="width:54%"></s></i></span>
                    <span class="kp__continue-play">${icon('play', 18)}</span>
                </a>` : ''}
                <div class="kp__profile">
                    ${st.popupLogged ? `
                    <div class="kp__profile-row">
                        <span class="kp__avatar">З</span>
                        <span class="kp__profile-main"><b>Зритель</b><small>Shikimori · подключено</small></span>
                        <span class="kp__stat"><b>3</b><small>серий сегодня</small></span>
                        <button type="button" class="kp__logout" data-act="popup-logout">Выйти</button>
                    </div>
                    <div class="kp__status">
                        <button type="button" class="kp__status-btn" aria-pressed="${st.popupTab !== 'rewatching'}" data-act="popup-tab" data-v="watching">${icon('list', 14)}Смотрю</button>
                        <button type="button" class="kp__status-btn" aria-pressed="${st.popupTab === 'rewatching'}" data-act="popup-tab" data-v="rewatching">${icon('refresh', 14)}Пересматриваю</button>
                        <button type="button" class="kp__status-search" aria-label="Поиск в списке" data-act="toast" data-v="Поиск по списку «Смотрю»">${icon('search', 15)}</button>
                    </div>
                    <div class="kp__pills">${[['all', 'Все'], ['tv', 'TV'], ['movie', 'Фильмы'], ['ova', 'OVA/ONA']].map(([v, l]) => `<button type="button" class="kp__pill" aria-pressed="${(st.popupKind || 'all') === v}" data-act="popup-kind" data-v="${v}">${l}</button>`).join('')}</div>
                    <div class="kp__list">${list.map(w => {
                        const eps = `${w.seen}${w.total ? `/${w.total}` : ''}`;
                        return `<a class="kp__card" href="https://shikimori.io/animes/${w.id}" target="_blank" rel="noopener" title="${esc(w.ru)}. Просмотрено: ${eps}">
                            <span class="kp__cover"><img src="${esc(w.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="kp__eps">${eps}</span><i class="kp__progress"><s style="width:${w.total ? Math.round(w.seen / w.total * 100) : 30}%"></s></i><span class="kp__play">${icon('play', 18)}</span></span>
                            <span class="kp__card-title">${esc(w.ru)}</span>
                        </a>`;
                    }).join('') || '<div class="kp__empty">В этом списке пока ничего нет.</div>'}</div>
                    <p class="kp__note">После входа: пример списка из настоящих онгоингов, не ваш профиль</p>` : `
                    <p class="kp__hint">Подключите Shikimori, чтобы серии отмечались автоматически</p>
                    <button type="button" class="kp__login" data-act="popup-login">${icon('key', 16)}Войти через Shikimori</button>
                    <p class="kp__hint is-center">Нажмите «Разрешить» на открывшейся странице, и вход выполнится сам</p>`}
                </div>
                <nav class="kp__tabs">
                    <button type="button" class="kp__tab" aria-pressed="${!!st.popupMusic}" data-act="popup-music" title="Музыка" aria-label="Музыка: опенинги и эндинги">${icon('music', 18)}</button>
                    <button type="button" class="kp__tab" data-act="page" data-v="schedule" title="Расписание" aria-label="Расписание онгоингов">${icon('calendar', 18)}</button>
                    <button type="button" class="kp__tab" data-act="page" data-v="top" title="Топ" aria-label="Топ Shikimori">${icon('trophy', 18)}</button>
                    <button type="button" class="kp__tab" data-act="page" data-v="random" title="Случайное аниме" aria-label="Случайное аниме">${icon('dice', 18)}</button>
                    <button type="button" class="kp__tab" data-act="page" data-v="pick" title="Подобрать аниме" aria-label="Подобрать аниме вопросами">${icon('compass', 18)}</button>
                </nav>
                ${st.popupMusic ? `<div class="kp__music">
                    <div class="kp__music-info"><b>Аниме:</b> ${esc(cont.ru)}<br><b>Серия:</b> ${cont.seen + 1}</div>
                    ${songs.length ? `<div class="kp__tracks">${songs.filter(s => s.type === 'OP').map(track).join('')}</div><div class="kp__tracks">${songs.filter(s => s.type === 'ED').map(track).join('')}</div>` : '<div class="kp__empty">Песен этого тайтла нет</div>'}
                </div>` : ''}
                <button type="button" class="kp__support" data-act="settings-help"><img src="${FOX}" alt=""><span>Что-то не работает? <b>Напишите нам</b></span></button>
                <div class="kp__footer"><button type="button" class="kp__rate" data-act="toast" data-v="Откроется страница Anime+ в Chrome Web Store">★ Оценить</button><a href="https://shikimori.io" target="_blank" rel="noopener">Shikimori</a></div>
            </section>
            <aside class="k-scene-hint k-card"><b>Окно расширения</b><span>Как сейчас в Anime+: «Выбрать сайт», вход через Shikimori, значки внизу. Значки открывают страницы презентации.</span></aside>
        </div>`;
    };

    // ---------- Расписание ----------
    const weekStart = S.weekStart(D.builtAt || Date.now());
    // Серии недели: следующая серия из календаря и вышедшая на этой неделе (на неделю раньше следующей)
    const entries = (() => {
        const list = [];
        const add = (x, ep, at) => {
            if (at < weekStart || at >= weekStart + 7 * DAY) return;
            list.push({
                ...x, ep, time: at, russian: x.ru, name: x.en, cn: S.isChinese(x.native), duration: (x.duration || 0) / 60,
                episodes: x.total, genres: x.kids ? [...(x.genres || []), 'Детское'] : (x.genres || [])
            });
        };
        for (const x of D.schedule) {
            const at = new Date(x.at).getTime();
            if (x.ep > 1) add(x, x.ep - 1, at - 7 * DAY);
            add(x, x.ep, at);
        }
        return list.sort((a, b) => a.time - b.time);
    })();
    const SWITCHES = [['hideCn', 'Китайское'], ['hideKids', 'Детское'], ['hideShort', 'Короткие серии, до 10 минут'], ['hideUnrated', 'Без оценки на Shikimori']];

    LAB.pages.schedule = (ctx) => {
        const st = ctx.ui;
        const f = st.schedF;
        const now = Date.now();
        const query = (st.schedQ || '').trim().toLowerCase();
        const shown = entries.filter(e => S.passes(e, f, { query, now }));
        const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart + i * DAY));
        const inDay = (list, d) => list.filter(e => new Date(e.time).toDateString() === d.toDateString());
        const todayKey = new Date(now).toDateString();
        const kinds = [...new Set(entries.map(e => e.kind))].sort((a, b) => entries.filter(e => e.kind === b).length - entries.filter(e => e.kind === a).length);
        const titles = (list) => new Set(list.map(e => e.id)).size;
        const hidesOn = SWITCHES.filter(([k]) => f[k]).length + (f.min ? 1 : 0);
        return `<div class="k"><div class="k-wrap ks">
            <header class="ks__head">
                <h1>${icon('calendar', 22)}Расписание</h1>
                <span class="k-mute">Выход серий в Японии, время по вашим часам</span>
                <span class="k-spacer"></span>
                <input class="k-input ks__search" type="search" placeholder="Найти тайтл" value="${esc(st.schedQ || '')}" data-input="sched-q" aria-label="Найти тайтл">
                <span class="k-mute">Открывать на</span>${h.sitePicker(ctx.top, 'k-picker')}
            </header>
            <nav class="ks__days">${days.map((d, i) => `<button type="button" class="ks__day" aria-pressed="${d.toDateString() === todayKey}" data-act="sched-day" data-v="${i}">${SHORT[d.getDay()]} ${d.getDate()}<small>${inDay(shown, d).length}</small></button>`).join('')}</nav>
            <div class="ks__filters">
                <button type="button" class="k-chip" aria-pressed="${f.fresh}" data-act="sched-fresh">Новинки сезона</button>
                ${kinds.map(k => `<button type="button" class="k-chip" aria-pressed="${f.types.includes(k)}" data-act="sched-type" data-v="${k}">${KIND_UP[k] || k}<small>${titles(entries.filter(e => e.kind === k))}</small></button>`).join('')}
                <button type="button" class="k-chip" aria-pressed="${!!st.schedPanel}" data-act="sched-panel">${icon('sliders', 14)}Фильтры${hidesOn ? ` · ${hidesOn}` : ''}</button>
                <span class="k-spacer"></span>
                <span class="k-mute">Тайтлов: ${titles(shown)} из ${titles(entries)}</span>
            </div>
            ${st.schedPanel ? `<div class="k-card ks__panel">
                <div><b class="k-label">Не показывать</b>${SWITCHES.map(([k, l]) => `<button type="button" class="k-switch" role="switch" aria-checked="${!!f[k]}" data-act="sched-flag" data-v="${k}"><i></i>${l}</button>`).join('')}</div>
                <div><b class="k-label">Оценка Shikimori от</b><div class="k-row is-wrap">${S.MIN_STEPS.map(m => `<button type="button" class="k-chip" aria-pressed="${f.min === m}" data-act="sched-min" data-v="${m}">${m ? m : 'Любая'}</button>`).join('')}</div></div>
            </div>` : ''}
            ${days.map((d, i) => {
                const list = inDay(shown, d);
                const isToday = d.toDateString() === todayKey;
                return `<section class="ks__section ${isToday ? 'is-today' : ''}" id="ks-day-${i}">
                    <h2>${isToday ? `<i class="ks__dot"></i>Сегодня, ${WEEKDAYS[d.getDay()]}` : `${WEEKDAYS[d.getDay()][0].toUpperCase()}${WEEKDAYS[d.getDay()].slice(1)}, ${d.getDate()} ${MONTHS[d.getMonth()]}`}<small>${list.length} ${list.length % 10 === 1 && list.length % 100 !== 11 ? 'серия' : (list.length % 10 >= 2 && list.length % 10 <= 4 && (list.length % 100 < 12 || list.length % 100 > 14) ? 'серии' : 'серий')}</small></h2>
                    ${list.length ? `<div class="ks__grid">${list.map(e => {
                        const aired = e.time <= now;
                        return `<a class="ks__card" href="https://shikimori.io/animes/${e.id}" target="_blank" rel="noopener" title="${esc(e.ru)}">
                            <span class="ks__cover"><img src="${esc(e.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer"><b class="ks__badge ${aired ? 'is-aired' : ''}">${aired ? 'вышла' : time(new Date(e.time))}</b>${e.score ? `<i class="ks__score">★ ${e.score}</i>` : ''}</span>
                            <span class="ks__name">${esc(e.ru)}</span>
                            <small class="ks__meta">${e.ep} серия${e.total ? ` из ${e.total}` : ''} · ${KIND_UP[e.kind] || e.kind}</small>
                        </a>`;
                    }).join('')}</div>` : '<p class="k-mute">Под фильтры ничего не попало</p>'}
                </section>`;
            }).join('')}
            <p class="k-mute k-foot">Календарь Shikimori на ${esc(D.built)}. Правила фильтров — те же, что в расширении.</p>
        </div></div>`;
    };
})();
