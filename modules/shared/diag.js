// modules/shared/diag.js
// Записывает сбои расширения из страниц и кадров плеера в журнал фона (modules/bg-diag.js)

(function (root) {
    'use strict';

    // На странице со сбоем в цикле ошибки шли бы непрерывно
    const MAX_PER_PAGE = 15;
    let sent = 0;

    function note(where, detail) {
        if (sent >= MAX_PER_PAGE) return;
        sent += 1;
        try {
            const text = detail && detail.message ? detail.message : detail;
            const result = chrome.runtime.sendMessage({ action: 'diag_note', where, detail: text == null ? '' : String(text) });
            if (result && result.catch) result.catch(() => {});
        } catch (e) {}
    }

    // Расширение обновилось, а страница ещё открыта: старый скрипт теряет связь. Это не сбой
    const isStaleContext = (text) => /extension context invalidated/i.test(String(text));
    const fileOf = (file) => String(file).replace(/^chrome-extension:\/\/[^/]+\//, '');

    if (typeof window !== 'undefined') {
        window.addEventListener('error', (e) => {
            // Ошибки самой страницы и плеера к расширению не относятся
            if (!String(e.filename || '').startsWith('chrome-extension://') || isStaleContext(e.message)) return;
            note('script_error', `${e.message} ${fileOf(e.filename)}:${e.lineno}`);
        });
        window.addEventListener('unhandledrejection', (e) => {
            const reason = e.reason || {};
            if (!String(reason.stack || '').includes('chrome-extension://') || isStaleContext(reason.message)) return;
            note('script_rejection', reason.message || String(reason));
        });
    }

    root.AgDiag = { note };
})(typeof globalThis !== 'undefined' ? globalThis : this);
