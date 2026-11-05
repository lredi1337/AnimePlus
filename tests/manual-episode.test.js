// Серия, выбранная зрителем, не запускается сама. Сама запускается только следующая серия в конце просмотра
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const tick = (ms = 150) => new Promise(r => setTimeout(r, ms));
const PANEL = `<div class="serial-panel"><div class="serial-series-box"><select>
    <option value="1">1 серия</option><option value="2" selected>2 серия</option><option value="3">3 серия</option>
</select></div></div><video class="fp-engine"></video>`;

async function start(url) {
    const dom = new JSDOM('<!doctype html><iframe></iframe>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const frame = dom.window.document.querySelector('iframe').contentWindow;
    frame.document.body.innerHTML = PANEL;
    frame.chrome = {
        runtime: { id: 'test', getURL: (p) => p, sendMessage() {}, onMessage: { addListener() {} } },
        storage: { local: { get: async () => ({ ag_settings: { auto_select_voice: false } }), set: async () => {} }, onChanged: { addListener() {} } }
    };
    frame.eval(read('config.js'));
    frame.eval(read('modules/shared/sites.js'));
    frame.eval(read('modules/player/adapters.js'));
    frame.eval(read('modules/player/skip-memory.js'));
    frame.eval(read('content-player.js'));
    await tick();

    const origin = new URL(url).origin;
    const message = (data) => frame.dispatchEvent(new frame.MessageEvent('message', { data, origin }));
    // Новая серия: плеер снова показывает кнопку запуска
    const newPlayButton = () => {
        const b = frame.document.createElement('div');
        b.className = 'play_button';
        const state = { clicks: 0 };
        b.addEventListener('click', () => { state.clicks += 1; });
        frame.document.body.appendChild(b);
        return state;
    };
    const press = (key) => frame.document.dispatchEvent(new frame.KeyboardEvent('keydown', { key, code: `Key${key.toUpperCase()}`, bubbles: true, cancelable: true }));
    return { dom, frame, message, newPlayButton, press };
}

test('без выбора зрителя следующая серия марафона запускается сама', async () => {
    const { dom, message, newPlayButton } = await start('https://yummyanime.tv/8522-x.html');
    message({ type: 'AG_MARATHON_CONFIRM' });
    const button = newPlayButton();
    await tick(800);
    assert.ok(button.clicks > 0);
    dom.window.close();
});

test('зритель сам сменил серию: она ждёт нажатия запуска', async () => {
    const { dom, message, newPlayButton, press } = await start('https://yummyanime.tv/8522-x.html');
    message({ type: 'AG_MARATHON_CONFIRM' });
    press('n');
    const button = newPlayButton();
    await tick(800);
    assert.equal(button.clicks, 0);
    dom.window.close();
});

test('после ручного выбора конец серии снова включает автозапуск следующей', async () => {
    const { dom, message, newPlayButton, press } = await start('https://yummyanime.tv/8522-x.html');
    message({ type: 'AG_MARATHON_CONFIRM' });
    press('n');
    await tick(900);
    message({ type: 'AG_SWITCH_KODIK_EPISODE', dir: 'next' });
    const button = newPlayButton();
    await tick(800);
    assert.ok(button.clicks > 0);
    dom.window.close();
});

test('на других сайтах поведение не меняется', async () => {
    const { dom, message, newPlayButton, press } = await start('https://animego.me/anime/x-1');
    message({ type: 'AG_MARATHON_CONFIRM' });
    press('n');
    const button = newPlayButton();
    await tick(800);
    assert.ok(button.clicks > 0);
    dom.window.close();
});

// ---------- Оболочка ----------

const SHELL_PAGE = `<!doctype html><html><head><title>Тайтл</title></head><body class="serial active-player player-is-ready">
<div class="serial-panel"><div class="serial-series-box"><select><option value="1" data-title="1 серия">1 серия</option><option value="2" data-title="2 серия" selected>2 серия</option><option value="3" data-title="3 серия">3 серия</option></select></div>
<div class="serial-translations-box"><select><option value="9" data-title="AniDUB">AniDUB</option><option value="8" data-title="JAM" selected>JAM</option></select></div></div>
<div class="fp-player"><video class="fp-engine"></video></div></body></html>`;

function mountShell() {
    const dom = new JSDOM(SHELL_PAGE, { url: 'https://kodikplayer.com/serial/1/a/720p', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
    w.eval(read('modules/player/adapters.js'));
    w.eval(read('modules/player/shell-view.js'));
    w.eval(read('modules/player/shell.js'));
    const picks = [];
    const shell = w.AgPlayerShell.create({
        getSettings: () => ({ voice_priority_list: [] }),
        patchSettings: async () => {},
        getTimings: () => ({ op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } }),
        nav() {},
        toggleFs() {},
        onVoicePicked() {},
        onOwnEpisodePick: () => picks.push('episode')
    });
    return { w, shell, sh: w.document.getElementById('ag-shell').shadowRoot, picks };
}

test('выбор в списке серий сообщает о решении зрителя, выбор озвучки нет', () => {
    const { sh, shell, picks } = mountShell();
    sh.querySelector('[data-act="voices"]').click();
    [...sh.querySelectorAll('.panel .row')].find(r => !r.classList.contains('on')).click();
    assert.deepEqual(picks, []);
    sh.querySelector('[data-act="episodes"]').click();
    sh.querySelectorAll('.panel .ep')[2].click();
    assert.deepEqual(picks, ['episode']);
    shell.destroy();
});

test('плеер сообщил новые списки: открытая панель серий показывает текущую серию', () => {
    const { w, sh, shell } = mountShell();
    sh.querySelector('[data-act="episodes"]').click();
    assert.equal(sh.querySelector('.panel .ep.now').textContent, '2');
    w.document.querySelector('.serial-series-box select').selectedIndex = 0;
    w.document.dispatchEvent(new w.Event('ag-player-lists'));
    assert.equal(sh.querySelector('.panel .ep.now').textContent, '1');
    shell.destroy();
});

// ---------- Плеер, который сам запускает выбранную серию ----------

function holdFrame() {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://player.cdnvideohub.com/s2/frame/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.eval(read('modules/player/adapters.js'));
    const video = { currentSrc: 'blob:one', paused: false, pauses: 0, pause() { this.paused = true; this.pauses += 1; } };
    const player = { video: () => video, adState: () => player.ad, ad: 'none' };
    return { w, video, player, hold: w.AgPlayerAdapters.holdPickedEpisode };
}

test('CVH сам запустил выбранную серию: она встаёт на паузу', async () => {
    const { w, video, player, hold } = holdFrame();
    const stop = hold(player);
    await tick(250);
    assert.equal(video.pauses, 0, 'старая серия ещё играет');
    video.currentSrc = 'blob:two';
    await tick(250);
    assert.equal(video.pauses, 1);
    stop();
    w.close();
});

test('реклама перед выбранной серией не ставится на паузу, сама серия ставится', async () => {
    const { w, video, player, hold } = holdFrame();
    const stop = hold(player);
    video.currentSrc = 'blob:two';
    player.ad = 'playing';
    await tick(250);
    assert.equal(video.pauses, 0);
    player.ad = 'none';
    await tick(250);
    assert.equal(video.pauses, 1);
    stop();
    w.close();
});

test('зритель сам нажал запуск: пауза больше не ставится', async () => {
    const { w, video, player, hold } = holdFrame();
    const stop = hold(player);
    await tick(350);
    w.document.dispatchEvent(new w.Event('pointerdown'));
    video.currentSrc = 'blob:two';
    await tick(250);
    assert.equal(video.pauses, 0);
    stop();
    w.close();
});
