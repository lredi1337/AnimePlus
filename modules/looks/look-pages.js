// modules/looks/look-pages.js
// Раскладки стилей для «Случайного аниме» (random/random.js) и «Топа Shikimori» (top/top.js).
// Шаблоны стилей лежат рядом (cinema.js, magazine.js, manga.js, arcade.js, bento.js) и общие с презентацией стилей
// (tools/design-lab). Они рисуют строку разметки по ctx и помощникам h, нажатия описывают атрибутами data-act:
//   «Случайное»: next, history (v — id), desc, shot (v — номер кадра), settings;
//   Топ: kind, band, more, site-menu, site (v — id сайта), open-top (v — id тайтла).
//   «Порядок просмотра» (h.franchise): fr-open, fr-mode, fr-recaps, fr-all, fr-others.
// top.total — сколько всего тайтлов; null, пока рейтинг не загружен до конца (расширение заранее этого не знает).
// Слушает их сама страница. У «Классического» шаблонов нет: страница рисует себя как раньше.
// Все строки из данных проходят через esc; числа (id, год, оценка, серии, место) приводятся к числам здесь.
(function (root) {
    'use strict';

    const pages = root.AgLookPages = root.AgLookPages || { styles: {} };

    const PLACEHOLDER = '../icons/icon128.png';
    const KIND = { tv: 'Сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'Спешл', music: 'Клип', pv: 'Проморолик', cm: 'Реклама' };
    const STATUS = { ongoing: 'Онгоинг', anons: 'Анонс' };
    const KINDS = [['', 'Все'], ['tv', 'Сериалы'], ['movie', 'Фильмы'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешлы']];
    // Те же диапазоны, что у Топа (top/top.js, SCORE_BANDS)
    const BANDS = [['', 'Все'], ['9', '9+'], ['8', '8–9'], ['7', '7–8'], ['6', '6–7'], ['1', 'Ниже 6']];

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };
    const onAccent = (hex) => (root.AgUI && root.AgUI.onAccent ? root.AgUI.onAccent(hex) : '#fff');
    const siteById = (id) => (root.AgSites ? root.AgSites.byId(id) : null);

    const h = {
        esc,
        kind: (t) => KIND[t.kind] || String(t.kind || '').toUpperCase(),
        eps: (t) => (t.kind === 'movie' ? '' : t.eps ? `${t.eps} эп.` : ''),
        status: (t) => STATUS[t.status] || '',
        facts: (t) => [KIND[t.kind] || String(t.kind || '').toUpperCase(), t.year, t.kind === 'movie' ? '' : t.eps ? `${t.eps} эп.` : ''].filter(Boolean).join(' · '),
        img: (src, cls = '', alt = '') => `<img class="${esc(cls)}" src="${esc(src || PLACEHOLDER)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`,
        onAccent,
        // Свой оттенок у каждого тайтла («Плитки»)
        hue: (id) => (num(id) * 47) % 360,
        KINDS,
        BANDS,
        // Кнопки сайтов. С t.siteSlots место под каждый включённый сайт отведено сразу: пока ищем — заготовка того же
        // размера (is-pending), нашёлся — ссылка, не нашёлся — приглушённая плашка (is-missing). Раскладка не растёт по ходу поиска.
        // Без siteSlots (презентация) — только найденные. Пояснение (все сайты выключены) — строкой после кнопок
        siteLinks(t, cls) {
            const slots = t.siteSlots || (t.sites || []).map(s => ({ ...s, state: 'found' }));
            const links = slots.map((s) => {
                const site = siteById(s.id);
                if (!site) return '';
                const look = `data-site="${esc(site.id)}" style="--site:${esc(site.color)};--on-site:${onAccent(site.color)}"`;
                const inner = `<b>${esc(site.short)}</b><span>${esc(site.name)}</span>`;
                if (s.state === 'found') return `<a class="${esc(cls)}" href="${esc(s.url)}" target="_blank" rel="noopener" ${look}>${inner}</a>`;
                const pending = s.state === 'pending';
                return `<span class="${esc(cls)} ${pending ? 'is-pending' : 'is-missing'}" ${look} aria-disabled="true" title="${pending ? `Ищем на ${esc(site.name)}…` : `На ${esc(site.name)} этого тайтла нет`}">${inner}</span>`;
            }).join('');
            return links + (t.sitesNote ? `<span class="lk-note">${esc(t.sitesNote)}</span>` : '');
        },
        // «Открывать на»: кнопка и список сайтов (Топ во вкладке)
        sitePicker(top, cls) {
            const badge = (s) => `<b style="--site:${esc(s.color)};--on-site:${onAccent(s.color)}">${esc(s.short)}</b><span>${esc(s.name)}</span>`;
            return `<div class="site-menu ${esc(cls)}">
                <button type="button" class="${esc(cls)}__btn" data-act="site-menu" aria-haspopup="listbox" aria-expanded="${!!top.siteMenu}" aria-label="На каком сайте открывать тайтл">${badge(top.site)}<i aria-hidden="true">▾</i></button>
                ${top.siteMenu ? `<div class="${esc(cls)}__list" role="listbox">${top.sites.map(s => `<button type="button" role="option" aria-selected="${s.id === top.site.id}" data-act="site" data-v="${esc(s.id)}">${badge(s)}</button>`).join('')}</div>` : ''}
            </div>`;
        },
        // «Порядок просмотра»: разметку готовит страница (modules/shared/franchise-view.js), шаблон только ставит её на место
        franchise: (t, cls = '') => (t.franchiseHtml ? `<div class="lk-fr ${esc(cls)}">${t.franchiseHtml}</div>` : ''),
        openTop: (t) => `href="https://shikimori.io/animes/${num(t.id)}" data-act="open-top" data-v="${num(t.id)}"`
    };

    /** Шаблоны выбранного стиля или null («Классический» и неизвестный стиль рисуются по-старому) */
    pages.current = () => {
        const id = root.document && root.document.documentElement.dataset.look;
        return id && pages.styles[id] ? pages.styles[id] : null;
    };

    const year = (v) => {
        const m = /^\d{4}/.exec(String(v || ''));
        return m ? m[0] : '';
    };

    /** Тайтл «Случайного» (modules/bg-random.js, animeCardFor) в вид шаблона */
    pages.randomItem = (anime, sites = [], sitesNote = '', siteSlots = null) => ({
        siteSlots,
        id: num(anime.id),
        ru: anime.russian || anime.name || '',
        en: anime.name || anime.russian || '',
        poster: anime.poster || PLACEHOLDER,
        score: num(anime.score),
        kind: String(anime.kind || '').toLowerCase().replace(/[^a-z_]/g, ''),
        eps: num(anime.episodes),
        year: year(anime.year),
        status: anime.status || '',
        studio: anime.studio || '',
        genres: Array.isArray(anime.genres) ? anime.genres : [],
        description: anime.description || '',
        shots: (Array.isArray(anime.screenshots) ? anime.screenshots : []).map(s => ({ thumb: s.thumb || s.full, full: s.full || s.thumb })),
        sites,
        sitesNote
    });

    /** Тайтл Топа (ответ api/animes Shikimori) в вид шаблона */
    pages.topItem = (item, rank, poster, genres = []) => ({
        id: num(item.id),
        ru: item.russian || item.name || '',
        en: item.name || item.russian || '',
        poster: poster || PLACEHOLDER,
        score: num(item.score),
        kind: String(item.kind || '').toLowerCase().replace(/[^a-z_]/g, ''),
        eps: num(item.episodes || item.episodes_aired),
        year: year(item.aired_on),
        status: item.status || '',
        rank: num(rank),
        genres: Array.isArray(genres) ? genres : []
    });

    /** Битый постер — значок расширения, битый кадр прячется */
    pages.bindImages = (box) => {
        box.querySelectorAll('img').forEach((img) => {
            if (img.dataset.lkBound) return;
            img.dataset.lkBound = '1';
            img.addEventListener('error', () => {
                if (img.closest('[data-act="shot"]')) img.style.visibility = 'hidden';
                else if (!img.src.endsWith(PLACEHOLDER.slice(2))) img.src = PLACEHOLDER;
            }, { once: true });
        });
    };

    // ---------- Отрисовка без мигания ----------
    // У раскладок есть анимации появления, а страница обновляет раскладку часто: каждый найденный сайт,
    // подгрузка Топа, жанры. Полная перерисовка запускала анимацию заново и пересоздавала картинки — страница дёргалась.
    // Поэтому обычно меняется только то, что изменилось: те же элементы остаются на месте.
    // Полностью заново (fresh) — только новый тайтл или новые фильтры: там анимация появления и нужна.

    // Пометки, которые ставит сама страница после отрисовки: их не снимаем
    const OWN = /^data-(lk-|ag-poster)/;
    const keyOf = (el) => el.getAttribute('data-v') || el.getAttribute('data-site') || '';
    const sameNode = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || keyOf(a) === keyOf(b));

    function patchElement(from, to) {
        for (const attr of [...from.attributes]) {
            if (!to.hasAttribute(attr.name) && !OWN.test(attr.name)) from.removeAttribute(attr.name);
        }
        // Постер, который дотянул поиск постеров (agBindPostersIn), не возвращаем к заглушке
        const keepSrc = from.nodeName === 'IMG' && from.hasAttribute('data-ag-poster-bound');
        for (const attr of [...to.attributes]) {
            if (keepSrc && attr.name === 'src') continue;
            if (from.getAttribute(attr.name) !== attr.value) from.setAttribute(attr.name, attr.value);
        }
        patchChildren(from, to);
    }

    function patchChildren(from, to) {
        const want = [...to.childNodes];
        want.forEach((node, i) => {
            const have = from.childNodes[i];
            if (!have) from.appendChild(node);
            else if (!sameNode(have, node)) from.replaceChild(node, have);
            else if (have.nodeType === 1) patchElement(have, node);
            else if (have.nodeValue !== node.nodeValue) have.nodeValue = node.nodeValue;
        });
        while (from.childNodes.length > want.length) from.removeChild(from.lastChild);
    }

    /** Разметка шаблона в box: fresh — целиком заново (новый тайтл, новые фильтры), иначе только изменения */
    pages.render = (box, html, fresh) => {
        if (fresh || !box.firstChild) {
            box.innerHTML = html;
            return;
        }
        const tpl = box.ownerDocument.createElement('template');
        tpl.innerHTML = html;
        patchChildren(box, tpl.content);
    };

    pages.h = h;
})(typeof globalThis !== 'undefined' ? globalThis : window);
