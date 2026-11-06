// Новые адреса переехавших сайтов (modules/bg-mirrors.js): после разрешения зрителя на новом адресе
// регистрируются те же content-скрипты, что манифест ставит на известных адресах сайта
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext, read } = require('./helpers');

const MANIFEST = JSON.parse(read('manifest.json'));

function makeBackground({ granted = [] } = {}) {
    const store = {};
    const registered = new Map();
    const allowed = new Set(granted);
    const chrome = {
        runtime: { getManifest: () => MANIFEST },
        storage: { local: {
            get: async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]])),
            set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); }
        } },
        permissions: { contains: async ({ origins }) => origins.every(o => allowed.has(o)) },
        scripting: {
            getRegisteredContentScripts: async () => [...registered.values()],
            registerContentScripts: async (list) => {
                for (const s of list) {
                    if (registered.has(s.id)) throw new Error(`Duplicate script ID '${s.id}'`);
                    registered.set(s.id, s);
                }
            },
            unregisterContentScripts: async ({ ids }) => { ids.forEach(id => registered.delete(id)); }
        }
    };
    const ctx = loadInContext(['modules/shared/sites.js', 'modules/bg-mirrors.js'], { chrome });
    return { ctx, store, registered, allowed };
}

const ORIGINS = ['https://animevost.xyz/*', 'https://*.animevost.xyz/*'];
const vostBlocks = () => MANIFEST.content_scripts.filter(c => c.matches.includes('https://*.vost.pw/*'));

test('разрешённый новый адрес получает те же скрипты, что известные адреса сайта', async () => {
    const { ctx, store, registered } = makeBackground({ granted: ORIGINS });
    const res = await ctx.addSiteMirror('www.AnimeVost.xyz', 'animevost');
    assert.equal(res.success, true);
    assert.equal(res.host, 'animevost.xyz');
    const scripts = [...registered.values()];
    assert.equal(scripts.length, vostBlocks().length);
    assert.deepEqual(scripts.map(s => s.js), vostBlocks().map(b => b.js));
    assert.ok(scripts.every(s => JSON.stringify(s.matches) === JSON.stringify(ORIGINS)));
    // Кадр плеера получает оболочку: скрипты плеера во всех кадрах
    assert.ok(scripts.some(s => s.allFrames && s.js.includes('content-player.js')));
    assert.deepEqual(store.ag_site_aliases, { 'animevost.xyz': 'animevost' });
    assert.equal(ctx.AgSites.byHost('animevost.xyz').id, 'animevost');
    // Повторное добавление не падает на занятых id
    assert.equal((await ctx.addSiteMirror('animevost.xyz', 'animevost')).success, true);
    assert.equal(registered.size, vostBlocks().length);
});

test('без разрешения Chrome, для обычного сайта и для чужого адреса ничего не регистрируется', async () => {
    const { ctx, registered, store } = makeBackground();
    assert.equal((await ctx.addSiteMirror('animevost.xyz', 'animevost')).reason, 'no_permission');
    assert.equal((await ctx.addSiteMirror('jut-su.xyz', 'jutsu')).reason, 'bad_request');
    assert.equal((await ctx.addSiteMirror('localhost', 'animevost')).reason, 'bad_request');
    assert.equal((await ctx.addSiteMirror('v15.vost.pw', 'animevost')).reason, 'known');
    assert.equal(registered.size, 0);
    assert.equal(store.ag_site_aliases, undefined);
});

test('отозванное разрешение снимает адрес, оставшиеся адреса регистрируются заново', async () => {
    const other = ['https://vost.club/*', 'https://*.vost.club/*'];
    const { ctx, store, registered, allowed } = makeBackground({ granted: [...ORIGINS, ...other] });
    await ctx.addSiteMirror('animevost.xyz', 'animevost');
    await ctx.addSiteMirror('vost.club', 'animevost');
    ORIGINS.forEach(o => allowed.delete(o));
    const kept = await ctx.syncSiteMirrors();
    assert.deepEqual({ ...kept }, { 'vost.club': 'animevost' });
    assert.deepEqual(store.ag_site_aliases, { 'vost.club': 'animevost' });
    assert.ok([...registered.keys()].every(id => id.includes('vost.club')));
    assert.equal(registered.size, vostBlocks().length);
    assert.equal(ctx.AgSites.byHost('animevost.xyz'), null);
});
