// modules/shared/guide.js
// Экскурсия с лисой: задания и их состояние. Общее для окна расширения, страницы настроек и плеера

(function (root) {
    'use strict';

    const KEY = 'ag_guide';
    const REVIEW_URL = 'https://chromewebstore.google.com/detail/anime+/mgcaideibpbdddnbedoefmabladoaajg/reviews';

    const TASKS = [
        { id: 'play', title: 'Запустите серию', hint: 'На любом поддерживаемом сайте' },
        { id: 'skip', title: 'Пропустите песню', hint: 'Кнопкой +89 в плеере или автопропуском' },
        { id: 'panel', title: 'Откройте серии или озвучку', hint: 'Кнопки внизу плеера' },
        { id: 'shiki', title: 'Подключите Shikimori', hint: 'Серии будут отмечаться сами' },
        { id: 'settings', title: 'Загляните в настройки', hint: 'Шестерёнка вверху этого окна' }
    ];

    const TASK_IDS = TASKS.map(t => t.id);

    const normalize = (raw) => {
        const state = raw && typeof raw === 'object' ? raw : {};
        const tasks = state.tasks && typeof state.tasks === 'object' ? state.tasks : {};
        return { tourDone: state.tourDone === true, questHidden: state.questHidden === true, tipsDone: state.tipsDone === true, rated: state.rated === true, tasks };
    };

    const progress = (state) => {
        const done = TASK_IDS.filter(id => state.tasks[id] === true).length;
        return { done, total: TASK_IDS.length, finished: done === TASK_IDS.length };
    };

    const read = async () => normalize((await chrome.storage.local.get([KEY]))[KEY]);

    // Записи по очереди: два действия подряд иначе перезапишут друг друга
    let queue = Promise.resolve();
    const update = (change) => {
        const next = queue.then(async () => {
            const current = await read();
            const state = { ...current, ...change(current) };
            await chrome.storage.local.set({ [KEY]: state });
            return state;
        });
        queue = next.catch(() => {});
        return next;
    };

    const patch = (changes) => update(() => changes);

    // Зовётся при каждом нажатии в плеере, поэтому в хранилище пишем один раз за загрузку страницы
    const marked = new Set();
    const mark = async (id) => {
        if (!TASK_IDS.includes(id) || marked.has(id)) return;
        marked.add(id);
        try {
            await update((state) => ({ tasks: { ...state.tasks, [id]: true } }));
        } catch (e) {}
    };

    const reset = () => {
        marked.clear();
        return chrome.storage.local.set({ [KEY]: normalize(null) });
    };

    const api = { KEY, REVIEW_URL, TASKS, normalize, progress, read, patch, mark, reset };
    root.AgGuide = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
