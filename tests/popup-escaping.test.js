// Окно расширения: названия из внешних баз показываются как текст и не становятся разметкой
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));
const EVIL = '<img src=x id=injected>';
const waitFor = async (find) => {
    for (let i = 0; i < 100; i++) {
        const found = find();
        if (found) return found;
        await tick(20);
    }
    return null;
};

async function openPopup({ store = {}, page = { title: 'Тайтл', origTitle: 'Title', episode: '1' } }) {
    const body = read('popup/popup.html').match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url: 'https://example.test/popup.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = {
        runtime: {
            id: 'test', lastError: null, getURL: (p) => p, getManifest: () => JSON.parse(read('manifest.json')),
            onMessage: { addListener() {} },
            sendMessage(msg, cb) {
                const replies = { resolve_shikimori_id: { id: 7 }, shiki_get_status: { isLoggedIn: false, clientId: 'c' } };
                if (cb) setTimeout(() => cb(replies[msg.action] || null), 0);
            }
        },
        tabs: {
            query: (q, cb) => setTimeout(() => cb([{ id: 1, url: 'https://animego.me/anime/x-1' }]), 0),
            sendMessage: (id, msg, cb) => setTimeout(() => cb(page), 0),
            reload() {}, create() {}
        },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in store).map(k => [k, store[k]])),
                set: async (o) => { Object.assign(store, o); },
                remove: async () => {}
            },
            onChanged: { addListener() {} }
        }
    };
    w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' });
    for (const f of ['credentials.js', 'config.js', 'modules/shared/sites.js', 'modules/shared/ui-kit.js', 'modules/shared/guide.js', 'modules/shared/guide-fox.js', 'popup/popup.js']) w.eval(read(f));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await tick();
    return w;
}

test('название песни с разметкой и кавычками остаётся текстом', async () => {
    const song = `OP1: "Sing ${EVIL} "loud" now" by Band`;
    const w = await openPopup({ store: { themes_7: { data: { openings: [song], endings: [] } } } });
    const name = await waitFor(() => w.document.querySelector('#op-list .track-name'));
    assert.ok(name);
    assert.equal(w.document.getElementById('injected'), null);
    assert.ok(name.textContent.includes(EVIL));
    assert.equal(name.getAttribute('title'), name.textContent);
    w.close();
});

test('запасная строка с названием тайтла тоже остаётся текстом', async () => {
    const w = await openPopup({ page: { title: `Тайтл ${EVIL}`, origTitle: '', episode: '1' } });
    const name = await waitFor(() => w.document.querySelector('#op-list .track-name'));
    assert.equal(w.document.getElementById('injected'), null);
    assert.ok(name.textContent.includes(EVIL));
    w.close();
});

test('«Войти» просит фон открыть вкладку', async () => {
    const w = await openPopup({});
    const sent = [];
    const original = w.chrome.runtime.sendMessage;
    w.chrome.runtime.sendMessage = (msg, cb) => { sent.push(msg); original(msg, cb); };
    w.document.getElementById('btn-shiki-login-link').click();
    assert.equal(sent.find(m => m.action === 'shiki_auth_begin').clientId, 'c');
    w.close();
});
