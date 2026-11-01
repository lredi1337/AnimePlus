// Общее окно Топа на сайтах с собственными модулями (features/legacy-top.js)
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const TOP = [{ id: 5114, name: 'FMA', russian: 'Стальной алхимик', score: '9.1', kind: 'tv', aired_on: '2009-04-05', image: { original: '/x.jpg' } }];

const ANIMEGO = `<header><ul class="navbar-nav header-navbar-nav">
    <li class="nav-item"><a class="nav-link" href="/anime/season/2025">2025</a></li>
    <li class="nav-item"><a class="nav-link active" href="/anime/random"><span class="d-xl-none">Случайное</span><span class="d-none d-xl-inline">Случайное аниме</span></a></li>
    <li class="nav-item"><a class="nav-link" href="/anime/schedule">Расписание</a></li>
</ul></header>
<div id="mmenu"><div class="nav flex-column"><a class="nav-link fs-5" href="/">Главная</a></div></div><main></main>`;
const JUTSU = '<ul><li><a href="/top100/">ТОП-100</a></li><li><a href="/ongoing/">Онгоинги</a></li></ul>';

function mount(html, url, siteId, onMessage) {
    const { window: w, sent } = makeContentWindow(html, url, {
        onMessage: (msg) => (msg.action === 'fetch_shikimori' ? { data: TOP, status: 200 } : onMessage(msg))
    });
    ['modules/site-selectors.js', 'features/top-overlay.js', 'features/legacy-top.js'].forEach(f => w.eval(read(f)));
    w.agBindPostersIn = () => {};
    w.agMountLegacyTop(siteId, { sites_enabled: {} });
    return { w, doc: w.document, sent };
}

test('AnimeGO: пункт встаёт за «Случайным», подпись видна на любой ширине, есть в боковом меню', () => {
    const { doc } = mount(ANIMEGO, 'https://animego.me/', 'animego', () => null);
    const items = Array.from(doc.querySelectorAll('.navbar-nav > li')).map(li => li.textContent.trim());
    assert.strictEqual(items[2], 'Топ Shikimori');
    const link = doc.querySelector('.navbar-nav .ag-top-nav-link');
    assert.ok(!link.className.includes('active'));
    assert.strictEqual(link.querySelector('span').className, '');
    assert.strictEqual(doc.querySelector('#mmenu .ag-top-nav-link').textContent, 'Топ Shikimori');
    assert.strictEqual(doc.querySelectorAll('.ag-top-nav-link').length, 2);
});

test('AnimeGO: боковое меню закрывается, открывается общее окно', async () => {
    const { doc } = mount(ANIMEGO, 'https://animego.me/', 'animego', () => null);
    const mmenu = doc.getElementById('mmenu');
    mmenu.classList.add('show');
    mmenu.insertAdjacentHTML('beforeend', '<button class="btn-close"></button>');
    let closed = false;
    mmenu.querySelector('.btn-close').addEventListener('click', () => { closed = true; });
    doc.querySelector('#mmenu .ag-top-nav-link').click();
    await tick();
    assert.ok(closed);
    assert.ok(doc.querySelector('.ag-top-ov__card'));
});

test('Jut-Su: пункт за ТОП-100 в стиле меню, тайтла нет на сайте — выбор других сайтов', async () => {
    const { doc, sent } = mount(JUTSU, 'https://jut-su.net/', 'jutsu', (msg) => {
        if (msg.action === 'resolve_site_url') return { url: null };
        return { results: [{ siteId: 'animego', url: 'https://animego.me/anime/fma-1' }] };
    });
    const items = Array.from(doc.querySelectorAll('ul > li')).map(li => li.textContent.trim());
    assert.deepStrictEqual(items, ['ТОП-100', 'ТОП SHIKIMORI', 'Онгоинги']);

    doc.querySelector('.ag-top-nav-link').click();
    await tick();
    doc.querySelector('.ag-top-ov__card').click();
    await tick();
    const query = sent.find(m => m.action === 'resolve_site_url');
    assert.strictEqual(query.siteId, 'jutsu');
    assert.strictEqual(query.shikimoriId, 5114);
    assert.match(doc.querySelector('.ag-top-ov__choices').textContent, /AnimeGO/);
});

test('AnimeGO: тайтла нет на сайте — синтетическая страница, а не выбор сайтов', async () => {
    const { doc, sent } = mount(ANIMEGO, 'https://animego.me/', 'animego', () => ({ url: null }));
    doc.querySelector('.navbar-nav .ag-top-nav-link').click();
    await tick();
    doc.querySelector('.ag-top-ov__card').click();
    await tick();
    assert.ok(!sent.some(m => m.action === 'resolve_all_sites'));
    assert.strictEqual(doc.querySelector('.ag-top-ov__choices'), null);
});
