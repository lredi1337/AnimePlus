// Выбор озвучки и плеера на AnimeGO (modules/animego/ag-voice.js): выбор зрителя важнее приоритетов, плеер по умолчанию Kodik
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const translation = (id, name, extra = '') => `<button data-anime-player-target="translation" data-translation="${id}" class="${extra}">${name}</button>`;
const provider = (tr, slug, extra = '') => `<button data-anime-player-target="provider" data-ptranslation="${tr}" data-provider-slug="${slug}" class="${extra}">${slug}</button>`;

/** Меню плеера AnimeGO: озвучки и плееры для каждой озвучки. Нажатие делает кнопку активной, как сайт */
async function start(menu, { settings = {}, saved = {} } = {}) {
    const dom = new JSDOM(`<!doctype html><body><div id="video-player">${menu}</div></body>`, { url: 'https://animego.me/anime/naruto-102', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const store = { ...saved };
    w.chrome = {
        runtime: { id: 'test', getURL: (p) => p, sendMessage() {}, onMessage: { addListener() {} } },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries([].concat(keys).filter(k => k in store).map(k => [k, store[k]])),
                set: async (obj) => { Object.assign(store, obj); }
            },
            onChanged: { addListener() {} }
        }
    };
    for (const file of ['config.js', 'modules/shared/sites.js', 'modules/shared/voice-choice.js', 'modules/shared/player-choice.js', 'modules/site-selectors.js', 'modules/animego/ag-voice.js']) w.eval(read(file));
    await new Promise(r => setTimeout(r, 0));

    const clicks = [];
    w.document.addEventListener('click', (e) => {
        const item = e.target.closest('[data-anime-player-target]');
        if (!item) return;
        clicks.push(item.dataset.providerSlug || item.textContent);
        const group = item.dataset.animePlayerTarget;
        w.document.querySelectorAll(`[data-anime-player-target="${group}"]`).forEach(el => el.classList.remove('active'));
        item.classList.add('active');
    });
    const run = async (times = 4) => {
        for (let i = 0; i < times; i++) {
            await w.agInitVoiceAutoSelect({ ...JSON.parse(JSON.stringify(w.DEFAULT_SETTINGS)), ...settings });
            // Повторное нажатие на ту же кнопку раньше 1,5 с пропускается: сайт ещё перерисовывает меню
            w.document.querySelectorAll('[data-ag-last-click]').forEach(el => { el.dataset.agLastClick = '0'; });
        }
    };
    return { w, clicks, run, store };
}

const MENU = translation('1', 'SHIZA Project', 'active') + translation('2', 'AniLibria.TV') + translation('3', 'Dream Cast')
    + provider('1', 'aniboom', 'active') + provider('1', 'kodik') + provider('2', 'kodik') + provider('2', 'cvh') + provider('3', 'kodik');

test('без выбора зрителя: первая озвучка из приоритетов и плеер Kodik', async () => {
    const { clicks, run } = await start(MENU);
    await run();
    assert.deepEqual(clicks, ['AniLibria.TV', 'kodik']);
});

test('озвучка, выбранная зрителем для тайтла, важнее списка приоритетов', async () => {
    const { w, clicks, run } = await start(MENU);
    await w.AgVoiceChoice.set(w.AgVoiceChoice.pageKey(), 'Dream Cast');
    await run();
    assert.deepEqual(clicks, ['Dream Cast', 'kodik']);
});

test('озвучка с ошибкой пропускается, даже если стоит первой в приоритетах', async () => {
    const menu = translation('1', 'SHIZA Project', 'active') + translation('2', 'AniLibria.TV', 'player-error') + translation('3', 'Studio Band')
        + provider('1', 'kodik') + provider('3', 'kodik');
    const { clicks, run } = await start(menu);
    await run();
    assert.deepEqual(clicks, ['Studio Band', 'kodik']);
});

test('автовыбор озвучки выключен: озвучка не меняется, а плеер всё равно Kodik', async () => {
    const { clicks, run } = await start(MENU, { settings: { auto_select_voice: false } });
    await run();
    assert.deepEqual(clicks, ['kodik']);
});

test('плеер, выбранный зрителем, важнее Kodik, а если его нет у озвучки — Kodik', async () => {
    // Выбор сделан на прошлой странице сайта и сохранён
    const saved = { ag_player_choice: { animego: 'cvh' } };
    const chosen = await start(MENU, { saved });
    await chosen.run();
    assert.deepEqual(chosen.clicks, ['AniLibria.TV', 'cvh']);

    const missing = await start(translation('3', 'AniLibria.TV', 'active') + provider('3', 'aniboom', 'active') + provider('3', 'kodik'), { saved });
    await missing.run();
    assert.deepEqual(missing.clicks, ['kodik']);
});

test('нажатие зрителя на озвучку запоминается для тайтла и останавливает автовыбор', async () => {
    const { w, clicks, run } = await start(MENU);
    const dream = w.document.querySelectorAll('[data-anime-player-target="translation"]')[2];
    // Нажатие зрителя: isTrusted у событий jsdom всегда false, поэтому вызываем то, что делает обработчик, через agRememberVoice
    w.agRememberVoice(dream.textContent);
    await run();
    assert.equal(clicks.includes('AniLibria.TV'), false);
    assert.equal(await w.AgVoiceChoice.get(w.AgVoiceChoice.pageKey()), 'Dream Cast');
});

test('у тайтла нет Kodik: ничего не нажимается по кругу', async () => {
    const { clicks, run } = await start(translation('1', 'AniLibria.TV', 'active') + provider('1', 'aniboom', 'active'));
    await run(6);
    assert.deepEqual(clicks, []);
});

test('расширение выключено: меню не трогается', async () => {
    const { clicks, run } = await start(MENU, { settings: { global_enabled: false } });
    await run();
    assert.deepEqual(clicks, []);
});
