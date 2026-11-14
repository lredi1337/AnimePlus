// Учёт просмотра серий (modules/progress-tracker.js) для всех поддерживаемых плееров
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext, isValidOriginSource, flush } = require('./helpers');

const kodikFrame = { name: 'kodik-frame' };
const cvhFrame = { name: 'cvh-frame' };

function makeStorage() {
    const items = new Map();
    return { getItem: (k) => (items.has(k) ? items.get(k) : null), setItem: (k, v) => items.set(k, String(v)) };
}

// far — место остановки в фоне, общее для всех сайтов: { [id]: { [серия]: { position, ts } } }
function makeEnv({ getEpisode = () => '3', localStorage = makeStorage(), syncResult = { success: true }, far = {}, pathname = '/anime/strazhi-grobnits-4148', farFails = false } = {}) {
    const listeners = [];
    const log = [];
    let pagehide = () => {};
    const window = {
        localStorage,
        addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); if (t === 'pagehide') pagehide = fn; },
        removeEventListener: (t, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
        agSendMessage: async (m) => {
            log.push(m);
            if (m.action === 'resolve_shikimori_id') return { id: 62218 };
            if (m.action === 'shiki_sync_progress') return syncResult;
            if (m.action === 'get_shared_progress') {
                if (farFails) return new Promise(() => {});
                return { episodes: { ...(far[m.id] || {}) } };
            }
            if (m.action === 'save_shared_progress') {
                far[m.id] = far[m.id] || {};
                for (const item of m.items) far[m.id][item.episode] = { position: item.position, ts: item.ts };
                return { success: true };
            }
            return null;
        }
    };
    loadInContext([isValidOriginSource(), 'modules/progress-tracker.js'], { window, location: { origin: 'https://animego.me', pathname, href: 'https://animego.me/anime/strazhi-grobnits-4148' } });
    const tracker = window.agInitProgressTracker({
        site: 'test',
        getEpisode,
        getTitleInfo: () => ({ pageKey: 'strazhi-grobnits-4148', title: 'Стражи гробниц', origTitle: 'The Guardian of Daxia', titles: ['The Guardian of Daxia', 'Стражи гробниц'], year: '2026', kind: 'tv' })
    });
    const post = (data, { origin = 'https://kodikplayer.com', source = kodikFrame } = {}) =>
        listeners.forEach(fn => fn({ data, origin, source }));
    const playKodik = (from, to, duration = 1400) => {
        post({ key: 'kodik_player_duration_update', value: duration });
        for (let t = from; t <= to; t++) post({ key: 'kodik_player_time_update', value: t });
    };
    return { post, playKodik, log, tracker, far, leavePage: () => pagehide(), syncs: () => log.filter(m => m.action === 'shiki_sync_progress') };
}

test('Kodik: 80% просмотра → ровно одна синхронизация с верными данными', async () => {
    const env = makeEnv();
    env.playKodik(1, 1300);
    await flush();
    assert.equal(env.syncs().length, 1);
    const s = env.syncs()[0];
    assert.deepEqual({ id: s.shikimoriId, ep: s.episode }, { id: 62218, ep: 3 });
});

test('просмотр кусками с перезагрузками страницы засчитывается', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    env.playKodik(1, 400);
    env.leavePage();

    env = makeEnv({ localStorage });
    env.playKodik(401, 800);
    env.leavePage();
    await flush();
    assert.equal(env.syncs().length, 0, 'до 80% серии отметки ещё нет');

    env = makeEnv({ localStorage });
    env.playKodik(1120, 1200);
    await flush();
    assert.equal(env.syncs().length, 1);
});

test('повторный просмотр одного куска не считается за новый', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    for (let i = 0; i < 4; i++) {
        env.playKodik(1, 300);
        env.leavePage();
        env = makeEnv({ localStorage });
    }
    env.post({ key: 'kodik_player_duration_update', value: 1400 });
    env.post({ key: 'kodik_player_time_update', value: 1350 });
    env.post({ key: 'kodik_player_video_ended' });
    await flush();
    assert.equal(env.syncs().length, 0);
});

const playOurs = (env, from, to, duration = 1400) => {
    for (let t = from; t <= to; t += 2) env.post({ type: 'AG_VIDEO_PROGRESS', episode: '3', currentTime: t, duration, isEnded: false });
};

// Ответ приходит после проверки общего места остановки, поэтому не сразу
const askResume = async (env, wait = flush) => {
    const replies = [];
    const replyTargets = [];
    env.post({ type: 'AG_GET_RESUME', episode: '3' }, { source: { postMessage: (m, target) => { replies.push(m); replyTargets.push(target); } } });
    await wait();
    // Ответ уходит только тому, кто спросил: место просмотра не должно достаться кадру, сменившему адрес
    assert.deepEqual(replyTargets, replies.map(() => 'https://kodikplayer.com'));
    return replies;
};

test('после перезагрузки плеер получает место остановки', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    assert.deepEqual(await askResume(env), [], 'новая серия идёт сначала');
    playOurs(env, 2, 33);
    env.leavePage();

    env = makeEnv({ localStorage });
    assert.deepEqual((await askResume(env)).map(m => ({ type: m.type, time: m.time })), [{ type: 'AG_RESUME', time: 32 }]);
});

test('смена озвучки без перезагрузки продолжает с того же места', async () => {
    const env = makeEnv();
    playOurs(env, 100, 200);
    assert.equal((await askResume(env))[0].time, 200);
});

test('перемотка меняет место остановки, короткая реклама — нет', async () => {
    const env = makeEnv();
    playOurs(env, 100, 110);
    env.post({ type: 'AG_VIDEO_PROGRESS', episode: '3', currentTime: 700, duration: 1400, isEnded: false });
    env.post({ type: 'AG_VIDEO_PROGRESS', episode: '3', currentTime: 5, duration: 30, isEnded: false });
    assert.equal((await askResume(env))[0].time, 700);
});

test('первые секунды и досмотренная серия не продолжаются', async () => {
    let env = makeEnv();
    playOurs(env, 2, 8);
    assert.deepEqual(await askResume(env), []);

    env = makeEnv();
    playOurs(env, 2, 1300);
    await flush();
    assert.equal(env.syncs().length, 1);
    assert.deepEqual(await askResume(env), []);
});

test('место остановки переживает отметку серии', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    playOurs(env, 2, 1150);
    await flush();
    assert.equal(env.syncs().length, 1);
    env.leavePage();

    env = makeEnv({ localStorage });
    assert.equal((await askResume(env))[0].time, 1150);
});

test('серии хранят своё место отдельно', async () => {
    let ep = '3';
    const env = makeEnv({ getEpisode: () => ep });
    playOurs(env, 100, 200);
    ep = '4';
    assert.deepEqual(await askResume(env), []);
});

test('поддельный origin не получает место остановки', async () => {
    const env = makeEnv();
    playOurs(env, 100, 200);
    const replies = [];
    env.post({ type: 'AG_GET_RESUME', episode: '3' }, { origin: 'https://evil.example', source: { postMessage: (m) => replies.push(m) } });
    await flush();
    assert.deepEqual(replies, []);
});

test('«Продолжить»: тайтл запоминается только после минуты настоящего просмотра и один раз', async () => {
    const env = makeEnv();
    const history = () => env.log.filter(m => m.action === 'add_watch_history');
    playOurs(env, 2, 40);
    await flush();
    assert.equal(history().length, 0, 'открыл и посмотрел немного');
    env.post({ type: 'AG_VIDEO_PROGRESS', episode: '3', currentTime: 700, duration: 1400, isEnded: false });
    await flush();
    assert.equal(history().length, 0, 'перемотка не считается просмотром');
    playOurs(env, 702, 730);
    await flush();
    assert.equal(history().length, 1);
    const { id, russian, url } = history()[0].item;
    assert.equal(id, 62218);
    assert.equal(russian, 'Стражи гробниц');
    assert.match(url, /strazhi-grobnits/);
    playOurs(env, 732, 800);
    await flush();
    assert.equal(history().length, 1);
});

test('«Продолжить»: возвращение к серии с просмотренной частью снова поднимает тайтл', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    playOurs(env, 2, 80);
    env.leavePage();
    env = makeEnv({ localStorage });
    playOurs(env, 82, 84);
    await flush();
    assert.equal(env.log.filter(m => m.action === 'add_watch_history').length, 1);
});

test('отмеченная серия забывает участки, пересмотр считается заново', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    env.playKodik(1, 1300);
    await flush();
    assert.equal(env.syncs().length, 1);
    assert.deepEqual(JSON.parse(localStorage.getItem('ag_watch_progress')), {});

    env.leavePage();
    assert.deepEqual(JSON.parse(localStorage.getItem('ag_watch_progress')), {});
});

test('без входа в аккаунт участки сохраняются: после входа серия отметится', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage, syncResult: { success: false, reason: 'not_logged_in' } });
    env.playKodik(1, 1200);
    env.leavePage();
    await flush();

    env = makeEnv({ localStorage });
    env.playKodik(1201, 1210);
    await flush();
    assert.equal(env.syncs().length, 1);
});

test('недоступный localStorage не ломает учёт', async () => {
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const env = makeEnv({ localStorage: broken });
    env.playKodik(1, 1300);
    await flush();
    assert.equal(env.syncs().length, 1);
});

test('перемотка в конец без просмотра не засчитывается', async () => {
    const env = makeEnv();
    env.post({ key: 'kodik_player_duration_update', value: 1400 });
    env.post({ key: 'kodik_player_time_update', value: 10 });
    env.post({ key: 'kodik_player_time_update', value: 1350 });
    env.post({ key: 'kodik_player_video_ended' });
    await flush();
    assert.equal(env.syncs().length, 0);
});

test('CDNVideoHub (плеер AnimeGO по умолчанию) из same-origin iframe', async () => {
    const env = makeEnv();
    for (let t = 1; t <= 1200; t++) {
        env.post({ source: 'cdnvideohub-player', eventType: 'timeupdate', data: { position: t, duration: 1440 } },
            { origin: 'https://animego.me', source: cvhFrame });
    }
    await flush();
    assert.equal(env.syncs().length, 1);
});

test('AniBoom: до 80% нет синхронизации, по ended после 64% — есть', async () => {
    const env = makeEnv();
    for (let t = 1; t <= 900; t++) {
        env.post({ source: 'aniboom-player', type: 'player.timeupdate', payload: { currentTime: t, duration: 1400 } }, { origin: 'https://aniboom.one' });
    }
    await flush();
    assert.equal(env.syncs().length, 0);
    env.post({ source: 'aniboom-player', type: 'player.ended' }, { origin: 'https://aniboom.one' });
    await flush();
    assert.equal(env.syncs().length, 1);
});

test('два потока из одного окна (Kodik + AG_VIDEO_PROGRESS) не дублируют синхронизацию', async () => {
    const env = makeEnv();
    env.post({ key: 'kodik_player_duration_update', value: 1400 });
    for (let t = 1; t <= 1300; t++) {
        env.post({ key: 'kodik_player_time_update', value: t });
        if (t % 2 === 0) env.post({ type: 'AG_VIDEO_PROGRESS', currentTime: t - 0.4, duration: 1400, isEnded: false, episode: '1' });
    }
    await flush();
    assert.equal(env.syncs().length, 1);
});

test('поддельный origin (animego.me.evil.com) игнорируется', async () => {
    const env = makeEnv();
    for (let t = 1; t <= 1300; t++) env.post({ key: 'kodik_player_time_update', value: t }, { origin: 'https://animego.me.evil.com' });
    await flush();
    assert.equal(env.log.length, 0);
});

test('смена серии: серии 3 и 4 синхронизируются отдельно', async () => {
    let ep = '3';
    const env = makeEnv({ getEpisode: () => ep });
    env.playKodik(1, 1300);
    ep = '4';
    env.playKodik(1, 1300);
    await flush();
    assert.deepEqual(env.syncs().map(s => s.episode), [3, 4]);
});

test('реклама короче минуты не засчитывается', async () => {
    const env = makeEnv();
    for (let t = 1; t <= 30; t++) {
        env.post({ source: 'cdnvideohub-player', eventType: 'timeupdate', data: { position: t, duration: 30 } }, { origin: 'https://animego.me', source: cvhFrame });
    }
    env.post({ source: 'cdnvideohub-player', eventType: 'ended' }, { origin: 'https://animego.me', source: cvhFrame });
    await flush();
    assert.equal(env.syncs().length, 0);
});

// ---------- Общее место остановки между сайтами ----------

const OTHER_SITE = '/12345-strazhi-grobnits.html';

test('серию, начатую на одном сайте, другой сайт продолжает с той же секунды', async () => {
    const far = {};
    let env = makeEnv({ far });
    playOurs(env, 100, 400);
    env.leavePage();
    await flush();
    assert.equal(far[62218]['3'].position, 400);

    env = makeEnv({ far, pathname: OTHER_SITE });
    assert.equal((await askResume(env))[0].time, 400);
});

test('из двух мест остановки берётся то, где серию смотрели последней', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    playOurs(env, 100, 200);
    env.leavePage();
    await flush();

    // На другом сайте после этого ушли дальше
    const far = { 62218: { 3: { position: 900, ts: Date.now() + 1000 } } };
    env = makeEnv({ localStorage, far });
    assert.equal((await askResume(env))[0].time, 900);

    // А старая запись другого сайта свежее место не перебивает
    const old = { 62218: { 3: { position: 50, ts: Date.now() - 60000 } } };
    env = makeEnv({ localStorage, far: old });
    assert.equal((await askResume(env))[0].time, 200);
});

test('серия, досмотренная на другом сайте, здесь не возвращает на старое место', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    playOurs(env, 100, 200);
    env.leavePage();
    await flush();

    env = makeEnv({ localStorage, far: { 62218: { 3: { position: 0, ts: Date.now() + 1000 } } } });
    assert.deepEqual(await askResume(env), []);
});

test('конец серии уходит в общее место как «досмотрена»', async () => {
    const far = {};
    const env = makeEnv({ far });
    playOurs(env, 100, 400);
    env.post({ type: 'AG_VIDEO_PROGRESS', episode: '3', currentTime: 1400, duration: 1400, isEnded: true });
    env.leavePage();
    await flush();
    assert.equal(far[62218]['3'].position, 0);
});

test('фон не ответил про общее место: плеер получает место этого сайта', async () => {
    const localStorage = makeStorage();
    let env = makeEnv({ localStorage });
    playOurs(env, 100, 200);
    env.leavePage();

    env = makeEnv({ localStorage, farFails: true });
    const replies = await askResume(env, () => new Promise(r => setTimeout(r, 1700)));
    assert.equal(replies[0].time, 200);
});

test('плеер другого сайта открывает серию, на которой остановились', async () => {
    const far = { 62218: { 5: { position: 300, ts: Date.now() - 5000 }, 4: { position: 0, ts: Date.now() - 9000 } } };
    let env = makeEnv({ far, pathname: OTHER_SITE });
    const last = await env.tracker.lastWatched();
    assert.deepEqual({ episode: last.episode, finished: last.finished }, { episode: '5', finished: false });

    // Нигде не смотрели: начинать не с чего
    env = makeEnv({ pathname: OTHER_SITE });
    assert.equal(await env.tracker.lastWatched(), null);
});

test('первые секунды серии не выдаются другим сайтам за досмотренную серию', async () => {
    const far = { 62218: { 3: { position: 400, ts: Date.now() - 60000 } } };
    const env = makeEnv({ far, pathname: OTHER_SITE });
    env.post({ type: 'AG_VIDEO_PROGRESS', episode: '3', currentTime: 0.4, duration: 1400, isEnded: false });
    env.post({ type: 'AG_VIDEO_PROGRESS', episode: '3', currentTime: 2.4, duration: 1400, isEnded: false });
    env.leavePage();
    await flush();
    assert.equal(far[62218]['3'].position, 400);
});
