(async function () {
    'use strict';

    window.AG_RED = "#ef4444";
    window.AG_FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';

    window.DEFAULT_SETTINGS = {
        global_enabled: true,
        // Включение по сайтам: { [siteId]: false } выключает расширение на сайте (см. modules/shared/sites.js)
        sites_enabled: {},
        autoNext: true, autoSkip: true, autoPlay: true, audioSkip: true,
        showDBL: true,
        // Тема оформления оболочки плеера: id из AgShellView.SKINS (modules/player/shell-view.js)
        playerSkin: 'compact',
        // Свои темы из редактора на странице настроек: [{ id, name, base, values }], проверяет AgShellView.cleanCustom
        custom_skins: [],
        // Фильтры расписания (schedule/schedule.js): значения по умолчанию и разбор в modules/shared/schedule-core.js
        schedule: {},
        random_min_score: 6.0,
        random_kinds: ["tv", "movie", "ona", "ova", "special"],
        // Скорость видео: выбор в меню плеера или клавишами, новая серия и новый плеер продолжают с ней
        playbackRate: 1,
        auto_select_voice: true,
        voice_priority_list: [
            "Anilibria",
            "Studio Band",
            "Dream Cast",
            "Дубляж",
            "SHIZA Project",
            "Subtitles"
        ],
        keys: {
            fs: "f",
            next: "n",
            prev: "p",
            skip: "s",
            rewind: "arrowleft",
            forward: "arrowright",
            mute: "m",
            volUp: "arrowup",
            volDown: "arrowdown",
            speedUp: "shift+.",
            speedDown: "shift+,"
        }
    };

    // Шаги скорости в меню плеера и для клавиш скорости
    window.AG_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

    // Клавиша по месту на клавиатуре, чтобы F, S и другие работали и в русской раскладке
    const CODE_KEYS = {
        Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
        Minus: '-', Equal: '=', Backquote: '`', Backslash: '\\'
    };
    const codeKey = (code) => {
        const m = /^(?:Key([A-Z])|Digit(\d))$/.exec(code || '');
        if (m) return (m[1] || m[2]).toLowerCase();
        return CODE_KEYS[code] || null;
    };
    const keyName = (key) => (key === ' ' ? 'space' : String(key || '').toLowerCase());
    const MODIFIERS = ['control', 'alt', 'shift', 'meta'];

    /** Названия нажатия для сравнения с настройками keys: по символу и по месту клавиши. Пустой список у одиночного модификатора */
    window.agKeyCombos = function (e) {
        if (!e.key || MODIFIERS.includes(e.key.toLowerCase())) return [];
        const mods = [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift'].filter(Boolean);
        const join = (k) => mods.concat(k).join('+');
        const combos = [join(keyName(e.key))];
        const byPlace = codeKey(e.code);
        if (byPlace && !combos.includes(join(byPlace))) combos.push(join(byPlace));
        return combos;
    };

    /** Действие из настроек keys для нажатия или null */
    window.agKeyAction = function (e, keys) {
        const combos = window.agKeyCombos(e);
        if (!combos.length || e.metaKey) return null;
        for (const combo of combos) {
            const action = Object.keys(keys || {}).find(a => keys[a] === combo);
            if (action) return action;
        }
        return null;
    };

    // Настройки меняются из плеера и со страницы настроек: открытые вкладки подхватывают их без перезагрузки
    window.agOnSettingsChange = function (handler) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.ag_settings) window.getSettings().then(handler);
        });
    };

    window.getSettings = async function () {
        const res = await chrome.storage.local.get(['ag_settings']);
        // Всегда новая копия значений по умолчанию: правка результата не должна менять их для всей вкладки
        const defaults = JSON.parse(JSON.stringify(window.DEFAULT_SETTINGS));
        if (!res.ag_settings) return defaults;
        const merged = { ...defaults, ...res.ag_settings };
        merged.keys = { ...defaults.keys, ...(res.ag_settings.keys || {}) };
        // Плеер сравнивает клавиши в нижнем регистре, а старое окно настроек сохраняло их заглавными
        for (const action of Object.keys(merged.keys)) merged.keys[action] = String(merged.keys[action]).toLowerCase();
        merged.sites_enabled = { ...(res.ag_settings.sites_enabled || {}) };
        return merged;
    };

    // Запись только изменённых полей поверх свежих настроек из хранилища. Вкладка держит копию настроек
    // с момента загрузки: запись копии целиком откатывала то, что поменяли в popup или на другой вкладке
    window.agPatchSettings = async function (patch) {
        const res = await chrome.storage.local.get(['ag_settings']);
        await chrome.storage.local.set({ ag_settings: { ...(res.ag_settings || {}), ...patch } });
        return window.getSettings();
    };

    // Точная проверка origin по суффиксу домена (а не includes, который пропускает animego.me.evil.com)
    const TRUSTED_ORIGIN_SUFFIXES = [
        'animego.me', 'animego.org', 'jut-su.net',
        'kodik.info', 'kodikplayer.com', 'kodikres.com', 'kodik.biz', 'kodik.cc', 'kodik-storage.com',
        'dbcode.info', 'tube-storage.com', 'anivod.com', 'aniqizm.com', 'aniboom.one', 'anifilm.top', 'kombik.info',
        'alloha.yani.tv', 'thealloha.club', 'player.aksor.tv', 'player.cdnvideohub.com', 'ceramet.net',
        // Плеер AnimeVost стоит на домене самого сайта
        'animevost.org', 'vost.pw'
    ];
    window.isValidOrigin = function (origin) {
        try {
            const { protocol, hostname } = new URL(origin);
            if (protocol !== 'https:') return false;
            // Домены плееров + все сайты из реестра modules/shared/sites.js
            const siteHosts = (globalThis.AgSites && globalThis.AgSites.allHosts()) || [];
            return TRUSTED_ORIGIN_SUFFIXES.concat(siteHosts).some(d => hostname === d || hostname.endsWith('.' + d));
        } catch (e) {
            return false;
        }
    };

    window.AG_CONSTANTS = {
        CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
        EPISODE_SWITCH_DEBOUNCE_MS: 800
    };
})();
