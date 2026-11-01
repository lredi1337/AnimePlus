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

const STALE = { autoPlay: true, autoNext: true, hideTime: 2000, notif_enabled: true, sites_enabled: {}, keys: { fs: 'f', next: 'n', prev: 'p', skip: 's', rewind: 'arrowleft', forward: 'arrowright' } };
// То, что пользователь успел поменять в popup, пока вкладка была открыта
const CHANGED_ELSEWHERE = { notif_enabled: false, sites_enabled: { jutsu: false }, global_enabled: false, shiki_client_id: 'custom' };

const assertKept = (saved) => {
    for (const [k, v] of Object.entries(CHANGED_ELSEWHERE)) {
        assert.deepEqual(JSON.parse(JSON.stringify(saved[k])), v, `${k} не откатилось`);
    }
};

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

test('окно настроек AnimeGO: сохранение не откатывает изменения из popup', async () => {
    const { w, store } = makePage(['modules/ui-utils.js', 'modules/animego/ag-settings.js'], { ...STALE });
    w.agOpenAnimeGoSettingsModal(JSON.parse(JSON.stringify(STALE)), () => {}, {});
    Object.assign(store.ag_settings, CHANGED_ELSEWHERE);

    w.document.getElementById('s-autoPlay').checked = false;
    w.document.querySelector('#ag-save').click();
    await new Promise(r => setTimeout(r, 30));

    assertKept(store.ag_settings);
    assert.equal(store.ag_settings.autoPlay, false, 'поле самого окна сохранено');
    w.close();
});

test('окно настроек AnimeGO: колбэк получает свежие настройки', async () => {
    const { w, store } = makePage(['modules/ui-utils.js', 'modules/animego/ag-settings.js'], { ...STALE });
    let received = null;
    w.agOpenAnimeGoSettingsModal(JSON.parse(JSON.stringify(STALE)), (s) => { received = s; }, {});
    Object.assign(store.ag_settings, CHANGED_ELSEWHERE);
    w.document.querySelector('#ag-save').click();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(received.notif_enabled, false);
    w.close();
});

test('окно настроек Jut-Su: сохранение не откатывает изменения из popup', async () => {
    const { w, store } = makePage(['modules/ui-utils.js', 'modules/jutsu/jt-settings.js'], { ...STALE });
    w.jtOpenJutsuSettingsModal(JSON.parse(JSON.stringify(STALE)), () => {});
    Object.assign(store.ag_settings, CHANGED_ELSEWHERE);

    w.document.querySelector('#ag-save').click();
    await new Promise(r => setTimeout(r, 30));

    assertKept(store.ag_settings);
    w.close();
});
