// modules/player/shell-view.js
// Вёрстка оболочки плеера: значки, стили и разметка. Логика в modules/player/shell.js

(function (root) {
    'use strict';

    // Ручной пропуск: обычная длина опенинга или эндинга
    const MANUAL_SKIP_SEC = 89;

    const ICON = {
        play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
        pause: '<path d="M7 5h4v14H7zM14 5h4v14h-4z" fill="currentColor" stroke="none"/>',
        chevronLeft: '<path d="m15 6-6 6 6 6"/>',
        chevronRight: '<path d="m9 6 6 6-6 6"/>',
        prev: '<path d="M20 5v14l-12-7zM5 5v14"/>',
        next: '<path d="M4 5v14l12-7zM19 5v14"/>',
        back5: '<path d="M4 12a8 8 0 1 0 3-6.2M7 2v4h4"/><text x="12" y="16" font-size="8" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial">5</text>',
        fwd5: '<path d="M20 12a8 8 0 1 1-3-6.2M17 2v4h-4"/><text x="12" y="16" font-size="8" text-anchor="middle" fill="currentColor" stroke="none" font-family="Arial">5</text>',
        vol: '<path d="M4 9v6h4l5 4V5L8 9zM17 9a4 4 0 0 1 0 6"/>',
        mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6"/>',
        list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
        screen: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M10.5 8v5l4-2.5z"/>',
        mic: '<path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/>',
        gear: '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>',
        full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        unfull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
        pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" fill="currentColor" stroke="none"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
        check: '<path d="M5 12l5 5 9-10"/>',
        skip: '<path d="M6 6l6 6-6 6M13 6l6 6-6 6"/>'
    };
    const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

    // Темы оформления: выбираются на странице настроек (options/options.html), хранятся в ag_settings.playerSkin.
    // Первая — нынешний вид и значение по умолчанию. Остальные меняют только стили: разметка и кнопки те же.
    // preset — значения конструктора, из которых «Изменить копию» собирает похожую своя тему
    const SKINS = [
        { id: 'compact', name: 'Классика', tag: 'Нынешний вид Anime+', preset: {} },
        { id: 'minimal', name: 'Тихий', tag: 'Тонкие линии, без подложек', preset: { accent: '#ffffff', big: 'ring', panelColor: '#06070a', panelAlpha: 0.92, radius: 0, rail: 2, scrim: 0.7 } },
        { id: 'glass', name: 'Стекло', tag: 'Парящие панели с размытием', preset: { bar: 'floating', center: 'circles', panel: 'floating', accent: '#ff7d8e', barColor: '#ffffff', barAlpha: 0.12, panelColor: '#181824', panelAlpha: 0.45, blur: true, radius: 12, rail: 5, scrim: 0.45 } },
        { id: 'cinema', name: 'Кино', tag: 'Название внизу, капсула по центру', preset: { bar: 'capsule', title: 'bottom', big: 'ring', font: 'serif', accent: '#f4b24e', barColor: '#120f0c', barAlpha: 0.74, panelColor: '#0a0a0a', panelAlpha: 0.62, blur: true, radius: 10, rail: 3 } },
        { id: 'islands', name: 'Острова', tag: 'Каждая группа на своей плашке', preset: { bar: 'plates', title: 'card', center: 'plate', panel: 'floating', big: 'accent', accent: '#2dd4bf', barColor: '#0e0e10', barAlpha: 0.8, panelColor: '#0c0c0e', panelAlpha: 0.84, radius: 12, rail: 6, thumb: 'always', scrim: 0.4 } }
    ];

    // ---------- Конструктор своих тем ----------
    // Каждая часть оболочки настраивается отдельно и сочетается с любой другой. Хранится в ag_settings.custom_skins
    // как { id, name, values }, выбирается как playerSkin = id. Своего CSS нет: только проверенные значения
    const CUSTOM_MAX = 12;
    // Кнопки нижней панели в порядке разметки: id, подпись в редакторе, можно ли спрятать.
    // «Настройки» не прячутся: там качество, скорость и автопропуск
    const BAR_ITEMS = [
        { id: 'skip', name: '+89', hide: true },
        { id: 'clock', name: 'Время', hide: true },
        { id: 'gap', name: 'Пустое место', hide: false },
        { id: 'vol', name: 'Звук', hide: true },
        { id: 'episodes', name: 'Серии', hide: true },
        { id: 'voices', name: 'Озвучка', hide: true },
        { id: 'players', name: 'Плеер', hide: true },
        { id: 'settings', name: 'Настройки', hide: false },
        { id: 'full', name: 'Весь экран', hide: true }
    ];
    // «Картинка в картинке» живёт не на нижней панели, но её тоже можно спрятать
    const HIDEABLE = [...BAR_ITEMS.filter(x => x.hide).map(x => x.id), 'pip'];
    const choice = (...options) => ({ type: 'choice', options });
    const KNOBS = {
        bar: choice('full', 'edge', 'floating', 'capsule', 'plates'),
        title: choice('top', 'card', 'bottom', 'hidden'),
        center: choice('plain', 'circles', 'plate', 'big'),
        panel: choice('flush', 'floating'),
        size: choice('small', 'normal', 'large'),
        labels: { type: 'bool' },
        thumb: choice('hover', 'always'),
        big: choice('light', 'accent', 'ring', 'glass'),
        font: choice('system', 'serif', 'mono', 'wide'),
        accent: { type: 'color' },
        text: { type: 'color' },
        barColor: { type: 'color' },
        barAlpha: { type: 'number', min: 0, max: 1 },
        panelColor: { type: 'color' },
        panelAlpha: { type: 'number', min: 0.3, max: 1 },
        blur: { type: 'bool' },
        scrim: { type: 'number', min: 0, max: 1 },
        radius: { type: 'number', min: 0, max: 24 },
        rail: { type: 'number', min: 2, max: 8 },
        order: { type: 'order' },
        hide: { type: 'hide' }
    };
    // «С нуля» — это вид «Классики»
    const DEFAULTS = {
        bar: 'full', title: 'top', center: 'plain', panel: 'flush', size: 'normal', labels: true, thumb: 'hover', big: 'light', font: 'system',
        accent: '#ef4444', text: '#ffffff', barColor: '#101319', barAlpha: 0.9, panelColor: '#101319', panelAlpha: 1, blur: false, scrim: 1,
        radius: 7, rail: 4, order: BAR_ITEMS.map(x => x.id), hide: []
    };
    const HEX = /^#[0-9a-f]{6}$/i;

    /** Значения конструктора в проверенном виде: битое и чужое заменяется значением по умолчанию */
    function cleanValues(src) {
        const v = src && typeof src === 'object' ? src : {};
        const out = {};
        for (const [key, knob] of Object.entries(KNOBS)) {
            const x = v[key];
            let ok = false;
            if (knob.type === 'color') ok = typeof x === 'string' && HEX.test(x);
            else if (knob.type === 'number') ok = typeof x === 'number' && Number.isFinite(x);
            else if (knob.type === 'bool') ok = typeof x === 'boolean';
            else if (knob.type === 'choice') ok = knob.options.includes(x);
            else if (knob.type === 'order') ok = Array.isArray(x) && x.length === BAR_ITEMS.length && BAR_ITEMS.every(i => x.includes(i.id));
            else if (knob.type === 'hide') ok = Array.isArray(x) && x.every(id => HIDEABLE.includes(id));
            if (!ok) out[key] = Array.isArray(DEFAULTS[key]) ? [...DEFAULTS[key]] : DEFAULTS[key];
            else if (knob.type === 'number') out[key] = Math.min(knob.max, Math.max(knob.min, x));
            else if (knob.type === 'color') out[key] = x.toLowerCase();
            else if (knob.type === 'hide') out[key] = [...new Set(x)];
            else out[key] = Array.isArray(x) ? [...x] : x;
        }
        return out;
    }

    /** Своя тема в проверенном виде или null */
    function cleanCustom(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(raw.name || '').trim().slice(0, 30) || 'Моя тема';
        return { id: String(raw.id || '').slice(0, 40), name, values: cleanValues(raw.values) };
    }

    /** Значения конструктора, из которых получается встроенная тема: основа для «Изменить копию» */
    const presetOf = (id) => cleanValues({ ...DEFAULTS, ...((SKINS.find(s => s.id === id) || SKINS[0]).preset) });

    const rgba = (hex, alpha) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${Math.round(alpha * 100) / 100})`;
    // Текст поверх акцента: тёмный на светлом, белый на тёмном
    const onColor = (hex) => {
        const lin = (i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5) > 0.36 ? '#111111' : '#ffffff';
    };
    const FONTS = {
        system: null,
        serif: 'Georgia, "Times New Roman", serif',
        mono: '"Cascadia Mono", Consolas, "Courier New", monospace',
        wide: 'Verdana, Tahoma, sans-serif'
    };

    /** Переменные оболочки для своей темы. Расположение частей задают атрибуты (layoutOf), цвета и формы — эти переменные */
    function customVars(raw) {
        const v = cleanValues(raw && raw.values !== undefined ? raw.values : raw);
        const a = v.accent;
        const on = onColor(a);
        const r = v.radius;
        const panelSolid = rgba(v.panelColor, Math.max(v.panelAlpha, 0.9));
        const blur = v.blur;
        const out = {
            '--text': v.text, '--dim': rgba(v.text, 0.75), '--muted': rgba(v.text, 0.55),
            '--scrim-top': `linear-gradient(${rgba('#000000', 0.72 * v.scrim)}, transparent)`,
            '--scrim-bottom': `linear-gradient(transparent, ${rgba('#000000', 0.85 * v.scrim)})`,
            // Акцент
            '--rail-done': a, '--ep-now-bg': a, '--ep-now-fg': on, '--chip-on-bg': a, '--chip-on-fg': on, '--sw-on': a, '--sw-knob-on': on,
            '--skip-bg': a, '--skip-fg': on, '--go-bg': a, '--go-fg': on, '--go-border': '0', '--spot': a, '--vol-fill': a, '--focus': a, '--seen': rgba(a, 0.6),
            '--btn-hover-bg': rgba(a, 0.14), '--btn-on-bg': rgba(a, 0.22), '--btn-hover-fg': v.text, '--close-hover': rgba(a, 0.14),
            '--row-on-bg': rgba(a, 0.16), '--row-on-fg': v.text, '--thumb-shadow': `0 0 0 4px ${rgba(a, 0.3)}`,
            '--jump-bg': rgba(a, 0.18), '--jump-hover': rgba(a, 0.28), '--jump-fg': v.text, '--jump-hover-fg': v.text,
            // Нижняя панель и плашки
            '--bar-bg': rgba(v.barColor, v.barAlpha), '--island': rgba(v.barColor, Math.max(v.barAlpha, 0.6)),
            '--bar-blur': blur ? 'blur(20px) saturate(1.4)' : 'none', '--bar-radius': `${r + 10}px`,
            // Боковые панели и всплывающее
            '--panel-bg': rgba(v.panelColor, v.panelAlpha), '--tip-bg': panelSolid, '--note-bg': panelSolid, '--undo-bg': panelSolid, '--guide-bg': panelSolid,
            '--panel-blur': blur ? 'blur(22px) saturate(1.2)' : 'none', '--tip-blur': blur ? 'blur(16px)' : 'none', '--guide-blur': blur ? 'blur(16px)' : 'none',
            // Размытие за кнопками центра только у кружков: у прозрачных кнопок оно размывает видео квадратом
            '--ctrl-blur': blur && v.center === 'circles' ? 'blur(14px)' : 'none', '--note-fg': v.text, '--undo-fg': v.text,
            // Форма
            '--field-radius': `${r}px`, '--ep-radius': `${r}px`, '--row-radius': `${r}px`, '--jump-radius': `${r}px`, '--skip-radius': `${r}px`,
            '--tip-radius': `${r}px`, '--note-radius': `${r}px`, '--guide-radius': `${r + 4}px`, '--go-radius': `${r}px`, '--btn-radius': `${r}px`,
            '--chip-radius': r >= 16 ? '999px' : `${r}px`, '--pip-radius': `${r}px`, '--plate-radius': `${r + 6}px`,
            '--rail-h': `${v.rail}px`, '--rail-h-hover': `${v.rail + 2}px`, '--rail-radius': r ? '99px' : '0px'
        };
        if (v.big === 'light') Object.assign(out, { '--big-bg': '#ffffff', '--big-fg': '#111111', '--big-border': '0' });
        if (v.big === 'accent') Object.assign(out, { '--big-bg': a, '--big-fg': on, '--big-border': '0' });
        if (v.big === 'ring') Object.assign(out, { '--big-bg': 'transparent', '--big-fg': v.text, '--big-border': `1.5px solid ${rgba(v.text, 0.85)}` });
        if (v.big === 'glass') Object.assign(out, { '--big-bg': rgba('#ffffff', 0.16), '--big-fg': v.text, '--big-border': `1px solid ${rgba('#ffffff', 0.3)}` });
        out['--big-radius'] = r >= 16 ? '50%' : `${r + 6}px`;
        if (FONTS[v.font]) Object.assign(out, { '--font': FONTS[v.font], '--title-font': FONTS[v.font] });
        v.order.forEach((id, i) => { out[`--ord-${id}`] = String(i); });
        return out;
    }

    /** Расположение частей своей темы: атрибуты на корне оболочки */
    function layoutOf(raw) {
        const v = cleanValues(raw && raw.values !== undefined ? raw.values : raw);
        return { bar: v.bar, title: v.title, center: v.center, panel: v.panel, size: v.size, labels: v.labels ? 'on' : 'off', thumb: v.thumb, hide: v.hide.join(' ') };
    }
    /** Красит ли что-нибудь цвет подложки: нижняя панель с подложкой, плашка названия или центра */
    function barColorUsed(raw) {
        const v = cleanValues(raw && raw.values !== undefined ? raw.values : raw);
        return v.bar !== 'full' || v.title === 'card' || v.center === 'plate';
    }
    const LAYOUT_ATTRS =['bar', 'title', 'center', 'panel', 'size', 'labels', 'thumb', 'hide'];

    /** Ставит тему из настроек на корень оболочки: встроенную или свою (атрибуты и переменные). Прежние значения снимаются */
    function paintSkin(rootEl, settings) {
        const s = settings || {};
        const raw = Array.isArray(s.custom_skins) ? s.custom_skins.find(x => x && x.id === s.playerSkin) : null;
        const custom = raw ? cleanCustom(raw) : null;
        const id = custom ? 'custom' : (SKINS.some(x => x.id === s.playerSkin) ? s.playerSkin : SKINS[0].id);
        const vars = custom ? customVars(custom) : {};
        const layout = custom ? layoutOf(custom) : {};
        const key = id + JSON.stringify(vars) + JSON.stringify(layout);
        if (rootEl.dataset.paint === key) return false;
        for (const name of (rootEl.dataset.vars || '').split(',').filter(Boolean)) rootEl.style.removeProperty(name);
        for (const [name, value] of Object.entries(vars)) rootEl.style.setProperty(name, value);
        for (const attr of LAYOUT_ATTRS) {
            if (layout[attr] === undefined) delete rootEl.dataset[attr];
            else rootEl.dataset[attr] = layout[attr];
        }
        rootEl.dataset.vars = Object.keys(vars).join(',');
        rootEl.dataset.skin = id;
        rootEl.dataset.paint = key;
        return true;
    }

    const STYLE = `
        :host { all: initial; }
        * { box-sizing: border-box; }
        /* Значения по умолчанию — нынешний вид («Классика»). Темы ниже меняют только эти переменные и пару правил */
        .root {
            --font: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
            --title-font: var(--font);
            --text: #fff; --dim: rgba(255,255,255,.75); --muted: rgba(255,255,255,.55); --text-shadow: 0 1px 3px rgba(0,0,0,.5);
            --scrim-top: linear-gradient(rgba(0,0,0,.72), transparent); --scrim-bottom: linear-gradient(transparent, rgba(0,0,0,.85));
            --bottom-x: 24px; --bottom-y: 12px; --bottom-bg: none; --bottom-border: 0; --bottom-radius: 0; --bottom-blur: none; --bottom-shadow: none; --bottom-pad: 0;
            --bar-gap: 16px; --btn-pad: 0; --btn-radius: 6px; --btn-hover-bg: transparent; --btn-hover-fg: inherit; --btn-on-bg: transparent;
            --rail-h: 4px; --rail-h-hover: 6px; --rail-bg: rgba(255,255,255,.28); --rail-buffer: rgba(255,255,255,.3); --rail-zone: rgba(255,255,255,.55); --rail-done: #ef4444; --rail-radius: 2px; --rail-glow: none;
            --thumb-bg: #fff; --thumb-radius: 50%; --thumb-shadow: none; --thumb-scale: .75;
            --center-gap: 28px; --center-icon: 30px; --ctrl-size: auto; --ctrl-bg: transparent; --ctrl-border: 0; --ctrl-radius: 0; --ctrl-blur: none;
            --big: 68px; --big-bg: #fff; --big-fg: #111; --big-radius: 50%; --big-border: 0; --big-shadow: none;
            --jump-bg: rgba(255,255,255,.14); --jump-hover: rgba(255,255,255,.24); --jump-fg: inherit; --jump-hover-fg: inherit; --jump-border: 0; --jump-radius: 7px;
            --vol-bg: rgba(255,255,255,.3);
            --panel-w: clamp(280px, 40cqw, 420px); --panel-inset: 0px; --panel-bg: #101319; --panel-border: 0; --panel-radius: 0; --panel-blur: none; --panel-shadow: none;
            --field-bg: rgba(255,255,255,.08); --field-border: 0; --field-radius: 7px;
            --chip-bg: rgba(255,255,255,.09); --chip-hover: rgba(255,255,255,.16); --chip-border: 0; --chip-on-bg: #fff; --chip-on-fg: #111; --chip-on-border: 0; --chip-radius: 999px;
            --ep-bg: rgba(255,255,255,.08); --ep-hover: rgba(255,255,255,.16); --ep-border: 0; --ep-radius: 7px; --ep-now-bg: #ef4444; --ep-now-fg: #fff; --seen: rgba(255,255,255,.45);
            --row-hover: rgba(255,255,255,.09); --row-on-bg: rgba(255,255,255,.12); --row-on-fg: inherit; --row-radius: 7px;
            --sw-bg: rgba(255,255,255,.25); --sw-on: #fff; --sw-knob: #fff; --sw-knob-on: #111;
            --tip-bg: #101319; --tip-border: 0; --tip-radius: 8px; --tip-blur: none; --pic-radius: 5px;
            --note-bg: rgba(16,19,25,.9); --note-fg: inherit; --note-border: 0; --note-radius: 8px; --note-blur: none;
            --spin: #fff;
            --skip-y: 76px; --skip-right: 24px; --skip-bg: #fff; --skip-fg: #111; --skip-border: 0; --skip-radius: 7px; --skip-shadow: none;
            --undo-bg: #101319; --undo-fg: #fff; --undo-border: 0; --undo-blur: none;
            --focus: #fff; --vol-fill: #fff; --close-hover: transparent;
            --pip-size: auto; --pip-bg: transparent; --pip-border: 0; --pip-radius: 6px; --pip-blur: none;
            --guide-bg: #1f242e; --guide-border: 1px solid rgba(255,255,255,.22); --guide-radius: 14px; --guide-blur: none;
            --go-bg: #ef4444; --go-fg: #fff; --go-border: 0; --go-radius: 6px; --spot: #ef4444;
            position: fixed; inset: 0; color: var(--text); font: 13px/1.3 var(--font); user-select: none; -webkit-user-select: none; overflow: hidden;
        }
        button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: inherit; font: inherit; }
        button:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 6px; }
        svg { width: 22px; height: 22px; display: block; flex: none; }
        .surface { position: absolute; inset: 0; }
        .idle .surface { cursor: none; }
        .chrome { position: absolute; inset: 0; pointer-events: none; transition: opacity .2s; }
        .idle .chrome { opacity: 0; }
        .idle .chrome * { pointer-events: none !important; }
        .scrim-top, .scrim-bottom { position: absolute; left: 0; right: 0; }
        .scrim-top { top: 0; height: 120px; background: var(--scrim-top); }
        .scrim-bottom { bottom: 0; height: 170px; background: var(--scrim-bottom); }
        .head { position: absolute; left: 24px; top: 18px; right: 90px; }
        .title { font-family: var(--title-font); font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: var(--text-shadow); }
        .sub { margin-top: 3px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: var(--text-shadow); }
        .player-name { margin-top: 2px; font-size: 12px; color: var(--muted); white-space: nowrap; }
        .pip { position: absolute; right: 20px; top: 18px; pointer-events: auto; opacity: .9; width: var(--pip-size); height: var(--pip-size); background: var(--pip-bg); border: var(--pip-border); border-radius: var(--pip-radius); backdrop-filter: var(--pip-blur); -webkit-backdrop-filter: var(--pip-blur); }
        .center { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: var(--center-gap); }
        .center button { pointer-events: auto; opacity: .92; width: var(--ctrl-size); height: var(--ctrl-size); background: var(--ctrl-bg); border: var(--ctrl-border); border-radius: var(--ctrl-radius); backdrop-filter: var(--ctrl-blur); -webkit-backdrop-filter: var(--ctrl-blur); transition: transform .12s, opacity .12s; }
        .center button:hover { opacity: 1; transform: scale(1.1); }
        .center svg { width: var(--center-icon); height: var(--center-icon); }
        .center .big { width: var(--big); height: var(--big); border-radius: var(--big-radius); background: var(--big-bg); color: var(--big-fg); border: var(--big-border); box-shadow: var(--big-shadow); }
        .big svg { width: 32px; height: 32px; }
        .bottom { position: absolute; left: var(--bottom-x); right: var(--bottom-x); bottom: var(--bottom-y); pointer-events: auto; padding: var(--bottom-pad); background: var(--bottom-bg); border: var(--bottom-border); border-radius: var(--bottom-radius); box-shadow: var(--bottom-shadow); backdrop-filter: var(--bottom-blur); -webkit-backdrop-filter: var(--bottom-blur); }
        .track { position: relative; height: 18px; display: flex; align-items: center; cursor: pointer; }
        .rail { position: relative; width: 100%; height: var(--rail-h); border-radius: var(--rail-radius); background: var(--rail-bg); transition: height .1s; }
        .track:hover .rail, .track.drag .rail { height: var(--rail-h-hover); }
        .rail i { position: absolute; top: 0; bottom: 0; left: 0; display: block; border-radius: var(--rail-radius); }
        .buffer { background: var(--rail-buffer); }
        .zone { background: var(--rail-zone); }
        .done { background: var(--rail-done); box-shadow: var(--rail-glow); }
        .thumb { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: var(--thumb-radius); background: var(--thumb-bg); box-shadow: var(--thumb-shadow); transform: scale(var(--thumb-scale)); transition: transform .1s; }
        .track:hover .thumb, .track.drag .thumb { transform: scale(1); }
        .tip { position: absolute; bottom: 24px; transform: translateX(-50%); padding: 5px; border-radius: var(--tip-radius); background: var(--tip-bg); border: var(--tip-border); backdrop-filter: var(--tip-blur); -webkit-backdrop-filter: var(--tip-blur); text-align: center; white-space: nowrap; display: none; pointer-events: none; }
        .tip.on { display: block; }
        .tip .pic { display: none; width: 160px; height: 90px; border-radius: var(--pic-radius); background-repeat: no-repeat; margin-bottom: 4px; }
        .tip .name { font-weight: 600; padding: 0 4px; }
        .tip .time { color: rgba(255,255,255,.8); padding: 0 4px; }
        .bar { display: flex; align-items: center; gap: var(--bar-gap); height: 36px; }
        .bar button { opacity: .92; padding: var(--btn-pad); border-radius: var(--btn-radius); min-height: 30px; transition: background .12s, color .12s; }
        .bar button:hover { opacity: 1; background: var(--btn-hover-bg); color: var(--btn-hover-fg); }
        .bar button[aria-expanded="true"] { background: var(--btn-on-bg); }
        .clock { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .clock span { color: var(--muted); }
        .bar .jump { height: 28px; min-height: 28px; padding: 0 10px 0 6px; gap: 2px; border-radius: var(--jump-radius); background: var(--jump-bg); color: var(--jump-fg); border: var(--jump-border); font-weight: 600; font-variant-numeric: tabular-nums; }
        .bar .jump:hover { background: var(--jump-hover); color: var(--jump-hover-fg); }
        .jump svg { width: 18px; height: 18px; }
        .gap { flex: 1; }
        .label { font-weight: 500; }
        .vol { display: flex; align-items: center; gap: 8px; }
        .slider { width: 0; overflow: hidden; transition: width .15s; display: flex; align-items: center; height: 24px; cursor: pointer; }
        .vol:hover .slider, .vol:focus-within .slider { width: 76px; }
        .slider div { position: relative; width: 72px; height: 4px; margin-left: 2px; border-radius: var(--rail-radius); background: var(--vol-bg); }
        .slider i { position: absolute; left: 0; top: 0; bottom: 0; display: block; border-radius: inherit; background: var(--vol-fill); }
        .panel { position: absolute; top: var(--panel-inset); right: var(--panel-inset); bottom: var(--panel-inset); width: var(--panel-w); background: var(--panel-bg); border: var(--panel-border); border-radius: var(--panel-radius); box-shadow: var(--panel-shadow); backdrop-filter: var(--panel-blur); -webkit-backdrop-filter: var(--panel-blur); padding: 18px; display: none; flex-direction: column; pointer-events: auto; }
        .panel.on { display: flex; }
        .with-panel .chrome { right: calc(var(--panel-w) + var(--panel-inset)); }
        /* Затемнение кадра остаётся на всю ширину: иначе оно обрывается у панели, и в зазоре и скруглённых углах виден шов */
        .with-panel .scrim-top, .with-panel .scrim-bottom { right: calc(-1 * (var(--panel-w) + var(--panel-inset))); }
        .with-panel .note { left: calc((100% - var(--panel-w) - var(--panel-inset)) / 2); }
        .panel h3 { all: unset; display: flex; align-items: center; justify-content: space-between; font-size: 16px; font-weight: 600; margin-bottom: 14px; }
        .panel h3 button { padding: 4px; margin: -4px; border-radius: var(--btn-radius); transition: background .12s; }
        .panel h3 button:hover { background: var(--close-hover); }
        .field { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; margin-bottom: 12px; border-radius: var(--field-radius); background: var(--field-bg); border: var(--field-border); color: rgba(255,255,255,.7); flex: none; }
        .field svg { width: 16px; height: 16px; }
        .find-row { display: flex; gap: 8px; margin-bottom: 12px; flex: none; }
        .find-row .field { flex: 1; min-width: 0; margin-bottom: 0; }
        .range-step { display: flex; align-items: center; height: 36px; border-radius: var(--field-radius); background: var(--field-bg); border: var(--field-border); flex: none; }
        .range-step button { height: 36px; padding: 0 7px; opacity: .85; }
        .range-step button:hover:not(:disabled) { opacity: 1; }
        .range-step button:disabled { opacity: .25; cursor: default; }
        .range-step svg { width: 16px; height: 16px; }
        .range-now { font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .range-now::after { content: '▾'; margin-left: 5px; font-size: 11px; opacity: .6; }
        .range-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 6px; margin: -6px 0 12px; border-radius: 8px; background: rgba(255,255,255,.05); flex: none; }
        .range-grid button { padding: 7px 4px; border-radius: 6px; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .range-grid button:hover { background: var(--ep-hover); }
        .range-grid button.on { background: var(--chip-on-bg); color: var(--chip-on-fg); font-weight: 600; }
        .field input { all: unset; flex: 1; min-width: 0; color: var(--text); user-select: text; -webkit-user-select: text; }
        .chips { display: flex; gap: 6px; margin-bottom: 12px; overflow-x: auto; flex: none; scrollbar-width: none; padding-bottom: 1px; }
        .chips::-webkit-scrollbar { display: none; }
        .chip { padding: 6px 12px; border-radius: var(--chip-radius); background: var(--chip-bg); border: var(--chip-border); white-space: nowrap; flex: none; }
        .chip:hover { background: var(--chip-hover); }
        .chip.on { background: var(--chip-on-bg); color: var(--chip-on-fg); border: var(--chip-on-border); font-weight: 600; }
        .scroll { position: relative; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent; margin-right: -8px; padding-right: 8px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); gap: 6px; }
        .ep { position: relative; height: 38px; border-radius: var(--ep-radius); background: var(--ep-bg); border: var(--ep-border); font-variant-numeric: tabular-nums; }
        .ep:hover { background: var(--ep-hover); }
        .ep.seen { color: var(--muted); }
        .ep.seen::after { content: ""; position: absolute; left: 7px; right: 7px; bottom: 4px; height: 2px; border-radius: 1px; background: var(--seen); }
        .ep.now { background: var(--ep-now-bg); color: var(--ep-now-fg); font-weight: 600; }
        .row { display: flex; width: 100%; align-items: center; gap: 8px; padding: 9px 8px; border-radius: var(--row-radius); justify-content: flex-start; min-height: 38px; }
        button.row:hover { background: var(--row-hover); }
        .row.on { background: var(--row-on-bg); color: var(--row-on-fg); font-weight: 600; }
        .row svg { width: 16px; height: 16px; }
        .row .mark { width: 16px; flex: none; }
        .row .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .meta { color: var(--muted); font-weight: 400; white-space: nowrap; }
        .cap { color: var(--muted); font-size: 12px; margin: 14px 8px 4px; }
        .none { color: var(--muted); padding: 16px 8px; }
        .sw { width: 32px; height: 18px; border-radius: 999px; background: var(--sw-bg); position: relative; flex: none; }
        .sw::after { content: ""; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: var(--sw-knob); transition: left .12s; }
        .row[role="switch"].on { background: none; font-weight: 400; color: inherit; }
        button.row[role="switch"]:hover { background: var(--row-hover); }
        .on > .sw { background: var(--sw-on); }
        .on > .sw::after { left: 16px; background: var(--sw-knob-on); }
        .note { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); padding: 8px 16px; border-radius: var(--note-radius); background: var(--note-bg); color: var(--note-fg); border: var(--note-border); backdrop-filter: var(--note-blur); -webkit-backdrop-filter: var(--note-blur); font-size: 15px; font-weight: 600; opacity: 0; transition: opacity .15s; pointer-events: none; }
        .note.on { opacity: 1; }
        /* «Пропустить» и «Вернуться»: показывает и прячет логика пропуска (content-player.js), вид даёт тема */
        #ag-smart-skip, #ag-skip-undo { display: none; position: absolute; right: var(--skip-right); bottom: var(--skip-y); z-index: 3; padding: 10px 18px; font-size: 14px; font-weight: 600; border-radius: var(--skip-radius); pointer-events: auto; transition: right .2s; }
        #ag-smart-skip { background: var(--skip-bg); color: var(--skip-fg); border: var(--skip-border); box-shadow: var(--skip-shadow); }
        #ag-skip-undo { background: var(--undo-bg); color: var(--undo-fg); border: var(--undo-border); backdrop-filter: var(--undo-blur); -webkit-backdrop-filter: var(--undo-blur); }
        .with-panel #ag-smart-skip, .with-panel #ag-skip-undo { right: calc(var(--panel-w) + var(--panel-inset) + 24px); }
        .loading #ag-smart-skip, .loading #ag-skip-undo { display: none !important; }
        .guide { position: absolute; left: 16px; bottom: 84px; display: flex; align-items: flex-end; gap: 8px; width: min(400px, calc(100% - 32px)); padding: 10px 12px 10px 6px; border-radius: var(--guide-radius); background: var(--guide-bg); border: var(--guide-border); backdrop-filter: var(--guide-blur); -webkit-backdrop-filter: var(--guide-blur); box-shadow: 0 16px 48px rgba(0,0,0,.55); pointer-events: auto; }
        .guide[hidden] { display: none; }
        .guide .fox { flex: none; width: 78px; height: 88px; }
        .guide .fox svg { display: block; width: 100%; height: 100%; }
        .guide .body { flex: 1; min-width: 0; }
        .guide p { margin: 0 0 8px; font-size: 14px; line-height: 1.35; }
        .guide .row { display: flex; align-items: center; gap: 10px; }
        .guide .row span { margin-right: auto; font-size: 12px; color: #8f96a6; }
        .guide button { width: auto; height: auto; padding: 5px 10px; border: none; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; color: #b6bcc9; background: none; }
        .guide button[hidden] { display: none; }
        .guide button.go { color: var(--go-fg); font-weight: 600; background: var(--go-bg); border: var(--go-border); border-radius: var(--go-radius); }
        .finale { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 3; width: min(420px, calc(100% - 32px)); padding: 18px 20px; box-sizing: border-box; border-radius: var(--guide-radius); background: var(--guide-bg); border: var(--guide-border); backdrop-filter: var(--guide-blur); -webkit-backdrop-filter: var(--guide-blur); box-shadow: 0 20px 50px rgba(0,0,0,.45); text-align: center; pointer-events: auto; }
        .finale[hidden] { display: none; }
        .finale h3 { margin: 0 0 4px; font-size: 17px; font-weight: 700; }
        .finale p { margin: 0 0 12px; font-size: 13px; line-height: 1.35; color: var(--dim); }
        .finale p[hidden], .finale .stars[hidden], .finale .sequel[hidden] { display: none; }
        .finale .stars { display: flex; justify-content: center; gap: 4px; margin: 0 0 14px; }
        .finale .stars button { width: 30px; height: 30px; padding: 0; border: 1px solid rgba(255,255,255,.16); border-radius: 6px; background: none; color: inherit; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
        .finale .stars button:hover:not(:disabled), .finale .stars button.on { background: var(--go-bg); color: var(--go-fg); border-color: transparent; }
        .finale .stars button:disabled { cursor: default; opacity: .6; }
        .finale .stars button.on:disabled { opacity: 1; }
        .finale .sequel { margin: 0 0 14px; font-size: 13px; color: var(--dim); }
        .finale .sequel b { display: block; margin-top: 2px; font-size: 15px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .finale .row { display: flex; justify-content: center; gap: 10px; }
        .finale .row button { width: auto; height: auto; padding: 7px 14px; border: none; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; color: #b6bcc9; background: none; }
        .finale .row button.go { color: var(--go-fg); font-weight: 600; background: var(--go-bg); border: var(--go-border); border-radius: var(--go-radius); }
        .finale .row button[hidden] { display: none; }
        .guide-spot { outline: 2px solid var(--spot) !important; outline-offset: 3px; border-radius: 6px; }
        .panel .guide-spot { outline-offset: -2px; }
        .spinner { display: none; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid rgba(255,255,255,.25); border-top-color: var(--spin); animation: ag-spin .8s linear infinite; }
        @keyframes ag-spin { to { transform: rotate(360deg); } }
        .loading { background: #000; }
        .loading .spinner { display: block; }
        .loading .center, .loading .bottom, .loading .pip { display: none; }
        .start .jump, .start .chrome .center button:not(.big), .start .bottom .track, .start .vol, .start .clock, .start .pip, .start [data-act="settings"], .start [data-act="full"] { display: none; }
        /* С открытой панелью управлению остаётся около 60% ширины: подписи кнопок не помещаются раньше */
        @container (max-width: 1040px) { .with-panel .label { display: none; } }
        @container (max-width: 620px) { .label { display: none; } .center { gap: 18px; } .head { left: 14px; top: 12px; } .bottom { left: 14px; right: 14px; } }

        /* ---------- Порядок кнопок нижней панели: своя тема задаёт --ord-*, без неё порядок как в разметке ---------- */
        .bar > .jump { order: var(--ord-skip, 0); }
        .bar > .clock { order: var(--ord-clock, 0); }
        .bar > .gap { order: var(--ord-gap, 0); }
        .bar > .vol { order: var(--ord-vol, 0); }
        .bar > [data-act="episodes"] { order: var(--ord-episodes, 0); }
        .bar > [data-act="voices"] { order: var(--ord-voices, 0); }
        .bar > [data-act="players"] { order: var(--ord-players, 0); }
        .bar > [data-act="settings"] { order: var(--ord-settings, 0); }
        .bar > [data-act="full"] { order: var(--ord-full, 0); }

        /* ---------- Конструктор своих тем: каждая часть задаётся атрибутом на корне и сочетается с любой другой ---------- */
        /* Нижняя панель: сплошная полоса у края, парящая, капсула по центру, плашки */
        .root[data-bar="edge"] { --bottom-x: 0px; --bottom-y: 0px; --bottom-bg: var(--bar-bg); --bottom-pad: 0 16px 4px; --bottom-shadow: inset 0 1px 0 rgba(255,255,255,.08); --bottom-blur: var(--bar-blur); --scrim-bottom: none; --skip-y: 72px; }
        .root[data-bar="floating"], .root[data-bar="capsule"] { --bottom-bg: var(--bar-bg); --bottom-border: 1px solid rgba(255,255,255,.14); --bottom-radius: var(--bar-radius); --bottom-blur: var(--bar-blur); --bottom-shadow: 0 10px 40px rgba(0,0,0,.35); --bottom-pad: 4px 16px 6px; --btn-pad: 0 8px; }
        .root[data-bar="floating"] { --bottom-x: 16px; --bottom-y: 14px; --skip-y: 100px; }
        .root[data-bar="capsule"] { --bottom-y: 18px; --bar-gap: 14px; --cap-w: min(calc(100% - 32px), max(780px, 62%)); --skip-y: 96px; --skip-right: max(24px, calc(50% - var(--cap-w) / 2)); }
        .root[data-bar="capsule"] .bottom { left: 50%; right: auto; width: var(--cap-w); transform: translateX(-50%); }
        .root[data-bar="plates"] { --bottom-x: 16px; --bottom-y: 14px; --bar-gap: 8px; --btn-pad: 0 12px; --skip-y: 118px; --title-bottom: 132px; }
        .root[data-bar="plates"] .track { height: 34px; padding: 0 14px; margin-bottom: 8px; background: var(--island); border: 1px solid rgba(255,255,255,.07); border-radius: var(--plate-radius); backdrop-filter: var(--bar-blur); -webkit-backdrop-filter: var(--bar-blur); }
        .root[data-bar="plates"] .tip { bottom: 42px; }
        .root[data-bar="plates"] .bar { height: 44px; }
        .root[data-bar="plates"] .bar > button, .root[data-bar="plates"] .bar > .clock, .root[data-bar="plates"] .bar > .vol { height: 44px; min-height: 44px; background: var(--island); border: 1px solid rgba(255,255,255,.07); border-radius: var(--plate-radius); opacity: 1; backdrop-filter: var(--bar-blur); -webkit-backdrop-filter: var(--bar-blur); }
        .root[data-bar="plates"] .bar > button:hover { background: linear-gradient(var(--btn-hover-bg), var(--btn-hover-bg)), var(--island); }
        .root[data-bar="plates"] .bar > button[aria-expanded="true"] { background: var(--chip-on-bg); color: var(--chip-on-fg); border-color: transparent; }
        .root[data-bar="plates"] .bar > .jump { padding: 0 14px 0 10px; background: linear-gradient(var(--jump-bg), var(--jump-bg)), var(--island); }
        .root[data-bar="plates"] .bar > .jump:hover { background: linear-gradient(var(--jump-hover), var(--jump-hover)), var(--island); }
        .root[data-bar="plates"] .bar > .clock { display: inline-flex; align-items: center; padding: 0 14px; }
        .root[data-bar="plates"] .bar > .vol { padding: 0 8px; }
        .root[data-bar="plates"] .vol > button { min-height: 30px; padding: 0 4px; }
        /* С открытой панелью управлению остаётся около 60% ширины: отступы ужимаются, в небольшом плеере уходит время */
        .root[data-bar="floating"].with-panel, .root[data-bar="capsule"].with-panel { --btn-pad: 0 4px; --bar-gap: 8px; --bottom-pad: 4px 10px 6px; }
        .root[data-bar="plates"].with-panel { --btn-pad: 0 9px; --bar-gap: 6px; }
        .root[data-bar="plates"].with-panel .bar > .clock { display: none; }
        @container (max-width: 900px) {
            .root[data-bar="floating"].with-panel .bar > .clock, .root[data-bar="capsule"].with-panel .bar > .clock { display: none; }
            .root[data-bar="plates"].with-panel { --btn-pad: 0 7px; --bar-gap: 4px; }
        }
        @container (max-width: 620px) { .root[data-bar="plates"] { --btn-pad: 0 9px; --bar-gap: 6px; } }

        /* Название: на плашке, крупно снизу, скрыто */
        .root[data-title="card"] { --text-shadow: none; }
        .root[data-title="card"] .head { left: 16px; top: 14px; right: auto; width: max-content; max-width: calc(100% - 110px); padding: 9px 14px; background: var(--island); border: 1px solid rgba(255,255,255,.07); border-radius: var(--plate-radius); backdrop-filter: var(--bar-blur); -webkit-backdrop-filter: var(--bar-blur); }
        .root[data-title="card"] .title { font-size: 15px; }
        .root[data-title="bottom"] .head { top: auto; bottom: var(--title-bottom, 104px); left: max(16px, calc(50% - var(--cap-w, calc(100% - 48px)) / 2)); right: 34%; }
        .root[data-title="bottom"] .title { font-size: clamp(20px, 3.4cqw, 34px); line-height: 1.12; white-space: normal; }
        .root[data-title="bottom"] .sub { margin-top: 6px; }
        .root[data-title="hidden"] .head { display: none; }
        @container (max-width: 620px) { .root[data-title="bottom"] .head { bottom: calc(var(--title-bottom, 104px) - 12px); right: 24px; } }

        /* Кнопки в центре: круги, на плашке, только большая */
        .root[data-center="circles"] { --ctrl-size: 52px; --ctrl-bg: rgba(255,255,255,.14); --ctrl-border: 1px solid rgba(255,255,255,.24); --ctrl-radius: 50%; --center-icon: 24px; --center-gap: 20px; }
        .root[data-center="plate"] { --ctrl-size: 46px; --ctrl-radius: var(--btn-radius); --center-gap: 6px; --center-icon: 22px; --big: 58px; }
        .root[data-center="plate"] .center { padding: 6px; background: var(--island); border: 1px solid rgba(255,255,255,.07); border-radius: var(--plate-radius); backdrop-filter: var(--bar-blur); -webkit-backdrop-filter: var(--bar-blur); }
        .root[data-center="plate"] .center button:hover { transform: none; background: var(--btn-hover-bg); }
        .root[data-center="plate"] .center .big:hover { background: var(--big-bg); filter: brightness(1.12); }
        .root[data-center="big"] .center button:not(.big) { display: none; }

        /* Боковые панели: парящие, отделены от краёв */
        .root[data-panel="floating"] { --panel-inset: 12px; --panel-radius: var(--plate-radius); --panel-border: 1px solid rgba(255,255,255,.14); --panel-shadow: 0 20px 50px rgba(0,0,0,.45); }

        /* Размер кнопок */
        .root[data-size="small"] { --center-icon: 24px; --big: 54px; --bar-gap: 12px; font-size: 12px; }
        .root[data-size="small"] .bar { height: 30px; }
        .root[data-size="small"] .bar svg { width: 18px; height: 18px; }
        .root[data-size="small"] .big svg { width: 26px; height: 26px; }
        .root[data-size="small"] .bar .jump { height: 24px; min-height: 24px; }
        .root[data-size="small"] .bar .jump svg { width: 15px; height: 15px; }
        .root[data-size="large"] { --center-icon: 36px; --big: 84px; --bar-gap: 20px; font-size: 15px; }
        .root[data-size="large"] .bar { height: 46px; }
        .root[data-size="large"] .bar svg { width: 27px; height: 27px; }
        .root[data-size="large"] .big svg { width: 38px; height: 38px; }
        .root[data-size="large"] .bar .jump { height: 34px; min-height: 34px; }
        .root[data-size="large"] .bar .jump svg { width: 22px; height: 22px; }
        .root[data-size="large"][data-bar="plates"] .bar { height: 52px; }
        .root[data-size="large"][data-bar="plates"] .bar > button, .root[data-size="large"][data-bar="plates"] .bar > .clock, .root[data-size="large"][data-bar="plates"] .bar > .vol { height: 52px; }

        /* Подписи у кнопок, ползунок шкалы, спрятанные кнопки */
        .root[data-labels="off"] .label { display: none; }
        .root[data-thumb="always"] { --thumb-scale: 1; }
        .root[data-hide~="skip"] .bar > .jump, .root[data-hide~="clock"] .bar > .clock, .root[data-hide~="vol"] .bar > .vol,
        .root[data-hide~="episodes"] .bar > [data-act="episodes"], .root[data-hide~="voices"] .bar > [data-act="voices"],
        .root[data-hide~="players"] .bar > [data-act="players"], .root[data-hide~="full"] .bar > [data-act="full"], .root[data-hide~="pip"] .pip { display: none !important; }

        /* ---------- Тихий: тонкие линии и обводки вместо заливок ---------- */
        .root[data-skin="minimal"] {
            --scrim-top: linear-gradient(rgba(0,0,0,.45), transparent); --scrim-bottom: linear-gradient(transparent, rgba(0,0,0,.6));
            --rail-h: 2px; --rail-h-hover: 4px; --rail-bg: rgba(255,255,255,.2); --rail-zone: rgba(255,214,140,.75); --rail-done: #fff; --rail-radius: 0; --thumb-scale: 0;
            --center-icon: 26px; --big: 60px; --big-bg: transparent; --big-fg: #fff; --big-border: 1.5px solid rgba(255,255,255,.85);
            --jump-bg: transparent; --jump-hover: rgba(255,255,255,.1); --jump-border: 1px solid rgba(255,255,255,.4); --jump-radius: 0;
            --panel-bg: rgba(6,7,10,.92);
            --field-bg: transparent; --field-border: 1px solid rgba(255,255,255,.18); --field-radius: 0;
            --chip-bg: transparent; --chip-hover: rgba(255,255,255,.08); --chip-border: 1px solid rgba(255,255,255,.2); --chip-on-bg: transparent; --chip-on-fg: #fff; --chip-on-border: 1px solid #fff; --chip-radius: 0;
            --ep-bg: transparent; --ep-hover: rgba(255,255,255,.08); --ep-border: 1px solid rgba(255,255,255,.12); --ep-radius: 0; --ep-now-bg: #fff; --ep-now-fg: #000;
            --row-on-bg: transparent; --row-radius: 0;
            --tip-bg: rgba(0,0,0,.6); --tip-radius: 0; --pic-radius: 0;
            --note-bg: transparent; --note-radius: 0;
            --skip-bg: rgba(0,0,0,.3); --skip-fg: #fff; --skip-border: 1px solid rgba(255,255,255,.7); --skip-radius: 0; --undo-bg: rgba(0,0,0,.5); --undo-border: 1px solid rgba(255,255,255,.25);
            --focus: #fff; --vol-fill: #fff; --close-hover: rgba(255,255,255,.08); --guide-bg: rgba(6,7,10,.92); --guide-border: 1px solid rgba(255,255,255,.18); --guide-radius: 0; --go-bg: transparent; --go-fg: #fff; --go-border: 1px solid #fff; --go-radius: 0; --spot: #fff;
        }
        .root[data-skin="minimal"] svg { stroke-width: 1.6; }
        .root[data-skin="minimal"] .note { text-shadow: 0 1px 3px rgba(0,0,0,.6); }
        .root[data-skin="minimal"] .panel { border-left: 1px solid rgba(255,255,255,.08); }
        .root[data-skin="minimal"] button.row:not(.on):not([role="switch"]) { color: var(--dim); }

        /* ---------- Стекло: парящие панели с размытием ---------- */
        .root[data-skin="glass"] {
            --scrim-top: linear-gradient(rgba(0,0,0,.4), transparent); --scrim-bottom: linear-gradient(transparent, rgba(0,0,0,.3));
            --bottom-x: 16px; --bottom-y: 14px; --bottom-bg: rgba(255,255,255,.12); --bottom-border: 1px solid rgba(255,255,255,.22); --bottom-radius: 22px;
            --bottom-blur: blur(20px) saturate(1.5); --bottom-shadow: 0 10px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.25); --bottom-pad: 4px 16px 6px;
            --btn-pad: 0 8px; --btn-radius: 99px; --btn-hover-bg: rgba(255,255,255,.14); --btn-on-bg: rgba(255,255,255,.2);
            --rail-h: 5px; --rail-h-hover: 7px; --rail-bg: rgba(255,255,255,.2); --rail-zone: rgba(255,255,255,.5); --rail-done: linear-gradient(90deg, #ffc1cb, #ff7d8e); --rail-radius: 99px;
            --thumb-scale: 1; --thumb-shadow: 0 0 0 4px rgba(255,125,142,.35), 0 2px 8px rgba(0,0,0,.4);
            --ctrl-size: 52px; --ctrl-bg: rgba(255,255,255,.14); --ctrl-border: 1px solid rgba(255,255,255,.24); --ctrl-radius: 50%; --ctrl-blur: blur(14px); --center-icon: 24px; --center-gap: 20px;
            --big: 74px; --big-bg: rgba(255,255,255,.88); --big-fg: #1a1a2a; --big-shadow: 0 8px 30px rgba(0,0,0,.35);
            --jump-bg: rgba(255,255,255,.18); --jump-hover: rgba(255,255,255,.28); --jump-radius: 99px;
            --panel-inset: 12px; --panel-bg: rgba(24,24,36,.45); --panel-border: 1px solid rgba(255,255,255,.2); --panel-radius: 20px; --panel-blur: blur(26px) saturate(1.6); --panel-shadow: 0 20px 60px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.18);
            --field-bg: rgba(255,255,255,.1); --field-radius: 12px;
            --chip-bg: rgba(255,255,255,.12); --chip-hover: rgba(255,255,255,.2); --chip-on-bg: rgba(255,255,255,.9); --chip-on-fg: #1a1a2a;
            --ep-bg: rgba(255,255,255,.1); --ep-hover: rgba(255,255,255,.18); --ep-radius: 12px; --ep-now-bg: linear-gradient(135deg, #ffb0bd, #ff6f84);
            --row-hover: rgba(255,255,255,.1); --row-on-bg: rgba(255,255,255,.2); --row-radius: 12px;
            --sw-on: #ff7d8e; --sw-knob-on: #fff;
            --tip-bg: rgba(20,20,30,.45); --tip-border: 1px solid rgba(255,255,255,.22); --tip-radius: 14px; --tip-blur: blur(16px); --pic-radius: 10px;
            --note-bg: rgba(255,255,255,.16); --note-border: 1px solid rgba(255,255,255,.25); --note-radius: 99px; --note-blur: blur(16px);
            --skip-y: 100px; --skip-bg: rgba(255,255,255,.9); --skip-fg: #1a1a2a; --skip-radius: 99px; --skip-shadow: 0 8px 30px rgba(0,0,0,.35); --undo-bg: rgba(20,20,30,.5); --undo-border: 1px solid rgba(255,255,255,.25); --undo-blur: blur(16px);
            --focus: #ffc1cb; --vol-fill: #ff7d8e; --close-hover: rgba(255,255,255,.14); --pip-size: 40px; --pip-bg: rgba(255,255,255,.14); --pip-border: 1px solid rgba(255,255,255,.24); --pip-radius: 50%; --pip-blur: blur(14px); --guide-bg: rgba(24,24,36,.5); --guide-border: 1px solid rgba(255,255,255,.22); --guide-radius: 20px; --guide-blur: blur(24px) saturate(1.5); --go-bg: rgba(255,255,255,.9); --go-fg: #1a1a2a; --go-radius: 99px; --spot: #ff7d8e;
        }

        /* С открытой панелью капсуле остаётся около 60% ширины: отступы ужимаются, в небольшом плеере уходит время */
        .root[data-skin="glass"].with-panel { --btn-pad: 0 4px; --bar-gap: 8px; --bottom-pad: 4px 10px 6px; }
        @container (max-width: 900px) { .root[data-skin="glass"].with-panel .clock { display: none; } }

        /* ---------- Кино: название внизу, капсула по центру, панели выезжают снизу ---------- */
        .root[data-skin="cinema"] {
            --title-font: Georgia, "Times New Roman", serif;
            --dim: rgba(255,240,220,.78); --muted: rgba(255,240,220,.55);
            --scrim-top: linear-gradient(rgba(0,0,0,.35), transparent 60%); --scrim-bottom: linear-gradient(transparent, rgba(8,6,4,.55) 40%, rgba(8,6,4,.92));
            --bottom-y: 18px; --bottom-bg: rgba(18,15,12,.74); --bottom-border: 1px solid rgba(255,230,200,.12); --bottom-radius: 14px; --bottom-pad: 4px 14px 6px;
            --bar-gap: 14px; --btn-pad: 0 6px; --btn-radius: 8px; --btn-hover-bg: rgba(244,178,78,.14); --btn-hover-fg: #ffd28a; --btn-on-bg: rgba(244,178,78,.22);
            --rail-h: 3px; --rail-h-hover: 6px; --rail-bg: rgba(255,240,220,.18); --rail-buffer: rgba(255,240,220,.26); --rail-zone: rgba(244,178,78,.45); --rail-done: #f4b24e;
            --thumb-bg: #ffd28a; --thumb-shadow: 0 0 0 4px rgba(244,178,78,.25);
            --center-icon: 24px; --center-gap: 22px; --ctrl-size: 44px;
            --big: 64px; --big-bg: rgba(255,240,220,.1); --big-fg: #ffe7c2; --big-border: 1.5px solid rgba(255,231,194,.6);
            --jump-bg: #f4b24e; --jump-hover: #ffc56b; --jump-fg: #1a1208; --jump-hover-fg: #1a1208; --jump-radius: 8px;
            --panel-bg: rgba(10,10,10,.62); --panel-border: 1px solid rgba(255,255,255,.1); --panel-radius: 0; --panel-blur: blur(22px) saturate(1.15);
            --field-bg: rgba(255,240,220,.07); --field-radius: 10px;
            --chip-bg: rgba(255,240,220,.07); --chip-hover: rgba(255,240,220,.13); --chip-on-bg: #f4b24e; --chip-on-fg: #1a1208;
            --ep-bg: rgba(255,240,220,.06); --ep-hover: rgba(255,240,220,.12); --ep-radius: 10px; --ep-now-bg: #f4b24e; --ep-now-fg: #1a1208; --seen: rgba(244,178,78,.55);
            --row-hover: rgba(255,240,220,.07); --row-on-bg: rgba(244,178,78,.14); --row-on-fg: #ffd28a; --row-radius: 10px;
            --sw-on: #f4b24e; --sw-knob-on: #1a1208;
            --tip-bg: rgba(10,10,10,.95); --tip-border: 1px solid rgba(255,230,200,.14); --tip-radius: 10px; --pic-radius: 6px;
            --note-bg: rgba(10,10,10,.85); --note-fg: #ffd28a; --note-radius: 99px;
            --spin: #f4b24e;
            --skip-y: 96px; --skip-right: max(24px, calc(50% - var(--cap-w) / 2)); --skip-bg: #f4b24e; --skip-fg: #1a1208; --skip-radius: 10px; --skip-shadow: 0 10px 30px rgba(0,0,0,.45); --undo-bg: rgba(10,10,10,.9); --undo-fg: #ffe7c2; --undo-border: 1px solid rgba(255,230,200,.18);
            --focus: #f4b24e; --vol-fill: #f4b24e; --close-hover: rgba(244,178,78,.14); --guide-bg: rgba(10,10,10,.88); --guide-border: 1px solid rgba(255,230,200,.16); --guide-radius: 14px; --guide-blur: blur(16px); --go-bg: #f4b24e; --go-fg: #1a1208; --go-radius: 8px; --spot: #f4b24e;
        }
        /* Капсула растёт вместе с кадром: в небольшом плеере почти во всю ширину, на весь экран около 62% */
        .root[data-skin="cinema"] { --cap-w: min(calc(100% - 32px), max(780px, 62%)); }
        .root[data-skin="cinema"] .bottom { left: 50%; right: auto; width: var(--cap-w); transform: translateX(-50%); }
        .root[data-skin="cinema"] .head { top: auto; bottom: 104px; left: max(16px, calc(50% - var(--cap-w) / 2)); right: 34%; }
        .root[data-skin="cinema"] .title { font-size: clamp(20px, 3.4cqw, 34px); line-height: 1.12; white-space: normal; }
        .root[data-skin="cinema"] .sub { margin-top: 6px; }
        .root[data-skin="cinema"] .center button:not(.big) { opacity: .7; }
        /* Панели сбоку, как в остальных темах */
        .root[data-skin="cinema"] .panel { border-width: 0 0 0 1px; }
        .root[data-skin="cinema"].with-panel { --btn-pad: 0 4px; --bar-gap: 8px; --bottom-pad: 4px 10px 6px; }
        @container (max-width: 900px) { .root[data-skin="cinema"].with-panel .clock { display: none; } }
        @container (max-width: 620px) { .root[data-skin="cinema"] .head { bottom: 92px; right: 24px; } }

        /* ---------- Острова: каждая группа на своей плотной плашке, без размытия ---------- */
        .root[data-skin="islands"] {
            --island: rgba(14,14,16,.8); --island-line: 1px solid rgba(255,255,255,.07);
            --text-shadow: none;
            --scrim-top: linear-gradient(rgba(0,0,0,.3), transparent); --scrim-bottom: linear-gradient(transparent, rgba(0,0,0,.3));
            --bottom-x: 16px; --bottom-y: 14px; --bar-gap: 8px; --btn-pad: 0 12px; --btn-radius: 14px;
            --rail-h: 6px; --rail-h-hover: 8px; --rail-bg: rgba(255,255,255,.1); --rail-buffer: rgba(255,255,255,.18); --rail-zone: rgba(251,191,36,.6); --rail-done: #2dd4bf; --rail-radius: 99px;
            --thumb-shadow: 0 0 0 4px rgba(45,212,191,.3); --thumb-scale: 1;
            --ctrl-size: 46px; --ctrl-radius: 14px; --center-gap: 6px; --center-icon: 22px;
            --big: 58px; --big-bg: #2dd4bf; --big-fg: #04201c; --big-radius: 18px;
            --jump-bg: rgba(45,212,191,.16); --jump-hover: rgba(45,212,191,.28); --jump-fg: #5eead4; --jump-hover-fg: #99f6e4; --jump-radius: 14px;
            --panel-inset: 14px; --panel-bg: rgba(12,12,14,.84); --panel-border: 1px solid rgba(255,255,255,.07); --panel-radius: 18px; --panel-shadow: 0 20px 50px rgba(0,0,0,.5);
            --field-bg: rgba(255,255,255,.07); --field-radius: 12px;
            --chip-bg: rgba(255,255,255,.08); --chip-hover: rgba(255,255,255,.14); --chip-on-bg: #2dd4bf; --chip-on-fg: #04201c; --chip-radius: 10px;
            --ep-bg: rgba(255,255,255,.07); --ep-hover: rgba(255,255,255,.13); --ep-radius: 10px; --ep-now-bg: #2dd4bf; --ep-now-fg: #04201c; --seen: rgba(45,212,191,.6);
            --row-hover: rgba(255,255,255,.07); --row-on-bg: rgba(45,212,191,.14); --row-on-fg: #5eead4; --row-radius: 12px;
            --sw-on: #2dd4bf; --sw-knob-on: #04201c;
            --tip-bg: rgba(12,12,14,.9); --tip-border: 1px solid rgba(255,255,255,.08); --tip-radius: 14px; --pic-radius: 9px;
            --note-bg: rgba(12,12,14,.88); --note-fg: #5eead4; --note-border: 1px solid rgba(255,255,255,.08); --note-radius: 12px;
            --spin: #2dd4bf;
            --skip-y: 118px; --skip-bg: #2dd4bf; --skip-fg: #04201c; --skip-radius: 14px; --skip-shadow: 0 10px 30px rgba(0,0,0,.4); --undo-bg: rgba(12,12,14,.9); --undo-border: 1px solid rgba(255,255,255,.1);
            --focus: #5eead4; --vol-fill: #2dd4bf; --close-hover: rgba(255,255,255,.08); --guide-bg: rgba(14,14,16,.92); --guide-border: 1px solid rgba(255,255,255,.07); --guide-radius: 18px; --go-bg: #2dd4bf; --go-fg: #04201c; --go-radius: 10px; --spot: #2dd4bf;
        }
        .root[data-skin="islands"] .head { left: 16px; top: 14px; right: auto; width: max-content; max-width: calc(100% - 110px); padding: 9px 14px; background: var(--island); border: var(--island-line); border-radius: 14px; }
        .root[data-skin="islands"] .title { font-size: 15px; }
        .root[data-skin="islands"] .pip { top: 14px; right: 16px; width: 44px; height: 44px; opacity: 1; background: var(--island); border: var(--island-line); border-radius: 14px; }
        .root[data-skin="islands"] .center { padding: 6px; background: var(--island); border: var(--island-line); border-radius: 22px; }
        .root[data-skin="islands"] .center button:hover { transform: none; background: rgba(40,40,46,.9); }
        .root[data-skin="islands"] .center .big:hover { background: var(--big-bg); filter: brightness(1.12); }
        .root[data-skin="islands"] .track { height: 34px; padding: 0 14px; margin-bottom: 8px; background: var(--island); border: var(--island-line); border-radius: 14px; }
        .root[data-skin="islands"] .tip { bottom: 42px; }
        .root[data-skin="islands"] .bar { height: 44px; }
        .root[data-skin="islands"] .bar > button, .root[data-skin="islands"] .clock, .root[data-skin="islands"] .vol { height: 44px; min-height: 44px; background: var(--island); border: var(--island-line); border-radius: 14px; opacity: 1; }
        .root[data-skin="islands"] .bar > button:hover { background: rgba(40,40,46,.9); }
        .root[data-skin="islands"] .bar > button[aria-expanded="true"] { background: var(--chip-on-bg); color: var(--chip-on-fg); border-color: transparent; }
        .root[data-skin="islands"] .bar > .jump { padding: 0 14px 0 10px; background: linear-gradient(var(--jump-bg), var(--jump-bg)), var(--island); }
        .root[data-skin="islands"] .bar > .jump:hover { background: linear-gradient(var(--jump-hover), var(--jump-hover)), var(--island); }
        .root[data-skin="islands"] .clock { display: inline-flex; align-items: center; padding: 0 14px; }
        .root[data-skin="islands"] .vol { padding: 0 8px; }
        .root[data-skin="islands"] .vol > button { min-height: 30px; padding: 0 4px; }
        .root[data-skin="islands"].with-panel { --btn-pad: 0 9px; --bar-gap: 6px; }
        .root[data-skin="islands"].with-panel .clock { display: none; }
        @container (max-width: 900px) { .root[data-skin="islands"].with-panel { --btn-pad: 0 7px; --bar-gap: 4px; } }
        @container (max-width: 620px) { .root[data-skin="islands"] { --btn-pad: 0 9px; --bar-gap: 6px; } .root[data-skin="islands"] .clock { padding: 0 10px; } }
    `;

    const TEMPLATE = `
        <div class="root" style="container-type: inline-size">
            <div class="surface"></div>
            <div class="chrome">
                <div class="scrim-top"></div>
                <div class="scrim-bottom"></div>
                <div class="head"><div class="title"></div><div class="sub"></div><div class="player-name"></div></div>
                <button class="pip" data-act="pip" aria-label="Картинка в картинке">${icon('pip')}</button>
                <div class="center">
                    <button data-act="prev" aria-label="Предыдущая серия">${icon('prev')}</button>
                    <button data-act="back" aria-label="Назад на 5 секунд">${icon('back5')}</button>
                    <button class="big" data-act="toggle" aria-label="Играть"></button>
                    <button data-act="fwd" aria-label="Вперёд на 5 секунд">${icon('fwd5')}</button>
                    <button data-act="next" aria-label="Следующая серия">${icon('next')}</button>
                </div>
                <div class="bottom">
                    <div class="track" role="slider" aria-label="Шкала времени">
                        <div class="tip"><div class="pic"></div><div class="name"></div><div class="time"></div></div>
                        <div class="rail"><i class="buffer"></i><span class="zones"></span><i class="done"></i><span class="thumb"></span></div>
                    </div>
                    <div class="bar">
                        <button class="jump" data-act="skip" title="Перемотать вперёд на ${MANUAL_SKIP_SEC} секунд" aria-label="Перемотать вперёд на ${MANUAL_SKIP_SEC} секунд">${icon('skip')}<span>+${MANUAL_SKIP_SEC}</span></button>
                        <span class="clock"></span>
                        <span class="gap"></span>
                        <div class="vol">
                            <button data-act="mute" aria-label="Звук"></button>
                            <div class="slider" role="slider" aria-label="Громкость"><div><i></i></div></div>
                        </div>
                        <button data-act="episodes">${icon('list')}<span class="label">Серии</span></button>
                        <button data-act="voices">${icon('mic')}<span class="label">Озвучка</span></button>
                        <button data-act="players">${icon('screen')}<span class="label">Плеер</span></button>
                        <button data-act="settings" aria-label="Настройки">${icon('gear')}</button>
                        <button data-act="full" aria-label="На весь экран">${icon('full')}</button>
                    </div>
                </div>
            </div>
            <div class="spinner" role="status" aria-label="Загрузка"></div>
            <div class="note"></div>
            <div class="guide" role="dialog" aria-label="Подсказки лисы" hidden></div>
            <div class="finale" role="dialog" aria-label="Тайтл досмотрен" hidden></div>
            <button type="button" id="ag-smart-skip"></button>
            <button type="button" id="ag-skip-undo">↩ Вернуться</button>
            <div class="panel" role="dialog"></div>
        </div>`;

    const api = { MANUAL_SKIP_SEC, SKINS, KNOBS, DEFAULTS, BAR_ITEMS, HIDEABLE, CUSTOM_MAX, cleanValues, cleanCustom, presetOf, customVars, layoutOf, barColorUsed, paintSkin, icon, STYLE, TEMPLATE };
    root.AgShellView = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
