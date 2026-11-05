// modules/player/shell-view.js
// Вёрстка оболочки плеера: значки, стили и разметка. Логика в modules/player/shell.js

(function (root) {
    'use strict';

    // Ручной пропуск: обычная длина опенинга или эндинга
    const MANUAL_SKIP_SEC = 89;

    const ICON = {
        play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
        pause: '<path d="M7 5h4v14H7zM14 5h4v14h-4z" fill="currentColor" stroke="none"/>',
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

    const STYLE = `
        :host { all: initial; }
        * { box-sizing: border-box; }
        .root { position: fixed; inset: 0; color: #fff; font: 13px/1.3 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif; user-select: none; -webkit-user-select: none; overflow: hidden; }
        button { all: unset; box-sizing: border-box; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; color: inherit; font: inherit; }
        button:focus-visible, input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; border-radius: 6px; }
        svg { width: 22px; height: 22px; display: block; flex: none; }
        .surface { position: absolute; inset: 0; }
        .idle .surface { cursor: none; }
        .chrome { position: absolute; inset: 0; pointer-events: none; transition: opacity .2s; }
        .idle .chrome { opacity: 0; }
        .idle .chrome * { pointer-events: none !important; }
        .scrim-top, .scrim-bottom { position: absolute; left: 0; right: 0; }
        .scrim-top { top: 0; height: 120px; background: linear-gradient(rgba(0,0,0,.72), transparent); }
        .scrim-bottom { bottom: 0; height: 170px; background: linear-gradient(transparent, rgba(0,0,0,.85)); }
        .head { position: absolute; left: 24px; top: 18px; right: 90px; }
        .title { font-size: 17px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 3px rgba(0,0,0,.5); }
        .sub { margin-top: 3px; color: rgba(255,255,255,.75); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .player-name { margin-top: 2px; font-size: 12px; color: rgba(255,255,255,.55); white-space: nowrap; }
        .pip { position: absolute; right: 20px; top: 18px; pointer-events: auto; opacity: .9; }
        .center { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 28px; }
        .center button { pointer-events: auto; opacity: .92; transition: transform .12s, opacity .12s; }
        .center button:hover { opacity: 1; transform: scale(1.1); }
        .center svg { width: 30px; height: 30px; }
        .big { width: 68px; height: 68px; border-radius: 50%; background: #fff; color: #111; }
        .big svg { width: 32px; height: 32px; }
        .bottom { position: absolute; left: 24px; right: 24px; bottom: 12px; pointer-events: auto; }
        .track { position: relative; height: 18px; display: flex; align-items: center; cursor: pointer; }
        .rail { position: relative; width: 100%; height: 4px; border-radius: 2px; background: rgba(255,255,255,.28); transition: height .1s; }
        .track:hover .rail, .track.drag .rail { height: 6px; }
        .rail i { position: absolute; top: 0; bottom: 0; left: 0; display: block; border-radius: 2px; }
        .buffer { background: rgba(255,255,255,.3); }
        .zone { background: rgba(255,255,255,.55); }
        .done { background: #ef4444; }
        .thumb { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #fff; transform: scale(.75); transition: transform .1s; }
        .track:hover .thumb, .track.drag .thumb { transform: scale(1); }
        .tip { position: absolute; bottom: 24px; transform: translateX(-50%); padding: 5px; border-radius: 8px; background: #101319; text-align: center; white-space: nowrap; display: none; pointer-events: none; }
        .tip.on { display: block; }
        .tip .pic { display: none; width: 160px; height: 90px; border-radius: 5px; background-repeat: no-repeat; margin-bottom: 4px; }
        .tip .name { font-weight: 600; padding: 0 4px; }
        .tip .time { color: rgba(255,255,255,.8); padding: 0 4px; }
        .bar { display: flex; align-items: center; gap: 16px; height: 36px; }
        .bar button { opacity: .92; }
        .bar button:hover { opacity: 1; }
        .clock { font-variant-numeric: tabular-nums; }
        .jump { height: 28px; padding: 0 10px 0 6px; gap: 2px; border-radius: 7px; background: rgba(255,255,255,.14); font-weight: 600; font-variant-numeric: tabular-nums; }
        .jump:hover { background: rgba(255,255,255,.24); }
        .jump svg { width: 18px; height: 18px; }
        .gap { flex: 1; }
        .label { font-weight: 500; }
        .vol { display: flex; align-items: center; gap: 8px; }
        .slider { width: 0; overflow: hidden; transition: width .15s; display: flex; align-items: center; height: 24px; cursor: pointer; }
        .vol:hover .slider, .vol:focus-within .slider { width: 76px; }
        .slider div { position: relative; width: 72px; height: 4px; margin-left: 2px; border-radius: 2px; background: rgba(255,255,255,.3); }
        .slider i { position: absolute; left: 0; top: 0; bottom: 0; display: block; border-radius: 2px; background: #fff; }
        .panel { position: absolute; top: 0; right: 0; bottom: 0; width: clamp(280px, 40%, 420px); background: #101319; padding: 18px; display: none; flex-direction: column; pointer-events: auto; }
        .panel.on { display: flex; }
        .with-panel .chrome { right: clamp(280px, 40%, 420px); }
        .with-panel .note { left: calc((100% - clamp(280px, 40%, 420px)) / 2); }
        .panel h3 { all: unset; display: flex; align-items: center; justify-content: space-between; font-size: 16px; font-weight: 600; margin-bottom: 14px; }
        .field { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px; margin-bottom: 12px; border-radius: 7px; background: rgba(255,255,255,.08); color: rgba(255,255,255,.7); flex: none; }
        .field svg { width: 16px; height: 16px; }
        .field input { all: unset; flex: 1; min-width: 0; color: #fff; user-select: text; -webkit-user-select: text; }
        .chips { display: flex; gap: 6px; margin-bottom: 12px; overflow-x: auto; flex: none; scrollbar-width: none; padding-bottom: 1px; }
        .chips::-webkit-scrollbar { display: none; }
        .chip { padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.09); white-space: nowrap; flex: none; }
        .chip:hover { background: rgba(255,255,255,.16); }
        .chip.on { background: #fff; color: #111; font-weight: 600; }
        .scroll { position: relative; flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent; margin-right: -8px; padding-right: 8px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(50px, 1fr)); gap: 6px; }
        .ep { position: relative; height: 38px; border-radius: 7px; background: rgba(255,255,255,.08); font-variant-numeric: tabular-nums; }
        .ep:hover { background: rgba(255,255,255,.16); }
        .ep.seen { color: rgba(255,255,255,.55); }
        .ep.seen::after { content: ""; position: absolute; left: 7px; right: 7px; bottom: 4px; height: 2px; border-radius: 1px; background: rgba(255,255,255,.45); }
        .ep.now { background: #ef4444; color: #fff; font-weight: 600; }
        .row { display: flex; width: 100%; align-items: center; gap: 8px; padding: 9px 8px; border-radius: 7px; justify-content: flex-start; min-height: 38px; }
        button.row:hover { background: rgba(255,255,255,.09); }
        .row.on { background: rgba(255,255,255,.12); font-weight: 600; }
        .row svg { width: 16px; height: 16px; }
        .row .mark { width: 16px; flex: none; }
        .row .name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .row .meta { color: rgba(255,255,255,.55); font-weight: 400; white-space: nowrap; }
        .cap { color: rgba(255,255,255,.55); font-size: 12px; margin: 14px 8px 4px; }
        .none { color: rgba(255,255,255,.55); padding: 16px 8px; }
        .sw { width: 32px; height: 18px; border-radius: 999px; background: rgba(255,255,255,.25); position: relative; flex: none; }
        .sw::after { content: ""; position: absolute; left: 2px; top: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: left .12s; }
        .row[role="switch"].on { background: none; font-weight: 400; }
        button.row[role="switch"]:hover { background: rgba(255,255,255,.09); }
        .on > .sw { background: #fff; }
        .on > .sw::after { left: 16px; background: #111; }
        .note { position: absolute; left: 50%; top: 30%; transform: translateX(-50%); padding: 8px 16px; border-radius: 8px; background: rgba(16,19,25,.9); font-size: 15px; font-weight: 600; opacity: 0; transition: opacity .15s; pointer-events: none; }
        .note.on { opacity: 1; }
        .guide { position: absolute; left: 16px; bottom: 84px; display: flex; align-items: flex-end; gap: 8px; width: min(400px, calc(100% - 32px)); padding: 10px 12px 10px 6px; border-radius: 14px; background: #1f242e; border: 1px solid rgba(255,255,255,.22); box-shadow: 0 16px 48px rgba(0,0,0,.55); pointer-events: auto; }
        .guide[hidden] { display: none; }
        .guide .fox { flex: none; width: 78px; height: 88px; }
        .guide .fox svg { display: block; width: 100%; height: 100%; }
        .guide .body { flex: 1; min-width: 0; }
        .guide p { margin: 0 0 8px; font-size: 14px; line-height: 1.35; }
        .guide .row { display: flex; align-items: center; gap: 10px; }
        .guide .row span { margin-right: auto; font-size: 12px; color: #8f96a6; }
        .guide button { width: auto; height: auto; padding: 5px 10px; border: none; border-radius: 6px; font: inherit; font-size: 13px; cursor: pointer; color: #b6bcc9; background: none; }
        .guide button[hidden] { display: none; }
        .guide button.go { color: #fff; font-weight: 600; background: #ef4444; }
        .guide-spot { outline: 2px solid #ef4444 !important; outline-offset: 3px; border-radius: 6px; }
        .panel .guide-spot { outline-offset: -2px; }
        .spinner { display: none; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; animation: ag-spin .8s linear infinite; }
        @keyframes ag-spin { to { transform: rotate(360deg); } }
        .loading { background: #000; }
        .loading .spinner { display: block; }
        .loading .center, .loading .bottom, .loading .pip { display: none; }
        .start .jump, .start .chrome .center button:not(.big), .start .bottom .track, .start .vol, .start .clock, .start .pip, .start [data-act="settings"], .start [data-act="full"] { display: none; }
        @container (max-width: 620px) { .label { display: none; } .center { gap: 18px; } .head { left: 14px; top: 12px; } .bottom { left: 14px; right: 14px; } }
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
            <div class="panel" role="dialog"></div>
        </div>`;

    const api = { MANUAL_SKIP_SEC, icon, STYLE, TEMPLATE };
    root.AgShellView = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
