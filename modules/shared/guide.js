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
        { id: 'switch', title: 'Смените плеер или озвучку', hint: 'Видео продолжится с того же места' },
        { id: 'shiki', title: 'Подключите Shikimori', hint: 'Серии будут отмечаться сами' },
        { id: 'settings', title: 'Загляните в настройки', hint: 'Шестерёнка вверху этого окна' }
    ];

    const TASK_IDS = TASKS.map(t => t.id);

    // Просьба об оценке не зависит от Shikimori: аккаунт есть не у всех. Смена плеера появилась позже, и тем, кто уже прошёл задания, просьбу она не отодвигает
    const RATING_TASKS = TASK_IDS.filter(id => id !== 'shiki' && id !== 'switch');
    const DAY_MS = 24 * 60 * 60 * 1000;
    const RATING_AFTER_MS = 3 * DAY_MS;
    const RATING_LATER_MS = 14 * DAY_MS;
    const RATING_MAX_LATER = 2;

    const normalize = (raw) => {
        const state = raw && typeof raw === 'object' ? raw : {};
        const tasks = state.tasks && typeof state.tasks === 'object' ? state.tasks : {};
        return { tourDone: state.tourDone === true, questHidden: state.questHidden === true, tipsDone: state.tipsDone === true, switchTipDone: state.switchTipDone === true, rated: state.rated === true, firstSeen: Number(state.firstSeen) || 0, rateLaterUntil: Number(state.rateLaterUntil) || 0, rateLaterCount: Number(state.rateLaterCount) || 0, tasks };
    };

    const progress = (state) => {
        const done = TASK_IDS.filter(id => state.tasks[id] === true).length;
        return { done, total: TASK_IDS.length, finished: done === TASK_IDS.length };
    };

    /** Пора ли просить оценку: обучение пройдено или расширением уже пользуются несколько дней */
    const ratingDue = (state, now = Date.now()) => {
        if (state.rated || !state.tourDone || now < state.rateLaterUntil) return false;
        if (RATING_TASKS.every(id => state.tasks[id] === true)) return true;
        return state.tasks.play === true && state.firstSeen > 0 && now - state.firstSeen >= RATING_AFTER_MS;
    };

    /** «Не сейчас»: спросим ещё раз через две недели, а после второго отказа больше не спрашиваем */
    const ratingLater = (state, now = Date.now()) => {
        const rateLaterCount = state.rateLaterCount + 1;
        return { rateLaterCount, rateLaterUntil: now + RATING_LATER_MS, rated: rateLaterCount >= RATING_MAX_LATER };
    };

    const read = async () => normalize((await chrome.storage.local.get([KEY]))[KEY]);

    // Записи по очереди: два действия подряд иначе перезапишут друг друга
    let queue = Promise.resolve();
    const update = (change) => {
        const next = queue.then(async () => {
            const current = await read();
            const state = { ...current, firstSeen: current.firstSeen || Date.now(), ...change(current) };
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

    const DEMO_CSS = `
        .ag-switch-demo { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; color: #fff; font-size: 12px; line-height: 1.25; }
        .ag-switch-demo .card { flex: 1 1 0; min-width: 0; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.14); }
        .ag-switch-demo .card b { display: block; overflow: hidden; font-weight: 600; white-space: nowrap; text-overflow: ellipsis; }
        .ag-switch-demo .card span { color: #c9ced9; font-variant-numeric: tabular-nums; }
        .ag-switch-demo .from { animation: ag-demo-from 3s ease-in-out infinite; }
        .ag-switch-demo .to { animation: ag-demo-to 3s ease-in-out infinite; }
        .ag-switch-demo .arrow { flex: none; color: #ef4444; font-size: 16px; font-weight: 700; }
        @keyframes ag-demo-from { 0%, 35% { opacity: 1; } 55%, 100% { opacity: .4; } }
        @keyframes ag-demo-to { 0%, 35% { opacity: .4; border-color: rgba(255,255,255,.14); } 55%, 100% { opacity: 1; border-color: #ef4444; } }
        @media (prefers-reduced-motion: reduce) { .ag-switch-demo .from, .ag-switch-demo .to { animation: none; } }
    `;

    /** Наглядно: было одно, стало другое, а время серии то же самое */
    const switchDemo = (from, to, time) => {
        const box = document.createElement('div');
        box.className = 'ag-switch-demo';
        box.setAttribute('aria-hidden', 'true');
        const style = document.createElement('style');
        style.textContent = DEMO_CSS;
        const card = (cls, name, mark) => {
            const el = document.createElement('div');
            el.className = `card ${cls}`;
            const b = document.createElement('b');
            b.textContent = name;
            const span = document.createElement('span');
            span.textContent = `${mark} ${time}`;
            el.append(b, span);
            return el;
        };
        const arrow = document.createElement('div');
        arrow.className = 'arrow';
        arrow.textContent = '→';
        box.append(style, card('from', from, '❚❚'), arrow, card('to', to, '▶'));
        return box;
    };

    const api = { KEY, REVIEW_URL, TASKS, switchDemo, normalize, progress, ratingDue, ratingLater, read, patch, mark, reset };
    root.AgGuide = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
