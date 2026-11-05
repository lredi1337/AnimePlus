// Уведомления о сериях, очередь отправки прогресса и ограничение запросов к Shikimori (modules/bg-shiki.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext, flush } = require('./helpers');

const DAY = 864e5;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function loadBg({ store = {}, route = () => json({}), windows = {} } = {}) {
    const local = { shiki_access_token: 't', shiki_token_expires_at: 9999999999, shiki_user: { id: 1 }, ...store };
    const area = (data) => ({
        get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, data[k]])),
        set: async (obj) => { Object.assign(data, obj); },
        remove: async (keys) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete data[k]); }
    });
    const log = { windows: [], notifications: [], requests: [], requestTimes: [] };
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
            alarms: { create() {}, get: async () => null, onAlarm: noop },
            tabs: { query: async () => [], sendMessage: async () => {}, create() {} },
            runtime: { getManifest: () => ({ version: '0' }), getURL: p => `chrome-extension://x/${p}`, onInstalled: noop, onStartup: noop },
            notifications: { onClicked: noop, onButtonClicked: noop, clear() {}, create: (id, opts) => { log.notifications.push({ id, ...opts }); } },
            windows: {
                getLastFocused: async () => ({ width: 1000, height: 800, left: 0, top: 0, state: 'normal', ...windows.current }),
                create: async (opts) => {
                    if (windows.createFails) throw new Error('нет окна');
                    log.windows.push(opts);
                }
            }
        }
    });
    ctx.findAnimeGoDirectUrl = async () => 'https://animego.me/anime/test-1';
    ctx.findJutsuDirectUrl = async () => null;
    return { ctx, local, log };
}

/** Сервер Shikimori: тайтл id 100 в списке «Смотрю» */
function shiki({ aired = 7, status = 'ongoing', total = 12, watched = 7, nextEpisode = 8, nextAt = Date.now() + 5 * DAY, calendarFails = false } = {}) {
    return (url) => {
        if (url.includes('/api/v2/user_rates')) return json([{ id: 5, target_id: 100, episodes: watched }]);
        if (url.includes('/api/animes?ids')) return json([{ id: 100, russian: 'Тест', name: 'Test', kind: 'tv', status, episodes: total, episodes_aired: aired, image: { original: 'https://x/p.jpg' } }]);
        if (url.includes('/api/calendar')) {
            if (calendarFails) return json({}, 500);
            return json(nextEpisode ? [{ next_episode: nextEpisode, next_episode_at: new Date(nextAt).toISOString(), anime: { id: 100, name: 'Test', russian: 'Тест' } }] : []);
        }
        return json({});
    };
}

const check = async (t, manual = false) => {
    await t.ctx.checkNewEpisodeNotifications(manual);
    await flush();
};

test('серия ещё не вышла: уведомления нет', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki() });
    await check(t);
    assert.equal(t.log.windows.length, 0);
    assert.equal(t.local.shiki_aired_seen[100], 7);
});

test('первая проверка только запоминает вышедшее: при обновлении расширения нет потока окон', async () => {
    const t = loadBg({ route: shiki({ watched: 2 }) });
    await check(t);
    assert.equal(t.log.windows.length, 0);
    assert.equal(t.local.shiki_aired_seen[100], 7);
});

test('вышла новая серия: одно уведомление с верным номером, повторная проверка молчит', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 8, nextEpisode: 9 }) });
    await check(t);
    assert.equal(t.log.windows.length, 1);
    assert.equal(t.local.notified_episodes_history[0].episode, 8);
    assert.equal(t.local.shiki_aired_seen[100], 8);
    await check(t);
    assert.equal(t.log.windows.length, 1);
});

test('в календаре время серии прошло, а счётчик Shikimori отстаёт: серия считается вышедшей', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 7, nextEpisode: 8, nextAt: Date.now() - 3600000 }) });
    await check(t);
    assert.equal(t.local.notified_episodes_history[0].episode, 8);
});

test('последняя серия: тайтла больше нет в календаре, уведомление всё равно приходит', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 11 } }, route: shiki({ status: 'released', aired: 0, total: 12, watched: 11, nextEpisode: 0 }) });
    await check(t);
    assert.equal(t.local.notified_episodes_history[0].episode, 12);
});

test('серия уже просмотрена: уведомления нет, вышедшая запоминается', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 8, watched: 8, nextEpisode: 9 }) });
    await check(t);
    assert.equal(t.log.windows.length, 0);
    assert.equal(t.local.shiki_aired_seen[100], 8);
});

test('календарь не ответил: проверка работает по списку и не откатывает вышедшее', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 8, calendarFails: true }) });
    await check(t);
    assert.equal(t.log.windows.length, 1);
    assert.equal(t.local.shiki_aired_seen[100], 8);
});

test('данные тайтла не пришли: вышедшее не теряется и окна нет', async () => {
    const route = (url) => {
        if (url.includes('/api/animes?ids')) return json([], 500);
        if (url.includes('/api/calendar')) return json([]);
        return shiki()(url);
    };
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route });
    await check(t);
    assert.equal(t.log.windows.length, 0);
    assert.equal(t.local.shiki_aired_seen[100], 7);
});

test('окно уведомления не забирает фокус у видео', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 8, nextEpisode: 9 }) });
    await check(t);
    assert.equal(t.log.windows[0].focused, false);
});

test('браузер в полном экране: вместо окна системное уведомление', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 8, nextEpisode: 9 }), windows: { current: { state: 'fullscreen' } } });
    await check(t);
    assert.equal(t.log.windows.length, 0);
    assert.equal(t.log.notifications.length, 1);
    assert.match(t.log.notifications[0].title, /8/);
});

test('окно не открылось: уведомление не теряется', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 8, nextEpisode: 9 }), windows: { createFails: true } });
    await check(t);
    assert.equal(t.log.notifications.length, 1);
});

test('несуществующий адрес Kodik больше не запрашивается', async () => {
    const t = loadBg({ store: { shiki_aired_seen: { 100: 7 } }, route: shiki({ aired: 8, nextEpisode: 9 }) });
    await check(t);
    assert.equal(t.log.requests.some(r => /kodik/i.test(r.url)), false);
});

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
