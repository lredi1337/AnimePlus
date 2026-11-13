// «Случайное аниме» (modules/bg-random.js): фильтры зрителя, сравнение названий и ссылка на нужном сайте
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext } = require('./helpers');

const plain = (value) => JSON.parse(JSON.stringify(value));

/** pages — ответ Shikimori на любую страницу каталога; siteUrls — что находит поиск на сайтах; animego — выдача поиска AnimeGO */
function load({ pages = [], siteUrls = {}, animego = '', settings = {} } = {}) {
    const log = { api: [], resolved: [], fetched: [] };
    const ctx = loadInContext(['modules/shared/sites.js', 'modules/bg-random.js'], {
        URLSearchParams,
        chrome: { storage: { local: { get: async () => ({ ag_settings: settings }) } } },
        fetchShikimoriApi: async (endpoint) => { log.api.push(endpoint); return pages; },
        resolveSiteUrl: async (siteId, query) => { log.resolved.push({ siteId, ...query }); return siteUrls[query.shikimoriId] || null; },
        findJutsuDirectUrl: async () => null,
        fetch: async (url) => { log.fetched.push(String(url)); return new Response(animego, { status: 200 }); }
    });
    return { ctx, log };
}

test('названия сравниваются без знаков и пометок, а случайное совпадение одного слова не считается', () => {
    const { ctx } = load();
    assert.equal(ctx.isRandomTitleMatch('Стальной алхимик: Братство', 'Стальной алхимик. Братство (TV)'), true);
    assert.equal(ctx.isRandomTitleMatch('Kimetsu no Yaiba', 'kimetsu no yaiba'), true);
    assert.equal(ctx.isRandomTitleMatch('Атака титанов', 'Атака на школу'), false);
    assert.equal(ctx.isRandomTitleMatch('', 'Что угодно'), false);
});

test('фильм не подменяется сериалом с тем же названием, и наоборот', () => {
    const { ctx } = load();
    assert.equal(ctx.isKindCompatible('movie', 'Наруто ТВ сериал'), false);
    assert.equal(ctx.isKindCompatible('movie', 'Наруто фильм'), true);
    assert.equal(ctx.isKindCompatible('tv', 'Наруто OVA'), false);
    assert.equal(ctx.isKindCompatible('tv', 'Наруто TV сериал'), true);
    assert.equal(ctx.isKindCompatible('', 'что угодно'), true);
});

test('порог оценки и типы из настроек попадают в запрос к Shikimori и в отбор', async () => {
    const pages = [
        { id: 1, name: 'A', kind: 'tv', score: '8.4' },
        { id: 2, name: 'B', kind: 'movie', score: '9.0' },
        { id: 3, name: 'C', kind: 'tv', score: '7.1' },
        { id: 4, name: 'D', kind: 'tv', score: '0' }
    ];
    const { ctx, log } = load({ pages });
    const found = plain(await ctx.fetchRandomCandidates(ctx.randomFilters({ random_min_score: 8, random_kinds: ['TV'] })));
    assert.deepEqual([...new Set(found.map(x => x.id))], [1]);
    assert.match(log.api[0], /score=8/);
    assert.match(log.api[0], /kind=tv/);
    // Порог «любая» и все типы: без ограничений в запросе
    assert.deepEqual(plain(ctx.randomFilters({ random_min_score: 'any' })), { minScore: 0, kinds: ['tv', 'movie', 'ona', 'ova', 'special'] });
});

test('на другом сайте берётся тайтл, который там есть, и не тот, что уже открыт', async () => {
    const pages = [{ id: 7, name: 'Seven', russian: 'Семь', kind: 'tv', score: '8' }, { id: 8, name: 'Eight', russian: 'Восемь', kind: 'tv', score: '8' }];
    const { ctx } = load({ pages, siteUrls: { 7: 'https://yummyanime.tv/7-seven.html', 8: 'https://yummyanime.tv/8-eight.html' } });
    for (let i = 0; i < 5; i++) {
        const got = plain(await ctx.getRandomShikimoriAnime({ siteId: 'yummyanime_tv', currentUrl: 'https://yummyanime.tv/7-seven.html' }));
        assert.equal(got.url, 'https://yummyanime.tv/8-eight.html');
        assert.equal(got.id, 8);
    }
});

test('на сайте ничего не нашлось: поиск по названию на этом сайте, а не пустая ссылка', async () => {
    const { ctx } = load({ pages: [{ id: 7, name: 'Seven', russian: 'Семь', kind: 'tv', score: '8' }] });
    const got = plain(await ctx.getRandomShikimoriAnime({ siteId: 'yummyanime_tv' }));
    assert.equal(got.fallback, true);
    assert.match(got.url, /^https:\/\/yummyanime\.tv\/.*%D0%A1%D0%B5%D0%BC%D1%8C/);
});

test('AnimeGO: найденная страница тайтла важнее синтетической, служебные разделы сайта не считаются', async () => {
    const animego = '<a href="/anime/top-100">Семь</a><a href="/anime/sem-123">Семь</a>';
    const { ctx } = load({ pages: [{ id: 7, name: 'Seven', russian: 'Семь', kind: 'tv', score: '8' }], animego });
    const got = plain(await ctx.getRandomShikimoriAnime({ siteId: 'animego' }));
    assert.equal(got.url, 'https://animego.me/anime/sem-123');
    assert.equal(got.foundOnAnimeGO, true);
});
