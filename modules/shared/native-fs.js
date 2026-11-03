// modules/shared/native-fs.js
// Настоящий полный экран браузера для блока плеера на странице сайта. Выглядит и закрывается как обычный полный экран,
// и в отличие от полного экрана внутри iframe переживает смену серии: Kodik перезагружает только свой кадр.
// Браузер разрешает его только в ответ на действие пользователя: без него сайты откатываются на старый режим с окном.

(function (root) {
    'use strict';

    const STYLE_ID = 'ag-native-fs-style';

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            html:has(:fullscreen) { overflow: hidden !important; scrollbar-gutter: auto !important; }
            :fullscreen { background: #000 !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }
            .ag-fs-hidden { display: none !important; }
            .ag-fs-fill { position: static !important; display: block !important; width: 100% !important; height: 100% !important; max-width: none !important; max-height: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; transform: none !important; }
            :fullscreen iframe { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; border: 0 !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    let tidyObserver = null;

    function clearTidy() {
        if (tidyObserver) tidyObserver.disconnect();
        tidyObserver = null;
        document.querySelectorAll('.ag-fs-hidden').forEach(e => e.classList.remove('ag-fs-hidden'));
        document.querySelectorAll('.ag-fs-fill').forEach(e => e.classList.remove('ag-fs-fill'));
    }

    // В блоке плеера бывает и другое содержимое сайта: подписи, кнопки. На весь экран остаётся только сам плеер
    function tidy(element) {
        const frames = [...element.querySelectorAll('iframe')];
        const frame = frames.find(f => f.getBoundingClientRect().width > 0) || frames[0];
        if (!frame) return;
        for (let node = frame; node && node !== element; node = node.parentElement) {
            for (const sibling of node.parentElement.children) {
                if (sibling === node) continue;
                sibling.classList.add('ag-fs-hidden');
            }
            if (node !== frame) {
                node.classList.remove('ag-fs-hidden');
                node.classList.add('ag-fs-fill');
            }
        }
    }

    /** Плеер на весь экран сменился: прячем соседей заново, уже вокруг нового кадра */
    function retidy() {
        const element = document.fullscreenElement;
        if (!element) return;
        document.querySelectorAll('.ag-fs-hidden').forEach(e => e.classList.remove('ag-fs-hidden'));
        document.querySelectorAll('.ag-fs-fill').forEach(e => e.classList.remove('ag-fs-fill'));
        tidy(element);
    }

    /** true, если браузер перешёл в полный экран. Вызывать сразу, без задержек: разрешение действует недолго */
    async function request(element) {
        if (!element || !element.requestFullscreen) return false;
        injectStyle();
        try {
            await element.requestFullscreen({ navigationUI: 'hide' });
            if (document.fullscreenElement !== element) return false;
            tidy(element);
            // Сайт может заменить кадр плеера при смене серии или озвучки
            tidyObserver = new MutationObserver(() => {
                clearTimeout(tidyObserver.timer);
                tidyObserver.timer = setTimeout(() => { if (document.fullscreenElement === element) tidy(element); }, 100);
            });
            tidyObserver.observe(element, { childList: true, subtree: true });
            return true;
        } catch (e) {
            return false;
        }
    }

    async function exit() {
        if (!document.fullscreenElement) return;
        try { await document.exitFullscreen(); } catch (e) {}
    }

    if (typeof document !== 'undefined') {
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) clearTidy();
        });
    }

    root.AgNativeFs = {
        request,
        exit,
        retidy,
        /** Срабатывает при любом выходе: Esc, F11, кнопка браузера, удаление блока со страницы */
        onExit(handler) {
            document.addEventListener('fullscreenchange', () => {
                if (!document.fullscreenElement) handler();
            });
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
