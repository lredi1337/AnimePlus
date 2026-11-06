// Оболочка плеера Kodik: группы серий, порядок озвучек, режим показа и подключение к разметке плеера
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');
require('../modules/player/shell-view.js');
const { formatTime, episodeGroups, sortVoices, playerMode } = require('../modules/player/shell.js');

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

test('режимы: реклама важнее всего, при загрузке и автозапуске индикатор вместо старого плеера', () => {
    assert.equal(playerMode({ active: false, ready: false, adPlaying: false, hasVideo: false }), 'start');
    assert.equal(playerMode({ active: false, ready: false, adPlaying: false, hasVideo: false, autoStarting: true }), 'loading');
    assert.equal(playerMode({ active: true, ready: false, adPlaying: false, hasVideo: false }), 'loading');
    assert.equal(playerMode({ active: true, ready: true, adPlaying: false, hasVideo: true }), 'play');
    assert.equal(playerMode({ active: true, ready: true, adPlaying: true, hasVideo: true }), 'ad');
    assert.equal(playerMode({ active: false, ready: false, adPlaying: true, hasVideo: false }), 'ad');
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
    w.eval(read('modules/player/adapters.js'));
    w.eval(read('modules/player/shell-view.js'));
    w.eval(read('modules/player/shell.js'));
    const calls = [];
    const shell = w.AgPlayerShell.create({
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
    assert.equal(sh.querySelector('.player-name').textContent, 'Плеер Kodik');
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

test('во время рекламы оболочка уходит с экрана, родной интерфейс остаётся скрытым', () => {
    const { w, sh, shell } = mount();
    const ad = w.document.createElement('div');
    ad.className = 'creative-player';
    ad.getBoundingClientRect = () => ({ width: 800, height: 450 });
    w.document.body.appendChild(ad);
    const display = () => w.document.getElementById('ag-shell').style.display;
    // Таймеры настоящие: на занятой машине ждём нужное состояние, а не фиксированное время
    const until = async (want) => {
        for (let i = 0; i < 80 && display() !== want; i++) await new Promise(r => setTimeout(r, 50));
        assert.equal(display(), want);
    };
    return new Promise((resolve) => setTimeout(resolve, 500)).then(async () => {
        // Короткая вспышка пустого блока это ещё не реклама: оболочка остаётся
        assert.equal(display(), '');
        await until('none');
        assert.ok(w.document.body.classList.contains('ag-shell-on'));
        ad.remove();
        await until('');
        assert.ok(sh.querySelector('.title'));
        shell.destroy();
    });
});

test('окно «Вам есть 18 лет?»: оболочка уходит и возвращается после ответа зрителя', async () => {
    const { w, shell } = mount();
    const display = () => w.document.getElementById('ag-shell').style.display;
    const gate = w.document.createElement('div');
    gate.className = 'preview-confirmation';
    gate.innerHTML = '<div class="pc-confirm">Да</div>';
    gate.firstChild.getBoundingClientRect = () => ({ width: 80, height: 40 });
    w.document.body.appendChild(gate);
    const until = async (want) => {
        for (let i = 0; i < 80 && display() !== want; i++) await new Promise(r => setTimeout(r, 25));
        assert.equal(display(), want);
    };
    await until('none');
    let clicks = 0;
    gate.firstChild.addEventListener('click', () => { clicks++; });
    await new Promise(r => setTimeout(r, 300));
    assert.equal(clicks, 0, 'за зрителя расширение не отвечает');
    gate.remove();
    await until('');
    shell.destroy();
});

test('окно 18+ на следующей серии: уже данный в этой вкладке ответ закрывает его само', async () => {
    const { w, shell } = mount();
    w.sessionStorage.setItem('minAgeConfirmed', 'true');
    const gate = w.document.createElement('div');
    gate.className = 'preview-confirmation';
    gate.innerHTML = '<div class="pc-confirm">Да</div>';
    gate.firstChild.getBoundingClientRect = () => ({ width: 80, height: 40 });
    gate.firstChild.addEventListener('click', () => gate.remove());
    w.document.body.appendChild(gate);
    for (let i = 0; i < 80 && gate.isConnected; i++) await new Promise(r => setTimeout(r, 25));
    assert.equal(gate.isConnected, false);
    assert.equal(w.document.getElementById('ag-shell').style.display, '');
    shell.destroy();
});

test('плеер на одну серию: панели берут списки со страницы сайта и нажимают его кнопки', () => {
    const { w, sh, shell } = mount();
    w.document.querySelector('.serial-panel').remove();
    const picked = [];
    shell.setSite({
        title: 'Фрирен',
        episodes: [{ index: 0, label: '1', title: '1', selected: true }, { index: 1, label: '2', title: '2', seen: true }],
        voices: [{ index: 0, title: 'Dream Cast', selected: true, type: 'voice' }, { index: 1, title: 'AniDUB', type: 'voice' }],
        players: [{ index: 3, title: 'Kodik', selected: true }, { index: 4, title: 'CVH' }]
    });
    assert.equal(sh.querySelector('.title').textContent, 'Фрирен');
    assert.equal(sh.querySelector('.sub').textContent, 'Серия 1 · Dream Cast');
    sh.querySelector('[data-act="episodes"]').click();
    assert.deepEqual([...sh.querySelectorAll('.panel .ep')].map(e => e.textContent), ['1', '2']);
    assert.ok(sh.querySelectorAll('.panel .ep')[1].classList.contains('seen'));
    shell.destroy();
    void picked;
});

test('ручной пропуск: перемотка на 89 секунд', () => {
    const { w, sh, shell } = mount();
    const v = w.document.querySelector('video.fp-engine');
    let t = 100;
    Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; }, configurable: true });
    Object.defineProperty(v, 'duration', { get: () => 1400, configurable: true });
    sh.querySelector('[data-act="skip"]').click();
    assert.equal(t, 189);
    t = 1390;
    sh.querySelector('[data-act="skip"]').click();
    assert.equal(t, 1400);
    shell.destroy();
    // Старая настройка скрытия кнопки больше не действует: кнопка есть всегда
    const stale = mount({ showSkipBtn: false, showPiP: false });
    assert.notEqual(stale.sh.querySelector('.jump').style.display, 'none');
    assert.notEqual(stale.sh.querySelector('.pip').style.display, 'none');
    stale.shell.destroy();
});

test('пробел: одно нажатие — одна пауза, Kodik не запускает видео при отпускании', () => {
    const { w, shell } = mount();
    const v = w.document.querySelector('video.fp-engine');
    let paused = false;
    let pauses = 0;
    let plays = 0;
    Object.defineProperty(v, 'paused', { get: () => paused, configurable: true });
    v.pause = () => { paused = true; pauses++; };
    v.play = () => { paused = false; plays++; return Promise.resolve(); };
    // Так устроен родной плеер: переключает паузу при отпускании клавиши
    let nativeToggles = 0;
    w.document.addEventListener('keyup', (e) => { if (e.code === 'Space') nativeToggles++; });

    const key = (type, repeat = false) => w.document.body.dispatchEvent(new w.KeyboardEvent(type, { code: 'Space', key: ' ', bubbles: true, cancelable: true, repeat }));
    key('keydown');
    key('keydown', true);
    key('keydown', true);
    key('keyup');
    assert.deepEqual({ pauses, plays, nativeToggles }, { pauses: 1, plays: 0, nativeToggles: 0 });

    key('keydown');
    key('keyup');
    assert.deepEqual({ pauses, plays, nativeToggles }, { pauses: 1, plays: 1, nativeToggles: 0 });

    // Пробел мимо оболочки (например, в поле ввода) отпускается как обычно
    key('keyup');
    assert.equal(nativeToggles, 1);
    shell.destroy();
});

test('снятие оболочки возвращает родной интерфейс', () => {
    const { w, shell } = mount();
    shell.destroy();
    assert.ok(!w.document.body.classList.contains('ag-shell-on'));
    assert.equal(w.document.getElementById('ag-shell'), null);
    assert.equal(w.document.getElementById('ag-shell-native'), null);
});

test('длинный сериал: сотни переключаются в одной строке с поиском, все сотни открываются сеткой', () => {
    const options = Array.from({ length: 250 }, (_, i) => `<option value="${i + 1}"${i === 119 ? ' selected' : ''}>${i + 1} серия</option>`).join('');
    const dom = new JSDOM(PLAYER.replace(/<div class="serial-series-box"><select>[\s\S]*?<\/select>/,`<div class="serial-series-box"><select>${options}</select>`), { url: 'https://kodikplayer.com/serial/1/a/720p', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    w.chrome = { storage: { local: { get: async () => ({}), set: async () => {} } } };
    for (const f of ['modules/player/adapters.js', 'modules/player/shell-view.js', 'modules/player/shell.js']) w.eval(read(f));
    const shell = w.AgPlayerShell.create({ getSettings: () => ({}), patchSettings: async () => {}, getTimings: () => ({ op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } }), nav() {}, toggleFs() {}, onVoicePicked() {} });
    const sh = w.document.getElementById('ag-shell').shadowRoot;
    const q = (sel) => sh.querySelector(sel);
    const eps = () => [...sh.querySelectorAll('.panel .ep')].map(e => e.textContent);
    q('[data-act="episodes"]').click();
    // Поиск и переключатель сотен в одной строке, рядов кнопок-диапазонов больше нет
    assert.ok(q('.panel .find-row .field input'));
    assert.equal(q('.panel .chips.ranges'), null);
    assert.equal(q('.panel .range-now').textContent.trim(), '101–200');
    assert.equal(q('.panel .range-grid'), null);
    assert.equal(eps()[0], '101');
    q('.panel .range-next').click();
    assert.equal(q('.panel .range-now').textContent.trim(), '201–250');
    assert.equal(eps().length, 50);
    assert.ok(q('.panel .range-next').disabled);
    q('.panel .range-prev').click();
    q('.panel .range-prev').click();
    assert.equal(eps()[0], '1');
    assert.ok(q('.panel .range-prev').disabled);
    // Нажатие на сотню открывает сетку всех сотен, выбор закрывает её
    q('.panel .range-now').click();
    const cells = [...sh.querySelectorAll('.panel .range-grid button')];
    assert.deepEqual(cells.map(c => c.textContent), ['1–100', '101–200', '201–250']);
    assert.ok(cells[0].classList.contains('on'));
    cells[2].click();
    assert.equal(q('.panel .range-grid'), null);
    assert.equal(eps()[0], '201');
    // Номер из другой сотни в поиске переключает сотню
    const input = q('.panel .find-row input');
    input.value = '42';
    input.dispatchEvent(new w.Event('input'));
    assert.equal(q('.panel .range-now').textContent.trim(), '1–100');
    shell.destroy();
});
