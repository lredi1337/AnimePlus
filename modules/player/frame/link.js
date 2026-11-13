// modules/player/frame/link.js
// Связь кадра плеера со страницей сайта (content-player.js): кто встроил кадр и как с ним говорить.
// Оболочка работает только в кадрах, которые встроил поддерживаемый сайт: это и позволяет держать широкие разрешения манифеста.

(function (root) {
    'use strict';

    const hostOf = (u) => { try { return new URL(u).hostname; } catch (e) { return ''; } };

    /**
     * Проверяет, что кадр встроил сайт из списка, и возвращает связь с его страницей, иначе null.
     * { parentSite, toTop(message), isParentSiteOrigin(origin) }
     */
    function connect() {
        const sites = root.AgSites;
        const siteHosts = sites ? sites.allHosts() : ['animego.me', 'animego.org', 'jut-su.net'];
        const isSiteHost = (h) => !!h && siteHosts.some(d => h === d || h.endsWith('.' + d));

        const ref = document.referrer || '';
        const params = new URLSearchParams(location.search);
        const embedDomain = (params.get('d') || '').toLowerCase();
        const embedRefHost = hostOf(params.get('ref') || '');
        const refHost = hostOf(ref);
        // Кто встроил кадр: Chrome сообщает адреса всех внешних кадров, верхний идёт последним.
        // В отличие от referrer, страница не может ни скрыть их, ни подделать
        const ancestors = location.ancestorOrigins;
        const topHost = ancestors && ancestors.length ? hostOf(ancestors[ancestors.length - 1]) : '';

        let allowed = false;
        try {
            // Обёртка другого плеера между сайтом и кадром не мешает: важна только верхняя страница
            allowed = topHost ? isSiteHost(topHost) : (
                // Браузер без ancestorOrigins: остаётся адрес источника, а сайт может его и не передать
                !ref
                || isSiteHost(refHost)
                || isSiteHost(embedDomain)
                || isSiteHost(embedRefHost)
                // Kodik внутри обёртки другого плеера: точное совпадение домена из списка в config.js
                || root.isValidOrigin(`https://${refHost}`)
                // Кадр перезагрузил сам себя: адрес источника теперь он сам
                || refHost === location.hostname
            );
        } catch (e) {
            allowed = false;
        }
        if (!allowed) return null;

        const parentSite = sites ? (sites.byHost(topHost) || sites.byHost(refHost) || sites.byHost(embedDomain) || sites.byHost(embedRefHost)) : null;
        // Сообщения уходят только верхней странице сайта (modules/shared/sites.js)
        const topOrigin = sites ? sites.topOrigin() : '*';
        return {
            parentSite,
            // Адрес, откуда пришёл кадр по словам самой страницы: по нему выбирается способ смены серий
            sourceHost: refHost || embedDomain || embedRefHost,
            toTop: (message) => window.top.postMessage(message, topOrigin),
            // Команды плееру принимаем только от страниц поддерживаемых сайтов (точное совпадение домена)
            isParentSiteOrigin: (origin) => /^https:\/\//.test(origin || '') && isSiteHost(hostOf(origin))
        };
    }

    root.AgFrameLink = { connect };
})(typeof globalThis !== 'undefined' ? globalThis : this);
