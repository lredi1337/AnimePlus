// Порядок просмотра франшизы (modules/shared/franchise-core.js) на настоящих ответах Shikimori: tests/fixtures/franchise
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext, read } = require('./helpers');

const { AgFranchise: F } = loadInContext(['modules/shared/franchise-core.js']);
const NOW = 1764000000; // 24.11.2025: всё, что позже или без даты, — анонс
const load = (name) => JSON.parse(read(`tests/fixtures/franchise/${name}.json`));
const order = (name, opts = {}) => F.build(load(name), { now: NOW, ...opts });
const idOf = (data, re) => data.nodes.find(n => re.test(n.name)).id;
const plain = (v) => JSON.parse(JSON.stringify(v));
const names = (o) => plain(F.flatten(o).map(i => i.name));

test('предыстория раньше, даже если вышла позже: «Истории ран» перед «Историями монстров»', () => {
    const o = order('monogatari');
    const main = F.flatten(o).filter(i => i.role === 'main');
    assert.deepEqual(plain(main.slice(0, 4).map(i => i.name)), ['Истории ран. Часть 1: Железная кровь', 'Истории ран. Часть 2: Горячая кровь', 'Истории ран. Часть 3: Холодная кровь', 'Истории монстров']);
    const here = F.flatten(o).find(i => i.here);
    assert.equal(here.name, 'Истории монстров');
    assert.equal(here.num, 4, 'номер по порядку просмотра');
    assert.ok(names(o).indexOf('История кошки: Чёрная глава') < names(o).indexOf('Истории монстров'), 'побочное до основного, если по сюжету раньше');
});

test('клипы, промо-ролики и реклама не показываются нигде', () => {
    for (const name of ['monogatari', 'one-piece', 'naruto', 'attack-on-titan', 'fate']) {
        const o = order(name);
        const all = [...F.flatten(o), ...o.others.flatMap(g => g.items)];
        const data = load(name);
        const hidden = new Set(data.nodes.filter(n => /Клип|Проморолик|Реклама/.test(n.kind)).map(n => n.id));
        assert.ok(hidden.size > 0 || name === 'fate', name);
        assert.ok(all.every(i => !hidden.has(i.id)), name);
    }
});

test('пародии и спин-оффы — в «Других историях», не в порядке просмотра', () => {
    const mono = order('monogatari');
    assert.ok(!names(mono).includes('Давайте учиться манерам вместе'));
    assert.ok(mono.others.some(g => g.items.some(i => i.name === 'Давайте учиться манерам вместе')));
    const fate = order('fate');
    assert.ok(!names(fate).includes('Сегодняшнее меню для Эмии'), 'кулинарный спин-офф не в основной линии');
    assert.ok(fate.others.some(g => g.name === 'Сегодняшнее меню для Эмии'));
});

test('Fate: своя ветка, развилка на пути stay night, остальная вселенная группами', () => {
    const o = order('fate');
    const kinds = o.steps.map(s => (s.type === 'fork' ? 'fork' : s.item.name));
    assert.deepEqual(plain(kinds.slice(0, 2)), ['Судьба/Начало', 'Судьба/Начало: Компиляция']);
    const fork = o.steps.find(s => s.type === 'fork');
    assert.ok(fork, 'развилка есть');
    assert.equal(fork.num, 3, 'после двух сезонов Fate/Zero');
    assert.equal(fork.routes.length, 4);
    const hf = fork.routes.find(r => r.items.some(i => /Прикосновение небес$/.test(i.name)));
    assert.deepEqual(plain(hf.items.map(i => i.name)), ['Судьба/Ночь схватки: Прикосновение небес', 'Судьба/Ночь схватки: Прикосновение небес 2', 'Судьба/Ночь схватки: Прикосновение небес 3']);
    const ubw = fork.routes.find(r => r.items.some(i => i.name === 'Судьба/Ночь схватки: Бесконечный мир клинков'));
    assert.deepEqual(plain(ubw.items.filter(i => i.role === 'main').map(i => i.name)), ['Судьба/Ночь схватки: Бесконечный мир клинков', 'Судьба/Ночь схватки: Бесконечный мир клинков 2']);
    assert.ok(names(o).indexOf('Судьба/Начало: Пожалуйста! Консультация с Айнцберн') < names(o).indexOf('Судьба/Ночь схватки'), 'побочное Zero до развилки');
    // Альтернативные версии другой истории («Прототип», «Странная подделка») не втягиваются в путь stay night
    const sn = fork.routes.find(r => r.items[0].name === 'Судьба/Ночь схватки');
    assert.ok(sn.items.every(i => /^Судьба\/Ночь схватки/.test(i.name)), JSON.stringify(plain(sn.items.map(i => i.name))));
    assert.ok(!names(o).some(n => /Странная подделка|Прототип/.test(n)));
    const illya = o.others.find(g => g.name === 'Судьба/Девочка-волшебница Иллия');
    assert.equal(illya.items.length, 14, '«Иллия» — отдельная история вселенной');
    assert.ok(o.others[0].items.length >= o.others[o.others.length - 1].items.length, 'большие группы первыми');
});

test('«Клинок»: «Бесконечный поезд» — фильм или сериал на выбор; анонсы в конце с пометкой', () => {
    const o = order('kimetsu');
    const fork = o.steps.find(s => s.type === 'fork');
    assert.deepEqual(plain(fork.routes.map(r => r.items.map(i => i.kindLabel))), [['Фильм'], ['Сериал']]);
    const main = F.flatten(o).filter(i => i.role === 'main');
    const last = main.slice(-2);
    assert.ok(last.every(i => i.soon), 'без даты — анонс');
    assert.ok(o.others.some(g => /Урок хороших манер/.test(g.name)));
});

test('пересказы развилку не дают: «Атака титанов» — одна линия, фильмы-пересказы помечены', () => {
    const o = order('attack-on-titan');
    assert.ok(!o.steps.some(s => s.type === 'fork'));
    const items = F.flatten(o);
    assert.equal(items.find(i => i.name === 'Атака титанов: Багровые луки и стрелы').role, 'recap');
    assert.deepEqual(plain(items.filter(i => i.role === 'main').map(i => i.name)), ['Атака титанов', 'Атака титанов 2', 'Атака титанов 3', 'Атака титанов 3. Часть 2', 'Атака титанов: Финал', 'Атака титанов: Финал. Часть 2']);
    assert.equal(o.hidden.recaps, 5);
});

test('«Врата Штейна»: альтернативная концовка ведёт к «Вратам Штейна 0», другие вселенные отдельно', () => {
    const o = order('steins-gate');
    const n = names(o);
    assert.ok(n.indexOf('Врата Штейна: Найти недостающее звено — Деление на ноль') < n.indexOf('Врата Штейна 0'));
    assert.ok(n.indexOf('Врата Штейна') < n.indexOf('Врата Штейна: Найти недостающее звено — Деление на ноль'));
    assert.ok(!n.includes('Вершина хаоса') && !n.includes('Записки о робототехнике'), 'другая вселенная — не продолжение');
});

test('«Наруто»: развилка «Боруто» — фильм или сериал; «Re:Zero»: «Замороженные узы» перед первым сезоном', () => {
    const naruto = order('naruto');
    const fork = naruto.steps.find(s => s.type === 'fork');
    assert.ok(fork.routes.some(r => r.items[0].name === 'Боруто'));
    const rezero = F.flatten(order('rezero')).filter(i => i.role === 'main').map(i => i.name);
    assert.ok(rezero.indexOf('Re:Zero. Жизнь с нуля в альтернативном мире: Замороженные узы') < rezero.indexOf('Re:Zero. Жизнь с нуля в альтернативном мире'));
});

test('«по выходу»: та же ветка плоским списком по дате, без развилок', () => {
    const story = order('fate');
    const release = order('fate', { mode: 'release' });
    assert.equal(release.mode, 'release');
    assert.ok(!release.steps.some(s => s.type === 'fork'));
    assert.deepEqual(plain(F.flatten(release).map(i => i.id)).sort(), plain(F.flatten(story).map(i => i.id)).sort(), 'те же тайтлы');
    assert.equal(F.flatten(release)[0].name, 'Судьба/Ночь схватки', 'первым вышел stay night 2006');
    const main = F.flatten(release).filter(i => i.role === 'main');
    assert.deepEqual(plain(main.map(i => i.num)), plain(main.map((_, i) => i + 1)));
});

test('текущий тайтл в середине ветки: та же ветка, отметка «вы здесь» на нём', () => {
    const data = load('fate');
    const hf2 = idOf(data, /Прикосновение небес 2$/);
    const o = order('fate', { current: hf2 });
    assert.equal(F.flatten(o).filter(i => i.here).length, 1);
    assert.equal(F.flatten(o).find(i => i.here).id, hf2);
    assert.ok(o.steps.some(s => s.type === 'fork'), 'развилка видна и с пути');
});

test('одиночный тайтл и пустой ответ: блока нет', () => {
    assert.equal(F.build({ nodes: [{ id: 1, name: 'Один', kind: 'TV Сериал', year: 2020, date: 1 }], links: [], current_id: 1 }, { now: NOW }), null);
    assert.equal(F.build(null), null);
    assert.equal(F.build({ nodes: [], links: [] }), null);
    assert.equal(F.build(load('monogatari'), { current: 999999999 }), null, 'текущего нет в ответе');
});

test('«Тетрадь смерти»: сериал и рекап — франшиза из двух', () => {
    const o = order('death-note');
    assert.deepEqual(plain(F.flatten(o).map(i => [i.role, i.num])), [['main', 1], ['recap', 0]]);
});

test('порча в ответе не ломает: странные id, ссылки на несуществующее, цикл продолжений', () => {
    const data = {
        current_id: 1,
        nodes: [
            { id: 1, name: 'А', kind: 'TV Сериал', year: 2010, date: 10 },
            { id: 2, name: 'Б', kind: 'TV Сериал', year: 2011, date: 20 },
            { id: 'x', name: 'мусор', kind: 'TV Сериал' },
            { id: 3, name: 'В', kind: 'Фильм', year: null, date: null }
        ],
        links: [
            { source_id: 1, target_id: 2, relation: 'sequel' },
            { source_id: 2, target_id: 1, relation: 'sequel' },
            { source_id: 2, target_id: 3, relation: 'sequel' },
            { source_id: 1, target_id: 77, relation: 'sequel' }
        ]
    };
    const o = F.build(data, { now: NOW });
    assert.deepEqual(names(o), ['А', 'Б', 'В']);
    assert.ok(F.flatten(o)[2].soon);
});

test('шум в данных: спецвыпуск называет фильм-продолжение «побочной историей» — фильм остаётся основным', () => {
    const o = order('princess-principal');
    const main = F.flatten(o).filter(i => i.role === 'main').map(i => i.name);
    assert.ok(main.includes('Принцесса-шпионка: Укротитель короны 2'), '«Укротитель короны 2» — продолжение, а не побочное');
    assert.deepEqual(plain(main.filter(n => /Укротитель короны( \d)?$/.test(n))), [
        'Принцесса-шпионка: Укротитель короны', 'Принцесса-шпионка: Укротитель короны 2', 'Принцесса-шпионка: Укротитель короны 3',
        'Принцесса-шпионка: Укротитель короны 4', 'Принцесса-шпионка: Укротитель короны 5', 'Принцесса-шпионка: Укротитель короны 6'
    ]);
    const nums = F.flatten(o).filter(i => i.role === 'main').map(i => i.num);
    assert.deepEqual(plain(nums), plain(nums.map((_, i) => i + 1)), 'номера подряд');
});
