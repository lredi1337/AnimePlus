// Адаптеры плееров: выбор по адресу кадра и работа с родными элементами каждого плеера
const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

function frame(url, body) {
    const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    dom.window.eval(read('modules/player/adapters.js'));
    return dom.window;
}

const ALLOHA = `<div data-select="translationType1"><button class="select__drop-item active">Anilibria</button><button class="select__drop-item">AniDUB</button></div>
<div data-select="episodeType1"><button class="select__drop-item">Серия 1</button><button class="select__drop-item active">Серия 2</button></div>
<video class="allplay__video"></video>`;

test('адаптер выбирается по адресу кадра, зеркала Kodik остаются на Kodik', () => {
    const { byHost } = require('../modules/player/adapters.js');
    const ids = Object.fromEntries(['kodikplayer.com', 'anivod.com', 'alloha.yani.tv', 'absciss.thealloha.club', 'player.aksor.tv', 'player.cdnvideohub.com', 'ceramet.net', 'aniboom.one'].map(h => [h, byHost(h).id]));
    assert.deepStrictEqual(ids, {
        'kodikplayer.com': 'kodik',
        'anivod.com': 'kodik',
        'alloha.yani.tv': 'alloha',
        'absciss.thealloha.club': 'alloha',
        'player.aksor.tv': 'aksor',
        'player.cdnvideohub.com': 'cvh',
        'ceramet.net': 'ceramet',
        'aniboom.one': 'aniboom'
    });
});

test('чужой адрес с похожим именем не считается плеером', () => {
    const { byHost } = require('../modules/player/adapters.js');
    assert.strictEqual(byHost('fake-ceramet.net').id, 'kodik');
    assert.strictEqual(byHost('aksor.tv.example.com').id, 'kodik');
});

test('Alloha: списки читаются и выбираются, номер серии без лишнего слова', () => {
    const w = frame('https://absciss.thealloha.club/?token=1', ALLOHA);
    const player = w.AgPlayerAdapters.current();
    const eps = player.read('episodes');
    assert.deepStrictEqual([...eps].map(o => [o.label, o.selected]), [['1', false], ['2', true]]);
    let clicked = null;
    w.document.querySelectorAll('[data-select^="episodeType"] button')[0].addEventListener('click', () => { clicked = 1; });
    player.choose('episodes', 0);
    assert.strictEqual(clicked, 1);
    assert.strictEqual(player.video().className, 'allplay__video');
});

test('Alloha: номер серии без слова, где бы оно ни стояло', () => {
    const w = frame('https://absciss.thealloha.club/', '<div data-select="episodeType1"><button class="select__drop-item active">1 серия</button><button class="select__drop-item">Серия 2</button></div>');
    assert.deepStrictEqual([...w.AgPlayerAdapters.current().read('episodes')].map(o => o.label), ['1', '2']);
});

test('Alloha: список, который сайт попросил спрятать, не используется', () => {
    const w = frame('https://alloha.yani.tv/?hidden=translation,season,episode', ALLOHA);
    const player = w.AgPlayerAdapters.current();
    assert.strictEqual(player.read('voices').length, 0);
    assert.strictEqual(player.read('episodes').length, 0);
});

test('ceramet: серии и озвучки из своих меню, пустышка рекламы рекламой не считается', () => {
    const w = frame('https://ceramet.net/bil/1', `<video class="vjs-tech"></video><video class="v-player__video"></video>
        <div class="episodeSelect"><div class="ultimateSelect_option">1 episode</div><div class="ultimateSelect_option ultimateSelect_option__isSelected">5 episode</div></div>`);
    const player = w.AgPlayerAdapters.current();
    assert.deepStrictEqual([...player.read('episodes')].map(o => [o.label, o.selected]), [['1', false], ['5', true]]);
    const ad = w.document.querySelector('.v-player__video');
    Object.defineProperty(ad, 'paused', { value: false });
    Object.defineProperty(ad, 'currentSrc', { value: 'https://ceramet.net/_blank.mp4', configurable: true });
    assert.strictEqual(player.adState(), 'none');
    Object.defineProperty(ad, 'currentSrc', { value: 'https://ads.example/video.mp4' });
    assert.strictEqual(player.adState(), 'playing');
});

test('ceramet: свой отсчёт перехода и автопропуск отменяются', () => {
    const w = frame('https://ceramet.net/bil/1', '<div class="postload-wrapper"><div class="postload-close-button"></div></div><div class="skip-wrap"><div class="close-button"></div></div>');
    const player = w.AgPlayerAdapters.current();
    const clicked = [];
    for (const name of ['.postload-close-button', '.skip-wrap .close-button']) {
        const el = w.document.querySelector(name);
        el.getBoundingClientRect = () => ({ width: 40, height: 40 });
        el.addEventListener('click', () => clicked.push(name));
    }
    player.tick();
    assert.deepStrictEqual(clicked, ['.postload-close-button', '.skip-wrap .close-button']);
});

test('Aksor: сам не запускается и не остаётся без звука после запуска зрителем', () => {
    const w = frame('https://player.aksor.tv/video/1', '<video class="_video_abc"></video>');
    const player = w.AgPlayerAdapters.current();
    const v = player.video();
    let pauses = 0;
    v.pause = () => { pauses++; };
    v.play = async () => {};
    v.muted = true;
    v.volume = 0;
    player.onBind(v);
    v.dispatchEvent(new w.Event('play'));
    assert.strictEqual(pauses, 2);
    player.start(v);
    v.dispatchEvent(new w.Event('play'));
    assert.strictEqual(pauses, 2);
    assert.strictEqual(v.muted, false);
    assert.strictEqual(v.volume, 1);
});

test('Aksor: запуск идёт через его собственную кнопку, иначе время стоит', () => {
    const w = frame('https://player.aksor.tv/video/1', '<video class="_video_abc"></video><button aria-label="Play"></button>');
    const player = w.AgPlayerAdapters.current();
    const v = player.video();
    let direct = 0;
    let native = 0;
    v.play = async () => { direct++; };
    v.pause = () => {};
    w.document.querySelector('[aria-label="Play"]').addEventListener('click', () => { native++; });
    player.start(v);
    assert.strictEqual(native, 1);
    assert.strictEqual(direct, 0);
});

test('Aksor: под оболочкой не видно его значка паузы, экрана загрузки и управления', () => {
    // Разметка снята с player.aksor.tv 2026-11-07: значок и экран загрузки лежат рядом с управлением, а не внутри
    const w = frame('https://player.aksor.tv/video/1', `<div class="_app_1dl7b_1"><div class="_playerHost_1dl7b_6">
        <video class="_video_1dl7b_22"></video>
        <div class="_loadingOverlay_i0mcd_1"><div class="_loadingCard_i0mcd_10"><div class="_loadingTitle_i0mcd_44">Loading video</div></div></div>
        <button class="_centerPlayButton_1t3x7_1 _centerPlayButtonFading_1t3x7_36"></button>
        <div class="_controls_1647g_1"></div>
        <div class="_settingsPanel_1ydx9_1"></div>
    </div></div>`);
    w.document.body.classList.add('ag-shell-on');
    const style = w.document.createElement('style');
    style.textContent = w.AgPlayerAdapters.current().css;
    w.document.head.appendChild(style);
    const hiding = [...style.sheet.cssRules].filter(r => r.style && r.style.getPropertyValue('opacity') === '0').map(r => r.selectorText);
    const hidden = (cls) => {
        const el = w.document.querySelector(`[class*="${cls}"]`);
        return hiding.some(sel => el.matches(sel));
    };
    for (const cls of ['_controls_', '_settingsPanel_', '_centerPlayButton_', '_loadingOverlay_']) assert.ok(hidden(cls), `${cls} скрыт`);
    assert.ok(!hiding.some(sel => w.document.querySelector('video').matches(sel)), 'само видео видно');
});

test('Aksor: пока оболочка грузится, его значок паузы и экран загрузки тоже не видны', () => {
    const dom = new JSDOM(`<!doctype html><html><body><div class="_playerHost_1dl7b_6">
        <video class="_video_1dl7b_22"></video>
        <div class="_loadingOverlay_i0mcd_1"></div><button class="_centerPlayButton_1t3x7_1"></button><div class="_controls_1647g_1"></div>
    </div></body></html>`, { url: 'https://player.aksor.tv/video/1', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}) } } };
    w.eval(read('modules/shared/sites.js'));
    w.eval(read('modules/player/boot.js'));
    const sheet = w.document.getElementById('ag-shell-boot-style').sheet;
    const hiding = [...sheet.cssRules].filter(r => r.style && r.style.getPropertyValue('opacity') === '0').map(r => r.selectorText);
    for (const cls of ['_controls_', '_centerPlayButton_', '_loadingOverlay_']) {
        const el = w.document.querySelector(`[class*="${cls}"]`);
        assert.ok(hiding.some(sel => el.matches(sel)), `${cls} скрыт до оболочки`);
    }
    assert.ok(!hiding.some(sel => w.document.querySelector('video').matches(sel)), 'само видео видно');
});

test('CVH: видео и родное управление находятся в Shadow DOM', () => {
    const w = frame('https://player.cdnvideohub.com/s2/frame/', '<div class="shadow-root-container"></div>');
    const root = w.document.querySelector('.shadow-root-container').attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="keyboard-controls"><video class="player-media"></video></div>';
    const player = w.AgPlayerAdapters.current();
    assert.strictEqual(player.video().className, 'player-media');
    player.inject(true);
    player.inject(true);
    assert.strictEqual(root.querySelectorAll('style').length, 1);
    player.inject(false);
    assert.strictEqual(root.querySelectorAll('style').length, 0);
});

test('Alloha: ошибка плеера и страница «контент не найден» различаются', () => {
    const w = frame('https://absciss.thealloha.club/', '<div id="allplay"><div class="error_message hidden"></div><div class="error_message error_unsupported"></div></div>');
    const player = w.AgPlayerAdapters.current();
    assert.strictEqual(player.fault(), false);
    w.document.querySelector('.error_message').classList.remove('hidden');
    assert.strictEqual(player.fault(), true);
    assert.strictEqual(player.gone(), false);
    const gone = frame('https://absciss.thealloha.club/', 'К сожалению, запрашиваемый контент не найден.');
    assert.strictEqual(gone.AgPlayerAdapters.current().gone(), true);
});

test('сезон страницы берётся из названия, без номера это первый сезон', () => {
    const { makeContentWindow } = require('./dom-helpers');
    const { window: w } = makeContentWindow('<h1>т</h1>', 'https://yammyanime.club/catalog/item/x');
    const season = w.AgProviders.seasonFromTitle;
    assert.strictEqual(season('Киберпанк: Бегущие по краю (2 сезон)'), 2);
    assert.strictEqual(season('Монолог фармацевта 3 сезон'), 3);
    assert.strictEqual(season('Магическая битва. Сезон 2'), 2);
    assert.strictEqual(season('Frieren Season 2'), 2);
    assert.strictEqual(season('Человек-бензопила 2'), 2);
    assert.strictEqual(season('Провожающая в последний путь Фрирен'), 1);
    assert.strictEqual(season('Mob Psycho 100'), 1);
    assert.strictEqual(season(''), 1);
    w.close();
});

test('плеер без своих списков не ждёт их появления', () => {
    const { byHost } = require('../modules/player/adapters.js');
    const has = (host) => byHost(host).hasLists();
    assert.strictEqual(has('aniboom.one'), false);
    assert.strictEqual(has('player.cdnvideohub.com'), false);
    assert.strictEqual(has('absciss.thealloha.club'), true);
});

test('спящая обработка звука плеера просыпается при нажатии зрителя', async () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const path = require('node:path');
    const handlers = {};
    class FakeContext {
        constructor() { this.state = 'suspended'; }
        async resume() { this.state = 'running'; }
    }
    const window = { AudioContext: FakeContext, addEventListener: (type, fn) => { handlers[type] = fn; } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../modules/player/audio-unlock.js'), 'utf8'), { window });
    const context = new window.AudioContext();
    assert.ok(context instanceof FakeContext);
    assert.equal(context.state, 'suspended');
    handlers.pointerdown();
    assert.equal(context.state, 'running');
});
