// Первый ролик поиска YouTube для кнопки опенинга и эндинга в окне расширения.
// Официальный API даёт около 100 поисков в день, поэтому разбирается обычная страница поиска.
// Найденный ролик запоминается в кэше Cloudflare: один и тот же опенинг ищется в YouTube раз в месяц, а не на каждое нажатие.
// Пустой ответ не запоминается: серверам Cloudflare YouTube иногда отдаёт проверку или выдачу в другом формате,
// и это не значит, что ролика нет. Расширение в таком случае открывает обычный поиск.

const FOUND_TTL_SEC = 30 * 24 * 3600;
// Фильтр «только видео»: без него первыми бывают каналы и плейлисты
const VIDEOS_ONLY = 'EgIQAQ%253D%253D';
// Форматы выдачи по порядку надёжности: обычный, новый (YouTube отдаёт его части запросов), просто ссылка на ролик.
// Реклама идёт в adSlotRenderer и ссылками на googleadservices, поэтому сюда не попадает
const VIDEO_PATTERNS = [
    /"videoRenderer":\{"videoId":"([\w-]{11})"/,
    /"lockupViewModel":\{[^]{0,4000}?"contentId":"([\w-]{11})","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"/,
    /"url":"\/watch\?v=([\w-]{11})/
];

export function firstVideoId(html) {
    const text = String(html || '');
    for (const re of VIDEO_PATTERNS) {
        const m = text.match(re);
        if (m) return m[1];
    }
    return null;
}

export const normalizeQuery = (q) => String(q || '').trim().replace(/\s+/g, ' ').toLowerCase();

// v2: в первой версии на сутки запоминались и пустые ответы, их больше не читаем
const cacheKey = (q) => `https://animeplus-cache.invalid/yt/v2?q=${encodeURIComponent(q)}`;

export async function findVideo(query, { fetch: fetchFn = fetch, cache } = {}) {
    const q = normalizeQuery(query);
    const key = cacheKey(q);
    if (cache) {
        const hit = await cache.match(key);
        if (hit) return hit.json();
    }
    let res;
    try {
        res = await fetchFn(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=${VIDEOS_ONLY}`, {
            // Согласие на cookie: без него европейские узлы Cloudflare получают страницу согласия вместо поиска
            headers: { 'Accept-Language': 'en', Cookie: 'SOCS=CAI' }
        });
    } catch (e) {
        return { id: null };
    }
    if (!res.ok) return { id: null };
    const html = await res.text();
    const id = firstVideoId(html);
    if (!id) {
        // В журнал Cloudflare (wrangler tail): по нему видно, что YouTube отдал вместо выдачи
        console.log('yt: no video', JSON.stringify({ q, len: html.length, data: html.includes('ytInitialData') }));
        return { id: null };
    }
    if (cache) {
        await cache.put(key, new Response(JSON.stringify({ id }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${FOUND_TTL_SEC}` }
        }));
    }
    return { id };
}
