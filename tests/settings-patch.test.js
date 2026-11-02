// Настройки не должны откатываться: вкладка держит копию с момента загрузки, а popup или другая вкладка
// могли их уже изменить. Запускаются настоящие окна настроек AnimeGO и Jut-Su и agPatchSettings.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

function makePage(files, initial) {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://jut-su.net/1-x.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const store = { ag_settings: initial };
    w.chrome = {
        runtime: { id: 'test', getURL: (p) => p, sendMessage() {}, onMessage: { addListener() {} } },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, store[k]])),
                set: async (obj) => { Object.assign(store, obj); }
            },
            onChanged: { addListener() {} }
        }
    };
    for (const f of ['config.js', ...files]) w.eval(read(f));
    return { w, store };
}

test('agPatchSettings меняет только переданные поля и возвращает настройки с дефолтами', async () => {
    const { w, store } = makePage([], { notif_enabled: false, hideTime: 1000 });
    const result = await w.agPatchSettings({ hideTime: 3000 });
    assert.deepEqual(JSON.parse(JSON.stringify(store.ag_settings)), { notif_enabled: false, hideTime: 3000 });
    assert.equal(result.hideTime, 3000);
    assert.equal(result.autoPlay, true, 'значения по умолчанию подставлены');
});

test('agPatchSettings работает, когда настроек ещё нет', async () => {
    const { w, store } = makePage([], undefined);
    await w.agPatchSettings({ notif_enabled: false });
    assert.deepEqual(JSON.parse(JSON.stringify(store.ag_settings)), { notif_enabled: false });
});
