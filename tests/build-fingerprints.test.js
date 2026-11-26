// Сборка базы песен: очередь тайтлов. Онгоинги и популярное с Shikimori идут первыми, затем всё остальное с AnimeThemes
const test = require('node:test');
const assert = require('node:assert/strict');
const { animeThemesIds, buildQueue, themesFromAnime, gqlData, Stopper } = require('../tools/build-fingerprints.js');

// GraphQL animePagination страницами: hasMorePages говорит, есть ли следующая
function pages(list, size = 2) {
    const calls = [];
    const gql = async (query, vars) => {
        calls.push({ query, vars });
        const chunk = list.slice((vars.page - 1) * size, vars.page * size);
        return { animePagination: { paginatorInfo: { hasMorePages: vars.page * size < list.length }, data: chunk } };
    };
    return { gql, calls };
}
const mal = (...ids) => ({ resources: { nodes: ids.map(externalId => ({ externalId, site: 'MAL' })) } });

test('список AnimeThemes: все страницы GraphQL, только ID MyAnimeList, без повторов и мусора', async () => {
    const { gql, calls } = pages([mal(5114), mal(1535), mal(5114), mal(null), mal(), mal(20, 21)]);
    const ids = await animeThemesIds(gql, 0);
    assert.deepEqual(ids, [5114, 1535, 20, 21]);
    assert.equal(calls.length, 3, 'прошли все страницы, пока hasMorePages');
    assert.deepEqual(calls.map(c => c.vars.page), [1, 2, 3]);
    assert.match(calls[0].query, /animePagination/);
    assert.match(calls[0].query, /resources\(site: MAL\)/);
});

test('список AnimeThemes: сбой сервера не роняет сборку, остаётся очередь с Shikimori', async () => {
    const gql = async () => { throw new Error('https://graphql.animethemes.moe/: 503'); };
    assert.deepEqual(await animeThemesIds(gql, 0), []);
});

test('ответ GraphQL с errors при статусе 200 считается ошибкой', () => {
    assert.throws(() => gqlData({ errors: [{ message: 'Cannot query field' }] }), /Cannot query field/);
    assert.deepEqual(gqlData({ data: { a: 1 } }), { a: 1 });
});

test('песни тайтла из GraphQL: только OP и ED со звуком, серии из первой записи', () => {
    const anime = { animethemes: [
        { type: 'OP', slug: 'OP1', animethemeentries: [
            { episodes: '1-14', videos: { nodes: [{ audio: null }, { audio: { link: 'https://a.animethemes.moe/X-OP1.ogg' } }] } },
            { episodes: '15', videos: { nodes: [{ audio: { link: 'https://a.animethemes.moe/X-OP1v2.ogg' } }] } }
        ] },
        { type: 'ED', slug: 'ED1', animethemeentries: [{ episodes: null, videos: { nodes: [{ audio: { link: 'https://a.animethemes.moe/X-ED1.ogg' } }] } }] },
        { type: 'IN', slug: 'IN1', animethemeentries: [{ episodes: '3', videos: { nodes: [{ audio: { link: 'https://a.animethemes.moe/X-IN1.ogg' } }] } }] },
        { type: 'OP', slug: 'OP2', animethemeentries: [{ episodes: '15-26', videos: { nodes: [] } }] }
    ] };
    assert.deepEqual(themesFromAnime(anime), [
        { type: 'OP', slug: 'OP1', episodes: '1-14', audio: 'https://a.animethemes.moe/X-OP1.ogg' },
        { type: 'ED', slug: 'ED1', episodes: '', audio: 'https://a.animethemes.moe/X-ED1.ogg' }
    ]);
    assert.deepEqual(themesFromAnime(undefined), []);
});

test('серии песни из всех записей с тем же звуком: версии ролика с одной песней', () => {
    // «Перерождение дяди» (MAL 49220): ED1 v1 серии 2-7, v2 серия 8, v3 серии 9 и 11, звук один
    const ed = 'https://a.animethemes.moe/IsekaiOjisan-ED1-NCBD1080.ogg';
    const anime = { animethemes: [
        { type: 'ED', slug: 'ED1', animethemeentries: [
            { episodes: '2-7', videos: { nodes: [{ audio: { link: ed } }] } },
            { episodes: '8', videos: { nodes: [{ audio: { link: ed } }] } },
            { episodes: '9, 11', videos: { nodes: [{ audio: { link: ed } }] } },
            { episodes: '12', videos: { nodes: [{ audio: { link: 'https://a.animethemes.moe/X-ED1v4.ogg' } }] } }
        ] }
    ] };
    assert.deepEqual(themesFromAnime(anime), [{ type: 'ED', slug: 'ED1', episodes: '2-7, 8, 9, 11', audio: ed }]);
});

test('сборка останавливается после серии ошибок подряд, успех сбрасывает счёт', () => {
    const s = new Stopper(3);
    s.fail(); s.fail(); s.ok(); s.fail(); s.fail();
    assert.equal(s.stopped, false);
    s.fail();
    assert.equal(s.stopped, true);
});

test('очередь: онгоинги, затем топ Shikimori, затем остальное с AnimeThemes от новых к старым, без повторов', () => {
    const queue = buildQueue([60000, 5114], [5114, 1535, 20], [20, 100, 59000, 1535, 30000]);
    assert.deepEqual(queue, [60000, 5114, 1535, 20, 59000, 30000, 100]);
});
