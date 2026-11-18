// Сервер Anime+: первый ролик поиска YouTube, чтобы кнопка в окне расширения открывала видео, а не страницу поиска
const test = require('node:test');
const assert = require('node:assert');

const loadIndex = () => import('../server/timings/src/index.js');
const loadYt = () => import('../server/timings/src/youtube.js');

const ORIGIN = 'chrome-extension://mgcaideibpbdddnbedoefmabladoaajg';
const page = (...ids) => `<html><script>var ytInitialData = {"contents":{"x":[{"adSlotRenderer":{"videoId":"AAAAAAAAAAA"}},${ids.map(id => `{"videoRenderer":{"videoId":"${id}","title":{"runs":[{"text":"t"}]}}}`).join(',')}]}};</script></html>`;

function memoryCache() {
    const store = new Map();
    return {
        store,
        match: async (key) => { const r = store.get(String(key.url || key)); return r ? r.clone() : undefined; },
        put: async (key, res) => { store.set(String(key.url || key), res.clone()); }
    };
}

test('первый обычный ролик из страницы поиска, реклама и мусор пропускаются', async () => {
    const { firstVideoId } = await loadYt();
    assert.strictEqual(firstVideoId(page('dmEM-lEreFg', 'FM3aJQzqV90')), 'dmEM-lEreFg');
    assert.strictEqual(firstVideoId(page()), null);
    assert.strictEqual(firstVideoId('<html>consent</html>'), null);
    // Новый формат выдачи, который YouTube отдаёт части запросов
    const lockup = '{"adSlotRenderer":{"videoId":"AAAAAAAAAAA"}},{"lockupViewModel":{"contentImage":{},"contentId":"E3QN_uoHysA","contentType":"LOCKUP_CONTENT_TYPE_VIDEO"}}';
    assert.strictEqual(firstVideoId(`var ytInitialData = {${lockup}};`), 'E3QN_uoHysA');
    assert.strictEqual(firstVideoId('var ytInitialData = {"x":{"url":"/watch?v=UsJ7g988dSo&pp=x"}};'), 'UsJ7g988dSo');
});

test('поиск: запрос к YouTube только по видео, ответ запоминается, повтор не идёт в YouTube', async () => {
    const { findVideo } = await loadYt();
    const calls = [];
    const cache = memoryCache();
    const fetchFn = async (url) => { calls.push(String(url)); return new Response(page('dmEM-lEreFg')); };
    const first = await findVideo('Fullmetal Alchemist: Brotherhood opening 1', { fetch: fetchFn, cache });
    assert.deepStrictEqual(first, { id: 'dmEM-lEreFg' });
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0], /^https:\/\/www\.youtube\.com\/results\?search_query=fullmetal/i);
    assert.match(calls[0], /sp=EgIQAQ/);
    // Тот же запрос с другим регистром и пробелами берётся из кэша
    assert.deepStrictEqual(await findVideo('  fullmetal alchemist: brotherhood  OPENING 1', { fetch: fetchFn, cache }), { id: 'dmEM-lEreFg' });
    assert.strictEqual(calls.length, 1);
});

test('сбой YouTube не запоминается: следующий запрос пробует снова', async () => {
    const { findVideo } = await loadYt();
    const cache = memoryCache();
    let n = 0;
    const fetchFn = async () => (++n === 1 ? new Response('busy', { status: 429 }) : new Response(page('QoGM9hCxr4k')));
    assert.deepStrictEqual(await findVideo('Frieren opening 1', { fetch: fetchFn, cache }), { id: null });
    assert.deepStrictEqual(await findVideo('Frieren opening 1', { fetch: fetchFn, cache }), { id: 'QoGM9hCxr4k' });
});

// Серверу Cloudflare YouTube иногда отдаёт со статусом 200 страницу без результатов поиска (проверка, согласие):
// такой ответ не значит, что ролика нет
test('пустой ответ не запоминается никогда: ни страница проверки, ни выдача в незнакомом формате', async () => {
    const { findVideo } = await loadYt();
    const cache = memoryCache();
    let n = 0;
    const fetchFn = async () => new Response(++n === 1 ? '<html>before you continue</html>' : page('E3QN_uoHysA'));
    assert.deepStrictEqual(await findVideo('Kusuriya no Hitorigoto opening 1', { fetch: fetchFn, cache }), { id: null });
    assert.strictEqual(cache.store.size, 0);
    assert.deepStrictEqual(await findVideo('Kusuriya no Hitorigoto opening 1', { fetch: fetchFn, cache }), { id: 'E3QN_uoHysA' });

    const empty = memoryCache();
    await findVideo('nothing at all', { fetch: async () => new Response(page()), cache: empty });
    assert.strictEqual(empty.store.size, 0);
});

test('адрес /v1/yt: только расширение и разумный запрос', async () => {
    const { default: worker } = await loadIndex();
    const ctx = { waitUntil() {} };
    const get = (q, origin) => new Request(`https://x.test/v1/yt?q=${encodeURIComponent(q)}`, { headers: origin ? { Origin: origin } : {} });
    assert.strictEqual((await worker.fetch(get('Frieren opening 1'), {}, ctx)).status, 403);
    assert.strictEqual((await worker.fetch(get('Frieren opening 1', 'https://evil.example'), {}, ctx)).status, 403);
    const empty = await worker.fetch(get('', ORIGIN), {}, ctx);
    assert.strictEqual(empty.status, 400);
    assert.strictEqual(empty.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.strictEqual((await worker.fetch(get('x'.repeat(201), ORIGIN), {}, ctx)).status, 400);
});
