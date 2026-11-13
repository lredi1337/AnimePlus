// modules/bg-shiki.js
// Вход в Shikimori, запросы к его API и запись просмотренных серий в список зрителя

const SHIKI_APP_USER_AGENT = `AnimePlus/${chrome.runtime.getManifest().version} (Browser Extension)`;
const SHIKI_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
const SHIKI_CLIENT_ID = (globalThis.SHIKI_CREDENTIALS && globalThis.SHIKI_CREDENTIALS.client_id) || '';

// shikimori.one и shikimori.me теперь отвечают редиректом на shikimori.io.
// При редиректе на другой origin браузер удаляет заголовок Authorization,
// поэтому авторизованные запросы обязаны идти сразу на основной домен.
const SHIKI_API_BASE = 'https://shikimori.io';
const SHIKI_API_DOMAINS = [SHIKI_API_BASE, 'https://shikimori.one', 'https://shikimori.me'];

function toShikiApiUrl(url) {
    return String(url).replace(/^https:\/\/(?:www\.)?shikimori\.(?:one|me|org)(?=\/)/, SHIKI_API_BASE);
}

// ---------- Постеры ----------
// REST API отдаёт для многих (особенно новых) тайтлов заглушку /assets/globals/missing_*.jpg (та самая «лиса»),
// хотя настоящий постер у тайтла есть — он доступен только через GraphQL (poster { mainUrl originalUrl }).

function isMissingShikiPoster(url) {
    return !url || /\/assets\/|missing|no-poster|no-image|stub/i.test(String(url));
}

function absoluteShikiUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//.test(url)) return toShikiApiUrl(url);
    return `${SHIKI_API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

const SHIKI_POSTER_TTL = 7 * 24 * 60 * 60 * 1000;
const SHIKI_POSTER_MISS_TTL = 12 * 60 * 60 * 1000; // «постера нет» перепроверяем чаще
const shikiPosterMemo = new Map();

async function getShikiPosters(ids) {
    const unique = [...new Set((ids || []).map(id => parseInt(id, 10)).filter(Boolean))];
    const result = {};
    if (unique.length === 0) return result;

    const now = Date.now();
    const { shiki_poster_cache: cache = {} } = await chrome.storage.local.get(['shiki_poster_cache']);
    const toFetch = [];
    for (const id of unique) {
        const hit = shikiPosterMemo.get(id) || cache[id];
        const ttl = hit && hit.url ? SHIKI_POSTER_TTL : SHIKI_POSTER_MISS_TTL;
        if (hit && now - hit.ts < ttl) {
            if (hit.url) result[id] = hit.url;
        } else {
            toFetch.push(id);
        }
    }

    const fresh = {};
    for (let i = 0; i < toFetch.length; i += 50) {
        const chunk = toFetch.slice(i, i + 50);
        try {
            const res = await shikiRateFetch(`${SHIKI_API_BASE}/api/graphql`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ query: `{ animes(ids: "${chunk.join(',')}", limit: ${chunk.length}) { id poster { mainUrl originalUrl } } }` })
            });
            if (!res.ok) continue;
            const json = await res.json();
            // GraphQL отвечает 200 и при ошибке запроса — такой ответ не кэшируем как «постера нет»
            if (!json || json.errors || !json.data || !Array.isArray(json.data.animes)) continue;
            const found = new Map((json?.data?.animes || []).map(a => [parseInt(a.id, 10), a.poster ? (a.poster.mainUrl || a.poster.originalUrl) : null]));
            chunk.forEach(id => {
                const url = found.get(id) ? absoluteShikiUrl(found.get(id)) : null;
                const entry = { url, ts: now };
                shikiPosterMemo.set(id, entry);
                fresh[id] = entry;
                if (url) result[id] = url;
            });
        } catch (e) {
            console.warn('[Anime+] GraphQL poster fetch failed:', e);
        }
    }

    if (Object.keys(fresh).length > 0) {
        await updateStorageObject('shiki_poster_cache', c => Object.assign(c, fresh), { maxEntries: 2000 });
    }
    return result;
}

// Лучший постер для объекта аниме из REST API: настоящий REST-постер, иначе GraphQL
async function fillShikiPosters(items, { getId = (i) => i.id, getRaw = (i) => i.poster, setPoster = (i, url) => { i.poster = url; } } = {}) {
    const need = items.filter(i => isMissingShikiPoster(getRaw(i)));
    const map = need.length ? await getShikiPosters(need.map(getId)) : {};
    items.forEach(i => {
        const raw = getRaw(i);
        setPoster(i, isMissingShikiPoster(raw) ? (map[parseInt(getId(i), 10)] || '') : absoluteShikiUrl(raw));
    });
    return items;
}

// У API Shikimori лимит: 5 запросов в секунду и 90 в минуту на всё расширение. Запросы встают в одну очередь
const SHIKI_MIN_GAP_MS = 220;
const SHIKI_MINUTE_LIMIT = 85;
const SHIKI_RETRY_WAIT_MS = 1500;
const shikiRecentRequests = [];
let shikiRequestQueue = Promise.resolve();

const shikiSleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function shikiSlot() {
    const turn = shikiRequestQueue.then(async () => {
        const now = Date.now();
        while (shikiRecentRequests.length && now - shikiRecentRequests[0] >= 60000) shikiRecentRequests.shift();
        const last = shikiRecentRequests[shikiRecentRequests.length - 1];
        let wait = last ? last + SHIKI_MIN_GAP_MS - now : 0;
        if (shikiRecentRequests.length >= SHIKI_MINUTE_LIMIT) wait = Math.max(wait, shikiRecentRequests[0] + 60000 - now);
        if (wait > 0) await shikiSleep(wait);
        shikiRecentRequests.push(Date.now());
    });
    shikiRequestQueue = turn;
    return turn;
}

async function shikiRateFetch(url, options) {
    await shikiSlot();
    return fetch(url, options);
}

async function fetchShikimoriApi(endpoint) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    };
    let retried = false;
    for (let i = 0; i < SHIKI_API_DOMAINS.length; i++) {
        try {
            await shikiSlot();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const resp = await fetch(`${SHIKI_API_DOMAINS[i]}${endpoint}`, { headers, signal: controller.signal });
            clearTimeout(timeoutId);
            if (resp.ok) {
                return await resp.json();
            }
            if (resp.status === 404) return null;
            // Зеркала ведут на один сервер: на другом адресе лимит тот же
            if (resp.status === 429) {
                if (retried) return null;
                retried = true;
                await shikiSleep(SHIKI_RETRY_WAIT_MS);
                i--;
            }
        } catch (e) {}
    }
    return null;
}

// ---------- Хранилище секретов ----------
// Токены и секрет приложения лежат в IndexedDB расширения: она доступна только фону и страницам расширения.
// chrome.storage.local читают и content-скрипты, а они работают в том числе в чужих кадрах плееров.

const SHIKI_SECRET_KEYS = ['shiki_access_token', 'shiki_refresh_token', 'shiki_client_secret'];
const SHIKI_VAULT_DB = 'anime-plus-vault';
const SHIKI_VAULT_STORE = 'secrets';

function openShikiVaultDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(SHIKI_VAULT_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(SHIKI_VAULT_STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/** Одна транзакция: work получает хранилище и возвращает то, что нужно отдать после её завершения */
function shikiVaultTx(db, mode, work) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(SHIKI_VAULT_STORE, mode);
        const result = work(tx.objectStore(SHIKI_VAULT_STORE));
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}

function idbShikiVault(db) {
    return {
        async read() {
            const requests = await shikiVaultTx(db, 'readonly', store => SHIKI_SECRET_KEYS.map(key => [key, store.get(key)]));
            return Object.fromEntries(requests.filter(([, r]) => r.result !== undefined).map(([key, r]) => [key, r.result]));
        },
        write: (patch) => shikiVaultTx(db, 'readwrite', (store) => { for (const [key, value] of Object.entries(patch)) store.put(value, key); }),
        remove: (keys) => shikiVaultTx(db, 'readwrite', (store) => { for (const key of keys) store.delete(key); })
    };
}

// Без IndexedDB (тесты, повреждённый профиль браузера) секреты живут в памяти фона: вход придётся повторить, но наружу они не попадут
function memoryShikiVault() {
    const data = {};
    return {
        read: async () => ({ ...data }),
        write: async (patch) => { Object.assign(data, patch); },
        remove: async (keys) => { for (const key of keys) delete data[key]; }
    };
}

async function openShikiVault() {
    let vault = null;
    try {
        vault = idbShikiVault(await openShikiVaultDb());
    } catch (e) {
        if (typeof indexedDB !== 'undefined' && globalThis.noteDiag) noteDiag('shiki_vault_unavailable', String(e && e.message));
        vault = memoryShikiVault();
    }
    // Прошлые версии держали секреты в chrome.storage.local: переносим и убираем оттуда
    const old = await chrome.storage.local.get(SHIKI_SECRET_KEYS);
    const found = Object.fromEntries(SHIKI_SECRET_KEYS.filter(key => old[key] !== undefined && old[key] !== null).map(key => [key, old[key]]));
    if (Object.keys(found).length > 0) {
        await vault.write({ ...found, ...await vault.read() });
        await chrome.storage.local.remove(SHIKI_SECRET_KEYS);
    }
    return vault;
}

let shikiVaultOpening = null;
function shikiVault() {
    if (!shikiVaultOpening) {
        shikiVaultOpening = openShikiVault();
        // Сбой открытия не запоминаем: следующий запрос попробует снова
        shikiVaultOpening.catch(() => { shikiVaultOpening = null; });
    }
    return shikiVaultOpening;
}

async function readShikiSecrets() {
    return (await shikiVault()).read();
}

/** Сохраняет данные входа: секреты уходят в хранилище фона, остальное в chrome.storage.local */
async function saveShikiAuth(values) {
    const secrets = {};
    const open = {};
    for (const [key, value] of Object.entries(values)) (SHIKI_SECRET_KEYS.includes(key) ? secrets : open)[key] = value;
    if (Object.keys(secrets).length > 0) await (await shikiVault()).write(secrets);
    if (Object.keys(open).length > 0) await chrome.storage.local.set(open);
}

async function getShikiTokens() {
    const data = {
        ...await chrome.storage.local.get(['shiki_client_id', 'shiki_token_expires_at', 'shiki_user']),
        ...await readShikiSecrets()
    };
    if (!data.shiki_client_id || typeof data.shiki_client_id !== 'string' || !data.shiki_client_id.trim()) {
        data.shiki_client_id = SHIKI_CLIENT_ID;
    }
    return data;
}

async function shikiFetch(url, options = {}, isRetry = false) {
    url = toShikiApiUrl(url);
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

    let res = await shikiRateFetch(url, { ...options, headers });

    if ((res.status === 429 || res.status === 503) && !isRetry) {
        console.warn(`[Anime+] HTTP ${res.status} rate-limited. Waiting 1.5s before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1500));
        return shikiFetch(url, options, true);
    }

    if (res.status === 401 && !isRetry && tokens.shiki_refresh_token) {
        tokens = await refreshShikiToken(tokens);
        if (tokens.shiki_access_token) {
            headers['Authorization'] = `Bearer ${tokens.shiki_access_token}`;
            res = await shikiRateFetch(url, { ...options, headers });
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
    const workerUrl = (globalThis.SHIKI_CREDENTIALS && globalThis.SHIKI_CREDENTIALS.worker_url) || "https://animeplus.ruscadred.workers.dev";

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

    const domains = SHIKI_API_DOMAINS;
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
            console.warn(`[Anime+] OAuth token fetch failed for ${domain}:`, e);
        }
    }

    return lastRes || new Response('Не удалось связаться с серверами Shikimori', { status: 500 });
}

// Refresh-токен одноразовый: второй параллельный запрос получил бы отказ и показал ошибку входа при рабочих токенах
let shikiRefreshInFlight = null;

function refreshShikiToken(tokens) {
    if (!shikiRefreshInFlight) {
        shikiRefreshInFlight = requestShikiTokenRefresh(tokens).finally(() => { shikiRefreshInFlight = null; });
    }
    return shikiRefreshInFlight;
}

async function requestShikiTokenRefresh(tokens) {
    if (!tokens.shiki_refresh_token) {
        return tokens;
    }
    try {
        const payload = {
            grant_type: 'refresh_token',
            client_id: tokens.shiki_client_id || SHIKI_CLIENT_ID,
            refresh_token: tokens.shiki_refresh_token
        };
        if (tokens.shiki_client_secret) payload.client_secret = tokens.shiki_client_secret;

        const res = await postShikiOAuthToken(payload);
        if (res.ok) {
            const data = await res.json();
            const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 86400);
            await saveShikiAuth({
                shiki_access_token: data.access_token,
                shiki_refresh_token: data.refresh_token,
                shiki_token_expires_at: expiresAt,
                shiki_auth_error: false
            });
            tokens.shiki_access_token = data.access_token;
            tokens.shiki_refresh_token = data.refresh_token;
            tokens.shiki_token_expires_at = expiresAt;
        } else if (res.status === 400 || res.status === 401) {
            if (globalThis.noteDiag) noteDiag('shiki_refresh_rejected', `HTTP ${res.status}`);
            await chrome.storage.local.set({
                shiki_auth_error: true,
                shiki_auth_error_time: Date.now()
            });
        }
    } catch (e) {
        console.error('[Anime+] Error refreshing Shikimori token:', e);
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
        const cleanClientId = (clientId || tokens.shiki_client_id || SHIKI_CLIENT_ID).trim();
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
            console.error('[Anime+] Shikimori auth error response:', errText);
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

        await saveShikiAuth(storageToSet);

        // Профиль нужен окну расширения сразу после входа: при сбое пробуем ещё раз
        const headers = { 'User-Agent': SHIKI_APP_USER_AGENT, 'Authorization': `Bearer ${tokenData.access_token}` };
        let userInfo = null;
        for (let attempt = 0; attempt < 2 && !userInfo; attempt++) {
            try {
                const userRes = await shikiRateFetch(`${SHIKI_API_BASE}/api/users/whoami`, { headers });
                if (userRes.ok) userInfo = await userRes.json();
            } catch (e) {}
        }
        if (userInfo) await chrome.storage.local.set({ shiki_user: userInfo });

        return { success: true, user: userInfo };
    })();

    globalThis.activeOAuthPromises.set(cleanCode, promise);
    // Неудачный обмен забываем: иначе тот же код до засыпания фона возвращал бы прежнюю ошибку, не пытаясь снова
    promise.catch(() => {
        if (globalThis.activeOAuthPromises.get(cleanCode) === promise) globalThis.activeOAuthPromises.delete(cleanCode);
    });
    return promise;
}

// ---------- Привязка аккаунта ----------
// Код с адреса принимается только во вкладке, которую открыла кнопка «Войти». Иначе чужая ссылка с кодом
// незаметно привязала бы расширение к чужому аккаунту. Код, вставленный в окне расширения вручную, идёт через exchangeShikiCode.

const SHIKI_AUTH_PENDING_KEY = 'shiki_auth_pending';
const SHIKI_AUTH_PENDING_TTL = 15 * 60 * 1000;
const SHIKI_AUTH_HOST = /^(?:www\.)?shikimori\.(?:io|one|me|org)$/;
let shikiAuthOpening = null;

function shikiAuthCodeFromUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        if (url.protocol !== 'https:' || !SHIKI_AUTH_HOST.test(url.hostname)) return null;
        const match = url.pathname.match(/^\/oauth\/authorize\/([\w-]{20,80})\/?$/);
        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

function beginShikiAuth(clientId) {
    const id = clientId || SHIKI_CLIENT_ID;
    const url = `${SHIKI_API_BASE}/oauth/authorize?client_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(SHIKI_REDIRECT_URI)}&response_type=code&scope=user_rates`;
    // Страница может спросить о себе раньше, чем вкладка будет записана: isShikiAuthExpected дожидается этой записи
    shikiAuthOpening = chrome.tabs.create({ url, active: true }).then(async (tab) => {
        await chrome.storage.session.set({ [SHIKI_AUTH_PENDING_KEY]: { tabId: tab.id, at: Date.now() } });
        return tab.id;
    });
    return shikiAuthOpening;
}

async function isShikiAuthExpected(tabId) {
    if (shikiAuthOpening) await shikiAuthOpening.catch(() => {});
    if (tabId === undefined || tabId === null) return false;
    const { [SHIKI_AUTH_PENDING_KEY]: pending } = await chrome.storage.session.get([SHIKI_AUTH_PENDING_KEY]);
    return !!pending && pending.tabId === tabId && Date.now() - pending.at < SHIKI_AUTH_PENDING_TTL;
}

/** Код уже принят или обменивается: страница и фон видят его независимо друг от друга */
function isShikiCodeInProgress(code) {
    return globalThis.activeOAuthPromises.has(String(code || '').trim());
}

async function completeShikiAuth(code, tabId) {
    const cleanCode = String(code || '').trim();
    try {
        if (!isShikiCodeInProgress(cleanCode) && !(await isShikiAuthExpected(tabId))) {
            return { success: false, reason: 'not_expected', error: 'Вход не запрашивался. Откройте окно расширения и нажмите «Войти».' };
        }
        const res = await exchangeShikiCode(cleanCode);
        await chrome.storage.session.remove([SHIKI_AUTH_PENDING_KEY]);
        return res;
    } catch (err) {
        return { success: false, error: err.message };
    }
}

async function getShikiStatus() {
    const tokens = await getShikiTokens();
    if (tokens.shiki_access_token && !tokens.shiki_user) {
        try {
            const userRes = await shikiFetch(`${SHIKI_API_BASE}/api/users/whoami`);
            if (userRes.ok) {
                tokens.shiki_user = await userRes.json();
                await chrome.storage.local.set({ shiki_user: tokens.shiki_user });
            }
        } catch (e) {
            console.warn('[Anime+] Failed to auto-fetch whoami:', e);
        }
    }

    const stored = await chrome.storage.local.get([
        'shiki_last_sync_time',
        'shiki_last_sync_status',
        'shiki_auth_error',
        'shiki_today_date',
        'shiki_today_episodes'
    ]);

    let todayCount = 0;
    if (stored.shiki_today_date !== localDateKey() || !Array.isArray(stored.shiki_today_episodes)) {
        await resetTodayCount();
    } else {
        todayCount = stored.shiki_today_episodes.length;
    }

    return {
        isLoggedIn: !!(tokens.shiki_access_token && tokens.shiki_user),
        user: tokens.shiki_user || null,
        clientId: tokens.shiki_client_id || '',
        lastSyncTime: stored.shiki_last_sync_time || null,
        lastSyncStatus: stored.shiki_last_sync_status || null,
        authError: stored.shiki_auth_error === true,
        todayCount
    };
}

async function resetTodayCount() {
    await chrome.storage.local.set({
        shiki_today_date: localDateKey(),
        shiki_today_count: 0,
        shiki_today_episodes: []
    });
    return { success: true, todayCount: 0 };
}

async function getShikiRelated(id) {
    const list = await fetchShikimoriApi(`/api/animes/${id}/related`);
    if (!Array.isArray(list)) return { related: [] };
    const related = list.map((item) => {
        const rel = item.anime || item.manga;
        // Номер и год попадают в разметку страницы: только цифры
        const id = rel ? parseInt(rel.id, 10) : 0;
        if (!id) return null;
        const poster = rel.image ? (rel.image.original || rel.image.preview || '') : '';
        return {
            id,
            name: rel.name,
            russian: rel.russian || rel.name,
            relation: item.relation_russian || item.relation || 'Связанное',
            kind: rel.kind ? rel.kind.toUpperCase() : '',
            year: (String(rel.aired_on || '').match(/^\d{4}/) || [''])[0],
            poster: poster && !poster.startsWith('http') ? `${SHIKI_API_BASE}${poster}` : poster
        };
    }).filter(Boolean);
    await fillShikiPosters(related.filter(r => r.id));
    return { related };
}

async function logoutShiki() {
    // Секрет своего приложения остаётся, как и его client_id: с ними зритель входит снова
    await (await shikiVault()).remove(['shiki_access_token', 'shiki_refresh_token']);
    await chrome.storage.local.remove([
        'shiki_token_expires_at',
        'shiki_user',
        'shiki_auth_error',
        'shiki_auth_error_time',
        'shiki_last_sync_time',
        'shiki_last_sync_status'
    ]);
    return { success: true };
}

const SHIKI_LIST_LIMIT = 300;
// Больше за один запрос /api/animes не отдаёт
const SHIKI_ANIMES_PAGE = 50;

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
        const res = await shikiFetch(`https://shikimori.io/api/v2/user_rates?user_id=${userId}&target_type=Anime&status=${cleanStatus}&limit=${SHIKI_LIST_LIMIT}`);
        if (res.ok) {
            const rates = await res.json();
            if (Array.isArray(rates) && rates.length === 0) {
                await chrome.storage.local.set({ [cacheKey]: [] });
                return { success: true, items: [] };
            }
            if (Array.isArray(rates) && rates.length > 0) {
                const animeIds = rates.map(r => r.target_id).filter(Boolean);
                if (animeIds.length > 0) {
                    const animeMap = new Map();
                    for (let i = 0; i < animeIds.length; i += SHIKI_ANIMES_PAGE) {
                        const chunk = animeIds.slice(i, i + SHIKI_ANIMES_PAGE);
                        const animeRes = await shikiFetch(`https://shikimori.io/api/animes?ids=${chunk.join(',')}&limit=${chunk.length}`);
                        if (!animeRes.ok) continue;
                        const animeList = await animeRes.json();
                        if (Array.isArray(animeList)) animeList.forEach(a => animeMap.set(a.id, a));
                    }

                    const items = rates.map(rate => {
                        const anime = animeMap.get(rate.target_id) || {};
                        let poster = anime.image ? (anime.image.original || anime.image.preview || '') : '';
                        if (poster && !poster.startsWith('http')) {
                            poster = 'https://shikimori.io' + (poster.startsWith('/') ? '' : '/') + poster;
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

                    await fillShikiPosters(items, { getId: i => i.animeId });
                    await chrome.storage.local.set({ [cacheKey]: items });
                    return { success: true, items };
                }
            }
        }
    } catch (err) {
        console.error("[Anime+] getShikiWatchingList network error:", err);
    }

    if (cachedItems) {
        return { success: true, items: cachedItems, fromCache: true };
    }

    return { success: false, reason: 'fetch_failed', items: [] };
}

// Локальная дата (а не UTC из toISOString), иначе «сегодня» сбрасывается в 03:00 по Москве
function localDateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function bumpTodayCounter(targetId, epNumber) {
    const todayStr = localDateKey();
    const storageData = await chrome.storage.local.get(['shiki_today_date', 'shiki_today_episodes']);
    let todayEpisodes = Array.isArray(storageData.shiki_today_episodes) ? storageData.shiki_today_episodes : [];
    if (storageData.shiki_today_date !== todayStr) todayEpisodes = [];

    const epKey = `${targetId}_${epNumber}`;
    if (!todayEpisodes.includes(epKey)) todayEpisodes.push(epKey);

    await chrome.storage.local.set({
        shiki_last_sync_time: Date.now(),
        shiki_last_sync_status: 'success',
        shiki_auth_error: false,
        shiki_today_date: todayStr,
        shiki_today_episodes: todayEpisodes,
        shiki_today_count: todayEpisodes.length
    });
}

// Определение ID тайтла на Shikimori по набору названий (оригинал, русское, синонимы) и году.
// Результат кэшируется на 30 дней, чтобы не дёргать API на каждой серии.
const SHIKI_ID_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;

async function resolveShikimoriId({ titles = [], year = '', kind = '' }) {
    const cleanTitles = [...new Set(titles.map(t => String(t || '').trim()).filter(Boolean))];
    if (cleanTitles.length === 0) return null;

    const cacheKey = `${cleanTitles[0].toLowerCase()}|${year}`;
    const { shiki_id_cache: cache = {} } = await chrome.storage.local.get(['shiki_id_cache']);
    const hit = cache[cacheKey];
    if (hit && Date.now() - hit.ts < SHIKI_ID_CACHE_TTL) return hit.data;

    const norm = globalThis.AgTitleMatch.normalize;
    const normTitles = cleanTitles.map(norm);

    // Пробуем полные названия, затем укороченные до двоеточия/тире
    const queries = [...cleanTitles];
    cleanTitles.forEach(t => {
        const short = t.split(/[:—–]|\s-\s/)[0].trim();
        if (short && short !== t && !queries.includes(short)) queries.push(short);
    });

    let best = null;
    let bestScore = -Infinity;
    for (const q of queries) {
        const list = await fetchShikimoriApi(`/api/animes?search=${encodeURIComponent(q)}&limit=8`);
        if (!Array.isArray(list) || list.length === 0) continue;

        list.forEach((item, idx) => {
            const names = [item.name, item.russian, ...(item.english || []), ...(item.synonyms || [])].map(norm).filter(Boolean);
            let score = -idx * 5; // порядок выдачи Shikimori тоже важен
            if (names.some(n => normTitles.includes(n))) score += 100;
            else if (names.some(n => normTitles.some(t => t && (n.startsWith(t) || t.startsWith(n))))) score += 40;
            const itemYear = item.aired_on ? String(item.aired_on).slice(0, 4) : '';
            if (year && itemYear) score += itemYear === String(year) ? 50 : -30;
            if (kind && item.kind && String(item.kind).toLowerCase() === String(kind).toLowerCase()) score += 10;
            // Фильм и сериал с похожим началом названия: лучше не отметить ничего, чем отметить чужой тайтл
            if (kind && item.kind && (String(kind).toLowerCase() === 'movie') !== (String(item.kind).toLowerCase() === 'movie')) score -= 60;
            if (score > bestScore) { bestScore = score; best = item; }
        });
        if (bestScore >= 100) break;
    }

    if (!best || bestScore < 0) return null;

    const data = { id: best.id, name: best.name, russian: best.russian };
    await updateStorageObject('shiki_id_cache', c => { c[cacheKey] = { ts: Date.now(), data }; }, { maxEntries: 500 });
    return data;
}

// Жанры тайтлов одним запросом GraphQL: в REST-поиске их нет. Без жанров карточка всё равно показывается
async function getShikiGenres(ids) {
    const unique = [...new Set(ids.map(id => parseInt(id, 10)).filter(Boolean))];
    if (unique.length === 0) return {};
    try {
        const res = await shikiRateFetch(`${SHIKI_API_BASE}/api/graphql`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query: `{ animes(ids: "${unique.join(',')}", limit: ${unique.length}) { id genres { russian } } }` })
        });
        if (!res.ok) return {};
        const json = await res.json();
        const list = json && json.data && Array.isArray(json.data.animes) ? json.data.animes : [];
        return Object.fromEntries(list.map(a => [String(a.id), (a.genres || []).map(g => g.russian).filter(Boolean)]));
    } catch (e) {
        return {};
    }
}

/** Тайтлы для объединённого поиска на AnimeGO: тех, что нет в выдаче сайта, открывает синтетическая страница /anime/shiki-<id> */
async function searchShikimoriAnime(query) {
    const list = await fetchShikimoriApi(`/api/animes?search=${encodeURIComponent(query)}&limit=8&censored=true`);
    if (!Array.isArray(list)) return [];
    const shown = list.filter(item => item && item.id && !['music', 'pv', 'cm'].includes(item.kind));
    const genres = await getShikiGenres(shown.map(item => item.id));
    return shown.map(item => ({
        id: item.id,
        russian: item.russian || '',
        name: item.name || '',
        year: item.aired_on ? item.aired_on.slice(0, 4) : '',
        kind: item.kind || '',
        score: item.score,
        poster: item.image && item.image.original ? `https://shikimori.io${item.image.original}` : '',
        genres: genres[String(item.id)] || []
    }));
}

async function updateShikiUserRate({ shikimoriId, episode, status }) {
    let tokens = await getShikiTokens();
    if (tokens.shiki_access_token && !tokens.shiki_user) {
        try {
            const userRes = await shikiFetch('https://shikimori.io/api/users/whoami');
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

    const getRes = await shikiFetch(`https://shikimori.io/api/v2/user_rates?user_id=${userId}&target_id=${targetId}&target_type=Anime`);
    if (!getRes.ok) {
        // Без записи из списка новая запись создалась бы поверх существующей
        return { success: false, status: getRes.status, retryable: isRetryableStatus(getRes.status), error: `HTTP ${getRes.status}` };
    }
    const rates = await getRes.json();
    const existingRate = Array.isArray(rates) && rates.length > 0 ? rates[0] : null;

    const epNumber = parseInt(episode) || 1;
    // Сайты называют числом серий то, что уже вышло. У онгоинга без объявленного числа серий (episodes: 0) конца нет
    const anime = await fetchShikimoriApi(`/api/animes/${targetId}`);
    const totalEp = parseInt(anime && anime.episodes) || 0;
    const isOngoing = anime && anime.status === 'ongoing';

    let targetStatus = status || 'watching';
    if (totalEp > 0 && epNumber >= totalEp) {
        targetStatus = 'completed';
    } else if (!isOngoing && existingRate && (existingRate.status === 'completed' || existingRate.status === 'rewatching' || (existingRate.rewatches && existingRate.rewatches > 0))) {
        targetStatus = 'rewatching';
    }

    // Пересмотр старой серии не должен откатывать прогресс назад
    const isNoop = existingRate
        && existingRate.status === targetStatus
        && targetStatus !== 'rewatching'
        && (parseInt(existingRate.episodes) || 0) >= epNumber;
    if (isNoop) {
        await bumpTodayCounter(targetId, epNumber);
        return { success: true, noop: true, rate: existingRate };
    }

    let payload = {
        user_rate: {
            user_id: userId,
            target_id: targetId,
            target_type: 'Anime',
            episodes: targetStatus === 'rewatching' ? epNumber : Math.max(epNumber, parseInt(existingRate?.episodes) || 0),
            status: targetStatus
        }
    };

    let saveRes;
    if (existingRate && existingRate.id) {
        saveRes = await shikiFetch(`https://shikimori.io/api/v2/user_rates/${existingRate.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } else {
        saveRes = await shikiFetch(`https://shikimori.io/api/v2/user_rates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    if (saveRes.ok) {
        const savedData = await saveRes.json();
        await bumpTodayCounter(targetId, epNumber);
        return { success: true, rate: savedData };
    } else {
        const errText = await saveRes.text();
        console.error('[Anime+] Failed to update Shikimori user rate:', errText);
        await chrome.storage.local.set({
            shiki_last_sync_time: Date.now(),
            shiki_last_sync_status: 'error'
        });
        return { success: false, status: saveRes.status, retryable: isRetryableStatus(saveRes.status), error: errText };
    }
}

// ---------- Очередь отправки прогресса ----------
// Серия досмотрена, а сеть или Shikimori недоступны: запись ждёт следующей проверки, даже если вкладку закрыли

const SHIKI_SYNC_QUEUE_KEY = 'shiki_sync_queue';
const SHIKI_SYNC_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
let shikiSyncFlushing = null;

function isRetryableStatus(status) {
    return status === 429 || status >= 500;
}

function queueShikiSync({ shikimoriId, episode, status }) {
    return updateStorageObject(SHIKI_SYNC_QUEUE_KEY, (queue) => {
        const known = queue[shikimoriId];
        if (!known || episode >= known.episode) queue[shikimoriId] = { shikimoriId, episode, status, at: Date.now() };
    }, { maxEntries: 200 });
}

function forgetShikiSync(shikimoriId, episode) {
    return updateStorageObject(SHIKI_SYNC_QUEUE_KEY, (queue) => {
        const known = queue[shikimoriId];
        if (known && known.episode <= episode) delete queue[shikimoriId];
    });
}

async function syncShikiProgress({ shikimoriId, episode, status }) {
    let res;
    try {
        res = await updateShikiUserRate({ shikimoriId, episode, status });
    } catch (err) {
        res = { success: false, retryable: true, error: err.message };
    }
    if (res.retryable) {
        if (globalThis.noteDiag) noteDiag('shiki_sync_queued', res.status ? `HTTP ${res.status}` : res.error);
        await queueShikiSync({ shikimoriId, episode, status });
        return { ...res, queued: true };
    }
    if (res.success) {
        await forgetShikiSync(shikimoriId, episode);
        flushShikiSyncQueue().catch(() => {});
    }
    return res;
}

function flushShikiSyncQueue() {
    if (!shikiSyncFlushing) {
        shikiSyncFlushing = sendQueuedShikiSync().finally(() => { shikiSyncFlushing = null; });
    }
    return shikiSyncFlushing;
}

async function sendQueuedShikiSync() {
    const { [SHIKI_SYNC_QUEUE_KEY]: queue = {} } = await chrome.storage.local.get([SHIKI_SYNC_QUEUE_KEY]);
    const entries = Object.values(queue).sort((a, b) => a.at - b.at);
    for (const entry of entries) {
        const expired = Date.now() - entry.at > SHIKI_SYNC_KEEP_MS;
        if (!expired) {
            let res;
            try {
                res = await updateShikiUserRate(entry);
            } catch (e) {
                return; // Сети нет: остальные записи ждут следующей проверки
            }
            if (res.retryable) return;
        }
        await updateStorageObject(SHIKI_SYNC_QUEUE_KEY, (current) => {
            const known = current[entry.shikimoriId];
            if (known && known.episode <= entry.episode) delete current[entry.shikimoriId];
        });
    }
}

async function addToWatchHistory(item) {
    if (!item || (!item.russian && !item.name)) return;
    try {
        const data = await chrome.storage.local.get(['ag_watch_history']);
        let history = Array.isArray(data.ag_watch_history) ? data.ag_watch_history : [];

        const title = item.russian || item.name;
        // На разных сайтах название одного тайтла пишут по-разному: ID надёжнее
        history = history.filter(h => (h.russian || h.name) !== title && !(item.id && h.id === item.id));

        history.unshift({
            id: item.id || null,
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

// Повтор неотправленного прогресса.
// chrome.alarms.create с тем же именем отменяет существующий alarm и запускает отсчёт заново,
// а service worker просыпается на каждое сообщение: создаём, только если его нет
const SHIKI_RETRY_ALARM = 'shiki_sync_retry';
const SHIKI_RETRY_MINUTES = 30;

async function ensureRetryAlarm() {
    const existing = await chrome.alarms.get(SHIKI_RETRY_ALARM);
    if (!existing) await chrome.alarms.create(SHIKI_RETRY_ALARM, { periodInMinutes: SHIKI_RETRY_MINUTES });
}

// Уведомления о сериях убраны в 11.1: от них не должно остаться ни будильника, ни данных
const OLD_NOTIFICATION_KEYS = ['shiki_aired_seen', 'notified_episodes', 'notified_episodes_history', 'active_notifications_map'];

async function removeNotificationLeftovers() {
    await chrome.alarms.clear('check_new_episodes_alarm');
    await chrome.storage.local.remove(OLD_NOTIFICATION_KEYS);
    const { ag_settings: settings } = await chrome.storage.local.get(['ag_settings']);
    if (settings && 'notif_enabled' in settings) {
        delete settings.notif_enabled;
        await chrome.storage.local.set({ ag_settings: settings });
    }
}

try {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === SHIKI_RETRY_ALARM) flushShikiSyncQueue().catch(() => {});
    });
    chrome.runtime.onInstalled.addListener(() => {
        removeNotificationLeftovers().catch(() => {});
        ensureRetryAlarm();
    });
    chrome.runtime.onStartup.addListener(() => {
        ensureRetryAlarm();
        flushShikiSyncQueue().catch(() => {});
    });
    ensureRetryAlarm();
} catch (e) {}
