// modules/looks/bento.js
// «Плитки»: шаблоны «Случайного аниме» и «Топа Shikimori». Общие для расширения (random/random.js, top/top.js
// через modules/looks/look-pages.js) и презентации стилей (tools/design-lab). Шаблон только рисует разметку:
// нажатия описаны атрибутами data-act, их слушает страница. ctx и помощники h — в look-pages.js
(function (root) {
    'use strict';

    const pages = root.AgLookPages = root.AgLookPages || { styles: {} };
    pages.styles.bento = {
        random(ctx, h) {
            const t = ctx.random.item;
            const hue = h.hue(t.id);
            const pct = Math.max(0, Math.min(100, (t.score - 5) / 5 * 100));
            return `<div class="bt" style="--h:${hue}">
                <div class="bt__wrap">
                    <header class="bt__head">
                        <h1>Случайное аниме</h1>
                        <span class="bt__chip">${h.esc(ctx.random.filters)}</span>
                        <button type="button" class="bt__ghost" data-act="settings">Фильтры</button>
                    </header>
                    <section class="bt__grid" data-spin="${ctx.random.spin}">
                        <div class="bt__tile bt__poster">${h.img(t.poster, '', t.ru)}</div>
                        <div class="bt__tile bt__title">
                            <span class="bt__eyebrow">${h.esc(h.kind(t))}${h.status(t) ? ` · ${h.status(t)}` : ''}</span>
                            <h2>${h.esc(t.ru)}</h2>
                            ${t.en !== t.ru ? `<p>${h.esc(t.en)}</p>` : ''}
                        </div>
                        <div class="bt__tile bt__score" style="--p:${pct.toFixed(1)}">
                            <div class="bt__ring"><b>${t.score}</b></div>
                            <span>оценка Shikimori</span>
                        </div>
                        <div class="bt__tile bt__fact"><span>Год</span><b>${t.year || '—'}</b></div>
                        <div class="bt__tile bt__fact"><span>Серий</span><b>${t.kind === 'movie' ? 'фильм' : (t.eps || '?')}</b></div>
                        <div class="bt__tile bt__fact"><span>Студия</span><b class="is-small">${h.esc(t.studio || '—')}</b></div>
                        <button type="button" class="bt__tile bt__next" data-act="next"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/></svg><b>Другое аниме</b><small>или пробел</small></button>
                        <div class="bt__tile bt__genres">${t.genres.slice(0, 6).map(g => `<span>${h.esc(g)}</span>`).join('')}</div>
                        <div class="bt__tile bt__desc">
                            <h3>О чём</h3>
                            <p class="${ctx.random.descOpen ? 'is-open' : ''}">${h.esc(t.description)}</p>
                            <button type="button" class="bt__link" data-act="desc">${ctx.random.descOpen ? 'Свернуть' : 'Показать полностью'}</button>
                        </div>
                        <div class="bt__tile bt__sites">
                            <h3>Где смотреть <small>${t.sites.length} сайтов</small></h3>
                            <div>${h.siteLinks(t, 'bt__site')}</div>
                            <a class="bt__link" href="https://shikimori.io/animes/${t.id}" target="_blank" rel="noopener">Открыть на Shikimori ↗</a>
                        </div>
                        <div class="bt__tile bt__shots">
                            <h3>Кадры <small>${t.shots.length}</small></h3>
                            <div>${t.shots.slice(0, 8).map((s, i) => `<button type="button" data-act="shot" data-v="${i}" aria-label="Кадр ${i + 1}">${h.img(s.thumb)}${i === 7 && t.shots.length > 8 ? `<span>+${t.shots.length - 8}</span>` : ''}</button>`).join('')}</div>
                        </div>
                        ${t.franchiseHtml ? `<div class="bt__tile bt__fr">${h.franchise(t)}</div>` : ''}
                    ${ctx.random.history.length ? `<div class="bt__tile bt__history"><h3>Уже выпадали</h3><div>${ctx.random.history.map(x => `<button type="button" data-act="history" data-v="${x.id}" style="--h:${h.hue(x.id)}">${h.img(x.poster)}<span>${h.esc(x.ru)}</span></button>`).join('')}</div></div>` : ''}
                    </section>
                </div>
            </div>`;
        },
    
        top(ctx, h) {
            const top = ctx.top;
            const podium = !top.kind && !top.band ? top.items.slice(0, 3) : [];
            const list = top.items.slice(podium.length);
            return `<div class="bt bt--top">
                <div class="bt__wrap">
                    <header class="bt__head">
                        <h1>Топ Shikimori</h1>
                        <div class="bt__seg">${h.KINDS.map(([v, l]) => `<button type="button" data-act="kind" data-v="${v}" aria-pressed="${top.kind === v}">${l}</button>`).join('')}</div>
                        <div class="bt__pick"><span>Открывать на</span>${h.sitePicker(top, 'bt-picker')}</div>
                    </header>
                    <div class="bt__bands"><span>Оценка</span>${h.BANDS.map(([v, l]) => `<button type="button" data-act="band" data-v="${v}" aria-pressed="${top.band === v}">${l}</button>`).join('')}<em>${top.total == null ? `Показано ${top.items.length}` : `${top.total} тайтлов`}</em></div>
                    ${podium.length ? `<section class="bt__podium">${podium.map(t => `
                        <a class="bt__tile bt__pod" ${h.openTop(t)} style="--h:${h.hue(t.id)}">
                            ${h.img(t.poster)}
                            <span class="bt__place">${t.rank}</span>
                            <span class="bt__podinfo"><b>${h.esc(t.ru)}</b><small>${h.esc(h.facts(t))}</small><em>★ ${t.score}</em></span>
                        </a>`).join('')}</section>` : ''}
                    <section class="bt__list">${list.map(t => `
                        <a class="bt__tile bt__row" ${h.openTop(t)} style="--h:${h.hue(t.id)}">
                            <span class="bt__num">${t.rank}</span>
                            ${h.img(t.poster)}
                            <span class="bt__rowinfo"><b>${h.esc(t.ru)}</b><small>${h.esc(h.facts(t))} · ${h.esc(t.genres.slice(0, 2).join(', '))}</small></span>
                            <span class="bt__pill">★ ${t.score}</span>
                        </a>`).join('') || (podium.length ? '' : `<p class="bt__none">${top.total === 0 ? 'Под эти фильтры тайтлов нет' : ''}</p>`)}</section>
                    ${top.more ? `<div class="bt__more"><button type="button" data-act="more">Показать ещё</button></div>` : ''}
                </div>
            </div>`;
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
