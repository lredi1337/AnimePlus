// Привязка аккаунта Shikimori: код принимается только во вкладке, которую открыл сам зритель, а токен обновляется один раз
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read, loadInContext, flush } = require('./helpers');

const CODE = 'abcdefghij0123456789ABCDEF';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

function loadBg({ store = {} } = {}) {
    const local = { ...store };
    const session = {};
    const area = (data) => ({
        get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, data[k]])),
        set: async (obj) => { Object.assign(data, obj); },
        remove: async (keys) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete data[k]); }
    });
    const stats = { tokenPosts: [], opened: [] };
    let nextTabId = 100;
    const fetchMock = async (url, options = {}) => {
        if (/workers\.dev|oauth\/token/.test(String(url))) {
            const body = JSON.parse(options.body);
            stats.tokenPosts.push(body);
            await flush();
            return json({ access_token: `access${stats.tokenPosts.length}`, refresh_token: `refresh${stats.tokenPosts.length}`, expires_in: 86400 });
        }
        return json({ id: 7, nickname: 'viewer' });
    };
    const ctx = loadInContext(['modules/bg-cache.js', 'modules/bg-shiki.js'], {
        URLSearchParams, AbortController, Response, fetch: fetchMock,
        SHIKI_CREDENTIALS: { client_id: 'client', worker_url: 'https://animeplus.ruscadred.workers.dev' },
        chrome: {
            storage: { local: area(local), session: area(session), onChanged: { addListener() {} } },
            alarms: { create() {}, get: async () => null, onAlarm: { addListener() {} } },
            tabs: { create: async ({ url }) => { stats.opened.push(url); return { id: nextTabId++ }; } },
            runtime: { getManifest: () => ({ version: '0' }), onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
            notifications: { onClicked: { addListener() {} }, onButtonClicked: { addListener() {} } }
        }
    });
    return { ctx, local, session, stats };
}

test('два запроса при истёкшем токене обновляют его один раз и не показывают ошибку входа', async () => {
    const { ctx, local, stats } = loadBg({ store: { shiki_access_token: 'old', shiki_refresh_token: 'R1', shiki_token_expires_at: 1, shiki_client_id: 'client' } });
    await Promise.all([ctx.shikiFetch('https://shikimori.io/api/a'), ctx.shikiFetch('https://shikimori.io/api/b')]);
    assert.equal(stats.tokenPosts.length, 1);
    assert.notEqual(local.shiki_auth_error, true);
    assert.equal(local.shiki_refresh_token, 'refresh1');
});

test('код берётся только с адреса самого Shikimori', () => {
    const { ctx } = loadBg();
    assert.equal(ctx.shikiAuthCodeFromUrl(`https://shikimori.io/oauth/authorize/${CODE}`), CODE);
    assert.equal(ctx.shikiAuthCodeFromUrl(`https://shikimori.one/oauth/authorize/${CODE}?x=1`), CODE);
    assert.equal(ctx.shikiAuthCodeFromUrl(`https://evil.example/oauth/authorize/${CODE}`), null);
    assert.equal(ctx.shikiAuthCodeFromUrl(`https://shikimori.io.evil.example/oauth/authorize/${CODE}`), null);
    assert.equal(ctx.shikiAuthCodeFromUrl(`https://evil.example/shikimori.io/oauth/authorize/${CODE}`), null);
    assert.equal(ctx.shikiAuthCodeFromUrl('https://shikimori.io/oauth/authorize?client_id=x'), null);
    assert.equal(ctx.shikiAuthCodeFromUrl('not a url'), null);
});

test('код без нажатия «Войти» отклоняется, токены не меняются', async () => {
    const { ctx, local, stats } = loadBg({ store: { shiki_access_token: 'mine' } });
    const res = await ctx.completeShikiAuth(CODE, 5);
    assert.equal(res.success, false);
    assert.equal(res.reason, 'not_expected');
    assert.equal(stats.tokenPosts.length, 0);
    assert.equal(local.shiki_access_token, 'mine');
});

test('«Войти» открывает вкладку, и код принимается только из неё и только один раз', async () => {
    const { ctx, local, session, stats } = loadBg();
    const tabId = await ctx.beginShikiAuth('client');
    assert.match(stats.opened[0], /^https:\/\/shikimori\.io\/oauth\/authorize\?client_id=client&/);
    assert.equal(await ctx.isShikiAuthExpected(tabId), true);
    assert.equal(await ctx.isShikiAuthExpected(tabId + 1), false);

    assert.equal((await ctx.completeShikiAuth(CODE, tabId + 1)).reason, 'not_expected');
    assert.equal((await ctx.completeShikiAuth(CODE, tabId)).success, true);
    assert.equal(local.shiki_access_token, 'access1');
    assert.equal(Object.keys(session).length, 0);

    assert.equal((await ctx.completeShikiAuth(`${CODE}other`, tabId)).reason, 'not_expected');
    assert.equal(stats.tokenPosts.length, 1);
});

test('страница и фон сообщают один код одновременно: оба получают успех, обмен один', async () => {
    const { ctx, stats } = loadBg();
    const tabId = await ctx.beginShikiAuth('client');
    const [a, b] = await Promise.all([ctx.completeShikiAuth(CODE, tabId), ctx.completeShikiAuth(CODE, tabId)]);
    assert.equal(a.success, true);
    assert.equal(b.success, true);
    // Поздний повтор того же кода после успеха тоже не считается ошибкой
    assert.equal((await ctx.completeShikiAuth(CODE, tabId)).success, true);
    assert.equal(stats.tokenPosts.length, 1);
});

test('разрешение на вход истекает', async () => {
    const { ctx, session } = loadBg();
    const tabId = await ctx.beginShikiAuth('client');
    const key = Object.keys(session)[0];
    session[key].at -= 16 * 60 * 1000;
    assert.equal(await ctx.isShikiAuthExpected(tabId), false);
});

test('вопрос сразу после «Войти» дожидается открытия вкладки', async () => {
    const { ctx } = loadBg();
    const opening = ctx.beginShikiAuth('client');
    assert.equal(await ctx.isShikiAuthExpected(100), true);
    await opening;
});

// ---------- Страница авторизации ----------

async function openAuthPage(url, expected) {
    const dom = new JSDOM('<!doctype html><body><form action="/x"><input type="submit"></form></body>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const sent = [];
    w.chrome = {
        runtime: {
            lastError: null,
            getURL: (p) => p,
            sendMessage(msg, cb) {
                sent.push(msg);
                if (msg.action === 'shiki_auth_expected') setTimeout(() => cb({ expected }), 0);
                else if (cb) setTimeout(() => cb({ success: true }), 0);
            }
        }
    };
    w.eval(read('content-shiki-auth.js'));
    await flush();
    return { w, sent };
}

test('чужая страница авторизации: Anime+ убирается и оставляет родную страницу', async () => {
    const { w, sent } = await openAuthPage(`https://shikimori.io/oauth/authorize/${CODE}`, false);
    assert.equal(w.document.getElementById('animeplus-autoauth-backdrop'), null);
    assert.equal(sent.some(m => m.action === 'shiki_auto_auth'), false);
    assert.equal(w.document.querySelector('[data-ag-auth-style]'), null);
    w.close();
});

test('запрос входа другого приложения не подменяется окном Anime+', async () => {
    const { w } = await openAuthPage('https://shikimori.io/oauth/authorize?client_id=other', false);
    assert.equal(w.document.getElementById('ag-btn-allow-auth'), null);
    assert.equal(w.document.getElementById('animeplus-autoauth-backdrop'), null);
    w.close();
});

test('своя вкладка: на странице разрешения видны кнопки, код отправляется автоматически', async () => {
    const consent = await openAuthPage('https://shikimori.io/oauth/authorize?client_id=client', true);
    assert.ok(consent.w.document.getElementById('ag-btn-allow-auth'));
    consent.w.close();

    const code = await openAuthPage(`https://shikimori.io/oauth/authorize/${CODE}`, true);
    assert.equal(code.sent.find(m => m.action === 'shiki_auto_auth').code, CODE);
    code.w.close();
});
