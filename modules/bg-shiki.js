// modules/bg-shiki.js
// Движок авторизации, работы с API Shikimori, синхронизации и push-уведомлений

const SHIKI_APP_USER_AGENT = 'AnimePlus/9.1.0 (Browser Extension)';
const SHIKI_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

async function fetchShikimoriApi(endpoint) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    };
    const domains = ['https://shikimori.one', 'https://shikimori.me', 'https://shikimori.io'];
    
    for (const domain of domains) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const resp = await fetch(`${domain}${endpoint}`, { headers, signal: controller.signal });
            clearTimeout(timeoutId);
            if (resp.ok) {
                return await resp.json();
            }
            if (resp.status === 404) return null;
        } catch (e) {}
    }
    return null;
}

async function getShikiTokens() {
    const data = await chrome.storage.local.get([
        'shiki_client_id',
        'shiki_client_secret',
        'shiki_access_token',
        'shiki_refresh_token',
        'shiki_token_expires_at',
        'shiki_user'
    ]);
    if (!data.shiki_client_id || typeof data.shiki_client_id !== 'string' || !data.shiki_client_id.trim()) {
        data.shiki_client_id = (globalThis.AG_CONSTANTS && globalThis.AG_CONSTANTS.DEFAULT_SHIKI_CLIENT_ID) || "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI";
    }
    return data;
}

async function shikiFetch(url, options = {}, isRetry = false) {
    let tokens = await getShikiTokens();

    if (tokens.shiki_access_token && tokens.shiki_token_expires_at) {
        const now = Math.floor(Date.now() / 1000);
        if (now >= tokens.shiki_token_expires_at - 60 && tokens.shiki_refresh_token) {
            tokens = await refreshShikiToken(tokens);
        }
    }

    const headers = {
        'User-Agent': SHIKI_APP_USER_AGENT,
        ...(options.headers || {})
    };

    if (tokens.shiki_access_token) {
        headers['Authorization'] = `Bearer ${tokens.shiki_access_token}`;
    }

    let res = await fetch(url, { ...options, headers });

    if ((res.status === 429 || res.status === 503) && !isRetry) {
        console.warn(`[Anime+] HTTP ${res.status} rate-limited. Waiting 1.5s before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return shikiFetch(url, options, true);
    }

    if (res.status === 401 && !isRetry && tokens.shiki_refresh_token) {
        tokens = await refreshShikiToken(tokens);
        if (tokens.shiki_access_token) {
            headers['Authorization'] = `Bearer ${tokens.shiki_access_token}`;
            res = await fetch(url, { ...options, headers });
        }
    }

    if (res.status === 401) {
        await chrome.storage.local.set({
            shiki_auth_error: true,
            shiki_auth_error_time: Date.now()
        });
    }

    return res;
}

async function postShikiOAuthToken(bodyObj, isRetry = false) {
    const storageData = await chrome.storage.local.get(['ag_settings', 'shiki_worker_url']);
    const settings = storageData.ag_settings || {};
    const workerUrl = settings.shiki_worker_url || storageData.shiki_worker_url || (globalThis.SHIKI_CREDENTIALS && globalThis.SHIKI_CREDENTIALS.worker_url) || "https://animeplus.ruscadred.workers.dev";

    if (workerUrl && workerUrl.trim().startsWith('http')) {
        try {
            const res = await fetch(workerUrl.trim(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': SHIKI_APP_USER_AGENT
                },
                body: JSON.stringify(bodyObj)
            });

            if (res.status === 429 && !isRetry) {
                console.warn('[Anime+] Worker HTTP 429 rate limit. Waiting 2s before retry...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                return postShikiOAuthToken(bodyObj, true);
            }

            if (res.ok || (res.status >= 400 && res.status !== 404)) {
                return res;
            }
        } catch (e) {
            console.warn('[Anime+] Cloudflare Worker fetch error, falling back to direct:', e);
        }
    }

    const searchParams = new URLSearchParams();
    for (const k in bodyObj) {
        if (bodyObj[k]) searchParams.append(k, bodyObj[k]);
    }
    const bodyStr = searchParams.toString();
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': SHIKI_APP_USER_AGENT
    };

    const domains = ['https://shikimori.one', 'https://shikimori.me', 'https://shikimori.io'];
    let lastRes = null;

    for (const domain of domains) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4000);
            const res = await fetch(`${domain}/oauth/token`, {
                method: 'POST',
                headers: headers,
                body: bodyStr,
                signal: controller.signal
            });
            clearTimeout(timer);

            if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 404)) {
                return res;
            }
            lastRes = res;
        } catch (e) {
            console.warn(`[AnimeGO+] OAuth token fetch failed for ${domain}:`, e);
        }
    }

    return lastRes || new Response('Не удалось связаться с серверами Shikimori', { status: 500 });
}

async function refreshShikiToken(tokens) {
    if (!tokens.shiki_refresh_token) {
        return tokens;
    }
    try {
        const payload = {
            grant_type: 'refresh_token',
            client_id: tokens.shiki_client_id || "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI",
            refresh_token: tokens.shiki_refresh_token
        };
        if (tokens.shiki_client_secret) payload.client_secret = tokens.shiki_client_secret;

        const res = await postShikiOAuthToken(payload);
        if (res.ok) {
            const data = await res.json();
            const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 86400);
            await chrome.storage.local.set({
                shiki_access_token: data.access_token,
                shiki_refresh_token: data.refresh_token,
                shiki_token_expires_at: expiresAt,
                shiki_auth_error: false
            });
            tokens.shiki_access_token = data.access_token;
            tokens.shiki_refresh_token = data.refresh_token;
            tokens.shiki_token_expires_at = expiresAt;
        } else if (res.status === 400 || res.status === 401) {
            await chrome.storage.local.set({
                shiki_auth_error: true,
                shiki_auth_error_time: Date.now()
            });
        }
    } catch (e) {
        console.error('[AnimeGO+] Error refreshing Shikimori token:', e);
    }
    return tokens;
}

if (!globalThis.activeOAuthPromises) globalThis.activeOAuthPromises = new Map();

async function exchangeShikiCode(code, clientId, clientSecret) {
    if (!code) {
        throw new Error('Код авторизации обязателен!');
    }
    const cleanCode = code.trim();

    if (globalThis.activeOAuthPromises.has(cleanCode)) {
        return globalThis.activeOAuthPromises.get(cleanCode);
    }

    const promise = (async () => {
        const tokens = await getShikiTokens();
        const cleanClientId = (clientId || tokens.shiki_client_id || "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI").trim();
        const cleanClientSecret = (clientSecret || tokens.shiki_client_secret || "").trim();

        const payload = {
            grant_type: 'authorization_code',
            client_id: cleanClientId,
            code: cleanCode,
            redirect_uri: SHIKI_REDIRECT_URI
        };
        if (cleanClientSecret) payload.client_secret = cleanClientSecret;

        const res = await postShikiOAuthToken(payload);

        if (!res.ok) {
            const errText = await res.text();
            console.error('[AnimeGO+] Shikimori auth error response:', errText);
            let cleanErr = errText;
            if (errText.includes('<html') || errText.includes('<!DOCTYPE')) {
                const matchTitle = errText.match(/<title>(.*?)<\/title>/i) || errText.match(/<h1>(.*?)<\/h1>/i);
                cleanErr = matchTitle ? matchTitle[1] : `HTTP ${res.status}`;
            }
            throw new Error(`Ошибка авторизации (${res.status}): ${cleanErr}`);
        }

        const tokenData = await res.json();
        const expiresAt = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 86400);

        const storageToSet = {
            shiki_client_id: cleanClientId,
            shiki_access_token: tokenData.access_token,
            shiki_refresh_token: tokenData.refresh_token,
            shiki_token_expires_at: expiresAt,
            shiki_auth_error: false
        };
        if (cleanClientSecret) storageToSet.shiki_client_secret = cleanClientSecret;

        await chrome.storage.local.set(storageToSet);

        let userRes;
        try {
            userRes = await fetch('https://shikimori.one/api/users/whoami', {
                headers: {
                    'User-Agent': SHIKI_APP_USER_AGENT,
                    'Authorization': `Bearer ${tokenData.access_token}`
                }
            });
            if (!userRes.ok) {
                userRes = await fetch('https://shikimori.me/api/users/whoami', {
                    headers: {
                        'User-Agent': SHIKI_APP_USER_AGENT,
                        'Authorization': `Bearer ${tokenData.access_token}`
                    }
                });
            }
        } catch (e) {}

        let userInfo = null;
        if (userRes && userRes.ok) {
            userInfo = await userRes.json();
            await chrome.storage.local.set({ shiki_user: userInfo });
        }

        return { success: true, user: userInfo };
    })();

    globalThis.activeOAuthPromises.set(cleanCode, promise);
    return promise;
}

async function logoutShiki() {
    await chrome.storage.local.remove([
        'shiki_access_token',
        'shiki_refresh_token',
        'shiki_token_expires_at',
        'shiki_user',
        'shiki_auth_error',
        'shiki_auth_error_time',
        'shiki_last_sync_time',
        'shiki_last_sync_status'
    ]);
    return { success: true };
}

async function getShikiWatchingList(targetStatus = 'watching') {
    const tokens = await getShikiTokens();
    if (!tokens.shiki_access_token || !tokens.shiki_user || !tokens.shiki_user.id) {
        return { success: false, reason: 'not_logged_in', items: [] };
    }
    const userId = tokens.shiki_user.id;
    const cleanStatus = (targetStatus === 'rewatching') ? 'rewatching' : 'watching';
    const cacheKey = `shiki_list_cache_${cleanStatus}`;

    let cachedItems = null;
    try {
        const cacheRes = await chrome.storage.local.get([cacheKey]);
        if (cacheRes && Array.isArray(cacheRes[cacheKey])) {
            cachedItems = cacheRes[cacheKey];
        }
    } catch (e) {}

    try {
        const res = await shikiFetch(`https://shikimori.one/api/v2/user_rates?user_id=${userId}&target_type=Anime&status=${cleanStatus}&limit=30`);
        if (res.ok) {
            const rates = await res.json();
            if (Array.isArray(rates) && rates.length === 0) {
                await chrome.storage.local.set({ [cacheKey]: [] });
                return { success: true, items: [] };
            }
            if (Array.isArray(rates) && rates.length > 0) {
                const animeIds = rates.map(r => r.target_id).filter(Boolean);
                if (animeIds.length > 0) {
                    const animeRes = await shikiFetch(`https://shikimori.one/api/animes?ids=${animeIds.join(',')}&limit=30`);
                    let animeMap = new Map();
                    if (animeRes.ok) {
                        const animeList = await animeRes.json();
                        if (Array.isArray(animeList)) {
                            animeList.forEach(a => animeMap.set(a.id, a));
                        }
                    }

                    const items = rates.map(rate => {
                        const anime = animeMap.get(rate.target_id) || {};
                        let poster = anime.image ? (anime.image.original || anime.image.preview || '') : '';
                        if (poster && !poster.startsWith('http')) {
                            poster = 'https://shikimori.one' + (poster.startsWith('/') ? '' : '/') + poster;
                        }
                        return {
                            rateId: rate.id,
                            animeId: rate.target_id,
                            russian: anime.russian || anime.name || 'Аниме',
                            name: anime.name || '',
                            episodesWatched: rate.episodes || 0,
                            episodesTotal: anime.episodes || 0,
                            poster: poster,
                            kind: (anime.kind || '').toUpperCase(),
                            score: anime.score || null
                        };
                    });

                    await chrome.storage.local.set({ [cacheKey]: items });
                    return { success: true, items };
                }
            }
        }
    } catch (err) {
        console.error("[AnimeGO+] getShikiWatchingList network error:", err);
    }

    if (cachedItems) {
        return { success: true, items: cachedItems, fromCache: true };
    }

    return { success: false, reason: 'fetch_failed', items: [] };
}

async function updateShikiUserRate({ shikimoriId, episode, totalEpisodes, status }) {
    let tokens = await getShikiTokens();
    if (tokens.shiki_access_token && !tokens.shiki_user) {
        try {
            const userRes = await shikiFetch('https://shikimori.one/api/users/whoami');
            if (userRes.ok) {
                tokens.shiki_user = await userRes.json();
                await chrome.storage.local.set({ shiki_user: tokens.shiki_user });
            }
        } catch (e) {}
    }

    if (!tokens.shiki_access_token || !tokens.shiki_user || !tokens.shiki_user.id) {
        return { success: false, reason: 'not_logged_in' };
    }

    const userId = tokens.shiki_user.id;
    const targetId = parseInt(shikimoriId);
    if (!targetId) return { success: false, reason: 'invalid_id' };

    const getRes = await shikiFetch(`https://shikimori.one/api/v2/user_rates?user_id=${userId}&target_id=${targetId}&target_type=Anime`);
    let existingRate = null;
    if (getRes.ok) {
        const rates = await getRes.json();
        if (Array.isArray(rates) && rates.length > 0) {
            existingRate = rates[0];
        }
    }

    const epNumber = parseInt(episode) || 1;
    const totalEp = parseInt(totalEpisodes) || 0;

    let targetStatus = status || 'watching';
    if (totalEp > 0 && epNumber >= totalEp) {
        targetStatus = 'completed';
    } else if (existingRate && (existingRate.status === 'completed' || existingRate.status === 'rewatching' || (existingRate.rewatches && existingRate.rewatches > 0))) {
        targetStatus = 'rewatching';
    }

    let payload = {
        user_rate: {
            user_id: userId,
            target_id: targetId,
            target_type: 'Anime',
            episodes: epNumber,
            status: targetStatus
        }
    };

    let saveRes;
    if (existingRate && existingRate.id) {
        saveRes = await shikiFetch(`https://shikimori.one/api/v2/user_rates/${existingRate.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } else {
        saveRes = await shikiFetch(`https://shikimori.one/api/v2/user_rates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    if (saveRes.ok) {
        const savedData = await saveRes.json();
        const now = Date.now();
        const todayStr = new Date().toISOString().split('T')[0];

        const storageData = await chrome.storage.local.get(['shiki_today_date', 'shiki_today_episodes']);
        let todayDate = storageData.shiki_today_date;
        let todayEpisodes = Array.isArray(storageData.shiki_today_episodes) ? storageData.shiki_today_episodes : [];

        if (todayDate !== todayStr) {
            todayDate = todayStr;
            todayEpisodes = [];
        }

        const epKey = `${targetId}_${epNumber}`;
        if (!todayEpisodes.includes(epKey)) {
            todayEpisodes.push(epKey);
        }

        const count = todayEpisodes.length;

        await chrome.storage.local.set({
            shiki_last_sync_time: now,
            shiki_last_sync_status: 'success',
            shiki_auth_error: false,
            shiki_today_date: todayDate,
            shiki_today_episodes: todayEpisodes,
            shiki_today_count: count
        });

        return { success: true, rate: savedData };
    } else {
        const errText = await saveRes.text();
        console.error('[AnimeGO+] Failed to update Shikimori user rate:', errText);
        await chrome.storage.local.set({
            shiki_last_sync_time: Date.now(),
            shiki_last_sync_status: 'error'
        });
        return { success: false, error: errText };
    }
}

async function addToWatchHistory(item) {
    if (!item || (!item.russian && !item.name)) return;
    try {
        const data = await chrome.storage.local.get(['ag_watch_history']);
        let history = Array.isArray(data.ag_watch_history) ? data.ag_watch_history : [];

        const title = item.russian || item.name;
        history = history.filter(h => (h.russian || h.name) !== title);

        history.unshift({
            russian: item.russian || item.name,
            name: item.name || '',
            poster: item.poster || '',
            url: item.url || '',
            timestamp: Date.now()
        });

        history = history.slice(0, 5);
        await chrome.storage.local.set({ ag_watch_history: history });
    } catch (e) {
        console.warn('[Anime+] Failed to update watch history:', e);
    }
}

async function checkKodikEpisodeAvailability(shikimoriId, targetEpisode) {
    try {
        if (!shikimoriId || !targetEpisode) return { available: false };
        const res = await fetch(`https://kodikapi.com/search?shikimori_id=${shikimoriId}&with_material_data=true`);
        if (!res.ok) return { available: false };
        const data = await res.json();
        if (!data || !Array.isArray(data.results) || data.results.length === 0) {
            return { available: false };
        }

        const translations = new Set();
        let isFound = false;
        let posterUrl = null;

        for (const item of data.results) {
            if (!posterUrl && item.material_data) {
                posterUrl = item.material_data.poster_url || item.material_data.shikimori_poster_url || null;
            }
            let epCount = item.last_episode || item.episodes_count || 0;
            if (!epCount && item.seasons) {
                for (const sKey in item.seasons) {
                    const season = item.seasons[sKey];
                    if (season && season.episodes) {
                        for (const epKey in season.episodes) {
                            const epNum = parseInt(epKey);
                            if (epNum > epCount) epCount = epNum;
                        }
                    }
                }
            }

            if (epCount >= targetEpisode) {
                isFound = true;
                if (item.translation && item.translation.title) {
                    translations.add(item.translation.title);
                }
            }
        }

        return {
            available: isFound,
            translations: Array.from(translations),
            posterUrl: posterUrl
        };
    } catch (e) {
        console.warn('[Anime+] Error checking Kodik availability:', e);
        return { available: false };
    }
}

async function cleanupOldNotifications() {
    try {
        const storage = await chrome.storage.local.get(['notified_episodes_history', 'active_notifications_map']);
        const history = Array.isArray(storage.notified_episodes_history) ? storage.notified_episodes_history : [];
        const notifMap = storage.active_notifications_map || {};

        const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

        const freshHistory = history.filter(item => item && item.timestamp && item.timestamp > cutoff);

        for (const key in notifMap) {
            if (notifMap[key] && notifMap[key].timestamp && notifMap[key].timestamp <= cutoff) {
                delete notifMap[key];
            }
        }

        await chrome.storage.local.set({
            notified_episodes_history: freshHistory,
            active_notifications_map: notifMap
        });
    } catch (e) {
        console.warn('[Anime+] Error cleaning up notifications:', e);
    }
}

async function checkEpisodeAvailabilityOnPortals(animeTitle, origTitle, animeId, targetEpisode) {
    const res = {
        available: false,
        animegoUrl: null,
        jutsuUrl: null,
        voiceovers: [],
        poster: null
    };

    let kodikHasEp = false;
    try {
        const kodikCheck = await checkKodikEpisodeAvailability(animeId, targetEpisode);
        if (kodikCheck.available) {
            kodikHasEp = true;
            res.voiceovers = kodikCheck.translations || [];
            res.poster = kodikCheck.posterUrl || null;
        }
    } catch (e) {}

    try {
        if (typeof findAnimeGoDirectUrl === 'function') {
            res.animegoUrl = await findAnimeGoDirectUrl(animeTitle, origTitle);
        }
    } catch (e) {}

    try {
        if (typeof findJutsuDirectUrl === 'function') {
            res.jutsuUrl = await findJutsuDirectUrl(animeTitle, origTitle);
        }
    } catch (e) {}

    if (kodikHasEp && !res.animegoUrl) {
        res.animegoUrl = `https://animego.me/search/anime?q=${encodeURIComponent(animeTitle || origTitle)}`;
    }

    res.available = Boolean(res.animegoUrl || res.jutsuUrl || kodikHasEp);
    return res;
}

async function openNotificationTarget(notifId, buttonIndex = null) {
    try {
        const storage = await chrome.storage.local.get(['active_notifications_map']);
        const notifMap = storage.active_notifications_map || {};
        const notifInfo = notifMap[notifId];

        let targetUrl = null;

        if (notifInfo) {
            if (buttonIndex !== null && Array.isArray(notifInfo.buttonsMap) && notifInfo.buttonsMap[buttonIndex]) {
                targetUrl = notifInfo.buttonsMap[buttonIndex];
            } else {
                targetUrl = notifInfo.animegoUrl || notifInfo.jutsuUrl;
            }
        }

        if (targetUrl) {
            chrome.tabs.create({ url: targetUrl });
        }

        chrome.notifications.clear(notifId);
    } catch (e) {
        console.error('[Anime+] Error opening notification link:', e);
    }
}

try {
    chrome.notifications.onClicked.addListener((notifId) => {
        if (notifId.startsWith('animeplus_notif_')) {
            openNotificationTarget(notifId, null);
        }
    });
    chrome.notifications.onButtonClicked.addListener((notifId, buttonIndex) => {
        if (notifId.startsWith('animeplus_notif_')) {
            openNotificationTarget(notifId, buttonIndex);
        }
    });
} catch (e) {}

try {
    chrome.alarms.create('check_new_episodes_alarm', { periodInMinutes: 30 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'check_new_episodes_alarm') {
            checkNewEpisodeNotifications();
        }
    });
} catch (e) {}

async function checkNewEpisodeNotifications(isManual = false) {
    try {
        const settingsRes = await chrome.storage.local.get(['ag_settings']);
        const settings = settingsRes.ag_settings || {};
        if (settings.notif_enabled === false) return;

        await cleanupOldNotifications();

        const watchingRes = await getShikiWatchingList('watching');
        if (!watchingRes || !watchingRes.success || !Array.isArray(watchingRes.items)) return;

        const calendarRes = await fetch('https://shikimori.one/api/calendar');
        if (!calendarRes.ok) return;
        const calendar = await calendarRes.json();
        if (!Array.isArray(calendar)) return;

        const storageData = await chrome.storage.local.get(['notified_episodes', 'notified_episodes_history', 'active_notifications_map']);
        const notifiedSet = new Set(Array.isArray(storageData.notified_episodes) ? storageData.notified_episodes : []);
        let history = Array.isArray(storageData.notified_episodes_history) ? storageData.notified_episodes_history : [];
        let notifMap = storageData.active_notifications_map || {};
        const newNotifQueue = [];

        const watchingMap = new Map();
        watchingRes.items.forEach(item => watchingMap.set(item.animeId, item));

        for (const calItem of calendar) {
            if (!calItem || !calItem.anime || !calItem.next_episode) continue;
            const animeId = calItem.anime.id;

            if (watchingMap.has(animeId)) {
                const userAnime = watchingMap.get(animeId);
                const nextEp = calItem.next_episode;
                const notifKey = `ep_${animeId}_${nextEp}`;

                if (!notifiedSet.has(notifKey)) {
                    const title = userAnime.russian || calItem.anime.russian || calItem.anime.name;
                    const origTitle = userAnime.name || calItem.anime.name || '';

                    // Dual check availability on AnimeGO and JUT-SU
                    const portalCheck = await checkEpisodeAvailabilityOnPortals(title, origTitle, animeId, nextEp);
                    if (!portalCheck.available) {
                        continue;
                    }

                    notifiedSet.add(notifKey);

                    let rawPoster = portalCheck.poster || (userAnime && userAnime.poster) || (calItem.anime && calItem.anime.image && (calItem.anime.image.original || calItem.anime.image.preview)) || 'icons/icon128.png';
                    if (typeof rawPoster === 'string' && rawPoster.trim()) {
                        rawPoster = rawPoster.trim();
                        if (rawPoster.includes('/system/animes/')) {
                            const idx = rawPoster.indexOf('/system/animes/');
                            rawPoster = 'https://shikimori.one' + rawPoster.substring(idx);
                        } else if (!rawPoster.startsWith('http://') && !rawPoster.startsWith('https://')) {
                            rawPoster = `https://shikimori.one${rawPoster.startsWith('/') ? '' : '/'}${rawPoster}`;
                        }
                    } else {
                        rawPoster = chrome.runtime.getURL('icons/icon128.png');
                    }
                    const poster = rawPoster;
                    const notifId = `animeplus_notif_${animeId}_${nextEp}_${Date.now()}`;

                    const voiceList = portalCheck.voiceovers || [];
                    const voiceStr = voiceList.length > 0 ? voiceList.slice(0, 3).join(', ') : '';

                    let notifMessage = title;
                    if (voiceStr) {
                        notifMessage += `\nОзвучки: ${voiceStr}`;
                    }

                    const toastButtons = [];
                    const buttonsMap = [];

                    if (portalCheck.animegoUrl) {
                        toastButtons.push({ title: '▶ AnimeGO' });
                        buttonsMap.push(portalCheck.animegoUrl);
                    }
                    if (portalCheck.jutsuUrl) {
                        toastButtons.push({ title: '▶ JUT-SU' });
                        buttonsMap.push(portalCheck.jutsuUrl);
                    }
                    if (toastButtons.length === 0) {
                        const fallbackUrl = `https://animego.me/search/anime?q=${encodeURIComponent(title)}`;
                        toastButtons.push({ title: '▶ Смотреть' });
                        buttonsMap.push(fallbackUrl);
                    }

                    const notifItem = {
                        id: notifId,
                        animeId: animeId,
                        episode: nextEp,
                        title: title,
                        origTitle: origTitle,
                        poster: poster,
                        voiceovers: voiceStr,
                        animegoUrl: portalCheck.animegoUrl,
                        jutsuUrl: portalCheck.jutsuUrl,
                        timestamp: Date.now()
                    };

                    history.unshift(notifItem);
                    history = history.slice(0, 20);

                    notifMap[notifId] = {
                        russianName: title,
                        origName: origTitle,
                        animeId: animeId,
                        episode: nextEp,
                        animegoUrl: portalCheck.animegoUrl,
                        jutsuUrl: portalCheck.jutsuUrl,
                        buttonsMap: buttonsMap,
                        poster: poster,
                        voiceovers: voiceStr,
                        timestamp: Date.now()
                    };

                    newNotifQueue.push({
                        notifId,
                        animeId,
                        nextEp,
                        title,
                        poster,
                        voiceStr,
                        notifMessage,
                        toastButtons,
                        animegoUrl: portalCheck.animegoUrl,
                        jutsuUrl: portalCheck.jutsuUrl
                    });
                }
            }
        }

        // Save updated data to storage immediately
        await chrome.storage.local.set({
            notified_episodes: Array.from(notifiedSet),
            notified_episodes_history: history,
            active_notifications_map: notifMap
        });

        // Launch sequential desktop windows in background ONLY if check was NOT triggered manually from popup menu
        if (!isManual && newNotifQueue.length > 0) {
            setTimeout(async () => {
                for (let i = 0; i < newNotifQueue.length; i++) {
                    const item = newNotifQueue[i];

                    try {
                        const winWidth = 370;
                        const winHeight = 155;
                        chrome.windows.getCurrent((currWin) => {
                            let left = 1000;
                            let top = 600;
                            if (currWin && currWin.width) {
                                left = (currWin.left || 0) + currWin.width - winWidth - 30;
                                top = (currWin.top || 0) + currWin.height - winHeight - 50;
                            }
                            chrome.windows.create({
                                url: chrome.runtime.getURL(`notification.html?id=${encodeURIComponent(item.notifId)}`),
                                type: 'popup',
                                width: winWidth,
                                height: winHeight,
                                left: Math.max(0, left),
                                top: Math.max(0, top),
                                focused: true
                            });
                        });
                    } catch (winErr) {
                        chrome.notifications.create(item.notifId, {
                            type: 'basic',
                            iconUrl: item.poster,
                            title: `🔥 Вышла ${item.nextEp} серия!`,
                            message: item.notifMessage,
                            buttons: item.toastButtons,
                            priority: 2
                        });
                    }

                    try {
                        chrome.tabs.query({}, (tabs) => {
                            tabs.forEach(tab => {
                                if (tab.id) {
                                    chrome.tabs.sendMessage(tab.id, {
                                        action: 'SHOW_EPISODE_NOTIFICATION',
                                        data: {
                                            title: item.title,
                                            episode: item.nextEp,
                                            poster: item.poster,
                                            voiceovers: item.voiceStr,
                                            animegoUrl: item.animegoUrl,
                                            jutsuUrl: item.jutsuUrl
                                        }
                                    }).catch(() => {});
                                }
                            });
                        });
                    } catch (e) {}

                    if (i < newNotifQueue.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 7500));
                    }
                }
            }, 0);
        }
    } catch (e) {
        console.error('[Anime+] Error checking new episode notifications:', e);
    }
}


