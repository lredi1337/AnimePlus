// Франшиза в фоне (modules/bg-franchise.js): сжатый ответ Shikimori, постеры, память на неделю, ошибки сети не запоминаются
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext, read } = require('./helpers');

const plain = (v) => JSON.parse(JSON.stringify(v));
const MONO = JSON.parse(read('tests/fixtures/franchise/monogatari.json'));

function load({ answer = () => MONO } = {}) {
    const store = {};
    const log = { api: [], posters: [] };
    const ctx = loadInContext(['modules/bg-cache.js', 'modules/bg-franchise.js'], {
        chrome: {
            storage: {
                local: {
                    get: async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, JSON.parse(JSON.stringify(store[k]))])),
                    set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); }
                }
            }
        },
        fetchShikimoriApi: async (endpoint) => { log.api.push(endpoint); return answer(endpoint); },
        getShikiPosters: async (ids) => { log.posters.push(ids.length); return Object.fromEntries(ids.map(id => [id, `https://shikimori.io/p/${id}.jpg`])); }
    });
    return { ctx, store, log };
}

test('ответ сжат до нужного: без клипов и промо-роликов, связи только между оставшимися', async () => {
    const { ctx } = load();
    const res = plain(await ctx.getFranchise(5081));
    const kinds = new Set(res.franchise.nodes.map(n => n.kind));
    assert.ok(!kinds.has('Клип') && !kinds.has('Проморолик'));
    assert.equal(res.franchise.nodes.length, MONO.nodes.length - 4);
    assert.deepEqual(Object.keys(res.franchise.nodes[0]).sort(), ['date', 'id', 'kind', 'name', 'year']);
    const ids = new Set(res.franchise.nodes.map(n => n.id));
    assert.ok(res.franchise.links.every(l => ids.has(l.source_id) && ids.has(l.target_id)));
    assert.equal(res.franchise.current_id, 5081);
    assert.equal(Object.keys(res.posters).length, res.franchise.nodes.length, 'постеры ко всем тайтлам');
});

test('франшиза запоминается: повтор и соседний тайтл той же франшизы из памяти — Shikimori не трогаем повторно', async () => {
    const { ctx, log, store } = load();
    await ctx.getFranchise(5081);
    await ctx.getFranchise(5081);
    assert.equal(log.api.length, 1);
    assert.ok(store.ag_franchise_cache['5081'], 'сохранено между запусками фона');
});

test('франшизы нет (один тайтл) — запоминается как «нет»; ошибка сети — не запоминается', async () => {
    const single = load({ answer: () => ({ nodes: [{ id: 1, name: 'Один', kind: 'TV Сериал' }], links: [] }) });
    assert.equal(plain(await single.ctx.getFranchise(1)).franchise, null);
    await single.ctx.getFranchise(1);
    assert.equal(single.log.api.length, 1, '«нет» из памяти');

    let calls = 0;
    const broken = load({ answer: () => { calls++; return null; } });
    assert.equal(plain(await broken.ctx.getFranchise(5)).franchise, null);
    await broken.ctx.getFranchise(5);
    assert.equal(calls, 2, 'после сбоя следующий раз снова спрашиваем Shikimori');
});

test('странный id не уходит в Shikimori', async () => {
    const { ctx, log } = load();
    await ctx.getFranchise('1/../../x');
    assert.equal(plain(await ctx.getFranchise(-3)).reason, 'invalid');
    assert.equal(plain(await ctx.getFranchise('abc')).reason, 'invalid');
    assert.deepEqual(plain(log.api), ['/api/animes/1/franchise'], 'в адрес уходит только число');
});
