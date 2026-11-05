// modules/bg-audio.js
// База отпечатков песен для пропуска по звуку: файлы лежат в репозитории и отдаются бесплатно.
// Сначала GitHub: замер 2026-11-05 из Вьетнама дал стабильные 0,2-0,7 с. Сайт Cloudflare отвечал от 0,3 до 25 с и обрывал файлы, поэтому он запасной.
// У jsDelivr база больше лимита на пакет в 50 МБ: файлы не из его кэша он отклоняет (3 из 15), поэтому он последний.
// Там же настройки с аварийным выключателем: функцию можно отключить у всех без обновления расширения.

const githubSource = (file) => `https://raw.githubusercontent.com/lredi1337/AnimePlus/fingerprints/v1/${file}`;
const jsdelivrSource = (file) => `https://cdn.jsdelivr.net/gh/lredi1337/AnimePlus@fingerprints/v1/${file}`;
const AUDIO_CONFIG_SOURCES = [githubSource, jsdelivrSource];
const AUDIO_FP_SOURCES = [
    githubSource,
    (file) => `https://anime-plus-db.ruscadred.workers.dev/v1/${file}`,
    jsdelivrSource
];
// Аварийный выключатель должен срабатывать сразу, а не после выкладки сайта, поэтому настройки читаем прямо из репозитория
const AUDIO_CONFIG_FILE = 'config.json';
const AUDIO_FP_CACHE = 'ap-audio-fingerprints-v1';
const AUDIO_FP_TTL = 30 * 24 * 3600 * 1000;
const AUDIO_FP_MISS_TTL = 3 * 24 * 3600 * 1000;
const AUDIO_CONFIG_TTL = 6 * 3600 * 1000;
const TIMINGS_API = 'https://animeplus-timings.ruscadred.workers.dev';
const TIMINGS_TTL = 7 * 24 * 3600 * 1000;
const TIMINGS_MISS_TTL = 3600 * 1000;
const AUDIO_CACHE_KEEP = 90 * 24 * 3600 * 1000;
const AUDIO_CACHE_PRUNE_ALARM = 'audio_cache_prune';
const AUDIO_CACHE_PRUNE_MINUTES = 7 * 24 * 60;

const audioKey = (name) => `https://anime-plus.invalid/fingerprints/${name}`;

/** Файл из базы с кэшем: возвращает { found, data }, сбой сети возвращает null */
async function fetchAudioFile(file) {
    let missing = false;
    for (const source of file === AUDIO_CONFIG_FILE ? AUDIO_CONFIG_SOURCES : AUDIO_FP_SOURCES) {
        try {
            const r = await fetch(source(file), { signal: AbortSignal.timeout(20000) });
            if (r.status === 404) { missing = true; continue; }
            if (!r.ok) continue;
            return { found: true, data: await r.json() };
        } catch (e) {}
    }
    if (missing) return { found: false, data: null };
    if (globalThis.noteDiag) noteDiag('songs_unreachable', file);
    return null;
}

async function cachedAudioFile(name, file, ttl, missTtl) {
    const cache = await caches.open(AUDIO_FP_CACHE);
    const hit = await cache.match(audioKey(name));
    const saved = hit ? await hit.json() : null;
    if (saved && Date.now() - saved.at < (saved.data ? ttl : missTtl)) return saved.data;
    const res = await fetchAudioFile(file);
    // Сбой сети не считаем отсутствием файла, иначе тайтл пропал бы на три дня: остаётся прошлая версия
    if (!res) return saved ? saved.data : null;
    await cache.put(audioKey(name), new Response(JSON.stringify({ at: Date.now(), data: res.data })));
    return res.data;
}

/** Настройки с аварийным выключателем: новая оболочка плеера и функции пропуска */
function getRemoteConfig() {
    return cachedAudioFile('config', 'config.json', AUDIO_CONFIG_TTL, AUDIO_CONFIG_TTL);
}

async function getAudioFingerprints(id) {
    if (!/^\d+$/.test(String(id))) return null;
    const config = await cachedAudioFile('config', 'config.json', AUDIO_CONFIG_TTL, AUDIO_CONFIG_TTL);
    if (config && config.audioSkip === false) return null;
    return cachedAudioFile(String(id), `${id}.json`, AUDIO_FP_TTL, AUDIO_FP_MISS_TTL);
}

// ---------- Общая база таймингов: только время и номер серии, без звука ----------

const sharedTimingKey = ({ id, episode, voice, duration }) => audioKey(`shared/${id}/${encodeURIComponent(episode)}/${encodeURIComponent(voice)}/${Math.round(duration / 3)}`);

async function sharedTimingsAllowed() {
    const config = await cachedAudioFile('config', 'config.json', AUDIO_CONFIG_TTL, AUDIO_CONFIG_TTL);
    return !(config && config.sharedTimings === false);
}

async function getSharedTimings(info) {
    if (!(await sharedTimingsAllowed())) return null;
    const cache = await caches.open(AUDIO_FP_CACHE);
    const key = sharedTimingKey(info);
    const hit = await cache.match(key);
    const saved = hit ? await hit.json() : null;
    if (saved && Date.now() - saved.at < (saved.data && (saved.data.op || saved.data.ed) ? TIMINGS_TTL : TIMINGS_MISS_TTL)) return saved.data;
    const query = new URLSearchParams({ id: info.id, episode: info.episode, voice: info.voice, duration: info.duration });
    const r = await fetch(`${TIMINGS_API}/v1/timings?${query}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return saved ? saved.data : null;
    const data = await r.json();
    await cache.put(key, new Response(JSON.stringify({ at: Date.now(), data })));
    return data;
}

// Одна серия отправляется один раз, поэтому пересмотр не создаёт лишних запросов
async function reportAudioTiming(info) {
    if (!(await sharedTimingsAllowed())) return null;
    const cache = await caches.open(AUDIO_FP_CACHE);
    const key = `${sharedTimingKey(info)}/sent/${info.part}`;
    if (await cache.match(key)) return null;
    const { id, episode, voice, duration, part, start, end } = info;
    const r = await fetch(`${TIMINGS_API}/v1/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, episode, voice, duration, part, start, end }),
        signal: AbortSignal.timeout(8000)
    });
    if (r.ok) await cache.put(key, new Response(JSON.stringify({ at: Date.now() })));
    return null;
}

// ---------- Отпечатки серий для сравнения между собой ----------
// Только необратимые отпечатки начала и конца серии, в браузере зрителя. Старые удаляет общая чистка кэша

const PRINTS_PER_TITLE = 3;
const PRINT_MAX_CHARS = 2 * 1024 * 1024;
const printPrefix = (title, part) => audioKey(`prints/${title}/${part}/`);
const validPrintKey = ({ title, part, episode }) => /^\d+$/.test(String(title)) && (part === 'op' || part === 'ed') && /^[\w.-]{1,16}$/.test(String(episode));

async function readPrints(cache, title, part) {
    const prefix = printPrefix(title, part);
    const out = [];
    for (const request of await cache.keys()) {
        if (!request.url.startsWith(prefix)) continue;
        const hit = await cache.match(request.url);
        try {
            const saved = await hit.json();
            out.push({ url: request.url, episode: request.url.slice(prefix.length), at: saved.at, print: saved.print });
        } catch (e) {}
    }
    return out.sort((a, b) => b.at - a.at);
}

/** Отпечатки других серий тайтла, новые первыми */
async function getEpisodePrints(info) {
    if (!validPrintKey(info)) return [];
    const cache = await caches.open(AUDIO_FP_CACHE);
    return (await readPrints(cache, info.title, info.part)).filter(p => p.episode !== String(info.episode)).map(p => p.print);
}

async function saveEpisodePrint(info) {
    if (!validPrintKey(info) || !info.print || typeof info.print.fp !== 'string' || !(info.print.fp.length <= PRINT_MAX_CHARS)) return null;
    const cache = await caches.open(AUDIO_FP_CACHE);
    await cache.put(`${printPrefix(info.title, info.part)}${info.episode}`, new Response(JSON.stringify({ at: Date.now(), print: { base: Number(info.print.base) || 0, fp: info.print.fp } })));
    const all = await readPrints(cache, info.title, info.part);
    for (const old of all.slice(PRINTS_PER_TITLE)) await cache.delete(old.url);
    return null;
}

// ---------- Чистка кэша ----------
// Устаревшая запись нужна как запас на случай сбоя сети, но тайтлы и серии, которые давно не открывали, копились бы вечно

async function pruneAudioCache(now = Date.now()) {
    const cache = await caches.open(AUDIO_FP_CACHE);
    const configKey = audioKey('config');
    for (const request of await cache.keys()) {
        if (request.url === configKey) continue;
        const hit = await cache.match(request.url);
        let at = 0;
        try {
            at = (await hit.json()).at || 0;
        } catch (e) {}
        if (now - at > AUDIO_CACHE_KEEP) await cache.delete(request.url);
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === AUDIO_CACHE_PRUNE_ALARM) pruneAudioCache().catch(() => {});
});
// Повторное создание сдвигало бы срок, а service worker запускается часто
chrome.alarms.get(AUDIO_CACHE_PRUNE_ALARM).then((existing) => {
    if (!existing) return chrome.alarms.create(AUDIO_CACHE_PRUNE_ALARM, { periodInMinutes: AUDIO_CACHE_PRUNE_MINUTES });
    return undefined;
}).catch(() => {});
