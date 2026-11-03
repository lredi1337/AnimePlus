// Выбор плеера зрителем: хранение и вкладки плееров на сайтах движка DLE
const { test } = require('node:test');
const assert = require('node:assert');
const { makeContentWindow } = require('./dom-helpers');

const PAGE = (tabs, slots) => `<h1>Тайтл</h1><div data-player-anime-id="1">
    <div class="tabs-block__select">${tabs.map(([t, on]) => `<button class="${on ? 'is-active' : ''}">${t}</button>`).join('')}</div>
    ${slots.map(s => `<div data-player-slot="1" data-player-title="${s}" class="tabs-block__content"></div>`).join('')}
</div>`;
const JUTSU = PAGE([['Смотреть онлайн', true], ['Kodik', false]], ['Плеер Alloha', 'Плеер Kodik']);
const TV = PAGE([['Смотреть онлайн', true], ['Kodik', false], ['Трейлер', false]], ['Плеер Alloha', 'Плеер Kodik']);

function dle(html, choice = null) {
    const url = 'https://jut-su.net/1-a.html';
    const { window: w } = makeContentWindow(html, url);
    w.eval(require('./helpers').read('modules/site-selectors.js'));
    const store = {};
    w.AgPlayerChoice.get = async () => choice;
    w.AgPlayerChoice.set = async (site, name) => { store[site] = name; };
    const site = w.AgSites.byId('jutsu');
    const provider = new w.AgProviders.registry[site.provider](site, {});
    const clicked = [];
    w.document.querySelectorAll('.tabs-block__select > *').forEach(t => t.addEventListener('click', () => {
        clicked.push(t.textContent);
        w.document.querySelectorAll('.tabs-block__select > *').forEach(x => x.classList.remove('is-active'));
        t.classList.add('is-active');
    }));
    return { w, provider, clicked, store };
}

const untilPicked = async (provider) => {
    for (let i = 0; i < 20; i++) {
        if (provider.selectPreferredPlayer()) return true;
        await new Promise(r => setTimeout(r, 20));
    }
    return false;
};

test('название плеера сравнивается без лишнего, Kodik не записывается', async () => {
    const { w } = dle(JUTSU);
    const api = require('../modules/shared/player-choice.js');
    assert.ok(api.same('Плеер Alloha', 'alloha'));
    assert.ok(!api.same('Aksor', 'Alloha'));
    assert.ok(!api.same('', ''));
    assert.ok(api.isKodik('Плеер Kodik (12 эп.)'));
    w.close();
});

test('DLE: без выбора включается Kodik', async () => {
    const { provider, clicked } = dle(JUTSU);
    assert.strictEqual(await untilPicked(provider), true);
    assert.deepStrictEqual(clicked, ['Kodik']);
});

test('DLE: выбранный плеер остаётся, хотя вкладка подписана иначе', async () => {
    const { provider, clicked } = dle(JUTSU, 'Alloha');
    assert.strictEqual(await untilPicked(provider), true);
    assert.deepStrictEqual(clicked, []);
});

test('DLE: выбранного плеера нет у тайтла — Kodik', async () => {
    const { provider, clicked } = dle(JUTSU, 'Aksor');
    assert.strictEqual(await untilPicked(provider), true);
    assert.deepStrictEqual(clicked, ['Kodik']);
});

test('DLE: в панели плееры с настоящими названиями и без трейлера, выбор запоминается', async () => {
    const { provider, clicked, store } = dle(TV);
    const site = await provider.getShellSite();
    assert.deepStrictEqual([...site.players].map(p => [p.title, p.selected]), [['Alloha', true], ['Kodik', false]]);
    await provider.shellPick('players', 1);
    assert.deepStrictEqual(clicked, ['Kodik']);
    assert.strictEqual(store.jutsu, 'Kodik');
});
