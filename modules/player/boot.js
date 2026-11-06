// modules/player/boot.js
// Запускается раньше всего в кадре плеера: родной интерфейс Kodik не должен мелькнуть до появления оболочки.
// Сама оболочка загружается позже. Скрывается только управление: видео и реклама остаются на месте.
// Если оболочка не появилась (выключена, сбой, чужой сайт), родной интерфейс возвращается сам.

(function () {
    'use strict';

    // На доменах самих сайтов (AnimeVost) загрузчик нужен только в кадре их плеера: страницу сайта и баннеры не трогаем
    const SITE_PLAYER_PATH = /^[/]frame5[.]php$/;
    if (globalThis.AgSites && globalThis.AgSites.byHost(location.hostname) && !SITE_PLAYER_PATH.test(location.pathname)) return;

    // ceramet.net сам пропускает песни и уводит на следующую серию за полминуты до конца, а прочитать настройку успевает при запуске.
    // Пропуском и переходом управляют только настройки зрителя, поэтому выключаем это раньше самого плеера
    function disableCerametSkips() {
        if (!/(^|\.)ceramet\.net$/.test(location.hostname)) return;
        const id = (location.pathname.match(/(\d+)\/?$/) || [])[1];
        if (!id) return;
        try {
            const saved = JSON.parse(localStorage.getItem(id) || '{}');
            localStorage.setItem(id, JSON.stringify({ ...saved, skips: { intro: false, end: false } }));
        } catch (e) {}
    }
    disableCerametSkips();

    // На этих сайтах плеер CVH открыт на весь тайтл, а списков сайт не ведёт. Серии и озвучки он сообщает сообщением от страницы-обёртки.
    // На других сайтах серию и озвучку задаёт сайт, и родные списки плеера его только сбивали бы
    const topHost = () => {
        try {
            const parents = location.ancestorOrigins;
            return new URL(parents && parents.length ? parents[parents.length - 1] : document.referrer).hostname;
        } catch (e) {
            return '';
        }
    };
    // Первое сообщение приходит очень рано, поэтому слушаем с самого начала
    function listenCvhControls() {
        if (!/(^|\.)cdnvideohub\.com$/.test(location.hostname) || !(globalThis.AgSites && globalThis.AgSites.isDleHost(topHost()))) return;
        globalThis.AgCvhOwnLists = true;
        let lastPayload = '';
        window.addEventListener('message', (e) => {
            const d = e.data;
            if (e.source !== window.parent || !d || d.type !== 'renderControls' || typeof d.key !== 'string' || !d.key.startsWith('cvh_player')) return;
            if (d.payload === lastPayload) return;
            try {
                globalThis.AgCvhControls = JSON.parse(d.payload);
            } catch (err) {
                return;
            }
            lastPayload = d.payload;
            document.dispatchEvent(new Event('ag-player-lists'));
        }, true);
    }
    listenCvhControls();

    const BOOT_CLASS = 'ag-shell-boot';
    const WAIT_MS = 2500;
    const root = document.documentElement;
    if (!root) return;

    const style = document.createElement('style');
    style.id = 'ag-shell-boot-style';
    style.textContent = `
        html.${BOOT_CLASS}, html.${BOOT_CLASS} body { background: #000 !important; }
        html.${BOOT_CLASS} :is(.allplay__controls, .allplay__control--overlaid, .allplay__skip, .selects, .time_save, [class*="_controls_"], .vjs-control-bar, .vjs-big-play-button, .playlistControlWrapper, .navigationArrow_wrapper) { opacity: 0 !important; }
        html.${BOOT_CLASS} .fp-ui, html.${BOOT_CLASS} .serial-panel, html.${BOOT_CLASS} .play_button, html.${BOOT_CLASS} .play_background { opacity: 0 !important; pointer-events: none !important; }
    `;
    root.appendChild(style);
    root.classList.add(BOOT_CLASS);

    const release = () => {
        root.classList.remove(BOOT_CLASS);
        style.remove();
    };
    globalThis.AgPlayerBoot = { release };

    chrome.storage.local.get('ag_settings').then((saved) => {
        const s = (saved && saved.ag_settings) || {};
        if (s.global_enabled === false) release();
    }).catch(release);

    setTimeout(() => {
        if (!document.getElementById('ag-shell')) release();
    }, WAIT_MS);
})();
