// «Случайное аниме» (modules/bg-random.js): фильтры зрителя, сравнение названий и ссылка на нужном сайте
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext } = require('./helpers');

const plain = (value) => JSON.parse(JSON.stringify(value));

/** pages — ответ Shikimori на любую страницу каталога; siteUrls — что находит поиск на сайтах; animego — выдача поиска AnimeGO */
function load({ pages = [], siteUrls = {}, animego = '', settings = {}, details = {}, screenshots = {} } = {}) {
    const log = { api: [], resolved: [], fetched: [] };
    const session = {};
    const ctx = loadInContext(['modules/shared/sites.js', 'modules/bg-random.js'], {
        URLSearchParams,
        chrome: {
            storage: {
                local: { get: async () => ({ ag_settings: settings }) },
                session: { get: async (keys) => Object.fromEntries(keys.filter(k => k in session).map(k => [k, session[k]])), set: async (o) => { Object.assign(session, o); } }
            }
        },
        absoluteShikiUrl: (url) => (!url ? '' : /^https?:/.test(url) ? url : 'https://shikimori.io' + url),
        fillShikiPosters: async (items, { getRaw }) => { items.forEach(i => { i.poster = getRaw(i) ? 'https://shikimori.io' + getRaw(i) : ''; }); return items; },
        fetchShikimoriApi: async (endpoint) => {
            log.api.push(endpoint);
            const shots = endpoint.match(/^\/api\/animes\/(\d+)\/screenshots$/);
            if (shots) return screenshots[shots[1]] || null;
            const one = endpoint.match(/^\/api\/animes\/(\d+)$/);
            return one ? (details[one[1]] || null) : pages;
        },
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

test('карточка в окне расширения: подробности тайтла, описание без BB-кодов, постер полным адресом', async () => {
    const pages = [{ id: 7, name: 'Seven', russian: 'Семь', kind: 'tv', score: '8.1', aired_on: '2019-04-01', image: { original: '/system/animes/original/7.jpg' } }];
    const details = { 7: { id: 7, episodes: 24, genres: [{ name: 'Action', russian: 'Экшен' }, { name: 'Drama', russian: 'Драма' }],
        description: 'Герой [character=1]Тандзиро[/character] ищет [i]лекарство[/i] для [[сестры]].' } };
    const { ctx } = load({ pages, details });
    const { anime } = plain(await ctx.getRandomAnimeCard({}));
    assert.equal(anime.id, 7);
    assert.equal(anime.russian, 'Семь');
    assert.equal(anime.kindLabel, 'Сериал');
    assert.equal(anime.year, '2019');
    assert.equal(anime.episodes, 24);
    assert.deepEqual(anime.genres, ['Экшен', 'Драма']);
    assert.equal(anime.description, 'Герой Тандзиро ищет лекарство для сестры.');
    assert.equal(anime.poster, 'https://shikimori.io/system/animes/original/7.jpg');
});

test('«Другое» не повторяет показанные тайтлы и не ходит в каталог второй раз', async () => {
    const pages = [1, 2, 3].map(id => ({ id, name: 'N' + id, kind: 'tv', score: '8' }));
    const { ctx, log } = load({ pages });
    for (let i = 0; i < 10; i++) {
        const { anime } = plain(await ctx.getRandomAnimeCard({ exclude: [1, 2] }));
        assert.equal(anime.id, 3);
    }
    const catalogCalls = log.api.filter(e => e.startsWith('/api/animes?')).length;
    const first = plain(await ctx.getRandomAnimeCard({ exclude: [1, 2, 3] }));
    assert.ok([1, 2, 3].includes(first.anime.id), 'все показаны: берём из того же набора');
    assert.equal(log.api.filter(e => e.startsWith('/api/animes?')).length, catalogCalls, 'набор кандидатов взят из памяти');
});

test('карточка: под фильтры ничего не подошло — понятная причина, а не пустая карточка', async () => {
    const { ctx } = load({ pages: [] });
    const got = plain(await ctx.getRandomAnimeCard({}));
    assert.equal(got.anime, null);
    assert.equal(got.reason, 'no_match');
});

test('карточка: Shikimori не ответил — это сбой, а не «под фильтры ничего не подошло»', async () => {
    const { ctx } = load({ pages: null });
    await assert.rejects(ctx.getRandomAnimeCard({}), /unavailable/);
    // Рандом на сайтах ведёт себя как раньше
    const got = plain(await ctx.getRandomShikimoriAnime({ siteId: 'yummyanime_tv' }));
    assert.equal(got.reason, 'no_match');
});

test('карточка: все кадры тайтла полными адресами, без ответа отдельного запроса — кадры из карточки Shikimori', async () => {
    const pages = [{ id: 7, name: 'Seven', kind: 'tv', score: '8' }];
    const shot = (n) => ({ original: `/system/screenshots/original/${n}.jpg`, preview: `/system/screenshots/x332/${n}.jpg` });
    const many = load({ pages, screenshots: { 7: Array.from({ length: 20 }, (_, i) => shot(i)) } });
    const a = plain(await many.ctx.getRandomAnimeCard({})).anime;
    assert.equal(a.screenshots.length, 12, 'не больше дюжины');
    assert.deepEqual(a.screenshots[0], { full: 'https://shikimori.io/system/screenshots/original/0.jpg', thumb: 'https://shikimori.io/system/screenshots/x332/0.jpg' });

    const few = load({ pages, details: { 7: { id: 7, screenshots: [shot(5)] } } });
    assert.equal(plain(await few.ctx.getRandomAnimeCard({})).anime.screenshots[0].full, 'https://shikimori.io/system/screenshots/original/5.jpg');
});
