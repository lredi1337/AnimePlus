// background.js — Маршрутизатор фоновых сообщений и событий Chrome Extension
importScripts('./credentials.js', './modules/shared/sites.js', './modules/shared/title-match.js', './modules/bg-cache.js', './modules/bg-shiki.js', './modules/bg-sites.js', './modules/bg-audio.js');

try {
    const workerUrl = (globalThis.SHIKI_CREDENTIALS && globalThis.SHIKI_CREDENTIALS.worker_url) || "https://animeplus.ruscadred.workers.dev";
    chrome.storage.local.set({ shiki_worker_url: workerUrl });
} catch (e) {}

const EXTENSION_VERSION = chrome.runtime.getManifest().version;
const EXTENSION_USER_AGENT = `AnimePlus/${EXTENSION_VERSION} (Browser Extension)`;

// Хосты, к которым content-скрипты могут обращаться через fetch_shikimori.
// Без белого списка обработчик был открытым прокси с правами расширения на любой URL
const PROXY_ALLOWED_HOSTS = /^(?:[a-z0-9-]+\.)*(?:shikimori\.(?:io|one|me|org)|api\.animethemes\.moe|kitsu\.io)$/i;

function isAllowedProxyUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        return url.protocol === 'https:' && PROXY_ALLOWED_HOSTS.test(url.hostname);
    } catch (e) {
        return false;
    }
}

// Кэш обложек в памяти service worker. Раньше Map создавалась внутри обработчика заново на каждое сообщение
const scheduleCoverMemoryCache = new Map();
const saveScheduleCover = (key, url) => updateStorageObject('ag_schedule_covers_cache', c => { c[key] = url; }, { maxEntries: 1500 });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Принимаем сообщения только от собственных контекстов расширения
    if (!sender || sender.id !== chrome.runtime.id || !message || typeof message.action !== 'string') return false;

    if (message.action === "force_check_episodes") {
        (async () => {
            try {
                if (typeof checkNewEpisodeNotifications === 'function') {
                    await checkNewEpisodeNotifications(true);
                }
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false, error: e.toString() });
            }
        })();
        return true;
    }

    if (message.action === "search_anime") {
        fetch(`https://animego.org/search/anime?q=${encodeURIComponent(message.query)}`)
            .then(res => res.text())
            .then(text => sendResponse({ html: text }))
            .catch(err => sendResponse({ error: err.toString() }));
        return true;
    }

    // --- Сайты из реестра (modules/bg-sites.js) ---
    if (message.action === "resolve_site_url") {
        resolveSiteUrl(message.siteId, message)
            .then(url => sendResponse({ url }))
            .catch(() => sendResponse({ url: null }));
        return true;
    }

    if (message.action === "resolve_all_sites") {
        resolveAllSites(message, { siteIds: message.siteIds })
            .then(results => sendResponse({ results }))
            .catch(() => sendResponse({ results: [] }));
        return true;
    }

    if (message.action === "resolve_shiki_id_redirect") {
        resolveShikiIdFromRedirect(message.url)
            .then(id => sendResponse({ id }))
            .catch(() => sendResponse({ id: null }));
        return true;
    }

    if (message.action === "resolve_shiki_posters") {
        getShikiPosters(message.ids || [])
            .then(posters => sendResponse({ posters }))
            .catch(() => sendResponse({ posters: {} }));
        return true;
    }

    if (message.action === "resolve_shikimori_id") {
        resolveShikimoriId(message)
            .then(data => sendResponse(data || { id: null }))
            .catch(err => sendResponse({ id: null, error: err.message }));
        return true;
    }

    if (message.action === "get_native_page_template") {
        getNativePageTemplate(message.origin)
            .then(html => sendResponse({ html }))
            .catch(err => {
                console.error('[AnimeGO+] Error fetching native template:', err);
                sendResponse({ html: null });
            });
        return true;
    }

    if (message.action === "get_audio_fingerprints") {
        getAudioFingerprints(message.id)
            .then(sendResponse)
            .catch(() => sendResponse(null));
        return true;
    }

    if (message.action === "get_shared_timings") {
        getSharedTimings(message).then(sendResponse).catch(() => sendResponse(null));
        return true;
    }

    if (message.action === "report_audio_timing") {
        reportAudioTiming(message).then(sendResponse).catch(() => sendResponse(null));
        return true;
    }

    if (message.action === "fetch_shikimori") {
        (async () => {
            try {
                let urlStr = message.url;
                if (!urlStr) {
                    return sendResponse({ error: 'No URL provided', status: 400 });
                }

                urlStr = toShikiApiUrl(urlStr);
                if (!isAllowedProxyUrl(urlStr)) {
                    console.warn('[Anime+] fetch_shikimori: blocked URL', urlStr);
                    return sendResponse({ error: 'URL not allowed', status: 403, data: null });
                }

                const headers = {
                    'User-Agent': EXTENSION_USER_AGENT,
                    'Accept': 'application/json, text/plain, */*'
                };

                const res = await fetch(urlStr, { headers });
                const status = res.status;
                let body = null;
                try {
                    const text = await res.text();
                    try {
                        body = JSON.parse(text);
                    } catch (jsonErr) {
                        body = { text };
                    }
                } catch (readErr) {
                    console.error("Background fetch read error:", readErr);
                }
                sendResponse({ data: body, status });
            } catch (err) {
                console.error("Error fetching shikimori details:", err);
                sendResponse({ data: null });
            }
        })();
        return true;
    }

    if (message.action === "search_jutsu_direct") {
        (async () => {
            try {
                const { queryTitle, origTitle, targetYear } = message;
                const url = await findJutsuDirectUrl(queryTitle, origTitle, targetYear);
                sendResponse({ url });
            } catch (err) {
                console.error("Error in search_jutsu_direct:", err);
                sendResponse({ url: null });
            }
        })();
        return true;
    }

    if (message.action === "add_watch_history") {
        addToWatchHistory(message.item)
            .then(() => sendResponse({ success: true }))
            .catch(() => sendResponse({ success: false }));
        return true;
    }

    if (message.action === "search_fallback_anime") {
        (async () => {
            try {
                const query = message.query;
                if (!query || !query.trim()) {
                    sendResponse({ results: [] });
                    return;
                }

                const shikiResp = await fetch(`https://shikimori.io/api/animes?search=${encodeURIComponent(query.trim())}&limit=12`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
                });
                if (!shikiResp.ok) {
                    sendResponse({ results: [] });
                    return;
                }
                const shikiList = await shikiResp.json();
                if (!Array.isArray(shikiList) || shikiList.length === 0) {
                    sendResponse({ results: [] });
                    return;
                }

                const menuWords = ['все аниме', 'популярные франшизы', 'подборки', 'с субтитрами', 'топ аниме', 'расписание', 'онгоинги', 'фильмы', 'ова', 'новости', 'поиск', 'главная', 'карта сайта', 'контакты', 'правообладателям', 'добавить'];

                const results = [];
                const addedIds = new Set();

                for (const item of shikiList) {
                    if (!item || !item.id || addedIds.has(item.id)) continue;

                    const russian = item.russian || item.name;
                    const origTitle = item.name || '';
                    const rLower = russian.toLowerCase().trim();

                    if (menuWords.includes(rLower)) continue;
                    if (query.trim().toLowerCase() === 'царство' && rLower.includes('женьшеня')) continue;

                    addedIds.add(item.id);

                    const year = item.aired_on ? parseInt(item.aired_on.split('-')[0]) : null;
                    let poster = item.image ? (item.image.original || item.image.preview || '') : '';
                    if (poster && !poster.startsWith('http')) {
                        poster = 'https://shikimori.one' + poster;
                    }

                    const targetSearchQuery = russian || origTitle;
                    const fallbackJutsuUrl = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(targetSearchQuery)}&ag_from=animeplus&ag_russian=${encodeURIComponent(russian)}&ag_name=${encodeURIComponent(origTitle)}&ag_year=${encodeURIComponent(year || '')}&ag_kind=${encodeURIComponent(item.kind || '')}`;

                    const cacheKey = getCacheKey(russian, origTitle, year);
                    const cachedDirect = await getDirectUrlFromCache(cacheKey);

                    results.push({
                        id: item.id,
                        russian: russian,
                        name: origTitle,
                        poster: poster,
                        score: item.score || null,
                        kind: item.kind ? item.kind.toUpperCase() : '',
                        year: year,
                        jutsuUrl: cachedDirect || fallbackJutsuUrl
                    });
                }

                const topItems = results.slice(0, 3);
                const preResolveTask = Promise.all(topItems.map(async (resItem) => {
                    try {
                        const direct = await findJutsuDirectUrl(resItem.russian, resItem.name, resItem.year, resItem.kind);
                        if (direct) {
                            resItem.jutsuUrl = direct;
                        }
                    } catch (e) {}
                }));

                const timeoutTask = new Promise(resolve => setTimeout(resolve, 200));
                await Promise.race([preResolveTask, timeoutTask]);

                await fillShikiPosters(results);
                sendResponse({ results });
            } catch (err) {
                console.error("Error in search_fallback_anime:", err);
                sendResponse({ results: [] });
            }
        })();
        return true;
    }


    if (message.action === "resolve_jutsu_cover") {
        (async () => {
            try {
                const { id, russian, name, title } = message;
                const ruTitle = (russian || '').trim();
                const enTitle = (name || title || '').trim();
                const cacheKey = (ruTitle || enTitle || id || '').toLowerCase();

                if (!cacheKey) return sendResponse({ poster: null, url: null });

                if (scheduleCoverMemoryCache.has(cacheKey)) {
                    const cached = scheduleCoverMemoryCache.get(cacheKey);
                    return sendResponse({ poster: cached, url: cached });
                }

                const storageRes = await chrome.storage.local.get(['ag_schedule_covers_cache']);
                const diskCache = storageRes.ag_schedule_covers_cache || {};
                if (diskCache[cacheKey]) {
                    scheduleCoverMemoryCache.set(cacheKey, diskCache[cacheKey]);
                    return sendResponse({ poster: diskCache[cacheKey], url: diskCache[cacheKey] });
                }

                // 1. Настоящий постер Shikimori из GraphQL (REST часто отдаёт заглушку «лису»)
                if (id) {
                    const gqlPoster = (await getShikiPosters([id]))[parseInt(id, 10)];
                    if (gqlPoster) {
                        scheduleCoverMemoryCache.set(cacheKey, gqlPoster);
                        diskCache[cacheKey] = gqlPoster;
                        saveScheduleCover(cacheKey, gqlPoster);
                        return sendResponse({ poster: gqlPoster, url: gqlPoster });
                    }
                }

                if (id) {
                    try {
                        const shikiRes = await fetch(`https://shikimori.io/api/animes/${id}`, {
                            headers: { 'User-Agent': EXTENSION_USER_AGENT, 'Accept': 'application/json' }
                        });
                        if (shikiRes.ok) {
                            const shikiData = await shikiRes.json();
                            let p = shikiData?.image?.preview || shikiData?.image?.original;
                            if (p && !p.includes('missing') && !p.includes('404')) {
                                p = absoluteShikiUrl(p);
                                scheduleCoverMemoryCache.set(cacheKey, p);
                                diskCache[cacheKey] = p;
                                saveScheduleCover(cacheKey, p);
                                return sendResponse({ poster: p, url: p });
                            }
                        }
                    } catch (e) {}
                }

                const fetchKitsu = async (query) => {
                    if (!query) return null;
                    try {
                        const res = await fetch(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=1`);
                        if (res.ok) {
                            const json = await res.json();
                            if (json?.data?.[0]?.attributes?.posterImage) {
                                return json.data[0].attributes.posterImage.medium || json.data[0].attributes.posterImage.small || json.data[0].attributes.posterImage.original || null;
                            }
                        }
                    } catch (e) {}
                    return null;
                };

                const fetchJutsu = async (query) => {
                    if (!query) return null;
                    try {
                        const resp = await fetch(`https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(query)}`, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
                        });
                        if (resp.ok) {
                            const html = await resp.text();
                            const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
                            if (ogMatch && ogMatch[1]) {
                                let p = ogMatch[1];
                                return p.startsWith('/') ? 'https://jut-su.net' + p : p;
                            }
                            const imgMatch = html.match(/src=["'](\/uploads\/posts\/[^"']+)["']/i);
                            if (imgMatch && imgMatch[1]) {
                                return 'https://jut-su.net' + imgMatch[1];
                            }
                        }
                    } catch (e) {}
                    return null;
                };

                const [kitsuRu, kitsuEn, jutsuRu] = await Promise.all([
                    fetchKitsu(ruTitle),
                    fetchKitsu(enTitle),
                    fetchJutsu(ruTitle)
                ]);

                const finalPoster = kitsuRu || kitsuEn || jutsuRu;

                if (finalPoster) {
                    scheduleCoverMemoryCache.set(cacheKey, finalPoster);
                    diskCache[cacheKey] = finalPoster;
                    saveScheduleCover(cacheKey, finalPoster);
                    return sendResponse({ poster: finalPoster, url: finalPoster });
                }

                sendResponse({ poster: null, url: null });
            } catch (e) {
                sendResponse({ poster: null, url: null });
            }
        })();
        return true;
    }

    if (message.action === "get_ongoing_schedule") {
        (async () => {
            try {
                const storageData = await chrome.storage.local.get(['ag_settings']);
                const settings = message.settings || storageData.ag_settings || {};
                const ongoingEnabled = settings.ongoing_enabled !== undefined ? settings.ongoing_enabled : true;
                const hideChinese = settings.ongoing_hide_chinese !== undefined ? settings.ongoing_hide_chinese : (settings.schedule_hide_chinese === true);
                const hideLongRunning = settings.ongoing_hide_long_running || settings.schedule_hide_long === true;
                const minScore = (settings.ongoing_min_score !== undefined && !isNaN(parseFloat(settings.ongoing_min_score))) ? parseFloat(settings.ongoing_min_score) : (settings.schedule_min_score ? parseFloat(settings.schedule_min_score) : 0);
                const allowedTypes = Array.isArray(settings.ongoing_types) ? settings.ongoing_types : (Array.isArray(settings.schedule_types) ? settings.schedule_types : ["TV", "ONA", "OVA"]);

                if (!ongoingEnabled) {
                    return sendResponse({ schedule: [] });
                }

                const now = Date.now();
                let calendarData = cachedScheduleData;
                if (!calendarData || (now - cachedScheduleTime) > 300000) {
                    try {
                        const resp = await fetch('https://shikimori.io/api/calendar', {
                            headers: {
                                'User-Agent': EXTENSION_USER_AGENT,
                                'Accept': 'application/json'
                            }
                        });
                        if (resp.ok) {
                            calendarData = await resp.json();
                            if (Array.isArray(calendarData) && calendarData.length > 0) {
                                cachedScheduleData = calendarData;
                                cachedScheduleTime = now;
                            }
                        }
                    } catch (e) {
                        console.error("Shikimori calendar fetch error:", e);
                    }
                }

                if (!Array.isArray(calendarData)) {
                    return sendResponse({ schedule: [] });
                }

                const schedulePromises = calendarData.map(async (item) => {
                    if (!item || !item.anime) return null;
                    const anime = item.anime;
                    const russian = anime.russian || anime.name;
                    const origTitle = anime.name;

                    const kind = anime.kind ? anime.kind.toUpperCase() : 'TV';
                    if (allowedTypes.length > 0 && !allowedTypes.includes(kind)) {
                        return null;
                    }

                    if (hideChinese && isChineseAnime(anime)) {
                        return null;
                    }

                    const nextEpisode = item.next_episode || null;
                    if (hideLongRunning && nextEpisode && nextEpisode > 24) {
                        return null;
                    }
                    if (hideLongRunning && ((anime.episodes && anime.episodes > 24) || (anime.episodes_aired && anime.episodes_aired > 24))) {
                        return null;
                    }

                    const scoreVal = parseFloat(anime.score || 0);
                    if (minScore > 0 && scoreVal > 0 && scoreVal < minScore) {
                        return null;
                    }

                    const year = anime.aired_on ? parseInt(anime.aired_on.split('-')[0]) : null;

                    let poster = anime.image ? (anime.image.preview || anime.image.x96 || anime.image.original || '') : '';
                    if (poster && (poster.includes('missing') || poster.includes('no-poster') || poster.includes('stub') || poster.includes('404'))) {
                        poster = '';
                    } else if (poster) {
                        if (!poster.startsWith('http')) {
                            poster = 'https://shikimori.io' + (poster.startsWith('/') ? '' : '/') + poster;
                        } else {
                            poster = poster.replace('shikimori.one', 'shikimori.io').replace('shikimori.me', 'shikimori.io');
                        }
                    }

                    const nextEpisodeAt = item.next_episode_at || null;

                    let dayOfWeek = null;
                    if (nextEpisodeAt) {
                        const dateObj = new Date(nextEpisodeAt);
                        dayOfWeek = dateObj.getDay();
                    }

                    const targetSearchQuery = russian || origTitle;
                    const fallbackJutsuUrl = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(targetSearchQuery)}&ag_from=animeplus&ag_russian=${encodeURIComponent(russian)}&ag_name=${encodeURIComponent(origTitle)}&ag_year=${encodeURIComponent(year || '')}&ag_kind=${encodeURIComponent(kind || '')}`;

                    const cacheKey = getCacheKey(russian, origTitle, year);
                    const cachedDirect = await getDirectUrlFromCache(cacheKey);

                    return {
                        id: anime.id,
                        russian: russian,
                        name: origTitle,
                        poster: poster,
                        score: anime.score || null,
                        kind: kind,
                        year: year,
                        nextEpisode: nextEpisode,
                        nextEpisodeAt: nextEpisodeAt,
                        dayOfWeek: dayOfWeek,
                        jutsuUrl: cachedDirect || fallbackJutsuUrl
                    };
                });
                const resolvedSchedule = await Promise.all(schedulePromises);
                const schedule = resolvedSchedule.filter(Boolean);
                await fillShikiPosters(schedule);

                sendResponse({ schedule });
            } catch (err) {
                console.error("Error in get_ongoing_schedule:", err);
                sendResponse({ schedule: [] });
            }
        })();
        return true;
    }

    if (message.action === "resolve_direct_jutsu_url") {
        (async () => {
            try {
                const { russian, name, year, kind, fallbackUrl } = message;
                const parsedYear = year ? parseInt(year) : null;
                let directUrl = await findJutsuDirectUrl(russian, name, parsedYear, kind);
                if (!directUrl && name) {
                    directUrl = await findJutsuDirectUrl(name, russian, parsedYear, kind);
                }
                const targetUrl = directUrl || fallbackUrl || `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(name || russian)}&ag_from=animeplus`;
                sendResponse({ url: targetUrl });
            } catch (err) {
                sendResponse({ url: message.fallbackUrl });
            }
        })();
        return true;
    }

    function cleanTitleForCompare(str) {
        if (!str) return '';
        return String(str).toLowerCase()
                  .replace(/\(\s*tv[^)]*\)/gi, '')
                  .replace(/[:.,\-\—!?]/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
    }

    function isTitleMatch(queryTitle, resultTitle) {
        const qClean = cleanTitleForCompare(queryTitle);
        const rClean = cleanTitleForCompare(resultTitle);
        if (!qClean || !rClean) return false;

        if (qClean === rClean) return true;

        const qWords = qClean.split(' ').filter(w => w.length > 2);
        const rWords = rClean.split(' ').filter(w => w.length > 2);
        if (qWords.length === 0 || rWords.length === 0) return false;

        let matchCount = 0;
        for (const w of qWords) {
            if (rWords.includes(w)) matchCount++;
        }

        return (matchCount / qWords.length) >= 0.6;
    }

    if (message.action === "get_random_shikimori_anime") {
        (async () => {
            try {
                const storageData = await chrome.storage.local.get(['ag_settings']);
                const settings = storageData.ag_settings || {};
                let targetMinScore = 0;
                if (settings.random_min_score && settings.random_min_score !== 'any') {
                    targetMinScore = parseFloat(settings.random_min_score);
                    if (isNaN(targetMinScore)) targetMinScore = 0;
                }

                const kindsArr = Array.isArray(settings.random_kinds) && settings.random_kinds.length > 0
                    ? settings.random_kinds.map(k => String(k).toLowerCase())
                    : ['tv', 'movie', 'ona', 'ova', 'special'];
                const kindParam = kindsArr.join(',');

                const filterItem = (item) => {
                    if (!item || !item.score) return false;
                    const itemScore = parseFloat(item.score);
                    if (isNaN(itemScore)) return false;
                    if (targetMinScore > 0 && itemScore < targetMinScore) return false;
                    const itemKind = String(item.kind || '').toLowerCase();
                    if (kindsArr.length > 0 && itemKind && !kindsArr.includes(itemKind)) return false;
                    return true;
                };

                let chosen = null;
                const apiScore = targetMinScore > 0 ? Math.floor(targetMinScore) : 0;
                let maxPages = 50;
                if (targetMinScore > 0) {
                    maxPages = 15;
                    if (apiScore >= 8) maxPages = 8;
                    if (apiScore >= 9) maxPages = 2;
                }

                const pagesToFetch = [1];
                while (pagesToFetch.length < 4 && pagesToFetch.length < maxPages) {
                    const p = Math.floor(Math.random() * maxPages) + 1;
                    if (!pagesToFetch.includes(p)) pagesToFetch.push(p);
                }

                let kindUrlParam = '';
                if (kindsArr.length > 0 && kindsArr.length < 5) {
                    kindUrlParam = '&kind=' + kindsArr.join(',');
                }

                const pagePromises = pagesToFetch.map(page => {
                    const endpoint = targetMinScore > 0
                        ? `/api/animes?limit=50&page=${page}&score=${apiScore}&order=ranked${kindUrlParam}`
                        : `/api/animes?limit=50&page=${page}&order=ranked${kindUrlParam}`;
                    return fetchShikimoriApi(endpoint).catch(() => []);
                });

                const lists = await Promise.all(pagePromises);
                const candidates = [];
                lists.forEach(list => {
                    if (Array.isArray(list)) {
                        candidates.push(...list.filter(filterItem));
                    }
                });

                if (candidates.length === 0) {
                    return sendResponse({ url: null, reason: 'no_match', minScore: targetMinScore });
                }

                // Для сайтов-провайдеров (ru.yummyani.me и др.) ищем тайтл прямо на целевом сайте
                if (message.siteId && message.siteId !== 'animego' && message.siteId !== 'jutsu') {
                    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
                    const site = AgSites.byId(message.siteId);

                    let resolvedUrl = null;
                    let foundCand = null;

                    for (const cand of shuffled.slice(0, 15)) {
                        const candTitles = [cand.russian, cand.name].filter(Boolean);
                        const candYear = cand.aired_on ? cand.aired_on.split('-')[0] : '';
                        const candUrl = await resolveSiteUrl(message.siteId, {
                            titles: candTitles,
                            year: candYear,
                            shikimoriId: cand.id
                        }).catch(() => null);

                        if (candUrl) {
                            if (message.currentUrl && candUrl === message.currentUrl) {
                                continue;
                            }
                            resolvedUrl = candUrl;
                            foundCand = cand;
                            break;
                        }
                    }

                    if (resolvedUrl && foundCand) {
                        return sendResponse({
                            url: resolvedUrl,
                            id: foundCand.id,
                            name: foundCand.name,
                            russian: foundCand.russian,
                            score: foundCand.score,
                            kind: foundCand.kind
                        });
                    }

                    const fallbackCand = shuffled[0];
                    const queryStr = fallbackCand ? (fallbackCand.russian || fallbackCand.name) : '';
                    let catalogUrl = null;
                    if (site && queryStr) {
                        if (site.platform === 'yani') {
                            catalogUrl = `${site.home}/catalog?q=${encodeURIComponent(queryStr)}`;
                        } else if (site.dle && site.dle.searchPath) {
                            catalogUrl = `${site.home}${site.dle.searchPath}${encodeURIComponent(queryStr)}`;
                        }
                    }

                    return sendResponse({
                        url: catalogUrl,
                        id: fallbackCand ? fallbackCand.id : null,
                        name: fallbackCand ? fallbackCand.name : null,
                        russian: fallbackCand ? fallbackCand.russian : null,
                        fallback: true
                    });
                }

                chosen = candidates[Math.floor(Math.random() * candidates.length)];

                const russianName = chosen.russian || '';
                const origName = chosen.name || '';
                const chosenKind = String(chosen.kind || '').toLowerCase();
                const year = chosen.aired_on ? parseInt(chosen.aired_on.split('-')[0]) : null;

                const isKindCompatible = (targetKind, resultText) => {
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
                };

                const searchAnimeGo = async () => {
                    let agUrl = null;
                    const searchQueries = [];
                    if (origName) searchQueries.push(origName);
                    if (russianName && !searchQueries.includes(russianName)) searchQueries.push(russianName);

                    for (const qStr of searchQueries) {
                        try {
                            const agSearchResp = await fetch(`https://animego.me/search/anime?q=${encodeURIComponent(qStr)}`);
                            if (agSearchResp.ok) {
                                const html = await agSearchResp.text();
                                const itemRegex = /<a[^>]+href="(\/anime\/[a-zA-Z0-9\-]+-\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
                                let match;
                                const ignored = ['/anime/random', '/anime/status', '/anime/season', '/anime/catalog', '/anime/ongoing', '/anime/top'];

                                while ((match = itemRegex.exec(html)) !== null) {
                                    const link = match[1];
                                    const text = match[2].replace(/<[^>]+>/g, '').trim();

                                    if (ignored.some(ig => link.startsWith(ig))) continue;

                                    if ((isTitleMatch(russianName, text) || isTitleMatch(origName, text)) && isKindCompatible(chosenKind, text)) {
                                        agUrl = `https://animego.me${link}`;
                                        break;
                                    }
                                }
                            }
                        } catch (e) {}
                        if (agUrl) break;
                    }
                    return agUrl;
                };

                const [agUrlResult, jutsuUrlResult] = await Promise.all([
                    searchAnimeGo().catch(() => null),
                    findJutsuDirectUrl(russianName, origName, year).catch(() => null)
                ]);

                const agUrl = agUrlResult || `https://animego.me/anime/shiki-${chosen.id}`;
                const jutsuUrl = jutsuUrlResult;

                sendResponse({
                    foundOnAnimeGO: !!agUrlResult,
                    url: agUrl,
                    jutsuUrl: jutsuUrl,
                    id: chosen.id,
                    name: origName,
                    russian: russianName
                });
            } catch (err) {
                console.error("Error in get_random_shikimori_anime:", err);
                sendResponse({ url: null });
            }
        })();
        return true;
    }

    if (message.action === "get_shikimori_anime_related") {
        (async () => {
            try {
                const id = message.id;
                const relData = await fetchShikimoriApi(`/api/animes/${id}/related`);
                if (Array.isArray(relData)) {
                    const related = relData.map(item => {
                        const relAnime = item.anime || item.manga;
                        if (!relAnime) return null;
                        let relPoster = relAnime.image ? (relAnime.image.original || relAnime.image.preview || '') : '';
                        if (relPoster && !relPoster.startsWith('http')) {
                            relPoster = 'https://shikimori.one' + relPoster;
                        }
                        return {
                            id: relAnime.id,
                            name: relAnime.name,
                            russian: relAnime.russian || relAnime.name,
                            relation: item.relation_russian || item.relation || 'Связанное',
                            kind: relAnime.kind ? relAnime.kind.toUpperCase() : '',
                            year: relAnime.aired_on ? relAnime.aired_on.split('-')[0] : '',
                            poster: relPoster
                        };
                    }).filter(Boolean);
                    await fillShikiPosters(related.filter(r => r.id));
                    return sendResponse({ related });
                }
            } catch (e) {}
            sendResponse({ related: [] });
        })();
        return true;
    }

    if (message.action === "get_shikimori_anime_details") {
        (async () => {
            try {
                const id = message.id;
                const data = await fetchShikimoriApi(`/api/animes/${id}`);
                if (!data) return sendResponse({ data: null });

                let poster = data.image ? (data.image.original || data.image.preview || '') : '';
                if (poster && !poster.startsWith('http')) {
                    poster = 'https://shikimori.one' + poster;
                }
                poster = poster.replace(/\/preview\//g, '/original/').replace(/\/x\d+\//g, '/original/');
                if (isMissingShikiPoster(poster)) poster = (await getShikiPosters([data.id]))[data.id] || '';

                let screenshots = [];
                const scrData = await fetchShikimoriApi(`/api/animes/${id}/screenshots`);
                if (Array.isArray(scrData) && scrData.length > 0) {
                    screenshots = scrData.slice(0, 30).map(s => {
                        let url = s.original || s.preview || '';
                        if (url && !url.startsWith('http')) {
                            url = 'https://shikimori.one' + url;
                        }
                        return url;
                    }).filter(Boolean);
                }

                if (screenshots.length === 0 && data.screenshots) {
                    screenshots = data.screenshots.map(s => {
                        let url = s.original || s.preview || '';
                        if (url && !url.startsWith('http')) {
                            url = 'https://shikimori.one' + url;
                        }
                        return url;
                    }).filter(Boolean);
                }

                let airedOnYear = '';
                if (data.aired_on && typeof data.aired_on === 'string') {
                    airedOnYear = data.aired_on.split('-')[0];
                }

                let japaneseName = '';
                if (data.japanese) {
                    if (Array.isArray(data.japanese) && data.japanese.length > 0) {
                        japaneseName = data.japanese[0];
                    } else if (typeof data.japanese === 'string') {
                        japaneseName = data.japanese;
                    }
                }

                const query = (data.name && data.name.length > 2) ? data.name : (data.russian || '');
                const jutsuUrl = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(query)}&ag_from=animeplus`;

                sendResponse({
                    data: {
                        id: data.id,
                        name: data.name || '',
                        russian: data.russian || data.name || '',
                        japanese: japaneseName,
                        poster: poster,
                        kind: data.kind ? String(data.kind).toUpperCase() : 'TV',
                        score: data.score || '—',
                        status: data.status || '',
                        episodes: data.episodes || 0,
                        episodesAired: data.episodes_aired || 0,
                        airedOn: airedOnYear,
                        description: data.description_html || data.description || '',
                        genres: Array.isArray(data.genres) ? data.genres.map(g => g.russian || g.name) : [],
                        studios: Array.isArray(data.studios) ? data.studios.map(s => s.name) : [],
                        videos: Array.isArray(data.videos) ? data.videos : [],
                        screenshots: screenshots,
                        jutsuUrl: jutsuUrl
                    }
                });
            } catch (err) {
                console.error("Error fetching shikimori details:", err);
                sendResponse({ data: null });
            }
        })();
        return true;
    }

    if (message.action === "fullscreen_on" || message.action === "fullscreen_off") {
        // Окно вкладки-отправителя. windows.getCurrent в service worker возвращает
        // последнее сфокусированное окно, и фуллскрин мог включиться не там
        const state = message.action === "fullscreen_on" ? "fullscreen" : "maximized";
        const applyState = (windowId) => chrome.windows.update(windowId, { state })
            .then(() => sendResponse({ success: true }))
            .catch((e) => sendResponse({ success: false, error: e.message }));
        if (sender.tab && sender.tab.windowId !== undefined) {
            applyState(sender.tab.windowId);
        } else {
            chrome.windows.getLastFocused().then(w => applyState(w.id)).catch(() => sendResponse({ success: false }));
        }
        return true;
    }

    if (message.action === "shiki_oauth_exchange") {
        (async () => {
            try {
                const res = await exchangeShikiCode(message.code, message.clientId, message.clientSecret);
                sendResponse(res);
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (message.action === "shiki_auto_auth") {
        (async () => {
            try {
                const tokens = await getShikiTokens();
                const res = await exchangeShikiCode(
                    message.code,
                    tokens.shiki_client_id || "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI",
                    tokens.shiki_client_secret || ""
                );
                sendResponse(res);
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (message.action === "shiki_logout") {
        (async () => {
            const res = await logoutShiki();
            sendResponse(res);
        })();
        return true;
    }

    if (message.action === "shiki_get_status") {
        (async () => {
            let tokens = await getShikiTokens();
            if (tokens.shiki_access_token && !tokens.shiki_user) {
                try {
                    const userRes = await shikiFetch('https://shikimori.io/api/users/whoami');
                    if (userRes.ok) {
                        tokens.shiki_user = await userRes.json();
                        await chrome.storage.local.set({ shiki_user: tokens.shiki_user });
                    }
                } catch (e) {
                    console.warn('[AnimeGO+] Failed to auto-fetch whoami:', e);
                }
            }

            const storageData = await chrome.storage.local.get([
                'shiki_last_sync_time',
                'shiki_last_sync_status',
                'shiki_auth_error',
                'shiki_today_date',
                'shiki_today_count',
                'shiki_today_episodes'
            ]);

            const todayStr = localDateKey();
            let todayCount = 0;
            let todayEpisodes = Array.isArray(storageData.shiki_today_episodes) ? storageData.shiki_today_episodes : [];

            if (storageData.shiki_today_date !== todayStr || !Array.isArray(storageData.shiki_today_episodes)) {
                todayCount = 0;
                todayEpisodes = [];
                await chrome.storage.local.set({
                    shiki_today_date: todayStr,
                    shiki_today_count: 0,
                    shiki_today_episodes: []
                });
            } else {
                todayCount = todayEpisodes.length;
            }

            sendResponse({
                isLoggedIn: !!(tokens.shiki_access_token && tokens.shiki_user),
                user: tokens.shiki_user || null,
                clientId: tokens.shiki_client_id || "",
                clientSecret: tokens.shiki_client_secret || "",
                lastSyncTime: storageData.shiki_last_sync_time || null,
                lastSyncStatus: storageData.shiki_last_sync_status || null,
                authError: storageData.shiki_auth_error === true,
                todayCount: todayCount
            });
        })();
        return true;
    }

    if (message.action === "reset_today_count") {
        (async () => {
            const todayStr = localDateKey();
            await chrome.storage.local.set({
                shiki_today_date: todayStr,
                shiki_today_count: 0,
                shiki_today_episodes: []
            });
            sendResponse({ success: true, todayCount: 0 });
        })();
        return true;
    }

    if (message.action === "get_shiki_watching_list") {
        (async () => {
            try {
                const res = await getShikiWatchingList(message.status || 'watching');
                sendResponse(res);
            } catch (err) {
                sendResponse({ success: false, error: err.message, items: [] });
            }
        })();
        return true;
    }

    if (message.action === "shiki_sync_progress") {
        (async () => {
            try {
                const res = await updateShikiUserRate({
                    shikimoriId: message.shikimoriId,
                    episode: message.episode,
                    totalEpisodes: message.totalEpisodes,
                    status: message.status
                });
                sendResponse(res);
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();
        return true;
    }

    if (message.action === "close_current_tab") {
        if (sender && sender.tab && sender.tab.id) {
            chrome.tabs.remove(sender.tab.id).catch(() => {});
        }
        sendResponse({ success: true });
        return false;
    }

    // Неизвестное действие: не держим канал открытым — отправитель сразу получит lastError, а не повиснет
    return false;
});

// Автоматический перехват URL авторизации Shikimori
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || (tab && tab.url);
    if (!url) return;

    if (url.includes('/oauth/authorize/')) {
        const match = url.match(/\/oauth\/authorize\/([a-zA-Z0-9_\-]{20,80})/i);
        if (match && match[1]) {
            const code = match[1].trim();
            if (code) {
                (async () => {
                    try {
                        const tokens = await getShikiTokens();
                        const cleanClientId = tokens.shiki_client_id || "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI";
                        const cleanClientSecret = tokens.shiki_client_secret || "";
                        const res = await exchangeShikiCode(code, cleanClientId, cleanClientSecret);
                        if (res && res.success) {
                            setTimeout(() => {
                                chrome.tabs.remove(tabId).catch(() => {});
                            }, 3800);
                        }
                    } catch (e) {
                        console.error('[Anime+] Auto-auth tab error:', e);
                    }
                })();
            }
        }
    }
});
// Шаблон нативной страницы тайтла AnimeGO для синтетических карточек.
// Раньше бралась первая ссылка /anime/*-N из каталога, а это оказывалась «/anime/top-250» (страница-список).
// Теперь отбираем только карточки тайтлов и проверяем, что в HTML есть разметка детальной страницы.
const NATIVE_TEMPLATE_TTL = 12 * 60 * 60 * 1000;
let nativeTemplateMemo = null;

async function getNativePageTemplate(origin) {
    const base = /^https:\/\/animego\.(me|org)$/.test(origin || '') ? origin : 'https://animego.me';
    const isFresh = (m) => m && m.base === base && Date.now() - m.ts < NATIVE_TEMPLATE_TTL;
    if (isFresh(nativeTemplateMemo)) return nativeTemplateMemo.html;
    // Память service worker теряется при каждом засыпании — второй уровень кэша в storage.session
    try {
        const { ag_native_template: stored } = await chrome.storage.session.get(['ag_native_template']);
        if (isFresh(stored)) {
            nativeTemplateMemo = stored;
            return stored.html;
        }
    } catch (e) {}

    const isDetailPage = (html) => /class="[^"]*entity__poster/.test(html) && /class="[^"]*entity__title/.test(html) && /<header[\s>]/.test(html);

    const catalogHtml = await (await fetch(`${base}/anime`)).text();
    const candidates = [...new Set(
        [...catalogHtml.matchAll(/href="(?:https?:\/\/animego\.(?:me|org))?(\/anime\/[a-z0-9-]+-(\d{2,}))"/gi)]
            .filter(m => !/^\/anime\/(top|season|status|genre|type|studio|random)\b/i.test(m[1]))
            .map(m => m[1])
    )].slice(0, 4);

    for (const path of candidates) {
        try {
            const html = await (await fetch(base + path)).text();
            if (isDetailPage(html)) {
                nativeTemplateMemo = { base, html, ts: Date.now() };
                chrome.storage.session.set({ ag_native_template: nativeTemplateMemo }).catch(() => {});
                return html;
            }
        } catch (e) {}
    }
    return null;
}
