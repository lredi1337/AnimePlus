// modules/shared/franchise-view.js
// Блок «Порядок просмотра»: разметка по порядку из franchise-core.js. Один и тот же блок у «Случайного аниме»
// (обычная страница и раскладки стилей modules/looks) и в подборе (главная карточка и панель тайтла).
// Вид — modules/looks/franchise.css (свой у каждого стиля). Нажатия — атрибуты data-act, слушает страница:
//   fr-open (v — id тайтла), fr-mode (v — story|release), fr-recaps, fr-all, fr-others; handle() меняет состояние.
// Все строки из данных проходят через esc, id и годы — числа.
(function (root) {
    'use strict';

    const MODE_KEY = 'ag-fr-mode';
    // Больше этого — побочное сворачивается в «+N побочных» («Ван-Пис»: один сериал и 37 побочных)
    const COLLAPSE_OVER = 12;
    const PLACEHOLDER = '../icons/icon128.png';
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const plural = (n, one, few, many) => {
        const m10 = n % 10;
        const m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
        return many;
    };

    /** Состояние блока на странице: режим запоминается между страницами, остальное — на время просмотра */
    function state() {
        let mode = 'story';
        try { if (root.localStorage && root.localStorage.getItem(MODE_KEY) === 'release') mode = 'release'; } catch (e) { /* без памяти */ }
        return { mode, recaps: false, all: false, others: false };
    }

    /** Нажатие в блоке: true — состояние изменилось, блок надо нарисовать заново. fr-open обрабатывает страница */
    function handle(st, act, v) {
        if (act === 'fr-mode') {
            const mode = v === 'release' ? 'release' : 'story';
            if (st.mode === mode) return false;
            st.mode = mode;
            try { root.localStorage.setItem(MODE_KEY, mode); } catch (e) { /* без памяти */ }
            return true;
        }
        if (act === 'fr-recaps') { st.recaps = !st.recaps; return true; }
        if (act === 'fr-all') { st.all = !st.all; return true; }
        if (act === 'fr-others') { st.others = !st.others; return true; }
        return false;
    }

    const TAG = { recap: 'пересказ · можно пропустить', side: 'побочное' };

    function itemHtml(it, posters, placeholder) {
        const poster = posters && posters[it.id] ? String(posters[it.id]) : placeholder;
        const tag = it.here ? 'вы здесь' : it.soon ? 'анонс' : TAG[it.role] || '';
        const cls = `fr__item is-${it.role}${it.here ? ' is-here' : ''}${it.soon ? ' is-soon' : ''}`;
        const facts = [it.year || '', it.kindLabel].filter(Boolean).map(esc).join(' · ');
        const inner = `<span class="fr__poster"><img src="${esc(poster)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
            + `<span class="fr__num">${it.num ? it.num : ''}</span>`
            + `<span class="fr__text"><b>${esc(it.name)}</b><small>${facts}</small></span>`
            + (tag ? `<em class="fr__tag">${esc(tag)}</em>` : '');
        // Текущий тайтл не нажимается: он и так открыт
        return `<li class="${cls}" data-fr-id="${num(it.id)}">${it.here
            ? `<div class="fr__open" aria-current="true">${inner}</div>`
            : `<button type="button" class="fr__open" data-act="fr-open" data-v="${num(it.id)}" title="Открыть «${esc(it.name)}»">${inner}</button>`}</li>`;
    }

    const moreHtml = (n) => `<li class="fr__item is-more"><button type="button" class="fr__open" data-act="fr-all">+${n} ${plural(n, 'побочное', 'побочных', 'побочных')}</button></li>`;

    /**
     * Шаги списком с учётом скрытых пересказов и свёрнутого побочного: ряд побочных подряд — одной кнопкой «+N».
     * Развилка ряд прерывает и рисуется через forkHtml
     */
    function listHtml(steps, st, posters, collapse, forkHtml, placeholder) {
        const out = [];
        let run = 0;
        const flush = () => { if (run) out.push(moreHtml(run)); run = 0; };
        for (const s of steps) {
            if (s.type === 'fork') { flush(); out.push(forkHtml(s)); continue; }
            const it = s.item;
            if (it.role === 'recap' && !st.recaps && !it.here) continue;
            // Сворачивается только побочное: пересказы зритель включает сам, и тогда они видны
            if (collapse && it.role === 'side' && !it.here) { run++; continue; }
            flush();
            out.push(itemHtml(it, posters, placeholder));
        }
        flush();
        return out.join('');
    }

    /**
     * Разметка блока или '' (франшизы нет). franchise — { data, posters } из фона (modules/bg-franchise.js),
     * current — id тайтла на странице (если отличается от того, для которого франшиза запрошена),
     * placeholder — значок вместо постера, путь от страницы (по умолчанию для страниц расширения random/, pick/)
     */
    function html(franchise, st, current, placeholder = PLACEHOLDER) {
        const F = root.AgFranchise;
        if (!F || !franchise || !franchise.data) return '';
        const order = F.build(franchise.data, { mode: st.mode, current: current || franchise.data.current_id });
        if (!order) return '';
        const posters = franchise.posters || {};
        const flat = F.flatten(order);
        const visible = flat.filter(i => i.role !== 'recap' || st.recaps || i.here).length;
        const collapse = !st.all && visible > COLLAPSE_OVER;
        const mains = order.steps.filter(s => s.type === 'fork' || s.item.role === 'main').length;

        // Внутри пути побочное не сворачивается: пути короткие
        const forkHtml = (s) => {
            const routes = s.routes.map((r, i) => `<li class="fr__route"><span class="fr__route-label">Путь ${i + 1}</span><ol class="fr__route-list">${listHtml(r.items.map(item => ({ type: 'item', item })), st, posters, false, null, placeholder)}</ol></li>`).join('');
            return `<li class="fr__fork"><div class="fr__fork-head"><span class="fr__num">${num(s.num) || ''}</span><span class="fr__text"><b>Один из путей</b><small>Разные версии одной истории: достаточно выбрать одну</small></span></div><ol class="fr__routes">${routes}</ol></li>`;
        };
        const steps = listHtml(order.steps, st, posters, collapse, forkHtml, placeholder);

        const tools = [];
        if (order.hidden.recaps) tools.push(`<button type="button" class="fr__tool" data-act="fr-recaps" aria-pressed="${st.recaps}">${st.recaps ? 'Скрыть пересказы' : `Пересказы: ${order.hidden.recaps}`}</button>`);
        if (collapse || st.all) {
            const sides = flat.filter(i => i.role === 'side').length;
            if (sides) tools.push(`<button type="button" class="fr__tool" data-act="fr-all" aria-pressed="${st.all}">${st.all ? 'Свернуть побочное' : `Всё побочное: ${sides}`}</button>`);
        }

        const othersList = `<ul class="fr__others-list">${order.others.map(g => {
            const lead = g.items.find(i => i.role === 'main') || g.items[0];
            return `<li><button type="button" class="fr__other" data-act="fr-open" data-v="${num(lead.id)}"><b>${esc(g.name)}</b><small>${g.items.length} ${plural(g.items.length, 'тайтл', 'тайтла', 'тайтлов')}</small></button></li>`;
        }).join('')}</ul>`;

        // Тайтл один в своей ветке («Кланнад: Другой мир» связан с «Кланнадом» только как другая история):
        // порядка здесь нет, поэтому блок — «Из той же вселенной», истории видны сразу, без переключателя
        if (flat.length === 1) {
            return '<section class="fr is-universe" aria-label="Из той же вселенной">'
                + `<header class="fr__head"><h3 class="fr__title">Из той же вселенной</h3><span class="fr__sub">${order.others.length} ${plural(order.others.length, 'история', 'истории', 'историй')}</span></header>`
                + `<div class="fr__others">${othersList}</div>`
                + '</section>';
        }

        const others = order.others.length
            ? `<div class="fr__others"><button type="button" class="fr__tool" data-act="fr-others" aria-expanded="${st.others}">Другие истории вселенной: ${order.others.length}</button>${st.others ? othersList : ''}</div>`
            : '';

        return `<section class="fr" data-fr-mode="${order.mode}" aria-label="Порядок просмотра">`
            + `<header class="fr__head"><h3 class="fr__title">Порядок просмотра</h3><span class="fr__sub">${mains} ${plural(mains, 'часть', 'части', 'частей')}</span>`
            + `<div class="fr__mode" role="group" aria-label="Порядок"><button type="button" data-act="fr-mode" data-v="story" aria-pressed="${order.mode === 'story'}" title="Предыстории — раньше, даже если вышли позже">По сюжету</button><button type="button" data-act="fr-mode" data-v="release" aria-pressed="${order.mode === 'release'}" title="В порядке выхода">По выходу</button></div></header>`
            + `<ol class="fr__list">${steps}</ol>`
            + (tools.length || others ? `<div class="fr__foot">${tools.join('')}${others}</div>` : '')
            + '</section>';
    }

    /** Строка франшизы есть, но блока нет (один тайтл) — чтобы страница не держала место впустую */
    const has = (franchise, current) => !!(root.AgFranchise && franchise && franchise.data
        && root.AgFranchise.build(franchise.data, { current: current || franchise.data.current_id }));

    root.AgFranchiseView = { state, handle, html, has };
})(typeof globalThis !== 'undefined' ? globalThis : window);
