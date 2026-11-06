// Поиск тайтла на сайтах из реестра (modules/bg-sites.js) — код service worker в песочнице vm.
// HTML/JSON — снимки реальных страниц поиска (tests/fixtures).
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext, read } = require('./helpers');

function makeBackground({ fetchMap = {}, shikimori = null } = {}) {
    const session = {};
    const fetched = [];
    const ctx = loadInContext(['modules/shared/sites.js', 'modules/shared/title-match.js', 'modules/bg-sites.js'], {
        fetch: async (url) => {
            fetched.push(url);
            const key = Object.keys(fetchMap).find(k => url.includes(k));
            if (!key) return { ok: false, text: async () => '', json: async () => ({}) };
            const body = fetchMap[key];
            return { ok: true, text: async () => body, json: async () => JSON.parse(body) };
        },
        chrome: { storage: { session: { get: async (keys) => ({ [keys[0]]: session[keys[0]] }) } } },
        fetchShikimoriApi: async () => shikimori,
        updateStorageObject: async (key, mutator) => { session[key] = session[key] || {}; await mutator(session[key]); },
        findJutsuDirectUrl: async () => null,
        findAnimeGoDirectUrl: async () => null
    });
    return { ctx, fetched };
}

const DLE_SEARCH = [
    ['yummyanime_tv', 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-r1.html'],
    ['animego_online', 'https://animego.online/6003-monolog-farmacevta-3-sezon-o1.html'],
    ['yammy_club', 'https://yammyanime.club/catalog/item/monolog-farmacevta-3-sezon-c1']
];

for (const [siteId, expected] of DLE_SEARCH) {
    test(`${siteId}: разбор выдачи поиска без DOM (service worker)`, () => {
        const { ctx } = makeBackground();
        const site = ctx.AgSites.byId(siteId);
        const cards = ctx.parseDleSearchCards(read(`tests/fixtures/${siteId}-search.html`), site);
        assert.ok(cards.length >= 4, `карточек: ${cards.length}`);
        assert.ok(cards.every(c => c.title && c.href.startsWith(site.home)), 'у всех карточек есть название и ссылка сайта');
        assert.ok(cards.some(c => c.href === expected), 'есть 3-й сезон');
        assert.equal(new Set(cards.map(c => c.href)).size, cards.length, 'дубликаты объединены');
    });

    test(`${siteId}: resolveSiteUrl находит 3-й сезон по названиям из Shikimori`, async () => {
        const { ctx, fetched } = makeBackground({
            fetchMap: { 'do=search': read(`tests/fixtures/${siteId}-search.html`) },
            shikimori: { name: 'Kusuriya no Hitorigoto 3rd Season', russian: 'Монолог фармацевта 3 сезон', english: [], aired_on: '2026-10-01' }
        });
        const url = await ctx.resolveSiteUrl(siteId, { shikimoriId: 61987 });
        assert.equal(url, expected);
        assert.ok(fetched.some(u => u.includes(ctx.AgSites.byId(siteId).dle.searchPath)));
    });
}

test('yani: точное совпадение по ID Shikimori, а не по названию', async () => {
    const { ctx } = makeBackground({ fetchMap: { '/api/search': read('tests/fixtures/yani-api-search.json') } });
    // По названию «Фрирен» подходят 4 тайтла — ID однозначно выбирает 2-й сезон
    const url = await ctx.resolveSiteUrl('yummy_ru', { titles: ['Провожающая в последний путь Фрирен'], year: '2026', shikimoriId: 59978 });
    assert.equal(url, 'https://ru.yummyani.me/catalog/item/provozhayuschaya-v-posledniy-put-friren-2');
});

test('yani: неизвестный ID → null (без угадывания по названию)', async () => {
    const { ctx } = makeBackground({ fetchMap: { '/api/search': read('tests/fixtures/yani-api-search.json') } });
    const url = await ctx.resolveSiteUrl('yummy_old', { titles: ['Провожающая в последний путь Фрирен'], year: '2023', shikimoriId: 999999 });
    assert.equal(url, null);
});

test('resolveAllSites: результат по каждому сайту, отрицательный кэшируется', async () => {
    const { ctx, fetched } = makeBackground({ fetchMap: { '/api/search': read('tests/fixtures/yani-api-search.json') } });
    const query = { titles: ['Провожающая в последний путь Фрирен'], year: '2023', shikimoriId: 52991 };
    const results = await ctx.resolveAllSites(query, { siteIds: ['yummy_ru', 'yummy_old'] });
    assert.deepEqual(JSON.parse(JSON.stringify(results.map(r => [r.siteId, r.url]))), [
        ['yummy_ru', 'https://ru.yummyani.me/catalog/item/provozhayushchaya-posledniy-put-friren'],
        ['yummy_old', 'https://old.yummyani.me/catalog/item/provozhayushchaya-posledniy-put-friren']
    ]);
    const before = fetched.length;
    await ctx.resolveAllSites(query, { siteIds: ['yummy_ru', 'yummy_old'] });
    assert.equal(fetched.length, before, 'повторный запрос обслуживается из кэша');
});

test('сбой сети: результат помечается как «нет ответа» и не запоминается', async () => {
    const session = {};
    const ctx = loadInContext(['modules/shared/sites.js', 'modules/shared/title-match.js'], {
        fetch: async () => { throw new Error('network'); },
        fetchShikimoriApi: async () => null,
        updateStorageObject: async (key, fn) => { const obj = session[key] || {}; fn(obj); session[key] = obj; },
        chrome: { storage: { session: { get: async () => ({}), set: async () => {} } } },
        findJutsuDirectUrl: async () => null,
        findAnimeGoDirectUrl: async () => null
    });
    require('node:vm').runInContext(`${read('modules/bg-sites.js')};globalThis.resolveAll = resolveAllSites;`, ctx);
    const [res] = await ctx.resolveAll({ titles: ['Наруто'], year: '2002' }, { siteIds: ['yummy_ru'], timeoutMs: 1000 });
    assert.equal(res.url, null);
    assert.equal(res.timedOut, true);
    assert.equal(session.ag_site_url_cache, undefined);
});

// AnimeVost: API приложений (api.animetop.info), ответы сняты с настоящего API и сокращены
function makeVost({ answers, shikimori = null, home = 'https://v14.vost.pw' }) {
    const queries = [];
    const session = {};
    const ctx = loadInContext(['modules/shared/sites.js', 'modules/shared/title-match.js', 'modules/bg-sites.js'], {
        URLSearchParams,
        fetch: async (url, init) => {
            const name = new URLSearchParams(init.body).get('name');
            queries.push({ url, method: init.method, name });
            if (answers === 'down') throw new Error('network');
            const data = answers[name];
            return { ok: true, json: async () => (data ? { data } : { error: 'Ничего не найдено' }) };
        },
        chrome: { storage: { session: { get: async () => ({}) }, local: { get: async () => ({ ag_site_home: { animevost: home } }) } } },
        fetchShikimoriApi: async () => shikimori,
        updateStorageObject: async (key, mutator) => { session[key] = session[key] || {}; await mutator(session[key]); }
    });
    return { ctx, queries };
}

const ICEBLADE = [
    { id: 2907, year: '2023', title: 'Волшебник ледяного клинка правит миром / Hyouken no Majutsushi ga Sekai wo Suberu [1-12 из 12]' },
    { id: 4020, year: '2026', title: 'Волшебник ледяного клинка правит миром (второй сезон) / Hyouken no Majutsushi ga Sekai wo Suberu II [1-5 из 12+] [6 серия - 12 ноября]' }
];

test('AnimeVost: поиск по латинскому названию, нужный сезон, адрес на рабочем зеркале', async () => {
    const { ctx, queries } = makeVost({ answers: { 'Hyouken no Majutsushi ga Sekai wo Suberu II': ICEBLADE, 'Hyouken no Majutsushi ga Sekai wo Suberu': ICEBLADE } });
    const second = await ctx.resolveSiteUrl('animevost', { titles: ['Волшебник ледяного клинка правит миром 2', 'Hyouken no Majutsushi ga Sekai wo Suberu II'], year: '2026', shikimoriId: 1 });
    assert.equal(second, 'https://v14.vost.pw/index.php?newsid=4020');
    assert.ok(queries.every(q => q.url === 'https://api.animetop.info/v1/search' && q.method === 'POST' && !/[а-яё]/i.test(q.name)), 'русские названия API не находит, их не отправляем');
    const first = await ctx.resolveSiteUrl('animevost', { titles: ['Волшебник ледяного клинка правит миром', 'Hyouken no Majutsushi ga Sekai wo Suberu'], year: '2023', shikimoriId: 2 });
    assert.equal(first, 'https://v14.vost.pw/index.php?newsid=2907');
});

test('AnimeVost: тайтл под английским названием находится через названия Shikimori', async () => {
    const { ctx } = makeVost({
        answers: { 'Attack on Titan': [{ id: 587, year: '2013', title: 'Вторжение Гигантов ОВА / Attack on Titan OVA [1-5 из 5]' }, { id: 58, year: '2013', title: 'Вторжение Гигантов / Attack on Titan [1-25 из 25]' }] },
        shikimori: { english: ['Attack on Titan'], synonyms: ['AoT'] }
    });
    const url = await ctx.resolveSiteUrl('animevost', { titles: ['Атака титанов', 'Shingeki no Kyojin'], year: '2013', shikimoriId: 16498 });
    assert.equal(url, 'https://v14.vost.pw/index.php?newsid=58');
});

test('AnimeVost: API недоступен — это не «тайтла нет»', async () => {
    const { ctx } = makeVost({ answers: 'down' });
    await assert.rejects(ctx.searchVostSite(ctx.AgSites.byId('animevost'), { titles: ['Sousou no Frieren'], year: '2023' }));
});

test('AnimeVost есть в списке сайтов, где ищется тайтл', () => {
    const { ctx } = makeVost({ answers: {} });
    assert.ok(ctx.AgSites.searchable().some(s => s.id === 'animevost'));
});
