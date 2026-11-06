// modules/shared/sites.js
// Единый реестр поддерживаемых сайтов. Источник правды для:
//   - content-скриптов (выбор провайдера по hostname, проверка «сайт включён»),
//   - content-player.js (с каких страниц принимать команды плееру),
//   - background (поиск тайтла на других сайтах),
//   - popup (список сайтов, переключатели, тема).
// Добавление нового сайта = запись здесь + провайдер (providers/*.js) + matches в manifest.json.
//
// platform:
//   'animego' — AnimeGO.me (providers/animego.js и то, что есть только у него: modules/animego/*)
//   'dle'     — DLE-движок с плеерами в обёртке xfp (Jut-Su и его «семейство»), provider — свой класс поверх общего
//   'yani'    — платформа YummyAnime с JSON API (/api/anime/{slug}, /api/search)
//   'vost'    — AnimeVost: свой плеер в кадре /frame5.php, серии переключает сам сайт
//
// mirrors: сайт часто переезжает. hosts покрывают известные зеркала, detect узнаёт страницу на новом домене,
// а адрес, который зритель разрешил в окне расширения, хранится в ag_site_aliases и подключается через applyAliases

(function (root) {
    'use strict';

    const SITES = [
        {
            id: 'animego', name: 'AnimeGO', short: 'AG', color: '#ef4444',
            hosts: ['animego.me', 'animego.org'], home: 'https://animego.me',
            platform: 'animego',
            // Тайтла нет в каталоге: страница из данных Shikimori (modules/animego/ag-synthetic.js)
            shikiPage: '/anime/shiki-{id}'
        },
        {
            id: 'jutsu', name: 'Jut-Su', short: 'JS', color: '#3b82f6',
            hosts: ['jut-su.net'], home: 'https://jut-su.net',
            platform: 'dle', provider: 'jutsu',
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
                searchPath: '/index.php?do=search&subaction=search&story='
            }
        },
        {
            id: 'yammy_club', name: 'YummyAnime.Club', short: 'YC', color: '#a855f7',
            hosts: ['yammyanime.club'], home: 'https://yammyanime.club',
            platform: 'dle',
            dle: {
                titlePath: /^\/catalog\/item\/[^/?#]+$/,
                searchPath: '/index.php?do=search&subaction=search&story='
            }
        },
        {
            id: 'animevost', name: 'AnimeVost', short: 'AV', color: '#0ea5e9',
            hosts: ['animevost.org', 'vost.pw'], home: 'https://animevost.org',
            platform: 'vost', mirrors: true,
            detect: 'link[href*="/templates/AnimeVost"], script[src*="/templates/AnimeVost"], a[href*="vost.pw/user/animevost"]'
        }
    ];

    const hostMatches = (hostname, host) => hostname === host || hostname.endsWith('.' + host);

    // Адреса, добавленные зрителем для переехавших сайтов: { 'animevost.xyz': 'animevost' }
    let aliases = {};
    const aliasFor = (h) => {
        const host = Object.keys(aliases).find(a => hostMatches(h, a));
        return host ? SITES.find(s => s.id === aliases[host]) || null : null;
    };

    const AgSites = {
        list: SITES,
        ALIASES_KEY: 'ag_site_aliases',

        /** Новые адреса сайтов из хранилища. Только для сайтов с mirrors: чужой сайт так не подменить */
        applyAliases(map) {
            aliases = {};
            for (const [host, id] of Object.entries(map || {})) {
                const site = SITES.find(s => s.id === id);
                if (site && site.mirrors && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) aliases[host.toLowerCase()] = id;
            }
        },

        /** Сайты, на которых фон умеет искать тайтл («Смотреть на…», кнопка на Shikimori, Топ) */
        searchable() {
            return SITES.filter(s => !s.noSearch);
        },

        aliasHosts(id) {
            return Object.keys(aliases).filter(h => !id || aliases[h] === id);
        },

        /** Сайт по признакам страницы: для адреса, которого ещё нет в списке */
        detect(doc) {
            if (!doc || !doc.querySelector) return null;
            return SITES.find(s => s.detect && doc.querySelector(s.detect)) || null;
        },

        byId(id) {
            return SITES.find(s => s.id === id) || null;
        },

        byHost(hostname) {
            const h = String(hostname || '').toLowerCase();
            return SITES.find(s => s.hosts.some(host => hostMatches(h, host))) || aliasFor(h);
        },

        byUrl(url) {
            try { return AgSites.byHost(new URL(url).hostname); } catch (e) { return null; }
        },

        allHosts() {
            return SITES.flatMap(s => s.hosts).concat(Object.keys(aliases));
        },

        // Сайт включён, если глобальный переключатель не выключен и нет явного false в sites_enabled
        isEnabled(settings, id) {
            if (!settings || settings.global_enabled === false) return false;
            const map = settings.sites_enabled || {};
            return map[id] !== false;
        },

        // Сайты на DLE: у них своя обёртка плееров, CVH открыт на весь тайтл, а собственный плеер сайта заменяется на Kodik
        isDleHost(hostname) {
            const site = AgSites.byHost(hostname);
            return !!site && site.platform === 'dle';
        },

        // Абсолютный адрес страницы тайтла по относительному пути
        absolute(site, path) {
            return new URL(path, site.home).href;
        },

        /** Страница «Топ Shikimori» (top/top.html) с параметрами: embed, pick, site, origin (см. top/top.js) */
        topPageUrl(params = {}) {
            const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
            return chrome.runtime.getURL(`top/top.html?${query}`);
        }
    };

    // Content-скрипты ждут этого, прежде чем решать, на каком они сайте
    AgSites.ready = (async () => {
        try {
            if (!root.chrome || !root.chrome.storage || !root.chrome.storage.local) return;
            const res = await root.chrome.storage.local.get([AgSites.ALIASES_KEY]);
            AgSites.applyAliases(res && res[AgSites.ALIASES_KEY]);
        } catch (e) {}
    })();

    root.AgSites = AgSites;
})(typeof globalThis !== 'undefined' ? globalThis : window);
