// Учёт просмотра серий (modules/progress-tracker.js) для всех поддерживаемых плееров
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext, isValidOriginSource, flush } = require('./helpers');

const kodikFrame = { name: 'kodik-frame' };
const cvhFrame = { name: 'cvh-frame' };

function makeEnv({ getEpisode = () => '3', settings = {} } = {}) {
    const listeners = [];
    const log = [];
    const window = {
        addEventListener: (t, fn) => { if (t === 'message') listeners.push(fn); },
        removeEventListener: (t, fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
        getSettings: async () => ({ shiki_enabled: true, shiki_sync_episodes: true, shiki_show_toasts: false, ...settings }),
        agSendMessage: async (m) => {
            log.push(m);
            if (m.action === 'resolve_shikimori_id') return { id: 62218, episodes: 59 };
            if (m.action === 'shiki_sync_progress') return { success: true };
            return null;
        }
    };
    loadInContext([isValidOriginSource(), 'modules/progress-tracker.js'], { window, location: { origin: 'https://animego.me' } });
    window.agInitProgressTracker({
        site: 'test',
        getEpisode,
        getTitleInfo: () => ({ pageKey: 'strazhi-grobnits-4148', titles: ['The Guardian of Daxia', 'Стражи гробниц'], year: '2026', kind: 'tv' })
    });
    const post = (data, { origin = 'https://kodikplayer.com', source = kodikFrame } = {}) =>
        listeners.forEach(fn => fn({ data, origin, source }));
    const playKodik = (from, to, duration = 1400) => {
        post({ key: 'kodik_player_duration_update', value: duration });
        for (let t = from; t <= to; t++) post({ key: 'kodik_player_time_update', value: t });
    };
    return { post, playKodik, log, syncs: () => log.filter(m => m.action === 'shiki_sync_progress') };
}

test('Kodik: 80% просмотра → ровно одна синхронизация с верными данными', async () => {
    const env = makeEnv();
    env.playKodik(1, 1300);
    await flush();
    assert.equal(env.syncs().length, 1);
    const s = env.syncs()[0];
    assert.deepEqual({ id: s.shikimoriId, ep: s.episode, total: s.totalEpisodes }, { id: 62218, ep: 3, total: 59 });
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

test('настройка shiki_sync_episodes=false отключает синхронизацию', async () => {
    const env = makeEnv({ settings: { shiki_sync_episodes: false } });
    env.playKodik(1, 1300);
    await flush();
    assert.equal(env.syncs().length, 0);
});
