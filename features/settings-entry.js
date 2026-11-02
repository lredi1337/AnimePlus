// features/settings-entry.js
// Пункт «Настройки Anime+» в меню сайта (выпадающее меню профиля на ru.yummyani.me, шапка old.yummyani.me, yummyanime.tv и др.).
// Открывает полнофункциональное окно настроек расширения (такое же, как на AnimeGO и Jut-Su),
// с акцентным цветом и названием текущего сайта.

(function () {
    'use strict';

    const GEAR_SVG_PATH = 'm19.41 12.19-1.84-1.44c.02-.22.04-.48.04-.76 0-.27-.02-.53-.04-.76l1.84-1.44a.9.9 0 00.22-1.15L17.72 3.35a.89.89 0 00-1.11-.4l-2.17.87a7.45 7.45 0 00-1.3-.76l-.33-2.3A.89.89 0 0011.92 0H8.08c-.45 0-.83.33-.88.76l-.33 2.31a7.68 7.68 0 00-1.3.75l-2.18-.87c-.41-.16-.9.02-1.1.39L.37 6.65A.9.9 0 00.59 7.81l1.84 1.44c-.03.28-.04.53-.04.75 0 .23.01.47.04.76L.59 12.19a.9.9 0 00-.22 1.15l1.91 3.31a.89.89 0 001.11.4l2.17-.87c.42.3.85.55 1.3.76l.33 2.3a.89.89 0 00.88.77h3.84c.45 0 .83-.33.88-.76l.33-2.31a7.72 7.72 0 001.3-.76l2.18.87a.88.88 0 001.1-.39l1.92-3.32a.9.9 0 00-.22-1.14ZM10 13.33A3.34 3.34 0 016.66 10 3.34 3.34 0 0110 6.67 3.34 3.34 0 0113.34 10 3.34 3.34 0 0110 13.33Z';

    const STYLE_ID = 'ag-settings-entry-style';
    const injectStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .ag-header-gear-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 32px !important;
                height: 32px !important;
                margin: 0 8px !important;
                color: #fff !important;
                font-size: 18px !important;
                cursor: pointer !important;
                text-decoration: none !important;
                background: transparent !important;
                border: none !important;
                line-height: 1 !important;
                transition: color 0.25s, transform 0.25s !important;
            }
            .ag-header-gear-btn:hover {
                color: var(--primary-color, var(--ag-accent, #ec4899)) !important;
                transform: rotate(45deg);
            }
            .ag-header-gear-btn svg {
                width: 20px !important;
                height: 20px !important;
                display: block !important;
            }
            .ag-native-gear__icon {
                display: grid;
                place-items: center;
                width: 32px;
                height: 32px;
                border-radius: 10px;
                background: rgba(128, 128, 128, 0.18);
                transition: background 0.2s;
            }
            .ag-native-gear:hover .ag-native-gear__icon { background: rgba(128, 128, 128, 0.32); }
            .ag-native-gear__icon svg { fill: var(--main-permanent, currentColor); }
            .ag-settings-icon-only {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            .ag-settings-icon-only svg {
                width: 18px !important;
                height: 18px !important;
                display: block !important;
                fill: currentColor !important;
                transition: transform 0.25s ease !important;
            }
            .ag-settings-icon-only:hover svg {
                transform: rotate(45deg);
            }
            /* На узкой шапке иконка отняла бы место у поиска; настройки остаются в меню профиля */
            @media (max-width: 1100px) { .ag-native-gear { display: none !important; } }
        `;
        (document.head || document.documentElement).appendChild(style);
    };

    window.AgFeatures = window.AgFeatures || {};

    window.AgFeatures.settingsEntry = function ({ provider, scope, site, settings }) {
        let currentSettings = settings;

        const openSettings = async () => {
            if (typeof window.agOpenAnimeGoSettingsModal !== 'function') return;
            currentSettings = await window.getSettings();
            window.agOpenAnimeGoSettingsModal(currentSettings, async (newS) => {
                currentSettings = newS;
            }, {
                brand: (site.name || 'Anime+').replace(/\s+Old$/i, ''),
                getPlayerWindows: () => (provider.getPlayerWindows ? provider.getPlayerWindows() : [])
            });
        };

        const injectMenu = () => {
            const anchor = provider.getSettingsAnchor ? provider.getSettingsAnchor() : null;
            if (!anchor) return;

            const existingItem = document.querySelector('.ag-settings-menu-item:not(.ag-header-gear-btn)');
            if (existingItem) {
                const existingWrapper = existingItem.closest('.ag-settings-menu-wrapper') || existingItem;
                if (anchor.parentElement && anchor.parentElement.contains(existingWrapper)) return;
                existingWrapper.remove();
            }

            const cls = (c) => String(c || '').replace(/\b(is-)?active\b|\bcurrent\b/g, '').trim();

            const isIconOnly = !!site?.dle?.settingsIconOnly
                || !!site?.settingsIconOnly
                || (typeof provider.isSettingsIconOnly === 'function' && provider.isSettingsIconOnly());

            const isWrapper = anchor.tagName !== 'A';
            const anchorLink = isWrapper ? (anchor.querySelector('a') || anchor) : anchor;

            const item = document.createElement('a');
            item.href = '#ag-settings';
            item.className = ('ag-settings-menu-item ' + cls(anchorLink?.className)).trim();
            item.setAttribute('role', 'button');
            item.setAttribute('itemprop', 'url');

            if (isIconOnly) {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                svg.setAttribute('width', '18');
                svg.setAttribute('height', '18');
                svg.setAttribute('fill', 'currentColor');
                svg.setAttribute('viewBox', '0 0 20 20');
                svg.setAttribute('aria-hidden', 'true');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', GEAR_SVG_PATH);
                svg.appendChild(path);

                item.appendChild(svg);
                item.title = 'Настройки Anime+';
                item.setAttribute('aria-label', 'Настройки Anime+');
                item.classList.add('ag-settings-icon-only');
            } else {
                // Иконка шестерёнки: если сайт использует FontAwesome (как old.yummyani.me), ставим <i class="fa fa-cog">,
                // иначе SVG-иконку под размер и стили иконки меню сайта (как на ru.yummyani.me)
                let iconNode = null;
                const sampleFa = anchor.querySelector('.fa, [class*="fa-"]') || anchorLink?.querySelector('.fa, [class*="fa-"]');
                const sampleSvg = anchorLink?.querySelector('svg');

                if (sampleFa && !sampleSvg) {
                    const i = document.createElement('i');
                    i.className = 'fa fa-cog';
                    i.setAttribute('aria-hidden', 'true');
                    iconNode = i;
                } else if (sampleSvg) {
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    svg.setAttribute('width', sampleSvg?.getAttribute('width') || '16');
                    svg.setAttribute('height', sampleSvg?.getAttribute('height') || '16');
                    svg.setAttribute('fill', sampleSvg?.getAttribute('fill') || 'var(--main-permanent, currentColor)');
                    svg.setAttribute('viewBox', sampleSvg?.getAttribute('viewBox') || '0 0 20 20');
                    if (sampleSvg?.getAttribute('class')) svg.setAttribute('class', sampleSvg.getAttribute('class'));
                    if (sampleSvg?.getAttribute('style')) svg.setAttribute('style', sampleSvg.getAttribute('style'));
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', GEAR_SVG_PATH);
                    path.setAttribute('transform', 'translate(0, 0)');
                    svg.appendChild(path);
                    iconNode = svg;
                }

                const sampleSpan = anchorLink?.querySelector('span');
                const span = document.createElement('span');
                if (sampleSpan?.className) span.className = sampleSpan.className;
                span.setAttribute('itemprop', 'name');

                // Если вставляем рядом с нативными «Настройками», пишем «Настройки Anime+» для отличия.
                // В главном меню сайта пишем просто «Настройки» (как «Главная», «Случайное»).
                const hasNativeSettings = /настройк/i.test(anchorLink?.textContent || '');
                span.textContent = hasNativeSettings ? 'Настройки Anime+' : 'Настройки';

                if (iconNode) {
                    item.append(iconNode, document.createTextNode(' '), span);
                } else {
                    item.append(span);
                }

                if (anchorLink?.querySelector('.hP')) {
                    const tailSpan = document.createElement('span');
                    tailSpan.className = 'hP';
                    item.append(document.createTextNode(' '), tailSpan);
                }
            }

            let inserted;
            if (isWrapper) {
                const wrapper = anchor.cloneNode(false);
                wrapper.removeAttribute('id');
                if (wrapper.hasAttribute('data-selected')) wrapper.removeAttribute('data-selected');
                if (wrapper.hasAttribute('aria-current')) wrapper.removeAttribute('aria-current');
                wrapper.className = cls(anchor.className).replace(/\bsub-menu-link\b/g, '').trim();
                wrapper.classList.add('materiable', 'ag-settings-menu-wrapper');
                if (wrapper.hasAttribute('data-balloon') || wrapper.hasAttribute('data-balloon-pos') || anchor.closest('.menu') || isIconOnly) {
                    wrapper.setAttribute('data-balloon', 'Настройки Anime+');
                    wrapper.setAttribute('data-balloon-pos', anchor.getAttribute('data-balloon-pos') || 'down');
                }
                wrapper.appendChild(item);
                inserted = wrapper;
            } else {
                inserted = item;
            }

            anchor.after(inserted);
            scope.own(inserted);
        };

        const injectGear = () => {
            const gearAnchor = provider.getHeaderGearAnchor ? provider.getHeaderGearAnchor() : null;
            if (!gearAnchor) return;

            if (document.querySelector('.ag-header-gear-btn')) return;

            const btn = document.createElement('a');
            btn.href = '#ag-settings';
            btn.className = 'ag-header-gear-btn ag-settings-menu-item';
            btn.title = 'Настройки Anime+';
            btn.setAttribute('aria-label', 'Настройки Anime+');
            btn.setAttribute('role', 'button');

            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svg.setAttribute('width', '20');
            svg.setAttribute('height', '20');
            svg.setAttribute('fill', 'currentColor');
            svg.setAttribute('viewBox', '0 0 20 20');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', GEAR_SVG_PATH);
            svg.appendChild(path);
            btn.appendChild(svg);

            if (gearAnchor.classList?.contains('header__sign-in') || gearAnchor.matches?.('[class*="sign-in"], a[href*="login"], .btn')) {
                gearAnchor.before(btn);
            } else if (gearAnchor.classList?.contains('header__right') || gearAnchor.matches?.('[class*="header__right"]')) {
                gearAnchor.prepend(btn);
            } else {
                gearAnchor.after(btn);
            }
            scope.own(btn);
        };

        // Видимая шестерёнка перед кнопкой профиля, в размерах пунктов шапки сайта
        const injectNativeGear = () => {
            const profile = provider.getProfileNavItem();
            if (!profile || profile.previousElementSibling?.classList.contains('ag-native-gear')) return;
            document.querySelectorAll('.ag-native-gear').forEach(el => el.remove());

            const item = profile.cloneNode(false);
            item.removeAttribute('id');
            item.classList.add('ag-native-gear');

            const link = document.createElement('a');
            link.className = profile.querySelector('a')?.className || '';
            link.href = '#ag-settings';
            link.title = 'Настройки Anime+';
            link.setAttribute('aria-label', 'Настройки Anime+');

            const icon = document.createElement('div');
            icon.className = 'ag-native-gear__icon';
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', '18');
            svg.setAttribute('height', '18');
            svg.setAttribute('viewBox', '0 0 20 20');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', GEAR_SVG_PATH);
            svg.appendChild(path);
            icon.appendChild(svg);
            link.appendChild(icon);
            item.appendChild(link);

            profile.before(item);
            scope.own(item);
        };

        const inject = () => {
            injectStyle();
            injectNativeGear();
            const gearAnchor = provider.getHeaderGearAnchor ? provider.getHeaderGearAnchor() : null;
            if (gearAnchor) {
                injectGear();
                // Если настройки встроены кнопкой-шестерёнкой в шапку, текстовый пункт меню не нужен
                document.querySelectorAll('.ag-settings-menu-wrapper, .ag-settings-menu-item:not(.ag-header-gear-btn)').forEach(el => el.remove());
            } else {
                injectMenu();
            }
        };

        inject();
        scope.observe(inject, { root: document.body, wait: 300 });

        // Делегирование клика: меню сайта может перерендериваться в DOM
        scope.listen(document, 'click', (e) => {
            const link = e.target.closest && e.target.closest('.ag-settings-menu-item, .ag-settings-menu-wrapper, .ag-header-gear-btn, .ag-native-gear');
            if (!link) return;
            e.preventDefault();
            e.stopPropagation();

            // Закрываем выпадающее меню сайта при открытии настроек
            const dropdown = link.closest('.db')?.parentElement;
            if (dropdown && dropdown.style.display !== 'none') {
                dropdown.style.display = 'none';
            }

            openSettings();
        }, true);

        if (location.hash === '#ag-settings') openSettings();
    };
})();
