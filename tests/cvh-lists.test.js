// CVH на сайтах, которые не ведут списки сами: серии и озвучки плеер сообщает сообщением от страницы-обёртки
const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const cvhControls = (current = 3) => ({
    isSerial: true,
    isShowVoiceOnly: false,
    currentSeason: {
        name: 2,
        episodes: Object.fromEntries([1, 2, 3, 10].map(n => [n, { name: n, visibleName: String(n), voices: {} }]))
    },
    currentEpisode: {
        name: current,
        visibleName: String(current),
        voices: {
            'Dream Cast': { name: 'Dream Cast', voiceType: 'Дубляж', voiceStudio: 'Dream Cast' },
            'Youkai Studio · Дубляж': { name: 'Youkai Studio · Дубляж', voiceType: 'Дубляж', voiceStudio: 'Youkai Studio' },
            Netflix: { name: 'Netflix', voiceType: 'Субтитры', voiceStudio: 'Netflix' }
        }
    },
    currentVoice: { name: 'Dream Cast', voiceType: 'Дубляж', voiceStudio: 'Dream Cast' }
});

function cvhFrame(body = '', referrer = 'https://jut-su.net/') {
    const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, { url: 'https://player.cdnvideohub.com/s2/v2.40.0/frame/', referrer, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}) } } };
    w.eval(read('modules/shared/sites.js'));
    w.eval(read('modules/player/boot.js'));
    w.eval(read('modules/player/adapters.js'));
    // Сообщение плеера приходит из родительского окна: в jsdom это само окно
    const send = (data, source = w) => w.dispatchEvent(new w.MessageEvent('message', { data, source }));
    const render = (controls) => send({ type: 'renderControls', key: 'cvh_player_2.40.0', payload: JSON.stringify(controls) });
    return { w, send, render, player: w.AgPlayerAdapters.current() };
}

for (const site of ['jut-su.net', 'yammyanime.club', 'animego.online', 'yummyanime.tv']) {
    test(`CVH на ${site}: серии и озвучки берутся из сообщения плеера`, () => {
        const { render, player } = cvhFrame('', `https://${site}/`);
        assert.strictEqual(player.read('episodes').length, 0);
        render(cvhControls());
        const episodes = player.read('episodes');
        assert.deepStrictEqual(Array.from(episodes, o => o.label), ['1', '2', '3', '10']);
        assert.strictEqual(episodes.find(o => o.selected).label, '3');
        const voices = player.read('voices');
        assert.deepStrictEqual(Array.from(voices, o => o.title), ['Dream Cast', 'Youkai Studio', 'Netflix']);
        assert.strictEqual(voices.find(o => o.selected).title, 'Dream Cast');
        assert.strictEqual(voices[2].type, 'subtitles');
        assert.strictEqual(player.hasLists(), true);
    });
}

for (const site of ['animego.me', 'animego.org', 'ru.yummyani.me', 'old.yummyani.me', 'jut-su.net.evil.example']) {
    test(`CVH на ${site}: плеер работает как раньше, без своих списков`, () => {
        const { w, render, player } = cvhFrame('', `https://${site}/`);
        let changed = 0;
        w.document.addEventListener('ag-player-lists', () => { changed += 1; });
        render(cvhControls());
        assert.strictEqual(changed, 0);
        assert.strictEqual(player.read('episodes').length, 0);
        assert.strictEqual(player.read('voices').length, 0);
        assert.strictEqual(player.hasLists(), false);
    });
}

test('CVH: сообщение с чужим ключом или от другого окна не считается', () => {
    const { send, player } = cvhFrame();
    send({ type: 'renderControls', key: 'other', payload: JSON.stringify(cvhControls()) });
    send({ type: 'renderControls', key: 'cvh_player_2.40.0', payload: 'не json' });
    const stranger = new JSDOM('').window;
    send({ type: 'renderControls', key: 'cvh_player_2.40.0', payload: JSON.stringify(cvhControls()) }, stranger);
    assert.strictEqual(player.read('episodes').length, 0);
});

test('CVH: плеер на одну серию не показывает списка серий', () => {
    const { render, player } = cvhFrame();
    render({ ...cvhControls(), isSerial: false });
    assert.strictEqual(player.read('episodes').length, 0);
    assert.strictEqual(player.hasLists(), false);
    render({ ...cvhControls(), isShowVoiceOnly: true });
    assert.strictEqual(player.read('episodes').length, 0);
    assert.strictEqual(player.read('voices').length, 3);
});

test('CVH: о смене списков узнаёт плеер Anime+', () => {
    const { w, render } = cvhFrame();
    let changed = 0;
    w.document.addEventListener('ag-player-lists', () => { changed += 1; });
    render(cvhControls());
    render(cvhControls());
    assert.strictEqual(changed, 1);
    render(cvhControls(2));
    assert.strictEqual(changed, 2);
});

test('CVH: выбор серии открывает родное меню и нажимает нужную строку', async () => {
    const { w, render, player } = cvhFrame('<div id="app"><button class="chip chip--episode">Серия 3</button></div>');
    render(cvhControls());
    const clicked = [];
    w.document.querySelector('.chip--episode').addEventListener('click', () => {
        // Меню появляется не сразу, как в настоящем плеере
        setTimeout(() => {
            w.document.getElementById('app').insertAdjacentHTML('beforeend', '<div class="nav-menu"><button class="nav-erow"><span>Серия 1</span></button><button class="nav-erow"><span>Серия 10</span></button></div>');
            w.document.querySelectorAll('.nav-erow').forEach(b => b.addEventListener('click', () => clicked.push(b.textContent)));
        }, 50);
    });
    player.choose('episodes', player.read('episodes').findIndex(o => o.label === '1'));
    await new Promise(r => setTimeout(r, 500));
    assert.deepStrictEqual(clicked, ['Серия 1']);
});

test('CVH: выбор озвучки различает студию и тип', async () => {
    const { w, render, player } = cvhFrame(`<div id="app"><button class="chip chip--voice"></button><div class="nav-menu">
        <button class="nav-vrow" id="a"><span class="nav-vrow-name">Youkai Studio</span><span class="nav-vrow-note">Многоголосый</span></button>
        <button class="nav-vrow" id="b"><span class="nav-vrow-name">Youkai Studio</span><span class="nav-vrow-note">Дубляж</span></button></div></div>`);
    render(cvhControls());
    const clicked = [];
    w.document.querySelectorAll('.nav-vrow').forEach(b => b.addEventListener('click', () => clicked.push(b.id)));
    player.choose('voices', player.read('voices').findIndex(o => o.title === 'Youkai Studio'));
    await new Promise(r => setTimeout(r, 100));
    assert.deepStrictEqual(clicked, ['b']);
});

test('CVH: уже выбранная серия не нажимается', async () => {
    const { w, render, player } = cvhFrame('<button class="chip chip--episode"></button>');
    render(cvhControls());
    let clicks = 0;
    w.document.querySelector('.chip--episode').addEventListener('click', () => { clicks += 1; });
    player.choose('episodes', player.read('episodes').findIndex(o => o.selected));
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(clicks, 0);
});

test('CVH: родные стрелки и меню скрыты под оболочкой', () => {
    const { player } = cvhFrame();
    for (const s of ['.player-nav-button', '.nav-menu', '.nav-scrim']) assert.ok(player.css.includes(s), s);
});

test('CVH: во время показа видео родная кнопка скрыта, выбор сначала показывает её', async () => {
    const { w, render, player } = cvhFrame('<div id="app"></div>');
    render(cvhControls());
    const app = w.document.getElementById('app');
    const clicked = [];
    // Как в настоящем плеере: кнопки нет, пока над ним не шевельнули мышью
    app.addEventListener('mousemove', () => {
        if (app.querySelector('.chip--episode')) return;
        app.insertAdjacentHTML('beforeend', '<button class="chip chip--episode"></button>');
        app.querySelector('.chip--episode').addEventListener('click', () => {
            app.insertAdjacentHTML('beforeend', '<div class="nav-menu"><button class="nav-erow">Серия 2</button></div>');
            app.querySelector('.nav-erow').addEventListener('click', () => clicked.push('2'));
        });
    });
    player.choose('episodes', player.read('episodes').findIndex(o => o.label === '2'));
    await new Promise(r => setTimeout(r, 700));
    assert.strictEqual(clicked.join(), '2');
});
