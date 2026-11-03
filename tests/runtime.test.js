// Интеграция: реальный providers/runtime.js + все фичи на снимке страницы тайтла.
// chrome.* — заглушка, которая отвечает как background.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const FILES = [
    'config.js',
    'modules/shared/sites.js',
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
    'features/title-widgets.js',
    'features/top-overlay.js',
    'features/search-redirect.js',
    'features/random-anime.js',
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

test('runtime на yammyanime.club: Kodik, виджеты, Топ, мост плеера, выключение сайта', async () => {
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

    // 2. Панель тайтла: Shikimori ★ и «Смотреть на…»
    const bar = doc.querySelector('.ag-tw');
    assert.ok(bar, 'панель вставлена');
    assert.match(bar.textContent, /Shikimori ★ 8\.92/);
    const toggle = [...bar.querySelectorAll('button')].find(b => /Смотреть на/.test(b.textContent));
    toggle.click();
    await tick();
    const items = [...bar.querySelectorAll('.ag-tw__item')];
    assert.ok(items.length >= 5, 'все остальные сайты в меню');
    const jutsuItem = items.find(i => /Jut-Su/.test(i.textContent));
    assert.equal(jutsuItem.getAttribute('href'), 'https://jut-su.net/1-x.html');
    assert.ok(items.filter(i => i.classList.contains('is-missing')).length >= 1, 'ненайденные помечены');
    assert.ok(!items.some(i => /YummyAnime\.Club/.test(i.textContent)), 'текущий сайт не предлагается');

    // 3. Пункт «Топ Shikimori» в меню сайта + оверлей с карточками и постерами
    const navLink = doc.querySelector('.ag-top-nav-link');
    assert.ok(navLink, 'пункт меню добавлен');
    navLink.click();
    await tick();
    const cards = doc.querySelectorAll('.ag-top-ov__card');
    assert.equal(cards.length, 3);
    const firstImg = cards[0].querySelector('img');
    assert.equal(firstImg.getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(firstImg.src, 'https://shikimori.io/uploads/poster/animes/100/main.webp', 'заглушка «missing» заменена постером из GraphQL');
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('.ag-top-ov'), null, 'Esc закрывает оверлей');

    // 3.1. Оформление меню сайта
    const injectedStyles = Array.from(doc.querySelectorAll('style')).map(s => s.textContent);
    assert.ok(injectedStyles.some(s => s.includes('.header__menu { flex-wrap: nowrap !important; }')), 'navCss с flex-wrap: nowrap применён');

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

    // Псевдо-фуллскрин контейнера плеера
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'AG_PSEUDO_FS', action: 'enable' }, origin: 'https://kodikplayer.com', source: kodikWin }));
    await tick(50);
    assert.ok(doc.querySelector('.ag-pfs-active'));
    assert.ok(sent.some(m => m.action === 'fullscreen_on'));

    // 5. Выключение сайта из popup: всё вставленное убирается, фуллскрин снимается, без перезагрузки
    await w.chrome.storage.local.set({ ag_settings: { sites_enabled: { yammy_club: false } } });
    await tick(100);
    assert.equal(doc.querySelector('.ag-tw'), null, 'панель убрана');
    assert.equal(doc.querySelector('.ag-top-nav-link'), null, 'пункт меню убран');
    assert.equal(doc.querySelector('.ag-pfs-active'), null, 'фуллскрин снят');
    assert.ok(!doc.body.classList.contains('ag-no-scroll'));

    // Включение обратно — всё монтируется снова
    await w.chrome.storage.local.set({ ag_settings: { sites_enabled: {} } });
    await tick(600);
    assert.ok(doc.querySelector('.ag-tw'), 'панель вернулась');
    w.close();
});



test('runtime: выключенный сайт не монтируется вовсе', async () => {
    const { w } = await startRuntime({
        url: 'https://animego.online/6003-monolog-farmacevta-3-sezon-o1.html',
        html: read('tests/fixtures/animego_online-title.html'),
        settings: { sites_enabled: { animego_online: false } }
    });
    await tick(400);
    assert.equal(w.document.querySelector('.ag-tw'), null);
    assert.equal(w.document.querySelector('.ag-top-nav-link'), null);
    w.close();
});



test('runtime: AnimeGO.me и Jut-Su остаются на собственных модулях', async () => {
    const { w, sent } = await startRuntime({ url: 'https://jut-su.net/67-x.html', html: '<h1>x</h1><div data-player-anime-id="1"></div>' });
    await tick(200);
    assert.equal(w.document.querySelector('.ag-tw'), null);
    assert.equal(sent.length, 0);
    w.close();
});



test('runtime SPA (ru.yummyani.me): переход на тайтл монтирует фичи, уход — демонтирует', async () => {
    const { w } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: '<header><ul><li><a href="/catalog/top">Топ</a></li></ul></header><main id="root"></main>' });
    const api = read('tests/fixtures/yani-api-anime.json');
    w.fetch = async () => ({ ok: true, json: async () => JSON.parse(api) });
    const doc = w.document;
    await tick(300);
    assert.equal(doc.querySelector('.ag-tw'), null, 'на каталоге панели нет');
    assert.ok(doc.querySelector('.ag-top-nav-link'), 'пункт «Топ Shikimori» есть на любой странице');

    // Клиентский переход: React меняет DOM и адрес через history.pushState
    doc.getElementById('root').innerHTML = '<div><h1>Монолог фармацевта 3</h1></div>';
    w.history.pushState({}, '', '/catalog/item/monolog-farmacevta-3');
    await tick(1800); // опрос адреса раз в секунду + монтирование
    const bar = doc.querySelector('.ag-tw');
    assert.ok(bar, 'панель появилась после SPA-перехода');
    assert.match(bar.textContent, /Shikimori/);

    doc.getElementById('root').innerHTML = '<div>Каталог</div>';
    w.history.pushState({}, '', '/catalog');
    await tick(1500);
    assert.equal(doc.querySelector('.ag-tw'), null, 'панель убрана при уходе со страницы тайтла');
    assert.equal(doc.querySelectorAll('.ag-top-nav-link').length, 1, 'пункт меню не дублируется после перемонтирования');
    w.close();
});



test('runtime: Топ Shikimori на ru.yummyani.me вставляется отдельным элементом меню div, а не внутрь ТОП 100', async () => {
    const html = `
        <nav class="bo">
            <div data-variant="top" class="fM dm" id="top-item">
                <a href="/catalog/top" class="fO"><svg width="12" height="12" fill="var(--main-permanent)" viewBox="0 0 20 20"><path d="M0 0h20v20H0z"></path></svg><span class="fP">ТОП 100</span></a>
            </div>
            <div data-variant="top" class="fM dm" id="random-item">
                <a href="/catalog/random" class="fO"><svg width="12" height="12" viewBox="0 0 20 20"><path d="M0 0h20v20H0z"></path></svg><span class="fP">СЛУЧАЙНОЕ</span></a>
            </div>
        </nav>`;
    const { w } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html });
    const doc = w.document;
    await tick(300);

    const topItem = doc.getElementById('top-item');
    const randomItem = doc.getElementById('random-item');
    assert.equal(topItem.querySelectorAll('a').length, 1, 'внутри исходного пункта осталась только одна ссылка');

    const injectedWrapper = topItem.nextElementSibling;
    assert.ok(injectedWrapper, 'рядом с исходным пунктом появился сиблинг');
    assert.equal(injectedWrapper.tagName, 'DIV');
    assert.equal(injectedWrapper.getAttribute('data-variant'), 'top');
    assert.equal(injectedWrapper.id, '');
    assert.equal(injectedWrapper.nextElementSibling, randomItem, 'сиблинг расположен перед СЛУЧАЙНОЕ');

    const link = injectedWrapper.querySelector('.ag-top-nav-link');
    assert.ok(link, 'внутри сиблинга ссылка на Топ Shikimori');
    assert.ok(link.classList.contains('fO'));
    assert.equal(link.getAttribute('href'), '#ag-top-shikimori');

    const span = link.querySelector('span');
    assert.ok(span, 'текст обёрнут в span');
    assert.ok(span.classList.contains('fP'));
    assert.equal(span.textContent, 'ТОП SHIKIMORI', 'регистр совпадает с нативным верхним регистром');

    const svg = link.querySelector('svg');
    assert.ok(svg, 'добавлена иконка');
    assert.equal(svg.getAttribute('width'), '12');
    assert.equal(svg.getAttribute('fill'), 'var(--main-permanent)');

    // Клик по ссылке открывает оверлей
    link.click();
    await tick();
    assert.ok(doc.querySelector('.ag-top-ov'), 'оверлей открыт по клику');
    w.close();
});



test('runtime: кнопка СЛУЧАЙНОЕ на ru.yummyani.me перехватывается и запрашивает случайное аниме с siteId', async () => {
    const html = `
        <header>
            <nav class="bo">
                <div data-variant="top" class="fM dm">
                    <a href="/catalog/top" class="fO" itemprop="url" data-hotkey-id="top100"><span class="fP">ТОП 100</span></a>
                </div>
                <div data-variant="top" class="fM dm">
                    <a href="/catalog/random" class="fO" itemprop="url" data-hotkey-id="random" data-hotkey="g r, shift+r">
                        <svg width="16" height="16" viewBox="0 0 20 20"><path d="M0 0h20v20H0z"></path></svg>
                        <span class="fP">СЛУЧАЙНОЕ</span>
                    </a>
                </div>
            </nav>
        </header>`;
    const { w, sent } = await startRuntime({
        url: 'https://ru.yummyani.me/catalog',
        html,
        settings: { random_min_score: '8.0', random_kinds: ['tv', 'movie'] }
    });
    const doc = w.document;
    await tick(300);

    const randomLink = doc.querySelector('a[href="/catalog/random"]');
    assert.ok(randomLink, 'кнопка случайного аниме найдена');

    const clickEvt = new w.MouseEvent('click', { bubbles: true, cancelable: true });
    randomLink.dispatchEvent(clickEvt);
    assert.equal(clickEvt.defaultPrevented, true, 'нативное действие предотвращено');

    await tick(50);

    const randomMsg = sent.find(m => m.action === 'get_random_shikimori_anime');
    assert.ok(randomMsg, 'сообщение get_random_shikimori_anime отправлено');
    assert.equal(randomMsg.siteId, 'yummy_ru', 'передан siteId yummy_ru');
    assert.equal(w.location.hash, '#naruto-tv-1', 'выполнен переход по подобранному URL');

    w.close();
});



test('runtime: кнопка СЛУЧАЙНОЕ показывает alert если критерии не совпали', async () => {
    const html = `
        <nav class="bo">
            <a href="/catalog/random" class="fO" data-hotkey-id="random">
                <span class="fP">СЛУЧАЙНОЕ</span>
            </a>
        </nav>`;
    const { w } = await startRuntime({
        url: 'https://ru.yummyani.me/',
        html,
        settings: { random_min_score: '9.0' }
    });
    const doc = w.document;
    await tick(300);

    let alertMessage = null;
    w.alert = (msg) => { alertMessage = msg; };

    // Подменяем ответ background на no_match
    w.chrome.runtime.sendMessage = (msg, cb) => {
        if (msg.action === 'get_random_shikimori_anime') {
            cb({ url: null, reason: 'no_match', minScore: 9 });
        }
    };

    const randomLink = doc.querySelector('a[data-hotkey-id="random"]');
    randomLink.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

    await tick(50);

    assert.ok(alertMessage, 'alert вызван');
    assert.match(alertMessage, /9/);
    assert.equal(w.location.href, 'https://ru.yummyani.me/', 'страница осталась прежней');

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



test('runtime: Топ Shikimori на yummyanime.tv изолирован от глобальных стилей button и рендерит карточки div', async () => {
    const html = `
        <header>
            <ul class="header__menu">
                <li><a href="/top-100/" title="Топ 100 лучших аниме">Топ 100</a></li>
            </ul>
        </header>
        <main>
            <h1>Аниме</h1>
            <div data-player-anime-id="1"></div>
        </main>`;
    const { w } = await startRuntime({
        url: 'https://yummyanime.tv/1-naruto.html',
        html
    });
    const doc = w.document;
    await tick(300);

    const topNavLink = doc.querySelector('.ag-top-nav-link');
    assert.ok(topNavLink, 'пункт Топ Shikimori добавлен в навигацию yummyanime.tv');

    // Кликаем по пункту Топ Shikimori для открытия оверлея
    topNavLink.click();
    await tick(100);

    const overlay = doc.querySelector('.ag-top-ov');
    assert.ok(overlay, 'оверлей открыт');

    const cards = doc.querySelectorAll('.ag-top-ov__card');
    assert.ok(cards.length > 0, 'карточки отрендерены');
    // Карточки должны быть DIV с role="button", чтобы глобальные button-стили сайта (height: 40px, purple bg) не ломали их
    assert.equal(cards[0].tagName, 'DIV', 'карточка создана как DIV, а не native button');
    assert.equal(cards[0].getAttribute('role'), 'button', 'карточка имеет role="button"');
    assert.equal(cards[0].getAttribute('tabindex'), '0', 'карточка доступна для фокуса через tabindex');

    // Проверяем наличие стилей изоляции
    const styleEl = doc.getElementById('ag-top-overlay-style');
    assert.ok(styleEl, 'стили оверлея инжектированы');
    assert.match(styleEl.textContent, /all:\s*unset/i, 'присутствует CSS-сброс all: unset');

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
        <div data-variant="top" class="fM fN dm" id="profile"><a href="#login" class="fO" aria-label="Войти" data-hotkey-id="profile" data-hotkey="g p"><div class="bq"></div></a>
            <div style="display:none"><div class="db" id="profile-menu"><a href="#settings" data-hotkey-id="settings" class="hO dm"><span itemprop="name">Настройки</span></a></div></div>
        </div>
    </nav></header>`;

test('ru.yummyani.me: «Топ Shikimori» в меню «АНИМЕ», шапка не получает лишних пунктов', async () => {
    const { w } = await startRuntime({ url: 'https://ru.yummyani.me/catalog', html: RU_HEADER });
    const doc = w.document;
    await tick(300);

    const link = doc.querySelector('#anime-menu .ag-top-nav-link');
    assert.ok(link, 'пункт в выпадающем меню');
    assert.equal(link.getAttribute('href'), '#ag-top-shikimori');
    assert.equal(link.querySelector('span').textContent, 'Топ Shikimori');
    assert.ok(link.classList.contains('hO'), 'нативный класс');
    assert.equal(link.hasAttribute('data-hotkey'), false, 'горячая клавиша сайта не скопирована');
    assert.equal(doc.querySelectorAll('.ag-top-nav-link').length, 1);
    assert.equal(doc.querySelector('.ag-top-nav-wrapper'), null);
    assert.equal(doc.getElementById('top-item').nextElementSibling, doc.getElementById('profile'), 'в шапке рядом с «ТОП 100» ничего не добавлено');

    link.click();
    await tick();
    assert.ok(doc.querySelector('.ag-top-ov'), 'открывается Топ');
    w.close();
});

test('animego.online: «Топ Shikimori» в меню вне <header>, рядом с «Топ 100», в обеих копиях меню', async () => {
    const { JSDOM: Parser } = require('jsdom');
    const fixture = new Parser(read('tests/fixtures/animego_online-title.html')).window.document;
    // Сайт копирует меню в мобильную панель своим скриптом — в снимке копии нет, добавляем её как на живой странице
    const nativeMenu = fixture.querySelector('.animego-online-header__menu--bothead > ul');
    assert.ok(nativeMenu, 'в снимке есть меню вне <header>');
    const mobile = fixture.createElement('div');
    mobile.className = 'mobile-menu';
    mobile.appendChild(nativeMenu.cloneNode(true));
    fixture.body.appendChild(mobile);

    const { w } = await startRuntime({
        url: 'https://animego.online/6003-monolog-farmacevta-3-sezon-o1.html',
        html: fixture.documentElement.outerHTML
    });
    const doc = w.document;
    await tick(600);

    const menu = doc.querySelector('.animego-online-header__menu--bothead > ul');
    const link = menu.querySelector('.ag-top-nav-link');
    assert.ok(link, 'пункт есть в основном меню');
    assert.equal(link.textContent.trim(), 'Топ Shikimori');
    assert.match(link.closest('li').previousElementSibling.textContent, /Топ 100/, 'стоит сразу после «Топ 100»');

    assert.ok(doc.querySelector('.mobile-menu .ag-top-nav-link'), 'пункт есть в мобильном меню');
    assert.equal(doc.querySelectorAll('.ag-top-nav-link').length, 2, 'без дублей');

    const css = [...doc.querySelectorAll('style')].map(s => s.textContent).join('\n');
    assert.match(css, /--bothead > ul > li \{ margin-right: 28px/, 'отступы меню ужаты, чтобы всё встало в одну строку');

    doc.querySelector('.mobile-menu .ag-top-nav-link').click();
    await tick();
    assert.ok(doc.querySelector('.ag-top-ov'), 'открывается окно Топа');
    w.close();
});
