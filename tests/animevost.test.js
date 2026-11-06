// AnimeVost: сайт переезжает с домена на домен, поэтому узнаётся по всем адресам vost.pw и по адресам, добавленным зрителем.
// Снимок страницы тайтла снят с v14.vost.pw 06.11.2026 (скрипты вырезаны, список серий уже построен сайтом)
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const URL_V14 = 'https://v14.vost.pw/tip/tv/4008-koori-no-jouheki-2nd-season.html';
const loadSites = () => {
    delete require.cache[require.resolve('../modules/shared/sites.js')];
    require('../modules/shared/sites.js');
    return globalThis.AgSites;
};

test('AnimeVost узнаётся на старом и на любом зеркале vost.pw', () => {
    const AgSites = loadSites();
    for (const host of ['animevost.org', 'v14.vost.pw', 'v15.vost.pw', 'a.vost.pw']) assert.equal((AgSites.byHost(host) || {}).id, 'animevost', host);
    assert.equal(AgSites.byHost('vost.pw.evil.com'), null);
});

test('новый адрес, добавленный зрителем, становится адресом того же сайта', () => {
    const AgSites = loadSites();
    assert.equal(AgSites.byHost('animevost.xyz'), null);
    AgSites.applyAliases({ 'animevost.xyz': 'animevost', 'bad.example': 'нет-такого-сайта' });
    assert.equal(AgSites.byHost('animevost.xyz').id, 'animevost');
    assert.equal(AgSites.byHost('www.animevost.xyz').id, 'animevost');
    assert.equal(AgSites.byHost('bad.example'), null);
    assert.ok(AgSites.allHosts().includes('animevost.xyz'));
    AgSites.applyAliases({});
    assert.equal(AgSites.byHost('animevost.xyz'), null);
});

test('страница AnimeVost узнаётся по шаблону, даже на незнакомом домене', () => {
    const AgSites = loadSites();
    const page = new JSDOM(read('tests/fixtures/animevost-title.html'), { url: 'https://animevost.xyz/tip/tv/4008-x.html' }).window.document;
    assert.equal(AgSites.detect(page).id, 'animevost');
    const other = new JSDOM('<html><head><link rel="stylesheet" href="/templates/Default/style.css"></head></html>').window.document;
    assert.equal(AgSites.detect(other), null);
});

test('кадр плеера AnimeVost получает свой адаптер, остальные кадры сайта никакого', () => {
    const { byLocation } = require('../modules/player/adapters.js');
    loadSites();
    assert.equal(byLocation({ hostname: 'v14.vost.pw', pathname: '/frame5.php' }).id, 'vost');
    assert.equal(byLocation({ hostname: 'animevost.xyz', pathname: '/frame5.php' }).id, 'vost');
    assert.equal(byLocation({ hostname: 'v14.vost.pw', pathname: '/html5banner/loliland/vide/index7.html' }), null);
    assert.equal(byLocation({ hostname: 'kodikplayer.com', pathname: '/seria/1/abc/720p' }).id, 'kodik');
});

test('адаптер AnimeVost находит видео плеера и прячет его управление', () => {
    const dom = new JSDOM('<!doctype html><body><div id="play"><video id="aniland"></video></div><div id="controls"></div></body>', { url: 'https://v14.vost.pw/frame5.php?play=1', runScripts: 'outside-only' });
    dom.window.eval(read('modules/player/adapters.js'));
    const vost = dom.window.AgPlayerAdapters.current();
    assert.equal(vost.id, 'vost');
    assert.equal(vost.video().id, 'aniland');
    assert.match(vost.css, /#controls/);
    assert.match(vost.css, /#knpki/);
});

const makeVost = (url = URL_V14) => {
    const env = makeContentWindow(read('tests/fixtures/animevost-title.html'), url);
    const w = env.window;
    const site = w.AgSites.byId('animevost');
    return { w, provider: new w.AgProviders.registry[site.platform](site, {}) };
};

test('страница тайтла: название, оригинал, год и ключ без домена', async () => {
    const { provider } = makeVost();
    assert.equal(provider.isTitlePage(), true);
    const info = await provider.getTitleInfo();
    assert.equal(info.title, 'Ледяная стена (второй сезон)');
    assert.equal(info.origTitle, 'Koori no Jouheki 2nd Season');
    assert.equal(info.year, '2026');
    // Ключ не зависит от домена: после переезда сайта прогресс остаётся тем же
    assert.equal(info.pageKey, 'animevost:4008');
    assert.equal((await makeVost('https://v15.vost.pw/tip/tv/4008-koori-no-jouheki-2nd-season.html').provider.getTitleInfo()).pageKey, 'animevost:4008');
});

test('серии сайта: текущая, список для оболочки и переключение', async () => {
    const { w, provider } = makeVost();
    assert.equal(provider.getEpisode(), '1');
    const shell = await provider.getShellSite();
    assert.equal(shell.episodes.length, 6);
    assert.deepEqual({ ...shell.episodes[1] }, { index: 1, label: '2', title: '2 серия', selected: false });
    let clicked = null;
    w.document.querySelectorAll('#items .epizode').forEach((el) => el.addEventListener('click', () => {
        clicked = el.id;
        w.document.querySelector('#items .active').classList.remove('active');
        el.classList.add('active');
    }));
    await provider.shellPick('episodes', 2);
    assert.equal(clicked, 'p2');
    assert.equal(provider.getEpisode(), '3');
    assert.equal(provider.navigate('next'), true);
    assert.equal(clicked, 'p3');
    assert.equal(provider.navigate('prev'), true);
    assert.equal(clicked, 'p2');
});

test('кадр плеера и место для кнопок у названия находятся', () => {
    const { provider } = makeVost();
    assert.equal(provider.getPlayerContainer().id, 'player2');
    assert.equal(provider.getTitleAnchor().tagName.toLowerCase() !== 'body', true);
    assert.equal(provider.getPlayerWindows().length, 1);
});

test('«Режим кинотеатра»: свой кадр и свой список серий', async () => {
    const { w, provider } = makeVost();
    const d = w.document;
    d.getElementById('playerbox').style.display = 'none';
    d.getElementById('kinoplayer').style.display = 'block';
    d.querySelector('#list .series[id="3"]').classList.add('kactive');
    assert.equal(provider.getPlayerContainer().id, 'player');
    assert.equal(provider.getEpisode(), '4');
    assert.equal((await provider.getShellSite()).episodes.find(e => e.selected).index, 3);
});

test('качество AnimeVost: 720p и 480p — это плееры №1 и №2, место в серии переносится', async () => {
    const { VirtualConsole } = require('jsdom');
    const silent = new VirtualConsole();
    const dom = new JSDOM('<!doctype html><body><div id="play"><video id="aniland"></video></div></body>', { url: 'https://v14.vost.pw/frame5.php?play=77', runScripts: 'outside-only', virtualConsole: silent });
    dom.window.eval(read('modules/player/adapters.js'));
    const vost = dom.window.AgPlayerAdapters.current();
    const list = vost.quality();
    assert.deepEqual([...list].map(x => [x.label, x.current]), [['720p', true], ['480p', false]]);
    Object.defineProperty(dom.window.document.getElementById('aniland'), 'currentTime', { value: 321, configurable: true });
    list[1].pick();
    const saved = JSON.parse(dom.window.sessionStorage.getItem('ag_vost_resume'));
    assert.equal(saved.id, '77');
    assert.equal(saved.t, 321);

    // Плеер №2 продолжает с того же места
    const next = new JSDOM('<!doctype html><body><div id="player"><video></video></div></body>', { url: 'https://v14.vost.pw/frame5.php?play=77&old=1', runScripts: 'outside-only', virtualConsole: silent });
    next.window.sessionStorage.setItem('ag_vost_resume', JSON.stringify(saved));
    next.window.eval(read('modules/player/adapters.js'));
    const adapter = next.window.AgPlayerAdapters.current();
    assert.deepEqual([...adapter.quality()].map(x => x.current), [false, true]);
    const v = next.window.document.querySelector('video');
    Object.defineProperty(v, 'readyState', { value: 1 });
    v.play = () => Promise.resolve();
    adapter.onBind(v);
    assert.equal(v.currentTime, 321);
    assert.equal(next.window.sessionStorage.getItem('ag_vost_resume'), null);
});

test('«Смотреть на…» не предлагает AnimeVost, пока поиск по нему не сделан', () => {
    const AgSites = loadSites();
    assert.ok(!AgSites.searchable().some(s => s.id === 'animevost'));
    assert.equal(AgSites.searchable().length, AgSites.list.length - 1);
});
