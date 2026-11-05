// Качество в CVH: разметка снята с настоящего плеера. Меню появляется не сразу, а обычные разрешения лежат в «Другое»
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const tick = (ms = 700) => new Promise(r => setTimeout(r, ms));
const LEVELS = ['auto', '1080p', '720p', '480p'];

/** Родное меню плеера: gear → строка качества → «Другое» → разрешения. После выбора всё закрывается */
function fakeCvh(root, { delay = 60, hiddenGear = false } = {}) {
    const state = { selected: 'auto', picked: [] };
    const box = root.querySelector('.keyboard-controls');
    const later = (fn) => setTimeout(fn, delay);
    const closeAll = () => box.querySelectorAll('[data-testid="settings-menu"], .sub-menu').forEach(e => e.remove());
    const showGear = () => {
        if (box.querySelector('[data-testid="settings-btn"]')) return;
        const gear = box.ownerDocument.createElement('button');
        gear.dataset.testid = 'settings-btn';
        gear.addEventListener('click', () => {
            if (box.querySelector('[data-testid="settings-menu"], .sub-menu')) return closeAll();
            later(() => {
                box.insertAdjacentHTML('beforeend', '<div data-testid="settings-menu"><li data-testid="quality-settings" aria-label="Качество: Авто"></li></div>');
                box.querySelector('[data-testid="quality-settings"]').addEventListener('click', () => later(() => {
                    closeAll();
                    box.insertAdjacentHTML('beforeend', '<div class="sub-menu" data-testid="quality-settings-sub-menu"><li data-value="auto">Автоматически</li><li data-value="high_quality">Высокое качество</li><li data-testid="quality-other-settings">Другое</li></div>');
                    box.querySelector('[data-testid="quality-other-settings"]').addEventListener('click', () => later(() => {
                        closeAll();
                        const rows = LEVELS.map(l => `<li class="item" data-value="${l}" aria-label="${l === 'auto' ? 'Авто' : l}"><div class="menu-item-value" data-selected="${l === state.selected}"><div class="quality-label"><span class="quality">${l === 'auto' ? 'Авто' : l}</span></div></div></li>`).join('');
                        box.insertAdjacentHTML('beforeend', `<div class="sub-menu" data-testid="quality-other-settings-sub-menu"><li data-testid="return-to-settings-menu">Качество</li>${rows}</div>`);
                        box.querySelectorAll('li[data-value]').forEach(li => li.addEventListener('click', () => {
                            state.selected = li.dataset.value;
                            state.picked.push(li.dataset.value);
                            closeAll();
                        }));
                    }));
                }));
            });
        });
        box.appendChild(gear);
    };
    if (hiddenGear) box.addEventListener('mousemove', showGear);
    else showGear();
    return state;
}

function cvhPage(options) {
    const dom = new JSDOM('<!doctype html><html><head><title>Тайтл</title></head><body><div id="app"><div class="shadow-root-container"></div></div></body></html>', { url: 'https://player.cdnvideohub.com/s2/frame/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
    const root = w.document.querySelector('.shadow-root-container').attachShadow({ mode: 'open' });
    root.innerHTML = '<div class="keyboard-controls"><div class="video-wrapper"><video class="player-media"></video></div></div>';
    const state = fakeCvh(root, options);
    w.eval(read('modules/player/adapters.js'));
    return { w, root, state, player: w.AgPlayerAdapters.current() };
}

const nativeOpen = (root) => root.querySelector('[data-testid="settings-menu"], .sub-menu');

test('CVH: открытие доходит до разрешений и закрывает родное меню', async () => {
    const { w, root, player } = cvhPage();
    await player.openQuality();
    assert.deepEqual(Array.from(player.quality(), q => q.label), ['Авто', '1080p', '720p', '480p']);
    assert.equal(player.quality().find(q => q.current).label, 'Авто');
    assert.equal(nativeOpen(root), null);
    w.close();
});

test('CVH: пока кнопка настроек скрыта, плеер сначала показывает её', async () => {
    const { w, player } = cvhPage({ hiddenGear: true });
    await player.openQuality();
    assert.equal(player.quality().length, 4);
    w.close();
});

test('CVH: выбор сразу отмечен, нажимает родной пункт, а список остаётся', async () => {
    const { w, root, state, player } = cvhPage();
    await player.openQuality();
    player.quality().find(q => q.label === '480p').pick();
    assert.equal(player.quality().length, 4);
    assert.equal(player.quality().find(q => q.current).label, '480p');
    await tick();
    assert.deepEqual(state.picked, ['480p']);
    assert.equal(nativeOpen(root), null);
    assert.equal(player.quality().find(q => q.current).label, '480p');
    w.close();
});

test('CVH: список узнаётся заранее, один раз на серию', async () => {
    const { w, root, player } = cvhPage();
    let gearPresses = 0;
    root.querySelector('[data-testid="settings-btn"]').addEventListener('click', () => { gearPresses += 1; });
    const video = { currentSrc: 'blob:one' };
    player.refreshQuality(video);
    player.refreshQuality(video);
    await tick();
    assert.equal(player.quality().length, 4);
    assert.equal(gearPresses, 2, 'открыл и закрыл');
    player.refreshQuality(video);
    await tick(150);
    assert.equal(gearPresses, 2);
    await player.openQuality();
    assert.equal(gearPresses, 2, 'панель берёт запомненный список');
    player.refreshQuality({ currentSrc: 'blob:two' });
    await tick();
    assert.equal(gearPresses, 4, 'новая серия: читает снова');
    w.close();
});

test('CVH: сразу после выбора плеер не перечитывает прежнюю отметку', async () => {
    const { w, player } = cvhPage();
    player.refreshQuality({ currentSrc: 'blob:one' });
    await tick();
    player.quality().find(q => q.label === '480p').pick();
    await tick();
    player.refreshQuality({ currentSrc: 'blob:one-after-switch' });
    await tick();
    assert.equal(player.quality().find(q => q.current).label, '480p');
    w.close();
});

test('CVH: меню не появилось: ожидание заканчивается, а не висит', async () => {
    const dom = new JSDOM('<!doctype html><body><div class="shadow-root-container"></div></body>', { url: 'https://player.cdnvideohub.com/s2/frame/', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.document.querySelector('.shadow-root-container').attachShadow({ mode: 'open' }).innerHTML = '<div class="keyboard-controls"></div>';
    w.eval(read('modules/player/adapters.js'));
    const player = w.AgPlayerAdapters.current();
    await player.openQuality();
    assert.equal(player.quality().length, 0);
    w.close();
});

// ---------- Оболочка ----------

function mountShell({ src = 'blob:one', started = true } = {}) {
    const page = cvhPage();
    const video = page.root.querySelector('video');
    Object.defineProperty(video, 'currentSrc', { get: () => src });
    Object.defineProperty(video, 'paused', { get: () => !started });
    Object.defineProperty(video, 'readyState', { get: () => (started ? 4 : 0) });
    page.w.eval(read('modules/player/shell.js'));
    const shell = page.w.AgPlayerShell.create({
        getSettings: () => ({ voice_priority_list: [] }),
        patchSettings: async () => {},
        getTimings: () => ({ op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } }),
        nav() {},
        toggleFs() {},
        onVoicePicked() {}
    });
    return { ...page, shell, sh: page.w.document.getElementById('ag-shell').shadowRoot };
}

const qualityRows = (sh) => [...sh.querySelectorAll('.panel .row')].filter(r => /^(Авто|\d+p)$/.test(r.textContent.trim()));

test('качество уже на месте в момент открытия настроек и не мигает после выбора', async () => {
    const { w, root, sh, shell, state } = mountShell();
    // Оболочка узнаёт список заранее, пока панель закрыта
    await tick(1500);
    assert.equal(nativeOpen(root), null);

    sh.querySelector('[data-act="settings"]').click();
    const rows = qualityRows(sh);
    assert.deepEqual(rows.map(r => r.textContent.trim()), ['Авто', '1080p', '720p', '480p'], 'без ожидания');

    rows.find(r => r.textContent.trim() === '480p').click();
    // Ни в один момент после выбора список не пустеет
    for (let i = 0; i < 12; i++) {
        assert.equal(qualityRows(sh).length, 4, `шаг ${i}`);
        assert.equal(qualityRows(sh).find(r => r.classList.contains('on')).textContent.trim(), '480p');
        await tick(100);
    }
    assert.deepEqual(state.picked, ['480p']);
    assert.equal(nativeOpen(root), null);
    shell.destroy();
    w.close();
});

test('до запуска серии родное меню не трогается, пока зритель не откроет настройки', async () => {
    const { w, root, shell } = mountShell({ started: false });
    let gearPresses = 0;
    root.querySelector('[data-testid="settings-btn"]').addEventListener('click', () => { gearPresses += 1; });
    await tick(1500);
    assert.equal(gearPresses, 0);
    shell.destroy();
    w.close();
});

test('если список ещё неизвестен, панель показывает его, как только он готов', async () => {
    const { w, sh, shell } = mountShell({ started: false });
    sh.querySelector('[data-act="settings"]').click();
    assert.equal(qualityRows(sh).length, 0);
    await tick();
    assert.equal(qualityRows(sh).length, 4);
    shell.destroy();
    w.close();
});
