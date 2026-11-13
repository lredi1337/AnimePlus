// Журнал сбоев: что записывается, что точно не записывается и как он попадает в письмо разработчику
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadInContext, read } = require('./helpers');

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

function loadDiag(initial = {}) {
    const store = { ...initial };
    const ctx = loadInContext(['modules/bg-diag.js'], {
        chrome: { storage: { local: {
            get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in store).map(k => [k, store[k]])),
            set: async (obj) => { Object.assign(store, obj); }
        } } }
    });
    return { ctx, store };
}

test('сбой записывается с местом, адресом и временем', async () => {
    const { ctx, store } = loadDiag();
    await ctx.noteDiag('shell_off', 'нет кнопки', 'kodikplayer.com');
    const [entry] = store.ag_diag_log;
    assert.equal(entry.where, 'shell_off');
    assert.equal(entry.detail, 'нет кнопки');
    assert.equal(entry.host, 'kodikplayer.com');
    assert.equal(entry.count, 1);
    assert.ok(entry.at > 0);
});

test('повтор того же сбоя не растит журнал, а считается', async () => {
    const { ctx, store } = loadDiag();
    await ctx.noteDiag('a', 'x', 'h');
    await ctx.noteDiag('a', 'x', 'h');
    await ctx.noteDiag('b', 'x', 'h');
    assert.equal(store.ag_diag_log.length, 2);
    assert.equal(store.ag_diag_log.find(e => e.where === 'a').count, 2);
});

test('журнал ограничен и новые записи вытесняют старые', async () => {
    const { ctx, store } = loadDiag();
    for (let i = 0; i < 45; i++) await ctx.noteDiag(`w${i}`, '', '');
    assert.equal(store.ag_diag_log.length, 30);
    assert.ok(store.ag_diag_log.some(e => e.where === 'w44'));
    assert.equal(store.ag_diag_log.some(e => e.where === 'w0'), false);
});

test('одновременные записи не теряются', async () => {
    const { ctx, store } = loadDiag();
    await Promise.all([1, 2, 3, 4, 5].map(i => ctx.noteDiag(`w${i}`, '', '')));
    assert.equal(store.ag_diag_log.length, 5);
});

test('от адресов остаётся только сайт, а токены и длинный текст не попадают', () => {
    const { ctx } = loadDiag();
    const clean = ctx.cleanDiagText('сбой https://shikimori.io/api/x?access_token=SECRET&a=1 Bearer abc123 access_token=SECRET2 ' + 'я'.repeat(400));
    assert.equal(clean.includes('SECRET'), false);
    assert.equal(clean.includes('abc123'), false);
    assert.equal(clean.includes('/api/x'), false);
    assert.ok(clean.includes('shikimori.io'));
    assert.ok(clean.length <= 200);
});

test('сводка: новые сверху, старше двух недель не показываются', async () => {
    const now = Date.now();
    const { ctx } = loadDiag({ ag_diag_log: [
        { where: 'old', detail: '', host: '', count: 1, at: now - 15 * 864e5 },
        { where: 'first', detail: 'д', host: 'site.test', count: 3, at: now - 2000 },
        { where: 'second', detail: '', host: '', count: 1, at: now - 1000 }
    ] });
    const text = await ctx.diagSummary();
    assert.equal(text.includes('old'), false);
    assert.ok(text.indexOf('second') < text.indexOf('first'));
    assert.match(text, /first.*site\.test.*×3.*д/);
});

test('пустой журнал: сводка пустая', async () => {
    const { ctx } = loadDiag();
    assert.equal(await ctx.diagSummary(), '');
});

// ---------- Отправка из кадров и страниц ----------

function diagPage() {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://kodikplayer.com/x', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const sent = [];
    w.chrome = { runtime: { sendMessage: async (m) => { sent.push(m); } } };
    w.eval(read('modules/shared/diag.js'));
    return { w, sent };
}

test('сбой из кадра уходит в фон, число сообщений со страницы ограничено', () => {
    const { w, sent } = diagPage();
    w.AgDiag.note('shell_off', new w.Error('нет кнопки'));
    assert.deepEqual({ action: sent[0].action, where: sent[0].where, detail: sent[0].detail }, { action: 'diag_note', where: 'shell_off', detail: 'нет кнопки' });
    for (let i = 0; i < 40; i++) w.AgDiag.note('x', String(i));
    assert.ok(sent.length <= 15);
    w.close();
});

test('ошибки чужих скриптов страницы не считаются, свои считаются', () => {
    const { w, sent } = diagPage();
    w.dispatchEvent(new w.ErrorEvent('error', { message: 'чужая', filename: 'https://kodikplayer.com/app.js' }));
    assert.equal(sent.length, 0);
    w.dispatchEvent(new w.ErrorEvent('error', { message: 'наша', filename: 'chrome-extension://abc/content-player.js', lineno: 7 }));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].where, 'script_error');
    assert.match(sent[0].detail, /наша.*content-player\.js:7/);
    w.close();
});

test('расширение обновилось на открытой странице: это не сбой', () => {
    const { w, sent } = diagPage();
    w.dispatchEvent(new w.ErrorEvent('error', { message: 'Extension context invalidated.', filename: 'chrome-extension://abc/x.js' }));
    assert.equal(sent.length, 0);
    w.close();
});

test('плеер сайта не дал кнопку Kodik: это видно в журнале', async () => {
    const dom = new JSDOM('<!doctype html><body><div class="agp"></div></body>', { url: 'https://ani5.top/5/embed/agp', referrer: 'https://jut-su.net/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const notes = [];
    w.AgDiag = { note: (where) => notes.push(where) };
    w.chrome = { storage: { local: { get: async () => ({}) } } };
    w.eval(read('modules/shared/sites.js'));
    w.eval(read('modules/player/agp-to-kodik.js').replace('const WAIT_MS = 30000', 'const WAIT_MS = 200'));
    // Ждём записи, а не фиксированное время: под нагрузкой всех тестов таймер срабатывает позже
    for (let i = 0; i < 40 && notes.length === 0; i++) await tick(100);
    assert.deepEqual(notes, ['agp_no_button']);
    w.close();
});

// ---------- Сервер ----------

const good = { kind: 'bug', message: 'Не работает пропуск на второй серии', contact: '', version: '11.1.0' };

test('сервер: сведения попадают в письмо обычным текстом', async () => {
    const { validateFeedback, buildEmail } = await import('../server/timings/src/feedback.js');
    const mail = buildEmail(validateFeedback({ ...good, diag: 'Chrome 156\nshell_off kodikplayer.com' }), 'support@example.test');
    assert.match(mail.text, /Сведения о работе:\nChrome 156\nshell_off kodikplayer\.com/);
    assert.equal(mail.html, undefined);
});

test('сервер: без сведений письмо прежнее, лишний размер и мусор отсекаются', async () => {
    const { validateFeedback, buildEmail } = await import('../server/timings/src/feedback.js');
    assert.equal(buildEmail(validateFeedback(good), 'a@b.test').text.includes('Сведения'), false);
    assert.equal(validateFeedback({ ...good, diag: 5 }).diag, '');
    assert.ok(validateFeedback({ ...good, diag: 'я'.repeat(9000) }).diag.length <= 4000);
    assert.equal(validateFeedback({ ...good, diag: 'a\u0000b' }).diag, 'ab');
});
