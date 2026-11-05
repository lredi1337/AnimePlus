// Общая база таймингов: когда метка становится общей и какие сообщения отбрасываются
const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../server/timings/src/index.js');
const report = (reporter, start, end) => ({ reporter, start, end });

test('один человек не создаёт общую метку', async () => {
    const { consensus } = await load();
    assert.strictEqual(consensus([report('a', 60, 150), report('a', 60, 150)]), null);
});

test('двоих мало: метка попадает зрителям без проверки, поэтому её не должны задавать два адреса', async () => {
    const { consensus } = await load();
    assert.strictEqual(consensus([report('a', 60, 150), report('b', 60, 150)]), null);
});

test('трое с одинаковым временем создают метку, разброс внутри допуска', async () => {
    const { consensus } = await load();
    const c = consensus([report('a', 60, 150), report('b', 61, 151), report('c', 60, 150)]);
    assert.strictEqual(c.people, 3);
    assert.ok(c.start >= 60 && c.start <= 61);
});

test('разные времена не подтверждают друг друга', async () => {
    const { consensus } = await load();
    assert.strictEqual(consensus([report('a', 60, 150), report('b', 200, 290), report('c', 400, 490)]), null);
});

test('большая группа важнее мусорного сообщения', async () => {
    const { consensus } = await load();
    const c = consensus([report('spam1', 500, 590), report('spam2', 500, 590), report('a', 60, 150), report('b', 60, 150), report('c', 61, 150)]);
    assert.strictEqual(c.people, 3);
    assert.ok(c.start < 100);
});

test('проверка сообщения отбрасывает странные данные', async () => {
    const { validateReport } = await load();
    const good = { id: 1, episode: '3', voice: 'JAM', part: 'op', duration: 1440, start: 60, end: 150 };
    assert.ok(validateReport(good));
    assert.strictEqual(validateReport({ ...good, part: 'x' }), null);
    assert.strictEqual(validateReport({ ...good, end: 62 }), null);
    assert.strictEqual(validateReport({ ...good, end: 2000 }), null);
    assert.strictEqual(validateReport({ ...good, id: -1 }), null);
    assert.strictEqual(validateReport({ ...good, episode: 'abc' }), null);
    assert.strictEqual(validateReport(null), null);
});

// ---------- Обработчик запросов ----------

const STORE_ORIGIN = 'chrome-extension://mgcaideibpbdddnbedoefmabladoaajg';
const REPORT = { id: 1, episode: '3', voice: 'JAM', part: 'op', duration: 1421, start: 60, end: 150 };

function makeServer() {
    const rows = [];
    const daily = new Map();
    const prepare = (sql) => ({
        bind: (...args) => ({
            first: async () => {
                if (!/report_daily/.test(sql)) return { n: 0 };
                const key = args.join('|');
                daily.set(key, (daily.get(key) || 0) + 1);
                return { n: daily.get(key) };
            },
            run: async () => {
                if (/report_daily/.test(sql)) return;
                const [id, episode, voice, dur_key, part, reporter, start, end] = args;
                rows.push({ id, episode, voice, dur_key, part, reporter, start, end });
            },
            all: async () => {
                const [id, episode, voice, lo, hi] = args;
                assert.match(sql, /dur_key BETWEEN/);
                return { results: rows.filter(r => r.id === id && r.episode === episode && r.voice === voice && r.dur_key >= lo && r.dur_key <= hi) };
            }
        })
    });
    const store = new Map();
    globalThis.caches = { default: { match: async (r) => store.get(r.url), put: async (r, res) => { store.set(r.url, res); } } };
    return { rows, daily, env: { DB: { prepare }, REPORT_SALT: 'salt' }, ctx: { waitUntil() {} } };
}

const postReport = (body, origin, ip = '1.1.1.1') => new Request('https://x.test/v1/report', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'text/plain', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body)
});

test('отчёт принимается только от расширения, а не от любого сайта', async () => {
    const { default: worker } = await load();
    const { rows, env, ctx } = makeServer();
    // text/plain не требует предварительного запроса, так что заголовков CORS недостаточно: проверяет сам сервер
    assert.strictEqual((await worker.fetch(postReport(REPORT, 'https://evil.example'), env, ctx)).status, 403);
    assert.strictEqual((await worker.fetch(postReport(REPORT), env, ctx)).status, 403);
    assert.strictEqual(rows.length, 0);

    const ok = await worker.fetch(postReport(REPORT, STORE_ORIGIN), env, ctx);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), STORE_ORIGIN);
    assert.strictEqual(rows.length, 1);
});

test('сообщение в поддержку с чужого сайта отклоняется', async () => {
    const { default: worker } = await load();
    const { env, ctx } = makeServer();
    const request = new Request('https://x.test/v1/feedback', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
    assert.strictEqual((await worker.fetch(request, env, ctx)).status, 403);
});

test('предварительный запрос разрешает отправку только расширению', async () => {
    const { default: worker } = await load();
    const { env, ctx } = makeServer();
    const preflight = (origin) => worker.fetch(new Request('https://x.test/v1/report', { method: 'OPTIONS', headers: { Origin: origin } }), env, ctx);
    assert.strictEqual((await preflight(STORE_ORIGIN)).headers.get('Access-Control-Allow-Origin'), STORE_ORIGIN);
    assert.strictEqual((await preflight('https://evil.example')).headers.get('Access-Control-Allow-Origin'), null);
});

test('копия для разработки разрешается настройкой сервера', async () => {
    const { default: worker } = await load();
    const { env, ctx } = makeServer();
    env.EXTRA_EXTENSION_IDS = 'abcdefghijklmnopabcdefghijklmnop';
    assert.strictEqual((await worker.fetch(postReport(REPORT, 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'), env, ctx)).status, 200);
});

test('длины, отличающиеся на секунду, считаются одним видео', async () => {
    const { default: worker } = await load();
    const { env, ctx } = makeServer();
    // 1420,4 и 1421 с попадают в разные группы по 3 с
    await worker.fetch(postReport({ ...REPORT, duration: 1420.4 }, STORE_ORIGIN, '1.1.1.1'), env, ctx);
    await worker.fetch(postReport({ ...REPORT, duration: 1420.4 }, STORE_ORIGIN, '2.2.2.2'), env, ctx);
    await worker.fetch(postReport({ ...REPORT, duration: 1421 }, STORE_ORIGIN, '3.3.3.3'), env, ctx);
    const res = await worker.fetch(new Request('https://x.test/v1/timings?id=1&episode=3&voice=JAM&duration=1421'), env, ctx);
    assert.strictEqual((await res.json()).op.people, 3);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('заметно другая длина остаётся другой версией серии', async () => {
    const { default: worker } = await load();
    const { env, ctx } = makeServer();
    for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3']) await worker.fetch(postReport({ ...REPORT, duration: 1421 }, STORE_ORIGIN, ip), env, ctx);
    const res = await worker.fetch(new Request('https://x.test/v1/timings?id=1&episode=3&voice=JAM&duration=1441'), env, ctx);
    assert.deepStrictEqual(await res.json(), {});
});

test('адреса IPv6 одной сети считаются одним человеком', async () => {
    const { default: worker } = await load();
    const { rows, env, ctx } = makeServer();
    await worker.fetch(postReport(REPORT, STORE_ORIGIN, '2001:db8:1:2:aaaa::1'), env, ctx);
    await worker.fetch(postReport(REPORT, STORE_ORIGIN, '2001:0db8:0001:0002:bbbb:cccc:dddd:eeee'), env, ctx);
    await worker.fetch(postReport(REPORT, STORE_ORIGIN, '2001:db8:1:3::1'), env, ctx);
    const reporters = new Set(rows.map(r => r.reporter));
    assert.strictEqual(reporters.size, 2);
});

test('дневной лимит считает все тайтлы с одного адреса, а другие адреса не задевает', async () => {
    const { default: worker } = await load();
    const { rows, daily, env, ctx } = makeServer();
    const first = await worker.fetch(postReport(REPORT, STORE_ORIGIN), env, ctx);
    assert.strictEqual(first.status, 200);

    const [key] = daily.keys();
    daily.set(key, 1000);
    const over = await worker.fetch(postReport({ ...REPORT, id: 2 }, STORE_ORIGIN), env, ctx);
    assert.strictEqual(over.status, 429);
    assert.strictEqual(rows.length, 1);

    const other = await worker.fetch(postReport({ ...REPORT, id: 2 }, STORE_ORIGIN, '2.2.2.2'), env, ctx);
    assert.strictEqual(other.status, 200);
    assert.strictEqual(rows.length, 2);
});
