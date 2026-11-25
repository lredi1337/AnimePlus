// modules/looks/magazine.js
// «Журнал»: шаблоны «Случайного аниме» и «Топа Shikimori». Общие для расширения (random/random.js, top/top.js
// через modules/looks/look-pages.js) и презентации стилей (tools/design-lab). Шаблон только рисует разметку:
// нажатия описаны атрибутами data-act, их слушает страница. ctx и помощники h — в look-pages.js
(function (root) {
    'use strict';

    const pages = root.AgLookPages = root.AgLookPages || { styles: {} };
    pages.styles.magazine = {
        random(ctx, h) {
            const t = ctx.random.item;
            const issue = String(ctx.random.spin + 1).padStart(2, '0');
            return `<div class="mg">
                <div class="mg__wrap">
                    <header class="mg__mast">
                        <span class="mg__issue">Выпуск № ${issue}</span>
                        <span class="mg__title-mast">Случайное аниме</span>
                        <span class="mg__filters">${h.esc(ctx.random.filters)} · <button type="button" data-act="settings">изменить</button></span>
                    </header>
                    <article class="mg__spread" data-spin="${ctx.random.spin}">
                        <figure class="mg__cover">${h.img(t.poster, '', t.ru)}<figcaption>${h.esc(t.studio || 'Студия не указана')} · ${t.year || ''}</figcaption></figure>
                        <div class="mg__body">
                            <div class="mg__kicker">${h.esc(t.genres.slice(0, 4).join(' / '))}</div>
                            <h1 class="${Math.max(...t.ru.split(/\s+/).map(w => w.length)) > 11 ? 'is-long' : ''}">${h.esc(t.ru)}</h1>
                            ${t.en !== t.ru ? `<div class="mg__en">${h.esc(t.en)}</div>` : ''}
                            <dl class="mg__facts">
                                <div><dt>Оценка</dt><dd class="is-score">${t.score}</dd></div>
                                <div><dt>Формат</dt><dd>${h.esc(h.kind(t))}</dd></div>
                                ${h.eps(t) ? `<div><dt>Серий</dt><dd>${t.eps}</dd></div>` : ''}
                                <div><dt>Год</dt><dd>${t.year || '—'}</dd></div>
                            </dl>
                            <p class="mg__text ${ctx.random.descOpen ? 'is-open' : ''}">${h.esc(t.description)}</p>
                            <button type="button" class="mg__more-text" data-act="desc">${ctx.random.descOpen ? 'Свернуть ↑' : 'Читать полностью →'}</button>
                        </div>
                        <aside class="mg__where">
                            <h2>Где смотреть</h2>
                            <div class="mg__sites">${h.siteLinks(t, 'mg__site')}</div>
                            <a class="mg__shiki" href="https://shikimori.io/animes/${t.id}" target="_blank" rel="noopener">Страница на Shikimori ↗</a>
                            <button type="button" class="mg__next" data-act="next">Следующий выпуск →<small>или пробел</small></button>
                        </aside>
                    </article>
                    <section class="mg__sheet">
                        <h2>Контактный лист · ${t.shots.length} кадров</h2>
                        <div>${t.shots.map((s, i) => `<button type="button" data-act="shot" data-v="${i}"><span>${String(i + 1).padStart(2, '0')}</span>${h.img(s.thumb)}</button>`).join('')}</div>
                    </section>
                    ${h.franchise(t, 'mg__fr')}
                    ${ctx.random.history.length ? `<section class="mg__past"><h2>В прошлых выпусках</h2><div>${ctx.random.history.map(x => `<button type="button" data-act="history" data-v="${x.id}">${h.img(x.poster)}<b>${h.esc(x.ru)}</b><small>★ ${x.score}</small></button>`).join('')}</div></section>` : ''}
                </div>
            </div>`;
        },

        top(ctx, h) {
            const top = ctx.top;
            return `<div class="mg mg--top">
                <div class="mg__wrap">
                    <header class="mg__mast">
                        <span class="mg__issue">Рейтинг Shikimori</span>
                        <span class="mg__title-mast">Топ</span>
                        ${h.sitePicker(top, 'mg-picker')}
                    </header>
                    <nav class="mg__filters-row">
                        <div>${h.KINDS.map(([v, l]) => `<button type="button" data-act="kind" data-v="${v}" aria-pressed="${top.kind === v}">${l}</button>`).join('')}</div>
                        <div><span>Оценка:</span>${h.BANDS.map(([v, l]) => `<button type="button" data-act="band" data-v="${v}" aria-pressed="${top.band === v}">${l}</button>`).join('')}</div>
                    </nav>
                    <ol class="mg__table">${top.items.map(t => `
                        <li><a ${h.openTop(t)}>
                            <span class="mg__rank">${t.rank}</span>
                            ${h.img(t.poster, 'mg__thumb')}
                            <span class="mg__name"><b>${h.esc(t.ru)}</b><small>${h.esc(t.en)}</small><em>${h.esc(t.genres.slice(0, 3).join(', '))}</em></span>
                            <span class="mg__fmt">${h.esc(h.facts(t))}</span>
                            <span class="mg__bar"><i style="width:${Math.max(0, (t.score - 6) / 3.3 * 100).toFixed(1)}%"></i></span>
                            <span class="mg__score">${t.score.toFixed(2)}</span>
                        </a></li>`).join('') || `<li class="mg__none">${top.total === 0 ? 'Под эти фильтры тайтлов нет' : ''}</li>`}
                    </ol>
                    ${top.more ? `<div class="mg__more"><button type="button" data-act="more">${top.total == null ? 'Ещё строки' : `Ещё ${Math.min(40, top.total - top.items.length)} строк`} ↓</button></div>` : ''}
                </div>
            </div>`;
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
