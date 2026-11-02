// Провайдер YummyAnime (yani): API-ответы — снимки реального /api/anime и /api/search.
// Вёрстка плеера синтетическая (на сайте её строит React, классы обфусцированы — провайдер на них не опирается).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const API_ANIME = read('tests/fixtures/yani-api-anime.json');

// Разметка как на old.yummyani.me: список серий из числовых div и Kodik с episode= в адресе
const PAGE = `
    <h1>Монолог фармацевта 3</h1>
    <div id="video">
        <div class="Yqy0"><div class="Y56k a">1</div><div class="Y56k b">2</div><div class="Y56k b">3</div></div>
        <div class="wKBD"><div><iframe src="https://kodikplayer.com/season/123088/8bf6fe95eeb635b6652c41e3f3a27d19/720p?translations=false&only_episode=true&episode=1"></iframe></div></div>
    </div>`;

function makeYani(html = PAGE, url = 'https://old.yummyani.me/catalog/item/monolog-farmacevta-3') {
    const fetched = [];
    const { window: w } = makeContentWindow(html, url, {
        fetch: async (u) => {
            fetched.push(String(u));
            return { ok: true, json: async () => JSON.parse(API_ANIME) };
        }
    });
    const site = w.AgSites.byUrl(url);
    const provider = new w.AgProviders.registry[site.platform](site, {});
    return { provider, w, fetched, site };
}

test('yani: оба домена — одна платформа, ru-версия помечена как SPA', () => {
    const { w } = makeYani();
    assert.equal(w.AgSites.byHost('old.yummyani.me').platform, 'yani');
    assert.equal(w.AgSites.byHost('ru.yummyani.me').platform, 'yani');
    assert.equal(w.AgSites.byHost('ru.yummyani.me').spa, true);
});

test('yani: ID Shikimori, год и тип берутся из API сайта', async () => {
    const { provider, fetched } = makeYani();
    const info = await provider.getTitleInfo();
    assert.equal(info.shikimoriId, 61987);
    assert.equal(info.year, '2026');
    assert.equal(info.kind, 'tv');
    assert.equal(info.pageKey, 'yummy_old:monolog-farmacevta-3');
    assert.ok(info.titles.includes('Монолог фармацевта 3'));
    assert.match(fetched[0], /\/api\/anime\/monolog-farmacevta-3\?need_videos=true$/);
});

test('yani: номер серии из episode= в адресе Kodik, а не из сообщения плеера', () => {
    const { provider } = makeYani();
    // Kodik в режиме only_episode не знает номер и шлёт «1» — источник истины адрес iframe
    assert.equal(provider.getEpisode('7'), '1');
});

test('yani: переключение серии кликает следующую кнопку из числового списка', () => {
    const { provider, w } = makeYani();
    const iframe = w.document.querySelector('iframe');
    w.document.querySelectorAll('.Yqy0 > div').forEach(btn => btn.addEventListener('click', () => {
        iframe.src = iframe.src.replace(/episode=\d+/, `episode=${btn.textContent}`);
    }));
    assert.equal(provider.navigate('next'), true);
    assert.equal(provider.getEpisode(), '2');
    assert.equal(provider.navigate('prev'), true);
    assert.equal(provider.getEpisode(), '1');
    assert.equal(provider.navigate('prev'), false, 'серии 0 нет');
});

test('yani: таймкоды опенинга/эндинга с сайта для текущей озвучки', async () => {
    const { provider } = makeYani();
    const skip = await provider.getSkipData('2');
    // Опенинг песни надёжен, а 19 секунд в конце файла — это титры озвучки, а не эндинг
    const plain = JSON.parse(JSON.stringify(skip));
    assert.equal(plain.op.start, 0);
    assert.equal(plain.op.end, 89);
    assert.deepEqual(plain.ed, { start: 0, end: 0 });
});

test('yani: страница не тайтла', () => {
    const { provider } = makeYani('<h1>Каталог</h1>', 'https://ru.yummyani.me/catalog');
    assert.equal(provider.isTitlePage(), false);
});

test('yani: getNavAnchor находит div меню на ru.yummyani.me и li на old.yummyani.me', () => {
    const htmlSpa = `
        <nav class="bo">
            <div data-variant="top" class="fM dm">
                <a href="/catalog/top" class="fO"><span class="fP">ТОП 100</span></a>
            </div>
        </nav>`;
    const { provider: pSpa } = makeYani(htmlSpa, 'https://ru.yummyani.me/catalog');
    const anchorSpa = pSpa.getNavAnchor();
    assert.ok(anchorSpa);
    assert.equal(anchorSpa.tagName, 'DIV');
    assert.equal(anchorSpa.getAttribute('data-variant'), 'top');

    const htmlOld = '<ul><li><a href="/catalog/top">Топ 100</a></li></ul>';
    const { provider: pOld } = makeYani(htmlOld, 'https://old.yummyani.me/catalog');
    const anchorOld = pOld.getNavAnchor();
    assert.ok(anchorOld);
    assert.equal(anchorOld.tagName, 'LI');
});

test('yani: getSettingsAnchor находит a в .db на ru.yummyani.me и li в ul.menu на old.yummyani.me', () => {
    const htmlSpa = '<div class="db"><a href="#settings">Настройки</a></div>';
    const { provider: pSpa } = makeYani(htmlSpa, 'https://ru.yummyani.me/catalog');
    const sSpa = pSpa.getSettingsAnchor();
    assert.ok(sSpa);
    assert.equal(sSpa.getAttribute('href'), '#settings');

    const htmlOld = '<ul class="menu"><li><a href="/">Главная</a></li><li class="sub-menu-link"><a href="#">Сообщество</a></li></ul>';
    const { provider: pOld } = makeYani(htmlOld, 'https://old.yummyani.me/catalog');
    const sOld = pOld.getSettingsAnchor();
    assert.ok(sOld);
    assert.equal(sOld.tagName, 'LI');
    assert.match(sOld.textContent, /Сообщество/);
});
