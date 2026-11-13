// Сервер Anime+: письма поддержки и закрытые адреса прежней общей базы таймингов
const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../server/timings/src/index.js');

// Общая база таймингов закрыта 2026-11: расширение с 11.4.1 её не использует, а за неделю она не подтвердила ни одной метки.
// Старые версии ещё обращаются к её адресам и на любой ответ работают как без неё, поэтому база больше не трогается

const STORE_ORIGIN = 'chrome-extension://mgcaideibpbdddnbedoefmabladoaajg';
const REPORT = { id: 1, episode: '3', voice: 'JAM', part: 'op', duration: 1421, start: 60, end: 150 };

/** База, которая падает на любом обращении: закрытые адреса не должны до неё доходить */
function makeServer() {
    const touched = [];
    const prepare = (sql) => { touched.push(sql); throw new Error('база не должна использоваться'); };
    return { touched, env: { DB: { prepare, batch: async () => { touched.push('batch'); } }, REPORT_SALT: 'salt' }, ctx: { waitUntil() {} } };
}

const postReport = (body, origin, ip = '1.1.1.1') => new Request('https://x.test/v1/report', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip, 'Content-Type': 'text/plain', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body)
});

test('чтение таймингов отвечает пустым ответом и не тратит квоту базы', async () => {
    const { default: worker } = await load();
    const { touched, env, ctx } = makeServer();
    for (let id = 1; id <= 50; id++) {
        const res = await worker.fetch(new Request(`https://x.test/v1/timings?id=${id}&episode=${id}&voice=x&duration=1421`), env, ctx);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(await res.json(), {});
        // Старые версии читают ответ из страниц расширения
        assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
    }
    assert.deepStrictEqual(touched, []);
});

test('отчёт от старой версии принимается и выбрасывается, иначе она повторяла бы его при каждом просмотре', async () => {
    const { default: worker } = await load();
    const { touched, env, ctx } = makeServer();
    const res = await worker.fetch(postReport(REPORT, STORE_ORIGIN), env, ctx);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), STORE_ORIGIN);
    assert.deepStrictEqual(touched, []);
});

test('отчёт с чужого сайта по-прежнему отклоняется', async () => {
    const { default: worker } = await load();
    const { touched, env, ctx } = makeServer();
    assert.strictEqual((await worker.fetch(postReport(REPORT, 'https://evil.example'), env, ctx)).status, 403);
    assert.strictEqual((await worker.fetch(postReport(REPORT), env, ctx)).status, 403);
    assert.deepStrictEqual(touched, []);
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

test('форма поддержки работает и в копии, загруженной из папки с GitHub', async () => {
    const { default: worker } = await load();
    const { env, ctx } = makeServer();
    const unpacked = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const preflight = await worker.fetch(new Request('https://x.test/v1/feedback', { method: 'OPTIONS', headers: { Origin: unpacked } }), env, ctx);
    assert.strictEqual(preflight.headers.get('Access-Control-Allow-Origin'), unpacked);
    // Без настроек почты сервер отвечает 503, но не 403: отправителя он пропустил
    const res = await worker.fetch(new Request('https://x.test/v1/feedback', { method: 'POST', headers: { Origin: unpacked }, body: '{}' }), env, ctx);
    assert.strictEqual(res.status, 503);
    assert.strictEqual((await worker.fetch(new Request('https://x.test/v1/feedback', { method: 'POST', headers: { Origin: 'chrome-extension://bad' }, body: '{}' }), env, ctx)).status, 403);
});

test('неизвестный адрес: 404', async () => {
    const { default: worker } = await load();
    const { env, ctx } = makeServer();
    assert.strictEqual((await worker.fetch(new Request('https://x.test/v1/other'), env, ctx)).status, 404);
});

test('схема базы без таблиц общей базы таймингов', () => {
    const schema = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server', 'timings', 'schema.sql'), 'utf8');
    assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS (reports|report_daily) \(/);
    assert.match(schema, /feedback_log/);
});
