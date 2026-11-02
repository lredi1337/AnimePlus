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
            :fullscreen { background: #000 !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }
            :fullscreen .player-video, :fullscreen .player-video__online, :fullscreen .player-video__container { flex: 1 1 100% !important; width: 100% !important; height: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
            :fullscreen iframe { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; border: 0 !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    /** true, если браузер перешёл в полный экран. Вызывать сразу, без задержек: разрешение действует недолго */
    async function request(element) {
        if (!element || !element.requestFullscreen) return false;
        injectStyle();
        try {
            await element.requestFullscreen({ navigationUI: 'hide' });
            return document.fullscreenElement === element;
        } catch (e) {
            return false;
        }
    }

    async function exit() {
        if (!document.fullscreenElement) return;
        try { await document.exitFullscreen(); } catch (e) {}
    }

    root.AgNativeFs = {
        request,
        exit,
        isActive: () => !!document.fullscreenElement,
        /** Срабатывает при любом выходе: Esc, F11, кнопка браузера, удаление блока со страницы */
        onExit(handler) {
            document.addEventListener('fullscreenchange', () => {
                if (!document.fullscreenElement) handler();
            });
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
