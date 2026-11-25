// modules/looks/cinema.js
// «Кинозал»: шаблоны «Случайного аниме» и «Топа Shikimori». Общие для расширения (random/random.js, top/top.js
// через modules/looks/look-pages.js) и презентации стилей (tools/design-lab). Шаблон только рисует разметку:
// нажатия описаны атрибутами data-act, их слушает страница. ctx и помощники h — в look-pages.js
(function (root) {
    'use strict';

    const pages = root.AgLookPages = root.AgLookPages || { styles: {} };
    pages.styles.cinema = {
        random(ctx, h) {
            const t = ctx.random.item;
            const bg = t.shots[0] ? t.shots[0].full : t.poster;
            return `<div class="cn">
                <div class="cn__bg" style="background-image:url('${h.esc(bg)}')"></div>
                <div class="cn__wrap">
                    <header class="cn__top">
                        <span class="cn__kicker">Случайное аниме</span>
                        <span class="cn__filters">${h.esc(ctx.random.filters)} <button type="button" class="cn__link" data-act="settings">Изменить</button></span>
                        <button type="button" class="cn__next" data-act="next">Другое аниме <kbd>пробел</kbd></button>
                    </header>
                    <section class="cn__hero" data-spin="${ctx.random.spin}">
                        <div class="cn__poster">${h.img(t.poster, '', t.ru)}</div>
                        <div class="cn__info">
                            <div class="cn__meta"><b>★ ${t.score}</b><span>${h.esc(h.kind(t))}</span><span>${t.year || ''}</span>${h.eps(t) ? `<span>${h.eps(t)}</span>` : ''}${h.status(t) ? `<span class="is-live">${h.status(t)}</span>` : ''}</div>
                            <h1>${h.esc(t.ru)}</h1>
                            ${t.en !== t.ru ? `<div class="cn__en">${h.esc(t.en)}</div>` : ''}
                            <div class="cn__genres">${t.genres.slice(0, 5).map(g => `<span>${h.esc(g)}</span>`).join('')}</div>
                            <p class="cn__desc ${ctx.random.descOpen ? 'is-open' : ''}">${h.esc(t.description)}</p>
                            <button type="button" class="cn__link" data-act="desc">${ctx.random.descOpen ? 'Свернуть' : 'Подробнее'}</button>
                            <div class="cn__watch">
                                <span class="cn__label">Смотреть на</span>
                                <div class="cn__sites">${h.siteLinks(t, 'cn__site')}</div>
                                <a class="cn__shiki" href="https://shikimori.io/animes/${t.id}" target="_blank" rel="noopener">Shikimori ↗</a>
                            </div>
                        </div>
                    </section>
                    <section class="cn__strip">
                        <h2>Кадры <span>${t.shots.length}</span></h2>
                        <div class="cn__film">${t.shots.map((s, i) => `<button type="button" data-act="shot" data-v="${i}" aria-label="Кадр ${i + 1}">${h.img(s.thumb)}</button>`).join('')}</div>
                    </section>
                    ${h.franchise(t, 'cn__fr')}
                    ${ctx.random.history.length ? `<section class="cn__history"><h2>Уже выпадали</h2><div>${ctx.random.history.map(x => `<button type="button" data-act="history" data-v="${x.id}" title="${h.esc(x.ru)}">${h.img(x.poster)}<span>${h.esc(x.ru)}</span></button>`).join('')}</div></section>` : ''}
                </div>
            </div>`;
        },
    
        top(ctx, h) {
            const top = ctx.top;
            const [a, b, c, ...rest] = top.items;
            const spot = [a, b, c].filter(Boolean);
            return `<div class="cn cn--top">
                <div class="cn__wrap">
                    <header class="cn__tophead">
                        <h1>Топ Shikimori</h1>
                        <div class="cn__tabs">${h.KINDS.map(([v, l]) => `<button type="button" data-act="kind" data-v="${v}" aria-pressed="${top.kind === v}">${l}</button>`).join('')}</div>
                        <div class="cn__bands"><span>Оценка</span>${h.BANDS.map(([v, l]) => `<button type="button" data-act="band" data-v="${v}" aria-pressed="${top.band === v}">${l}</button>`).join('')}</div>
                        <div class="cn__picker-wrap"><span>Открывать на</span>${h.sitePicker(top, 'cn-picker')}</div>
                    </header>
                    ${spot.length ? `<section class="cn__spot">${spot.map(t => `
                        <a class="cn__spotcard" ${h.openTop(t)}>
                            <span class="cn__spotbg" style="background-image:url('${h.esc(t.poster)}')"></span>
                            <span class="cn__spotrank">${t.rank}</span>
                            ${h.img(t.poster, 'cn__spotposter')}
                            <span class="cn__spotinfo"><b>${h.esc(t.ru)}</b><em>★ ${t.score} · ${h.esc(h.facts(t))}</em><small>${h.esc(t.genres.slice(0, 3).join(' · '))}</small></span>
                        </a>`).join('')}</section>` : `<p class="cn__empty">${top.total === 0 ? 'Под эти фильтры тайтлов нет' : ''}</p>`}
                    <section class="cn__grid">${rest.map(t => `
                        <a class="cn__card" ${h.openTop(t)}>
                            <span class="cn__cover">${h.img(t.poster)}<span class="cn__rank">${t.rank}</span><span class="cn__score">★ ${t.score}</span></span>
                            <b>${h.esc(t.ru)}</b><small>${h.esc(h.facts(t))}</small>
                        </a>`).join('')}</section>
                    ${top.more ? `<div class="cn__more"><button type="button" data-act="more">Показать ещё${top.total == null ? '' : ` · осталось ${top.total - top.items.length}`}</button></div>` : ''}
                </div>
            </div>`;
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
