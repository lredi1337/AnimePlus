// Страница расписания (schedule/schedule.js): неделя Пн–Вс, вышедшие серии остаются в своём дне, фильтры зрителя
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
const PAGE = 'https://ext.test/schedule/schedule.html';
const HOUR = 36e5;

/** Серии текущей недели относительно настоящего «сейчас»: вчерашняя вышедшая, сегодняшняя будущая и остальные */
function week() {
    const now = Date.now();
    const d = new Date(now);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    const today = (d.getDay() + 6) % 7;
    const at = (day, hour) => monday + day * 864e5 + hour * HOUR;
    const base = { kind: 'TV', score: 7.5, episodes: 12, episodesAired: 5, duration: 24, rating: 'pg_13', genres: ['Экшен'], cn: false, airedOn: '2020-01-01', poster: 'https://shikimori.io/p.webp' };
    const make = (id, day, extra = {}) => ({ ...base, id, russian: `Тайтл ${id}`, name: `Title ${id}`, ep: 6, at: at(day, 12), day, ...extra });
    return {
        today,
        entries: [
            make(1, today, { at: now - HOUR, russian: 'Вышедший' }),
            make(2, today, { at: now + 30 * 60000, russian: 'Скоро' }),
            make(3, (today + 1) % 7, { cn: true, russian: 'Китайский' }),
            make(4, (today + 2) % 7, { genres: ['Детское'], russian: 'Детский' }),
            make(5, (today + 3) % 7, { episodesAired: 1180, episodes: 0, ep: 1181, score: 8.7, russian: 'Длинный' }),
            make(6, (today + 3) % 7, { genres: ['Исэкай'], score: 6.1, ep: 1, russian: 'Премьера исэкая' })
        ]
    };
}

function openSchedule(query, { entries, watching = null, loaded = true, settings = {}, onMessage = () => null, realNavigate = false } = {}) {
    const { window: w, sent } = makeContentWindow('<div id="app"></div>', `${PAGE}?${new URLSearchParams(query)}`, {
        onMessage: (msg) => (msg.action === 'get_week_schedule' ? { entries, watching, loaded } : onMessage(msg))
    });
    const store = { ag_settings: settings };
    w.chrome.storage.local.get = async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]));
    w.chrome.storage.local.set = async (obj) => { Object.assign(store, obj); };
    w.getSettings = async () => store.ag_settings;
    w.agPatchSettings = async (patch) => { store.ag_settings = { ...store.ag_settings, ...patch }; return store.ag_settings; };
    w.agBindPostersIn = () => {};
    w.Element.prototype.scrollIntoView = function () {};
    const posted = [];
    w.parent.postMessage = (data) => posted.push(data);
    w.eval(read('modules/shared/ext-page.js'));
    w.eval(read('modules/shared/schedule-core.js'));
    w.eval(read('schedule/schedule.js'));
    const visited = [];
    if (!realNavigate) w.AgSchedulePage.navigate = (url) => visited.push(url);
    return { w, doc: w.document, sent, visited, posted, store };
}

const titles = (doc) => [...doc.querySelectorAll('.sch__title')].map(n => n.textContent);
const cardOf = (doc, id) => doc.querySelector(`.sch__card[data-id="${id}"]`);

test('неделя из семи дней, вышедшая серия остаётся в своём дне с меткой «вышла»', async () => {
    const { entries, today } = week();
    const { doc } = openSchedule({ pick: '1', site: 'jutsu' }, { entries });
    await tick();
    const chips = [...doc.querySelectorAll('.sch__days .sch__chip')];
    assert.strictEqual(chips.length, 7);
    assert.match(chips[0].textContent, /^Пн/);
    assert.match(chips[6].textContent, /^Вс/);
    assert.ok(chips[today].classList.contains('is-today'));
    const out = cardOf(doc, 1);
    assert.strictEqual(out.closest('.sch__day').dataset.day, String(today), 'вышедшая серия стоит в сегодняшнем дне');
    assert.ok(out.querySelector('.sch__when').classList.contains('is-out'));
    assert.strictEqual(out.querySelector('.sch__when').textContent, 'вышла');
    assert.strictEqual(cardOf(doc, 2).querySelector('.sch__when').textContent, 'через 30 мин');
    assert.match(doc.querySelector('.sch__day.is-today h2').textContent, /^Сегодня/);
});

test('по умолчанию скрыты китайское и детское, переключатель возвращает и запоминается', async () => {
    const { entries } = week();
    const { doc, store } = openSchedule({ pick: '1', site: 'jutsu' }, { entries });
    await tick();
    assert.ok(!titles(doc).includes('Китайский'));
    assert.ok(!titles(doc).includes('Детский'));
    assert.match(doc.querySelector('.sch__count').textContent, /Тайтлов: 4 из 6/);
    doc.querySelector('.sch__sw[data-key="hideCn"]').click();
    await tick();
    assert.ok(titles(doc).includes('Китайский'));
    assert.strictEqual(store.ag_settings.schedule.hideCn, false);
    assert.strictEqual(store.ag_settings.schedule.hideKids, true, 'остальные фильтры не тронуты');
});

test('длинные сериалы, жанры и поиск', async () => {
    const { entries } = week();
    const { w, doc } = openSchedule({ pick: '1', site: 'jutsu' }, { entries });
    await tick();
    doc.querySelector('.sch__seg button[data-value="100"]').click();
    assert.ok(!titles(doc).includes('Длинный'));
    assert.match(doc.querySelector('.sch__panel').textContent, /Длинный \(1181\)/);
    doc.querySelector('.sch__genres button[data-genre="Исэкай"]').click();
    assert.ok(!titles(doc).includes('Премьера исэкая'));
    const search = doc.querySelector('.sch__search');
    search.value = 'скоро';
    search.dispatchEvent(new w.Event('input'));
    assert.deepStrictEqual(titles(doc), ['Скоро']);
    doc.querySelector('.sch__count .sch__link').click();
    assert.strictEqual(titles(doc).length, 4, 'сброс возвращает фильтры по умолчанию');
});

test('крестик убирает тайтл, вернуть его можно в фильтрах', async () => {
    const { entries } = week();
    const { doc, store } = openSchedule({ pick: '1', site: 'jutsu' }, { entries });
    await tick();
    cardOf(doc, 2).querySelector('.sch__hide').click();
    await tick();
    assert.strictEqual(cardOf(doc, 2), null);
    assert.deepStrictEqual([...store.ag_settings.schedule.hidden], [2]);
    const back = doc.querySelector('.sch__hidden button');
    assert.strictEqual(back.textContent, 'Скоро');
    back.click();
    assert.ok(cardOf(doc, 2));
});

test('список зрителя: отметки серий, фильтр «Мой список», тайтл из списка не прячется фильтрами', async () => {
    const { entries } = week();
    const { doc } = openSchedule({ pick: '1', site: 'jutsu' }, { entries, watching: { 1: 5, 3: 6, 5: 1181 } });
    await tick();
    assert.strictEqual(cardOf(doc, 1).querySelector('.sch__tag').textContent, 'Не смотрели', '6-я вышла, просмотрено 5');
    assert.ok(cardOf(doc, 3), 'китайский тайтл из списка виден при фильтре «Китайское»');
    doc.querySelector('.sch__chip--soft').click();
    assert.deepStrictEqual(titles(doc).sort(), ['Вышедший', 'Длинный', 'Китайский']);
});

test('без входа в Shikimori кнопки «Мой список» нет', async () => {
    const { entries } = week();
    const { doc } = openSchedule({ pick: '1', site: 'jutsu' }, { entries });
    await tick();
    assert.strictEqual(doc.querySelector('.sch__chip--soft').hidden, true);
    assert.strictEqual(cardOf(doc, 6).querySelector('.sch__tag').textContent, 'Премьера');
});

test('поверх сайта: тайтл открывает значок на этом сайте, Esc закрывает', async () => {
    const { entries } = week();
    const { w, doc, sent, posted } = openSchedule({ embed: '1', site: 'jutsu', origin: 'https://jut-su.net' }, {
        entries, realNavigate: true, onMessage: (msg) => (msg.action === 'resolve_site_url' ? { url: 'https://jut-su.net/t.html' } : null)
    });
    await tick();
    assert.ok(doc.documentElement.classList.contains('is-embed'));
    assert.strictEqual(doc.querySelector('.sch__picker'), null);
    cardOf(doc, 1).click();
    await tick();
    assert.strictEqual(sent.find(m => m.action === 'resolve_site_url').shikimoriId, 1);
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(posted)), [{ source: 'anime-plus-top', type: 'open', url: 'https://jut-su.net/t.html' }, { source: 'anime-plus-top', type: 'close' }]);
});

test('вкладка: тайтла нет на выбранном сайте — «Нет на …» и Shikimori; AnimeGO открывает страницу из данных Shikimori', async () => {
    const { entries } = week();
    const none = openSchedule({ pick: '1', site: 'jutsu' }, { entries, onMessage: () => ({ url: null }) });
    await tick();
    cardOf(none.doc, 1).click();
    await tick();
    assert.match(cardOf(none.doc, 1).querySelector('.sch__choices').textContent, /Нет на Jut-Su/);
    assert.deepStrictEqual(none.visited, []);
    const ag = openSchedule({ pick: '1', site: 'animego', origin: 'https://animego.org' }, { entries, onMessage: () => ({ url: null }) });
    await tick();
    cardOf(ag.doc, 1).click();
    await tick();
    assert.deepStrictEqual(ag.visited, ['https://animego.org/anime/shiki-1']);
});

test('сеть не ответила и памяти нет — сообщение с повтором, а не пустая страница', async () => {
    const { doc } = openSchedule({ pick: '1', site: 'jutsu' }, { entries: [], loaded: false });
    await tick();
    assert.match(doc.querySelector('.sch__note').textContent, /Не удалось загрузить расписание/);
    assert.ok(doc.querySelector('.sch__note .sch__link'));
});

test('без сайта в адресе — подсказка', async () => {
    const { doc } = openSchedule({});
    await tick();
    assert.match(doc.getElementById('app').textContent, /значка Anime\+/);
});
