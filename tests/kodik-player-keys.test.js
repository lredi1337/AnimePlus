// Клавиши плеера и то, что заменило старый экран (content-kodik.js). Скрипт работает во вложенном окне jsdom
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startPlayer() {
    const dom = new JSDOM('<!doctype html><iframe></iframe>', { url: 'https://yummyanime.tv/8522-x.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const frame = dom.window.document.querySelector('iframe').contentWindow;
    frame.document.body.innerHTML = '<video></video><video class="fp-engine"></video><input id="search">';
    frame.chrome = {
        runtime: { id: 'test', getURL: (p) => p, sendMessage() {}, onMessage: { addListener() {} } },
        storage: { local: { get: async () => ({ ag_settings: { auto_select_voice: false } }), set: async () => {} }, onChanged: { addListener() {} } }
    };
    const [empty, main] = frame.document.querySelectorAll('video');
    for (const v of [empty, main]) {
        let t = v === main ? 800 : 0;
        Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; }, configurable: true });
        Object.defineProperty(v, 'paused', { get: () => false, configurable: true });
    }
    frame.eval(read('config.js'));
    frame.eval(read('modules/shared/sites.js'));
    frame.eval(read('modules/kodik/skip-memory.js'));
    frame.eval(read('content-kodik.js'));
    await sleep(100);
    frame.document.body.appendChild(frame.document.createElement('div')); // Плеер запускается по изменению страницы
    await sleep(50);

    // Так Kodik обрабатывает свои клавиши: после нашего перехватчика, на всплытии
    const native = [];
    for (const type of ['keydown', 'keyup']) frame.document.body.addEventListener(type, (e) => native.push(`${type} ${e.code}`));
    const press = (key, code, extra = {}, target = frame.document.body) => {
        for (const type of ['keydown', 'keyup']) target.dispatchEvent(new frame.KeyboardEvent(type, { key, code, bubbles: true, cancelable: true, composed: true, ...(type === 'keydown' ? extra : {}) }));
    };
    return { dom, frame, empty, main, native, press };
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
    press('m', 'KeyM');
    assert.deepEqual(native, ['keydown KeyM', 'keyup KeyM']);

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
    assert.ok(frame.document.getElementById('ag-smart-skip'), 'кнопка пропуска осталась');
    assert.ok(frame.document.getElementById('ag-skip-undo'), 'кнопка «Вернуться» осталась');
    dom.window.close();
});
