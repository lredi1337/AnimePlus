// Страница «Случайное аниме» (random/random.js): карточка тайтла и кнопки сайтов, где он есть. Открывается кнопкой «Рандом» в окне расширения
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check) => {
    for (let i = 0; i < 150 && !check(); i++) await tick(20);
    return check();
};

const ANIME = {
    id: 7, name: 'Seven', russian: 'Семь <img src=x id=injected>', kind: 'tv', kindLabel: 'Сериал', score: '8.1', year: '2019',
    episodes: 24, status: 'ongoing', genres: ['Экшен', 'Драма'], description: 'Описание тайтла.', poster: 'https://shikimori.io/p.jpg',
    screenshots: Array.from({ length: 10 }, (_, i) => ({ full: `https://shikimori.io/s/o${i}.jpg`, thumb: `https://shikimori.io/s/t${i}.jpg` }))
};

/** cards — ответы фона на get_random_anime_card по очереди; siteUrls — что находит поиск на каждом сайте */
function openPage({ cards = [{ anime: ANIME }], siteUrls = {}, settings = {} } = {}) {
    let cardIndex = 0;
    const { window: w, sent } = makeContentWindow('<div id="app"></div>', 'https://ext.test/random/random.html', {
        onMessage: (msg) => {
            if (msg.action === 'get_random_anime_card') return cards[Math.min(cardIndex++, cards.length - 1)];
            if (msg.action === 'resolve_site_url') return { url: siteUrls[msg.siteId] || null };
            return null;
        }
    });
    const store = { ag_settings: settings };
    w.chrome.storage.local.get = async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]));
    const created = [];
    w.chrome.tabs = { create: (o) => { created.push(o.url); return Promise.resolve(); } };
    w.scrollTo = () => {};
    w.eval(read('modules/shared/ext-page.js'));
    w.eval(read('modules/shared/shot-viewer.js'));
    w.eval(read('random/random.js'));
    return { w, doc: w.document, sent, created };
}

const siteButtons = (doc) => [...doc.querySelectorAll('.rnd__site')].map(b => b.dataset.site);
const NO_ANIMEGO = { sites_enabled: { animego: false } };

test('окно расширения: значок «Случайное аниме» в нижнем ряду рядом с Топом открывает страницу во вкладке', async () => {
    const body = read('popup/popup.html').match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url: 'https://example.test/popup.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const opened = [];
    let answered;
    const tabKnown = new Promise(r => { answered = r; });
    w.chrome = {
        runtime: {
            id: 'test', lastError: null, getURL: (p) => `chrome-extension://x/${p}`, getManifest: () => JSON.parse(read('manifest.json')),
            onMessage: { addListener() {} },
            sendMessage: (msg, cb) => cb && setTimeout(() => cb(msg.action === 'shiki_get_status' ? { isLoggedIn: false, clientId: 'c' } : null), 0)
        },
        tabs: {
            query: (q, cb) => setTimeout(() => { cb([{ id: 1, url: 'chrome://newtab/' }]); answered(); }, 0),
            sendMessage: (id, msg, cb) => setTimeout(() => cb(null), 0),
            reload() {}, create: async (o) => { opened.push(o.url); }
        },
        storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} }, onChanged: { addListener() {} } }
    };
    w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' });
    w.close = () => {};
    for (const f of ['credentials.js', 'config.js', 'modules/shared/sites.js', 'modules/shared/music-link.js', 'modules/shared/ui-kit.js', 'modules/shared/guide.js', 'modules/shared/guide-fox.js', 'popup/popup.js']) w.eval(read(f));
    // DOMContentLoaded jsdom шлёт сам
    await tabKnown;
    await until(() => { w.document.getElementById('btnRandom').click(); return opened.length > 0; });
    assert.equal(opened[0], 'chrome-extension://x/random/random.html');
    assert.ok(w.document.getElementById('btnRandom').closest('.bottom-tabs'));
    assert.equal(w.document.getElementById('btnRandom').previousElementSibling.id, 'btnTop');
    w.close();
});

test('карточка: название текстом, оценка, тип, серии, статус, жанры и фильтры зрителя в шапке', async () => {
    const { w, doc, sent } = openPage({ settings: { ...NO_ANIMEGO, random_min_score: 7, random_kinds: ['tv', 'movie'] } });
    assert.ok(await until(() => doc.querySelector('.rnd__title')));
    assert.equal(doc.querySelector('.rnd__title').textContent, ANIME.russian);
    assert.equal(doc.getElementById('injected'), null, 'название не стало разметкой');
    const meta = doc.querySelector('.rnd__meta').textContent;
    for (const part of ['★ 8.1', 'Сериал', '2019', '24 эп.', 'Онгоинг']) assert.ok(meta.includes(part), part);
    assert.equal(doc.querySelector('.rnd__genres').textContent, 'Экшен · Драма');
    assert.ok(await until(() => doc.querySelector('.rnd__filters').textContent === 'Оценка от 7 · Сериалы, Фильмы'));
    assert.equal(sent.filter(m => m.action === 'get_random_anime_card').length, 1);
    w.close();
});

test('кнопки только тех сайтов, где тайтл нашёлся, в порядке списка, ссылкой в новой вкладке', async () => {
    const { w, doc } = openPage({
        settings: NO_ANIMEGO,
        siteUrls: { animevost: 'https://v14.vost.pw/tip/tv/7-seven.html', jutsu: 'https://jut-su.net/7-seven.html' }
    });
    assert.ok(await until(() => siteButtons(doc).length === 2 && doc.querySelector('.rnd__note').hidden));
    const order = w.AgSites.searchable().map(s => s.id);
    assert.deepEqual(siteButtons(doc), ['jutsu', 'animevost'].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    const jutsu = doc.querySelector('.rnd__site[data-site="jutsu"]');
    assert.equal(jutsu.getAttribute('href'), 'https://jut-su.net/7-seven.html');
    assert.equal(jutsu.getAttribute('target'), '_blank');
    w.close();
});

test('AnimeGO: тайтла нет в каталоге — кнопка ведёт на страницу из данных Shikimori', async () => {
    const { w, doc } = openPage({ settings: { sites_enabled: Object.fromEntries(['jutsu', 'yummy_ru', 'yummy_old', 'yummyanime_tv', 'animego_online', 'yammy_club', 'animevost'].map(id => [id, false])) } });
    assert.ok(await until(() => siteButtons(doc).length === 1));
    assert.match(doc.querySelector('.rnd__site').getAttribute('href'), /^https:\/\/animego\.[a-z]+\/anime\/shiki-7$/);
    w.close();
});

test('нигде не нашлось: подсказка вместо пустого места и ссылка на Shikimori', async () => {
    const { w, doc } = openPage({ settings: NO_ANIMEGO });
    assert.ok(await until(() => /не нашлось/.test(doc.querySelector('.rnd__note')?.textContent || '')));
    assert.equal(siteButtons(doc).length, 0);
    assert.equal(doc.querySelector('.rnd__ghost').getAttribute('href'), 'https://shikimori.io/animes/7');
    w.close();
});

test('«Другое аниме» и пробел просят новый тайтл без показанных; прошлый остаётся в «Уже выпадали»', async () => {
    const cards = [{ anime: ANIME }, { anime: { ...ANIME, id: 9, russian: 'Девять' } }, { anime: { ...ANIME, id: 11, russian: 'Одиннадцать' } }];
    const { w, doc, sent } = openPage({ cards, settings: NO_ANIMEGO });
    assert.ok(await until(() => doc.querySelector('.rnd__title')));
    assert.ok(doc.querySelector('.rnd__history').hidden);
    doc.querySelector('.rnd__next').click();
    assert.ok(await until(() => doc.querySelector('.rnd__title')?.textContent === 'Девять'));
    assert.deepEqual([...sent.filter(m => m.action === 'get_random_anime_card')[1].exclude], [7]);
    assert.ok(!doc.querySelector('.rnd__history').hidden);
    assert.equal(doc.querySelectorAll('.rnd__past').length, 1);

    doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    assert.ok(await until(() => doc.querySelector('.rnd__title')?.textContent === 'Одиннадцать'));
    assert.deepEqual([...sent.filter(m => m.action === 'get_random_anime_card')[2].exclude], [7, 9]);

    // Возврат к выпавшему раньше: без нового запроса тайтла
    doc.querySelector('.rnd__past').click();
    assert.ok(await until(() => doc.querySelector('.rnd__title')?.textContent === 'Девять'));
    assert.equal(sent.filter(m => m.action === 'get_random_anime_card').length, 3);
    w.close();
});

test('под фильтры ничего не подошло — объяснение и путь в настройки; сбой Shikimori — своё сообщение', async () => {
    const a = openPage({ cards: [{ anime: null, reason: 'no_match' }] });
    assert.ok(await until(() => /фильтры/.test(a.doc.querySelector('.rnd__empty')?.textContent || '')));
    a.doc.querySelector('.rnd__empty .rnd__ghost:last-child').click();
    assert.equal(a.created[0], 'chrome-extension://test-extension/options/options.html#random');
    a.w.close();

    const b = openPage({ cards: [{ anime: null, reason: 'error' }] });
    assert.ok(await until(() => /Shikimori/.test(b.doc.querySelector('.rnd__empty')?.textContent || '')));
    b.w.close();
});

test('кадры: восемь превью и «+2», просмотр листается стрелками, Esc закрывает, пробел в просмотре не меняет тайтл', async () => {
    const { w, doc, sent } = openPage({ settings: NO_ANIMEGO });
    assert.ok(await until(() => doc.querySelectorAll('.rnd__shot').length === 8));
    assert.equal(doc.querySelector('.rnd__screens h3').textContent, 'Кадры · 10');
    assert.equal(doc.querySelector('.rnd__shot img').getAttribute('src'), 'https://shikimori.io/s/t0.jpg');
    assert.equal(doc.querySelector('.rnd__shot:last-child .rnd__shot-more').textContent, '+2');

    const viewer = doc.querySelector('.rnd__viewer');
    doc.querySelectorAll('.rnd__shot')[1].click();
    assert.ok(!viewer.hidden);
    // Сразу превью: полный кадр ещё грузится (в jsdom он не грузится вовсе), а прошлый кадр не должен оставаться на экране
    assert.equal(viewer.querySelector('img').getAttribute('src'), 'https://shikimori.io/s/t1.jpg');
    assert.ok(viewer.querySelector('img').classList.contains('is-preview'));
    viewer.querySelector('.rnd__viewer-nav.is-next').click();
    assert.equal(viewer.querySelector('img').getAttribute('src'), 'https://shikimori.io/s/t2.jpg');
    assert.equal(viewer.querySelector('.rnd__viewer-count').textContent, '3 / 10');
    const key = (k, code = k) => doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, code, bubbles: true }));
    key('ArrowLeft');
    key('ArrowLeft');
    key('ArrowLeft');
    assert.equal(viewer.querySelector('.rnd__viewer-count').textContent, '10 / 10');
    key(' ', 'Space');
    await tick();
    assert.equal(sent.filter(m => m.action === 'get_random_anime_card').length, 1);
    key('Escape');
    assert.ok(viewer.hidden);
    w.close();
});

test('«Другое аниме» в шапке страницы: на одном месте при любом тайтле, на время подбора недоступна', async () => {
    const { w, doc } = openPage({ cards: [{ anime: ANIME }, { anime: { ...ANIME, id: 9, russian: 'Девять', description: '' } }], settings: NO_ANIMEGO });
    const next = doc.querySelector('.rnd__head .rnd__next');
    assert.ok(next);
    assert.ok(await until(() => doc.querySelector('.rnd__title')));
    assert.equal(doc.querySelectorAll('.rnd__next').length, 1, 'кнопка одна, в карточке её нет');
    next.click();
    assert.equal(next.disabled, true);
    assert.ok(await until(() => doc.querySelector('.rnd__title')?.textContent === 'Девять' && !next.disabled));
    assert.equal(doc.querySelector('.rnd__head .rnd__next'), next);
    w.close();
});
