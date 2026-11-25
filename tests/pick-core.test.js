// Подбор аниме вопросами (modules/shared/pick-core.js): веса ответов, выбор вопроса, подборка без клонов, «Не то»
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext } = require('./helpers');

const { AgPick: P } = loadInContext(['modules/shared/pick-core.js']);

// Жанры: 4 комедия, 8 драма, 22 романтика, 1 экшен, 40 психологическое, 36 повседневность, 130 исэкай, 23 школа, 30 спорт
const FIELDS = ['id', 'ru', 'en', 'kind', 'eps', 'year', 'score', 'viewers', 'rating', 'ongoing', 'genres', 'studio', 'poster'];
const ROWS = [
    [1, 'Хит-боевик', 'A', 'tv', 25, 2013, 8.5, 9000, 'r', 0, [1, 8], 'Wit', ''],
    [2, 'Тёмный детектив', 'B', 'tv', 37, 2006, 8.6, 8000, 'r', 0, [7, 40, 117], 'Madhouse', ''],
    [3, 'Школьная комедия', 'C', 'tv', 12, 2025, 7.9, 3000, 'pg_13', 0, [4, 23, 36], 'KyoAni', ''],
    [4, 'Попаданец', 'D', 'tv', 12, 2024, 7.4, 5000, 'pg_13', 0, [130, 4, 10], 'Studio X', ''],
    [5, 'Грустный фильм', 'E', 'movie', 1, 2016, 8.9, 7000, 'pg_13', 0, [22, 8], 'CoMix', ''],
    [6, 'Длинный сёнен', 'F', 'tv', 220, 2002, 8.0, 8500, 'pg_13', 0, [1, 2, 4], 'Pierrot', ''],
    [7, 'Уютная ферма', 'G', 'tv', 12, 2022, 7.8, 900, 'g', 0, [36, 543], 'Studio X', ''],
    [8, 'Спортивная драма', 'H', 'tv', 25, 2018, 8.4, 2000, 'pg_13', 0, [30, 8], 'IG', ''],
    [9, 'Романтика в школе', 'I', 'tv', 12, 2019, 8.1, 6000, 'pg_13', 0, [22, 23, 4], 'A-1', ''],
    [10, 'Малоизвестная загадка', 'J', 'tv', 13, 2021, 8.3, 300, 'pg_13', 0, [7, 36], 'Shaft', ''],
    [11, 'Военная драма', 'K', 'tv', 24, 2020, 8.2, 1500, 'r', 0, [1, 8, 38], 'Wit', ''],
    [12, 'Ещё боевик', 'L', 'tv', 12, 2023, 7.6, 1200, 'pg_13', 0, [1, 8], 'MAPPA', '']
];
const cat = () => P.unpack({ v: 1, fields: FIELDS, genres: { 1: 'Экшен', 8: 'Драма', 4: 'Комедия' }, items: ROWS });
const env = (extra = {}) => ({ year: 2026, stable: { veteran: 'mid' }, recent: new Set(), ...extra });
const plain = (v) => JSON.parse(JSON.stringify(v));
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('каталог: поля по именам, жанры множеством, популярность по числу зрителей от 0 до 1', () => {
    const c = cat();
    const t = c.byId.get(1);
    assert.equal(t.ru, 'Хит-боевик');
    assert.ok(t.genres.has(8));
    assert.equal(t.pop, 1, 'больше всего зрителей');
    assert.equal(c.byId.get(10).pop, 0, 'меньше всего зрителей');
});

test('«Нет» почти убирает тайтл, «Скорее нет» только опускает, «Не важно» ничего не меняет', () => {
    const c = cat();
    const s = P.newState();
    const idx = c.findIndex(t => t.id === 3); // комедия
    s.answers = [{ q: 'comedy', a: 'no' }];
    assert.equal(P.fit(c, s, env())[idx], 0.12);
    s.answers = [{ q: 'comedy', a: 'probno' }];
    assert.equal(P.fit(c, s, env())[idx], 0.45);
    s.answers = [{ q: 'comedy', a: 'skip' }];
    assert.equal(P.fit(c, s, env())[idx], 1);
});

test('тайтлы из списка Shikimori зрителя и отвергнутые в подборку не попадают', () => {
    const c = cat();
    const s = P.newState();
    s.excluded = [2];
    const { list } = P.pickResults(c, s, env({ seen: new Set([1]) }), 8);
    assert.ok(!list.includes(1));
    assert.ok(!list.includes(2));
});

test('подсказки на старте становятся ответами', () => {
    assert.deepEqual(plain(P.newState('short').answers), [{ q: 'short', a: 'yes' }]);
    assert.deepEqual(plain(P.newState('nodark').answers), [{ q: 'dark', a: 'no' }]);
    const surprise = P.newState('surprise');
    assert.equal(surprise.surprise, true);
});

// Темы и формат уже отвечены, опыт известен: дальше идут обычные вопросы «да / нет»
const ready = (answers = []) => ({ ...P.newState(), askedVeteran: true, answers: [{ q: 'themes', a: 'pick', v: [] }, { q: 'format', a: 'pick', v: [] }, ...answers] });

test('первым всегда «Что-то из этого?» с темами, вторым опыт, третьим формат', () => {
    const c = cat();
    const s = P.newState();
    const e = env({ stable: {} });
    assert.equal(P.nextQuestion(c, s, e, () => 0).id, 'themes');
    P.answer(s, P.CHOICES.themes, 'pick', []);
    assert.equal(P.nextQuestion(c, s, e, () => 0).id, 'veteran');
    s.askedVeteran = true;
    s.answers.push({ q: 'comedy', a: 'skip' });
    assert.equal(P.nextQuestion(c, s, e, () => 0).id, 'format');
    assert.ok(P.CHOICES.themes.options.some(o => o.id === 'sport'), 'спорт среди тем');
});

test('формат не спрашивается, если длина уже ясна из подсказки «Что-то короткое»', () => {
    const c = cat();
    const s = P.newState('short');
    P.answer(s, P.CHOICES.themes, 'pick', []);
    s.askedVeteran = true;
    for (let i = 0; i < 20; i++) assert.notEqual(P.nextQuestion(c, s, env(), Math.random).id, 'format');
});

test('выбранная тема потом не спрашивается отдельно, а невыбранная может', () => {
    const c = cat();
    const picked = { ...P.newState(), askedVeteran: true, answers: [{ q: 'themes', a: 'pick', v: ['comedy', 'romance', 'school'] }, { q: 'format', a: 'pick', v: ['movie'] }] };
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add((P.nextQuestion(c, picked, env(), Math.random) || {}).id);
    for (const id of ['comedy', 'romance', 'school', 'short', 'movie', 'long']) assert.ok(!seen.has(id), id);
    // «Ничего конкретного» ничего не закрывает: «Хотите посмеяться?» ещё прозвучит
    const none = { ...P.newState(), askedVeteran: true, answers: [{ q: 'themes', a: 'pick', v: [] }, { q: 'format', a: 'pick', v: [] }] };
    const later = new Set();
    for (let i = 0; i < 60; i++) later.add(P.nextQuestion(c, none, env(), Math.random).id);
    assert.ok(['comedy', 'romance', 'school', 'drama', 'action'].some(id => later.has(id)), [...later].join(','));
});

test('следующий вопрос случайный среди лучших: разные числа дают разные вопросы', () => {
    const c = cat();
    const ids = new Set([0, 0.25, 0.5, 0.75, 0.99].map(r => P.nextQuestion(c, ready([{ q: 'old', a: 'skip' }, { q: 'new', a: 'skip' }]), env(), () => r).id));
    assert.ok(ids.size >= 3, `вопросы: ${[...ids]}`);
});

test('заданные вопросы не повторяются, а вопросы прошлых подборов идут реже', () => {
    const c = cat();
    for (let i = 0; i < 30; i++) assert.notEqual(P.nextQuestion(c, ready([{ q: 'comedy', a: 'yes' }]), env(), Math.random).id, 'comedy');
    // Самый делящий вопрос при r=0 — первый; если он был в прошлый раз, первым будет другой
    const plainId = P.nextQuestion(c, ready(), env(), () => 0).id;
    const withRecent = P.nextQuestion(c, ready(), env({ recent: new Set([plainId]) }), () => 0).id;
    assert.notEqual(withRecent, plainId);
});

test('вопрос про опыт задаётся один раз и только тем, кто на него ещё не ответил', () => {
    const c = cat();
    const s = P.newState();
    P.answer(s, P.CHOICES.themes, 'pick', []);
    assert.equal(P.nextQuestion(c, s, env({ stable: {} }), () => 0).id, 'veteran');
    s.askedVeteran = true;
    assert.notEqual(P.nextQuestion(c, s, env({ stable: {} }), () => 0).id, 'veteran');
    assert.notEqual(P.nextQuestion(c, s, env({ stable: { veteran: 'yes' } }), () => 0).id, 'veteran');
});

test('каждый четвёртый вопрос — «Что из этого понравилось?» с известными и непохожими тайтлами', () => {
    // Четыре группы похожих тайтлов: из каждой — по одному примеру
    const SETS = [[1, 8], [4, 23], [22, 36], [30, 2]];
    const c = P.unpack({ fields: FIELDS, items: Array.from({ length: 40 }, (_, i) => [200 + i, `T${i}`, '', 'tv', 12, 2020, 8, 1000 - i, 'pg_13', 0, SETS[i % 4], '', '']) });
    const s = ready([{ q: 'comedy', a: 'skip' }]);
    const q = P.nextQuestion(c, s, env(), () => 0);
    assert.match(q.id, /^liked:[\d,]+$/);
    assert.ok(q.shown.length >= 3);
    for (const a of q.shown) for (const b of q.shown) if (a !== b) assert.ok(P.similarity(a, b) < 0.34, `${a.ru} и ${b.ru} похожи`);
});

test('«Понравилось»: отмеченное зритель видел — оно уходит из подборки и запоминается; «Назад» возвращает', () => {
    const c = cat();
    const s = P.newState();
    const q = P.question('liked:1,5,7', c);
    P.answer(s, q, 'pick', [1]);
    assert.deepEqual(plain(s.excluded), [1]);
    assert.deepEqual(plain(P.seenInState(s)), [1]);
    const i12 = c.findIndex(t => t.id === 12); // похоже на 1
    const i7 = c.findIndex(t => t.id === 7); // не похоже
    const w = P.fit(c, s, env());
    assert.ok(w[i12] > w[i7]);
    P.undo(s);
    assert.deepEqual(plain(s.excluded), []);
    assert.deepEqual(plain(s.answers), []);
});

test('темы складываются: выбравшему «Спорт» и «Школа» редкий спорт важнее частой школы', () => {
    const c = cat();
    const s = P.newState();
    P.answer(s, P.CHOICES.themes, 'pick', ['sport', 'school']);
    const w = P.fit(c, s, env());
    const at = id => w[c.findIndex(t => t.id === id)];
    assert.ok(at(8) > at(3), 'спортивная драма выше школьной комедии');
    assert.equal(at(1), 0.2, 'ни спорта, ни школы');
});

test('формат — «или»: фильм и короткий сериал подходят одинаково', () => {
    const c = cat();
    const s = P.newState();
    P.answer(s, P.CHOICES.format, 'pick', ['movie', 'shortSeries']);
    const w = P.fit(c, s, env());
    const at = id => w[c.findIndex(t => t.id === id)];
    assert.equal(at(5), 1);
    assert.equal(at(3), 1);
    assert.equal(at(6), 0.2, 'сериал на 220 серий');
});

test('«Для детей» — строгое условие: недетское почти уходит, даже если подходит под другую тему', () => {
    const c = cat();
    const s = P.newState();
    P.answer(s, P.CHOICES.themes, 'pick', ['kids', 'school']);
    const w = P.fit(c, s, env());
    assert.equal(w[c.findIndex(t => t.id === 3)], 0.1, 'школьная комедия с рейтингом pg_13');
    assert.ok(w[c.findIndex(t => t.id === 7)] >= 0.6, 'уютная ферма с рейтингом g остаётся');
});

test('четыре «Не важно» подряд после шестого вопроса — сразу подборка', () => {
    const big = P.unpack({ fields: FIELDS, items: Array.from({ length: 40 }, (_, i) => [100 + i, `T${i}`, '', 'tv', 12, 2020, 8, i, 'pg_13', 0, [i % 2 ? 4 : 8], '', '']) });
    const s = P.newState();
    s.answers = [{ q: 'themes', a: 'pick', v: [] }, { q: 'drama', a: 'prob' }, { q: 'comedy', a: 'skip' }, { q: 'old', a: 'skip' }, { q: 'new', a: 'skip' }];
    assert.equal(P.shouldStop(big, s, env()), false, 'три подряд — ещё нет');
    s.answers.push({ q: 'long', a: 'skip' });
    assert.equal(P.shouldStop(big, s, env()), true);
    // В самом начале четыре пропуска подбор не обрывают: темы и формат зритель часто пропускает
    const early = P.newState();
    early.answers = [{ q: 'themes', a: 'pick', v: [] }, { q: 'comedy', a: 'skip' }, { q: 'format', a: 'pick', v: [] }, { q: 'old', a: 'skip' }];
    assert.equal(P.shouldStop(big, early, env()), false);
});

test('слабые тайтлы (ниже 7) в подборку не попадают, пока есть из чего выбрать', () => {
    const rows = ROWS.map(r => r.slice());
    rows[0][6] = 6.1; // самый популярный, но слабый
    const c = P.unpack({ fields: FIELDS, items: rows });
    const { list, roles } = P.pickResults(c, P.newState(), env(), 6);
    assert.ok(!list.includes(1));
    const hit = c.byId.get(list.find(id => roles[id] === 'hit'));
    assert.ok(!hit || hit.score >= 7.5, 'хит — с хорошей оценкой');
});

test('«Почему вам» не пишет «не как…» и называет выбранные темы', () => {
    const c = cat();
    const s = P.newState();
    P.answer(s, P.CHOICES.themes, 'pick', ['sport']);
    P.answer(s, P.question('liked:1,5,7', c), 'pick', []);
    const why = P.whyFor(c.byId.get(8), s, env(), c);
    assert.ok(why.includes('спорт'));
    assert.ok(!why.some(x => /не как/.test(x)));
});

test('подборка: первым точное попадание, роли разные, тайтлы не повторяются', () => {
    const c = cat();
    const s = P.newState();
    s.answers = [{ q: 'comedy', a: 'yes' }];
    const { list, roles } = P.pickResults(c, s, env(), 6);
    assert.equal(list.length, 6);
    assert.equal(new Set(list).size, 6);
    assert.equal(roles[list[0]], 'top');
    assert.ok(c.byId.get(list[0]).genres.has(4), 'точное попадание — комедия');
    assert.ok(Object.values(roles).includes('hit'));
});

test('«Хит» не идёт против ответов, даже когда подходящих совсем мало', () => {
    const c = cat();
    const s = P.newState();
    // Коротко и без комедии: подходят только фильм и малоизвестная загадка
    s.answers = [{ q: 'short', a: 'yes' }, { q: 'comedy', a: 'no' }];
    const { list, roles } = P.pickResults(c, s, env(), 6);
    const hit = list.find(id => roles[id] === 'hit');
    assert.ok(P.isShort(c.byId.get(hit)), 'хит тоже короткий');
    assert.ok(!list.includes(6), 'сёнен на 220 серий не предлагается как хит');
});

test('добавка к подборке не повторяет показанное', () => {
    const c = cat();
    const s = P.newState();
    const first = P.pickResults(c, s, env(), 4).list;
    const more = P.pickResults(c, s, env(), 4, first).list;
    assert.equal(more.filter(id => first.includes(id)).length, 0);
});

test('«Не то»: причина сдвигает подборку, «Не нравится рисовка» опускает студию', () => {
    const c = cat();
    const s = P.newState();
    P.reject(s, c.byId.get(6), 'long');
    assert.deepEqual(plain(s.rejTweaks), [{ q: 'short', a: 'prob' }]);
    assert.ok(s.excluded.includes(6));
    P.reject(s, c.byId.get(4), 'art');
    assert.deepEqual(plain(s.studios), ['Studio X']);
    const i7 = c.findIndex(t => t.id === 7); // та же студия
    assert.ok(P.fit(c, s, env())[i7] < 1);
    assert.equal(P.reject(s, c.byId.get(1), 'seen'), 'Убрал. Больше не предложу');
});

test('поправки включаются и выключаются, не трогая ответы', () => {
    const s = P.newState();
    s.answers = [{ q: 'comedy', a: 'yes' }];
    P.setTweaks(s, ['funnier', 'shorter']);
    assert.deepEqual(plain(s.tweakOn), ['shorter', 'funnier'], 'порядок как у кнопок');
    assert.equal(s.tweaks.length, 3);
    P.setTweaks(s, []);
    assert.deepEqual(plain(s.tweaks), []);
    assert.equal(s.answers.length, 1);
});

test('«Почему вам» берёт совпавшие ответы', () => {
    const c = cat();
    const s = P.newState();
    s.answers = [{ q: 'comedy', a: 'yes' }, { q: 'dark', a: 'no' }, { q: 'school', a: 'skip' }];
    assert.deepEqual(plain(P.whyFor(c.byId.get(3), s, env(), c)), ['смешное', 'без мрачности']);
});

test('когда подходит мало, подсказка называет условие, без которого найдётся больше', () => {
    const c = cat();
    const s = P.newState();
    s.answers = [{ q: 'sport', a: 'yes' }, { q: 'movie', a: 'yes' }];
    const hint = P.relaxHint(c, s, env());
    assert.ok(hint);
    assert.ok(hint.then > hint.now);
    assert.ok(['спорт', 'фильм'].includes(hint.text));
});

test('пора показывать: подходящих мало или вопросов много; «Удиви меня» короче', () => {
    const c = cat();
    const s = P.newState();
    assert.equal(P.shouldStop(c, s, env()), true, 'в маленьком каталоге подходящих сразу мало');
    const big = P.unpack({ fields: FIELDS, items: Array.from({ length: 40 }, (_, i) => [100 + i, `T${i}`, '', 'tv', 12, 2020, 8, i, 'pg_13', 0, [i % 2 ? 4 : 8], '', '']) });
    assert.equal(P.shouldStop(big, P.newState(), env()), false);
    const surprise = P.newState('surprise');
    for (let i = 0; i < 5; i++) surprise.answers.push({ q: `x${i}`, a: 'skip' });
    assert.equal(P.shouldStop(big, surprise, env()), true);
});

test('похожее: по жанрам, без самого тайтла', () => {
    const c = cat();
    const list = P.similarTo(c, P.newState(), env(), 3, 3);
    assert.ok(!list.includes(3));
    assert.equal(list[0], 9, 'школа и комедия');
});

test('разные запуски с одним rng дают тот же вопрос: выбор зависит только от состояния', () => {
    const c = cat();
    const a = P.nextQuestion(c, P.newState(), env(), seq(0.3)).id;
    const b = P.nextQuestion(c, P.newState(), env(), seq(0.3)).id;
    assert.equal(a, b);
});

test('«Что из этого понравилось?» не повторяет тайтлы прошлых подборов, пока есть из чего выбрать', () => {
    const SETS = [[1, 8], [4, 23], [22, 36], [30, 2]];
    const c = P.unpack({ fields: FIELDS, items: Array.from({ length: 60 }, (_, i) => [300 + i, `T${i}`, '', 'tv', 12, 2020, 8, 1000 - i, 'pg_13', 0, SETS[i % 4], '', '']) });
    const s = ready([{ q: 'comedy', a: 'skip' }]);
    const first = P.nextQuestion(c, s, env(), () => 0);
    const again = P.nextQuestion(c, s, env({ recentLiked: new Set(first.shown.map(y => y.id)) }), () => 0);
    assert.ok(again.liked);
    assert.equal(again.shown.filter(y => first.shown.includes(y)).length, 0, 'ни одного повтора');
    const s2 = { ...s, answers: [...s.answers, { q: first.id, a: 'pick', v: [] }] };
    assert.deepEqual(plain(P.likedShownIn(s2)).sort(), plain(first.shown.map(y => y.id)).sort());
});

test('подборка прошлого раза при тех же ответах уходит ниже', () => {
    const c = cat();
    const s = P.newState();
    s.answers = [{ q: 'comedy', a: 'prob' }];
    const first = P.pickResults(c, s, env(), 4).list;
    const next = P.pickResults(c, s, env({ recentShown: new Set(first) }), 4).list;
    assert.ok(next.filter(id => first.includes(id)).length < first.length, `${first} → ${next}`);
    assert.notEqual(next[0], first[0], 'первым — другой тайтл');
});

test('с перемешиванием одни и те же ответы дают разную подборку, но только из подходящего', () => {
    const SETS = [[4, 23], [4, 36], [4, 22], [8, 1]];
    const c = P.unpack({ fields: FIELDS, items: Array.from({ length: 40 }, (_, i) => [400 + i, `T${i}`, '', 'tv', 12, 2020, 8, 1000 - i, 'pg_13', 0, SETS[i % 4], '', '']) });
    const s = P.newState();
    s.answers = [{ q: 'comedy', a: 'yes' }];
    const lists = [0.1, 0.5, 0.9, 0.3].map(x => { let k = x; return P.pickResults(c, s, env(), 6, [], () => { k = (k * 7.13 + 0.37) % 1; return k; }).list; });
    assert.ok(new Set(lists.map(l => l.join())).size > 1, 'подборки различаются');
    for (const l of lists) assert.ok(l.slice(0, 4).every(id => c.byId.get(id).genres.has(4)), 'первые — комедии');
    assert.deepEqual(plain(P.pickResults(c, s, env(), 6).list), plain(P.pickResults(c, s, env(), 6).list), 'без rng — одинаково');
});

test('два «не важно» подряд — сразу «Что из этого понравилось?», не дожидаясь четвёртого вопроса', () => {
    const SETS = [[1, 8], [4, 23], [22, 36], [30, 2]];
    const c = P.unpack({ fields: FIELDS, items: Array.from({ length: 40 }, (_, i) => [500 + i, `T${i}`, '', 'tv', 12, 2020, 8, 1000 - i, 'pg_13', 0, SETS[i % 4], '', '']) });
    // Темы и формат пропущены: о зрителе ничего не известно
    const s = { ...P.newState(), askedVeteran: true, answers: [{ q: 'themes', a: 'pick', v: [] }, { q: 'format', a: 'pick', v: [] }] };
    assert.equal(s.answers.length % 4, 2, 'по обычному правилу ещё не пора');
    assert.ok(P.nextQuestion(c, s, env(), () => 0).liked);
    const answered = { ...s, answers: [{ q: 'themes', a: 'pick', v: ['comedy'] }, { q: 'format', a: 'pick', v: ['shortSeries'] }] };
    const next = P.nextQuestion(c, answered, env(), () => 0);
    assert.ok(next && !next.liked, 'кто отвечает — тому по обычному порядку');
});

test('«Почему вам» на постерах: общее для всей подборки убрано, остаётся отличие или жанры', () => {
    const c = cat();
    const s = P.newState();
    s.answers = [{ q: 'short', a: 'yes' }, { q: 'romance', a: 'prob' }];
    const ids = [3, 4, 5, 7, 9];
    const why = P.whyDistinct(ids, s, env(), c);
    for (const id of ids) assert.ok(!why[id].includes('короткое'), `${id}: ${why[id]}`);
    assert.ok(why[5].includes('романтика'), 'романтика есть не у всех — остаётся');
    assert.ok(why[3].length > 0, 'без отличий — жанры');
});

// В стенде было: нажал «Короче», а первым сериал на 50 серий. Со «скорее да» так выходило в трети подборок
test('«Короче»: на настоящем каталоге при случайных ответах длинное первым — редкость', () => {
    const real = P.unpack(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'pick', 'catalog.json'), 'utf8')));
    let x = 7;
    const rng = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
    let long = 0;
    let total = 0;
    for (let i = 0; i < 300; i++) {
        const s = P.newState();
        for (let k = 0; k < 8; k++) {
            const q = P.nextQuestion(real, s, env(), rng);
            if (!q) break;
            if (q.choice) {
                const opts = (q.options || []).map(o => o.id || o[0] || o).filter(o => typeof o === 'string');
                P.answer(s, q, 'pick', opts.length && rng() < 0.7 ? [opts[Math.floor(rng() * opts.length)]] : []);
            } else {
                P.answer(s, q, ['yes', 'prob', 'skip', 'probno', 'no'][Math.floor(rng() * 5)]);
            }
        }
        P.setTweaks(s, ['shorter']);
        const { list } = P.pickResults(real, s, env(), 8, [], rng);
        if (!list.length) continue;
        total++;
        if (!P.isShort(real.byId.get(list[0]))) long++;
    }
    assert.ok(total > 250);
    assert.ok(long / total < 0.1, `длинное первым в ${long} из ${total}`);
});
