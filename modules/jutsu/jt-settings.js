// modules/jutsu/jt-settings.js
// Вход в настройки на Jut-Su: шестерёнка в шапке и общее окно настроек (modules/animego/ag-settings.js)

(function () {
    'use strict';

    function injectJutsuSettingsStyles() {
        if (document.getElementById('jt-settings-styles')) return;
        const style = document.createElement('style');
        style.id = 'jt-settings-styles';
        style.innerText = `
            .jutsu-header__btn-settings { background: none !important; border: none !important; color: #a8b3cf !important; cursor: pointer !important; font-size: 20px !important; padding: 0 10px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; height: 40px !important; transition: color 0.25s, transform 0.25s !important; margin: 0 !important; }
            .jutsu-header__btn-settings:hover { color: #818cf8 !important; transform: rotate(45deg) !important; }
        `;
        document.head.appendChild(style);
    }

    window.jtInjectHeaderGearButton = function (openSettingsCallback) {
        if (document.getElementById('ag-header-settings-gear')) return;

        const header = document.querySelector('.jutsu-header__main') ||
            document.querySelector('.jutsu-header') ||
            document.querySelector('.header') ||
            document.querySelector('#header');

        if (!header) return;

        injectJutsuSettingsStyles();

        const themeBtn = header.querySelector('.jutsu-header__btn-theme-toggle') || header.querySelector('[class*="theme"]');

        const gear = document.createElement('button');
        gear.id = 'ag-header-settings-gear';
        gear.type = 'button';
        gear.className = 'jutsu-header__btn-settings icon icon-cog';
        gear.title = 'Настройки Anime+';
        gear.setAttribute('aria-label', 'Настройки Anime+');
        gear.innerHTML = '';

        gear.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openSettingsCallback === 'function') openSettingsCallback();
        };

        if (themeBtn && themeBtn.parentNode) {
            themeBtn.parentNode.insertBefore(gear, themeBtn);
        } else {
            header.appendChild(gear);
        }
    };

    window.jtOpenJutsuSettingsModal = function (settings, saveCallback) {
        window.agOpenAnimeGoSettingsModal(settings, saveCallback, {
            brand: 'Jut-Su',
            getPlayerWindows: () => Array.from(document.querySelectorAll('iframe')).map(f => f.contentWindow).filter(Boolean),
            extraInterfaceRows: [{
                id: 'use_standard_covers',
                title: 'Стандартные обложки',
                desc: 'Заменять постеры Jut-Su на обложки со Shikimori и Kitsu.'
            }]
        });
    };
})();
