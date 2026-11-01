// Выбор сайта для просмотра на синтетической странице AnimeGO (modules/animego/ag-synthetic.js)
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const DATA = { id: 60022, name: 'One Piece Fan Letter', russian: 'Ван-Пис: Письмо от поклонника', english: ['One Piece Fan Letter'], airedOn: '2024' };

async function render(results, settings = { sites_enabled: {} }) {
    const { window: w, sent } = makeContentWindow('<div id="box"></div>', 'https://animego.me/anime/shiki-60022', {
        onMessage: (msg) => (msg.action === 'resolve_all_sites' ? { results } : { success: true })
    });
    w.eval(read('modules/shared/ui-kit.js'));
    w.eval(read('modules/animego/ag-synthetic.js'));
    w.getSettings = async () => settings;
    const box = w.document.getElementById('box');
    const done = w.agRenderWatchChoice(box, DATA);
    await done;
    return { box, sent, rows: Array.from(box.querySelectorAll('.ag-wc__item')) };
}

test('ищет на всех включённых сайтах, кроме самого AnimeGO, и передаёт данные тайтла', async () => {
    const { sent } = await render([], { sites_enabled: { yummy_old: false } });
    const msg = sent.find(m => m.action === 'resolve_all_sites');
    assert.ok(!msg.siteIds.includes('animego'));
    assert.ok(!msg.siteIds.includes('yummy_old'));
    assert.ok(msg.siteIds.includes('jutsu') && msg.siteIds.includes('yammy_club'));
    assert.strictEqual(msg.shikimoriId, 60022);
    assert.strictEqual(msg.year, '2024');
});

test('найденные сайты идут первыми и ведут прямо на тайтл в новой вкладке', async () => {
    const { rows } = await render([
        { siteId: 'jutsu', url: null },
        { siteId: 'yummyanime_tv', url: 'https://yummyanime.tv/4816-van-pis.html' }
    ]);
    assert.strictEqual(rows[0].dataset.site, 'yummyanime_tv');
    assert.strictEqual(rows[0].getAttribute('href'), 'https://yummyanime.tv/4816-van-pis.html');
    assert.strictEqual(rows[0].target, '_blank');
    assert.match(rows[0].textContent, /смотреть/);
});

test('не найдено: остаётся поиск на сайте, а где поиска нет — честная пометка', async () => {
    const { rows, box } = await render([]);
    const jutsu = rows.find(r => r.dataset.site === 'jutsu');
    assert.match(jutsu.getAttribute('href'), /^https:\/\/jut-su\.net\/.*ag_from=animeplus$/);
    assert.match(jutsu.textContent, /искать/);
    const yummy = rows.find(r => r.dataset.site === 'yummy_ru');
    assert.strictEqual(yummy.tagName, 'DIV');
    assert.match(yummy.textContent, /нет на сайте/);
    assert.match(box.querySelector('.ag-wc__note').textContent, /прямых ссылок/);
});

test('клик запоминает тайтл в недавних', async () => {
    const { rows, sent } = await render([{ siteId: 'jutsu', url: 'https://jut-su.net/6030-x.html' }]);
    rows[0].addEventListener('click', (e) => e.preventDefault());
    rows[0].click();
    const history = sent.find(m => m.action === 'add_watch_history');
    assert.strictEqual(history.item.url, 'https://jut-su.net/6030-x.html');
    assert.strictEqual(history.item.russian, DATA.russian);
});

test('все остальные сайты выключены: без поиска', async () => {
    const sites_enabled = Object.fromEntries(['jutsu', 'yummy_ru', 'yummy_old', 'yummyanime_tv', 'animego_online', 'yammy_club'].map(id => [id, false]));
    const { sent, rows, box } = await render([], { sites_enabled });
    assert.strictEqual(rows.length, 0);
    assert.ok(!sent.some(m => m.action === 'resolve_all_sites'));
    assert.match(box.textContent, /выключены/);
});

test('сайт не ответил: пишем «нет ответа», а не «нет на сайте»', async () => {
    const { rows } = await render([{ siteId: 'yummy_ru', url: null, timedOut: true }, { siteId: 'yummy_old', url: null, timedOut: false }]);
    assert.match(rows.find(r => r.dataset.site === 'yummy_ru').textContent, /нет ответа/);
    assert.match(rows.find(r => r.dataset.site === 'yummy_old').textContent, /нет на сайте/);
});
