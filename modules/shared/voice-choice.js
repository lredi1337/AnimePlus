// modules/shared/voice-choice.js
// Озвучка, которую пользователь выбрал сам. Такой выбор важнее автовыбора и списка приоритетов:
// он запоминается для тайтла и действует на следующих сериях, пока пользователь его не сменит.
// Считается только настоящее действие пользователя (event.isTrusted), а не клики самого расширения.

(function (root) {
    'use strict';

    const STORE_KEY = 'ag_voice_choice';
    const MAX_ITEMS = 300;
    const ASK_TIMEOUT_MS = 500;

    const clean = (s) => String(s || '').toLowerCase().replace(/\(ошибка\)/g, '').replace(/[^a-z0-9а-яё]/gi, '').trim();
    // «AniLibria.TV (24 эп.)» → «AniLibria.TV»
    const voiceName = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    const pageKey = () => `page:${location.hostname}${location.pathname.replace(/\/+$/, '')}`;

    let writeQueue = Promise.resolve();

    const readAll = async () => {
        try {
            const saved = await chrome.storage.local.get(STORE_KEY);
            return (saved && saved[STORE_KEY]) || {};
        } catch (e) {
            return {};
        }
    };

    function get(key) {
        return readAll().then(all => (all[key] ? all[key].voice : null));
    }

    function set(key, voice) {
        const name = voiceName(voice);
        if (!key || !name) return Promise.resolve();
        writeQueue = writeQueue.then(async () => {
            const all = await readAll();
            all[key] = { voice: name, at: Date.now() };
            const keys = Object.keys(all);
            if (keys.length > MAX_ITEMS) {
                keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MAX_ITEMS).forEach((k) => { delete all[k]; });
            }
            try { await chrome.storage.local.set({ [STORE_KEY]: all }); } catch (e) {}
        });
        return writeQueue;
    }

    /** Точное совпадение важнее частичного: «AniStar» не должен выбирать «AniStar & DEEP» */
    function pick(items, voice, getText) {
        const target = clean(voiceName(voice));
        if (!target) return null;
        const text = (item) => clean(voiceName(getText(item)));
        return items.find(item => text(item) === target)
            || items.find((item) => {
                const t = text(item);
                return t && (t.includes(target) || target.includes(t));
            })
            || null;
    }

    /** Плеер в iframe спрашивает у страницы сайта: она знает выбор, сделанный на её кнопках */
    function askPage() {
        return new Promise((resolve) => {
            if (window === window.top) return resolve(null);
            const done = (value) => {
                window.removeEventListener('message', onMessage);
                clearTimeout(timer);
                resolve(value);
            };
            const onMessage = (e) => {
                if (e.source === window.top && e.data && e.data.type === 'AG_VOICE_CHOICE') done(e.data.voice || null);
            };
            const timer = setTimeout(() => done(null), ASK_TIMEOUT_MS);
            window.addEventListener('message', onMessage);
            try { window.top.postMessage({ type: 'AG_GET_VOICE_CHOICE' }, '*'); } catch (e) { done(null); }
        });
    }

    function tellPage(voice) {
        if (window === window.top) return;
        try { window.top.postMessage({ type: 'AG_VOICE_CHOSEN', voice: voiceName(voice) }, '*'); } catch (e) {}
    }

    // Страница сайта отвечает плееру и запоминает выбор, сделанный внутри плеера
    if (typeof window !== 'undefined' && window === window.top) {
        window.addEventListener('message', async (e) => {
            const data = e.data;
            if (!data || typeof data.type !== 'string') return;
            if (root.isValidOrigin && !root.isValidOrigin(e.origin)) return;
            if (data.type === 'AG_GET_VOICE_CHOICE') {
                const voice = await get(pageKey());
                try { e.source.postMessage({ type: 'AG_VOICE_CHOICE', voice }, '*'); } catch (err) {}
            } else if (data.type === 'AG_VOICE_CHOSEN') {
                set(pageKey(), data.voice);
            }
        });
    }

    root.AgVoiceChoice = { get, set, pick, askPage, tellPage, pageKey, voiceName };
})(typeof globalThis !== 'undefined' ? globalThis : this);
