// Собственный плеер сайтов (Плеер Джутсу и его копии) не показываем: вместо него сразу Kodik
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const tick = (ms = 400) => new Promise(r => setTimeout(r, ms));

// ---------- Кадр плеера сайта: разметка кнопок из записи с настоящей страницы ----------

function agpFrame({ referrer = 'https://yammyanime.club/', settings = {}, button = '<div class="agp-err"><button type="button">Открыть плеер Kodik</button></div>', url = 'https://ani5.top/5/embed/agp?a=8996' } = {}) {
    const dom = new JSDOM(`<!doctype html><body><div class="agp"></div>${button}</body>`, { url, referrer, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const clicks = [];
    w.document.addEventListener('click', (e) => clicks.push(e.target.textContent.trim()), true);
    w.chrome = { storage: { local: { get: async () => ({ ag_settings: settings }) } } };
    w.eval(read('modules/shared/sites.js'));
    w.eval(read('modules/player/agp-to-kodik.js'));
    return { w, clicks };
}

for (const site of ['jut-su.net', 'yammyanime.club', 'animego.online', 'yummyanime.tv']) {
    test(`плеер сайта на ${site} сразу уходит на Kodik своей кнопкой`, async () => {
        const { w, clicks } = agpFrame({ referrer: `https://${site}/` });
        await tick();
        assert.deepEqual(clicks, ['Открыть плеер Kodik']);
        w.close();
    });
}

test('кнопка появилась позже: нажимается один раз', async () => {
    const { w, clicks } = agpFrame({ button: '' });
    await tick();
    assert.deepEqual(clicks, []);
    w.document.body.insertAdjacentHTML('beforeend', '<div class="agp-err is-on"><button>Я отключил — обновить</button><button>Смотреть в обычном плеере</button></div>');
    await tick();
    assert.deepEqual(clicks, ['Смотреть в обычном плеере']);
    await tick();
    assert.equal(clicks.length, 1);
    w.close();
});

test('кадр скрытой вкладки не уходит на Kodik, пока его не покажут', async () => {
    const { JSDOM: Dom } = require('jsdom');
    const dom = new Dom('<!doctype html><body><button>Открыть плеер Kodik</button></body>', { url: 'https://ani5.top/5/embed/agp', referrer: 'https://yammyanime.club/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    let width = 0;
    Object.defineProperty(w, 'innerWidth', { get: () => width, configurable: true });
    const clicks = [];
    w.document.addEventListener('click', (e) => clicks.push(e.target.textContent.trim()), true);
    w.chrome = { storage: { local: { get: async () => ({}) } } };
    w.eval(read('modules/shared/sites.js'));
    w.eval(read('modules/player/agp-to-kodik.js'));
    await tick();
    assert.deepEqual(clicks, []);
    width = 800;
    await tick();
    assert.deepEqual(clicks, ['Открыть плеер Kodik']);
    w.close();
});

test('расширение выключено: плеер сайта не трогаем', async () => {
    const off = agpFrame({ settings: { global_enabled: false } });
    await tick();
    assert.deepEqual(off.clicks, []);
    off.w.close();
    const siteOff = agpFrame({ settings: { sites_enabled: { yammy_club: false } } });
    await tick();
    assert.deepEqual(siteOff.clicks, []);
    siteOff.w.close();
});

test('чужой сайт с этим плеером: не трогаем', async () => {
    const { w, clicks } = agpFrame({ referrer: 'https://example.com/' });
    await tick();
    assert.deepEqual(clicks, []);
    w.close();
});

// ---------- Вкладки на странице ----------

const slot = (i, title) => `<div class="tabs-block__content" data-player-slot="${i}" data-player-title="${title}"><iframe></iframe></div>`;
// Подписи вкладок как на настоящих сайтах: первая вкладка часто не называет свой плеер
function page({ tabs, slots, url = 'https://yammyanime.club/catalog/item/x' }) {
    const dom = new JSDOM(`<!doctype html><body><h1>Тайтл</h1><div data-player-anime-id="1"><div class="tabs-block__select">${tabs.map((t, i) => `<span class="${i === 0 ? 'is-active' : ''}">${t}</span>`).join('')}</div>${slots.map((t, i) => slot(i, t)).join('')}</div></body>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const saved = {};
    w.chrome = { storage: { local: { get: async () => saved, set: async (o) => Object.assign(saved, o) } } };
    w.agQueryFirst = (list) => list.map(s => w.document.querySelector(s)).find(Boolean) || null;
    w.AgNativeFs = { retidy() {} };
    w.AgProviders = {
        BaseProvider: class { constructor(site, settings) { this.site = site; this.settings = settings; } },
        registry: {},
        register(id, cls) { this.registry[id] = cls; }
    };
    w.eval(read('modules/shared/player-choice.js'));
    w.eval(read('providers/dle.js'));
    const Provider = w.AgProviders.registry.dle;
    const provider = new Provider({ id: 'yammy_club', dle: { titlePath: /^\/catalog\/item\// } }, {});
    const tabEls = [...w.document.querySelectorAll('.tabs-block__select > *')];
    // Как сайт: нажатие делает вкладку активной
    tabEls.forEach(el => el.addEventListener('click', () => { tabEls.forEach(x => x.classList.remove('is-active')); el.classList.add('is-active'); }));
    const scope = { listen: (target, event, fn, options) => target.addEventListener(event, fn, options), own() {} };
    return { w, provider, tabEls, scope, saved };
}

const WITH_KODIK = { tabs: ['Смотреть онлайн', 'Все озвучки', 'Трейлер'], slots: ['Плеер YummyAnime Club', 'Плеер Kodik', 'Трейлер'] };
const NO_KODIK_TAB = { tabs: ['Смотреть онлайн', 'Плеер YummyAnime Club', 'Трейлер'], slots: ['Плеер CVH', 'Плеер YummyAnime Club', 'Трейлер'] };

test('есть вкладка Kodik: плеера сайта нет в списке', async () => {
    const { w, provider } = page(WITH_KODIK);
    const site = await provider.getShellSite();
    assert.deepEqual(Array.from(site.players, p => p.title), ['Kodik']);
    w.close();
});

test('вкладки Kodik нет: вкладка плеера сайта и есть Kodik', async () => {
    const { w, provider } = page(NO_KODIK_TAB);
    const site = await provider.getShellSite();
    assert.deepEqual(Array.from(site.players, p => p.title), ['CVH', 'Kodik']);
    w.close();
});

test('по умолчанию открывается Kodik в обоих случаях', async () => {
    for (const layout of [WITH_KODIK, NO_KODIK_TAB]) {
        const { w, provider, tabEls } = page(layout);
        provider.playerChoice = null;
        provider.selectPreferredPlayer();
        assert.ok(tabEls[1].classList.contains('is-active'), layout.tabs.join());
        w.close();
    }
});

test('сохранённый раньше выбор плеера сайта не мешает: открывается Kodik', () => {
    const { w, provider, tabEls } = page(WITH_KODIK);
    provider.playerChoice = 'Плеер YummyAnime Club';
    provider.selectPreferredPlayer();
    assert.ok(tabEls[1].classList.contains('is-active'));
    w.close();
});

test('выбранный зрителем CVH важнее Kodik', () => {
    const { w, provider, tabEls } = page(NO_KODIK_TAB);
    provider.playerChoice = 'CVH';
    provider.selectPreferredPlayer();
    assert.ok(tabEls[0].classList.contains('is-active'));
    w.close();
});

test('нажатие на вкладку плеера сайта открывает Kodik', async () => {
    const { w, provider, tabEls, scope } = page(WITH_KODIK);
    tabEls[1].click();
    provider.mount(scope);
    // Настоящее нажатие: сначала обработчик расширения, затем сайт делает вкладку активной
    provider.onTabClick({ isTrusted: true, target: tabEls[0] });
    tabEls[0].click();
    await tick(100);
    assert.ok(tabEls[1].classList.contains('is-active'));
    assert.equal(tabEls[0].classList.contains('is-active'), false);
    w.close();
});

test('выбор плеера сайта не запоминается', async () => {
    const { w, provider, tabEls, scope, saved } = page(NO_KODIK_TAB);
    provider.mount(scope);
    provider.onTabClick({ isTrusted: true, target: tabEls[1] });
    await tick(50);
    // Kodik выбирается по умолчанию, поэтому записи нет
    assert.equal((saved.ag_player_choice || {}).yammy_club, undefined);
    assert.equal(provider.playerChoice, 'Kodik');
    w.close();
});
