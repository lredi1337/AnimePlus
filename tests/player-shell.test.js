// Оболочка плеера Kodik: группы серий, порядок озвучек, режим показа и подключение к разметке плеера
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');
const { formatTime, episodeGroups, sortVoices, playerMode } = require('../modules/kodik/player-shell.js');

const eps = (n) => Array.from({ length: n }, (_, i) => ({ label: String(i + 1) }));

test('время: минуты и часы', () => {
    assert.equal(formatTime(0), '0:00');
    assert.equal(formatTime(264.9), '4:24');
    assert.equal(formatTime(3725), '1:02:05');
});

test('до ста серий групп нет, дальше по сотням', () => {
    assert.deepEqual(episodeGroups(eps(100)), []);
    const g = episodeGroups(eps(366));
    assert.deepEqual(g.map(x => x.label), ['1–100', '101–200', '201–300', '301–366']);
    assert.deepEqual([g[3].from, g[3].to], [300, 366]);
});

test('сначала озвучки из приоритетов в их порядке, затем остальные как у Kodik', () => {
    const list = [{ title: 'AniDUB' }, { title: 'JAM' }, { title: 'Dream Cast' }, { title: 'AniLibria.TV' }];
    assert.deepEqual(sortVoices(list, ['Anilibria', 'Dream Cast']).map(v => v.title), ['AniLibria.TV', 'Dream Cast', 'AniDUB', 'JAM']);
    assert.deepEqual(sortVoices(list, []).map(v => v.title), ['AniDUB', 'JAM', 'Dream Cast', 'AniLibria.TV']);
});

test('реклама всегда показывается в родном интерфейсе', () => {
    assert.equal(playerMode({ active: false, ready: false, adPlaying: false, hasVideo: false }), 'start');
    assert.equal(playerMode({ active: true, ready: false, adPlaying: false, hasVideo: false }), 'native');
    assert.equal(playerMode({ active: true, ready: true, adPlaying: false, hasVideo: true }), 'play');
    assert.equal(playerMode({ active: true, ready: true, adPlaying: true, hasVideo: true }), 'native');
    assert.equal(playerMode({ active: false, ready: false, adPlaying: true, hasVideo: false }), 'native');
});

// Разметка снята с живого kodikplayer.com
const PLAYER = `<!doctype html><html><head><title>Чёрный клевер [ТВ-2]</title></head><body class="serial active-player player-is-ready">
<div class="serial-panel"><div class="serial-seasons-box"><select>
<option value="1" data-title="1 сезон">1 сезон</option><option value="2" data-title="2 сезон" selected>2 сезон</option></select></div>
<div class="serial-series-box"><select><option value="1" data-title="1 серия">1 серия</option><option value="2" data-title="2 серия" selected>2 серия</option><option value="3" data-title="3 серия">3 серия</option></select></div>
<div class="serial-translations-box"><select>
<option value="609" data-title="AniDUB" data-translation-type="voice" data-episode-count="5">AniDUB (5 эп.)</option>
<option value="643" data-title="JAM" data-translation-type="voice" data-episode-count="4" selected>JAM (4 эп.)</option>
<option value="1291" data-title="Crunchyroll.Subtitles" data-translation-type="subtitles" data-episode-count="5">Crunchyroll.Subtitles (5 эп.)</option></select></div></div>
<div class="fp-player"><video class="fp-engine"></video><div class="fp-ui"></div></div></body></html>`;

function mount(extra = {}) {
    const dom = new JSDOM(PLAYER, { url: 'https://kodikplayer.com/serial/1/a/720p', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
    w.eval(read('modules/kodik/player-shell.js'));
    const calls = [];
    const shell = w.AgKodikShell.create({
        getSettings: () => ({ voice_priority_list: ['AniDUB'], ...extra }),
        patchSettings: async () => {},
        getTimings: () => ({ op: { start: 60, end: 150 }, ed: { start: 0, end: 0 } }),
        nav: (dir) => calls.push(['nav', dir]),
        toggleFs: () => calls.push(['fs']),
        onVoicePicked: (voice) => calls.push(['voice', voice])
    });
    const sh = w.document.getElementById('ag-shell').shadowRoot;
    return { w, shell, sh, calls };
}

test('оболочка подключается, скрывает родной интерфейс и показывает название, сезон, серию и озвучку', () => {
    const { w, sh, shell } = mount();
    assert.ok(w.document.body.classList.contains('ag-shell-on'));
    assert.equal(sh.querySelector('.title').textContent, 'Чёрный клевер [ТВ-2]');
    assert.equal(sh.querySelector('.sub').textContent, 'Сезон 2 · Серия 2 · JAM');
    shell.destroy();
});

test('панель серий: переключатель сезонов и выбор серии через родной список Kodik', () => {
    const { w, sh, shell } = mount();
    sh.querySelector('[data-act="episodes"]').click();
    assert.deepEqual([...sh.querySelectorAll('.panel .chip')].map(c => c.textContent), ['Сезон 1', 'Сезон 2']);
    const buttons = [...sh.querySelectorAll('.panel .ep')];
    assert.deepEqual(buttons.map(b => b.textContent), ['1', '2', '3']);
    assert.ok(buttons[1].classList.contains('now'));
    let changed = 0;
    const select = w.document.querySelector('.serial-series-box select');
    select.addEventListener('change', () => changed++);
    buttons[2].click();
    assert.equal(select.value, '3');
    assert.equal(changed, 1);
    shell.destroy();
});

test('панель озвучки: приоритет первым, субтитры отдельно, выбор запоминается как выбор пользователя', () => {
    const { w, sh, shell, calls } = mount();
    sh.querySelector('[data-act="voices"]').click();
    assert.deepEqual([...sh.querySelectorAll('.panel .chip')].map(c => c.textContent), ['Озвучка 2', 'Субтитры 1']);
    const rows = [...sh.querySelectorAll('.panel .row')];
    assert.deepEqual(rows.map(r => r.querySelector('.name').textContent), ['AniDUB', 'JAM']);
    assert.ok(rows[1].classList.contains('on'));
    rows[0].click();
    assert.deepEqual(calls, [['voice', 'AniDUB']]);
    assert.equal(w.document.querySelector('.serial-translations-box select').value, '609');
    shell.destroy();
});

test('снятие оболочки возвращает родной интерфейс', () => {
    const { w, shell } = mount();
    shell.destroy();
    assert.ok(!w.document.body.classList.contains('ag-shell-on'));
    assert.equal(w.document.getElementById('ag-shell'), null);
    assert.equal(w.document.getElementById('ag-shell-native'), null);
});
