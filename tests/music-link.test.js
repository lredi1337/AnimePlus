// Окно расширения: кнопка опенинга и эндинга открывает ролик YouTube. Номер песни берётся из нашей базы песен,
// ID ролика находит сервер Anime+, при любом сбое остаётся обычный поиск
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');

const load = () => { const ctx = {}; new Function('globalThis', 'window', read('modules/shared/music-link.js'))(ctx, ctx); return ctx.AgMusic; };

const FMAB = [
    { type: 'OP', slug: 'OP1', episodes: '1-14' }, { type: 'OP', slug: 'OP2', episodes: '15-26' },
    { type: 'OP', slug: 'OP3', episodes: '27-38' }, { type: 'ED', slug: 'ED1', episodes: '1-14' },
    { type: 'ED', slug: 'ED2', episodes: '15-26' }
];

test('песня серии по диапазонам из базы', () => {
    const { pickSong } = load();
    assert.equal(pickSong(FMAB, 'OP', 1).slug, 'OP1');
    assert.equal(pickSong(FMAB, 'OP', 20).slug, 'OP2');
    assert.equal(pickSong(FMAB, 'ED', 26).slug, 'ED2');
    // Серия за последним диапазоном: последняя начавшаяся песня, а не догадка
    assert.equal(pickSong(FMAB, 'ED', 40).slug, 'ED2');
    // Единственная песня без серий (фильм, короткий тайтл)
    assert.equal(pickSong([{ type: 'OP', slug: 'OP', episodes: '' }], 'OP', 5).slug, 'OP');
    assert.equal(pickSong([], 'OP', 1), null);
    assert.equal(pickSong(null, 'OP', 1), null);
    assert.equal(pickSong(FMAB.filter(s => s.type === 'OP'), 'ED', 1), null);
});

test('запрос к YouTube: номер из базы, без базы прежняя догадка по 13 серий', () => {
    const { songQuery } = load();
    assert.equal(songQuery('Fullmetal Alchemist: Brotherhood', 'OP', 20, FMAB[1]), 'Fullmetal Alchemist: Brotherhood opening 2');
    assert.equal(songQuery('Frieren', 'ED', 3, { type: 'ED', slug: 'ED', episodes: '' }), 'Frieren ending 1');
    assert.equal(songQuery('Frieren', 'OP', 14, null), 'Frieren opening 2');
});

test('ID ролика: сервер Anime+, ответ запоминается, сбой даёт null', async () => {
    const AgMusic = load();
    const store = {};
    const storage = { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) };
    const calls = [];
    const fetchFn = async (url) => { calls.push(url); return { ok: true, json: async () => ({ id: 'dmEM-lEreFg' }) }; };
    assert.equal(await AgMusic.videoId('Fullmetal opening 1', { fetch: fetchFn, storage }), 'dmEM-lEreFg');
    assert.match(calls[0], /^https:\/\/animeplus-timings\.ruscadred\.workers\.dev\/v1\/yt\?q=Fullmetal%20opening%201$/);
    assert.equal(await AgMusic.videoId('Fullmetal opening 1', { fetch: fetchFn, storage }), 'dmEM-lEreFg');
    assert.equal(calls.length, 1, 'второй раз из хранилища');

    const down = async () => { throw new Error('offline'); };
    assert.equal(await AgMusic.videoId('Other opening 1', { fetch: down, storage }), null);
    const bad = async () => ({ ok: true, json: async () => ({ id: '"><script>' }) });
    assert.equal(await AgMusic.videoId('Bad opening 1', { fetch: bad, storage }), null);
});

test('ссылки: ролик и запасной поиск', () => {
    const { watchUrl, searchUrl } = load();
    assert.equal(watchUrl('dmEM-lEreFg'), 'https://www.youtube.com/watch?v=dmEM-lEreFg');
    assert.equal(searchUrl('a b&c'), 'https://www.youtube.com/results?search_query=a%20b%26c');
});
