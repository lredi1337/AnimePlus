// Интеграция: реальный providers/runtime.js + все фичи на снимке страницы тайтла.
// chrome.* — заглушка, которая отвечает как background.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const FILES = [
    'config.js',
    'modules/shared/sites.js',
    'modules/shared/ui-kit.js',
    'modules/shared/guide.js',
    'modules/shared/guide-fox.js',
    'modules/shared/title-match.js',
    'modules/shared/native-fs.js',
    'modules/shared/player-choice.js',
    'modules/ui-utils.js',
    'modules/site-selectors.js',
    'modules/progress-tracker.js',
    'providers/base.js',
    'providers/dle.js',
    'providers/yani.js',
    'features/player-bridge.js',
    'features/fox-dock.js',
    'features/search-redirect.js',
    'providers/runtime.js'
];

const TOP = Array.from({ length: 3 }, (_, i) => ({
    id: 100 + i, name: `Anime ${i}`, russian: `Аниме ${i}`, score: '9.0', kind: 'tv', aired_on: '2020-01-01', episodes: 12,
    image: { original: i === 0 ? '/assets/globals/missing_original.jpg' : `/system/animes/original/${100 + i}.jpg` }
}));

async function startRuntime({ url, html, settings = {} }) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, set(v) { this.textContent = v; }, configurable: true });

    const store = { ag_settings: settings };
    const storageListeners = [];
    const sent = [];
    const respond = (msg) => {
        switch (msg.action) {
            case 'resolve_shikimori_id': return { id: 61987, episodes: 12 };
            case 'fetch_shikimori':
                if (/order=ranked.*[&?]page=1(&|$)/.test(msg.url)) return { status: 200, data: TOP };
                if (/order=ranked/.test(msg.url)) return { status: 200, data: [] };
                return { status: 200, data: { id: 61987, score: '8.92' } };
            case 'resolve_shiki_posters': return { posters: { 100: 'https://shikimori.io/uploads/poster/animes/100/main.webp' } };
            case 'resolve_all_sites': return { results: msg.siteIds.map(id => ({ siteId: id, url: id === 'jutsu' ? 'https://jut-su.net/1-x.html' : null })) };
            case 'get_random_shikimori_anime': return { url: 'https://ru.yummyani.me/catalog#naruto-tv-1', id: 20, name: 'Naruto', russian: 'Наруто' };
            default: return null;
        }
    };
    w.chrome = {
        runtime: {
            id: 'test-extension',
            getURL: (p) => `chrome-extension://test-extension/${p}`,
            onMessage: { addListener() {} },
            sendMessage: (msg, cb) => { sent.push(msg); Promise.resolve(respond(msg)).then(r => cb && cb(r)); }
        },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, store[k]])),
                set: async (obj) => {
                    const changes = {};
                    for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; }
                    storageListeners.forEach(fn => fn(changes, 'local'));
                }
            },
            onChanged: { addListener: (fn) => storageListeners.push(fn) }
        }
    };
    w.fetch = async () => ({ ok: false, json: async () => ({}) });

    for (const f of FILES) w.eval(read(f));
    await w.AgProviders.start();
    return { w, sent, store };
}

const tick = (ms = 400) => new Promise(r => setTimeout(r, ms));

// Значок Anime+ живёт в собственном Shadow DOM, прикреплён к <html>
const dockOf = (doc) => doc.querySelector('ag-fox-dock');
const shadowOf = (doc) => dockOf(doc) && dockOf(doc).shadowRoot;
const openMenu = async (w) => {
    const fab = shadowOf(w.document).querySelector('.fab');
    fab.dispatchEvent(new w.PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
    fab.dispatchEvent(new w.PointerEvent('pointerup', { button: 0, clientX: 10, clientY: 10, bubbles: true }));
    await tick(100);
    return shadowOf(w.document).querySelector('.menu');
};
const menuItem = (menu, re) => [...menu.querySelectorAll('.item')].find(i => !i.hidden && re.test(i.textContent));

test('runtime на yammyanime.club: Kodik, значок, Топ, мост плеера, выключение сайта', async () => {
    const tabsClicked = [];
    const { w, sent } = await startRuntime({
        url: 'https://yammyanime.club/catalog/item/monolog-farmacevta-3-sezon-c1',
        html: read('tests/fixtures/yammy_club-title.html')
    });
    const doc = w.document;
    doc.querySelectorAll('[data-player-anime-id] .tabs-block__select > *').forEach(t => t.addEventListener('click', () => tabsClicked.push(t.textContent.trim())));
    await tick(600);

    // 1. Kodik: при старте вкладка уже была нажата (до подписки теста) — проверяем, что повторных кликов нет
    assert.ok(tabsClicked.length <= 1);

    // 2. В вёрстку сайта ничего не встроено: ни панели под заголовком, ни пункта меню, ни стилей меню
    assert.equal(doc.querySelector('.ag-tw, .ag-top-nav-link, .ag-top-nav-wrapper'), null);
    assert.ok(!Array.from(doc.querySelectorAll('style')).some(s => /header__menu/.test(s.textContent)), 'меню сайта не перестраивается');
    assert.equal(dockOf(doc).parentElement, doc.documentElement, 'значок прикреплён к <html>, а не к разметке сайта');

    // 3. Меню значка: оценка Shikimori тайтла, Топ и случайный тайтл, без «Смотреть на…»
    const menu = await openMenu(w);
    assert.equal(menu.hidden, false);
    await tick();
    const rating = menuItem(menu, /★\s*Shikimori/);
    assert.match(rating.textContent, /★\s*Shikimori 8\.92/);
    assert.equal(rating.getAttribute('href'), 'https://shikimori.io/animes/61987');
    assert.ok(!/Смотреть на/.test(menu.textContent));
    assert.ok(!sent.some(m => m.action === 'resolve_all_sites'), 'другие сайты не ищутся');

    menuItem(menu, /Топ Shikimori/).click();
    assert.equal(menu.hidden, true, 'меню закрылось');
    const frame = shadowOf(doc).querySelector('.top-frame');
    assert.ok(frame, 'Топ открыт поверх страницы, в кадре внутри значка');
    const src = new URL(frame.getAttribute('src'));
    assert.equal(src.pathname, '/top/frame.html');
    assert.deepEqual(Object.fromEntries(src.searchParams), { embed: '1', site: 'yammy_club', origin: 'https://yammyanime.club' });
    assert.equal(w.location.pathname, '/catalog/item/monolog-farmacevta-3-sezon-c1', 'страница сайта осталась открытой');
    assert.equal(doc.documentElement.style.overflow, 'hidden', 'страница под Топом не прокручивается');

    // Кадр Топа просит открыть тайтл: чужой адрес и чужой отправитель не принимаются
    const fromFrame = (data, source = frame.contentWindow) => w.dispatchEvent(new w.MessageEvent('message', { data: { source: 'anime-plus-top', ...data }, source }));
    fromFrame({ type: 'open', url: 'https://evil.example/x' });
    fromFrame({ type: 'open', url: 'https://yammyanime.club/catalog/item/monolog-farmacevta-3-sezon-c1#chuzhoy' }, w);
    await tick(50);
    assert.equal(w.location.hash, '', 'адрес не изменился');
    fromFrame({ type: 'open', url: 'https://yammyanime.club/catalog/item/monolog-farmacevta-3-sezon-c1#svoy' });
    await tick(50);
    assert.equal(w.location.hash, '#svoy', 'тайтл этого сайта открыт');
    fromFrame({ type: 'close' });
    assert.equal(shadowOf(doc).querySelector('.top-frame'), null, 'Топ закрыт');
    assert.equal(doc.documentElement.style.overflow, '', 'прокрутка страницы вернулась');

    // 4. Мост плеера: AG_GET_DATA от Kodik → AG_DATA + FS-состояние
    const replies = [];
    const kodikWin = { postMessage: (m) => replies.push(m) };
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'AG_EPISODE_CHANGED', episode: '4' }, origin: 'https://kodikplayer.com', source: kodikWin }));
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'AG_GET_DATA' }, origin: 'https://kodikplayer.com', source: kodikWin }));
    await tick();
    const agData = replies.find(m => m.type === 'AG_DATA');
    assert.ok(agData, 'ответ AG_DATA');
    assert.ok(replies.some(m => m.type === 'AG_FS_STATE'));

    // Чужой origin игнорируется
    const before = replies.length;
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'AG_GET_DATA' }, origin: 'https://evil.example', source: kodikWin }));
    await tick(100);
    assert.equal(replies.length, before);

    // Псевдо-фуллскрин контейнера плеера: значок не лежит поверх видео
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'AG_PSEUDO_FS', action: 'enable' }, origin: 'https://kodikplayer.com', source: kodikWin }));
    await tick(50);
    assert.ok(doc.querySelector('.ag-pfs-active'));
    assert.ok(sent.some(m => m.action === 'fullscreen_on'));
    assert.equal(dockOf(doc).hidden, true, 'значок спрятан в полноэкранном режиме');

    // 5. Выключение сайта из popup: всё вставленное убирается, фуллскрин снимается, без перезагрузки
    await w.chrome.storage.local.set({ ag_settings: { sites_enabled: { yammy_club: false } } });
    await tick(100);
    assert.equal(dockOf(doc), null, 'значок убран');
    assert.equal(doc.querySelector('.ag-pfs-active'), null, 'фуллскрин снят');
    assert.ok(!doc.body.classList.contains('ag-no-scroll'));

    // Включение обратно — всё монтируется снова
    await w.chrome.storage.local.set({ ag_settings: { sites_enabled: {} } });
    await tick(600);
    assert.ok(dockOf(doc), 'значок вернулся');
    assert.equal(doc.querySelectorAll('ag-fox-dock').length, 1);
    w.close();
});

test('runtime: выключенный сайт не монтируется вовсе', async () => {
    const { w } = await startRuntime({
        url: 'https://animego.online/6003-monolog-farmacevta-3-sezon-o1.html',
        html: read('tests/fixtures/animego_online-title.html'),
        settings: { sites_enabled: { animego_online: false } }
    });
    await tick(400);
    assert.equal(dockOf(w.document), null);
    w.close();
});

test('runtime: AnimeGO.me и Jut-Su остаются на собственных модулях', async () => {
    const { w, sent } = await startRuntime({ url: 'https://jut-su.net/67-x.html', html: '<h1>x</h1><div data-player-anime-id="1"></div>' });
    await tick(200);
    assert.equal(dockOf(w.document), null);
    assert.equal(sent.length, 0);
    w.close();
});

test('runtime SPA (ru.yummyani.me): оценка только на странице тайтла, значок не дублируется', async () => {
    const { w } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: '<header><ul><li><a href="/catalog/top">Топ</a></li></ul></header><main id="root"></main>' });
    const api = read('tests/fixtures/yani-api-anime.json');
    w.fetch = async () => ({ ok: true, json: async () => JSON.parse(api) });
    const doc = w.document;
    await tick(300);
    let menu = await openMenu(w);
    assert.equal(menuItem(menu, /★\s*Shikimori/), undefined, 'на каталоге оценки нет');
    assert.ok(menuItem(menu, /Топ Shikimori/), 'Топ есть на любой странице');

    // Клиентский переход: React меняет DOM и адрес через history.pushState
    doc.getElementById('root').innerHTML = '<div><h1>Монолог фармацевта 3</h1></div>';
    w.history.pushState({}, '', '/catalog/item/monolog-farmacevta-3');
    await tick(1800); // опрос адреса раз в секунду + монтирование
    menu = await openMenu(w);
    await tick();
    assert.match(menuItem(menu, /Shikimori/).textContent, /★\s*Shikimori/, 'оценка появилась после SPA-перехода');

    doc.getElementById('root').innerHTML = '<div>Каталог</div>';
    w.history.pushState({}, '', '/catalog');
    await tick(1500);
    assert.equal(doc.querySelectorAll('ag-fox-dock').length, 1, 'значок не дублируется после перемонтирования');
    menu = await openMenu(w);
    assert.equal(menuItem(menu, /★\s*Shikimori/), undefined, 'оценка убрана при уходе со страницы тайтла');
    w.close();
});

test('runtime: «Случайное аниме» в значке подбирает тайтл для этого сайта и переходит на него', async () => {
    const html = '<nav class="bo"><a href="/catalog/random" class="fO" data-hotkey-id="random"><span class="fP">СЛУЧАЙНОЕ</span></a></nav>';
    const { w, sent } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html, settings: { random_min_score: '8.0', random_kinds: ['tv', 'movie'] } });
    await tick(300);

    // Кнопку сайта расширение больше не перехватывает
    const siteLink = w.document.querySelector('a[href="/catalog/random"]');
    siteLink.addEventListener('click', (e) => e.preventDefault());
    siteLink.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick(50);
    assert.ok(!sent.some(m => m.action === 'get_random_shikimori_anime'), 'нажатие на кнопку сайта не перехвачено');

    const menu = await openMenu(w);
    menuItem(menu, /Случайное аниме/).click();
    await tick(50);
    const randomMsg = sent.find(m => m.action === 'get_random_shikimori_anime');
    assert.ok(randomMsg, 'сообщение get_random_shikimori_anime отправлено');
    assert.equal(randomMsg.siteId, 'yummy_ru', 'передан siteId yummy_ru');
    assert.equal(w.location.hash, '#naruto-tv-1', 'выполнен переход по подобранному URL');
    w.close();
});

test('runtime: «Случайное аниме» без подходящих тайтлов пишет причину в меню и остаётся на странице', async () => {
    const { w } = await startRuntime({ url: 'https://ru.yummyani.me/', html: '<main></main>', settings: { random_min_score: '9.0' } });
    await tick(300);
    let alerted = false;
    w.alert = () => { alerted = true; };
    w.chrome.runtime.sendMessage = (msg, cb) => {
        if (msg.action === 'get_random_shikimori_anime') cb({ url: null, reason: 'no_match', minScore: 9 });
    };
    const menu = await openMenu(w);
    menuItem(menu, /Случайное аниме/).click();
    await tick(50);
    assert.match(menu.querySelector('.note').textContent, /9/);
    assert.equal(alerted, false, 'без всплывающих окон браузера');
    assert.equal(w.location.href, 'https://ru.yummyani.me/', 'страница осталась прежней');
    w.close();
});

test('runtime: значок перетаскивается в ближайший угол и запоминает его', async () => {
    const { w, store } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: '<main></main>' });
    await tick(300);
    const dock = dockOf(w.document);
    const fab = shadowOf(w.document).querySelector('.fab');
    assert.equal(dock.dataset.corner, 'br', 'по умолчанию правый нижний угол');
    fab.dispatchEvent(new w.PointerEvent('pointerdown', { button: 0, clientX: 1000, clientY: 700, bubbles: true }));
    fab.dispatchEvent(new w.PointerEvent('pointermove', { clientX: 400, clientY: 300, bubbles: true }));
    fab.dispatchEvent(new w.PointerEvent('pointermove', { clientX: 20, clientY: 30, bubbles: true }));
    fab.dispatchEvent(new w.PointerEvent('pointerup', { button: 0, clientX: 20, clientY: 30, bubbles: true }));
    await tick(50);
    assert.equal(dock.dataset.corner, 'tl');
    assert.equal(store.ag_fox_corner, 'tl');
    assert.equal(shadowOf(w.document).querySelector('.menu').hidden, true, 'перетаскивание не открывает меню');
    w.close();
});

test('runtime: старая ссылка …#ag-top-shikimori открывает Топ поверх страницы, Esc закрывает', async () => {
    const { w } = await startRuntime({ url: 'https://ru.yummyani.me/#ag-top-shikimori', html: '<main></main>' });
    await tick(300);
    const frame = shadowOf(w.document).querySelector('.top-frame');
    assert.ok(frame);
    assert.equal(new URL(frame.getAttribute('src')).searchParams.get('site'), 'yummy_ru');
    assert.equal(w.location.hash, '', 'метка убрана из адреса');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(shadowOf(w.document).querySelector('.top-frame'), null);
    w.close();
});


test('runtime: псевдофулскрин на old.yummyani.me изолирует предков через ag-pfs-ancestor и восстанавливает при закрытии', async () => {
    const html = `
        <div id="main-page">
            <header class="header fixed show"><a href="/">Header</a></header>
            <div class="content-block container clearfix">
                <h1>Naruto</h1>
                <div class="content">
                    <div class="tabs-block offset-top no-padding">
                        <div id="video">
                            <div class="video-container">
                                <iframe src="https://kodikplayer.com/serial/123/xxx?episode=1"></iframe>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div id="chatter"><button>Chat</button></div>
            <div id="to-top"><span>Наверх</span></div>
        </div>`;
    const { w, sent } = await startRuntime({
        url: 'https://old.yummyani.me/catalog/item/naruto-tv-1',
        html
    });
    const doc = w.document;
    await tick(300);

    const replies = [];
    const kodikWin = { postMessage: (m) => replies.push(m) };

    // Активируем псевдофулскрин через мост от плеера
    w.dispatchEvent(new w.MessageEvent('message', {
        data: { type: 'AG_PSEUDO_FS', action: 'enable' },
        origin: 'https://kodikplayer.com',
        source: kodikWin
    }));
    await tick(50);

    assert.ok(doc.documentElement.classList.contains('ag-pfs-root'), 'html получил класс ag-pfs-root');
    assert.ok(doc.body.classList.contains('ag-no-scroll'), 'body получил класс ag-no-scroll');

    const activeContainer = doc.querySelector('.ag-pfs-active');
    assert.ok(activeContainer, 'контейнер плеера получил ag-pfs-active');
    assert.equal(activeContainer.id, 'video', 'контейнером стал #video');

    // Проверяем, что все предки контейнера (вплоть до body) получили класс ag-pfs-ancestor
    const tabsBlock = doc.querySelector('.tabs-block');
    const contentBlock = doc.querySelector('.content-block');
    const mainPage = doc.querySelector('#main-page');
    assert.ok(tabsBlock.classList.contains('ag-pfs-ancestor'), '.tabs-block помечен как ag-pfs-ancestor');
    assert.ok(contentBlock.classList.contains('ag-pfs-ancestor'), '.content-block помечен как ag-pfs-ancestor (для нейтрализации stacking context flex)');
    assert.ok(mainPage.classList.contains('ag-pfs-ancestor'), '#main-page помечен как ag-pfs-ancestor');

    assert.ok(sent.some(m => m.action === 'fullscreen_on'), 'fullscreen_on отправлен в background');

    // Нажатие Escape отключает псевдофулскрин и очищает все классы предков
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(50);

    assert.ok(!doc.documentElement.classList.contains('ag-pfs-root'), 'ag-pfs-root снят с html');
    assert.ok(!doc.body.classList.contains('ag-no-scroll'), 'ag-no-scroll снят с body');
    assert.equal(doc.querySelector('.ag-pfs-active'), null, 'ag-pfs-active снят');
    assert.equal(doc.querySelectorAll('.ag-pfs-ancestor').length, 0, 'все классы ag-pfs-ancestor очищены');
    assert.ok(sent.some(m => m.action === 'fullscreen_off'), 'fullscreen_off отправлен в background');

    w.close();
});

test('runtime: значок изолирован от стилей сайта (yummyanime.tv)', async () => {
    const html = '<style>button { height: 40px; background: purple; }</style><main><h1>Аниме</h1><div data-player-anime-id="1"></div></main>';
    const { w } = await startRuntime({ url: 'https://yummyanime.tv/1-naruto.html', html });
    await tick(300);
    const root = shadowOf(w.document);
    assert.ok(root, 'у значка свой Shadow DOM');
    assert.match(root.querySelector('style').textContent, /:host \{ all: initial/, 'наследуемые стили сайта сброшены');
    assert.equal(w.document.querySelectorAll('[class^="ag-top"], .ag-tw').length, 0);
    w.close();
});


test('runtime: псевдофулскрин на yummyanime.tv находит активный слот с Kodik и разворачивает его на весь экран', async () => {
    const { w, sent } = await startRuntime({
        url: 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-r1.html',
        html: read('tests/fixtures/yummyanime_tv-title.html')
    });
    const doc = w.document;
    await tick(300);

    const player = doc.querySelector('[data-player-anime-id]');
    assert.ok(player, 'плеер найден');

    // Симулируем выбор вкладки Kodik (слот 1) и монтирование iframe Kodik
    const tabs = player.querySelectorAll('.tabs-block__select > *');
    tabs[0].classList.remove('is-active');
    tabs[1].classList.add('is-active');

    const slot0 = player.querySelector('[data-player-slot="0"]');
    const slot1 = player.querySelector('[data-player-slot="1"]');
    slot0.style.display = 'none';
    slot1.style.display = 'block';

    const replies = [];
    const kodikIframe = doc.createElement('iframe');
    kodikIframe.src = 'https://kodikplayer.com/serial/8522/xxx?episode=1';
    slot1.appendChild(kodikIframe);

    const kodikWin = { postMessage: (m) => replies.push(m) };

    // Активируем псевдофулскрин сообщением от Kodik
    w.dispatchEvent(new w.MessageEvent('message', {
        data: { type: 'AG_PSEUDO_FS', action: 'enable' },
        origin: 'https://kodikplayer.com',
        source: kodikWin
    }));
    await tick(50);

    assert.ok(doc.documentElement.classList.contains('ag-pfs-root'), 'html получил класс ag-pfs-root');
    assert.ok(doc.body.classList.contains('ag-no-scroll'), 'body получил класс ag-no-scroll');

    const activeContainer = doc.querySelector('.ag-pfs-active');
    assert.ok(activeContainer, 'активный контейнер получил класс ag-pfs-active');
    assert.equal(activeContainer, slot1, 'псевдофулскрин развернул именно активный слот с Kodik (slot 1), а не скрытый slot 0');

    // Проверяем, что предки изолированы классом ag-pfs-ancestor
    assert.ok(player.classList.contains('ag-pfs-ancestor'), 'родитель .inner-page__player помечен как ag-pfs-ancestor');
    const main = doc.querySelector('.inner-page__main');
    assert.ok(main.classList.contains('ag-pfs-ancestor'), '.inner-page__main помечен как ag-pfs-ancestor');

    // Ответ в Kodik содержит active: true
    assert.ok(replies.some(r => r.type === 'AG_FS_STATE' && r.active === true), 'Kodik уведомлен о включении фуллскрина');
    assert.ok(sent.some(m => m.action === 'fullscreen_on'), 'fullscreen_on отправлен в background');

    // Нажатие Escape отключает псевдофулскрин
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick(50);

    assert.ok(!doc.documentElement.classList.contains('ag-pfs-root'), 'ag-pfs-root снят с html');
    assert.ok(!doc.body.classList.contains('ag-no-scroll'), 'ag-no-scroll снят с body');
    assert.equal(doc.querySelector('.ag-pfs-active'), null, 'ag-pfs-active снят');
    assert.equal(doc.querySelectorAll('.ag-pfs-ancestor').length, 0, 'все классы ag-pfs-ancestor очищены');
    assert.ok(sent.some(m => m.action === 'fullscreen_off'), 'fullscreen_off отправлен в background');

    w.close();
});
test('runtime: переключение серии (AG_NAV) на yummyanime.tv передаёт команду AG_SWITCH_KODIK_EPISODE в Kodik', async () => {
    const { w } = await startRuntime({
        url: 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-r1.html',
        html: read('tests/fixtures/yummyanime_tv-title.html')
    });
    const doc = w.document;
    await tick(300);

    const slot1 = doc.querySelector('[data-player-slot="1"]');
    const replies = [];
    const kodikIframe = doc.createElement('iframe');
    kodikIframe.src = 'https://kodikplayer.com/serial/8522/xxx?episode=1';
    const kodikWin = { postMessage: (m) => replies.push(m) };
    Object.defineProperty(kodikIframe, 'contentWindow', { value: kodikWin, configurable: true });
    slot1.appendChild(kodikIframe);

    // Симулируем отправку сообщения перехода к следующей серии от Kodik (нажатие кнопки > или хоткей)
    w.dispatchEvent(new w.MessageEvent('message', {
        data: { type: 'AG_NAV', dir: 'next' },
        origin: 'https://kodikplayer.com',
        source: kodikWin
    }));
    await tick(50);

    const switchNext = replies.find(r => r.type === 'AG_SWITCH_KODIK_EPISODE' && r.dir === 'next');
    assert.ok(switchNext, 'Kodik получил команду AG_SWITCH_KODIK_EPISODE с dir=next');

    // Симулируем отправку сообщения перехода к предыдущей серии
    w.dispatchEvent(new w.MessageEvent('message', {
        data: { type: 'AG_NAV', dir: 'prev' },
        origin: 'https://kodikplayer.com',
        source: kodikWin
    }));
    await tick(50);

    const switchPrev = replies.find(r => r.type === 'AG_SWITCH_KODIK_EPISODE' && r.dir === 'prev');
    assert.ok(switchPrev, 'Kodik получил команду AG_SWITCH_KODIK_EPISODE с dir=prev');

    w.close();
});
// Разметка шапки снята с живого ru.yummyani.me (сокращена)
const RU_HEADER = `
    <header><nav class="bo">
        <div data-variant="top" class="fM dm" id="anime"><a href="/catalog" class="fO"><span class="fP">АНИМЕ</span></a>
            <div style="display:none"><div class="db" id="anime-menu">
                <a href="/catalog/schedule" itemprop="url" data-hotkey-id="schedule" data-hotkey="g s" class="hO dm"><svg width="16" height="16" viewBox="0 0 20 20"><path d="M1 1"></path></svg> <span itemprop="name">Расписание онгоингов</span> <span class="hP"></span></a>
            </div></div>
        </div>
        <div data-variant="top" class="fM dm" id="top-item"><a href="/catalog/top" class="fO"><span class="fP">ТОП 100</span></a></div>
    </nav></header>`;

test('меню сайтов не меняются: ru.yummyani.me и animego.online', async () => {
    const ru = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: RU_HEADER });
    const before = new JSDOM(RU_HEADER).window.document.querySelector('header').outerHTML;
    await tick(300);
    assert.equal(ru.w.document.querySelector('header').outerHTML, before, 'шапка ru.yummyani.me как у сайта');
    ru.w.close();

    const fixture = read('tests/fixtures/animego_online-title.html');
    const ao = await startRuntime({ url: 'https://animego.online/6003-monolog-farmacevta-3-sezon-o1.html', html: fixture });
    await tick(600);
    const menuNow = ao.w.document.querySelector('.animego-online-header__menu--bothead > ul').outerHTML;
    const menuWas = new JSDOM(fixture).window.document.querySelector('.animego-online-header__menu--bothead > ul').outerHTML;
    assert.equal(menuNow, menuWas, 'меню animego.online как у сайта');
    const css = [...ao.w.document.querySelectorAll('style')].map(s => s.textContent).join('\n');
    assert.doesNotMatch(css, /bothead/, 'отступы меню не трогаем');
    assert.ok(dockOf(ao.w.document), 'значок есть');
    ao.w.close();
});

test('runtime: лиса один раз рассказывает о значке, ответ запоминается, открытие меню отмечает задание', async () => {
    const { w, store } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: '<main></main>' });
    const tip = () => shadowOf(w.document).querySelector('.tip');
    await tick(300);
    assert.equal(tip().hidden, true, 'не сразу');
    await tick(1500);
    assert.equal(tip().hidden, false, 'подсказка показана');
    assert.match(tip().textContent, /Топ Shikimori/);
    [...tip().querySelectorAll('button')].find(b => /Понятно/.test(b.textContent)).click();
    await tick(50);
    assert.equal(tip().hidden, true);
    assert.equal(store.ag_guide.dockTipDone, true, 'больше не покажется');

    const menu = await openMenu(w);
    await tick(50);
    assert.equal(menu.hidden, false);
    assert.equal(store.ag_guide.tasks.dock, true, 'задание «Нажмите на лису» выполнено');
    w.close();
});

test('runtime: подсказка уже была — не показывается; «Показать» открывает меню', async () => {
    const seen = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: '<main></main>', settings: {} });
    await seen.w.chrome.storage.local.set({ ag_guide: { dockTipDone: true } });
    seen.w.close();

    const { w } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: '<main></main>' });
    await tick(1900);
    const root = shadowOf(w.document);
    [...root.querySelectorAll('.tip button')].find(b => /Показать/.test(b.textContent)).click();
    await tick(50);
    assert.equal(root.querySelector('.menu').hidden, false, '«Показать» открывает меню');
    assert.equal(root.querySelector('.tip').hidden, true);
    w.close();
});

test('мост плеера: рекламный кадр с чужого адреса не управляет страницей', async () => {
    const { w } = await startRuntime({
        url: 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-r1.html',
        html: read('tests/fixtures/yummyanime_tv-title.html')
    });
    const doc = w.document;
    await tick(300);

    // Рекламный кадр на странице сайта
    const replies = [];
    const adFrame = doc.createElement('iframe');
    const adWin = { postMessage: (m) => replies.push(m) };
    Object.defineProperty(adFrame, 'contentWindow', { value: adWin, configurable: true });
    doc.body.appendChild(adFrame);
    const fromAd = (data) => w.dispatchEvent(new w.MessageEvent('message', { data, origin: 'https://ads.example', source: adWin }));

    fromAd({ type: 'AG_GET_DATA' });
    fromAd({ type: 'AG_PSEUDO_FS', action: 'enable' });
    await tick(100);
    assert.equal(replies.length, 0, 'чужому кадру страница не отвечает');
    assert.equal(doc.querySelector('.ag-pfs-active'), null, 'чужой кадр не включил полный экран');

    w.close();
});
