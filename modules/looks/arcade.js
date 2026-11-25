// modules/looks/arcade.js
// «Аркада»: шаблоны «Случайного аниме» и «Топа Shikimori». Общие для расширения (random/random.js, top/top.js
// через modules/looks/look-pages.js) и презентации стилей (tools/design-lab). Шаблон только рисует разметку:
// нажатия описаны атрибутами data-act, их слушает страница. ctx и помощники h — в look-pages.js
(function (root) {
    'use strict';

    const pages = root.AgLookPages = root.AgLookPages || { styles: {} };
    pages.styles.arcade = {
        random(ctx, h) {
            const t = ctx.random.item;
            const prev = ctx.random.history[0];
            const pct = Math.max(0, Math.min(100, (t.score - 6) / 3.3 * 100));
            const blocks = Math.round(pct / 10);
            return `<div class="ar">
                <div class="ar__wrap">
                    <header class="ar__head">
                        <span class="ar__px">Случайное аниме</span>
                        <span class="ar__credits">${h.esc(ctx.random.filters)} · <button type="button" data-act="settings">Настроить</button></span>
                        <span class="ar__px ar__round">Раунд ${String(ctx.random.spin + 1).padStart(2, '0')}</span>
                    </header>
                    <section class="ar__cabinet">
                        <div class="ar__reel">
                            <div class="ar__slot is-side">${prev ? h.img(prev.poster) : '<span class="ar__q">?</span>'}</div>
                            <div class="ar__slot is-main" data-spin="${ctx.random.spin}">${h.img(t.poster, '', t.ru)}</div>
                            <div class="ar__slot is-side"><span class="ar__q">?</span></div>
                        </div>
                        <button type="button" class="ar__lever" data-act="next"><span>Крутить</span><small>пробел</small></button>
                    </section>
                    <section class="ar__info">
                        <div class="ar__title">
                            <h1>${h.esc(t.ru)}</h1>
                            ${t.en !== t.ru ? `<div class="ar__en">${h.esc(t.en)}</div>` : ''}
                            <div class="ar__hud">
                                <div><span class="ar__px">Рейтинг</span><b class="ar__px is-cyan">${t.score}</b><i class="ar__bar">${'<s></s>'.repeat(blocks)}${'<u></u>'.repeat(10 - blocks)}</i></div>
                                <div><span class="ar__px">Формат</span><b>${h.esc(h.kind(t))}</b></div>
                                <div><span class="ar__px">Год</span><b>${t.year || '—'}</b></div>
                                ${h.eps(t) ? `<div><span class="ar__px">Серий</span><b>${t.eps}</b></div>` : ''}
                            </div>
                            <div class="ar__perks">${t.genres.slice(0, 5).map(g => `<span>+ ${h.esc(g)}</span>`).join('')}</div>
                        </div>
                        <div class="ar__term">
                            <span class="ar__px">Сюжет.txt</span>
                            <p class="${ctx.random.descOpen ? 'is-open' : ''}">${h.esc(t.description)}<i class="ar__caret"></i></p>
                            <button type="button" data-act="desc">${ctx.random.descOpen ? '[ свернуть ]' : '[ читать дальше ]'}</button>
                        </div>
                    </section>
                    <section class="ar__worlds">
                        <h2 class="ar__px">Выбери мир · где смотреть</h2>
                        <div>${h.siteLinks(t, 'ar__site')}<a class="ar__site is-shiki" href="https://shikimori.io/animes/${t.id}" target="_blank" rel="noopener"><b>SH</b><span>Shikimori</span></a></div>
                    </section>
                    <section class="ar__saves">
                        <h2 class="ar__px">Сохранения · кадры</h2>
                        <div>${t.shots.map((s, i) => `<button type="button" data-act="shot" data-v="${i}"><span class="ar__px">${String(i + 1).padStart(2, '0')}</span>${h.img(s.thumb)}</button>`).join('')}</div>
                    </section>
                    ${h.franchise(t, 'ar__fr')}
                    ${ctx.random.history.length ? `<section class="ar__saves is-history"><h2 class="ar__px">Прошлые раунды</h2><div>${ctx.random.history.map(x => `<button type="button" data-act="history" data-v="${x.id}" title="${h.esc(x.ru)}">${h.img(x.poster)}<span class="ar__px">${x.score}</span></button>`).join('')}</div></section>` : ''}
                </div>
            </div>`;
        },
    
        top(ctx, h) {
            const top = ctx.top;
            return `<div class="ar ar--top">
                <div class="ar__wrap">
                    <header class="ar__head">
                        <span class="ar__px ar__big">Таблица рекордов</span>
                        <div class="ar__pick"><span class="ar__px">Играть на</span>${h.sitePicker(top, 'ar-picker')}</div>
                    </header>
                    <div class="ar__modes">
                        <div>${h.KINDS.map(([v, l]) => `<button type="button" data-act="kind" data-v="${v}" aria-pressed="${top.kind === v}">${l}</button>`).join('')}</div>
                        <div><span class="ar__px">Очки</span>${h.BANDS.map(([v, l]) => `<button type="button" data-act="band" data-v="${v}" aria-pressed="${top.band === v}">${l}</button>`).join('')}</div>
                    </div>
                    <ol class="ar__board">
                        <li class="ar__row is-head"><span class="ar__px">Место</span><span></span><span class="ar__px">Игрок</span><span class="ar__px">Уровень</span><span class="ar__px">Очки</span></li>
                        ${top.items.map((t, i) => `<li><a class="ar__row ${i < 3 ? `is-p${i + 1}` : ''}" ${h.openTop(t)}>
                            <span class="ar__px ar__place">${String(t.rank).padStart(3, '0')}</span>
                            ${h.img(t.poster, 'ar__mini')}
                            <span class="ar__name"><b>${h.esc(t.ru)}</b><small>${h.esc(t.genres.slice(0, 3).join(' · '))}</small></span>
                            <span class="ar__lvl">${h.esc(h.facts(t))}</span>
                            <span class="ar__px ar__pts">${Math.round(t.score * 1000).toLocaleString('ru-RU')}</span>
                        </a></li>`).join('') || '<li class="ar__none ar__px">Нет рекордов</li>'}
                    </ol>
                    ${top.more ? `<div class="ar__more"><button type="button" data-act="more" class="ar__px">Продолжить? ▸</button></div>` : ''}
                </div>
            </div>`;
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
