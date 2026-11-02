// Озвучка, выбранная пользователем: запоминание и точный выбор среди похожих названий
const test = require('node:test');
const assert = require('node:assert');

function load() {
    const store = {};
    globalThis.chrome = {
        storage: { local: {
            get: async (key) => ({ [key]: store[key] }),
            set: async (obj) => { Object.assign(store, obj); }
        } }
    };
    delete require.cache[require.resolve('../modules/shared/voice-choice.js')];
    require('../modules/shared/voice-choice.js');
    return globalThis.AgVoiceChoice;
}

const text = (x) => x;

test('выбор запоминается для тайтла без лишнего хвоста в названии', async () => {
    const c = load();
    await c.set('kodik:тайтл', 'AniLibria.TV (24 эп.)');
    assert.strictEqual(await c.get('kodik:тайтл'), 'AniLibria.TV');
    assert.strictEqual(await c.get('kodik:другой'), null);
});

test('новый выбор заменяет старый', async () => {
    const c = load();
    await c.set('k', 'JAM');
    await c.set('k', 'AniDUB');
    assert.strictEqual(await c.get('k'), 'AniDUB');
});

test('одновременные записи не теряются', async () => {
    const c = load();
    await Promise.all([c.set('a', 'JAM'), c.set('b', 'AniDUB')]);
    assert.strictEqual(await c.get('a'), 'JAM');
    assert.strictEqual(await c.get('b'), 'AniDUB');
});

test('точное название важнее похожего', () => {
    const c = load();
    const list = ['AniStar & DEEP (12 эп.)', 'AniStar Многоголосый (12 эп.)', 'AniStar (12 эп.)'];
    assert.strictEqual(c.pick(list, 'AniStar', text), 'AniStar (12 эп.)');
});

test('озвучки нет в этой серии: возвращается null, и работает обычный автовыбор', () => {
    const c = load();
    assert.strictEqual(c.pick(['JAM (4 эп.)', 'AniDUB (4 эп.)'], 'SHIZA Project', text), null);
    assert.strictEqual(c.pick(['JAM'], '', text), null);
});

test('частичное совпадение работает, если точного нет', () => {
    const c = load();
    assert.strictEqual(c.pick(['JAM CLUB (12 эп.)', 'AniDUB'], 'JAM', text), 'JAM CLUB (12 эп.)');
});
