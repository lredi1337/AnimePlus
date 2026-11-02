// Общая база таймингов: когда метка становится общей и какие сообщения отбрасываются
const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../server/timings/src/index.js');
const report = (reporter, start, end) => ({ reporter, start, end });

test('один человек не создаёт общую метку', async () => {
    const { consensus } = await load();
    assert.strictEqual(consensus([report('a', 60, 150), report('a', 60, 150)]), null);
});

test('двое с одинаковым временем создают метку, разброс внутри допуска', async () => {
    const { consensus } = await load();
    const c = consensus([report('a', 60, 150), report('b', 61, 151)]);
    assert.strictEqual(c.people, 2);
    assert.ok(c.start >= 60 && c.start <= 61);
});

test('разные времена не подтверждают друг друга', async () => {
    const { consensus } = await load();
    assert.strictEqual(consensus([report('a', 60, 150), report('b', 200, 290)]), null);
});

test('большая группа важнее мусорного сообщения', async () => {
    const { consensus } = await load();
    const c = consensus([report('spam1', 500, 590), report('spam2', 500, 590), report('a', 60, 150), report('b', 60, 150), report('c', 61, 150)]);
    assert.strictEqual(c.people, 3);
    assert.ok(c.start < 100);
});

test('проверка сообщения отбрасывает странные данные', async () => {
    const { validateReport } = await load();
    const good = { id: 1, episode: '3', voice: 'JAM', part: 'op', duration: 1440, start: 60, end: 150 };
    assert.ok(validateReport(good));
    assert.strictEqual(validateReport({ ...good, part: 'x' }), null);
    assert.strictEqual(validateReport({ ...good, end: 62 }), null);
    assert.strictEqual(validateReport({ ...good, end: 2000 }), null);
    assert.strictEqual(validateReport({ ...good, id: -1 }), null);
    assert.strictEqual(validateReport({ ...good, episode: 'abc' }), null);
    assert.strictEqual(validateReport(null), null);
});
