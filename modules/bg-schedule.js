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

function scheduleFilters(settings) {
    const parsedMin = parseFloat(settings.ongoing_min_score);
    return {
        enabled: settings.ongoing_enabled !== undefined ? settings.ongoing_enabled : true,
        hideChinese: settings.ongoing_hide_chinese !== undefined ? settings.ongoing_hide_chinese : (settings.schedule_hide_chinese === true),
        hideLongRunning: settings.ongoing_hide_long_running || settings.schedule_hide_long === true,
        minScore: (settings.ongoing_min_score !== undefined && !isNaN(parsedMin)) ? parsedMin : (settings.schedule_min_score ? parseFloat(settings.schedule_min_score) : 0),
        allowedTypes: Array.isArray(settings.ongoing_types) ? settings.ongoing_types : (Array.isArray(settings.schedule_types) ? settings.schedule_types : ['TV', 'ONA', 'OVA'])
    };
}

function passesScheduleFilters(item, filters) {
    const anime = item.anime;
    const kind = anime.kind ? anime.kind.toUpperCase() : 'TV';
    if (filters.allowedTypes.length > 0 && !filters.allowedTypes.includes(kind)) return false;
    if (filters.hideChinese && isChineseAnime(anime)) return false;
    if (filters.hideLongRunning && item.next_episode && item.next_episode > 24) return false;
    if (filters.hideLongRunning && ((anime.episodes && anime.episodes > 24) || (anime.episodes_aired && anime.episodes_aired > 24))) return false;
    const score = parseFloat(anime.score || 0);
    return !(filters.minScore > 0 && score > 0 && score < filters.minScore);
}

async function toScheduleEntry(item) {
    const anime = item.anime;
    const russian = anime.russian || anime.name;
    const origTitle = anime.name;
    const kind = anime.kind ? anime.kind.toUpperCase() : 'TV';
    const year = anime.aired_on ? parseInt(anime.aired_on.split('-')[0]) : null;
    const nextEpisodeAt = item.next_episode_at || null;
    const fallbackJutsuUrl = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(russian || origTitle)}&ag_from=animeplus&ag_russian=${encodeURIComponent(russian)}&ag_name=${encodeURIComponent(origTitle)}&ag_year=${encodeURIComponent(year || '')}&ag_kind=${encodeURIComponent(kind || '')}`;
    const cachedDirect = await getDirectUrlFromCache(getCacheKey(russian, origTitle, year));
    return {
        id: anime.id,
        russian,
        name: origTitle,
        poster: schedulePoster(anime),
        score: anime.score || null,
        kind,
        year,
        nextEpisode: item.next_episode || null,
        nextEpisodeAt,
        dayOfWeek: nextEpisodeAt ? new Date(nextEpisodeAt).getDay() : null,
        jutsuUrl: cachedDirect || fallbackJutsuUrl
    };
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

async function getOngoingSchedule(message) {
    const { ag_settings: stored } = await chrome.storage.local.get(['ag_settings']);
    const filters = scheduleFilters(message.settings || stored || {});
    if (!filters.enabled) return { schedule: [] };

    const calendar = await fetchCalendar();
    if (!Array.isArray(calendar)) return { schedule: [] };

    const items = calendar.filter(item => item && item.anime && passesScheduleFilters(item, filters));
    const schedule = await Promise.all(items.map(toScheduleEntry));
    await fillShikiPosters(schedule);
    return { schedule };
}
