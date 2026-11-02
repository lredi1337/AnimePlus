// Общая база таймингов опенингов и эндингов. Расширение присылает только найденное время.
// Метка становится общей, когда её независимо подтвердили несколько человек.
// IP не хранится: для подсчёта разных людей используется необратимый хэш с секретом, отдельный для каждого тайтла.

import { handleFeedback } from './feedback.js';

export const MIN_REPORTERS = 2;
const START_TOLERANCE = 2;
const END_TOLERANCE = 3;
const MIN_LEN = 20;
const MAX_LEN = 240;
const DAILY_LIMIT = 300;
const CACHE_SEC = 900;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });
// Длины одного видео могут отличаться на секунду: с разной длиной это другая версия серии и другие тайминги
const durationKey = (dur) => Math.round(Number(dur) / 3);
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
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const data = new TextEncoder().encode(`${env.REPORT_SALT}|${id}|${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
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

    const { results } = await env.DB.prepare('SELECT part, start, end, reporter FROM reports WHERE id = ? AND episode = ? AND voice = ? AND dur_key = ? LIMIT 500')
        .bind(id, episode, voice, durationKey(duration)).all();
    const out = {};
    for (const part of ['op', 'ed']) {
        const c = consensus(results.filter(r => r.part === part));
        if (c) out[part] = c;
    }
    const response = json(out, 200, { 'Cache-Control': `public, max-age=${CACHE_SEC}` });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
}

async function handlePost(request, env) {
    let body = null;
    try { body = await request.json(); } catch (e) {}
    const r = validateReport(body);
    if (!r) return json({ error: 'bad report' }, 400);
    const reporter = await reporterHash(request, env, r.id);
    const day = Math.floor(Date.now() / 86400000);
    // Ограничение от мусора: один человек не должен заполнять базу в одиночку
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND day = ?').bind(reporter, day).first();
    if (count && count.n >= DAILY_LIMIT) return json({ error: 'limit' }, 429);
    await env.DB.prepare('INSERT OR REPLACE INTO reports (id, episode, voice, dur_key, part, reporter, start, end, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(r.id, r.episode, r.voice, durationKey(r.duration), r.part, reporter, r.start, r.end, day).run();
    return json({ ok: true });
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        try {
            if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
            if (url.pathname === '/v1/timings' && request.method === 'GET') return await handleGet(url, env, ctx);
            if (url.pathname === '/v1/report' && request.method === 'POST') return await handlePost(request, env);
            if (url.pathname === '/v1/feedback' && request.method === 'POST') {
                const { status, body } = await handleFeedback(request, env);
                return json(body, status);
            }
            return json({ error: 'not found' }, 404);
        } catch (e) {
            return json({ error: 'server' }, 500);
        }
    }
};
