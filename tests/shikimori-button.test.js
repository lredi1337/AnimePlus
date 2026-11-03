// Кнопка «▶ Смотреть с Anime+» на странице тайтла Shikimori (content-external.js)
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const URL_TITLE = 'https://shikimori.io/animes/z356-fate-stay-night';
const PAGE = `<h1>Судьба/Ночь схватки <span>/</span> Fate/stay night</h1><div class="c-poster"><div class="c-image"><img></div></div>`;

const tick = () => new Promise(resolve => setTimeout(resolve, 20));

// results — ответ фона на resolve_all_sites; settings — содержимое ag_settings
async function clickWatch({ results = [], settings }) {
    const opened = [];
    const { window: w, sent } = makeContentWindow(PAGE, URL_TITLE, {
        onMessage: (msg) => (msg.action === 'resolve_all_sites' ? { results } : { success: true })
    });
    w.open = (url) => { opened.push(url); return null; };
    w.chrome.storage.local.get = async () => (settings ? { ag_settings: settings } : {});
    w.eval(read('content-external.js'));
    await tick();

    const container = w.document.getElementById('animego-redirect-container');
    assert.ok(container, 'кнопка должна появиться на странице тайтла');
    container.querySelector('a').click();
    await tick();
    return { container, opened, sent, window: w };
}

const labels = (container) => Array.from(container.querySelectorAll('a')).map(a => a.textContent.replace(/ /g, ' '));

test('ищет на всех включённых сайтах и передаёт ID и названия целиком', async () => {
    const { sent } = await clickWatch({ settings: { sites_enabled: { yummy_old: false } } });
    const msg = sent.find(m => m.action === 'resolve_all_sites');
    assert.deepStrictEqual(Array.from(msg.titles), ['Судьба/Ночь схватки', 'Fate/stay night']);
    assert.strictEqual(msg.shikimoriId, '356');
    assert.ok(msg.siteIds.includes('yammy_club') && msg.siteIds.includes('animego'));
    assert.ok(!msg.siteIds.includes('yummy_old'));
});

test('несколько сайтов: кнопка на каждый найденный, ничего не открывается само', async () => {
    const { container, opened, sent } = await clickWatch({
        results: [
            { siteId: 'animego', url: 'https://animego.me/anime/a-1' },
            { siteId: 'yummy_ru', url: null },
            { siteId: 'yammy_club', url: 'https://yammyanime.club/catalog/item/a' }
        ]
    });
    assert.deepStrictEqual(labels(container), ['AnimeGO', 'YummyAnime.Club']);
    assert.deepStrictEqual(opened, []);

    container.querySelectorAll('a')[1].click();
    assert.deepStrictEqual(opened, ['https://yammyanime.club/catalog/item/a']);
    assert.ok(!sent.some(m => m.action === 'add_watch_history'), 'нажатие ещё не просмотр: «Продолжить» не меняется');
});

test('один сайт: открывается сразу, кнопка остаётся на случай блокировки окна', async () => {
    const { container, opened } = await clickWatch({
        results: [{ siteId: 'animego_online', url: 'https://animego.online/1-a.html' }]
    });
    assert.deepStrictEqual(opened, ['https://animego.online/1-a.html']);
    assert.deepStrictEqual(labels(container), ['▶ Смотреть на AnimeGO.online']);
});

test('нигде не найдено: поиск на первом сайте со страницей поиска', async () => {
    const { container, opened } = await clickWatch({ settings: { sites_enabled: { jutsu: false } } });
    assert.strictEqual(opened.length, 1);
    assert.ok(opened[0].startsWith('https://yummyanime.tv/index.php?do=search'));
    assert.ok(opened[0].endsWith('&ag_from=animeplus'));
    assert.deepStrictEqual(labels(container), ['▶ Искать на YummyAnime.TV']);
});

test('все сайты выключены: без поиска и новых вкладок', async () => {
    const { container, opened, sent } = await clickWatch({ settings: { global_enabled: false } });
    assert.ok(!sent.some(m => m.action === 'resolve_all_sites'));
    assert.deepStrictEqual(opened, []);
    assert.deepStrictEqual(labels(container), ['Все сайты выключены в Anime+']);
});
