// modules/shared/sites.js
// Единый реестр поддерживаемых сайтов. Источник правды для:
//   - content-скриптов (выбор провайдера по hostname, проверка «сайт включён»),
//   - content-kodik.js (с каких страниц принимать команды плееру),
//   - background (поиск тайтла на других сайтах),
//   - popup (список сайтов, переключатели, тема).
// Добавление нового сайта = запись здесь + провайдер (providers/*.js) + matches в manifest.json.
//
// platform:
//   'animego' — AnimeGO.me (собственные модули modules/animego/*, исторический код)
//   'dle'     — DLE-движок с плеерами в обёртке xfp (Jut-Su и его «семейство»)
//   'yani'    — платформа YummyAnime с JSON API (/api/anime/{slug}, /api/search)

(function (root) {
    'use strict';

    const SITES = [
        {
            id: 'animego', name: 'AnimeGO', short: 'AG', color: '#ef4444',
            hosts: ['animego.me', 'animego.org'], home: 'https://animego.me',
            platform: 'animego', legacy: true
        },
        {
            id: 'jutsu', name: 'Jut-Su', short: 'JS', color: '#3b82f6',
            hosts: ['jut-su.net'], home: 'https://jut-su.net',
            platform: 'dle', legacy: true,
            dle: { titlePath: /^\/\d+-[^/]+\.html$/, searchPath: '/?do=search&subaction=search&story=' }
        },
        {
            id: 'yummy_ru', name: 'YummyAnime', short: 'YA', color: '#f59e0b',
            hosts: ['ru.yummyani.me'], home: 'https://ru.yummyani.me',
            platform: 'yani', spa: true
        },
        {
            id: 'yummy_old', name: 'YummyAnime Old', short: 'YO', color: '#d97706',
            hosts: ['old.yummyani.me'], home: 'https://old.yummyani.me',
            platform: 'yani'
        },
        {
            id: 'yummyanime_tv', name: 'YummyAnime.TV', short: 'TV', color: '#ec4899',
            hosts: ['yummyanime.tv'], home: 'https://yummyanime.tv',
            platform: 'dle',
            dle: { titlePath: /^\/\d+-[^/]+\.html$/, searchPath: '/index.php?do=search&subaction=search&story=' }
        },
        {
            id: 'animego_online', name: 'AnimeGO.online', short: 'AO', color: '#22c55e',
            hosts: ['animego.online'], home: 'https://animego.online',
            platform: 'dle',
            dle: {
                titlePath: /^\/\d+-[^/]+\.html$/,
                searchPath: '/index.php?do=search&subaction=search&story=',
                // Меню заполнено до края: с «Топ Shikimori» при штатных 40px последний пункт уходит на вторую строку
                navCss: '.animego-online-header__menu--bothead > ul > li { margin-right: 28px !important; }'
            }
        },
        {
            id: 'yammy_club', name: 'YummyAnime.Club', short: 'YC', color: '#a855f7',
            hosts: ['yammyanime.club'], home: 'https://yammyanime.club',
            platform: 'dle',
            dle: {
                titlePath: /^\/catalog\/item\/[^/?#]+$/,
                searchPath: '/index.php?do=search&subaction=search&story=',
                navCss: '.header__menu { flex-wrap: nowrap !important; } .header__menu > li > a { padding: 0 clamp(7px, 0.75vw, 12px) !important; font-size: 15px !important; white-space: nowrap !important; } .header__menu > li.has-child > a { padding-right: clamp(18px, 1.2vw, 24px) !important; } .header__menu > li.ag-settings-menu-wrapper > a { padding: 0 clamp(8px, 0.7vw, 12px) !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; } .header__menu > li.ag-settings-menu-wrapper > a svg { width: 18px !important; height: 18px !important; display: block !important; fill: currentColor !important; transition: transform 0.3s ease, color 0.25s ease !important; } .header__menu > li.ag-settings-menu-wrapper > a:hover svg { transform: rotate(45deg); }'
            }
        }
    ];

    const hostMatches = (hostname, host) => hostname === host || hostname.endsWith('.' + host);

    const AgSites = {
        list: SITES,

        byId(id) {
            return SITES.find(s => s.id === id) || null;
        },

        byHost(hostname) {
            const h = String(hostname || '').toLowerCase();
            return SITES.find(s => s.hosts.some(host => hostMatches(h, host))) || null;
        },

        byUrl(url) {
            try { return AgSites.byHost(new URL(url).hostname); } catch (e) { return null; }
        },

        allHosts() {
            return SITES.flatMap(s => s.hosts);
        },

        // Сайт включён, если глобальный переключатель не выключен и нет явного false в sites_enabled
        isEnabled(settings, id) {
            if (!settings || settings.global_enabled === false) return false;
            const map = settings.sites_enabled || {};
            return map[id] !== false;
        },

        // Абсолютный адрес страницы тайтла по относительному пути
        absolute(site, path) {
            return new URL(path, site.home).href;
        }
    };

    root.AgSites = AgSites;
})(typeof globalThis !== 'undefined' ? globalThis : window);
