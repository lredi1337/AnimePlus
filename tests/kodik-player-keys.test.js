// Клавиши плеера и то, что заменило старый экран (content-player.js). Скрипт работает во вложенном окне jsdom
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadPlayerFrame } = require('./helpers');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startPlayer({ settings = { auto_select_voice: false } } = {}) {
    const dom = new JSDOM('<!doctype html><iframe></iframe>', { url: 'https://yummyanime.tv/8522-x.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const frame = dom.window.document.querySelector('iframe').contentWindow;
    const store = { ag_settings: settings };
    const listeners = [];
    frame.document.body.innerHTML = '<video></video><video class="fp-engine"></video><input id="search">';
    frame.chrome = {
        runtime: { id: 'test', getURL: (p) => p, sendMessage() {}, onMessage: { addListener() {} } },
        storage: {
            local: {
                get: async () => ({ ag_settings: store.ag_settings }),
                set: async (obj) => {
                    const changes = {};
                    for (const [k, v] of Object.entries(obj)) { changes[k] = { newValue: v }; store[k] = v; }
                    listeners.forEach(fn => fn(changes, 'local'));
                }
            },
            onChanged: { addListener: (fn) => listeners.push(fn) }
        }
    };
    const toTop = [];
    dom.window.addEventListener('message', (e) => toTop.push(e.data));
    const [empty, main] = frame.document.querySelectorAll('video');
    for (const v of [empty, main]) {
        let t = v === main ? 800 : 0;
        Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; }, configurable: true });
        Object.defineProperty(v, 'paused', { get: () => false, configurable: true });
        v.volume = 0.5;
    }
    loadPlayerFrame(frame);
    await sleep(100);
    frame.document.body.appendChild(frame.document.createElement('div')); // Плеер запускается по изменению страницы
    await sleep(50);

    // Так Kodik обрабатывает свои клавиши: после нашего перехватчика, на всплытии
    const native = [];
    for (const type of ['keydown', 'keyup']) frame.document.body.addEventListener(type, (e) => native.push(`${type} ${e.code}`));
    const press = (key, code, extra = {}, target = frame.document.body) => {
        for (const type of ['keydown', 'keyup']) target.dispatchEvent(new frame.KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, composed: true, ...(type === 'keydown' ? extra : {}) }));
    };
    // Сообщение от страницы сайта, в которую встроен кадр
    const fromPage = (data) => frame.dispatchEvent(new frame.MessageEvent('message', { data, origin: 'https://yummyanime.tv' }));
    return { dom, frame, empty, main, native, press, store, toTop, fromPage };
}

test('стрелки перематывают само видео серии, а не пустой элемент рядом, и только на 5 секунд', async () => {
    const { dom, empty, main, native, press } = await startPlayer();
    press('ArrowRight', 'ArrowRight');
    await sleep(500);
    assert.equal(main.currentTime, 805);
    assert.equal(empty.currentTime, 0);
    assert.deepEqual(native, [], 'до Kodik клавиша не доходит: иначе он перемотал бы ещё раз');
    press('ArrowLeft', 'ArrowLeft');
    press('ArrowLeft', 'ArrowLeft');
    await sleep(500);
    assert.equal(main.currentTime, 795);
    dom.window.close();
});

test('удержание клавиши не перематывает повторно и не доходит до Kodik', async () => {
    const { dom, main, native, press } = await startPlayer();
    press('ArrowRight', 'ArrowRight');
    press('ArrowRight', 'ArrowRight', { repeat: true });
    await sleep(500);
    assert.equal(main.currentTime, 805);
    assert.deepEqual(native, []);
    dom.window.close();
});

test('чужие клавиши остаются у Kodik, а в поле ввода наши не срабатывают', async () => {
    const { dom, frame, main, native, press } = await startPlayer();
    press('q', 'KeyQ');
    assert.deepEqual(native, ['keydown KeyQ', 'keyup KeyQ']);

    const before = main.currentTime;
    const input = frame.document.getElementById('search');
    press('s', 'KeyS', {}, input);
    await sleep(50);
    assert.equal(main.currentTime, before, 'буква в поле поиска не перематывает на 89 секунд');
    dom.window.close();
});

test('старого экрана нет: ни разметки, ни настроек его кнопок', async () => {
    const { dom, frame } = await startPlayer();
    for (const id of ['ag-ui', 'ag-flash', 'ag-fs-patch', 'ag-p', 'ag-n', 'z-m']) assert.equal(frame.document.getElementById(id), null, id);
    for (const key of ['showNav', 'showSkipBtn', 'showPiP', 'showCenterBtn', 'hideTime']) assert.equal(frame.DEFAULT_SETTINGS[key], undefined, key);
    // Кнопки «Пропустить» и «Вернуться» живут только в оболочке: без неё их нет, а пропуск работает сам и клавишей
    assert.equal(frame.document.getElementById('ag-smart-skip'), null);
    assert.equal(frame.document.getElementById('ag-skip-undo'), null);
    dom.window.close();
});

test('M выключает и возвращает звук, стрелки вверх и вниз меняют громкость на 5%', async () => {
    const { dom, main, native, press, store } = await startPlayer();
    press('m', 'KeyM');
    assert.equal(main.muted, true);
    await sleep(20);
    assert.equal(store.ag_settings.playerMuted, true, 'звук выключил сам зритель: новый плеер его не вернёт');
    press('m', 'KeyM');
    assert.equal(main.muted, false);

    press('ArrowUp', 'ArrowUp');
    assert.equal(main.volume, 0.55);
    press('ArrowDown', 'ArrowDown');
    press('ArrowDown', 'ArrowDown');
    assert.equal(main.volume, 0.45);
    assert.deepEqual(native, [], 'до Kodik эти клавиши не доходят');
    dom.window.close();
});

test('Shift+> и Shift+< меняют скорость по шагам меню, скорость запоминается', async () => {
    const { dom, main, press, store } = await startPlayer();
    press('>', 'Period', { shiftKey: true });
    assert.equal(main.playbackRate, 1.25);
    press('>', 'Period', { shiftKey: true });
    assert.equal(main.playbackRate, 1.5);
    await sleep(20);
    assert.equal(store.ag_settings.playbackRate, 1.5);
    press('<', 'Comma', { shiftKey: true });
    press('<', 'Comma', { shiftKey: true });
    press('<', 'Comma', { shiftKey: true });
    assert.equal(main.playbackRate, 0.75);
    press('<', 'Comma', { shiftKey: true });
    assert.equal(main.playbackRate, 0.75, 'медленнее нижнего шага не уходит');
    dom.window.close();
});

test('клавиши работают и в русской раскладке', async () => {
    const { dom, main, press } = await startPlayer();
    press('ы', 'KeyS');
    assert.equal(main.currentTime, 889, 'S в русской раскладке перематывает на 89 секунд');
    press('ь', 'KeyM');
    assert.equal(main.muted, true);
    press('Ю', 'Period', { shiftKey: true });
    assert.equal(main.playbackRate, 1.25);
    dom.window.close();
});

test('запомненная скорость ставится новой серии и новому плееру', async () => {
    const { dom, main, store } = await startPlayer({ settings: { auto_select_voice: false, playbackRate: 1.5 } });
    main.dispatchEvent(new main.ownerDocument.defaultView.Event('playing'));
    assert.equal(main.playbackRate, 1.5);
    // Плеер сбрасывает скорость при загрузке новой серии
    main.playbackRate = 1;
    main.dispatchEvent(new main.ownerDocument.defaultView.Event('loadedmetadata'));
    assert.equal(main.playbackRate, 1.5);
    assert.equal(store.ag_settings.playbackRate, 1.5);
    dom.window.close();
});

test('клавиша, нажатая на странице сайта, приходит в плеер сообщением AG_KEY', async () => {
    const { dom, main, fromPage } = await startPlayer();
    fromPage({ type: 'AG_KEY', action: 'skip' });
    assert.equal(main.currentTime, 889);
    fromPage({ type: 'AG_KEY', action: 'mute' });
    assert.equal(main.muted, true);
    fromPage({ type: 'AG_KEY', action: 'nonexistent' });
    assert.equal(main.currentTime, 889);
    dom.window.close();
});
