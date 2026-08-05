(async function () {
    'use strict';

    window.AG_RED = "#ff4a4a";
    window.AG_FONT = '"Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    window.DEFAULT_SETTINGS = {
        global_enabled: true,
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
        shiki_client_id: "NschdT6XXv8H3IjrJ7DSzDPibY6I16hC_dBPxMs5vqo",
        shiki_worker_url: "",
        shiki_auto_mark_watching: true,
        shiki_auto_mark_completed: true,
        shiki_sync_episodes: true,
        shiki_show_toasts: true,
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
        return merged;
    };

    window.AG_CONSTANTS = {
        CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
        DEFAULT_SHIKI_CLIENT_ID: "NschdT6XXv8H3IjrJ7DSzDPibY6I16hC_dBPxMs5vqo",
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
