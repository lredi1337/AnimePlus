// modules/looks/manga.js
// «Манга»: шаблоны «Случайного аниме» и «Топа Shikimori». Общие для расширения (random/random.js, top/top.js
// через modules/looks/look-pages.js) и презентации стилей (tools/design-lab). Шаблон только рисует разметку:
// нажатия описаны атрибутами data-act, их слушает страница. ctx и помощники h — в look-pages.js
(function (root) {
    'use strict';

    const pages = root.AgLookPages = root.AgLookPages || { styles: {} };
    pages.styles.manga = {
        random(ctx, h) {
            const t = ctx.random.item;
            return `<div class="mn">
                <div class="mn__wrap">
                    <header class="mn__head">
                        <h1 class="mn__logo">Случайное<br>аниме</h1>
                        <p class="mn__filters">${h.esc(ctx.random.filters)} <button type="button" data-act="settings">Изменить</button></p>
                        <button type="button" class="mn__burst" data-act="next"><span>Ещё!</span><small>другое аниме · пробел</small></button>
                    </header>
                    <section class="mn__page" data-spin="${ctx.random.spin}">
                        <div class="mn__panel mn__panel--poster">${h.img(t.poster, '', t.ru)}<span class="mn__stamp">${t.score}</span></div>
                        <div class="mn__panel mn__panel--title">
                            <div class="mn__bubble"><h2>${h.esc(t.ru)}</h2>${t.en !== t.ru ? `<small>${h.esc(t.en)}</small>` : ''}</div>
                            <div class="mn__tags">${t.genres.slice(0, 5).map(g => `<span>${h.esc(g)}</span>`).join('')}</div>
                            <div class="mn__facts"><b>${h.esc(h.kind(t))}</b><b>${t.year || ''}</b>${h.eps(t) ? `<b>${h.eps(t)}</b>` : ''}${h.status(t) ? `<b class="is-red">${h.status(t)}</b>` : ''}</div>
                        </div>
                        <div class="mn__panel mn__panel--story">
                            <span class="mn__caption">О чём</span>
                            <p class="${ctx.random.descOpen ? 'is-open' : ''}">${h.esc(t.description)}</p>
                            <button type="button" data-act="desc">${ctx.random.descOpen ? 'Свернуть' : 'Читать дальше ▸'}</button>
                        </div>
                        <div class="mn__panel mn__panel--sites">
                            <span class="mn__caption">Смотреть на</span>
                            <div class="mn__sites">${h.siteLinks(t, 'mn__site')}</div>
                            <a class="mn__shiki" href="https://shikimori.io/animes/${t.id}" target="_blank" rel="noopener">Shikimori ↗</a>
                        </div>
                        ${t.shots.slice(0, 6).map((s, i) => `<button type="button" class="mn__panel mn__panel--shot is-${i}" data-act="shot" data-v="${i}" aria-label="Кадр ${i + 1}">${h.img(s.thumb)}</button>`).join('')}
                    </section>
                    ${t.shots.length > 6 ? `<div class="mn__strip">${t.shots.slice(6).map((s, i) => `<button type="button" data-act="shot" data-v="${i + 6}" aria-label="Кадр ${i + 7}">${h.img(s.thumb)}</button>`).join('')}</div>` : ''}
                    ${h.franchise(t, 'mn__fr')}
                    ${ctx.random.history.length ? `<section class="mn__past"><h3>Предыдущие главы</h3><div>${ctx.random.history.map(x => `<button type="button" data-act="history" data-v="${x.id}">${h.img(x.poster)}<span>${h.esc(x.ru)}</span></button>`).join('')}</div></section>` : ''}
                </div>
            </div>`;
        },
    
        top(ctx, h) {
            const top = ctx.top;
            return `<div class="mn mn--top">
                <div class="mn__wrap">
                    <header class="mn__tophead">
                        <h1 class="mn__logo">Топ<br>Shikimori</h1>
                        <div class="mn__filters-box">
                            <div class="mn__tabs">${h.KINDS.map(([v, l]) => `<button type="button" data-act="kind" data-v="${v}" aria-pressed="${top.kind === v}">${l}</button>`).join('')}</div>
                            <div class="mn__tabs is-small"><span>Оценка</span>${h.BANDS.map(([v, l]) => `<button type="button" data-act="band" data-v="${v}" aria-pressed="${top.band === v}">${l}</button>`).join('')}</div>
                        </div>
                        <div class="mn__picker"><span>Открывать на</span>${h.sitePicker(top, 'mn-picker')}</div>
                    </header>
                    <section class="mn__grid">${top.items.map((t, i) => `
                        <a class="mn__card ${i < 3 && !top.kind && !top.band ? 'is-big' : ''}" ${h.openTop(t)}>
                            <span class="mn__cover">${h.img(t.poster)}<span class="mn__rank">${t.rank}</span><span class="mn__seal">${t.score}</span></span>
                            <b>${h.esc(t.ru)}</b><small>${h.esc(h.facts(t))}</small>
                        </a>`).join('') || `<p class="mn__none">${top.total === 0 ? 'Под эти фильтры тайтлов нет' : ''}</p>`}
                    </section>
                    ${top.more ? `<div class="mn__more"><button type="button" data-act="more">Перевернуть страницу ▸</button></div>` : ''}
                </div>
            </div>`;
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
