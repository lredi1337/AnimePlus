// Проверка разметки AnimeGO не должна считать поломкой страницы, где <main> нет по устройству сайта
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const HEADER = '<header><nav class="navbar-nav header-navbar-nav"></nav></header>';

async function missingOn(html, url) {
    const { window: w } = makeContentWindow(html, url);
    w.eval(read('modules/site-selectors.js'));
    const missing = await w.agCheckSelectorHealth('animego', ['any']);
    return Array.from(missing);
}

test('главная AnimeGO без <main>: разметка считается целой', async () => {
    const html = `<div class="wrapper" data-dynamic-content>${HEADER}<div class="content card"></div></div>`;
    assert.deepStrictEqual(await missingOn(html, 'https://animego.me/'), []);
});

test('внутренняя страница AnimeGO с <main>: разметка считается целой', async () => {
    const html = `<div class="wrapper">${HEADER}<main class="content_first content card"></main></div>`;
    assert.deepStrictEqual(await missingOn(html, 'https://animego.me/anime'), []);
});

test('если каркаса страницы нет совсем, проверка сообщает о поломке', async () => {
    assert.deepStrictEqual(await missingOn(`<div class="wrapper">${HEADER}</div>`, 'https://animego.me/anime'), ['main']);
});
