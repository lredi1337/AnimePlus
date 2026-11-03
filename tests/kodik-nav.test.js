// Переключение серий внутри Kodik (content-player.js). Скрипт работает только в iframe, поэтому запускается
// во вложенном окне jsdom. Разметка панели снята с живого kodikplayer.com (сокращена):
// три одинаковых выпадающих списка — сезоны, серии, озвучки.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const dropdown = (items, selected) => `<div class="dropdown"><div class="dropdown-content">${items.map(t =>
    `<div class="item${t === selected ? ' selected' : ''}"><div class="inner-item"><span>${t}</span></div></div>`).join('')}</div></div>`;

// seasons — выпадающий список сезонов; total — серий в открытом сезоне.
// Кнопка Kodik на последней серии сезона активна, пока есть следующий сезон, и ведёт в него
function panel(current, { seasons = ['3 сезон'], season = seasons[0], total = 5 } = {}) {
    const series = Array.from({ length: total }, (_, i) => `${i + 1} серия`);
    const hasNextSeason = seasons.indexOf(season) < seasons.length - 1;
    const nextDisabled = current === total && !hasNextSeason;
    const seasonOptions = seasons.map(t => `<option value="${t}"${t === season ? ' selected' : ''}>${t}</option>`).join('');
    const options = series.map((t, i) => `<option value="${i + 1}"${i + 1 === current ? ' selected' : ''}>${t}</option>`).join('');
    return `<div class="serial-panel">
        <div class="serial-seasons-box"><select>${seasonOptions}</select>${dropdown(seasons, season)}</div>
        <div class="serial-series-box"><select>${options}</select>${dropdown(series, `${current} серия`)}</div>
        <div class="serial-translations-box"><select><option value="1">AniDUB</option><option value="2" selected>DEEP</option></select>${dropdown(['AniDUB', 'DEEP'], 'DEEP')}</div>
        <div class="serial-next-button${nextDisabled ? ' disabled' : ''}"></div>
    </div>`;
}

async function startKodik(current, panelOptions) {
    const dom = new JSDOM('<!doctype html><iframe></iframe>', { url: 'https://yummyanime.tv/8522-x.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const frame = dom.window.document.querySelector('iframe').contentWindow;
    frame.document.body.innerHTML = panel(current, panelOptions);

    const toTop = [];
    dom.window.addEventListener('message', (e) => { if (e.data && e.data.type) toTop.push(e.data); });

    frame.chrome = {
        runtime: { id: 'test', getURL: (p) => p, sendMessage() {}, onMessage: { addListener() {} } },
        storage: { local: { get: async () => ({ ag_settings: { auto_select_voice: false } }), set: async () => {} }, onChanged: { addListener() {} } }
    };
    frame.eval(read('config.js'));
    frame.eval(read('modules/shared/sites.js'));

    const clicked = [];
    frame.document.addEventListener('click', (e) => {
        const item = e.target.closest('.item');
        if (item) clicked.push(`${item.closest('[class*="-box"]').className}: ${item.textContent.trim()}`);
        if (e.target.closest('.serial-next-button')) clicked.push('next-button');
    }, true);

    frame.eval(read('modules/player/adapters.js'));
    frame.eval(read('modules/player/skip-memory.js'));
    frame.eval(read('content-player.js'));
    await new Promise(r => setTimeout(r, 150));

    const send = (dir) => frame.dispatchEvent(new frame.MessageEvent('message', {
        data: { type: 'AG_SWITCH_KODIK_EPISODE', dir },
        origin: 'https://yummyanime.tv'
    }));
    return { dom, frame, clicked, toTop, send };
}

test('Kodik: «вперёд» со 2-й серии открывает 3-ю, а не первый пункт сводного списка', async () => {
    const { dom, clicked, send } = await startKodik(2);
    send('next');
    assert.deepEqual(clicked, ['serial-series-box: 3 серия']);
    dom.window.close();
});

test('Kodik: «назад» с 4-й серии открывает 3-ю', async () => {
    const { dom, clicked, send } = await startKodik(4);
    send('prev');
    assert.deepEqual(clicked, ['serial-series-box: 3 серия']);
    dom.window.close();
});

test('Kodik: на последней серии «вперёд» ничего не нажимает', async () => {
    const { dom, clicked, send } = await startKodik(5);
    send('next');
    assert.deepEqual(clicked, []);
    dom.window.close();
});

test('Kodik: на первой серии «назад» не уходит в список сезонов', async () => {
    const { dom, clicked, send } = await startKodik(1);
    send('prev');
    assert.deepEqual(clicked, []);
    dom.window.close();
});

test('Kodik: при загрузке сообщает странице настоящий номер серии, а не «1»', async () => {
    const { dom, toTop } = await startKodik(4);
    const ready = toTop.find(m => m.type === 'AG_PLAYER_READY');
    assert.ok(ready, 'AG_PLAYER_READY отправлен наверх');
    assert.equal(ready.episode, '4');
    dom.window.close();
});

const TWO_SEASONS = { seasons: ['1 сезон', '2 сезон'], total: 10 };

test('Несколько сезонов: «вперёд» в 1-м сезоне переключает серию, а не сезон', async () => {
    const { dom, clicked, send } = await startKodik(3, { ...TWO_SEASONS, season: '1 сезон' });
    send('next');
    assert.deepEqual(clicked, ['serial-series-box: 4 серия']);
    dom.window.close();
});

test('Несколько сезонов: «назад» переключает серию, а не сезон', async () => {
    const { dom, clicked, send } = await startKodik(3, { ...TWO_SEASONS, season: '1 сезон' });
    send('prev');
    assert.deepEqual(clicked, ['serial-series-box: 2 серия']);
    dom.window.close();
});

test('Несколько сезонов: на последней серии сезона «вперёд» не уходит в следующий сезон', async () => {
    const { dom, clicked, send } = await startKodik(10, { ...TWO_SEASONS, season: '1 сезон' });
    send('next');
    assert.deepEqual(clicked, [], 'нативная кнопка Kodik здесь активна и увела бы во 2-й сезон');
    dom.window.close();
});

test('Несколько сезонов: сезон из одной серии — «вперёд» ничего не переключает', async () => {
    const { dom, clicked, send } = await startKodik(1, { seasons: ['1 сезон', '2 сезон'], season: '1 сезон', total: 1 });
    send('next');
    assert.deepEqual(clicked, []);
    dom.window.close();
});

test('Несколько сезонов: последний сезон ведёт себя так же', async () => {
    const { dom, clicked, send } = await startKodik(3, { ...TWO_SEASONS, season: '2 сезон' });
    send('next');
    assert.deepEqual(clicked, ['serial-series-box: 4 серия']);
    dom.window.close();
});
