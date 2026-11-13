// Сервер входа в Shikimori (server/auth): обменивает код и refresh-токен, подставляя секрет приложения Anime+.
// Секрет живёт только в настройках Cloudflare, поэтому сервер не должен становиться открытым обменником для чужих
const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../server/auth/src/index.js');

const STORE_ORIGIN = 'chrome-extension://mgcaideibpbdddnbedoefmabladoaajg';
const CLIENT_ID = 'SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI';
const ENV = { SHIKI_CLIENT_SECRET: 'test-secret' };

/** Подменяет сеть: route(url, body) возвращает ответ Shikimori */
function mockShikimori(route = () => new Response('{"access_token":"a","refresh_token":"r"}', { status: 200 })) {
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
        const body = Object.fromEntries(new URLSearchParams(options.body));
        calls.push({ url: String(url), body });
        return route(String(url), body);
    };
    return calls;
}

const post = (body, { origin = STORE_ORIGIN, type = 'application/json' } = {}) => new Request('https://animeplus.test/', {
    method: 'POST',
    headers: { 'Content-Type': type, ...(origin ? { Origin: origin } : {}) },
    body: type === 'application/json' ? JSON.stringify(body) : new URLSearchParams(body).toString()
});

test('код обменивается с секретом из настроек сервера, а не из кода', async () => {
    const { default: worker } = await load();
    const calls = mockShikimori();
    const res = await worker.fetch(post({ grant_type: 'authorization_code', client_id: CLIENT_ID, code: 'C0DE', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' }), ENV);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).access_token, 'a');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, 'https://shikimori.io/oauth/token');
    assert.deepStrictEqual(calls[0].body, { grant_type: 'authorization_code', client_id: CLIENT_ID, client_secret: 'test-secret', code: 'C0DE', redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' });
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), STORE_ORIGIN);
});

test('обновление токена', async () => {
    const { default: worker } = await load();
    const calls = mockShikimori();
    const res = await worker.fetch(post({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: 'R1' }, { type: 'application/x-www-form-urlencoded' }), ENV);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(calls[0].body, { grant_type: 'refresh_token', client_id: CLIENT_ID, client_secret: 'test-secret', refresh_token: 'R1' });
});

test('без секрета в настройках сервер не работает молча, а говорит об этом', async () => {
    const { default: worker } = await load();
    const calls = mockShikimori();
    const res = await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: 'R1' }), {});
    assert.strictEqual(res.status, 503);
    assert.strictEqual(calls.length, 0);
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server', 'auth', 'src', 'index.js'), 'utf8');
    assert.doesNotMatch(source, /client_?secret\s*[:=]\s*["'][\w-]{20,}/i);
});

test('чужие сайты и страницы не могут менять коды через секрет Anime+', async () => {
    const { default: worker } = await load();
    const calls = mockShikimori();
    for (const origin of ['https://evil.example', 'chrome-extension://otherextensionidotherextension', null]) {
        const res = await worker.fetch(post({ grant_type: 'authorization_code', code: 'C0DE' }, { origin }), ENV);
        assert.strictEqual(res.status, 403, String(origin));
    }
    assert.strictEqual(calls.length, 0);
    const preflight = await worker.fetch(new Request('https://animeplus.test/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), ENV);
    assert.strictEqual(preflight.headers.get('Access-Control-Allow-Origin'), null);
});

test('копия для разработки разрешается настройкой сервера', async () => {
    const { default: worker } = await load();
    mockShikimori();
    const dev = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const res = await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: 'R1' }, { origin: dev }), { ...ENV, EXTRA_EXTENSION_IDS: 'abcdefghijklmnopabcdefghijklmnop' });
    assert.strictEqual(res.status, 200);
});

test('своё приложение зрителя: 404, и расширение идёт к Shikimori напрямую со своим секретом', async () => {
    const { default: worker } = await load();
    const calls = mockShikimori();
    const res = await worker.fetch(post({ grant_type: 'authorization_code', client_id: 'own-app', client_secret: 'own-secret', code: 'C0DE' }), ENV);
    assert.strictEqual(res.status, 404);
    assert.strictEqual(calls.length, 0);
});

test('посторонние виды запросов и неполные запросы отклоняются', async () => {
    const { default: worker } = await load();
    const calls = mockShikimori();
    for (const body of [{ grant_type: 'client_credentials' }, { grant_type: 'password', username: 'x' }, { grant_type: 'authorization_code' }, { grant_type: 'refresh_token' }, {}]) {
        assert.strictEqual((await worker.fetch(post(body), ENV)).status, 400, JSON.stringify(body));
    }
    assert.strictEqual((await worker.fetch(new Request('https://animeplus.test/', { headers: { Origin: STORE_ORIGIN } }), ENV)).status, 405);
    assert.strictEqual(calls.length, 0);
});

test('ответ Shikimori об ошибке кода передаётся как есть, а недоступный адрес заменяется запасным', async () => {
    const { default: worker } = await load();
    const calls = mockShikimori((url) => {
        if (url.startsWith('https://shikimori.io')) throw new Error('down');
        return new Response('{"error":"invalid_grant"}', { status: 400 });
    });
    const res = await worker.fetch(post({ grant_type: 'authorization_code', code: 'C0DE' }), ENV);
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'invalid_grant');
    assert.deepStrictEqual(calls.map(c => new URL(c.url).hostname), ['shikimori.io', 'shikimori.one']);
});

test('все адреса Shikimori недоступны: 502', async () => {
    const { default: worker } = await load();
    mockShikimori(() => new Response('bad gateway', { status: 503 }));
    assert.strictEqual((await worker.fetch(post({ grant_type: 'refresh_token', refresh_token: 'R1' }), ENV)).status, 502);
});
