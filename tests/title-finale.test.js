// Общее место остановки между сайтами и конец тайтла: фон (modules/bg-shiki.js) и карточка в оболочке плеера
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const DAY = 24 * 60 * 60 * 1000;

function loadBg({ anime = null, related = [], rate = null, loggedIn = true, store = {} } = {}) {
    const sent = [];
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data, text: async () => JSON.stringify(data) });
    const local = loggedIn
        ? { shiki_access_token: 't', shiki_user: { id: 777 }, shiki_token_expires_at: Math.floor(Date.now() / 1000) + 86400, ...store }
        : { ...store };
    const context = vm.createContext({
        console, URL, URLSearchParams, setTimeout, clearTimeout, AbortController, Date, Math, JSON, Promise,
        chrome: {
            storage: {
                local: {
                    get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in local).map(k => [k, local[k]])),
                    set: async (v) => { Object.assign(local, v); },
                    remove: async (keys) => { [].concat(keys).forEach(k => delete local[k]); }
                },
                onChanged: { addListener() {} }
            },
            alarms: { create() {}, get: async () => null, onAlarm: { addListener() {} } },
            runtime: { onMessage: { addListener() {} }, getManifest: () => ({ version: '0' }) }
        },
        fetch: async (url, options = {}) => {
            const method = options.method || 'GET';
            if (/\/api\/animes\/\d+\/related/.test(url)) return json(related);
            if (/\/api\/animes\/\d+/.test(url)) return json(anime, anime ? 200 : 404);
            if (/user_rates/.test(url) && method === 'GET') return json(rate ? [rate] : []);
            if (/user_rates/.test(url)) {
                sent.push({ method, url: String(url), body: JSON.parse(options.body).user_rate });
                return json({ id: 1 }, 201);
            }
            return json({});
        }
    });
    context.globalThis = context;
    vm.runInContext(read('modules/bg-cache.js'), context);
    vm.runInContext(read('modules/bg-shiki.js'), context);
    const call = (name, arg) => {
        context.__arg = arg;
        return vm.runInContext(`${name}(__arg)`, context);
    };
    return { call, sent, local };
}

// ---------- Общее место остановки ----------

test('место остановки сохраняется по ID тайтла и серии и читается только для своего тайтла', async () => {
    const bg = loadBg();
    await bg.call('saveSharedProgress', { id: 21, items: [{ episode: '3', position: 412.6, ts: Date.now() - 1000 }, { episode: '4', position: 0, ts: Date.now() }] });
    await bg.call('saveSharedProgress', { id: 99, items: [{ episode: '3', position: 50, ts: Date.now() }] });

    const { episodes } = await bg.call('getSharedProgress', 21);
    assert.deepEqual(Object.keys(episodes).sort(), ['3', '4']);
    assert.equal(episodes['3'].position, 413);
    assert.equal(episodes['4'].position, 0);
});

test('старая запись не затирает свежую, а время из будущего не принимается', async () => {
    const bg = loadBg();
    const now = Date.now();
    await bg.call('saveSharedProgress', { id: 21, items: [{ episode: '3', position: 900, ts: now - 1000 }] });
    await bg.call('saveSharedProgress', { id: 21, items: [{ episode: '3', position: 100, ts: now - 60000 }] });
    assert.equal((await bg.call('getSharedProgress', 21)).episodes['3'].position, 900);

    await bg.call('saveSharedProgress', { id: 21, items: [{ episode: '5', position: 10, ts: now + 365 * DAY }] });
    assert.ok((await bg.call('getSharedProgress', 21)).episodes['5'].ts <= Date.now());
});

test('мусор вместо записи не сохраняется, записи старше месяца не отдаются', async () => {
    const bg = loadBg({ store: { ag_shared_progress: { '21#1': { position: 300, ts: Date.now() - 31 * DAY } } } });
    const bad = [{ episode: '<img>', position: 5 }, { episode: '2', position: -1 }, { episode: '2', position: 'x' }, null];
    assert.equal((await bg.call('saveSharedProgress', { id: 21, items: bad })).success, false);
    assert.equal((await bg.call('saveSharedProgress', { id: 'abc', items: [{ episode: '2', position: 5 }] })).success, false);
    assert.deepEqual(Object.keys((await bg.call('getSharedProgress', 21)).episodes), []);
});

// ---------- Конец тайтла ----------

const SEQUEL = { relation: 'Sequel', relation_russian: 'Продолжение', anime: { id: 40, russian: 'Тайтл 2', name: 'Title 2', kind: 'tv', aired_on: '2021-04-03' } };

test('последняя серия вышедшего тайтла: конец, с продолжением и возможностью оценить', async () => {
    const bg = loadBg({ anime: { episodes: 12, status: 'released' }, related: [{ relation: 'Adaptation', manga: { id: 1 } }, SEQUEL] });
    const res = await bg.call('getTitleFinale', { id: 21, episode: '12' });
    assert.deepEqual(JSON.parse(JSON.stringify(res)), { finished: true, canRate: true, sequel: { id: 40, title: 'Тайтл 2', kind: 'TV', year: '2021' } });
});

test('не последняя серия, онгоинг без числа серий и неизвестный тайтл концом не считаются', async () => {
    assert.equal((await loadBg({ anime: { episodes: 12 }, related: [SEQUEL] }).call('getTitleFinale', { id: 21, episode: 11 })).finished, false);
    assert.equal((await loadBg({ anime: { episodes: 0, status: 'ongoing' } }).call('getTitleFinale', { id: 21, episode: 7 })).finished, false);
    assert.equal((await loadBg({ anime: null }).call('getTitleFinale', { id: 21, episode: 7 })).finished, false);
});

test('без продолжения и без входа в аккаунт: конец есть, но предложить нечего', async () => {
    const res = await loadBg({ anime: { episodes: 1 }, related: [], loggedIn: false }).call('getTitleFinale', { id: 21, episode: 1 });
    assert.deepEqual(JSON.parse(JSON.stringify(res)), { finished: true, canRate: false, sequel: null });
});

test('оценка меняет существующую запись списка и не трогает остальные её поля', async () => {
    const bg = loadBg({ rate: { id: 555, status: 'completed', episodes: 12 } });
    assert.equal((await bg.call('setShikiScore', { id: 21, score: 8 })).success, true);
    assert.equal(bg.sent.length, 1);
    assert.equal(bg.sent[0].method, 'PUT');
    assert.match(bg.sent[0].url, /user_rates\/555$/);
    assert.deepEqual(bg.sent[0].body, { score: 8 });
});

test('оценка тайтла, которого нет в списке, создаёт запись «просмотрено»', async () => {
    const bg = loadBg();
    await bg.call('setShikiScore', { id: 21, score: 10 });
    assert.equal(bg.sent[0].method, 'POST');
    assert.deepEqual(bg.sent[0].body, { user_id: 777, target_id: 21, target_type: 'Anime', status: 'completed', score: 10 });
});

test('оценка вне 1–10 и без входа в аккаунт не отправляется', async () => {
    const bg = loadBg();
    for (const score of [0, 11, 'abc', null]) assert.equal((await bg.call('setShikiScore', { id: 21, score })).success, false);
    assert.equal(bg.sent.length, 0);

    const guest = loadBg({ loggedIn: false });
    assert.equal((await guest.call('setShikiScore', { id: 21, score: 7 })).reason, 'not_logged_in');
    assert.equal(guest.sent.length, 0);
});

// ---------- Карточка в оболочке ----------

const PLAYER = `<!doctype html><html><head><title>Тайтл</title></head><body class="serial active-player player-is-ready">
<div class="serial-panel"><div class="serial-series-box"><select><option value="1" data-title="1 серия" selected>1 серия</option></select></div></div>
<div class="fp-player"><video class="fp-engine"></video><div class="fp-ui"></div></div></body></html>`;

function mountShell() {
    const dom = new JSDOM(PLAYER, { url: 'https://kodikplayer.com/serial/1/a/720p', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
    w.eval(read('modules/player/adapters.js'));
    w.eval(read('modules/player/shell-view.js'));
    w.eval(read('modules/player/shell.js'));
    const shell = w.AgPlayerShell.create({ getSettings: () => ({}), patchSettings: async () => {}, getTimings: () => null, nav() {}, toggleFs() {} });
    const card = w.document.getElementById('ag-shell').shadowRoot.querySelector('.finale');
    return { w, shell, card };
}

test('карточка: оценка и продолжение уходят странице, название вставляется текстом', () => {
    const { w, shell, card } = mountShell();
    const calls = [];
    assert.equal(card.hidden, true);
    shell.showFinale({ canRate: true, sequel: { title: '<img src=x onerror=alert(1)>', kind: 'TV', year: '2021' } },
        { rate: (score) => calls.push(['rate', score]), next: () => calls.push(['next']) });

    assert.equal(card.hidden, false);
    assert.equal(card.querySelector('img'), null);
    assert.equal(card.querySelector('.sequel b').textContent, '<img src=x onerror=alert(1)> (TV, 2021)');
    assert.equal(card.querySelectorAll('.stars button').length, 10);

    card.querySelector('.stars button[data-score="9"]').dispatchEvent(new w.MouseEvent('click'));
    card.querySelector('.stars button[data-score="3"]').dispatchEvent(new w.MouseEvent('click'));
    assert.deepEqual(calls, [['rate', 9]], 'пока оценка сохраняется, вторую не отправляем');

    shell.finaleRated(true, 9);
    assert.match(card.querySelector('.ask').textContent, /Оценка 9 сохранена/);

    card.querySelector('.go').dispatchEvent(new w.MouseEvent('click'));
    assert.deepEqual(calls[1], ['next']);
    shell.destroy();
});

test('карточка: сбой сохранения возвращает кнопки оценки', () => {
    const { w, shell, card } = mountShell();
    const calls = [];
    shell.showFinale({ canRate: true, sequel: null }, { rate: (score) => calls.push(score) });
    assert.equal(card.querySelector('.go').hidden, true);
    assert.equal(card.querySelector('.sequel').hidden, true);

    card.querySelector('.stars button[data-score="7"]').dispatchEvent(new w.MouseEvent('click'));
    shell.finaleRated(false, 7);
    assert.match(card.querySelector('.ask').textContent, /Не удалось/);
    card.querySelector('.stars button[data-score="6"]').dispatchEvent(new w.MouseEvent('click'));
    assert.deepEqual(calls, [7, 6]);
    shell.destroy();
});

test('карточка: без аккаунта остаётся только продолжение, а когда предложить нечего, её нет', () => {
    const { w, shell, card } = mountShell();
    shell.showFinale({ canRate: false, sequel: null }, {});
    assert.equal(card.hidden, true);

    shell.showFinale({ canRate: false, sequel: { title: 'Тайтл 2', kind: '', year: '' } }, {});
    assert.equal(card.hidden, false);
    assert.equal(card.querySelector('.stars').hidden, true);
    assert.equal(card.querySelector('.sequel b').textContent, 'Тайтл 2');

    card.querySelector('.skip').dispatchEvent(new w.MouseEvent('click'));
    assert.equal(card.hidden, true);
    shell.destroy();
});

test('карточка уходит, когда зритель снова запускает видео', () => {
    const { w, shell, card } = mountShell();
    shell.showFinale({ canRate: true, sequel: null }, {});
    assert.equal(card.hidden, false);
    w.document.querySelector('video').dispatchEvent(new w.Event('play'));
    assert.equal(card.hidden, true);
    shell.destroy();
});
