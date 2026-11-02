// modules/kodik/player-shell.js
// Новая оболочка плеера Kodik, вариант «Кинотеатр». Живёт в Shadow DOM внутри iframe плеера, поэтому стили не пересекаются ни с Kodik, ни с сайтом.
// Своей логики воспроизведения нет: управляет родным <video> и родными списками Kodik.
// Реклама не трогается: пока она идёт, виден родной интерфейс. При любой ошибке оболочка снимается и плеер остаётся обычным.

(function (root) {
    'use strict';

    const EPISODE_GROUP = 100;
    const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
    const SEEN_KEY = 'ag_seen_eps';
    const SEEN_MAX_TITLES = 300;
    const SEEN_AT = 0.8;
    const SYNC_MS = 400;
    const DOUBLE_CLICK_MS = 250;
    // Столько ждём автозапуск следующей серии, потом показываем кнопку
    const AUTOSTART_WAIT_MS = 6000;

    // ---------- Чистые функции ----------

    function formatTime(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = String(s % 60).padStart(2, '0');
        return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
    }

    /** Группы длинного сериала: [{ label, from, to }]. До одной сотни группы не нужны */
    function episodeGroups(episodes) {
        if (episodes.length <= EPISODE_GROUP) return [];
        const groups = [];
        for (let i = 0; i < episodes.length; i += EPISODE_GROUP) {
            const chunk = episodes.slice(i, i + EPISODE_GROUP);
            groups.push({ label: `${chunk[0].label}–${chunk[chunk.length - 1].label}`, from: i, to: i + chunk.length });
        }
        return groups;
    }

    /** Сначала озвучки из списка приоритетов в его порядке, затем остальные как у Kodik */
    function sortVoices(voices, priority) {
        const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
        const rank = (v) => {
            const name = clean(v.title);
            const i = (priority || []).findIndex((p) => {
                const c = clean(p);
                return c && (name.includes(c) || c.includes(name));
            });
            return i < 0 ? Infinity : i;
        };
        return voices.map((v, i) => ({ v, i, r: rank(v) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.v);
    }

    /** Что показывать: реклама (оболочка уходит с экрана), экран запуска, загрузка или сам эпизод */
    function playerMode({ active, ready, adPlaying, hasVideo, autoStarting }) {
        if (adPlaying) return 'ad';
        if (!active) return autoStarting ? 'loading' : 'start';
        return ready && hasVideo ? 'play' : 'loading';
    }

    // ---------- Родные элементы Kodik ----------

    const q = (s) => document.querySelector(s);
    const SELECTS = { seasons: '.serial-seasons-box select', episodes: '.serial-series-box select', voices: '.serial-translations-box select' };

    function readOptions(selector) {
        const sel = q(selector);
        if (!sel) return [];
        return [...sel.options].map((o, index) => ({
            index,
            selected: o.selected,
            label: (o.dataset.title || o.textContent || '').trim().replace(/\s*(серия|сезон)$/i, ''),
            title: (o.dataset.title || o.textContent || '').replace(/\s*\([^)]*\)\s*$/, '').trim(),
            type: o.dataset.translationType || 'voice',
            count: o.dataset.episodeCount || ''
        }));
    }

    function chooseOption(selector, index) {
        const sel = q(selector);
        if (!sel || sel.selectedIndex === index) return;
        sel.selectedIndex = index;
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Рекламный блок может быть и без видео (баннер), поэтому важно, виден ли он сам
    function adIsPlaying() {
        const box = q('.creative-player');
        if (!box || box.getBoundingClientRect().width === 0) return false;
        const style = getComputedStyle(box);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const ad = box.querySelector('video');
        return !ad || (!ad.ended && (!!ad.currentSrc || !ad.paused));
    }

    // ---------- Вёрстка ----------

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
        mic: '<path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/>',
        gear: '<path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>',
        full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        unfull: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
        pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" fill="currentColor" stroke="none"/>',
        close: '<path d="M6 6l12 12M18 6L6 18"/>',
        search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
        check: '<path d="M5 12l5 5 9-10"/>'
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
        .done { background: #fff; }
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
        .ep.now { background: #fff; color: #111; font-weight: 600; }
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
        .spinner { display: none; position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid rgba(255,255,255,.25); border-top-color: #fff; animation: ag-spin .8s linear infinite; }
        @keyframes ag-spin { to { transform: rotate(360deg); } }
        .loading { background: #000; }
        .loading .spinner { display: block; }
        .loading .center, .loading .bottom, .loading .pip { display: none; }
        .start .chrome .center button:not(.big), .start .bottom .track, .start .vol, .start .clock, .start .pip, .start [data-act="settings"], .start [data-act="full"] { display: none; }
        @container (max-width: 620px) { .label { display: none; } .center { gap: 18px; } .head { left: 14px; top: 12px; } .bottom { left: 14px; right: 14px; } }
    `;

    const TEMPLATE = `
        <div class="root" style="container-type: inline-size">
            <div class="surface"></div>
            <div class="chrome">
                <div class="scrim-top"></div>
                <div class="scrim-bottom"></div>
                <div class="head"><div class="title"></div><div class="sub"></div></div>
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
                        <span class="clock"></span>
                        <span class="gap"></span>
                        <div class="vol">
                            <button data-act="mute" aria-label="Звук"></button>
                            <div class="slider" role="slider" aria-label="Громкость"><div><i></i></div></div>
                        </div>
                        <button data-act="episodes">${icon('list')}<span class="label">Серии</span></button>
                        <button data-act="voices">${icon('mic')}<span class="label">Озвучка</span></button>
                        <button data-act="settings" aria-label="Настройки">${icon('gear')}</button>
                        <button data-act="full" aria-label="На весь экран">${icon('full')}</button>
                    </div>
                </div>
            </div>
            <div class="spinner" role="status" aria-label="Загрузка"></div>
            <div class="note"></div>
            <div class="panel" role="dialog"></div>
        </div>`;

    // Родной интерфейс скрыт, но остаётся в разметке: его логика продолжает работать
    const NATIVE_CSS = `
        body.ag-shell-on .fp-ui, body.ag-shell-on .serial-panel { opacity: 0 !important; pointer-events: none !important; }
        body.ag-shell-on { background: #000 !important; }
        body.ag-shell-on .play_button, body.ag-shell-on .play_background { opacity: 0 !important; }
        body.ag-shell-on #ag-ui { opacity: 1 !important; }
        body.ag-shell-on #ag-ui > :not(#ag-flash) { display: none !important; }
        body.ag-shell-on #ag-flash { display: none !important; }
        body.ag-shell-on #ag-vol-osd { display: none !important; }
        body.ag-shell-on #ag-smart-skip, body.ag-shell-on #ag-skip-undo {
            right: 24px !important; bottom: 76px !important; padding: 10px 18px !important; border: 0 !important; border-radius: 7px !important;
            font-size: 14px !important; font-weight: 600 !important; transition: none !important;
        }
        body.ag-shell-on #ag-smart-skip { background: #fff !important; color: #111 !important; }
        body.ag-shell-on #ag-skip-undo { background: #101319 !important; color: #fff !important; }
    `;

    /**
     * options: { getSettings, patchSettings(patch), getTimings(), nav(dir), toggleFs(), onVoicePicked(text), expectsAutoStart() }
     * Возвращает { destroy } или null, если подключиться нельзя.
     */
    function create(options) {
        if (!document.body || q('#ag-shell')) return null;
        const host = document.createElement('div');
        host.id = 'ag-shell';
        host.style.cssText = 'position:fixed;inset:0;z-index:9999980;display:none;';
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
        const nativeStyle = document.createElement('style');
        nativeStyle.id = 'ag-shell-native';
        nativeStyle.textContent = NATIVE_CSS;
        document.head.appendChild(nativeStyle);
        document.body.appendChild(host);

        const $ = (s) => shadow.querySelector(s);
        const rootEl = $('.root');
        const panel = $('.panel');
        let video = null;
        let mode = null;
        const bornAt = Date.now();
        let openPanel = null;
        let idleTimer = null;
        let clickTimer = null;
        let dragging = false;
        let noteTimer = null;
        let rewindSum = 0;
        let rewindTimer = null;
        let destroyed = false;
        let seen = new Set();
        let seenMarked = false;
        let episodeGroup = null;
        let fullShown = false;
        const titleKey = () => (document.title || '').trim().toLowerCase();

        const settings = () => options.getSettings() || {};

        // ---------- Просмотренные серии ----------

        chrome.storage.local.get(SEEN_KEY).then((saved) => {
            const entry = saved && saved[SEEN_KEY] && saved[SEEN_KEY][titleKey()];
            seen = new Set(entry ? entry.eps : []);
        }).catch(() => {});

        const markSeen = (episode) => {
            if (!episode || seen.has(episode)) return;
            seen.add(episode);
            chrome.storage.local.get(SEEN_KEY).then((saved) => {
                const all = (saved && saved[SEEN_KEY]) || {};
                all[titleKey()] = { eps: [...seen], at: Date.now() };
                const keys = Object.keys(all);
                if (keys.length > SEEN_MAX_TITLES) {
                    keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - SEEN_MAX_TITLES).forEach((k) => { delete all[k]; });
                }
                return chrome.storage.local.set({ [SEEN_KEY]: all });
            }).catch(() => {});
        };

        // ---------- Показ и скрытие ----------

        const wake = () => {
            rootEl.classList.remove('idle');
            clearTimeout(idleTimer);
            if (mode === 'start' || mode === 'loading' || openPanel || dragging || (video && video.paused)) return;
            idleTimer = setTimeout(() => rootEl.classList.add('idle'), settings().hideTime || 2500);
        };

        const note = (text) => {
            const el = $('.note');
            el.textContent = text;
            el.classList.add('on');
            clearTimeout(noteTimer);
            noteTimer = setTimeout(() => el.classList.remove('on'), 800);
        };

        // ---------- Данные на экране ----------

        const currentEpisode = () => readOptions(SELECTS.episodes).find(o => o.selected);

        function renderHead() {
            $('.title').textContent = (document.title || '').trim();
            const seasons = readOptions(SELECTS.seasons);
            // Единственный первый сезон упоминать незачем
            const season = seasons.length > 1 || (seasons[0] && seasons[0].label !== '1') ? seasons.find(o => o.selected) : null;
            const ep = currentEpisode();
            const voice = readOptions(SELECTS.voices).find(o => o.selected);
            $('.sub').textContent = [season && `Сезон ${season.label}`, ep && `Серия ${ep.label}`, voice && voice.title].filter(Boolean).join(' · ');
        }

        function renderNav() {
            const list = readOptions(SELECTS.episodes);
            const hasList = list.length > 0;
            const i = list.findIndex(o => o.selected);
            $('[data-act="prev"]').style.display = hasList && i <= 0 ? 'none' : '';
            $('[data-act="next"]').style.display = hasList && i >= list.length - 1 ? 'none' : '';
            // На сайтах с одной серией в плеере список серий находится на самой странице
            $('[data-act="episodes"]').style.display = list.length > 1 || readOptions(SELECTS.seasons).length > 1 ? '' : 'none';
            $('[data-act="voices"]').style.display = readOptions(SELECTS.voices).length > 1 ? '' : 'none';
            $('.pip').style.display = settings().showPiP === false ? 'none' : '';
        }

        function renderState() {
            const paused = !video || video.paused;
            const big = $('.big');
            big.innerHTML = icon(paused ? 'play' : 'pause');
            big.setAttribute('aria-label', paused ? 'Играть' : 'Пауза');
            if (!video) return;
            const muted = video.muted || video.volume === 0;
            $('[data-act="mute"]').innerHTML = icon(muted ? 'mute' : 'vol');
            $('.slider i').style.width = `${(muted ? 0 : video.volume) * 100}%`;
        }

        function renderProgress() {
            if (!video || !video.duration) return;
            const d = video.duration;
            const p = (video.currentTime / d) * 100;
            $('.done').style.width = `${p}%`;
            $('.thumb').style.left = `${p}%`;
            $('.clock').textContent = `${formatTime(video.currentTime)} / ${formatTime(d)}`;
            const b = video.buffered;
            for (let i = 0; i < b.length; i++) {
                if (b.start(i) <= video.currentTime && video.currentTime <= b.end(i)) {
                    $('.buffer').style.width = `${(b.end(i) / d) * 100}%`;
                    break;
                }
            }
        }

        function renderZones() {
            const box = $('.zones');
            box.replaceChildren();
            if (!video || !video.duration) return;
            const t = options.getTimings() || {};
            for (const part of ['op', 'ed']) {
                const r = t[part];
                if (!r || !(r.end > r.start)) continue;
                const z = document.createElement('i');
                z.className = 'zone';
                z.style.left = `${(r.start / video.duration) * 100}%`;
                z.style.width = `${((r.end - r.start) / video.duration) * 100}%`;
                box.appendChild(z);
            }
        }

        // ---------- Панели ----------

        // Прокручиваем только сам список: scrollIntoView сдвинул бы и страницу сайта
        function revealInList(scroll, el) {
            if (el) scroll.scrollTop = el.offsetTop - scroll.clientHeight / 2;
        }

        function panelHead(title) {
            const h = document.createElement('h3');
            h.textContent = title;
            const close = document.createElement('button');
            close.innerHTML = icon('close');
            close.setAttribute('aria-label', 'Закрыть');
            close.addEventListener('click', closePanel);
            h.appendChild(close);
            return h;
        }

        function chips(items, onPick) {
            const box = document.createElement('div');
            box.className = 'chips';
            for (const it of items) {
                const b = document.createElement('button');
                b.className = `chip${it.on ? ' on' : ''}`;
                b.textContent = it.label;
                b.addEventListener('click', () => onPick(it));
                box.appendChild(b);
            }
            return box;
        }

        function renderEpisodes() {
            panel.replaceChildren(panelHead('Серии'));
            const seasons = readOptions(SELECTS.seasons);
            if (seasons.length > 1) {
                panel.appendChild(chips(seasons.map(s => ({ label: `Сезон ${s.label}`, on: s.selected, index: s.index })), it => chooseOption(SELECTS.seasons, it.index)));
            }
            const list = readOptions(SELECTS.episodes);
            const groups = episodeGroups(list);
            const nowIndex = list.findIndex(o => o.selected);
            if (groups.length) {
                if (episodeGroup === null) episodeGroup = Math.max(0, groups.findIndex(g => nowIndex >= g.from && nowIndex < g.to));
                const field = document.createElement('label');
                field.className = 'field';
                field.innerHTML = `${icon('search')}<input inputmode="numeric" placeholder="Номер серии" aria-label="Номер серии">`;
                panel.appendChild(field);
                const input = field.querySelector('input');
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key !== 'Enter') return;
                    const hit = list.find(o => o.label === input.value.trim());
                    if (hit) chooseOption(SELECTS.episodes, hit.index);
                });
                input.addEventListener('input', () => {
                    const i = list.findIndex(o => o.label === input.value.trim());
                    if (i < 0) return;
                    const g = groups.findIndex(x => i >= x.from && i < x.to);
                    if (g !== episodeGroup) {
                        episodeGroup = g;
                        const value = input.value;
                        renderEpisodes();
                        const again = panel.querySelector('input');
                        again.value = value;
                        again.focus();
                    }
                });
                panel.appendChild(chips(groups.map((g, i) => ({ label: g.label, on: i === episodeGroup, i })), (it) => {
                    episodeGroup = it.i;
                    renderEpisodes();
                }));
            }
            const scroll = document.createElement('div');
            scroll.className = 'scroll';
            const grid = document.createElement('div');
            grid.className = 'grid';
            const range = groups.length ? groups[episodeGroup] : { from: 0, to: list.length };
            let current = null;
            for (const o of list.slice(range.from, range.to)) {
                const b = document.createElement('button');
                b.className = `ep${o.selected ? ' now' : ''}${seen.has(o.label) && !o.selected ? ' seen' : ''}`;
                b.textContent = o.label;
                b.setAttribute('aria-label', `Серия ${o.label}`);
                b.addEventListener('click', () => chooseOption(SELECTS.episodes, o.index));
                if (o.selected) current = b;
                grid.appendChild(b);
            }
            scroll.appendChild(grid);
            panel.appendChild(scroll);
            revealInList(scroll, current);
        }

        function renderVoices(filter = '', tab = null) {
            panel.replaceChildren(panelHead('Озвучка'));
            const all = sortVoices(readOptions(SELECTS.voices), settings().auto_select_voice === false ? [] : settings().voice_priority_list);
            const field = document.createElement('label');
            field.className = 'field';
            field.innerHTML = `${icon('search')}<input placeholder="Найти озвучку" aria-label="Найти озвучку">`;
            panel.appendChild(field);
            const input = field.querySelector('input');
            input.value = filter;
            const voices = all.filter(v => v.type !== 'subtitles');
            const subs = all.filter(v => v.type === 'subtitles');
            const selected = all.find(v => v.selected);
            const activeTab = tab || (selected && selected.type === 'subtitles' ? 'subtitles' : 'voice');
            if (voices.length && subs.length) {
                panel.appendChild(chips([
                    { label: `Озвучка ${voices.length}`, on: activeTab === 'voice', id: 'voice' },
                    { label: `Субтитры ${subs.length}`, on: activeTab === 'subtitles', id: 'subtitles' }
                ], it => renderVoices(input.value, it.id)));
            }
            const scroll = document.createElement('div');
            scroll.className = 'scroll';
            const needle = filter.trim().toLowerCase();
            const shown = (activeTab === 'subtitles' ? subs : voices).filter(v => !needle || v.title.toLowerCase().includes(needle));
            let current = null;
            for (const v of shown) {
                const b = document.createElement('button');
                b.className = `row${v.selected ? ' on' : ''}`;
                b.innerHTML = `<span class="mark">${v.selected ? icon('check') : ''}</span><span class="name"></span><span class="meta"></span>`;
                b.querySelector('.name').textContent = v.title;
                b.querySelector('.meta').textContent = v.count ? `${v.count} сер.` : '';
                b.addEventListener('click', () => {
                    if (v.selected) return;
                    if (options.onVoicePicked) options.onVoicePicked(v.title);
                    chooseOption(SELECTS.voices, v.index);
                });
                if (v.selected) current = b;
                scroll.appendChild(b);
            }
            if (!shown.length) {
                const none = document.createElement('div');
                none.className = 'none';
                none.textContent = 'Такой озвучки нет.';
                scroll.appendChild(none);
            }
            panel.appendChild(scroll);
            revealInList(scroll, current);
            input.addEventListener('keydown', e => e.stopPropagation());
            input.addEventListener('input', () => {
                const value = input.value;
                renderVoices(value, activeTab);
                const again = panel.querySelector('input');
                again.focus();
                again.setSelectionRange(value.length, value.length);
            });
        }

        const qualityItems = () => [...document.querySelectorAll('.fp-quality-dropdown [data-quality]')];

        function toggleRow(label, on, onChange) {
            const b = document.createElement('button');
            b.className = `row${on ? ' on' : ''}`;
            b.setAttribute('role', 'switch');
            b.setAttribute('aria-checked', String(on));
            b.innerHTML = '<span class="name"></span><span class="sw"></span>';
            b.querySelector('.name').textContent = label;
            b.addEventListener('click', () => onChange(!on));
            return b;
        }

        function renderSettings() {
            panel.replaceChildren(panelHead('Настройки'));
            const scroll = document.createElement('div');
            scroll.className = 'scroll';
            const cap = (text) => {
                const c = document.createElement('div');
                c.className = 'cap';
                c.textContent = text;
                scroll.appendChild(c);
            };
            const items = qualityItems();
            if (items.length) {
                cap('Качество');
                for (const it of items) {
                    const current = it.classList.contains('current');
                    const b = document.createElement('button');
                    b.className = `row${current ? ' on' : ''}`;
                    b.innerHTML = `<span class="mark">${current ? icon('check') : ''}</span><span class="name"></span>`;
                    b.querySelector('.name').textContent = it.textContent.trim();
                    b.addEventListener('click', () => {
                        it.click();
                        setTimeout(renderSettings, 150);
                    });
                    scroll.appendChild(b);
                }
            }
            if (video) {
                cap('Скорость');
                const box = chips(SPEEDS.map(s => ({ label: `${s}x`, on: video.playbackRate === s, s })), (it) => {
                    video.playbackRate = it.s;
                    renderSettings();
                });
                box.style.margin = '4px 8px 0';
                box.style.flexWrap = 'wrap';
                scroll.appendChild(box);
            }
            cap('Просмотр');
            const s = settings();
            const skip = (key) => s.autoSkip !== false && s[key] !== false;
            const set = async (patch) => {
                await options.patchSettings(patch);
                renderSettings();
            };
            // Общая настройка должна остаться включённой, если нужна хотя бы одна из частей
            scroll.appendChild(toggleRow('Автопропуск опенинга', skip('autoSkipOp'), v => set({ autoSkip: true, autoSkipOp: v, autoSkipEd: skip('autoSkipEd') })));
            scroll.appendChild(toggleRow('Автопропуск эндинга', skip('autoSkipEd'), v => set({ autoSkip: true, autoSkipOp: skip('autoSkipOp'), autoSkipEd: v })));
            scroll.appendChild(toggleRow('Автопереход на следующую серию', s.autoNext !== false, v => set({ autoNext: v })));
            panel.appendChild(scroll);
        }

        const PANELS = { episodes: renderEpisodes, voices: () => renderVoices(), settings: renderSettings };

        function togglePanel(name) {
            if (openPanel === name) return closePanel();
            openPanel = name;
            episodeGroup = null;
            panel.classList.add('on');
            rootEl.classList.add('with-panel');
            PANELS[name]();
            wake();
        }

        function closePanel() {
            openPanel = null;
            panel.classList.remove('on');
            rootEl.classList.remove('with-panel');
            panel.replaceChildren();
            wake();
        }

        // ---------- Действия ----------

        const startNative = () => {
            const b = q('.play_button') || q('.play_background a') || q('.play_background');
            if (b) b.click();
        };

        const toggle = () => {
            if (mode === 'start') return startNative();
            if (!video) return;
            if (video.paused) video.play().catch(() => {}); else video.pause();
        };

        const rewind = (sec) => {
            if (!video) return;
            rewindSum += sec;
            note(`${rewindSum > 0 ? '+' : ''}${rewindSum} с`);
            clearTimeout(rewindTimer);
            rewindTimer = setTimeout(() => {
                video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + rewindSum));
                rewindSum = 0;
            }, 350);
        };

        const ACTIONS = {
            toggle,
            back: () => rewind(-5),
            fwd: () => rewind(5),
            prev: () => options.nav('prev'),
            next: () => options.nav('next'),
            episodes: () => togglePanel('episodes'),
            voices: () => togglePanel('voices'),
            settings: () => togglePanel('settings'),
            full: () => options.toggleFs(),
            mute: () => { if (video) { video.muted = !video.muted; if (!video.muted && video.volume === 0) video.volume = 0.5; } },
            pip: async () => {
                try {
                    if (document.pictureInPictureElement) await document.exitPictureInPicture();
                    else if (video) await video.requestPictureInPicture();
                } catch (e) {}
            }
        };

        rootEl.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]');
            if (b && ACTIONS[b.dataset.act]) {
                e.stopPropagation();
                ACTIONS[b.dataset.act]();
                wake();
            }
        });

        // Щелчок по кадру: пауза, двойной по краям перематывает, в центре разворачивает
        const surface = $('.surface');
        surface.addEventListener('click', (e) => {
            if (openPanel) return closePanel();
            if (mode === 'start') return startNative();
            const w = rootEl.clientWidth || 1;
            const x = e.clientX / w;
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                if (settings().showDBL === false) return toggle();
                if (x < 0.25) rewind(-5);
                else if (x > 0.75) rewind(5);
                else options.toggleFs();
                return;
            }
            clickTimer = setTimeout(() => {
                clickTimer = null;
                toggle();
            }, DOUBLE_CLICK_MS);
        });

        // ---------- Шкала времени и громкость ----------

        const track = $('.track');
        const ratioAt = (e, el) => {
            const r = el.getBoundingClientRect();
            return Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
        };

        // Миниатюры уже есть у Kodik: родная шкала считает нужный кадр, а мы показываем его в своей подсказке
        function nativePreview(ratio) {
            const line = q('.fp-timeline');
            const pic = $('.tip .pic');
            pic.style.display = 'none';
            if (!line) return;
            const r = line.getBoundingClientRect();
            if (!r.width) return;
            const clientX = r.left + r.width * ratio;
            line.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY: r.top + r.height / 2 }));
            const thumb = q('.fp-timestamp-thumbnail');
            if (!thumb || !thumb.style.backgroundImage) return;
            pic.style.display = 'block';
            pic.style.backgroundImage = thumb.style.backgroundImage;
            pic.style.backgroundSize = thumb.style.backgroundSize;
            pic.style.backgroundPosition = thumb.style.backgroundPosition;
        }

        function showTip(e) {
            if (!video || !video.duration) return;
            const ratio = ratioAt(e, track);
            const at = ratio * video.duration;
            const tip = $('.tip');
            const t = options.getTimings() || {};
            const inPart = (p) => t[p] && t[p].end > t[p].start && at >= t[p].start && at <= t[p].end;
            const name = inPart('op') ? 'Опенинг' : inPart('ed') ? 'Эндинг' : '';
            tip.querySelector('.name').textContent = name;
            tip.querySelector('.name').style.display = name ? '' : 'none';
            tip.querySelector('.time').textContent = formatTime(at);
            nativePreview(ratio);
            tip.classList.add('on');
            const half = tip.offsetWidth / 2;
            const w = track.clientWidth;
            tip.style.left = `${Math.max(half, Math.min(w - half, ratio * w))}px`;
        }

        track.addEventListener('pointermove', showTip);
        track.addEventListener('pointerleave', () => { if (!dragging) $('.tip').classList.remove('on'); });
        track.addEventListener('pointerdown', (e) => {
            if (!video || !video.duration) return;
            dragging = true;
            track.classList.add('drag');
            track.setPointerCapture(e.pointerId);
            const seek = (ev) => {
                const ratio = ratioAt(ev, track);
                $('.done').style.width = `${ratio * 100}%`;
                $('.thumb').style.left = `${ratio * 100}%`;
                showTip(ev);
                return ratio * video.duration;
            };
            let target = seek(e);
            const move = (ev) => { target = seek(ev); };
            const up = () => {
                dragging = false;
                track.classList.remove('drag');
                track.removeEventListener('pointermove', move);
                track.removeEventListener('pointerup', up);
                track.removeEventListener('pointercancel', up);
                video.currentTime = target;
                $('.tip').classList.remove('on');
                wake();
            };
            track.addEventListener('pointermove', move);
            track.addEventListener('pointerup', up);
            track.addEventListener('pointercancel', up);
        });

        const slider = $('.slider');
        const setVolume = (e) => {
            if (!video) return;
            video.volume = ratioAt(e, slider.firstElementChild);
            video.muted = video.volume === 0;
        };
        slider.addEventListener('pointerdown', (e) => {
            slider.setPointerCapture(e.pointerId);
            setVolume(e);
            const up = () => {
                slider.removeEventListener('pointermove', setVolume);
                slider.removeEventListener('pointerup', up);
            };
            slider.addEventListener('pointermove', setVolume);
            slider.addEventListener('pointerup', up);
        });
        $('.vol').addEventListener('wheel', (e) => {
            if (!video) return;
            e.preventDefault();
            const step = settings().volStep || 0.05;
            video.muted = false;
            video.volume = Math.max(0, Math.min(1, video.volume + (e.deltaY < 0 ? step : -step)));
            note(`Громкость ${Math.round(video.volume * 100)}%`);
        }, { passive: false });

        // ---------- Связь с плеером ----------

        const onVideoEvent = () => { renderState(); wake(); };
        const onTime = () => {
            if (dragging) return;
            renderProgress();
            if (!seenMarked && video.duration && video.currentTime / video.duration >= SEEN_AT) {
                seenMarked = true;
                const ep = currentEpisode();
                if (ep) markSeen(ep.label);
            }
        };

        function bindVideo(v) {
            if (video === v) return;
            video = v;
            seenMarked = false;
            ['play', 'pause', 'volumechange'].forEach(ev => v.addEventListener(ev, onVideoEvent));
            ['timeupdate', 'progress'].forEach(ev => v.addEventListener(ev, onTime));
            ['durationchange', 'loadedmetadata'].forEach(ev => v.addEventListener(ev, renderZones));
            renderState();
            renderProgress();
            renderZones();
        }

        function setMode(next) {
            if (next === mode) return;
            mode = next;
            // Родной интерфейс скрыт всегда: во время рекламы оболочка уходит и остаётся только сама реклама
            const show = next !== 'ad';
            host.style.display = show ? '' : 'none';
            document.body.classList.add('ag-shell-on');
            if (globalThis.AgKodikShellBoot) globalThis.AgKodikShellBoot.release();
            rootEl.classList.toggle('start', next === 'start');
            rootEl.classList.toggle('loading', next === 'loading');
            if (show) {
                renderHead();
                renderNav();
                renderState();
                wake();
            } else {
                closePanel();
            }
        }

        function sync() {
            const b = document.body.classList;
            const v = q('video.fp-engine');
            if (v) bindVideo(v);
            const autoStarting = !!(options.expectsAutoStart && options.expectsAutoStart()) && Date.now() - bornAt < AUTOSTART_WAIT_MS;
            setMode(playerMode({ active: b.contains('active-player'), ready: b.contains('player-is-ready'), adPlaying: adIsPlaying(), hasVideo: !!v, autoStarting }));
            if (mode !== 'ad') {
                renderZones();
                const full = document.body.dataset.agFsState === 'true';
                if (full !== fullShown) {
                    fullShown = full;
                    const b = $('[data-act="full"]');
                    b.innerHTML = icon(full ? 'unfull' : 'full');
                    b.setAttribute('aria-label', full ? 'Свернуть' : 'На весь экран');
                }
            }
        }

        function destroy() {
            if (destroyed) return;
            destroyed = true;
            clearInterval(syncTimer);
            document.removeEventListener('mousemove', wake);
            document.removeEventListener('keydown', onKey, true);
            document.body.classList.remove('ag-shell-on');
            if (globalThis.AgKodikShellBoot) globalThis.AgKodikShellBoot.release();
            host.remove();
            nativeStyle.remove();
        }

        // Любая ошибка оболочки не должна мешать смотреть: возвращаем родной интерфейс
        const guarded = (fn) => (...args) => {
            try {
                return fn(...args);
            } catch (e) {
                console.error('[Anime+] Оболочка плеера отключена:', e);
                destroy();
                return undefined;
            }
        };

        const onKey = (e) => {
            if (mode === 'ad') return;
            if (e.key === 'Escape' && openPanel) {
                e.stopPropagation();
                closePanel();
                return;
            }
            if (e.code === 'Space' && mode === 'play' && !e.composedPath().some(n => n.tagName === 'INPUT')) {
                e.preventDefault();
                e.stopPropagation();
                toggle();
            }
            wake();
        };

        document.addEventListener('mousemove', wake);
        document.addEventListener('keydown', onKey, true);
        const safeSync = guarded(sync);
        const syncTimer = setInterval(safeSync, SYNC_MS);
        renderHead();
        safeSync();

        return { destroy };
    }

    const api = { create, formatTime, episodeGroups, sortVoices, playerMode };
    root.AgKodikShell = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
