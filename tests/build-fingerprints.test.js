// Сборка базы песен: очередь тайтлов. Онгоинги и популярное с Shikimori идут первыми, затем всё остальное с AnimeThemes
const test = require('node:test');
const assert = require('node:assert/strict');
const { animeThemesIds, buildQueue } = require('../tools/build-fingerprints.js');

// Ответ /resource страницами: ссылка next ведёт на следующую, у последней её нет
function pages(list, size = 2) {
    const calls = [];
    const json = async (url) => {
        calls.push(url);
        const page = Number((url.match(/page%5Bnumber%5D=(\d+)/) || [])[1] || 1);
        const chunk = list.slice((page - 1) * size, page * size);
        const last = page * size >= list.length;
        return { resources: chunk, links: { next: last ? null : `https://api.animethemes.moe/resource?page%5Bnumber%5D=${page + 1}` } };
    };
    return { json, calls };
}

test('список AnimeThemes: все страницы, только ID MyAnimeList, без повторов и мусора', async () => {
    const { json, calls } = pages([
        { external_id: 5114, site: 'MyAnimeList' },
        { external_id: 1535, site: 'MyAnimeList' },
        { external_id: 5114, site: 'MyAnimeList' },
        { external_id: null, site: 'MyAnimeList' },
        { external_id: 777, site: 'AniList' },
        { external_id: 20, site: 'MyAnimeList' }
    ]);
    const ids = await animeThemesIds(json, 0);
    assert.deepEqual(ids, [5114, 1535, 20]);
    assert.equal(calls.length, 3, 'прошли все страницы по ссылке next');
    assert.match(calls[0], /\/resource\?/);
    assert.match(decodeURIComponent(calls[0]), /filter\[site\]=MyAnimeList/);
    assert.match(decodeURIComponent(calls[0]), /filter\[has\]=anime/);
    assert.match(decodeURIComponent(calls[0]), /page\[size\]=100/);
});

test('список AnimeThemes: сбой сервера не роняет сборку, остаётся очередь с Shikimori', async () => {
    const json = async () => { throw new Error('https://api.animethemes.moe/resource: 503'); };
    assert.deepEqual(await animeThemesIds(json, 0), []);
});

test('очередь: онгоинги, затем топ Shikimori, затем остальное с AnimeThemes от новых к старым, без повторов', () => {
    const queue = buildQueue([60000, 5114], [5114, 1535, 20], [20, 100, 59000, 1535, 30000]);
    assert.deepEqual(queue, [60000, 5114, 1535, 20, 59000, 30000, 100]);
});
