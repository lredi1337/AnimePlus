// Сервер Anime+: принимает сообщения в поддержку и пересылает их на почту (feedback.js).
// Здесь же жила общая база таймингов опенингов и эндингов. Расширение с 11.4.1 её не использует,
// а за неделю работы она не подтвердила ни одной метки, поэтому в 2026-11 её закрыли.
// Старые версии ещё обращаются к её адресам: они получают пустой ответ, и база при этом не трогается.

import { handleFeedback } from './feedback.js';

// id расширения Chrome: 32 буквы от a до p. Любого, а не только версии из магазина: многие ставят Anime+ из папки с GitHub
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
// Ответ на чтение таймингов один и тот же: пусть его держит кэш браузера и Cloudflare
const CLOSED_CACHE_SEC = 7 * 24 * 3600;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const writeCors = (origin) => ({ ...CORS, 'Access-Control-Allow-Origin': origin, Vary: 'Origin' });

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS, ...extra } });

/** Писать могут только расширения: страница любого сайта иначе отправляла бы письма с адресов своих посетителей */
function extensionOrigin(request) {
    const origin = request.headers.get('Origin') || '';
    return EXTENSION_ORIGIN.test(origin) ? origin : null;
}

// Страница поддержки на GitHub Pages: с неё можно только написать в поддержку
const SUPPORT_SITE_ORIGIN = 'https://lredi1337.github.io';

/** Кто может писать по этому адресу: адрес отправителя, который вернётся в CORS, или null */
function allowedOrigin(request, env, pathname) {
    const extension = extensionOrigin(request);
    if (extension) return extension;
    return pathname === '/v1/feedback' && request.headers.get('Origin') === SUPPORT_SITE_ORIGIN ? SUPPORT_SITE_ORIGIN : null;
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        try {
            const origin = allowedOrigin(request, env, url.pathname);
            if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: origin ? writeCors(origin) : { Vary: 'Origin' } });
            // Закрытая база: меток нет ни у одного тайтла
            if (url.pathname === '/v1/timings' && request.method === 'GET') return json({}, 200, { 'Cache-Control': `public, max-age=${CLOSED_CACHE_SEC}` });
            if (request.method === 'POST' && (url.pathname === '/v1/report' || url.pathname === '/v1/feedback')) {
                if (!origin) return json({ error: 'forbidden' }, 403);
                const cors = writeCors(origin);
                // Старая версия запоминает отправленный отчёт только после успешного ответа: без него повторяла бы его при каждом просмотре
                if (url.pathname === '/v1/report') return json({ ok: true }, 200, cors);
                const { status, body } = await handleFeedback(request, env, { fromSite: origin === SUPPORT_SITE_ORIGIN });
                return json(body, status, cors);
            }
            return json({ error: 'not found' }, 404);
        } catch (e) {
            return json({ error: 'server' }, 500);
        }
    }
};
