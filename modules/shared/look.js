// modules/shared/look.js
// Визуал расширения: стиль и тема окна расширения, настроек, «Случайного аниме», Топа, расписания и подбора.
// Выбор лежит в ag_settings.look = { style, theme }; theme 'auto' — родная тема стиля.
// Цвета, шрифты и форма стилей — в modules/shared/looks.css: переменные --ap-* по атрибутам data-look и data-theme.
// Подключается первым скриптом в <head>: страница сразу берёт запомненный вид и не мигает классическим.
// Плеер оформляется отдельно (playerSkin, modules/player/shell-view.js), значок лисы на сайтах — тоже.
(function () {
    'use strict';

    const STYLES = [
        { id: 'classic', name: 'Классический', native: 'dark', about: 'Нынешний вид Anime+: спокойный тёмный фон, красный акцент, системный шрифт.' },
        { id: 'cinema', name: 'Кинозал', native: 'dark', about: 'Глубокий чёрный, как в зале кинотеатра, мягкие скругления и золотые оценки.' },
        { id: 'magazine', name: 'Журнал', native: 'light', about: 'Бумага и печать: прямые углы, тонкие линейки, текст с засечками.' },
        { id: 'manga', name: 'Манга', native: 'light', about: 'Белая бумага и чёрная тушь: растр на фоне, жирные заголовки, один красный.' },
        { id: 'arcade', name: 'Аркада', native: 'dark', about: 'Ночной игровой зал: фиолетовый фон, неоновые розовый и голубой.' },
        { id: 'bento', name: 'Плитки', native: 'light', about: 'Светлые карточки с крупными скруглениями и фиолетовым акцентом, как в современном приложении.' }
    ];
    const THEMES = ['auto', 'light', 'dark'];
    const CACHE_KEY = 'ag-look';

    const clean = (value) => {
        const v = value && typeof value === 'object' ? value : {};
        return {
            style: STYLES.some(s => s.id === v.style) ? v.style : STYLES[0].id,
            theme: THEMES.includes(v.theme) ? v.theme : 'auto'
        };
    };

    // Какой стиль и какая тема на деле: 'auto' превращается в родную тему стиля
    const resolve = (value) => {
        const v = clean(value);
        const style = STYLES.find(s => s.id === v.style);
        return { style: style.id, theme: v.theme === 'auto' ? style.native : v.theme };
    };

    // Страницы со своей раскладкой у стиля («Случайное», Топ) перерисовываются при смене: событие ag-look на document
    const apply = (value, root) => {
        const r = resolve(value);
        const el = root || document.documentElement;
        const changed = el.dataset.look !== r.style || el.dataset.theme !== r.theme;
        el.dataset.look = r.style;
        el.dataset.theme = r.theme;
        if (changed && !root && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('ag-look', { detail: r }));
        return r;
    };

    window.AgLook = { STYLES, THEMES, clean, resolve, apply };

    if (typeof document === 'undefined') return;

    // localStorage общий у страниц расширения: следующая страница откроется сразу в нужном виде.
    // В приватном окне или при запрете хранилища он недоступен, тогда вид придёт из настроек чуть позже
    const remember = (value) => {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(clean(value))); } catch { /* без запоминания */ }
    };
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { cached = null; }
    apply(cached);

    const storage = window.chrome && window.chrome.storage;
    if (!storage || !storage.local) return;
    Promise.resolve(storage.local.get(['ag_settings'])).then((res) => {
        const look = res && res.ag_settings ? res.ag_settings.look : undefined;
        apply(look);
        remember(look);
    }).catch(() => { /* страница остаётся в запомненном виде */ });
    if (storage.onChanged) {
        storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.ag_settings) return;
            const look = changes.ag_settings.newValue ? changes.ag_settings.newValue.look : undefined;
            apply(look);
            remember(look);
        });
    }
})();
