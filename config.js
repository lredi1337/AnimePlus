(async function () {
    'use strict';

    window.AG_RED = "#ef4444";
    window.AG_FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", Arial, sans-serif';

    window.DEFAULT_SETTINGS = {
        global_enabled: true,
        // Включение по сайтам: { [siteId]: false } выключает расширение на сайте (см. modules/shared/sites.js)
        sites_enabled: {},
        autoNext: true, autoFS: true, autoSkip: true, autoPlay: true,
        showNav: true, showSkipBtn: true, showPiP: true, showCenterBtn: true, showDBL: true,
        hideTime: 2000, extId: chrome.runtime.id, use_standard_covers: false,
        ongoing_enabled: true,
        ongoing_hide_chinese: true,
        ongoing_hide_long_running: false,
        ongoing_min_score: 0,
        random_min_score: 6.0,
        random_kinds: ["tv", "movie", "ona", "ova", "special"],
        ongoing_types: ["TV", "ONA", "OVA"],
        shiki_enabled: true,
        shiki_client_id: "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI",
        shiki_worker_url: "",
        shiki_auto_mark_watching: true,
        shiki_auto_mark_completed: true,
        shiki_sync_episodes: true,
        shiki_show_toasts: true,
        notif_enabled: true,
        notif_interval_min: 30,
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
            forward: "arrowright"
        }
    };

    window.getSettings = async function () {
        const res = await chrome.storage.local.get(['ag_settings']);
        if (!res.ag_settings) return window.DEFAULT_SETTINGS;
        const merged = { ...window.DEFAULT_SETTINGS, ...res.ag_settings };
        merged.keys = { ...window.DEFAULT_SETTINGS.keys, ...(res.ag_settings.keys || {}) };
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
        'dbcode.info', 'tube-storage.com', 'anivod.com', 'aniqizm.com', 'aniboom.one', 'anifilm.top', 'kombik.info'
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
        DEFAULT_SHIKI_CLIENT_ID: "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI",
        EPISODE_SWITCH_DEBOUNCE_MS: 800,
        AUTOPLAY_TIMEOUT_MS: 15000
    };

    window.AnimePlus = window.AnimePlus || {
        Config: {},
        UI: {},
        Utils: {},
        Modules: {}
    };

    window.AnimePlus.Config = {
        RED_COLOR: window.AG_RED,
        FONT_FAMILY: window.AG_FONT,
        DEFAULT_SETTINGS: window.DEFAULT_SETTINGS,
        CONSTANTS: window.AG_CONSTANTS,
        isValidOrigin: window.isValidOrigin,
        getSettings: window.getSettings
    };
})();
