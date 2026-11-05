// modules/player/agp-to-kodik.js
// Собственный плеер сайтов семейства DLE (Плеер Джутсу и его копии): с блокировщиком рекламы он всё равно не запустится,
// а без него показывает рекламу. У него есть своя кнопка перехода на Kodik: нажимаем её сразу. Сайт сам подменит кадр на Kodik.

(function () {
    'use strict';

    const SITES = /(^|\.)(jut-su\.net|yammyanime\.club|animego\.online|yummyanime\.tv)$/;
    const TO_KODIK = /открыть плеер kodik|в обычном плеере/i;
    const STEP_MS = 100;
    const WAIT_MS = 30000;

    const topHost = () => {
        try {
            const parents = location.ancestorOrigins;
            return new URL(parents && parents.length ? parents[parents.length - 1] : document.referrer).hostname;
        } catch (e) {
            return '';
        }
    };

    async function isEnabledHere(host) {
        if (!SITES.test(host)) return false;
        const site = globalThis.AgSites && globalThis.AgSites.byHost(host);
        if (!site) return false;
        const { ag_settings: settings } = await chrome.storage.local.get(['ag_settings']);
        return globalThis.AgSites.isEnabled(settings || {}, site.id);
    }

    function pressWhenReady() {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            if (Date.now() - startedAt > WAIT_MS) {
                // Сайт мог сменить текст кнопки: тогда зритель снова увидит плеер сайта
                clearInterval(timer);
                if (globalThis.AgDiag) globalThis.AgDiag.note('agp_no_button');
                return undefined;
            }
            const button = [...document.querySelectorAll('button')].find(b => TO_KODIK.test(b.textContent));
            if (!button) return undefined;
            clearInterval(timer);
            button.click();
            return undefined;
        }, STEP_MS);
    }

    isEnabledHere(topHost()).then((on) => { if (on) pressWhenReady(); }).catch(() => {});
})();
