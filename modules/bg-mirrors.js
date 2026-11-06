// modules/bg-mirrors.js
// Новые адреса переехавших сайтов (AnimeVost меняет домены из-за блокировок).
// Зритель разрешает новый адрес в окне расширения, а здесь для него регистрируются те же content-скрипты,
// что манифест подключает на известных адресах сайта. Список скриптов берётся из манифеста, поэтому не расходится с ним.
// Адреса хранятся в ag_site_aliases ({ 'animevost.xyz': 'animevost' }); без разрешения Chrome адрес снимается.

const MIRROR_PREFIX = 'ag-mirror:';
const MIRROR_HOST_RE = /^(?=.{4,253}$)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

const mirrorOrigins = (host) => [`https://${host}/*`, `https://*.${host}/*`];

/** Записи манифеста, которые работают на известных адресах сайта: их и повторяем на новом адресе */
function siteScriptBlocks(site) {
    const known = site.hosts.flatMap(mirrorOrigins);
    return (chrome.runtime.getManifest().content_scripts || []).filter(c => c.matches.some(m => known.includes(m)));
}

function mirrorScripts(host, site) {
    return siteScriptBlocks(site).map((block, i) => ({
        id: `${MIRROR_PREFIX}${host}:${i}`,
        matches: mirrorOrigins(host),
        js: block.js,
        ...(block.css ? { css: block.css } : {}),
        allFrames: !!block.all_frames,
        runAt: block.run_at || 'document_idle',
        world: block.world || 'ISOLATED',
        persistAcrossSessions: true
    }));
}

async function unregisterMirrorScripts(keep) {
    const all = await chrome.scripting.getRegisteredContentScripts();
    const ids = all.map(s => s.id).filter(id => id.startsWith(MIRROR_PREFIX) && !keep(id));
    if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
}

async function readAliases() {
    const res = await chrome.storage.local.get([AgSites.ALIASES_KEY]);
    return res[AgSites.ALIASES_KEY] || {};
}

async function writeAliases(map) {
    await chrome.storage.local.set({ [AgSites.ALIASES_KEY]: map });
    AgSites.applyAliases(map);
}

/** Зритель разрешил новый адрес сайта в окне расширения */
async function addSiteMirror(rawHost, siteId) {
    const host = String(rawHost || '').toLowerCase().replace(/^www\./, '');
    const site = AgSites.byId(siteId);
    if (!site || !site.mirrors || !MIRROR_HOST_RE.test(host)) return { success: false, reason: 'bad_request' };
    // Известный адрес и так работает из манифеста
    const known = AgSites.byHost(host);
    if (known && !AgSites.aliasHosts().includes(host)) return { success: known.id === site.id, reason: 'known' };
    if (!await chrome.permissions.contains({ origins: mirrorOrigins(host) })) return { success: false, reason: 'no_permission' };

    const scripts = mirrorScripts(host, site);
    await unregisterMirrorScripts(id => !id.startsWith(`${MIRROR_PREFIX}${host}:`));
    await chrome.scripting.registerContentScripts(scripts);
    await writeAliases({ ...await readAliases(), [host]: site.id });
    return { success: true, host };
}

/** После запуска и при отзыве разрешения: адреса без разрешения снимаем, остальные регистрируем заново */
async function syncSiteMirrors() {
    const aliases = await readAliases();
    const kept = {};
    for (const [host, id] of Object.entries(aliases)) {
        const site = AgSites.byId(id);
        if (site && site.mirrors && await chrome.permissions.contains({ origins: mirrorOrigins(host) })) kept[host] = id;
    }
    // Заново целиком: после обновления расширения список файлов в манифесте мог измениться
    await unregisterMirrorScripts(() => false);
    const scripts = Object.entries(kept).flatMap(([host, id]) => mirrorScripts(host, AgSites.byId(id)));
    if (scripts.length) await chrome.scripting.registerContentScripts(scripts);
    if (Object.keys(kept).length !== Object.keys(aliases).length) await writeAliases(kept);
    return kept;
}
