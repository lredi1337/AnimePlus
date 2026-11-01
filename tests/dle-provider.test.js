// Провайдер DLE-сайтов на снимках реальных страниц (tests/fixtures, сняты 01.11.2026).
// Если сайт поменяет вёрстку — обновите снимки и посмотрите, какие проверки упадут.
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const TITLE_PAGES = [
    {
        siteId: 'yummyanime_tv',
        url: 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-r1.html',
        title: 'Монолог фармацевта 3 сезон',
        origTitle: 'Kusuriya no Hitorigoto 3rd Season',
        year: '2026',
        // Страница ссылается на Shikimori через редирект /go/shikimori/8522 — его разрешает background
        shikiRedirect: true,
        kodikTab: 'Kodik'
    },
    {
        siteId: 'animego_online',
        url: 'https://animego.online/6003-monolog-farmacevta-3-sezon-o1.html',
        title: 'Монолог фармацевта 3 сезон',
        origTitle: 'Kusuriya no Hitorigoto 3rd Season',
        year: '2026',
        shikiRedirect: false,
        kodikTab: 'Kodik'
    },
    {
        siteId: 'yammy_club',
        url: 'https://yammyanime.club/catalog/item/monolog-farmacevta-3-sezon-c1',
        title: 'Монолог фармацевта (3 сезон)',
        origTitle: "The Pharmacist's Monologue",
        year: '2026',
        shikiRedirect: false,
        // Вкладка Kodik подписана «Все озвучки» — выбор идёт по data-player-title слота
        kodikTab: 'Все озвучки'
    }
];

const makeProvider = (siteId, url, html, opts) => {
    const env = makeContentWindow(html, url, opts);
    const w = env.window;
    const site = w.AgSites.byId(siteId);
    assert.ok(site, `сайт ${siteId} есть в реестре`);
    assert.equal(w.AgSites.byUrl(url).id, siteId, 'сайт определяется по адресу');
    const provider = new w.AgProviders.registry[site.platform](site, {});
    return { provider, w, sent: env.sent };
};

for (const page of TITLE_PAGES) {
    const html = read(`tests/fixtures/${page.siteId}-title.html`);

    test(`${page.siteId}: страница тайтла распознаётся, сведения извлекаются`, async () => {
        const { provider, sent } = makeProvider(page.siteId, page.url, html, {
            onMessage: (msg) => msg.action === 'resolve_shiki_id_redirect' ? { id: 61987 } : null
        });
        assert.equal(provider.isTitlePage(), true);

        const info = await provider.getTitleInfo();
        assert.equal(info.title, page.title);
        assert.equal(info.origTitle, page.origTitle);
        assert.equal(info.year, page.year);
        assert.ok(info.titles.includes(page.title));
        assert.match(info.pageKey, new RegExp(`^${page.siteId}:\\d+$`));

        const redirectCalls = sent.filter(m => m.action === 'resolve_shiki_id_redirect');
        if (page.shikiRedirect) {
            assert.equal(info.shikimoriId, 61987);
            assert.match(redirectCalls[0].url, /\/go\/shikimori\/8522$/);
        } else {
            assert.equal(info.shikimoriId, null);
            assert.equal(redirectCalls.length, 0);
        }
    });

    test(`${page.siteId}: выбирается вкладка Kodik («${page.kodikTab}»)`, () => {
        const { provider, w } = makeProvider(page.siteId, page.url, html);
        const clicked = [];
        w.document.querySelectorAll('[data-player-anime-id] .tabs-block__select > *').forEach(tab => {
            tab.addEventListener('click', () => clicked.push(tab.textContent.trim()));
        });
        provider.selectPreferredPlayer();
        assert.deepEqual(clicked, [page.kodikTab]);
    });
}

test('страница каталога/главная не считается страницей тайтла', () => {
    const { provider } = makeProvider('yummyanime_tv', 'https://yummyanime.tv/', read('tests/fixtures/yummyanime_tv-search.html'));
    assert.equal(provider.isTitlePage(), false);
});

const SEARCH_PAGES = [
    ['yummyanime_tv', 'https://yummyanime.tv/index.php?do=search&subaction=search&story=x', 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-r1.html'],
    ['animego_online', 'https://animego.online/index.php?do=search&subaction=search&story=x', 'https://animego.online/6003-monolog-farmacevta-3-sezon-o1.html'],
    ['yammy_club', 'https://yammyanime.club/index.php?do=search&subaction=search&story=x', 'https://yammyanime.club/catalog/item/monolog-farmacevta-3-sezon-c1']
];

for (const [siteId, url, expected] of SEARCH_PAGES) {
    test(`${siteId}: автопереход со страницы поиска выбирает 3-й сезон`, () => {
        const { provider, w } = makeProvider(siteId, url, read(`tests/fixtures/${siteId}-search.html`));
        assert.equal(provider.isSearchPage(), true);
        const cards = provider.collectSearchCards();
        assert.ok(cards.length >= 3, `найдено карточек: ${cards.length}`);
        const best = w.AgTitleMatch.pickBest(cards, { titles: ['Монолог фармацевта 3 сезон', 'Kusuriya no Hitorigoto 3rd Season'] }, { minScore: 250 });
        assert.equal(best && best.href, expected);
    });
}

test('DleProvider: navigate() отправляет AG_SWITCH_KODIK_EPISODE во все iframe плеера', () => {
    const { provider, w } = makeProvider('yummyanime_tv', 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-r1.html', read('tests/fixtures/yummyanime_tv-title.html'));
    const player = w.document.querySelector('[data-player-anime-id]');
    const messages = [];
    const ifr = w.document.createElement('iframe');
    ifr.src = 'https://kodikplayer.com/serial/8522/xxx?episode=1';
    Object.defineProperty(ifr, 'contentWindow', {
        value: { postMessage: (msg) => messages.push(msg) },
        configurable: true
    });
    player.appendChild(ifr);

    const okNext = provider.navigate('next');
    assert.equal(okNext, true);
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'AG_SWITCH_KODIK_EPISODE');
    assert.equal(messages[0].dir, 'next');

    const okPrev = provider.navigate('prev');
    assert.equal(okPrev, true);
    assert.equal(messages.length, 2);
    assert.equal(messages[1].type, 'AG_SWITCH_KODIK_EPISODE');
    assert.equal(messages[1].dir, 'prev');
});

