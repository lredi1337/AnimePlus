// Экскурсия с лисой: состояние заданий, позы кота и подсказки в плеере
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read, loadInContext, flush } = require('./helpers');

function loadGuide(initial) {
    const store = { ag_guide: initial };
    let writes = 0;
    const chrome = {
        storage: { local: {
            get: async (keys) => Object.fromEntries(keys.map(k => [k, store[k]])),
            set: async (obj) => { writes++; Object.assign(store, obj); }
        } }
    };
    const ctx = loadInContext(['modules/shared/guide.js'], { chrome });
    return { AgGuide: ctx.AgGuide, store, writes: () => writes };
}

test('задание отмечается один раз и не сбрасывает остальные', async () => {
    const { AgGuide, store, writes } = loadGuide({ tourDone: true, tasks: { play: true } });
    await AgGuide.mark('skip');
    await AgGuide.mark('skip');
    await AgGuide.mark('неизвестное');
    assert.equal(writes(), 1);
    assert.deepEqual({ ...store.ag_guide.tasks }, { play: true, skip: true });
    assert.equal(store.ag_guide.tourDone, true);
});

test('два действия подряд не теряют задание', async () => {
    const { AgGuide, store } = loadGuide({ tasks: {} });
    await Promise.all([AgGuide.mark('skip'), AgGuide.mark('panel'), AgGuide.patch({ tipsDone: true })]);
    assert.deepEqual({ ...store.ag_guide.tasks }, { skip: true, panel: true });
    assert.equal(store.ag_guide.tipsDone, true);
});

test('оценка: Shikimori не нужен, а без обучения просьба приходит через три дня', async () => {
    const { AgGuide } = loadGuide({});
    const DAY = 864e5;
    const now = 100 * DAY;
    const state = (s) => AgGuide.normalize({ tourDone: true, firstSeen: now, ...s });
    const trained = { play: true, skip: true, panel: true, settings: true };

    assert.equal(AgGuide.ratingDue(state({ tasks: trained }), now), true, 'все задания, кроме Shikimori');
    assert.equal(AgGuide.ratingDue(state({ tasks: { play: true } }), now), false, 'только начал');
    assert.equal(AgGuide.ratingDue(state({ tasks: { play: true }, firstSeen: now - 3 * DAY }), now), true, 'смотрит три дня');
    assert.equal(AgGuide.ratingDue(state({ tasks: {}, firstSeen: now - 30 * DAY }), now), false, 'ни разу не смотрел');
    assert.equal(AgGuide.ratingDue(AgGuide.normalize({ tasks: trained }), now), false, 'пока идёт экскурсия');
    assert.equal(AgGuide.ratingDue(state({ tasks: trained, rated: true }), now), false, 'уже оценил');
});

test('«Не сейчас»: ещё раз через две недели, после второго отказа больше не спрашиваем', async () => {
    const { AgGuide } = loadGuide({});
    const DAY = 864e5;
    const now = 100 * DAY;
    let state = AgGuide.normalize({ tourDone: true, firstSeen: 1, tasks: { play: true, skip: true, panel: true, settings: true } });

    state = AgGuide.normalize({ ...state, ...AgGuide.ratingLater(state, now) });
    assert.equal(AgGuide.ratingDue(state, now + 13 * DAY), false);
    assert.equal(AgGuide.ratingDue(state, now + 15 * DAY), true);

    state = AgGuide.normalize({ ...state, ...AgGuide.ratingLater(state, now + 15 * DAY) });
    assert.equal(state.rated, true);
    assert.equal(AgGuide.ratingDue(state, now + 100 * DAY), false);
});

test('день первого запуска запоминается один раз', async () => {
    const { AgGuide, store } = loadGuide({});
    await AgGuide.mark('play');
    const first = store.ag_guide.firstSeen;
    assert.ok(first > 0);
    await AgGuide.patch({ tourDone: true });
    assert.equal(store.ag_guide.firstSeen, first);
});

test('прогресс и испорченные данные', async () => {
    const { AgGuide } = loadGuide('мусор');
    const state = await AgGuide.read();
    assert.equal(state.tourDone, false);
    assert.equal(AgGuide.progress(state).done, 0);
    const all = Object.fromEntries(AgGuide.TASKS.map(t => [t.id, true]));
    assert.equal(AgGuide.progress(AgGuide.normalize({ tasks: all })).finished, true);
});

test('у лисы разные позы, а неизвестная не ломает рисунок', () => {
    const fox = require('../modules/shared/guide-fox.js');
    const drawings = fox.POSES.map(p => fox.svg(p));
    assert.ok(fox.POSES.length >= 8);
    assert.equal(new Set(drawings).size, drawings.length);
    for (const svg of drawings) assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
    assert.equal(fox.svg('нет такой'), fox.svg('hello'));
    assert.match(fox.svg(), /prefers-reduced-motion/);
});

const PLAYER = `<!doctype html><html><head><title>Тайтл</title></head><body class="serial active-player player-is-ready"><div class="serial-series-box"><select><option value="1" selected>1 серия</option><option value="2">2 серия</option></select></div><div class="serial-translations-box"><select><option value="1" selected>A</option><option value="2">B</option></select></div><div class="fp-player"><video class="fp-engine"></video></div></body></html>`;

async function mountShell(seen = false) {
    const dom = new JSDOM(PLAYER, { url: 'https://kodikplayer.com/serial/1/a/720p', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
    w.eval(read('modules/player/adapters.js'));
    w.eval(read('modules/player/shell-view.js'));
    w.eval(read('modules/player/shell.js'));
    const marks = [];
    let done = 0;
    const shell = w.AgPlayerShell.create({
        getSettings: () => ({ voice_priority_list: [] }),
        patchSettings: async () => {},
        getTimings: () => ({ op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } }),
        nav() {}, toggleFs() {}, onVoicePicked() {},
        guide: {
            mark: (id) => marks.push(id),
            fox: (pose) => `<svg data-pose="${pose}"></svg>`,
            tipsSeen: async () => seen,
            tipsDone: () => { done++; }
        }
    });
    await flush();
    const sh = w.document.getElementById('ag-shell').shadowRoot;
    return { sh, shell, marks, done: () => done };
}

test('подсказки в плеере: по шагам, с подсветкой, запоминаются', async () => {
    const { sh, shell, marks, done } = await mountShell();
    const box = sh.querySelector('.guide');
    assert.equal(box.hidden, false);
    assert.ok(marks.includes('play'));
    assert.ok(sh.querySelector('.rail').classList.contains('guide-spot'));
    assert.equal(box.querySelector('svg').dataset.pose, 'down');

    box.querySelector('.go').click();
    assert.ok(!sh.querySelector('.rail').classList.contains('guide-spot'));
    assert.ok(sh.querySelector('.jump').classList.contains('guide-spot'));

    box.querySelector('.skip').click();
    assert.equal(box.hidden, true);
    assert.equal(sh.querySelectorAll('.guide-spot').length, 0);
    assert.equal(done(), 1);
    shell.destroy();
});

test('подсказки показываются один раз, задания из плеера отмечаются', async () => {
    const { sh, shell, marks } = await mountShell(true);
    assert.equal(sh.querySelector('.guide').hidden, true);
    sh.querySelector('[data-act="episodes"]').click();
    sh.querySelector('[data-act="skip"]').click();
    assert.ok(marks.includes('panel'));
    shell.destroy();
});

test('бесшовная смена: новичок видит её в подсказках, панель открывается, задание не засчитано заранее', async () => {
    const { sh, shell, marks } = await mountShell();
    const box = sh.querySelector('.guide');
    box.querySelector('.go').click();
    box.querySelector('.go').click();
    box.querySelector('.go').click();
    assert.match(box.querySelector('p').textContent, /без перерыва/);
    assert.ok(sh.querySelector('.panel').classList.contains('on'));
    assert.ok(!marks.includes('panel'));
    box.querySelector('.go').click();
    assert.ok(!sh.querySelector('.panel').classList.contains('on'));
    shell.destroy();
});

test('о смене плеера лиса рассказывает только в плеере: в заданиях её нет', async () => {
    const { AgGuide } = loadGuide({});
    assert.deepEqual([...AgGuide.TASKS.map(t => t.id)], ['play', 'skip', 'panel', 'dock', 'shiki', 'settings']);
    assert.equal(AgGuide.normalize({ switchTipDone: true }).switchTipDone, true);
});

test('значок лисы: своё задание и разовая подсказка, на просьбу об оценке не влияют', async () => {
    const { AgGuide } = loadGuide({});
    assert.equal(AgGuide.normalize({ dockTipDone: true }).dockTipDone, true);
    assert.equal(AgGuide.normalize({}).dockTipDone, false);
    // Прошёл всё обучение до появления значка: просьба об оценке не откладывается из-за нового задания
    const state = AgGuide.normalize({ tourDone: true, firstSeen: 1, tasks: { play: true, skip: true, panel: true, settings: true } });
    assert.equal(AgGuide.ratingDue(state, 2), true);
    assert.equal(AgGuide.progress(state).total, 6);
});

test('плеер выбирается своей кнопкой, а лиса рассказывает о нём перед настройками', async () => {
    const { sh, shell, marks } = await mountShell();
    const button = sh.querySelector('[data-act="players"]');
    assert.equal(button.style.display, 'none');
    shell.setSite({ title: 'Тайтл', episodes: [], voices: [], players: [{ index: 0, title: 'Kodik', selected: true }, { index: 1, title: 'Alloha', selected: false }] });
    assert.notEqual(button.style.display, 'none');

    const box = sh.querySelector('.guide');
    const texts = [];
    while (!box.hidden && texts.length < 10) {
        texts.push(box.querySelector('p').textContent);
        if (/Плеер тормозит/.test(texts[texts.length - 1])) {
            assert.ok(sh.querySelector('.panel').classList.contains('on'));
            assert.equal(sh.querySelector('.player-row.guide-spot .name').textContent, 'Alloha');
        }
        box.querySelector('.go').click();
    }
    const player = texts.findIndex(t => /Плеер тормозит/.test(t));
    const settings = texts.findIndex(t => /настройки просмотра/.test(t));
    assert.ok(player >= 0 && player < settings, 'сначала плеер, потом настройки');
    assert.ok(!marks.includes('panel'));

    sh.querySelector('[data-act="settings"]').click();
    assert.equal(sh.querySelectorAll('.player-row').length, 0, 'в настройках плеера больше нет');
    sh.querySelector('[data-act="players"]').click();
    assert.equal(sh.querySelectorAll('.player-row').length, 2);
    shell.destroy();
});
