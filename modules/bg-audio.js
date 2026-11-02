// modules/bg-audio.js
// База отпечатков песен для пропуска по звуку: файлы лежат в репозитории и отдаются бесплатными CDN. Сначала jsDelivr, резерв GitHub.
// Там же настройки с аварийным выключателем: функцию можно отключить у всех без обновления расширения.

const AUDIO_FP_SOURCES = [
    (file) => `https://cdn.jsdelivr.net/gh/lredi1337/AnimePlus@fingerprints/v1/${file}`,
    (file) => `https://raw.githubusercontent.com/lredi1337/AnimePlus/fingerprints/v1/${file}`
];
const AUDIO_FP_CACHE = 'ap-audio-fingerprints-v1';
const AUDIO_FP_TTL = 30 * 24 * 3600 * 1000;
const AUDIO_FP_MISS_TTL = 3 * 24 * 3600 * 1000;
const AUDIO_CONFIG_TTL = 6 * 3600 * 1000;
const TIMINGS_API = 'https://animeplus-timings.ruscadred.workers.dev';
const TIMINGS_TTL = 7 * 24 * 3600 * 1000;
const TIMINGS_MISS_TTL = 3600 * 1000;

const audioKey = (name) => `https://anime-plus.invalid/fingerprints/${name}`;

/** Файл из базы с кэшем: возвращает { found, data }, сбой сети возвращает null */
async function fetchAudioFile(file) {
    let missing = false;
    for (const source of AUDIO_FP_SOURCES) {
        try {
            const r = await fetch(source(file), { signal: AbortSignal.timeout(20000) });
            if (r.status === 404) { missing = true; continue; }
            if (!r.ok) continue;
            return { found: true, data: await r.json() };
        } catch (e) {}
    }
    return missing ? { found: false, data: null } : null;
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
    if (r.ok) await cache.put(key, new Response('1'));
    return null;
}
