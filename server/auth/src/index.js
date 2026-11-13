// Сервер входа в Shikimori для Anime+ (воркер animeplus.ruscadred.workers.dev).
// Shikimori выдаёт токены только вместе с секретом приложения, а в расширении его не спрятать: секрет живёт здесь,
// в настройках Cloudflare (SHIKI_CLIENT_SECRET), и подставляется в обмен кода и обновление токена.
// Принимает запросы только от расширений Chrome, иначе любой сайт мог бы менять коды через секрет Anime+.
// Любых, а не только версии из магазина: многие ставят Anime+ из папки с GitHub, и у каждой такой копии свой id.

// client_id не секрет: он виден в адресе входа и записан в credentials.js
const DEFAULT_CLIENT_ID = 'SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI';
// Основной домен первым: shikimori.one и .me перенаправляют на него, а POST после перенаправления превращается в GET
const SHIKI_DOMAINS = ['https://shikimori.io', 'https://shikimori.one', 'https://shikimori.me'];
const SHIKI_TIMEOUT_MS = 4000;
const USER_AGENT = 'AnimePlus (Cloudflare Worker)';
const MAX_BODY = 4096;

// id расширения Chrome: 32 буквы от a до p
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/** Адрес расширения, которое может писать сюда, или null */
function extensionOrigin(request) {
    const origin = request.headers.get('Origin') || '';
    return EXTENSION_ORIGIN.test(origin) ? origin : null;
}

const corsFor = (origin) => (origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Расширение добавляет User-Agent: без разрешения браузер, который его отправит, не пропустил бы запрос
    'Access-Control-Allow-Headers': 'Content-Type, User-Agent',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
} : { Vary: 'Origin' });

const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsFor(origin) } });

async function readBody(request) {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return null;
    const type = request.headers.get('Content-Type') || '';
    try {
        if (type.includes('application/json')) return JSON.parse(raw);
        if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
    } catch (e) {}
    return null;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Параметры для /oauth/token или null, если запрос не похож на обмен кода или обновление токена */
function tokenParams(body, clientId, clientSecret) {
    const grant = text(body.grant_type) || 'authorization_code';
    const params = { grant_type: grant, client_id: clientId, client_secret: clientSecret };
    if (grant === 'authorization_code') {
        if (!text(body.code)) return null;
        params.code = text(body.code);
        if (text(body.redirect_uri)) params.redirect_uri = text(body.redirect_uri);
    } else if (grant === 'refresh_token') {
        if (!text(body.refresh_token)) return null;
        params.refresh_token = text(body.refresh_token);
    } else {
        return null;
    }
    return params;
}

async function askShikimori(params, origin) {
    for (const domain of SHIKI_DOMAINS) {
        try {
            const res = await fetch(`${domain}/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
                body: new URLSearchParams(params).toString(),
                redirect: 'manual',
                signal: AbortSignal.timeout(SHIKI_TIMEOUT_MS)
            });
            // Ответ о самом коде или токене (неверный, истёк) другой адрес не изменит: отдаём как есть
            if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 404)) {
                return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json', ...corsFor(origin) } });
            }
        } catch (e) {}
    }
    return json({ error: 'shikimori_unreachable' }, 502, origin);
}

export default {
    async fetch(request, env) {
        const origin = extensionOrigin(request);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsFor(origin) });
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, origin);
        if (!origin) return json({ error: 'forbidden' }, 403, null);

        try {
            const body = await readBody(request);
            if (!body || typeof body !== 'object') return json({ error: 'bad_request' }, 400, origin);

            const clientId = text(env.SHIKI_CLIENT_ID) || DEFAULT_CLIENT_ID;
            // Своё приложение зрителя: его секрет сюда не нужен, расширение на 404 идёт к Shikimori напрямую
            if (text(body.client_id) && text(body.client_id) !== clientId) return json({ error: 'own_app_direct' }, 404, origin);

            const params = tokenParams(body, clientId, text(env.SHIKI_CLIENT_SECRET));
            if (!params) return json({ error: 'bad_request' }, 400, origin);
            if (!params.client_secret) return json({ error: 'not_configured' }, 503, origin);
            return await askShikimori(params, origin);
        } catch (e) {
            return json({ error: 'server' }, 500, origin);
        }
    }
};
