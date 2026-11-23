// Ядро расписания (modules/shared/schedule-core.js): неделя Пн–Вс, память о вышедших сериях, фильтры, китайское аниме
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext } = require('./helpers');

const { AgSchedule: S } = loadInContext(['modules/shared/schedule-core.js'], { Date });
const plain = (v) => JSON.parse(JSON.stringify(v));
const DAY = 864e5;
// Среда, полдень по местному времени
const NOW = new Date(2026, 10, 18, 12, 0).getTime();
const MONDAY = new Date(2026, 10, 16).getTime();
const item = (id, ep, at) => ({ next_episode: ep, next_episode_at: new Date(at).toISOString(), anime: { id } });

test('неделя начинается в понедельник и для воскресенья тоже', () => {
    assert.equal(S.weekStart(NOW), MONDAY);
    assert.equal(S.weekStart(new Date(2026, 10, 22, 23, 59).getTime()), MONDAY);
    assert.equal(S.weekStart(new Date(2026, 10, 16, 0, 0).getTime()), MONDAY);
});

test('вышедшая серия остаётся в своём дне, когда календарь переключился на следующую', () => {
    const friday = MONDAY + 4 * DAY + 20 * 36e5;
    // Понедельник: календарь показывает 7-ю серию на пятницу
    let seen = S.remember({}, [item(1, 7, friday)], MONDAY + 36e5);
    // Суббота: серия вышла, календарь отдаёт уже 8-ю на следующую пятницу
    const saturday = MONDAY + 5 * DAY + 36e5;
    seen = S.remember(seen, [item(1, 8, friday + 7 * DAY)], saturday);
    const week = plain(S.weekEntries(seen, saturday));
    assert.deepEqual(week.map(e => [e.id, e.ep, e.day]), [[1, 7, 4]], '7-я серия по-прежнему в пятнице, 8-я уйдёт на следующую неделю');
});

test('первое знакомство посреди недели: уже вышедшая серия восстанавливается по недельному шагу', () => {
    const nextMonday = MONDAY + 7 * DAY + 18 * 36e5;
    const seen = S.remember({}, [item(1, 8, nextMonday), item(2, 1, nextMonday)], NOW);
    const week = plain(S.weekEntries(seen, NOW));
    assert.deepEqual(week.map(e => [e.id, e.ep, e.day]), [[1, 7, 0]], 'прошлая серия стоит в понедельнике; у премьеры прошлой серии нет');
    assert.equal(seen[1].find(e => e.ep === 7).guess, true);
});

test('догадка не появляется для серии, которая по шагу ещё не вышла, и заменяется настоящими данными', () => {
    const friday = MONDAY + 4 * DAY;
    // Следующая серия через две недели: прошлая по шагу была бы в эту пятницу, но она ещё впереди
    assert.deepEqual(plain(S.weekEntries(S.remember({}, [item(1, 5, friday + 7 * DAY)], NOW), NOW)), []);
    const guessed = S.remember({}, [item(1, 8, MONDAY + 7 * DAY)], NOW);
    const fixed = S.remember(guessed, [item(1, 7, MONDAY + 2 * 36e5)], NOW);
    const entry = fixed[1].find(e => e.ep === 7);
    assert.equal(entry.at, MONDAY + 2 * 36e5);
    assert.equal(entry.guess, undefined);
});

test('память не растёт: серии старше прошлой недели забываются, исходный объект не меняется', () => {
    const old = { 1: [{ ep: 1, at: MONDAY - 20 * DAY }, { ep: 3, at: MONDAY - 2 * DAY }], 2: [{ ep: 1, at: MONDAY - 30 * DAY }] };
    const copy = plain(old);
    const seen = plain(S.remember(old, [], NOW));
    assert.deepEqual(seen, { 1: [{ ep: 3, at: MONDAY - 2 * DAY }] });
    assert.deepEqual(old, copy);
});

test('битые записи календаря не ломают память', () => {
    const seen = S.remember({ 5: 'мусор' }, [null, {}, { anime: { id: 3 }, next_episode_at: 'нет' }, item(4, 0, NOW)], NOW);
    assert.deepEqual(plain(seen), { 4: [{ ep: 1, at: NOW }] });
});

test('китайское аниме узнаётся по оригинальному названию, японское с одними иероглифами — нет', () => {
    for (const title of ['武动乾坤 第七季', '镇魂街 第五季', '斗破苍穹剧场版 双帝之战', '凡人修仙传', '完美世界 年番']) assert.equal(S.isChinese(title), true, title);
    for (const title of ['幻想水滸伝', '呪術廻戦', '薬屋のひとりごと 第3期', 'ONE PIECE', '魔法騎士レイアース', '名探偵コナン', '', null]) assert.equal(S.isChinese(title), false, String(title));
});

const entry = (extra = {}) => ({ id: 1, ep: 5, russian: 'Тайтл', name: 'Title', kind: 'TV', score: '7.4', episodes: 12, episodesAired: 4, duration: 24, rating: 'pg_13', genres: ['Экшен'], cn: false, airedOn: '2026-10-05', ...extra });
const F = (patch = {}) => ({ ...S.filters({}), ...patch });

test('по умолчанию скрыты китайское, детское и короткие серии', () => {
    assert.equal(S.passes(entry(), F(), { now: NOW }), true);
    assert.equal(S.passes(entry({ cn: true }), F(), { now: NOW }), false);
    assert.equal(S.passes(entry({ genres: ['Детское'] }), F(), { now: NOW }), false);
    assert.equal(S.passes(entry({ rating: 'g' }), F(), { now: NOW }), false);
    assert.equal(S.passes(entry({ duration: 3 }), F(), { now: NOW }), false);
    assert.equal(S.passes(entry({ duration: 0 }), F(), { now: NOW }), true, 'длина серии неизвестна: это не короткометражка');
});

test('длинные сериалы, оценка, жанры, тип, новинки и поиск', () => {
    const onePiece = entry({ ep: 1181, episodes: 0, episodesAired: 1180, airedOn: '1999-10-20' });
    assert.equal(S.passes(onePiece, F(), { now: NOW }), true, 'длинные по умолчанию видны');
    assert.equal(S.passes(onePiece, F({ long: 100 }), { now: NOW }), false);
    assert.equal(S.passes(entry({ episodes: 24 }), F({ long: 30 }), { now: NOW }), true);
    assert.equal(S.passes(entry({ score: '6.9' }), F({ min: 7 }), { now: NOW }), false);
    assert.equal(S.passes(entry({ score: '0.0' }), F({ min: 7 }), { now: NOW }), true, 'у премьеры оценки ещё нет');
    assert.equal(S.passes(entry({ score: '0.0' }), F({ hideUnrated: true }), { now: NOW }), false);
    assert.equal(S.passes(entry({ genres: ['Исэкай', 'Экшен'] }), F({ noGenres: ['Исэкай'] }), { now: NOW }), false);
    assert.equal(S.passes(entry(), F({ types: ['ONA'] }), { now: NOW }), false);
    assert.equal(S.passes(onePiece, F({ fresh: true }), { now: NOW }), false);
    assert.equal(S.passes(entry(), F({ fresh: true }), { now: NOW }), true);
    assert.equal(S.passes(entry(), F(), { now: NOW, query: 'title' }), true);
    assert.equal(S.passes(entry(), F(), { now: NOW, query: 'другое' }), false);
    assert.equal(S.passes(entry(), F({ hidden: [1] }), { now: NOW }), false);
});

test('тайтл из списка зрителя виден при любых фильтрах «не показывать», но скрытый вручную остаётся скрытым', () => {
    const kids = entry({ cn: true, genres: ['Детское'], duration: 2, score: '5.0', episodesAired: 500 });
    const strict = F({ long: 30, min: 8, hideUnrated: true });
    assert.equal(S.passes(kids, strict, { now: NOW }), false);
    assert.equal(S.passes(kids, strict, { now: NOW, watching: { 1: 3 } }), true);
    assert.equal(S.passes(kids, F({ hidden: [1] }), { now: NOW, watching: { 1: 3 } }), false);
    assert.equal(S.passes(entry(), F({ mine: true }), { now: NOW, watching: { 2: 0 } }), false);
    assert.equal(S.passes(entry(), F({ mine: true }), { now: NOW, watching: null }), true, 'без входа в Shikimori фильтр списка ничего не прячет');
});

test('настройки прежнего расписания AnimeGO переходят в новые, пока зритель их не менял', () => {
    const moved = S.filters({ ongoing_hide_chinese: false, ongoing_hide_long_running: true, ongoing_min_score: 6.4 });
    assert.equal(moved.hideCn, false);
    assert.equal(moved.long, 30);
    assert.equal(moved.min, 6.5);
    const own = S.filters({ ongoing_hide_chinese: false, schedule: { hideCn: true, long: 77, sort: 'другое', hidden: 'мусор' } });
    assert.equal(own.hideCn, true, 'новые настройки важнее старых');
    assert.equal(own.long, 0, 'значение не из списка сбрасывается');
    assert.equal(own.sort, 'time');
    assert.deepEqual(plain(own.hidden), []);
});

test('Shikimori обновил номер серии позже даты: в одном слоте остаётся одна серия, старшая', () => {
    const tuesday = MONDAY + DAY + 23.5 * 36e5;
    // Серия вышла, дата уже перенесена на следующую неделю, а номер ещё прежний
    let seen = S.remember({}, [item(1, 20, tuesday)], MONDAY + 36e5);
    // Позже Shikimori отметил серию вышедшей: на тот же вторник теперь 21-я
    seen = S.remember(seen, [item(1, 21, tuesday)], MONDAY + 2 * 36e5);
    const week = plain(S.weekEntries(seen, MONDAY + 2 * 36e5));
    assert.deepEqual(week.map(e => [e.id, e.ep, e.day]), [[1, 21, 1]]);
});

test('уже запомненный дубль убирается, даже если тайтла больше нет в календаре', () => {
    const at = MONDAY + 19.5 * 36e5;
    const seen = plain(S.remember({ 1: [{ ep: 7, at }, { ep: 8, at }] }, [], NOW));
    assert.deepEqual(seen, { 1: [{ ep: 8, at }] });
});
