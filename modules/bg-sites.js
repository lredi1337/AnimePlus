// modules/bg-sites.js
// Поиск тайтла на любом сайте из реестра (modules/shared/sites.js) — для переходов между сайтами,
// Топа Shikimori и кнопки «Смотреть» в popup.
//   - yani: JSON API /api/search → точное совпадение по remote_ids.shikimori_id, иначе по названию;
//   - dle:  страница поиска DLE → разбор карточек → AgTitleMatch.pickBest;
//   - animego: существующий findAnimeGoDirectUrl (bg-cache.js).
// Service worker не имеет DOMParser, поэтому HTML разбирается регулярными выражениями.

const SITE_URL_CACHE_TTL = 3 * 24 * 60 * 60 * 1000;

const stripTags = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/**
 * Карточки выдачи поиска DLE-сайта. Одна карточка часто содержит несколько ссылок
 * (постер + заголовок) — объединяем их по href и берём самое информативное название.
 */
function parseDleSearchCards(html, site) {
    const cards = new Map();
    const re = /<a\b([^>]*\bhref="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/gi;
    for (const m of html.matchAll(re)) {
        let path;
        try { path = new URL(m[2], site.home).pathname; } catch (e) { continue; }
        if (!site.dle.titlePath.test(path)) continue;
        const href = AgSites.absolute(site, path);
        const inner = m[3];

        const alt = (inner.match(/alt="(?:Постер к аниме\s+)?([^"]+)"/i) || [])[1] || '';
        const titleEl = (inner.match(/<[^>]+class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i) || [])[1] || '';
        const text = stripTags(inner);
        const title = stripTags(titleEl) || stripTags(alt) || (text.length < 120 && !/^\d+\s*сери/i.test(text) ? text : '');

        // Год: в самой ссылке или сразу после неё («(2023)», «<span>2024</span>»)
        const after = html.slice(m.index, m.index + m[0].length + 600);
        const year = (after.match(/\((19[6-9]\d|20[0-4]\d)\)|>\s*(19[6-9]\d|20[0-4]\d)\s*</) || []).slice(1).find(Boolean) || '';

        const prev = cards.get(href);
        if (!prev) {
            cards.set(href, { href, title, year });
        } else {
            if (title.length > prev.title.length) prev.title = title;
            if (!prev.year && year) prev.year = year;
        }
    }
    return [...cards.values()].filter(c => c.title);
}

async function searchDleSite(site, { titles, year }) {
    const { pickBest, extractSeason } = globalThis.AgTitleMatch;
    const season = titles.map(extractSeason).find(Boolean) || null;
    for (const query of titles.slice(0, 3)) {
        try {
            const res = await fetch(site.home + site.dle.searchPath + encodeURIComponent(query));
            if (!res.ok) continue;
            const cards = parseDleSearchCards(await res.text(), site);
            const best = cards.length ? pickBest(cards, { titles, year, season }) : null;
            if (best) return best.href;
        } catch (e) {}
    }
    return null;
}

async function searchYaniSite(site, { titles, year, shikimoriId }) {
    const { pickBest } = globalThis.AgTitleMatch;
    for (const query of titles.slice(0, 3)) {
        try {
            const res = await fetch(`${site.home}/api/search?q=${encodeURIComponent(query)}&limit=20`);
            if (!res.ok) continue;
            const list = (await res.json()).response || [];
            if (shikimoriId) {
                const exact = list.find(a => a.remote_ids && String(a.remote_ids.shikimori_id) === String(shikimoriId));
                if (exact) return `${site.home}/catalog/item/${exact.anime_url}`;
                continue; // при известном ID не рискуем совпадением по названию
            }
            const best = pickBest(list.map(a => ({ href: `${site.home}/catalog/item/${a.anime_url}`, title: a.title, year: a.year })), { titles, year });
            if (best) return best.href;
        } catch (e) {}
    }
    return null;
}

/**
 * Прямая ссылка на тайтл на сайте siteId или null.
 * @param {string} siteId
 * @param {{titles?: string[], year?: string|number, shikimoriId?: number|string}} query
 */
async function resolveSiteUrl(siteId, query) {
    const site = AgSites.byId(siteId);
    if (!site) return null;

    let titles = [...new Set((query.titles || []).map(t => String(t || '').trim()).filter(Boolean))];
    let year = query.year || '';
    const shikimoriId = query.shikimoriId ? parseInt(query.shikimoriId, 10) : null;

    // Только ID: названия и год берём из Shikimori
    if (shikimoriId && (titles.length === 0 || !year)) {
        const anime = await fetchShikimoriApi(`/api/animes/${shikimoriId}`);
        if (anime) {
            titles = [...new Set([...titles, anime.name, anime.russian, ...(anime.english || [])].filter(Boolean))];
            year = year || (anime.aired_on ? String(anime.aired_on).slice(0, 4) : '');
        }
    }
    if (titles.length === 0) return null;

    const cacheKey = `${siteId}|${shikimoriId || ''}|${titles[0].toLowerCase()}|${year}`;
    const { ag_site_url_cache: cache = {} } = await chrome.storage.session.get(['ag_site_url_cache']);
    const hit = cache[cacheKey];
    if (hit && Date.now() - hit.ts < SITE_URL_CACHE_TTL) return hit.url;

    let url = null;
    if (site.platform === 'yani') {
        url = await searchYaniSite(site, { titles, year, shikimoriId });
    } else if (site.platform === 'dle') {
        url = site.id === 'jutsu'
            ? await findJutsuDirectUrl(titles[0], titles[1] || '', year)
            : await searchDleSite(site, { titles, year });
    } else if (site.platform === 'animego') {
        url = await findAnimeGoDirectUrl(titles.find(t => /[а-яё]/i.test(t)) || titles[0], titles.find(t => !/[а-яё]/i.test(t)) || titles[0], year);
    }

    // Отрицательный результат тоже кэшируем (url: null), чтобы не повторять поиск при каждом клике
    await updateStorageObject('ag_site_url_cache', c => { c[cacheKey] = { url, ts: Date.now() }; }, { area: chrome.storage.session, maxEntries: 500 });
    return url;
}

/** Ссылки на тайтл сразу на нескольких сайтах (параллельно, с общим таймаутом) */
async function resolveAllSites(query, { siteIds, timeoutMs = 12000 } = {}) {
    const ids = siteIds && siteIds.length ? siteIds : AgSites.list.map(s => s.id);
    const timeout = new Promise(resolve => setTimeout(() => resolve('timeout'), timeoutMs));
    const results = await Promise.all(ids.map(async (id) => {
        const url = await Promise.race([resolveSiteUrl(id, query).catch(() => null), timeout]);
        return { siteId: id, url: url === 'timeout' ? null : url, timedOut: url === 'timeout' };
    }));
    return results;
}

/** ID Shikimori по ссылке-редиректу сайта (например, yummyanime.tv/go/shikimori/8522) */
async function resolveShikiIdFromRedirect(url) {
    try {
        const parsed = new URL(url);
        if (!AgSites.byHost(parsed.hostname) || !/^\/go\/shikimori\//.test(parsed.pathname)) return null;
        const res = await fetch(parsed.href, { method: 'GET', redirect: 'follow' });
        const m = res.url.match(/shikimori\.[a-z]+\/animes\/[a-z]?(\d+)/i);
        return m ? parseInt(m[1], 10) : null;
    } catch (e) {
        return null;
    }
}
