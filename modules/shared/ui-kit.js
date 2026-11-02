// modules/shared/ui-kit.js
// Общее для интерфейса расширения: иконки (вместо эмодзи, которые в каждой системе выглядят по-своему)
// и акцентный цвет сайта. Значения стилей — в modules/shared/tokens.css.

(function (root) {
    'use strict';

    const PATHS = {
        alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
        bell: '<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15l1.5-2Z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
        check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
        clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
        close: '<path d="m6 6 12 12M18 6 6 18"/>',
        dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 8.5v.01M15.5 8.5v.01M12 12v.01M8.5 15.5v.01M15.5 15.5v.01"/>',
        download: '<path d="M12 4v11M7.5 11 12 15.5l4.5-4.5M5 20h14"/>',
        external: '<path d="M14 5h5v5M19 5l-8.5 8.5"/><path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V8a1.5 1.5 0 0 1 1.5-1.5H10"/>',
        gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.2-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 .9-1.5V3.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5.9h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
        history: '<path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l3 2"/>',
        key: '<circle cx="8" cy="15.5" r="4"/><path d="m11 12.5 8.5-8.5M16 7.5l3 3M13.5 10l2 2"/>',
        keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10v.01M10 10v.01M14 10v.01M17.5 10v.01M8 14h8"/>',
        list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5v.01M4.5 12v.01M4.5 17.5v.01"/>',
        mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
        music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
        play: '<path d="M7.5 4.8v14.4a.6.6 0 0 0 .9.5l11.4-7.2a.6.6 0 0 0 0-1L8.4 4.3a.6.6 0 0 0-.9.5Z" fill="currentColor"/>',
        power: '<path d="M12 3.5V12M7 6.5a8 8 0 1 0 10 0"/>',
        refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14 4.5l2-2M20 20v-4.5h-4.5"/>',
        search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
        sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
        star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 16.9l-5.3 2.8 1.1-5.9-4.3-4.1 5.9-.8L12 3.5Z" fill="currentColor"/>',
        trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0V4ZM8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11M12 14v3.5M8 20.5h8M9.5 20.5c0-1.7 1-3 2.5-3s2.5 1.3 2.5 3"/>',
        tv: '<rect x="3" y="5" width="18" height="12.5" rx="2"/><path d="M8.5 21h7M10 9l4.5 2.3L10 13.5V9Z"/>',
        upload: '<path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 20h14"/>',
        volume: '<path d="M4 9.5v5h3.5L12 18.5v-13l-4.5 4H4Z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>'
    };

    const hexToRgb = (hex) => {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
        return m ? [1, 2, 3].map(i => parseInt(m[i], 16)) : null;
    };

    // Относительная яркость по WCAG: на жёлтом и зелёном белый текст не читается
    const luminance = ([r, g, b]) => {
        const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };

    const AgUI = {
        /** SVG-строка иконки; цвет наследуется от текста */
        icon(name, size = 16) {
            const paths = PATHS[name];
            if (!paths) return '';
            return `<svg class="ap-icon" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink:0;vertical-align:-0.15em;">${paths}</svg>`;
        },

        /** Та же иконка как DOM-элемент */
        iconEl(name, size = 16) {
            const doc = new DOMParser().parseFromString(AgUI.icon(name, size), 'text/html');
            return doc.querySelector('svg');
        },

        /** Заполняет элементы <span data-ap-icon="имя" data-ap-size="16"> в статичной разметке */
        hydrate(scope = document) {
            scope.querySelectorAll('[data-ap-icon]').forEach((node) => {
                node.innerHTML = AgUI.icon(node.dataset.apIcon, Number(node.dataset.apSize) || 16);
            });
        },

        /** Цвет текста поверх акцента */
        onAccent(color) {
            const rgb = hexToRgb(color);
            return rgb && luminance(rgb) > 0.32 ? '#14161c' : '#ffffff';
        },

        /** Акцент на элементе (по умолчанию на всю страницу) */
        applyAccent(color, el = document.documentElement) {
            const rgb = hexToRgb(color);
            if (!rgb) return;
            const [r, g, b] = rgb;
            el.style.setProperty('--ap-accent', color);
            el.style.setProperty('--ap-accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`);
            el.style.setProperty('--ap-accent-line', `rgba(${r}, ${g}, ${b}, 0.5)`);
            el.style.setProperty('--ap-on-accent', AgUI.onAccent(color));
        },

        /** Сброс акцента к цвету Anime+ из tokens.css */
        resetAccent(el = document.documentElement) {
            ['--ap-accent', '--ap-accent-soft', '--ap-accent-line', '--ap-on-accent'].forEach(p => el.style.removeProperty(p));
        }
    };

    root.AgUI = AgUI;
})(typeof globalThis !== 'undefined' ? globalThis : window);
