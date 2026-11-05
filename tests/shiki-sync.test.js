// Список «Смотрю», очередь отправки прогресса и ограничение запросов к Shikimori (modules/bg-shiki.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext } = require('./helpers');

const DAY = 864e5;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function loadBg({ store = {}, route = () => json({}) } = {}) {
    const local = { shiki_access_token: 't', shiki_token_expires_at: 9999999999, shiki_user: { id: 1 }, ...store };
    const area = (data) => ({
        get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, data[k]])),
        set: async (obj) => { Object.assign(data, obj); },
        remove: async (keys) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete data[k]); }
    });
    const log = { requests: [], requestTimes: [], alarmsCleared: [] };
    const fetchMock = async (url, options = {}) => {
        log.requests.push({ url: String(url), method: options.method || 'GET', body: options.body });
        log.requestTimes.push(Date.now());
        return route(String(url), options);
    };
    const noop = { addListener() {} };
    const ctx = loadInContext(['modules/bg-cache.js', 'modules/bg-shiki.js'], {
        URLSearchParams, AbortController, Response, fetch: fetchMock,
        SHIKI_CREDENTIALS: { client_id: 'client', worker_url: 'https://worker.test' },
        chrome: {
            storage: { local: area(local), session: area({}), onChanged: noop },
            alarms: { create() {}, get: async () => null, clear: async (name) => log.alarmsCleared.push(name), onAlarm: noop },
            runtime: { getManifest: () => ({ version: '0' }), getURL: p => `chrome-extension://x/${p}`, onInstalled: noop, onStartup: noop }
        }
    });
    return { ctx, local, log };
}

test('список длиннее 50 тайтлов приходит целиком, данные запрашиваются частями', async () => {
    const rates = Array.from({ length: 120 }, (_, i) => ({ id: i + 1, target_id: i + 1000, episodes: 1 }));
    const route = (url) => {
        if (url.includes('/api/v2/user_rates')) {
            assert.match(url, /limit=300/);
            return json(rates);
        }
        if (url.includes('/api/animes?ids')) {
            const ids = new URL(url).searchParams.get('ids').split(',').map(Number);
            assert.ok(ids.length <= 50);
            return json(ids.map(id => ({ id, name: `T${id}`, russian: `Т${id}`, image: { original: 'https://x/p.jpg' } })));
        }
        return json({});
    };
    const t = loadBg({ route });
    const res = await t.ctx.getShikiWatchingList('watching');
    assert.equal(res.items.length, 120);
    assert.equal(res.items[119].name, 'T1119');
});

// ---------- Очередь отправки прогресса ----------

function rateServer({ down = () => false } = {}) {
    const saved = [];
    return {
        saved,
        route: (url, options = {}) => {
            if (down()) throw new TypeError('Failed to fetch');
            if (/\/api\/animes\/\d+/.test(url)) return json({ status: 'ongoing', episodes: 0 });
            if (url.includes('user_rates') && (options.method || 'GET') === 'GET') return json([]);
            if (url.includes('user_rates')) {
                const body = JSON.parse(options.body).user_rate;
                saved.push({ id: body.target_id, episodes: body.episodes });
                return json({ id: 1, ...body }, 201);
            }
            return json({});
        }
    };
}

test('нет сети: серия сохраняется и уходит при следующей проверке', async () => {
    let offline = true;
    const server = rateServer({ down: () => offline });
    const t = loadBg({ route: server.route });
    const res = await t.ctx.syncShikiProgress({ shikimoriId: 21, episode: 5, status: 'watching' });
    assert.equal(res.success, false);
    assert.equal(res.queued, true);
    assert.ok(t.local.shiki_sync_queue[21]);

    offline = false;
    await t.ctx.flushShikiSyncQueue();
    assert.deepEqual(server.saved.map(s => ({ id: s.id, episodes: s.episodes })), [{ id: 21, episodes: 5 }]);
    assert.deepEqual(Object.keys(t.local.shiki_sync_queue), []);
});

test('в очереди по тайтлу остаётся самая дальняя серия', async () => {
    const server = rateServer({ down: () => true });
    const t = loadBg({ route: server.route });
    await t.ctx.syncShikiProgress({ shikimoriId: 21, episode: 5, status: 'watching' });
    await t.ctx.syncShikiProgress({ shikimoriId: 21, episode: 3, status: 'watching' });
    assert.equal(t.local.shiki_sync_queue[21].episode, 5);
});

test('сервер всё ещё лежит: запись остаётся в очереди', async () => {
    const server = rateServer({ down: () => true });
    const t = loadBg({ route: server.route });
    await t.ctx.syncShikiProgress({ shikimoriId: 21, episode: 5, status: 'watching' });
    await t.ctx.flushShikiSyncQueue();
    assert.equal(t.local.shiki_sync_queue[21].episode, 5);
});

test('старая запись очереди удаляется без отправки', async () => {
    const server = rateServer();
    const t = loadBg({ route: server.route, store: { shiki_sync_queue: { 21: { shikimoriId: 21, episode: 5, status: 'watching', at: Date.now() - 15 * DAY } } } });
    await t.ctx.flushShikiSyncQueue();
    assert.equal(server.saved.length, 0);
    assert.deepEqual(Object.keys(t.local.shiki_sync_queue), []);
});

test('Shikimori отказал навсегда (не вошли в аккаунт): в очередь не попадает', async () => {
    const t = loadBg({ route: rateServer().route, store: { shiki_access_token: undefined, shiki_user: undefined } });
    const res = await t.ctx.syncShikiProgress({ shikimoriId: 21, episode: 5, status: 'watching' });
    assert.equal(res.reason, 'not_logged_in');
    assert.equal(t.local.shiki_sync_queue, undefined);
});

test('список Shikimori не прочитан: новая запись не создаётся поверх существующей', async () => {
    const posts = [];
    const route = (url, options = {}) => {
        if (url.includes('user_rates') && (options.method || 'GET') === 'GET') return json({}, 500);
        if (url.includes('user_rates')) posts.push(url);
        return json({ status: 'ongoing', episodes: 0 });
    };
    const t = loadBg({ route });
    const res = await t.ctx.syncShikiProgress({ shikimoriId: 21, episode: 5, status: 'watching' });
    assert.equal(posts.length, 0);
    assert.equal(res.queued, true);
});

test('успешная отправка заодно отправляет накопленное', async () => {
    const server = rateServer();
    const t = loadBg({ route: server.route, store: { shiki_sync_queue: { 30: { shikimoriId: 30, episode: 2, status: 'watching', at: Date.now() } } } });
    await t.ctx.syncShikiProgress({ shikimoriId: 21, episode: 5, status: 'watching' });
    await t.ctx.flushShikiSyncQueue();
    assert.deepEqual(server.saved.map(s => s.id).sort(), [21, 30]);
    assert.deepEqual(Object.keys(t.local.shiki_sync_queue), []);
});

// ---------- Ограничение запросов ----------

test('запросы к Shikimori идут с промежутком не меньше 200 мс', async () => {
    const t = loadBg({ route: () => json([]) });
    await Promise.all([1, 2, 3, 4].map(i => t.ctx.fetchShikimoriApi(`/api/animes/${i}`)));
    const gaps = t.log.requestTimes.slice(1).map((time, i) => time - t.log.requestTimes[i]);
    assert.equal(gaps.length, 3);
    for (const gap of gaps) assert.ok(gap >= 195, `промежуток ${gap} мс`);
});

test('ответ 429 повторяется на том же адресе, а не на зеркале', async () => {
    let calls = 0;
    const route = () => {
        calls++;
        return calls === 1 ? json({}, 429) : json({ ok: true });
    };
    const t = loadBg({ route });
    const res = await t.ctx.fetchShikimoriApi('/api/animes/1');
    assert.equal(res.ok, true);
    assert.ok(t.log.requests.every(r => r.url.startsWith('https://shikimori.io/')));
});

// ---------- Следы уведомлений ----------

test('после обновления от уведомлений не остаётся ни будильника, ни данных', async () => {
    const t = loadBg({ store: {
        shiki_aired_seen: { 1: 2 },
        notified_episodes: ['ep_1_2'],
        notified_episodes_history: [{}],
        active_notifications_map: { a: {} },
        ag_settings: { notif_enabled: false, autoNext: false }
    } });
    await t.ctx.removeNotificationLeftovers();
    assert.deepEqual(t.log.alarmsCleared, ['check_new_episodes_alarm']);
    for (const key of ['shiki_aired_seen', 'notified_episodes', 'notified_episodes_history', 'active_notifications_map']) assert.equal(key in t.local, false, key);
    assert.deepEqual(JSON.parse(JSON.stringify(t.local.ag_settings)), { autoNext: false }, 'остальные настройки целы');
});
