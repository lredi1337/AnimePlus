// База песен и общие тайминги в фоне: откуда берётся файл, что считать отсутствием и какой кэш удаляется
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext } = require('./helpers');

const DAY = 24 * 3600 * 1000;

function fakeCaches() {
    const stores = new Map();
    return {
        stores,
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                match: async (key) => { const v = store.get(String(key)); return v === undefined ? undefined : new Response(v); },
                put: async (key, res) => { store.set(String(key), await res.text()); },
                delete: async (key) => store.delete(String(key)),
                keys: async () => [...store.keys()].map(url => ({ url }))
            };
        }
    };
}

function load({ reply, caches = fakeCaches() }) {
    const seen = [];
    const alarms = { created: [], listener: null };
    const ctx = loadInContext(['modules/bg-audio.js'], {
        URLSearchParams, Response, AbortSignal, caches,
        fetch: async (url, options) => { seen.push({ url: String(url), options }); return reply(String(url)); },
        chrome: { alarms: { get: async () => null, create: async (name, info) => { alarms.created.push({ name, info }); }, onAlarm: { addListener: (fn) => { alarms.listener = fn; } } } }
    });
    return { ctx, seen, caches, alarms };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const isConfig = (url) => url.endsWith('config.json');

test('файл песни берётся с GitHub, остальные источники не нужны', async () => {
    const { ctx, seen } = load({ reply: (url) => (isConfig(url) ? json({}) : json({ songs: [1] })) });
    assert.deepEqual(JSON.parse(JSON.stringify(await ctx.getAudioFingerprints(5))), { songs: [1] });
    const file = seen.filter(s => s.url.endsWith('/5.json'));
    assert.equal(file.length, 1);
    assert.ok(file[0].url.includes('raw.githubusercontent.com'));
});

test('отказ GitHub: файл берётся с сайта Cloudflare, затем с jsDelivr', async () => {
    const down = (...hosts) => (url) => {
        if (isConfig(url)) return json({});
        return hosts.some(h => url.includes(h)) ? new Response('', { status: 503 }) : json({ songs: [1] });
    };
    const first = load({ reply: down('raw.githubusercontent') });
    assert.deepEqual(JSON.parse(JSON.stringify(await first.ctx.getAudioFingerprints(5))), { songs: [1] });
    assert.ok(first.seen.some(s => s.url.includes('anime-plus-db') && s.url.endsWith('/5.json')));
    assert.equal(first.seen.some(s => s.url.includes('jsdelivr') && s.url.endsWith('/5.json')), false);
    const second = load({ reply: down('raw.githubusercontent', 'anime-plus-db') });
    assert.deepEqual(JSON.parse(JSON.stringify(await second.ctx.getAudioFingerprints(5))), { songs: [1] });
    assert.ok(second.seen.some(s => s.url.includes('jsdelivr') && s.url.endsWith('/5.json')));
});

test('файл оборвался при загрузке: берётся из следующего источника, а не считается отсутствующим', async () => {
    const { ctx } = load({ reply: (url) => {
        if (isConfig(url)) return json({});
        return url.includes('raw.githubusercontent') ? new Response('{"songs":[1', { status: 200 }) : json({ songs: [2] });
    } });
    assert.deepEqual(JSON.parse(JSON.stringify(await ctx.getAudioFingerprints(5))), { songs: [2] });
});

test('аварийный выключатель читается прямо из репозитория, а не с сайта', async () => {
    const { ctx, seen } = load({ reply: () => json({ audioSkip: false }) });
    await ctx.getRemoteConfig();
    const config = seen.filter(s => isConfig(s.url));
    assert.equal(config.length, 1);
    assert.ok(config[0].url.includes('raw.githubusercontent.com'));
});

test('сбой сети не считается отсутствием файла: остаётся прошлая версия', async () => {
    const { ctx, caches } = load({ reply: () => { throw new Error('offline'); } });
    const store = (await caches.open('ap-audio-fingerprints-v1'));
    await store.put('https://anime-plus.invalid/fingerprints/5', new Response(JSON.stringify({ at: Date.now() - 40 * DAY, data: { songs: [9] } })));
    assert.deepEqual(JSON.parse(JSON.stringify(await ctx.getAudioFingerprints(5))), { songs: [9] });
});

test('посторонний id не уходит в сеть', async () => {
    const { ctx, seen } = load({ reply: () => json({}) });
    assert.equal(await ctx.getAudioFingerprints('../secret'), null);
    assert.equal(seen.length, 0);
});

test('выключатель останавливает базу песен', async () => {
    const { ctx } = load({ reply: () => json({ audioSkip: false }) });
    assert.equal(await ctx.getAudioFingerprints(5), null);
});

test('общая база таймингов убрана: фон не читает и не отправляет тайминги', () => {
    const { ctx } = load({ reply: () => json({}) });
    assert.equal(typeof ctx.getSharedTimings, 'undefined');
    assert.equal(typeof ctx.reportAudioTiming, 'undefined');
});

test('чистка удаляет только давно не нужное, настройки остаются', async () => {
    const { ctx, caches } = load({ reply: () => json({}) });
    const store = await caches.open('ap-audio-fingerprints-v1');
    const key = (name) => `https://anime-plus.invalid/fingerprints/${name}`;
    const now = Date.now();
    await store.put(key('config'), new Response(JSON.stringify({ at: now - 400 * DAY, data: {} })));
    await store.put(key('old'), new Response(JSON.stringify({ at: now - 100 * DAY, data: { songs: [] } })));
    await store.put(key('fresh'), new Response(JSON.stringify({ at: now - DAY, data: { songs: [] } })));
    await store.put(key('shared/1/1/A/400/sent/op'), new Response('1'));
    await store.put(key('broken'), new Response('not json'));

    await ctx.pruneAudioCache(now);

    const left = [...caches.stores.get('ap-audio-fingerprints-v1').keys()].map(k => k.split('/fingerprints/')[1]).sort();
    assert.deepEqual(left, ['config', 'fresh']);
});

test('чистка заведена по будильнику один раз и срабатывает только на него', async () => {
    const { ctx, alarms, caches } = load({ reply: () => json({}) });
    await new Promise(r => setTimeout(r, 5));
    assert.equal(alarms.created.length, 1);
    const store = await caches.open('ap-audio-fingerprints-v1');
    await store.put('https://anime-plus.invalid/fingerprints/old', new Response(JSON.stringify({ at: 1, data: {} })));
    alarms.listener({ name: 'other' });
    await new Promise(r => setTimeout(r, 5));
    assert.equal((await store.keys()).length, 1);
    alarms.listener({ name: alarms.created[0].name });
    await new Promise(r => setTimeout(r, 5));
    assert.equal((await store.keys()).length, 0);
    assert.equal(typeof ctx.pruneAudioCache, 'function');
});
