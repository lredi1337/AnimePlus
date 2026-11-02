// Запись серии в список Shikimori (updateShikiUserRate из modules/bg-shiki.js): статус и номер серии
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function run({ anime, rate = null, episode, animeFails = false }) {
    const sent = [];
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    const store = { shiki_access_token: 't', shiki_user: { id: 777 }, shiki_token_expires_at: Math.floor(Date.now() / 1000) + 86400 };
    const context = vm.createContext({
        console, URL, URLSearchParams, setTimeout, clearTimeout, AbortController, Date, Math, JSON, Promise,
        chrome: {
            storage: {
                local: { get: async () => ({ ...store }), set: async (v) => { Object.assign(store, v); } },
                onChanged: { addListener() {} }
            },
            alarms: { create() {}, get: async () => null, onAlarm: { addListener() {} } },
            runtime: { onMessage: { addListener() {} }, getManifest: () => ({ version: '0' }) }
        },
        fetch: async (url, options = {}) => {
            const method = options.method || 'GET';
            if (/\/api\/animes\/\d+/.test(url)) {
                if (animeFails) throw new Error('offline');
                return json(anime);
            }
            if (/user_rates/.test(url) && method === 'GET') return json(rate ? [rate] : []);
            if (/user_rates/.test(url)) {
                const body = JSON.parse(options.body).user_rate;
                sent.push({ method, episodes: body.episodes, status: body.status });
                return json({ id: 1, ...body }, 201);
            }
            return json({});
        }
    });
    context.globalThis = context;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'modules', 'bg-shiki.js'), 'utf8'), context);
    context.__args = { shikimoriId: 21, episode, status: 'watching' };
    return vm.runInContext('updateShikiUserRate(__args)', context).then(res => ({ res, sent }));
}

test('онгоинг без числа серий: последняя вышедшая серия не делает тайтл просмотренным', async () => {
    const { sent } = await run({ anime: { status: 'ongoing', episodes: 0, episodes_aired: 7 }, episode: 7 });
    assert.deepEqual(sent, [{ method: 'POST', episodes: 7, status: 'watching' }]);
});

test('онгоинг, ошибочно отмеченный просмотренным, возвращается в «Смотрю»', async () => {
    const { sent } = await run({
        anime: { status: 'ongoing', episodes: 0, episodes_aired: 8 },
        rate: { id: 5, status: 'completed', episodes: 7 },
        episode: 8
    });
    assert.deepEqual(sent, [{ method: 'PUT', episodes: 8, status: 'watching' }]);
});

test('последняя серия вышедшего тайтла: «Просмотрено»', async () => {
    const { sent } = await run({ anime: { status: 'released', episodes: 12 }, episode: 12 });
    assert.deepEqual(sent, [{ method: 'POST', episodes: 12, status: 'completed' }]);
});

test('пересмотр просмотренного тайтла: «Пересматриваю»', async () => {
    const { sent } = await run({ anime: { status: 'released', episodes: 12 }, rate: { id: 5, status: 'completed', episodes: 12 }, episode: 3 });
    assert.deepEqual(sent, [{ method: 'PUT', episodes: 3, status: 'rewatching' }]);
});

test('старая серия не откатывает прогресс: ни записи, ни уведомления', async () => {
    const { res, sent } = await run({ anime: { status: 'released', episodes: 12 }, rate: { id: 5, status: 'watching', episodes: 8 }, episode: 3 });
    assert.equal(res.noop, true);
    assert.deepEqual(sent, []);
});

test('смена статуса «Отложено» на «Смотрю» не уменьшает число серий', async () => {
    const { sent } = await run({ anime: { status: 'released', episodes: 12 }, rate: { id: 5, status: 'on_hold', episodes: 8 }, episode: 3 });
    assert.deepEqual(sent, [{ method: 'PUT', episodes: 8, status: 'watching' }]);
});

test('Shikimori не отдал карточку: серия пишется, тайтл не закрывается', async () => {
    const { sent } = await run({ animeFails: true, episode: 12 });
    assert.deepEqual(sent, [{ method: 'POST', episodes: 12, status: 'watching' }]);
});
