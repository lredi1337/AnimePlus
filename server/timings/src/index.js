// Общая база таймингов опенингов и эндингов. Расширение присылает только найденное время.
// Метка становится общей, когда её независимо подтвердили несколько человек.
// IP не хранится: для подсчёта разных людей используется необратимый хэш с секретом, отдельный для каждого тайтла.

import { handleFeedback } from './feedback.js';

// Метка доходит до зрителей без проверки звуком, поэтому двух адресов для неё мало
export const MIN_REPORTERS = 3;
const STORE_EXTENSION_ID = 'mgcaideibpbdddnbedoefmabladoaajg';
const START_TOLERANCE = 2;
const END_TOLERANCE = 3;
const MIN_LEN = 20;
const MAX_LEN = 240;
const DAILY_LIMIT = 300;
// Хэш отправителя свой для каждого тайтла, поэтому лимит выше считает один тайтл. Этот считает всё с одного адреса.
// За одним адресом бывает много зрителей, поэтому он выше
const NETWORK_DAILY_LIMIT = 1000;
const CACHE_SEC = 900;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const writeCors = (origin) => ({ ...CORS, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });
// С разной длиной это другая версия серии и другие тайминги
const durationKey = (dur) => Math.round(Number(dur) / 3);
// Длины одного видео могут отличаться на секунду и попасть в соседние группы, поэтому при чтении берём обе
const durationKeyRange = (dur) => [durationKey(Number(dur) - 1), durationKey(Number(dur) + 1)];

/** Писать могут только расширения: страница любого сайта иначе отправляла бы отчёты с адресов своих посетителей */
function extensionOrigin(request, env) {
    const origin = request.headers.get('Origin') || '';
    const ids = [STORE_EXTENSION_ID, ...String(env.EXTRA_EXTENSION_IDS || '').split(',').map(id => id.trim()).filter(Boolean)];
    return ids.some(id => origin === `chrome-extension://${id}`) ? origin : null;
}

/** У IPv6 один человек владеет целой сетью /64: считаем её одним адресом */
function reporterNetwork(ip) {
    if (!ip.includes(':')) return ip;
    const [head, tail = ''] = ip.split('::');
    const start = head ? head.split(':') : [];
    const end = tail ? tail.split(':') : [];
    const groups = [...start, ...Array(Math.max(0, 8 - start.length - end.length)).fill('0'), ...end];
    return groups.slice(0, 4).map(g => parseInt(g, 16).toString(16)).join(':');
}
const median = (list) => {
    const s = [...list].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

/** Самая большая группа совпадающих сообщений от разных людей или null, пока людей мало */
export function consensus(rows, minReporters = MIN_REPORTERS) {
    let best = null;
    for (const a of rows) {
        const group = rows.filter(b => Math.abs(a.start - b.start) <= START_TOLERANCE && Math.abs(a.end - b.end) <= END_TOLERANCE);
        const people = new Set(group.map(x => x.reporter)).size;
        if (people >= minReporters && (!best || people > best.people)) best = { people, group };
    }
    if (!best) return null;
    return { start: median(best.group.map(x => x.start)), end: median(best.group.map(x => x.end)), people: best.people };
}

/** Проверка сообщения: возвращает чистые данные или null */
export function validateReport(body) {
    if (!body || typeof body !== 'object') return null;
    const id = Number(body.id);
    const episode = String(body.episode ?? '').trim();
    const voice = String(body.voice ?? '').trim().slice(0, 64);
    const part = body.part;
    const duration = Number(body.duration);
    const start = Number(body.start);
    const end = Number(body.end);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!/^\d{1,4}(\.\d)?$/.test(episode)) return null;
    if (part !== 'op' && part !== 'ed') return null;
    if (!(duration >= 300 && duration <= 14400)) return null;
    if (!(start >= 0 && end > start && end <= duration + 5)) return null;
    const len = end - start;
    if (len < MIN_LEN || len > MAX_LEN) return null;
    return { id, episode, voice, part, duration, start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10 };
}

async function reporterHash(request, env, id) {
    const ip = reporterNetwork(request.headers.get('CF-Connecting-IP') || '');
    const data = new TextEncoder().encode(`${env.REPORT_SALT}|${id}|${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Считает отчёт и говорит, не превышен ли общий лимит адреса */
async function overNetworkLimit(request, env, day) {
    const ip = reporterNetwork(request.headers.get('CF-Connecting-IP') || '');
    const data = new TextEncoder().encode(`${env.REPORT_SALT}|daily|${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const net = [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
    const row = await env.DB.prepare('INSERT INTO report_daily (net, day, n) VALUES (?, ?, 1) ON CONFLICT (net, day) DO UPDATE SET n = n + 1 RETURNING n').bind(net, day).first();
    const n = row ? row.n : 0;
    // Счётчики прошлых дней не нужны: чистим при первом отчёте адреса за день
    if (n === 1) await env.DB.prepare('DELETE FROM report_daily WHERE day < ?').bind(day - 1).run();
    return n > NETWORK_DAILY_LIMIT;
}

async function handleGet(url, env, ctx) {
    const id = Number(url.searchParams.get('id'));
    const episode = String(url.searchParams.get('episode') || '');
    const voice = String(url.searchParams.get('voice') || '').slice(0, 64);
    const duration = Number(url.searchParams.get('duration'));
    if (!Number.isInteger(id) || id <= 0 || !episode || !(duration > 0)) return json({ error: 'bad request' }, 400);

    const cache = caches.default;
    const cacheKey = new Request(url.toString());
    const hit = await cache.match(cacheKey);
    if (hit) return hit;

    const { results } = await env.DB.prepare('SELECT part, start, end, reporter FROM reports WHERE id = ? AND episode = ? AND voice = ? AND dur_key BETWEEN ? AND ? LIMIT 500')
        .bind(id, episode, voice, ...durationKeyRange(duration)).all();
    const out = {};
    for (const part of ['op', 'ed']) {
        const c = consensus(results.filter(r => r.part === part));
        if (c) out[part] = c;
    }
    const response = json(out, 200, { 'Cache-Control': `public, max-age=${CACHE_SEC}` });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
}

async function handlePost(request, env, cors) {
    let body = null;
    try { body = await request.json(); } catch (e) {}
    const r = validateReport(body);
    if (!r) return json({ error: 'bad report' }, 400, cors);
    const reporter = await reporterHash(request, env, r.id);
    const day = Math.floor(Date.now() / 86400000);
    if (await overNetworkLimit(request, env, day)) return json({ error: 'limit' }, 429, cors);
    // Ограничение от мусора: один человек не должен заполнять базу в одиночку
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND day = ?').bind(reporter, day).first();
    if (count && count.n >= DAILY_LIMIT) return json({ error: 'limit' }, 429, cors);
    await env.DB.prepare('INSERT OR REPLACE INTO reports (id, episode, voice, dur_key, part, reporter, start, end, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(r.id, r.episode, r.voice, durationKey(r.duration), r.part, reporter, r.start, r.end, day).run();
    return json({ ok: true }, 200, cors);
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        try {
            const origin = extensionOrigin(request, env);
            if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: origin ? writeCors(origin) : { Vary: 'Origin' } });
            if (url.pathname === '/v1/timings' && request.method === 'GET') return await handleGet(url, env, ctx);
            if (request.method === 'POST' && (url.pathname === '/v1/report' || url.pathname === '/v1/feedback')) {
                if (!origin) return json({ error: 'forbidden' }, 403);
                const cors = writeCors(origin);
                if (url.pathname === '/v1/report') return await handlePost(request, env, cors);
                const { status, body } = await handleFeedback(request, env);
                return json(body, status, cors);
            }
            return json({ error: 'not found' }, 404);
        } catch (e) {
            return json({ error: 'server' }, 500);
        }
    }
};
