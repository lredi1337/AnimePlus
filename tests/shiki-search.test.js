// Объединённый поиск на AnimeGO: что фон отдаёт по запросу из строки поиска (searchShikimoriAnime из modules/bg-shiki.js)
const test = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { read } = require('./helpers');

function run(list, query = 'Стальной алхимик', { genresDown = false } = {}) {
    const urls = [];
    const context = vm.createContext({
        console, URL, URLSearchParams, setTimeout, clearTimeout, AbortController, Date, Math, JSON, Promise, encodeURIComponent, Array,
        chrome: {
            storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
            alarms: { create() {}, get: async () => null, onAlarm: { addListener() {} } },
            runtime: { onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, getManifest: () => ({ version: '0' }) }
        },
        fetch: async (url, init) => {
            urls.push(url);
            if (list === null) throw new Error('offline');
            // Жанры приходят отдельным запросом GraphQL
            if (url.includes('/api/graphql')) {
                if (genresDown) throw new Error('graphql down');
                const ids = JSON.parse(init.body).query.match(/ids: "([^"]+)"/)[1].split(',');
                return { ok: true, status: 200, json: async () => ({ data: { animes: ids.map(id => ({ id, genres: [{ russian: 'Экшен' }, { russian: 'Драма' }] })) } }) };
            }
            return { ok: true, status: 200, json: async () => list };
        }
    });
    context.globalThis = context;
    vm.runInContext(read('modules/bg-shiki.js'), context);
    context.__q = query;
    return vm.runInContext('searchShikimoriAnime(__q)', context).then(results => ({ results, urls }));
}

const FMA = { id: 5114, russian: 'Стальной алхимик: Братство', name: 'Fullmetal Alchemist: Brotherhood', kind: 'tv', score: '9.09', aired_on: '2009-04-05', image: { original: '/system/animes/original/5114.jpg' } };

test('поиск: поля карточки в разметке AnimeGO, id для синтетической страницы и жанры', async () => {
    const { results, urls } = await run([FMA]);
    assert.match(urls[0], /\/api\/animes\?search=.*&limit=8&censored=true$/);
    const item = JSON.parse(JSON.stringify(results[0]));
    assert.strictEqual(item.id, 5114);
    assert.strictEqual(item.russian, FMA.russian);
    assert.strictEqual(item.name, FMA.name);
    assert.strictEqual(item.year, '2009');
    assert.strictEqual(item.kind, 'tv');
    assert.strictEqual(item.score, '9.09');
    assert.strictEqual(item.poster, 'https://shikimori.io/system/animes/original/5114.jpg');
    assert.deepStrictEqual(item.genres, ['Экшен', 'Драма']);
    assert.strictEqual(item.jutsuUrl, undefined, 'ссылок на Jut-Su больше нет');
});

test('поиск: жанры не пришли — карточки всё равно показываются', async () => {
    const { results } = await run([FMA], 'Стальной алхимик', { genresDown: true });
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual([...results[0].genres], []);
});

test('поиск: клипы и реклама не показываются, без русского названия ищем по оригинальному', async () => {
    const { results } = await run([{ ...FMA, kind: 'music' }, { ...FMA, kind: 'cm' }, { ...FMA, kind: 'pv' }, { ...FMA, russian: '', image: null }]);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].russian, '');
    assert.strictEqual(results[0].poster, '');
});

test('поиск: сбой сети не ломает строку поиска', async () => {
    const { results } = await run(null);
    assert.strictEqual(results.length, 0);
});
