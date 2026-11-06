// AnimeGO и Jut-Su на общем каркасе: сведения о странице, серии, панели плеера, поиск и случайное аниме
const { test } = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const LD = JSON.stringify({ '@type': 'TVSeries', name: 'Провожающая', alternateName: 'Sousou no Frieren', datePublished: '2023-09-29' });
const ANIMEGO = `<script type="application/ld+json">${LD}</script>
<div class="entity__title"><h1>Провожающая</h1></div>
<div class="player__video"><div class="player-video">
    <button data-player="//animego.me/cdn-iframe/52991/Dream%20Cast/1/1" data-anime-player-target="provider" data-ptranslation="1" data-provider-slug="cvh">CVH</button>
    <button class="active" data-anime-player-target="provider" data-ptranslation="1" data-provider-slug="kodik">Kodik</button>
    <button data-anime-player-target="provider" data-ptranslation="2" data-provider-slug="kodik">Kodik 2</button>
    <button class="active" data-anime-player-target="translation" data-translation="1"><span class="text-truncate">Dream Cast</span></button>
    <button class="player-error" data-anime-player-target="translation" data-translation="3">Сломанная</button>
    <button data-anime-player-target="translation" data-translation="2"><span class="text-truncate">AniLibria</span></button>
    <div data-anime-player-episodes-target="episode" data-episode-number="1"><button></button></div>
    <div class="active" data-anime-player-episodes-target="episode" data-episode-number="2" data-episode-watched="true"><button></button></div>
    <div data-anime-player-episodes-target="episode" data-episode-number="3"><button></button></div>
    <button class="player-video-bar__arrow next"></button>
</div></div>`;

function animego(url = 'https://animego.me/anime/frieren-2430', html = ANIMEGO) {
    const { window: w } = makeContentWindow(html, url);
    w.eval(read('modules/site-selectors.js'));
    const site = w.AgSites.byId('animego');
    const Provider = w.AgProviders.registry[site.provider || site.platform];
    return { w, doc: w.document, provider: new Provider(site, {}) };
}

test('AnimeGO: сведения о тайтле, ID из адреса плеера вместо поиска по названию', async () => {
    const { provider } = animego();
    assert.ok(provider.isTitlePage());
    const info = await provider.getTitleInfo();
    assert.strictEqual(info.pageKey, 'frieren-2430');
    assert.strictEqual(info.shikimoriId, 52991);
    assert.strictEqual(info.year, '2023');
    assert.strictEqual(info.kind, 'tv');
    assert.deepStrictEqual([...info.titles], ['Sousou no Frieren', 'Провожающая']);
});

test('AnimeGO: адрес вида /anime/top-250 — не страница тайтла, страница вне каталога — тоже', async () => {
    const list = animego('https://animego.me/anime/top-250', '<main><h1>ТОП-250 аниме</h1></main>');
    assert.ok(!list.provider.isTitlePage());
    assert.strictEqual(await list.provider.getTitleInfo(), null);

    const synthetic = animego('https://animego.me/anime/shiki-5114', '<div class="entity__title"><h1>Стальной алхимик</h1></div>');
    assert.ok(!synthetic.provider.isTitlePage());
    assert.strictEqual((await synthetic.provider.getTitleInfo()).title, 'Стальной алхимик');
});

test('AnimeGO: номер серии всегда со страницы, а не из сообщения плеера', () => {
    const { provider } = animego();
    assert.strictEqual(provider.getEpisode('1'), '2');
});

test('AnimeGO: панели плеера получают списки сайта, сломанная озвучка скрыта, плееры только текущей озвучки', async () => {
    const { provider } = animego();
    const site = await provider.getShellSite();
    assert.deepStrictEqual([...site.episodes].map(e => [e.label, e.selected, e.seen]), [['1', false, false], ['2', true, true], ['3', false, false]]);
    assert.deepStrictEqual([...site.voices].map(v => v.title), ['Dream Cast', 'AniLibria']);
    assert.deepStrictEqual([...site.players].map(p => p.slug), ['cvh', 'kodik']);
});

test('AnimeGO: выбор в панели нажимает кнопки самого сайта и запоминает озвучку', async () => {
    const { w, doc, provider } = animego();
    const clicks = [];
    doc.addEventListener('click', (e) => clicks.push(e.target.dataset.translation || e.target.parentElement.dataset.episodeNumber));
    let remembered = null;
    w.agRememberVoice = (name) => { remembered = name; };
    await provider.shellPick('episodes', 2);
    assert.deepStrictEqual(clicks, ['3']);
    const voices = (await provider.getShellSite()).voices;
    await provider.shellPick('voices', voices[1].index);
    assert.strictEqual(remembered, 'AniLibria');
    assert.strictEqual(clicks[1], '2');
});

test('AnimeGO: переключение нажимает соседнюю серию в списке и продолжает марафон', () => {
    const { doc, w, provider } = animego();
    const clicks = [];
    doc.addEventListener('click', (e) => clicks.push(e.target.parentElement.dataset.episodeNumber));
    assert.strictEqual(provider.navigate('next'), true);
    assert.deepStrictEqual(clicks, ['3']);
    assert.strictEqual(w.sessionStorage.getItem('ag_active_marathon_id'), 'frieren-2430');
    provider.navigate('prev');
    assert.deepStrictEqual(clicks, ['3', '1']);
});

test('AnimeGO: на последней серии никуда не переходим, а без списка серий нажимаем стрелку', () => {
    const last = animego('https://animego.me/anime/frieren-2430', ANIMEGO.replace('<div class="active" data-anime-player-episodes-target="episode" data-episode-number="2"', '<div data-anime-player-episodes-target="episode" data-episode-number="2"').replace('<div data-anime-player-episodes-target="episode" data-episode-number="3"', '<div class="active" data-anime-player-episodes-target="episode" data-episode-number="3"'));
    let clicked = 0;
    last.doc.addEventListener('click', () => { clicked++; });
    assert.strictEqual(last.provider.navigate('next'), true);
    assert.strictEqual(clicked, 0);

    const arrows = animego('https://animego.me/anime/frieren-2430', '<script type="application/ld+json">' + LD + '</script><h1>x</h1><button class="player-video-bar__arrow next"></button>');
    let arrow = false;
    arrows.doc.querySelector('.next').addEventListener('click', () => { arrow = true; });
    assert.strictEqual(arrows.provider.navigate('next'), true);
    assert.ok(arrow);
    assert.strictEqual(arrows.provider.navigate('prev'), false);
});

const JUTSU_SEARCH = `
<div class="jutsu-item"><a class="jutsu-item__title" href="/5878-frieren-2.html">Фрирен 2 сезон</a><div class="jutsu-item__subtitle">TV, 2026</div></div>
<div class="jutsu-item"><a class="jutsu-item__title" href="/3325-frieren.html">Фрирен</a><div class="jutsu-item__subtitle">TV, 2023</div></div>
<div class="jutsu-item"><a class="jutsu-item__title" href="/3325-frieren.html">Фрирен</a><div class="jutsu-item__subtitle">TV, 2023</div></div>`;

function jutsu(html, url = 'https://jut-su.net/') {
    const { window: w } = makeContentWindow(html, url);
    const site = w.AgSites.byId('jutsu');
    return { w, provider: new (w.AgProviders.registry[site.provider])(site, {}) };
}

test('Jut-Su: карточки поиска с годом и без дублей', () => {
    const { provider } = jutsu(JUTSU_SEARCH, 'https://jut-su.net/?do=search&story=x');
    assert.ok(provider.isSearchPage());
    assert.deepStrictEqual([...provider.collectSearchCards()].map(c => [c.href, c.title, c.year]), [
        ['https://jut-su.net/5878-frieren-2.html', 'Фрирен 2 сезон', '2026'],
        ['https://jut-su.net/3325-frieren.html', 'Фрирен', '2023']
    ]);
});

test('Jut-Su: случайное аниме остаётся на Jut-Su, а не уходит в каталог AnimeGO', () => {
    const { provider } = jutsu('<div></div>');
    assert.strictEqual(provider.getRandomUrl({ jutsuUrl: 'https://jut-su.net/1-a.html', url: 'https://animego.me/anime/a-1' }), 'https://jut-su.net/1-a.html');
    assert.match(provider.getRandomUrl({ russian: 'Фрирен', url: 'https://animego.me/anime/a-1' }), /^\/\?do=search.*story=%D0%A4/);
});

test('Jut-Su: оценка Shikimori уже на странице — отдельная кнопка не нужна, логотип с плюсом', () => {
    const { w, provider } = jutsu('<a class="jutsu-header__logo logo">JUT-SU<span>.net</span></a><div class="jutsu-page__ratings-item--shikimori"></div>');
    assert.strictEqual(provider.showsShikimoriRating, true);
    w.agSelectors = w.agSelectors || {};
    provider.mount(new w.AgProviders.Scope());
    assert.ok(w.document.querySelector('#ag-logo-plus'));
});

test('старые модули не подключены, у всех сайтов есть провайдер', () => {
    const m = JSON.parse(read('manifest.json'));
    const scripts = m.content_scripts.flatMap(b => b.js || []);
    for (const gone of ['content-animego.js', 'content-jutsu.js', 'features/legacy-top.js']) assert.ok(!scripts.includes(gone), gone);
    assert.ok(!scripts.some(s => s.startsWith('modules/jutsu/')));
    const blockFor = (host) => m.content_scripts.find(b => b.matches.includes(host) && (b.js || []).includes('providers/runtime.js'));
    assert.ok(blockFor('https://animego.me/*').js.includes('providers/animego.js'));
    assert.ok(blockFor('https://jut-su.net/*').js.includes('providers/jutsu.js'));
    const { window: w } = makeContentWindow('<div></div>', 'https://jut-su.net/');
    for (const site of w.AgSites.list) {
        assert.ok(w.AgProviders.registry[site.provider || site.platform], site.id);
        assert.strictEqual(site.legacy, undefined);
    }
});

// Длинный сериал на AnimeGO: сайт держит в разметке одну сотню серий, остальные описаны в атрибутах плеера
const PAGES = JSON.stringify([{ page: 0, firstNumber: 1, lastNumber: 100, count: 100 }, { page: 1, firstNumber: 101, lastNumber: 200, count: 100 }, { page: 2, firstNumber: 201, lastNumber: 250, count: 50 }]).replace(/"/g, '&quot;');
const DOM_EPISODES = Array.from({ length: 100 }, (_, i) => `<div class="${i === 49 ? 'active' : ''}" data-anime-player-episodes-target="episode" data-episode-number="${i + 101}"><button></button></div>`).join('');
const LONG = `<div class="entity__title"><h1>Ван-Пис</h1></div><div class="player__video"><div class="player-video" data-anime-player-episodes-total-value="250" data-anime-player-episodes-pages-value="${PAGES}">
<input data-anime-player-episodes-target="searchInput">${DOM_EPISODES}</div></div>`;

test('AnimeGO: длинный сериал — в панели все серии, а не только загруженная сотня', async () => {
    const { provider } = animego('https://animego.me/anime/van-pis-s1-65', LONG);
    const eps = (await provider.getShellSite()).episodes;
    assert.strictEqual(eps.length, 250);
    assert.deepStrictEqual([eps[0].label, eps[249].label], ['1', '250']);
    assert.deepStrictEqual([...eps].filter(e => e.selected).map(e => e.label), ['150']);
    assert.strictEqual(provider.getEpisode(), '150');
});

test('AnimeGO: серия из незагруженной сотни выбирается полем номера самого сайта', async () => {
    const { w, doc, provider } = animego('https://animego.me/anime/van-pis-s1-65', LONG);
    const input = doc.querySelector('[data-anime-player-episodes-target="searchInput"]');
    const events = [];
    input.addEventListener('input', () => events.push(['input', input.value]));
    input.addEventListener('keydown', (e) => events.push(['key', e.key, input.value]));
    const clicks = [];
    doc.addEventListener('click', (e) => clicks.push(e.target.parentElement.dataset.episodeNumber));
    const eps = (await provider.getShellSite()).episodes;
    await provider.shellPick('episodes', eps.find(e => e.label === '7').index);
    assert.deepStrictEqual(events, [['input', '7'], ['key', 'Enter', '7']]);
    await provider.shellPick('episodes', eps.find(e => e.label === '120').index);
    assert.deepStrictEqual(clicks, ['120']);
    assert.ok(w);
});
