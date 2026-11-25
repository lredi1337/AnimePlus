// modules/shared/franchise-core.js
// Порядок просмотра франшизы по ответу Shikimori /api/animes/<id>/franchise ({ nodes, links, current_id }).
// Чистая логика без сети: фон (modules/bg-franchise.js) готовит данные, страницы только рисуют.
//
// Правила (проверены на «Моногатари», Fate, Re:Zero, «Ван-Пис», «Наруто», «Атаке титанов», «Клинке», «Вратах Штейна»):
//  - Своя ветка — тайтлы, связанные с текущим сильными связями: продолжение, предыстория, побочная история, рекап,
//    полная история. Предыстория раньше продолжения, даже если вышла позже. Дата решает только там, где связей нет.
//  - Спин-оффы, «другое», персонажи и альтернативные вселенные — не своя ветка: «Другие истории вселенной» группами.
//  - Развилка: у тайтла несколько продолжений, которые между собой альтернативные версии (Fate/Zero → stay night 2006,
//    «Бесконечный мир клинков», «Прикосновение небес»). Смотрят один путь, а не всё подряд: шаг «Один из путей».
//  - Клипы, промо-ролики и реклама не показываются. Рекап помечен «можно пропустить», побочное — «побочное».
//  - Режим «по выходу» — та же ветка плоским списком по дате, без развилок: для тех, кто смотрит в порядке выхода.
(function (root) {
    'use strict';

    const HIDDEN = new Set(['клип', 'проморолик', 'реклама', 'music', 'pv', 'cm']);
    const SERIES = new Set(['tv сериал', 'ona', 'фильм', 'tv', 'movie']);
    const STRONG = new Set(['sequel', 'prequel', 'side_story', 'parent_story', 'summary', 'full_story']);
    // Развилку дают только альтернативные версии одной истории; alternative_setting — другая вселенная («Вершина хаоса»)
    const ALT = new Set(['alternative_version']);
    const KIND_LABEL = {
        'tv сериал': 'Сериал', tv: 'Сериал', 'фильм': 'Фильм', movie: 'Фильм', ona: 'ONA', ova: 'OVA',
        'спецвыпуск': 'Спецвыпуск', special: 'Спецвыпуск', 'tv спецвыпуск': 'Спецвыпуск', tv_special: 'Спецвыпуск'
    };
    const NO_DATE = Number.MAX_SAFE_INTEGER;

    const kindOf = (n) => String(n.kind || '').trim().toLowerCase();
    const numId = (v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
    };
    const yearOf = (n) => {
        const y = parseInt(n.year, 10);
        return Number.isFinite(y) && y > 1900 ? y : 0;
    };
    const dateOf = (n) => (Number.isFinite(n.date) && n.date > 0 ? n.date : NO_DATE);

    /** Узлы и связи из ответа Shikimori в удобный вид; скрытые типы отброшены */
    function graph(data) {
        const nodes = new Map();
        for (const raw of (data && Array.isArray(data.nodes) ? data.nodes : [])) {
            const id = numId(raw.id);
            if (!id || HIDDEN.has(kindOf(raw))) continue;
            nodes.set(id, {
                id,
                name: String(raw.name || '').trim(),
                kind: kindOf(raw),
                kindLabel: KIND_LABEL[kindOf(raw)] || String(raw.kind || ''),
                year: yearOf(raw),
                date: dateOf(raw),
                role: SERIES.has(kindOf(raw)) ? 'main' : 'side'
            });
        }
        const links = (data && Array.isArray(data.links) ? data.links : [])
            .map(l => ({ s: numId(l.source_id), t: numId(l.target_id), rel: String(l.relation || '') }))
            .filter(l => nodes.has(l.s) && nodes.has(l.t) && l.s !== l.t);
        return { nodes, links };
    }

    /** a раньше b: «после чего» для каждого тайтла и роли по связям */
    function orderEdges(nodes, links) {
        const after = new Map([...nodes.keys()].map(id => [id, new Set()]));
        const before = (a, b) => after.get(b).add(a);
        const recap = new Set();
        const side = new Set();
        // Звенья цепочки «продолжение — предыстория» среди сериалов и фильмов. Спецвыпуск, который называет такое звено
        // «своей побочной историей», — шум в данных («Разоблачающие отчёты» и «Укротитель короны 2» указали друг друга):
        // такую связь не учитываем, иначе фильм-продолжение стал бы побочным
        const series = (id) => nodes.get(id).role === 'main';
        const chain = new Set(links.filter(l => (l.rel === 'sequel' || l.rel === 'prequel') && series(l.s) && series(l.t)).flatMap(l => [l.s, l.t]));
        const noise = (lesser, link) => chain.has(link) && !series(lesser);
        for (const { s, t, rel } of links) {
            if ((rel === 'side_story' && noise(s, t)) || (rel === 'parent_story' && noise(t, s))) continue;
            // relation описывает target относительно source: «t — продолжение s»
            if (rel === 'sequel') before(s, t);
            else if (rel === 'prequel') before(t, s);
            else if (rel === 'side_story') { before(s, t); side.add(t); }
            else if (rel === 'parent_story') { before(t, s); side.add(s); }
            else if (rel === 'summary') { before(s, t); recap.add(t); }
            else if (rel === 'full_story') { before(t, s); recap.add(s); }
        }
        return { after, recap, side };
    }

    /** Связные части по заданным видам связей среди ids */
    function components(ids, links, kinds) {
        const adj = new Map([...ids].map(id => [id, new Set()]));
        for (const { s, t, rel } of links) {
            if (!kinds.has(rel) || !adj.has(s) || !adj.has(t)) continue;
            adj.get(s).add(t);
            adj.get(t).add(s);
        }
        const seen = new Set();
        const out = [];
        for (const id of ids) {
            if (seen.has(id)) continue;
            const part = new Set([id]);
            const queue = [id];
            seen.add(id);
            while (queue.length) {
                for (const next of adj.get(queue.shift())) {
                    if (!seen.has(next)) { seen.add(next); part.add(next); queue.push(next); }
                }
            }
            out.push(part);
        }
        return out;
    }

    /** Топологический порядок: из готовых к просмотру — самый ранний по дате; цикл в данных — дальше по дате */
    function topo(ids, after, dateFor) {
        const left = new Set(ids);
        const out = [];
        while (left.size) {
            let ready = [...left].filter(id => [...(after.get(id) || [])].every(a => !left.has(a)));
            if (!ready.length) ready = [...left];
            ready.sort((a, b) => dateFor(a) - dateFor(b) || a - b);
            out.push(ready[0]);
            left.delete(ready[0]);
        }
        return out;
    }

    /** Все, кто должен идти раньше id (по транзитивности) */
    function ancestors(id, after) {
        const out = new Set();
        const stack = [...(after.get(id) || [])];
        while (stack.length) {
            const x = stack.pop();
            if (out.has(x)) continue;
            out.add(x);
            stack.push(...(after.get(x) || []));
        }
        return out;
    }

    /**
     * Порядок просмотра. mode: 'story' (по сюжету, по умолчанию) или 'release' (по выходу).
     * Возвращает null, если франшизы нет (один тайтл). Иначе:
     * { current, mode, steps: [{ type: 'item', item } | { type: 'fork', num, routes: [{ items }] }],
     *   others: [{ name, items }], hidden: { recaps } }
     * item: { id, name, kindLabel, year, role: 'main'|'side'|'recap', num, here, soon }
     */
    function build(data, opts = {}) {
        const mode = opts.mode === 'release' ? 'release' : 'story';
        const now = Number.isFinite(opts.now) ? opts.now : Math.floor(Date.now() / 1000);
        const { nodes, links: raw } = graph(data);
        const current = numId(opts.current || (data && data.current_id));
        if (!nodes.has(current)) return null;
        const roles = orderEdges(nodes, raw);
        for (const id of roles.side) nodes.get(id).role = 'side';
        for (const id of roles.recap) nodes.get(id).role = 'recap';
        // Альтернативная версия, где один конец неосновной (спецвыпуск, OVA), — вариант серии той же истории, а не другая история:
        // «Деление на ноль» — альтернативная концовка «Врат Штейна», от неё продолжение «Врата Штейна 0».
        // Такой тайтл встаёт в ветку побочным после основного и тянет свои продолжения
        // Только у тайтлов одной истории: основное название до двоеточия то же («Врата Штейна: … Деление на ноль» и «Врата Штейна»).
        // «Судьба/Прототип» и «Судьба/Странная подделка: Шёпот рассвета» — альтернативные версии другой истории, не вариант серии
        const stem = (id) => nodes.get(id).name.split(/\s*[:—–]\s*/)[0].replace(/\s+\d+$/, '').trim().toLowerCase();
        const bridges = raw.filter(l => l.rel === 'alternative_version' && (nodes.get(l.s).role === 'main') !== (nodes.get(l.t).role === 'main') && stem(l.s) === stem(l.t))
            .map(l => (nodes.get(l.s).role === 'main' ? { s: l.s, t: l.t, rel: 'side_story' } : { s: l.t, t: l.s, rel: 'side_story' }));
        const links = raw.concat(bridges);
        const { after, recap, side } = orderEdges(nodes, links);
        for (const id of side) if (nodes.get(id).role === 'main' && !roles.side.has(id) && bridges.some(b => b.t === id)) nodes.get(id).role = 'side';
        void recap;

        // Спин-оффы не входят в ветку (кроме случая, когда сам текущий — спин-офф: тогда ветка его собственная)
        const spinoffs = new Set(links.filter(l => l.rel === 'spin_off').map(l => l.t));
        spinoffs.delete(current);
        const usable = new Set([...nodes.keys()].filter(id => !spinoffs.has(id)));
        const branch = components(usable, links, STRONG).find(part => part.has(current)) || new Set([current]);

        // Остальное франшизы — «Другие истории вселенной», группами по сильным связям
        const rest = new Set([...nodes.keys()].filter(id => !branch.has(id)));
        const others = components(rest, links, STRONG)
            .map(part => [...part].sort((a, b) => nodes.get(a).date - nodes.get(b).date))
            .map(ids => {
                const lead = ids.find(id => nodes.get(id).role === 'main') || ids[0];
                return { name: nodes.get(lead).name, items: ids.map(id => item(id)) };
            })
            .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, 'ru'));

        if (branch.size < 2 && !others.length) return null;

        function item(id) {
            const n = nodes.get(id);
            return { id, name: n.name, kindLabel: n.kindLabel, year: n.year, role: n.role, num: 0, here: id === current, soon: n.date === NO_DATE || n.date > now };
        }
        const dateFor = (id) => (nodes.has(id) ? nodes.get(id).date : NO_DATE);
        let steps;

        if (mode === 'release') {
            steps = [...branch].sort((a, b) => dateFor(a) - dateFor(b) || a - b).map(id => ({ type: 'item', item: item(id) }));
        } else {
            // Развилка: альтернативные версии внутри ветки, у которых общие предшественники (Fate/Zero → пути stay night)
            // Пересказы и побочное развилку не дают («Багровые луки» — пересказ «Атаки титанов»): только основное
            const mainOnly = new Set([...branch].filter(id => nodes.get(id).role === 'main'));
            const alt = components(mainOnly, links, ALT).filter(part => part.size >= 2)
                .sort((a, b) => b.size - a.size)[0];
            if (!alt) {
                steps = topo(branch, after, dateFor).map(id => ({ type: 'item', item: item(id) }));
            } else {
                const roots = [...alt];
                // Ствол — общие предшественники путей; остальное разбирается по путям
                const trunk = new Set(roots.map(r => ancestors(r, after)).reduce((acc, set) => new Set([...acc].filter(x => set.has(x)))));
                roots.forEach(r => trunk.delete(r));
                const loose = new Set([...branch].filter(id => !trunk.has(id) && !alt.has(id)));
                const routes = roots.map(r => new Set([r]));
                const leftover = new Set();
                for (const part of components(loose, links, STRONG)) {
                    const touching = routes.filter((route, i) => links.some(l => STRONG.has(l.rel) &&
                        ((part.has(l.s) && l.t === roots[i]) || (part.has(l.t) && l.s === roots[i]))));
                    if (touching.length === 1) part.forEach(id => touching[0].add(id));
                    else part.forEach(id => leftover.add(id));
                }
                // Путь без предшественников-ствола — не развилка (ничего общего до неё): тогда обычный порядок
                if (!trunk.size) {
                    steps = topo(branch, after, dateFor).map(id => ({ type: 'item', item: item(id) }));
                } else {
                    const FORK = -1;
                    const forkOf = new Map();
                    routes.forEach(route => route.forEach(id => forkOf.set(id, FORK)));
                    const outer = [...trunk, ...leftover, FORK];
                    const outerAfter = new Map(outer.map(id => [id, new Set()]));
                    const mapId = (id) => (forkOf.has(id) ? FORK : id);
                    for (const [id, set] of after) {
                        if (!branch.has(id)) continue;
                        for (const a of set) {
                            if (!branch.has(a)) continue;
                            const x = mapId(a);
                            const y = mapId(id);
                            if (x !== y) outerAfter.get(y).add(x);
                        }
                    }
                    // Развилка — как можно позже среди готового: побочное ствола (спецвыпуск к Fate/Zero) встаёт до неё
                    const forkDate = NO_DATE - 1;
                    const outerDate = (id) => (id === FORK ? forkDate : dateFor(id));
                    steps = topo(outer, outerAfter, outerDate).map(id => (id === FORK
                        ? {
                            type: 'fork',
                            num: 0,
                            routes: routes
                                .map(route => ({ items: topo(route, after, dateFor).map(x => item(x)) }))
                                .sort((a, b) => dateFor(a.items[0].id) - dateFor(b.items[0].id))
                        }
                        : { type: 'item', item: item(id) }));
                }
            }
        }

        // Номера у основного: 1, 2, 3… Развилка — один шаг со своим номером
        let num = 0;
        for (const step of steps) {
            if (step.type === 'fork') step.num = ++num;
            else if (step.item.role === 'main') step.item.num = ++num;
        }
        const recaps = steps.reduce((acc, s) => acc + (s.type === 'item' ? (s.item.role === 'recap' ? 1 : 0) : s.routes.reduce((r, route) => r + route.items.filter(i => i.role === 'recap').length, 0)), 0);
        return { current, mode, steps, others, hidden: { recaps } };
    }

    /** Все тайтлы ветки плоским списком (для поиска текущего, подсказок и проверок) */
    const flatten = (order) => (order ? order.steps.flatMap(s => (s.type === 'fork' ? s.routes.flatMap(r => r.items) : [s.item])) : []);

    root.AgFranchise = { build, flatten };
})(typeof globalThis !== 'undefined' ? globalThis : window);
