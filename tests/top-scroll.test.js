// Окно Топа: весь рейтинг постранично, закреплённые вкладки, номера только у первых 100
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
const pageOf = (url) => Number(new URL(url).searchParams.get('page'));
const items = (page, count) => Array.from({ length: count }, (_, i) => ({
    id: page * 1000 + i, name: `T${page}-${i}`, russian: `Тайтл ${page}-${i}`, score: '8.1', kind: 'tv', image: { original: '/x.jpg' }
}));

function open(respond) {
    const urls = [];
    const { window: w } = makeContentWindow('<ul><li><a href="/top100/">ТОП-100</a></li></ul>', 'https://jut-su.net/', {
        onMessage: (msg) => {
            if (msg.action !== 'fetch_shikimori') return null;
            urls.push(msg.url);
            return respond(msg.url);
        }
    });
    w.eval(read('modules/shared/ui-kit.js'));
    ['modules/site-selectors.js', 'features/top-overlay.js', 'features/legacy-top.js'].forEach(f => w.eval(read(f)));
    w.agBindPostersIn = () => {};
    w.agMountLegacyTop('jutsu', { sites_enabled: {} });
    w.document.querySelector('.ag-top-nav-link').click();
    return { doc: w.document, urls, w };
}

// В jsdom нет раскладки: «конец списка» виден сразу, поэтому страницы грузятся подряд, как при прокрутке
const threePages = (url) => ({ status: 200, data: pageOf(url) < 3 ? items(pageOf(url), 50) : items(3, 20) });

test('рейтинг грузится дальше сотни и останавливается на последней странице', async () => {
    const { doc, urls } = open(threePages);
    await tick(120);
    assert.strictEqual(doc.querySelectorAll('.ag-top-ov__card').length, 120);
    assert.deepStrictEqual(urls.map(pageOf), [1, 2, 3]);
    assert.ok(urls.every(u => u.includes('order=ranked') && u.includes('score=1')));
    assert.match(doc.querySelector('.ag-top-ov__note').textContent, /все тайтлы/);
});

test('номера есть только у первых 100, оценка — у всех', async () => {
    const { doc } = open(threePages);
    await tick(120);
    const cards = Array.from(doc.querySelectorAll('.ag-top-ov__card'));
    assert.strictEqual(cards[0].querySelector('.ag-top-ov__rank').textContent, '#1');
    assert.strictEqual(cards[99].querySelector('.ag-top-ov__rank').textContent, '#100');
    assert.strictEqual(cards[100].querySelector('.ag-top-ov__rank'), null);
    assert.match(cards[100].querySelector('.ag-top-ov__score').textContent, /8\.1/);
});

test('вкладки вне прокручиваемой области, заголовок без «100»', async () => {
    const { doc } = open(threePages);
    await tick();
    const scroll = doc.querySelector('.ag-top-ov__scroll');
    assert.ok(scroll.contains(doc.querySelector('.ag-top-ov__grid')));
    assert.ok(!scroll.contains(doc.querySelector('.ag-top-ov__tabs')));
    assert.strictEqual(doc.querySelector('.ag-top-ov__head h2').textContent, 'Топ Shikimori');
});

test('смена вкладки начинает рейтинг заново с первого номера', async () => {
    const { doc, urls } = open((url) => ({ status: 200, data: url.includes('kind=movie') ? items(9, 2) : items(pageOf(url), 3) }));
    await tick();
    doc.querySelector('.ag-top-ov__tab[data-kind="movie"]').click();
    await tick();
    const cards = doc.querySelectorAll('.ag-top-ov__card');
    assert.strictEqual(cards.length, 2);
    assert.strictEqual(cards[0].querySelector('.ag-top-ov__rank').textContent, '#1');
    const last = urls[urls.length - 1];
    assert.ok(last.includes('kind=movie') && pageOf(last) === 1);
});

test('ответ со старой вкладки не попадает в новую', async () => {
    let release;
    const slow = new Promise((resolve) => { release = resolve; });
    const { doc } = open((url) => (url.includes('kind=movie') ? { status: 200, data: items(9, 2) } : slow));
    await tick();
    doc.querySelector('.ag-top-ov__tab[data-kind="movie"]').click();
    await tick();
    release({ status: 200, data: items(1, 3) });
    await tick();
    assert.strictEqual(doc.querySelectorAll('.ag-top-ov__card').length, 2);
});

test('ошибка на странице: загруженное остаётся, можно повторить', async () => {
    let fail = true;
    const { doc } = open((url) => {
        if (pageOf(url) === 1) return { status: 200, data: items(1, 50) };
        if (fail) { fail = false; return { status: 429, error: 'limit' }; }
        return { status: 200, data: items(2, 5) };
    });
    await tick();
    assert.strictEqual(doc.querySelectorAll('.ag-top-ov__card').length, 50);
    const retry = doc.querySelector('.ag-top-ov__retry');
    assert.ok(retry);
    retry.click();
    await tick();
    assert.strictEqual(doc.querySelectorAll('.ag-top-ov__card').length, 55);
});

// Рейтинг: на каждой странице оценки ниже предыдущей, с нулевой страницы начинается 9.9
const ranked = (url) => {
    const params = new URL(url).searchParams;
    const min = Number(params.get('score'));
    const pg = Number(params.get('page'));
    const all = [];
    for (let i = (pg - 1) * 50; i < pg * 50; i++) {
        const score = 9.9 - i * 0.01;
        if (score >= min && score > 5) all.push({ id: i + 1, name: `T${i}`, russian: `Тайтл ${i}`, score: score.toFixed(2), kind: 'tv', image: { original: '/x.jpg' } });
    }
    return { status: 200, data: all };
};

test('диапазон оценок: переход сразу к нужным тайтлам, верные номера, остановка на нижней границе', async () => {
    const { doc, urls } = open(ranked);
    await tick(40);
    urls.length = 0;
    doc.querySelector('.ag-top-ov__tab[data-score="8"]').click();
    await tick(2600);

    const cards = Array.from(doc.querySelectorAll('.ag-top-ov__card'));
    const scores = cards.map(card => parseFloat(card.querySelector('.ag-top-ov__score').textContent.replace('★', '')));
    assert.ok(scores.every(v => v >= 8 && v < 9), 'только оценки 8–9');
    assert.strictEqual(scores[0], 8.99);
    assert.strictEqual(cards[0].querySelector('.ag-top-ov__rank').textContent, '#92');
    assert.ok(cards.length >= 100);
    assert.ok(urls.length < 15, `обошлись без перебора всех страниц: ${urls.length}`);
    assert.match(doc.querySelector('.ag-top-ov__note').textContent, /такой оценкой/);
    assert.strictEqual(doc.querySelector('.ag-top-ov__tab[data-score="8"]').getAttribute('aria-pressed'), 'true');
});

test('диапазон сохраняется при смене типа, «9+» начинается с первого места', async () => {
    const { doc, urls } = open(ranked);
    await tick(40);
    doc.querySelector('.ag-top-ov__tab[data-score="9"]').click();
    await tick(200);
    assert.strictEqual(doc.querySelector('.ag-top-ov__card .ag-top-ov__rank').textContent, '#1');
    doc.querySelector('.ag-top-ov__tab[data-kind="movie"]').click();
    await tick(60);
    const last = urls[urls.length - 1];
    assert.ok(last.includes('kind=movie') && last.includes('score=9'));
});

test('в Топе нет поля поиска', async () => {
    const { doc } = open(ranked);
    await tick(40);
    assert.strictEqual(doc.querySelector('.ag-top-ov input, .ag-top-ov select'), null);
});

test('начало диапазона запоминается: при повторном выборе нет поиска и не теряются тайтлы на границе', async () => {
    const { doc, urls, w } = open(ranked);
    const store = {};
    w.chrome.storage.local.get = async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]));
    w.chrome.storage.local.set = async (obj) => { Object.assign(store, obj); };
    await tick(40);
    doc.querySelector('.ag-top-ov__tab[data-score="8"]').click();
    await tick(2600);
    assert.strictEqual(store.ag_top_band_pages['|8'].page, 2);

    // Граница сместилась: теперь диапазон начинается на странице раньше сохранённой
    store.ag_top_band_pages['|8'].page = 3;
    doc.querySelector('.ag-top-ov__tab[data-score=""]').click();
    await tick(200);
    urls.length = 0;
    doc.querySelector('.ag-top-ov__tab[data-score="8"]').click();
    await tick(300);
    assert.strictEqual(pageOf(urls[0]), 2, 'сразу страница с запасом, без поиска');
    assert.strictEqual(doc.querySelector('.ag-top-ov__card .ag-top-ov__score').textContent, '★ 8.99');
});
