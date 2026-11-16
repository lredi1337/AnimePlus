// modules/shared/ext-page.js
// Общее для страниц расширения, которые открывают тайтл на сайте: «Топ Shikimori» (top/top.js) и расписание (schedule/schedule.js).
// У обеих два режима:
//   - поверх сайта (frame.html?embed=1&site=<id>&origin=<адрес>): кадр внутри значка (features/fox-dock.js), сайт фиксирован,
//     открыть тайтл и закрыться страница просит значок сообщением;
//   - вкладкой из окна расширения (pick=1): зритель сам выбирает сайт, выбор запоминается (ag_top_site) и общий для обеих страниц.

(function (root) {
    'use strict';

    const MESSAGE_SOURCE = 'anime-plus-top';
    const PICK_KEY = 'ag_top_site';

    // Адрес из параметров принимаем, только если он ведёт на этот же сайт (в том числе на его новое зеркало)
    const sameSiteUrl = (raw, site) => {
        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
            const owner = root.AgSites.byHost(url.hostname);
            return owner && owner.id === site.id ? url : null;
        } catch (e) {
            return null;
        }
    };

    /** Режим и сайт из адреса страницы. Без сайта и без выбора сайта — null */
    function readContext(search) {
        const params = new URLSearchParams(search);
        const embed = params.get('embed') === '1';
        const pick = !embed && params.get('pick') === '1';
        const site = root.AgSites.byId(params.get('site') || '');
        if (!site) return pick ? { site: null, origin: '', embed, pick } : null;
        const origin = (sameSiteUrl(params.get('origin') || '', site) || new URL(site.home)).origin;
        return { site, origin, embed, pick };
    }

    /** Сайты, из которых можно выбирать во вкладке: включённые в настройках */
    async function pickableSites() {
        const settings = (await chrome.storage.local.get(['ag_settings'])).ag_settings || {};
        return root.AgSites.searchable().filter(s => root.AgSites.isEnabled(settings, s.id));
    }

    // Рабочий адрес сайта: у переезжающих сайтов это последний открытый зрителем (providers/vost.js)
    async function workingOrigin(site) {
        const { ag_site_home: homes = {} } = await chrome.storage.local.get(['ag_site_home']);
        const url = sameSiteUrl(homes[site.id] || '', site);
        return (url || new URL(site.home)).origin;
    }

    /**
     * Вкладка из окна расширения: сайт из прошлого выбора, иначе тот, что открыт рядом, иначе первый включённый.
     * Возвращает { ctx, sites } или null, если все сайты выключены
     */
    async function pickContext(ctx) {
        const sites = await pickableSites();
        const { [PICK_KEY]: saved } = await chrome.storage.local.get([PICK_KEY]);
        const site = sites.find(x => x.id === saved) || sites.find(x => ctx.site && x.id === ctx.site.id) || sites[0];
        if (!site) return null;
        return { sites, ctx: { ...ctx, site, origin: ctx.site && ctx.site.id === site.id ? ctx.origin : await workingOrigin(site) } };
    }

    const rememberPick = (site) => chrome.storage.local.set({ [PICK_KEY]: site.id }).catch(() => {});

    // Только странице сайта, на которой открыт значок: ближайший внешний кадр
    const parentOrigin = (() => { try { return location.ancestorOrigins[0] || '*'; } catch (e) { return '*'; } })();
    /** Сообщение значку на странице сайта (только в режиме поверх сайта) */
    const tellDock = (message) => root.parent.postMessage({ source: MESSAGE_SOURCE, ...message }, parentOrigin);

    /**
     * Адрес тайтла на сайте или null. item: { id, titles, year }.
     * AnimeGO: тайтла нет в каталоге — страница из данных Shikimori (modules/animego/ag-synthetic.js)
     */
    async function findOnSite(site, origin, item) {
        const here = await root.agSendMessage({ action: 'resolve_site_url', siteId: site.id, titles: item.titles, year: item.year, shikimoriId: item.id });
        let found = null;
        try { found = here && here.url ? sameSiteUrl(new URL(here.url, origin).href, site) : null; } catch (e) { /* адрес не разобрать: тайтла на сайте нет */ }
        // Сайт с зеркалами: открываем на том адресе, где зритель сейчас
        if (found) return site.mirrors ? origin + found.pathname + found.search : found.href;
        return site.shikiPage ? origin + site.shikiPage.replace('{id}', item.id) : null;
    }

    root.AgExtPage = { PICK_KEY, sameSiteUrl, readContext, pickableSites, workingOrigin, pickContext, rememberPick, tellDock, findOnSite };
})(typeof globalThis !== 'undefined' ? globalThis : window);
