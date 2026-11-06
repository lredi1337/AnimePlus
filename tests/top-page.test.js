// «Топ Shikimori» (top/top.js): поверх сайта открывает тайтл на этом сайте через значок,
// вкладкой из окна расширения — на сайте, который выбрал зритель (выбор запоминается)
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
const TOP = [{ id: 5114, name: 'FMA', russian: 'Стальной алхимик', score: '9.1', kind: 'tv', aired_on: '2009-04-05', image: { original: '/x.jpg' } }];
const PAGE = 'https://ext.test/top/top.html';

/** Страница Топа с параметрами query; onMessage отвечает за background (кроме самого рейтинга) */
function openTop(query, { onMessage = () => null, store = {}, realNavigate = false } = {}) {
    const { window: w, sent } = makeContentWindow('<div id="app"></div>', `${PAGE}?${new URLSearchParams(query)}`, {
        onMessage: (msg) => (msg.action === 'fetch_shikimori' ? { data: TOP, status: 200 } : onMessage(msg))
    });
    w.chrome.storage.local.get = async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]));
    w.chrome.storage.local.set = async (obj) => { Object.assign(store, obj); };
    w.agBindPostersIn = () => {};
    w.scrollTo = () => {};
    const posted = [];
    w.parent.postMessage = (data) => posted.push(data);
    w.eval(read('top/top.js'));
    const visited = [];
    if (!realNavigate) w.AgTopPage.navigate = (url) => visited.push(url);
    return { w, doc: w.document, sent, visited, posted, store };
}

const clickCard = async (doc) => {
    doc.querySelector('.top__card').click();
    await tick();
};
const found = (url) => (msg) => (msg.action === 'resolve_site_url' ? { url } : null);

test('поверх сайта: тайтл найден — значок получает просьбу открыть его на этом сайте', async () => {
    const { doc, sent, posted } = openTop({ embed: '1', site: 'jutsu', origin: 'https://jut-su.net' }, { onMessage: found('https://jut-su.net/fma.html'), realNavigate: true });
    await tick();
    assert.ok(doc.documentElement.classList.contains('is-embed'));
    assert.match(doc.querySelector('.top__hint').textContent, /Jut-Su/);
    assert.strictEqual(doc.querySelector('.top__picker'), null, 'поверх сайта выбора сайта нет');
    await clickCard(doc);
    const query = sent.find(m => m.action === 'resolve_site_url');
    assert.strictEqual(query.siteId, 'jutsu');
    assert.strictEqual(query.shikimoriId, 5114);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(posted)), [{ source: 'anime-plus-top', type: 'open', url: 'https://jut-su.net/fma.html' }]);
});

test('поверх сайта: крестик, Esc и нажатие на затемнение закрывают Топ', async () => {
    const { w, doc, posted } = openTop({ embed: '1', site: 'jutsu' });
    await tick();
    doc.querySelector('.top__close').click();
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    doc.documentElement.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
    doc.querySelector('.top__grid').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
    assert.deepStrictEqual(posted.map(m => m.type), ['close', 'close', 'close'], 'нажатие внутри окна не закрывает');
});

test('тайтла нет на сайте: только «Нет на …» и Shikimori, другие сайты не ищутся', async () => {
    const { doc, sent, visited } = openTop({ embed: '1', site: 'jutsu' }, { onMessage: () => ({ url: null }) });
    await tick();
    await clickCard(doc);
    assert.deepStrictEqual(visited, []);
    assert.ok(!sent.some(m => m.action === 'resolve_all_sites'));
    const choices = doc.querySelector('.top__choices');
    assert.match(choices.textContent, /Нет на Jut-Su/);
    assert.strictEqual(choices.querySelector('a').getAttribute('href'), 'https://shikimori.io/animes/5114');
});

test('AnimeGO: тайтла нет в каталоге — синтетическая страница на том же адресе сайта', async () => {
    const { doc, visited } = openTop({ embed: '1', site: 'animego', origin: 'https://animego.org' }, { onMessage: () => ({ url: null }) });
    await tick();
    await clickCard(doc);
    assert.deepStrictEqual(visited, ['https://animego.org/anime/shiki-5114']);
});

test('адрес чужого сайта в параметрах и в ответе не принимается', async () => {
    const { doc, visited } = openTop({ embed: '1', site: 'jutsu', origin: 'https://evil.example' }, { onMessage: found('https://evil.example/x') });
    await tick();
    await clickCard(doc);
    assert.deepStrictEqual(visited, [], 'ответ с чужим адресом не открывается');
    assert.match(doc.querySelector('.top__choices').textContent, /Нет на Jut-Su/);
});

test('AnimeVost: тайтл открывается на том зеркале, где зритель сейчас', async () => {
    const { doc, visited } = openTop({ embed: '1', site: 'animevost', origin: 'https://v14.vost.pw' }, { onMessage: found('https://animevost.org/index.php?newsid=3044') });
    await tick();
    await clickCard(doc);
    assert.deepStrictEqual(visited, ['https://v14.vost.pw/index.php?newsid=3044']);
});

test('вкладка из окна расширения: сайт открытой вкладки, выбор другого сайта запоминается', async () => {
    const store = {};
    const { doc, sent, visited } = openTop({ pick: '1', site: 'jutsu', origin: 'https://jut-su.net' }, {
        store,
        onMessage: (msg) => (msg.action === 'resolve_site_url' ? { url: msg.siteId === 'animego' ? 'https://animego.me/anime/fma-1' : null } : null)
    });
    await tick();
    assert.strictEqual(doc.documentElement.classList.contains('is-embed'), false);
    const pressed = () => doc.querySelector('.top__site[aria-selected="true"]').dataset.site;
    const list = doc.querySelector('.top__picker-list');
    const toggle = doc.querySelector('.top__picker-btn');
    assert.strictEqual(pressed(), 'jutsu');
    assert.match(toggle.textContent, /Jut-Su/, 'выбранный сайт виден на кнопке');
    assert.strictEqual(list.hidden, true, 'список сайтов свёрнут');
    assert.ok(doc.querySelectorAll('.top__site').length >= 5, 'все включённые сайты');

    toggle.click();
    assert.strictEqual(list.hidden, false, 'нажатие раскрывает список');
    doc.querySelector('.top__site[data-site="animego"]').click();
    await tick();
    assert.strictEqual(list.hidden, true, 'после выбора список закрывается');
    assert.strictEqual(pressed(), 'animego');
    assert.match(toggle.textContent, /AnimeGO/);
    assert.strictEqual(store.ag_top_site, 'animego');
    assert.match(doc.querySelector('.top__hint').textContent, /AnimeGO/);
    await clickCard(doc);
    assert.strictEqual(sent.filter(m => m.action === 'resolve_site_url').pop().siteId, 'animego');
    assert.deepStrictEqual(visited, ['https://animego.me/anime/fma-1']);
});

test('вкладка из окна расширения: прошлый выбор важнее открытого сайта, выключенные сайты не предлагаются', async () => {
    const store = { ag_top_site: 'yummy_ru', ag_settings: { sites_enabled: { animego: false } } };
    const { doc } = openTop({ pick: '1', site: 'jutsu' }, { store });
    await tick();
    assert.strictEqual(doc.querySelector('.top__site[aria-selected="true"]').dataset.site, 'yummy_ru');
    assert.strictEqual(doc.querySelector('.top__site[data-site="animego"]'), null);
});

test('вкладка из окна расширения вне сайта: первый включённый сайт', async () => {
    const { doc } = openTop({ pick: '1' });
    await tick();
    assert.strictEqual(doc.querySelector('.top__site[aria-selected="true"]').dataset.site, 'animego');
});

test('без сайта в адресе — подсказка вместо пустой страницы', async () => {
    const { doc } = openTop({});
    await tick();
    assert.match(doc.getElementById('app').textContent, /значка Anime\+/);
    assert.strictEqual(doc.querySelector('.top__card'), null);
});
