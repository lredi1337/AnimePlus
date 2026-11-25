// Визуал расширения: шесть стилей в светлой и тёмной теме для окна расширения и страниц расширения
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));

// Окно с look.js и заглушкой chrome.storage; cache — то, что лежит в localStorage с прошлого раза
function openWindow({ settings, cache } = {}) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://ext.test/popup/popup.html', runScripts: 'outside-only' });
    const w = dom.window;
    if (cache !== undefined) w.localStorage.setItem('ag-look', JSON.stringify(cache));
    const store = { ag_settings: settings };
    const listeners = [];
    w.chrome = {
        storage: {
            local: { get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, store[k]])) },
            onChanged: { addListener: (fn) => listeners.push(fn) }
        }
    };
    w.eval(read('modules/shared/look.js'));
    const change = (look) => {
        const oldValue = store.ag_settings;
        store.ag_settings = { ...(oldValue || {}), look };
        for (const fn of listeners) fn({ ag_settings: { oldValue, newValue: store.ag_settings } }, 'local');
    };
    return { w, root: w.document.documentElement, change };
}

const loadLook = () => openWindow().w.AgLook;

test('шесть стилей, «Классический» первый и по умолчанию: тёмный, как сейчас', () => {
    const look = loadLook();
    assert.deepEqual([...look.STYLES.map(s => s.id)], ['classic', 'cinema', 'magazine', 'manga', 'arcade', 'bento']);
    assert.equal(look.STYLES[0].name, 'Классический');
    for (const s of look.STYLES) {
        assert.ok(s.name && s.about, s.id);
        assert.ok(['light', 'dark'].includes(s.native), s.id);
    }
    assert.deepEqual({ ...look.resolve(undefined) }, { style: 'classic', theme: 'dark' });
    assert.deepEqual({ ...look.resolve({}) }, { style: 'classic', theme: 'dark' });
});

test('тема «как задумано» берёт родную тему стиля, выбранная вручную важнее', () => {
    const look = loadLook();
    assert.deepEqual({ ...look.resolve({ style: 'magazine', theme: 'auto' }) }, { style: 'magazine', theme: 'light' });
    assert.deepEqual({ ...look.resolve({ style: 'arcade' }) }, { style: 'arcade', theme: 'dark' });
    assert.deepEqual({ ...look.resolve({ style: 'arcade', theme: 'light' }) }, { style: 'arcade', theme: 'light' });
    assert.deepEqual({ ...look.resolve({ style: 'classic', theme: 'light' }) }, { style: 'classic', theme: 'light' });
});

test('испорченное значение не ломает страницу: неизвестный стиль и тема заменяются на обычные', () => {
    const look = loadLook();
    assert.deepEqual({ ...look.clean({ style: 'neon<script>', theme: 'purple' }) }, { style: 'classic', theme: 'auto' });
    assert.deepEqual({ ...look.clean('manga') }, { style: 'classic', theme: 'auto' });
    assert.deepEqual({ ...look.clean(null) }, { style: 'classic', theme: 'auto' });
});

test('страница сразу берёт запомненный вид, потом сверяется с настройками и следит за ними', async () => {
    const { root, change, w } = openWindow({ settings: { look: { style: 'bento', theme: 'dark' } }, cache: { style: 'manga', theme: 'auto' } });
    // До ответа хранилища — запомненный вид, без мигания классическим
    assert.equal(root.dataset.look, 'manga');
    assert.equal(root.dataset.theme, 'light');
    await tick();
    assert.equal(root.dataset.look, 'bento');
    assert.equal(root.dataset.theme, 'dark');
    assert.deepEqual(JSON.parse(w.localStorage.getItem('ag-look')), { style: 'bento', theme: 'dark' }, 'запомнен на следующий раз');
    // Выбор в настройках перекрашивает открытые страницы без перезагрузки
    change({ style: 'cinema', theme: 'light' });
    assert.equal(root.dataset.look, 'cinema');
    assert.equal(root.dataset.theme, 'light');
});

test('без сохранённого выбора — классический тёмный', async () => {
    const { root } = openWindow({});
    assert.equal(root.dataset.look, 'classic');
    assert.equal(root.dataset.theme, 'dark');
    await tick();
    assert.equal(root.dataset.look, 'classic');
    assert.equal(root.dataset.theme, 'dark');
});

// ---------- looks.css: у каждого стиля обе темы и полный набор переменных ----------
const TOKENS = ['--ap-bg', '--ap-surface', '--ap-raised', '--ap-hover', '--ap-line', '--ap-line-strong', '--ap-text', '--ap-text-2', '--ap-text-3',
    '--ap-accent', '--ap-on-accent', '--ap-success', '--ap-warning', '--ap-danger'];

function blocks() {
    const css = read('modules/shared/looks.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const out = {};
    for (const m of css.matchAll(/\[data-look="([a-z]+)"\]\[data-theme="(light|dark)"\]\s*\{([^}]*)\}/g)) {
        const vars = {};
        for (const d of m[3].matchAll(/(--ap-[a-z0-9-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
        out[`${m[1]}-${m[2]}`] = { ...(out[`${m[1]}-${m[2]}`] || {}), ...vars };
    }
    return out;
}

test('у каждого стиля светлая и тёмная тема с полным набором цветов', () => {
    const all = blocks();
    for (const s of loadLook().STYLES) {
        for (const t of ['light', 'dark']) {
            const vars = all[`${s.id}-${t}`];
            assert.ok(vars, `${s.id} ${t}: нет набора`);
            for (const name of TOKENS) assert.ok(vars[name], `${s.id} ${t}: нет ${name}`);
        }
    }
});

test('классический тёмный совпадает с нынешним видом (tokens.css)', () => {
    const base = {};
    for (const d of read('modules/shared/tokens.css').matchAll(/(--ap-[a-z0-9-]+)\s*:\s*([^;]+);/g)) base[d[1]] = d[2].trim();
    const dark = blocks()['classic-dark'];
    for (const name of TOKENS) assert.equal(dark[name], base[name], name);
});

// Контраст по WCAG: текст читается на карточке и на фоне в каждом стиле и теме
const lum = (hex) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h.slice(0, 6);
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
};

test('текст читается: основной, второй и третий на фоне, карточке и приподнятом элементе', () => {
    for (const [id, v] of Object.entries(blocks())) {
        for (const text of ['--ap-text', '--ap-text-2', '--ap-text-3']) {
            for (const bg of ['--ap-bg', '--ap-surface', '--ap-raised']) {
                const c = contrast(v[text], v[bg]);
                assert.ok(c >= 4.5, `${id}: ${text} на ${bg} — ${c.toFixed(2)}`);
            }
        }
        const onAccent = contrast(v['--ap-on-accent'], v['--ap-accent']);
        assert.ok(onAccent >= 3, `${id}: надпись на кнопке — ${onAccent.toFixed(2)}`);
        const accent = contrast(v['--ap-accent'], v['--ap-surface']);
        assert.ok(accent >= 3, `${id}: акцент на карточке — ${accent.toFixed(2)}`);
    }
});

test('визуал подключён на всех страницах расширения до их скриптов', () => {
    for (const page of ['popup/popup.html', 'options/options.html', 'random/random.html', 'top/top.html', 'top/frame.html', 'schedule/schedule.html', 'schedule/frame.html', 'pick/pick.html']) {
        const html = read(page);
        const head = html.slice(0, html.indexOf('</head>'));
        const tokens = head.indexOf('modules/shared/tokens.css');
        const looks = head.indexOf('modules/shared/looks.css');
        assert.ok(looks > tokens && tokens > 0, `${page}: looks.css после tokens.css`);
        const scripts = [...head.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
        assert.equal(scripts[0], '../modules/shared/look.js', `${page}: look.js первым, чтобы страница не мигнула другим видом`);
    }
});

test('в настройках по умолчанию классический вид', () => {
    const ctx = { window: {} };
    new Function('window', read('config.js').replace(/^\(async function \(\) \{/, '(function () {'))(ctx.window);
    assert.deepEqual(ctx.window.DEFAULT_SETTINGS.look, { style: 'classic', theme: 'auto' });
});
