// Настоящий полный экран блока плеера: разрешение браузера, отказ и выход средствами браузера
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

function setup() {
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="player"><iframe></iframe></div></body></html>', { runScripts: 'outside-only' });
    const w = dom.window;
    w.eval(read('modules/shared/native-fs.js'));
    let current = null;
    Object.defineProperty(w.document, 'fullscreenElement', { get: () => current, configurable: true });
    const fire = () => w.document.dispatchEvent(new w.Event('fullscreenchange'));
    w.document.exitFullscreen = async () => { current = null; fire(); };
    const el = w.document.getElementById('player');
    return { w, el, fsApi: w.AgNativeFs, setCurrent: (v) => { current = v; fire(); } };
}

test('браузер разрешил: полный экран у блока плеера и стили для кадра', async () => {
    const { w, el, fsApi, setCurrent } = setup();
    el.requestFullscreen = async () => setCurrent(el);
    assert.equal(await fsApi.request(el), true);
    assert.ok(w.document.getElementById('ag-native-fs-style').textContent.includes(':fullscreen iframe'));
});

test('браузер отказал без действия пользователя: возвращается false для старого режима', async () => {
    const { el, fsApi } = setup();
    el.requestFullscreen = async () => { throw new Error('Permissions check failed'); };
    assert.equal(await fsApi.request(el), false);
    assert.equal(await fsApi.request(null), false);
});

test('выход средствами браузера вызывает обработчик, вход нет', async () => {
    const { el, fsApi, setCurrent } = setup();
    let exits = 0;
    fsApi.onExit(() => { exits++; });
    setCurrent(el);
    assert.equal(exits, 0);
    setCurrent(null);
    assert.equal(exits, 1);
});

test('выход без полного экрана ничего не делает', async () => {
    const { fsApi } = setup();
    let exits = 0;
    fsApi.onExit(() => { exits++; });
    await fsApi.exit();
    assert.equal(exits, 0);
});
