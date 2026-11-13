// Оболочка плеера запускается только в кадрах, которые встроил поддерживаемый сайт (content-player.js).
// Кто встроил кадр, браузер сообщает в location.ancestorOrigins: в отличие от referrer, страница не может его скрыть или подделать
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const PANEL = '<div class="serial-panel"><div class="serial-series-box"><select><option value="1" selected>1 серия</option></select></div></div>';

/** Кадр Kodik; ancestors — цепочка внешних кадров от ближайшего к верхнему, как её отдаёт Chrome. Без referrer: сайт вправе его скрыть */
async function startFrame(ancestors, referrer = '') {
    const dom = new JSDOM('<!doctype html><iframe></iframe>', { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
    const frame = dom.window.document.querySelector('iframe').contentWindow;
    frame.document.body.innerHTML = PANEL;
    Object.defineProperty(frame.document, 'referrer', { value: referrer, configurable: true });
    if (ancestors) Object.defineProperty(frame.location, 'ancestorOrigins', { value: ancestors, configurable: true });

    const toTop = [];
    dom.window.addEventListener('message', (e) => { if (e.data && e.data.type) toTop.push(e.data.type); });
    frame.chrome = {
        runtime: { id: 'test', getURL: (p) => p, sendMessage() {}, onMessage: { addListener() {} } },
        storage: { local: { get: async () => ({ ag_settings: { auto_select_voice: false } }), set: async () => {} }, onChanged: { addListener() {} } }
    };
    for (const file of ['config.js', 'modules/shared/sites.js', 'modules/player/adapters.js', 'modules/player/skip-memory.js', 'content-player.js']) frame.eval(read(file));
    await new Promise(r => setTimeout(r, 150));
    dom.window.close();
    return toTop;
}

test('кадр на чужом сайте: оболочка не запускается, даже если сайт скрыл referrer', async () => {
    assert.deepEqual(await startFrame(['https://evil.example']), []);
});

test('похожий адрес не считается сайтом или плеером', async () => {
    assert.deepEqual(await startFrame(['https://notkodik.example']), []);
    assert.deepEqual(await startFrame(['https://jut-su.net.evil.example']), []);
});

test('кадр на поддерживаемом сайте запускается, в том числе внутри обёртки другого плеера', async () => {
    assert.ok((await startFrame(['https://jut-su.net'])).includes('AG_GET_DATA'));
    assert.ok((await startFrame(['https://ani5.top', 'https://yammyanime.club'])).includes('AG_GET_DATA'));
});

test('обёртка плеера на чужом сайте не делает кадр своим', async () => {
    assert.deepEqual(await startFrame(['https://kodik.info', 'https://evil.example']), []);
});

test('браузер без ancestorOrigins: кадр запускается по прежним признакам', async () => {
    assert.ok((await startFrame(null, 'https://jut-su.net/')).includes('AG_GET_DATA'));
    assert.deepEqual(await startFrame(null, 'https://evil.example/'), []);
    assert.deepEqual(await startFrame(null, 'https://notkodik.example/'), []);
});
