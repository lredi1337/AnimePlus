// Каталог подбора (tools/build-pick-catalog.js): что попадает в каталог и как убираются продолжения
const test = require('node:test');
const assert = require('node:assert/strict');
const { toItem, onePerFranchise, sequelBase, pack, posterPath, fetchAll, FIELDS } = require('../tools/build-pick-catalog.js');

const anime = (over = {}) => ({
    id: '16498', name: 'Shingeki no Kyojin', russian: 'Атака титанов', kind: 'tv', rating: 'r', score: 8.58,
    episodes: 25, episodesAired: 25, status: 'released', franchise: 'shingeki_no_kyojin', airedOn: { year: 2013 },
    poster: { previewUrl: 'https://shikimori.io/uploads/poster/animes/16498/preview-abc.webp' },
    genres: [{ id: '1', russian: 'Экшен', kind: 'genre' }, { id: '8', russian: 'Драма', kind: 'genre' }],
    studios: [{ name: 'Wit Studio' }],
    statusesStats: [{ status: 'completed', count: 300 }, { status: 'planned', count: 20 }],
    ...over
});

test('тайтл в каталоге: зрители всех статусов, путь постера без адреса сайта, жанры числами', () => {
    const it = toItem(anime());
    assert.equal(it.id, 16498);
    assert.equal(it.viewers, 320);
    assert.equal(it.poster, '16498/preview-abc.webp');
    assert.deepEqual(it.genres, [1, 8]);
    assert.equal(it.studio, 'Wit Studio');
    assert.equal(it.year, 2013);
});

test('онгоинг без известного числа серий берёт вышедшие', () => {
    assert.equal(toItem(anime({ episodes: 0, episodesAired: 7, status: 'ongoing' })).eps, 7);
});

test('в каталог не попадают анонсы, клипы и спешлы, хентай и эротика', () => {
    assert.equal(toItem(anime({ status: 'anons' })), null);
    assert.equal(toItem(anime({ kind: 'music' })), null);
    assert.equal(toItem(anime({ kind: 'special' })), null);
    assert.equal(toItem(anime({ rating: 'rx' })), null);
    assert.equal(toItem(anime({ genres: [{ id: '539', russian: 'Эротика' }] })), null);
    assert.ok(toItem(anime({ kind: 'movie' })));
});

test('от франшизы остаётся самая популярная часть', () => {
    const list = onePerFranchise([
        { id: 1, en: 'A', franchise: 'a', viewers: 100 },
        { id: 2, en: 'A Movie', franchise: 'a', viewers: 300 },
        { id: 3, en: 'B', franchise: '', viewers: 200 }
    ]);
    assert.deepEqual(list.map(x => x.id), [2, 3]);
});

test('продолжение без франшизы узнаётся по названию, если начало есть в каталоге', () => {
    const list = onePerFranchise([
        { id: 1, en: 'Seihantai na Kimi to Boku', franchise: '', viewers: 200 },
        { id: 2, en: 'Seihantai na Kimi to Boku 2nd Season', franchise: '', viewers: 100 },
        { id: 3, en: 'Medalist 2nd Season', franchise: '', viewers: 90 },
        { id: 4, en: 'White Album 2', franchise: '', viewers: 80 }
    ]);
    assert.deepEqual(list.map(x => x.id), [1, 3, 4], 'без начала в каталоге продолжение остаётся');
});

test('пометки продолжения', () => {
    assert.equal(sequelBase('Ao Ashi Season 2'), 'ao ashi');
    assert.equal(sequelBase('Katainaka no Ossan, Kensei ni Naru II'), 'katainaka no ossan, kensei ni naru');
    assert.equal(sequelBase('Isekai Nonbiri Nouka 2'), 'isekai nonbiri nouka');
    assert.equal(sequelBase('Shingeki no Kyojin'), null);
    assert.equal(sequelBase('Tokyo Magnitude 8.0'), 'tokyo magnitude 8', 'ложная пометка безвредна: такого начала в каталоге нет');
});

test('упаковка: поля один раз, тайтлы массивами в том же порядке', () => {
    const it = toItem(anime());
    const out = pack([it], { 1: 'Экшен' }, '2026-11-23');
    assert.deepEqual(out.fields, FIELDS);
    assert.equal(out.items[0][FIELDS.indexOf('ru')], 'Атака титанов');
    assert.equal(out.built, '2026-11-23');
    assert.equal(posterPath('https://x/other.png'), '');
});

test('загрузка: страницы, пока Shikimori отдаёт полные, жанры собираются по пути', async () => {
    const pages = [Array(50).fill(anime()), [anime({ id: '2', genres: [{ id: '4', russian: 'Комедия' }] })]];
    const calls = [];
    const { raw, genres } = await fetchAll(1000, async (q, v) => { calls.push(v.page); return { animes: pages[v.page - 1] || [] }; }, 0);
    assert.deepEqual(calls, [1, 2]);
    assert.equal(raw.length, 51);
    assert.equal(genres[4], 'Комедия');
});
