// «Порядок просмотра» на страницах: «Случайное аниме» (обычная карточка и раскладки стилей) и подбор
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check) => {
    for (let i = 0; i < 150 && !check(); i++) await tick(20);
    return check();
};
const STYLES = ['cinema', 'magazine', 'manga', 'arcade', 'bento'];
const LOOK_FILES = ['modules/looks/look-pages.js', ...STYLES.map(s => `modules/looks/${s}.js`)];
const MONO = JSON.parse(read('tests/fixtures/franchise/monogatari.json'));
// Название с разметкой: должно остаться текстом
MONO.nodes.find(n => n.id === 5081).name = 'Истории монстров <img src=x id=injected>';
const FR = { data: MONO, posters: { 5081: 'https://shikimori.io/p/5081.jpg' } };

const anime = (id, extra = {}) => ({
    id, name: `Title ${id}`, russian: `Тайтл ${id}`, kind: 'tv', kindLabel: 'Сериал', score: '8.1', year: '2009', episodes: 15, status: '',
    genres: ['Детектив'], description: 'Описание.', poster: 'https://shikimori.io/p.jpg', screenshots: [], franchise: { ...FR, data: { ...MONO, current_id: id } }, ...extra
});

function openRandom(style) {
    const sent = [];
    const { window: w } = makeContentWindow('<div id="app"></div>', 'https://ext.test/random/random.html', {
        onMessage: (msg) => {
            sent.push(msg);
            if (msg.action === 'get_random_anime_card') return { anime: anime(5081) };
            if (msg.action === 'get_anime_card') return { anime: anime(msg.id, { russian: `Открыт ${msg.id}` }) };
            if (msg.action === 'resolve_site_url') return { url: null };
            return null;
        }
    });
    if (style) w.document.documentElement.dataset.look = style;
    w.chrome.storage.local.get = async () => ({ ag_settings: {} });
    w.chrome.tabs = { create: () => Promise.resolve() };
    w.scrollTo = () => {};
    for (const f of ['modules/shared/ext-page.js', 'modules/shared/shot-viewer.js', 'modules/shared/franchise-core.js', 'modules/shared/franchise-view.js', ...LOOK_FILES, 'random/random.js']) w.eval(read(f));
    return { w, doc: w.document, sent };
}

const items = (root) => [...root.querySelectorAll('.fr__item[data-fr-id]')];

test('«Случайное», обычная карточка: порядок просмотра под кадрами, «вы здесь» на текущем, предыстории раньше', async () => {
    const { doc } = openRandom(null);
    assert.ok(await until(() => doc.querySelector('.rnd__franchise .fr')));
    const box = doc.querySelector('.rnd__franchise');
    assert.equal(box.hidden, false);
    const list = items(box);
    const here = list.find(li => li.classList.contains('is-here'));
    assert.equal(Number(here.dataset.frId), 5081);
    assert.equal(here.querySelector('.fr__num').textContent, '4', 'четвёртый по сюжету: после «Историй ран»');
    assert.match(list[0].textContent, /Истории ран\. Часть 1/);
    assert.equal(doc.getElementById('injected'), null, 'название — текст, а не разметка');
    assert.ok(!/Клип|Проморолик/.test(box.textContent));
    assert.equal(here.querySelector('button'), null, 'текущий не нажимается');
});

test('«Случайное»: «По выходу» перестраивает список и запоминается; пересказы и другие истории — по кнопке', async () => {
    const { w, doc } = openRandom(null);
    assert.ok(await until(() => doc.querySelector('.rnd__franchise .fr')));
    const box = doc.querySelector('.rnd__franchise');
    assert.equal(box.querySelectorAll('.fr__item.is-recap').length, 0, 'пересказы скрыты');
    box.querySelector('[data-act="fr-recaps"]').click();
    assert.ok(box.querySelectorAll('.fr__item.is-recap').length > 0, 'пересказы показаны');
    box.querySelector('[data-act="fr-mode"][data-v="release"]').click();
    assert.match(items(box)[0].textContent, /Истории монстров/, 'по выходу первым — 2009 год');
    assert.equal(w.localStorage.getItem('ag-fr-mode'), 'release', 'выбор запомнен');
    assert.equal(box.querySelector('.fr__others-list'), null);
    box.querySelector('[data-act="fr-others"]').click();
    assert.match(box.querySelector('.fr__others-list').textContent, /Давайте учиться манерам вместе/);
    w.localStorage.removeItem('ag-fr-mode');
});

test('«Случайное»: тайтл из франшизы открывается здесь же, прошлый — в «Уже выпадали»', async () => {
    const { doc, sent } = openRandom(null);
    assert.ok(await until(() => doc.querySelector('.rnd__franchise .fr')));
    const target = items(doc.querySelector('.rnd__franchise')).find(li => /Истории подделок/.test(li.textContent));
    target.querySelector('button').click();
    assert.ok(await until(() => /Открыт/.test(doc.querySelector('.rnd__title').textContent)));
    const asked = sent.find(m => m.action === 'get_anime_card');
    assert.equal(asked.id, Number(target.dataset.frId));
    assert.ok(doc.querySelector('.rnd__past'), 'прошлый тайтл в истории');
    assert.equal(Number(doc.querySelector('.rnd__franchise .fr__item.is-here').dataset.frId), asked.id, '«вы здесь» переехало');
});

for (const style of STYLES) {
    test(`«Случайное», ${style}: блок в раскладке стиля, переключатель и переход работают`, async () => {
        const { doc, sent } = openRandom(style);
        assert.ok(await until(() => doc.querySelector('.lk .fr')), 'блок в раскладке');
        assert.equal(doc.getElementById('injected'), null);
        const lk = doc.querySelector('.lk');
        lk.querySelector('[data-act="fr-mode"][data-v="release"]').click();
        assert.ok(await until(() => lk.querySelector('[data-act="fr-mode"][data-v="release"]').getAttribute('aria-pressed') === 'true'));
        lk.querySelector('[data-act="fr-mode"][data-v="story"]').click();
        const target = items(lk).find(li => li.querySelector('button'));
        target.querySelector('button').click();
        assert.ok(await until(() => sent.some(m => m.action === 'get_anime_card')));
        assert.ok(await until(() => /Открыт/.test(lk.textContent)));
    });
}

test('одиночный тайтл: блока нет и места он не занимает', async () => {
    const sent = [];
    const { window: w } = makeContentWindow('<div id="app"></div>', 'https://ext.test/random/random.html', {
        onMessage: (msg) => { sent.push(msg); return msg.action === 'get_random_anime_card' ? { anime: anime(1, { franchise: null }) } : { url: null }; }
    });
    w.chrome.storage.local.get = async () => ({ ag_settings: {} });
    w.scrollTo = () => {};
    for (const f of ['modules/shared/ext-page.js', 'modules/shared/shot-viewer.js', 'modules/shared/franchise-core.js', 'modules/shared/franchise-view.js', 'random/random.js']) w.eval(read(f));
    assert.ok(await until(() => w.document.querySelector('.rnd__card:not(.is-loading)')));
    assert.equal(w.document.querySelector('.rnd__franchise').hidden, true);
});

test('тайтл один в своей ветке, но у вселенной есть другие истории: блок «Из той же вселенной» сразу со списком', () => {
    const w = makeContentWindow('<div></div>', 'https://ext.test/random/random.html').window;
    for (const f of ['modules/shared/franchise-core.js', 'modules/shared/franchise-view.js']) w.eval(read(f));
    const data = {
        current_id: 1,
        nodes: [
            { id: 1, name: 'Другой мир', kind: 'OVA', year: 2008, date: 10 },
            { id: 2, name: 'Основной сериал', kind: 'TV Сериал', year: 2007, date: 5 },
            { id: 3, name: 'Продолжение', kind: 'TV Сериал', year: 2008, date: 8 }
        ],
        links: [{ source_id: 1, target_id: 2, relation: 'other' }, { source_id: 2, target_id: 3, relation: 'sequel' }]
    };
    const box = w.document.createElement('div');
    box.innerHTML = w.AgFranchiseView.html({ data, posters: {} }, w.AgFranchiseView.state(), 1);
    assert.match(box.querySelector('.fr__title').textContent, /Из той же вселенной/);
    assert.equal(box.querySelector('[data-act="fr-mode"]'), null, 'переключать порядок нечего');
    assert.equal(box.querySelectorAll('.fr__item[data-fr-id]').length, 0, 'сам тайтл списком не повторяется');
    assert.match(box.querySelector('.fr__others-list').textContent, /Основной сериал/, 'истории видны сразу, без кнопки');
});
