// modules/shared/player-choice.js
// Плеер, который зритель выбрал сам. Запоминается для сайта: без выбора расширение включает Kodik, на нём есть всё аниме.
// Считается только настоящее действие зрителя, а не нажатия самого расширения.

(function (root) {
    'use strict';

    const KEY = 'ag_player_choice';

    const clean = (name) => String(name || '').toLowerCase().replace(/^плеер\s*/, '').replace(/[^a-zа-яё0-9]/g, '');
    const same = (a, b) => !!clean(a) && clean(a) === clean(b);
    const isKodik = (name) => /kodik/i.test(String(name || ''));

    const readAll = async () => {
        try {
            const saved = await chrome.storage.local.get([KEY]);
            return (saved && saved[KEY]) || {};
        } catch (e) {
            return {};
        }
    };

    const get = async (siteId) => (await readAll())[siteId] || null;

    let queue = Promise.resolve();
    const set = (siteId, name) => {
        queue = queue.then(async () => {
            const all = await readAll();
            // Kodik и так выбирается по умолчанию: запись не нужна
            if (isKodik(name)) delete all[siteId];
            else all[siteId] = String(name);
            await chrome.storage.local.set({ [KEY]: all });
        }).catch(() => {});
        return queue;
    };

    const api = { same, isKodik, get, set };
    root.AgPlayerChoice = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
