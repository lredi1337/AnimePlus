// modules/bg-franchise.js
// Франшиза тайтла для блока «Порядок просмотра» («Случайное аниме», подбор): ответ Shikimori /api/animes/<id>/franchise.
// Порядок строят страницы (modules/shared/franchise-core.js): так переключатель «по сюжету / по выходу» не ходит в сеть.
// Ответ сжимается до нужных полей, к нему — постеры (GraphQL, общий кеш постеров). Хранится неделю;
// «франшизы нет» (404) — сутки; ошибка сети не запоминается
const FRANCHISE_CACHE_KEY = 'ag_franchise_cache';
const FRANCHISE_TTL = 7 * 24 * 60 * 60 * 1000;
const FRANCHISE_MISS_TTL = 24 * 60 * 60 * 1000;
const FRANCHISE_MAX = 80;
const FRANCHISE_HIDDEN = /^(клип|проморолик|реклама|music|pv|cm)$/i;
const franchiseMemo = new Map();

/** Только то, что нужно порядку просмотра: id, название, тип, год, дата, связи. Клипы и реклама отброшены */
function compactFranchise(raw, id) {
    const nodes = (Array.isArray(raw && raw.nodes) ? raw.nodes : [])
        .filter(n => parseInt(n.id, 10) > 0 && !FRANCHISE_HIDDEN.test(String(n.kind || '').trim()))
        .map(n => ({
            id: parseInt(n.id, 10),
            name: String(n.name || '').slice(0, 300),
            kind: String(n.kind || '').slice(0, 40),
            year: parseInt(n.year, 10) || null,
            date: Number.isFinite(n.date) ? n.date : null
        }));
    const ids = new Set(nodes.map(n => n.id));
    const links = (Array.isArray(raw && raw.links) ? raw.links : [])
        .map(l => ({ source_id: parseInt(l.source_id, 10), target_id: parseInt(l.target_id, 10), relation: String(l.relation || '').slice(0, 40) }))
        .filter(l => ids.has(l.source_id) && ids.has(l.target_id));
    return { current_id: id, nodes, links };
}

async function getFranchise(rawId) {
    const id = parseInt(rawId, 10);
    if (!(id > 0)) return { franchise: null, reason: 'invalid' };
    const now = Date.now();
    const fresh = (hit) => hit && now - hit.ts < (hit.data ? FRANCHISE_TTL : FRANCHISE_MISS_TTL);
    const reply = (hit) => ({ franchise: hit.data ? { ...hit.data, current_id: id } : null, posters: hit.posters || {} });

    const memo = franchiseMemo.get(id);
    if (fresh(memo)) return reply(memo);
    const stored = (await chrome.storage.local.get([FRANCHISE_CACHE_KEY]))[FRANCHISE_CACHE_KEY] || {};
    if (fresh(stored[id])) {
        franchiseMemo.set(id, stored[id]);
        return reply(stored[id]);
    }

    let raw;
    try {
        raw = await fetchShikimoriApi(`/api/animes/${id}/franchise`);
    } catch (e) {
        return { franchise: null, reason: 'error' };
    }
    // null — 404 или сеть: различить нельзя, поэтому «нет» запоминаем только для ответа без узлов
    if (raw === null || raw === undefined) return { franchise: null, reason: 'error' };
    const data = compactFranchise(raw, id);
    const entry = { ts: now, data: data.nodes.length > 1 ? data : null, posters: {} };
    if (entry.data) {
        try {
            entry.posters = await getShikiPosters(data.nodes.map(n => n.id));
        } catch (e) { /* без постеров блок всё равно показывается */ }
    }
    franchiseMemo.set(id, entry);
    await updateStorageObject(FRANCHISE_CACHE_KEY, (c) => { c[id] = entry; return c; }, { maxEntries: FRANCHISE_MAX }).catch(() => {});
    return reply(entry);
}
