// modules/bg-schedule.js
// Расписание онгоингов и обложки для его карточек

// Кэш обложек в памяти service worker
const scheduleCoverMemoryCache = new Map();
const saveScheduleCover = (key, url) => updateStorageObject('ag_schedule_covers_cache', c => { c[key] = url; }, { maxEntries: 1500 });

async function findKitsuCover(query) {
    if (!query) return null;
    try {
        const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=1`);
        if (!res.ok) return null;
        const json = await res.json();
        const image = json?.data?.[0]?.attributes?.posterImage;
        return image ? (image.medium || image.small || image.original || null) : null;
    } catch (e) {
        return null;
    }
}

async function findJutsuCover(query) {
    if (!query) return null;
    try {
        const resp = await fetch(`https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
        });
        if (!resp.ok) return null;
        const html = await resp.text();
        const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
        if (ogMatch && ogMatch[1]) {
            return ogMatch[1].startsWith('/') ? 'https://jut-su.net' + ogMatch[1] : ogMatch[1];
        }
        const imgMatch = html.match(/src=["'](\/uploads\/posts\/[^"']+)["']/i);
        return imgMatch && imgMatch[1] ? 'https://jut-su.net' + imgMatch[1] : null;
    } catch (e) {
        return null;
    }
}

async function findShikiCover(id) {
    // Настоящий постер Shikimori из GraphQL (REST часто отдаёт заглушку «лису»)
    const gqlPoster = (await getShikiPosters([id]))[parseInt(id, 10)];
    if (gqlPoster) return gqlPoster;
    try {
        const res = await shikiRateFetch(`${SHIKI_API_BASE}/api/animes/${id}`, {
            headers: { 'User-Agent': SHIKI_APP_USER_AGENT, 'Accept': 'application/json' }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const poster = data?.image?.preview || data?.image?.original;
        return poster && !poster.includes('missing') && !poster.includes('404') ? absoluteShikiUrl(poster) : null;
    } catch (e) {
        return null;
    }
}

async function resolveJutsuCover({ id, russian, name, title }) {
    const ruTitle = (russian || '').trim();
    const enTitle = (name || title || '').trim();
    const cacheKey = (ruTitle || enTitle || id || '').toLowerCase();
    const answer = (url) => ({ poster: url, url });
    if (!cacheKey) return answer(null);

    if (scheduleCoverMemoryCache.has(cacheKey)) return answer(scheduleCoverMemoryCache.get(cacheKey));

    const { ag_schedule_covers_cache: diskCache = {} } = await chrome.storage.local.get(['ag_schedule_covers_cache']);
    if (diskCache[cacheKey]) {
        scheduleCoverMemoryCache.set(cacheKey, diskCache[cacheKey]);
        return answer(diskCache[cacheKey]);
    }

    let poster = id ? await findShikiCover(id) : null;
    if (!poster) {
        const [kitsuRu, kitsuEn, jutsuRu] = await Promise.all([findKitsuCover(ruTitle), findKitsuCover(enTitle), findJutsuCover(ruTitle)]);
        poster = kitsuRu || kitsuEn || jutsuRu;
    }
    if (!poster) return answer(null);

    scheduleCoverMemoryCache.set(cacheKey, poster);
    saveScheduleCover(cacheKey, poster);
    return answer(poster);
}

function schedulePoster(anime) {
    const poster = anime.image ? (anime.image.preview || anime.image.x96 || anime.image.original || '') : '';
    if (!poster || /missing|no-poster|stub|404/.test(poster)) return '';
    if (!poster.startsWith('http')) return 'https://shikimori.io' + (poster.startsWith('/') ? '' : '/') + poster;
    return poster.replace('shikimori.one', 'shikimori.io').replace('shikimori.me', 'shikimori.io');
}

async function fetchCalendar() {
    const now = Date.now();
    if (cachedScheduleData && now - cachedScheduleTime <= 300000) return cachedScheduleData;
    try {
        const resp = await shikiRateFetch('https://shikimori.io/api/calendar', {
            headers: { 'User-Agent': SHIKI_APP_USER_AGENT, 'Accept': 'application/json' }
        });
        if (resp.ok) {
            const calendar = await resp.json();
            if (Array.isArray(calendar) && calendar.length > 0) {
                cachedScheduleData = calendar;
                cachedScheduleTime = now;
            }
            return calendar;
        }
    } catch (e) {
        console.error('Shikimori calendar fetch error:', e);
    }
    return cachedScheduleData;
}


// ---------- Неделя расписания ----------
// Страница расписания (schedule/schedule.js) получает серии текущей недели вместе со сведениями о тайтлах.
// Правила недели, памяти о сериях и фильтров: modules/shared/schedule-core.js

const SCHEDULE_SEEN_KEY = 'ag_schedule_seen';
const SCHEDULE_DETAILS_KEY = 'ag_schedule_details';
const SCHEDULE_DETAILS_TTL = 24 * 60 * 60 * 1000;
const SCHEDULE_DETAILS_MAX = 400;
const SCHEDULE_GQL_CHUNK = 50;

// Жанры, длина серии, возрастной рейтинг и оригинальное название есть только в GraphQL
async function fetchScheduleExtras(ids) {
    const extras = {};
    for (let i = 0; i < ids.length; i += SCHEDULE_GQL_CHUNK) {
        const chunk = ids.slice(i, i + SCHEDULE_GQL_CHUNK);
        try {
            const res = await shikiRateFetch(`${SHIKI_API_BASE}/api/graphql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ query: `{ animes(ids: "${chunk.join(',')}", limit: ${chunk.length}) { id japanese rating score episodes episodesAired duration airedOn { date } poster { mainUrl } genres { russian } } }` })
            });
            if (!res.ok) continue;
            const json = await res.json();
            for (const a of (json && json.data && json.data.animes) || []) extras[parseInt(a.id, 10)] = a;
        } catch (e) { /* без этих сведений тайтл показывается по данным календаря */ }
    }
    return extras;
}

function scheduleDetail(anime, extra, now) {
    const more = extra || {};
    return {
        id: anime.id,
        russian: anime.russian || anime.name || '',
        name: anime.name || '',
        kind: String(anime.kind || 'tv').toUpperCase(),
        score: parseFloat(more.score || anime.score) || 0,
        episodes: more.episodes || anime.episodes || 0,
        episodesAired: more.episodesAired || anime.episodes_aired || 0,
        duration: more.duration || 0,
        rating: more.rating || '',
        genres: (more.genres || []).map(g => g.russian).filter(Boolean),
        cn: AgSchedule.isChinese(more.japanese) || isChineseAnime(anime),
        airedOn: (more.airedOn && more.airedOn.date) || anime.aired_on || '',
        poster: (more.poster && more.poster.mainUrl) || schedulePoster(anime),
        // Без ответа GraphQL запись считается устаревшей сразу: в следующий раз сведения запросятся снова
        ts: extra ? now : 0
    };
}

/** Сведения о тайтлах календаря: свежие из сети, остальные из хранилища. Возвращает всё, что известно */
async function scheduleDetails(items, now) {
    const { [SCHEDULE_DETAILS_KEY]: known = {} } = await chrome.storage.local.get([SCHEDULE_DETAILS_KEY]);
    const stale = items.filter(item => !known[item.anime.id] || now - known[item.anime.id].ts > SCHEDULE_DETAILS_TTL);
    if (stale.length === 0) return known;
    const extras = await fetchScheduleExtras(stale.map(item => item.anime.id));
    const fresh = Object.fromEntries(stale.map(item => [item.anime.id, scheduleDetail(item.anime, extras[item.anime.id], now)]));
    return updateStorageObject(SCHEDULE_DETAILS_KEY, (all) => {
        for (const [id, detail] of Object.entries(fresh)) {
            // Сеть не ответила: прежние полные сведения лучше новых неполных
            if (detail.ts || !all[id]) all[id] = detail;
        }
    }, { maxEntries: SCHEDULE_DETAILS_MAX });
}

async function getWeekSchedule() {
    const now = Date.now();
    const calendar = await fetchCalendar();
    const items = (Array.isArray(calendar) ? calendar : []).filter(item => item && item.anime && item.anime.id);
    const details = await scheduleDetails(items, now);
    const seen = await updateStorageObject(SCHEDULE_SEEN_KEY, (old) => AgSchedule.remember(old, items, now));
    const entries = AgSchedule.weekEntries(seen, now)
        .filter(e => details[e.id])
        .map(e => ({ ...details[e.id], ep: e.ep, at: e.at, day: e.day }));
    return { entries, weekStart: AgSchedule.weekStart(now), loaded: items.length > 0, watching: await getShikiWatchingProgress() };
}
