// modules/bg-random.js
// Случайное аниме из Shikimori с учётом настроек зрителя и ссылка на него на нужном сайте

function cleanTitleForCompare(str) {
    if (!str) return '';
    return String(str).toLowerCase()
        .replace(/\(\s*tv[^)]*\)/gi, '')
        .replace(/[:.,\-\—!?]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isRandomTitleMatch(queryTitle, resultTitle) {
    const qClean = cleanTitleForCompare(queryTitle);
    const rClean = cleanTitleForCompare(resultTitle);
    if (!qClean || !rClean) return false;
    if (qClean === rClean) return true;

    const qWords = qClean.split(' ').filter(w => w.length > 2);
    const rWords = rClean.split(' ').filter(w => w.length > 2);
    if (qWords.length === 0 || rWords.length === 0) return false;

    const matchCount = qWords.filter(w => rWords.includes(w)).length;
    return (matchCount / qWords.length) >= 0.6;
}

function isKindCompatible(targetKind, resultText) {
    if (!targetKind || !resultText) return true;
    const txt = String(resultText).toLowerCase();
    const k = String(targetKind).toLowerCase();
    if (k === 'movie') {
        if (txt.includes('ova') || txt.includes('ова') || txt.includes('сериал') || txt.includes('tv')) {
            if (!txt.includes('фильм') && !txt.includes('movie')) return false;
        }
    } else if (k === 'tv') {
        if (txt.includes('ova') || txt.includes('ова') || txt.includes('фильм') || txt.includes('movie')) {
            if (!txt.includes('tv') && !txt.includes('сериал')) return false;
        }
    } else if (k === 'ova') {
        if (txt.includes('фильм') && !txt.includes('ova') && !txt.includes('ова')) return false;
    }
    return true;
}

function randomFilters(settings) {
    let minScore = 0;
    if (settings.random_min_score && settings.random_min_score !== 'any') {
        minScore = parseFloat(settings.random_min_score);
        if (isNaN(minScore)) minScore = 0;
    }
    const kinds = Array.isArray(settings.random_kinds) && settings.random_kinds.length > 0
        ? settings.random_kinds.map(k => String(k).toLowerCase())
        : ['tv', 'movie', 'ona', 'ova', 'special'];
    return { minScore, kinds };
}

async function fetchRandomCandidates({ minScore, kinds }) {
    const passes = (item) => {
        if (!item || !item.score) return false;
        const score = parseFloat(item.score);
        if (isNaN(score)) return false;
        if (minScore > 0 && score < minScore) return false;
        const kind = String(item.kind || '').toLowerCase();
        return !(kinds.length > 0 && kind && !kinds.includes(kind));
    };

    const apiScore = minScore > 0 ? Math.floor(minScore) : 0;
    let maxPages = 50;
    if (minScore > 0) {
        maxPages = 15;
        if (apiScore >= 8) maxPages = 8;
        if (apiScore >= 9) maxPages = 2;
    }

    const pages = [1];
    while (pages.length < 4 && pages.length < maxPages) {
        const p = Math.floor(Math.random() * maxPages) + 1;
        if (!pages.includes(p)) pages.push(p);
    }

    const kindParam = kinds.length > 0 && kinds.length < 5 ? '&kind=' + kinds.join(',') : '';
    const scoreParam = minScore > 0 ? `&score=${apiScore}` : '';
    const lists = await Promise.all(pages.map(page =>
        fetchShikimoriApi(`/api/animes?limit=50&page=${page}${scoreParam}&order=ranked${kindParam}`).catch(() => [])
    ));
    return lists.flatMap(list => (Array.isArray(list) ? list.filter(passes) : []));
}

// Для сайтов-провайдеров (ru.yummyani.me и др.) ищем тайтл прямо на целевом сайте
async function pickRandomOnSite(candidates, { siteId, currentUrl }) {
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    for (const cand of shuffled.slice(0, 15)) {
        const url = await resolveSiteUrl(siteId, {
            titles: [cand.russian, cand.name].filter(Boolean),
            year: cand.aired_on ? cand.aired_on.split('-')[0] : '',
            shikimoriId: cand.id
        }).catch(() => null);
        if (url && !(currentUrl && url === currentUrl)) {
            return { url, id: cand.id, name: cand.name, russian: cand.russian, score: cand.score, kind: cand.kind };
        }
    }

    const fallback = shuffled[0];
    const site = AgSites.byId(siteId);
    const query = fallback ? (fallback.russian || fallback.name) : '';
    let catalogUrl = null;
    if (site && query) {
        if (site.platform === 'yani') catalogUrl = `${site.home}/catalog?q=${encodeURIComponent(query)}`;
        else if (site.dle && site.dle.searchPath) catalogUrl = `${site.home}${site.dle.searchPath}${encodeURIComponent(query)}`;
    }
    return {
        url: catalogUrl,
        id: fallback ? fallback.id : null,
        name: fallback ? fallback.name : null,
        russian: fallback ? fallback.russian : null,
        fallback: true
    };
}

async function searchAnimeGoUrl(russianName, origName, kind) {
    const IGNORED = ['/anime/random', '/anime/status', '/anime/season', '/anime/catalog', '/anime/ongoing', '/anime/top'];
    const queries = [...new Set([origName, russianName].filter(Boolean))];
    for (const query of queries) {
        try {
            const resp = await fetch(`https://animego.me/search/anime?q=${encodeURIComponent(query)}`);
            if (!resp.ok) continue;
            const html = await resp.text();
            for (const match of html.matchAll(/<a[^>]+href="(\/anime\/[a-zA-Z0-9\-]+-\d+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
                const link = match[1];
                const text = match[2].replace(/<[^>]+>/g, '').trim();
                if (IGNORED.some(ig => link.startsWith(ig))) continue;
                if ((isRandomTitleMatch(russianName, text) || isRandomTitleMatch(origName, text)) && isKindCompatible(kind, text)) {
                    return `https://animego.me${link}`;
                }
            }
        } catch (e) {}
    }
    return null;
}

async function getRandomShikimoriAnime(message) {
    const { ag_settings: settings = {} } = await chrome.storage.local.get(['ag_settings']);
    const filters = randomFilters(settings);
    const candidates = await fetchRandomCandidates(filters);
    if (candidates.length === 0) return { url: null, reason: 'no_match', minScore: filters.minScore };

    if (message.siteId && message.siteId !== 'animego' && message.siteId !== 'jutsu') {
        return pickRandomOnSite(candidates, message);
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const russianName = chosen.russian || '';
    const origName = chosen.name || '';
    const year = chosen.aired_on ? parseInt(chosen.aired_on.split('-')[0]) : null;

    const [animeGoUrl, jutsuUrl] = await Promise.all([
        searchAnimeGoUrl(russianName, origName, String(chosen.kind || '').toLowerCase()).catch(() => null),
        findJutsuDirectUrl(russianName, origName, year).catch(() => null)
    ]);

    return {
        foundOnAnimeGO: !!animeGoUrl,
        url: animeGoUrl || `https://animego.me/anime/shiki-${chosen.id}`,
        jutsuUrl,
        id: chosen.id,
        name: origName,
        russian: russianName
    };
}
