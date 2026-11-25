#!/usr/bin/env node
// Данные для презентации стилей (tools/design-lab/index.html): настоящий рейтинг Shikimori, тайтлы «Случайного аниме»
// с описаниями и кадрами, ссылки на сайты (их ищет само расширение — resolveAllSites в фоне), расписание онгоингов,
// снимок настоящего сайта и каталог подбора. Ссылки ищутся
// в Chrome стенда, поэтому они такие же, как у зрителя.
//
//   node tools/design-lab/build-data.js                    → tools/design-lab/data.js
//   node tools/design-lab/build-data.js --franchise-only   → дописать франшизы в собранные данные

const fs = require('fs');
const path = require('path');
const { launch, prepareExtension, wait } = require('../stand/lib');

const UA = 'AnimePlus-design-lab/1.0 (https://github.com/lredi1337/AnimePlus)';
const GQL = 'https://shikimori.io/api/graphql';
const OUT = path.join(__dirname, 'data.js');
const RANDOM_COUNT = 20;
// Страницы рейтинга: начало и несколько глубже, чтобы фильтры по оценке были не пустыми
const TOP_PAGES = [1, 2, 3, 30, 80, 160];
const KINDS = new Set(['tv', 'movie', 'ova', 'ona', 'special', 'tv_special']);

async function gql(query) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(GQL, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query }) });
        if (r.status === 429) { await wait(2000); continue; }
        if (!r.ok) throw new Error(`GraphQL ${r.status}`);
        const body = await r.json();
        if (body.errors) throw new Error(body.errors.map(e => e.message).join('; '));
        await wait(700);
        return body.data;
    }
    throw new Error('GraphQL: слишком много запросов');
}

const BASE = 'id name russian kind score episodes episodesAired status airedOn { year } poster { mainUrl originalUrl } genres { id russian kind } studios { name }';

// Описание Shikimori размечено BB-кодами: оставляем текст
const plain = (raw) => String(raw || '')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/\[(\w+)(?:=[^\]]*)?\]([\s\S]*?)\[\/\1\]/g, '$2')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const short = (a) => ({
    id: Number(a.id), ru: a.russian || a.name, en: a.name, kind: a.kind, score: Number(a.score) || 0,
    eps: a.episodes || a.episodesAired || 0, status: a.status, year: (a.airedOn && a.airedOn.year) || null,
    poster: (a.poster && (a.poster.mainUrl || a.poster.originalUrl)) || '',
    genres: (a.genres || []).filter(g => g.kind !== 'demographic').map(g => g.russian),
    studio: (a.studios && a.studios[0] && a.studios[0].name) || ''
});

async function fetchTop() {
    const top = [];
    for (const page of TOP_PAGES) {
        const data = await gql(`{ animes(order: ranked, limit: 50, page: ${page}, score: 1) { ${BASE} } }`);
        data.animes.forEach((a, i) => { if (KINDS.has(a.kind)) top.push({ ...short(a), rank: (page - 1) * 50 + i + 1 }); });
        process.stdout.write(`\rрейтинг: ${top.length}`);
    }
    return top;
}

// Тайтлы «Случайного аниме»: известные и с хорошей оценкой из каталога подбора, каждый раз одни и те же — выбор с постоянным зерном
function pickRandomIds() {
    const cat = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'pick', 'catalog.json'), 'utf8'));
    const f = Object.fromEntries(cat.fields.map((k, i) => [k, i]));
    const good = cat.items.filter(r => r[f.score] >= 7.6 && r[f.viewers] > 40000).map(r => r[f.id]);
    let seed = 1123;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const ids = [];
    while (ids.length < RANDOM_COUNT && good.length) ids.push(good.splice(Math.floor(rnd() * good.length), 1)[0]);
    return ids;
}

async function fetchRandom(ids) {
    const data = await gql(`{ animes(ids: "${ids.join(',')}", limit: ${ids.length}) { ${BASE} description screenshots { originalUrl x332Url } } }`);
    const byId = new Map(data.animes.map(a => [Number(a.id), a]));
    return ids.map(id => byId.get(id)).filter(Boolean).map(a => ({
        ...short(a),
        description: plain(a.description).slice(0, 1200),
        shots: (a.screenshots || []).slice(0, 12).map(s => ({ full: s.originalUrl, thumb: s.x332Url || s.originalUrl }))
    }));
}

// Расписание: календарь Shikimori (следующая серия каждого онгоинга) и постеры из GraphQL
async function fetchSchedule() {
    const r = await fetch('https://shikimori.io/api/calendar', { headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) throw new Error(`calendar ${r.status}`);
    const cal = await r.json();
    const ids = [...new Set(cal.map(x => x.anime.id))];
    const meta = new Map();
    for (let i = 0; i < ids.length; i += 50) {
        const data = await gql(`{ animes(ids: "${ids.slice(i, i + 50).join(',')}", limit: 50) { ${BASE} japanese rating } }`);
        // Как в расширении: японское название — чтобы узнать китайское, «Детское» — для фильтра детского
        data.animes.forEach(a => meta.set(Number(a.id), { ...short(a), native: a.japanese || '', kids: (a.genres || []).some(g => g.russian === 'Детское') || a.rating === 'g' }));
    }
    return cal.map(x => {
        const m = meta.get(x.anime.id) || { id: x.anime.id, ru: x.anime.russian || x.anime.name, en: x.anime.name, kind: x.anime.kind, score: Number(x.anime.score) || 0, poster: '', genres: [] };
        return { ...m, ep: x.next_episode, at: x.next_episode_at, total: x.anime.episodes || 0, duration: x.duration || 0, airedOn: x.anime.aired_on || '' };
    });
}

// Опенинги и эндинги для панели «Музыка» в окне расширения: AnimeThemes, как в самом расширении (id Shikimori = id MyAnimeList)
async function fetchSongs(ids) {
    const r = await fetch('https://graphql.animethemes.moe/', {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: `query { findAnimeByExternalSite(site: MAL, id: [${ids.join(',')}]) { resources(site: MAL) { nodes { externalId } } animethemes { type sequence song { title { romaji } performances { artist { ... on Artist { name { main } } } } } } } }` })
    });
    if (!r.ok) return {};
    const body = await r.json();
    const out = {};
    for (const a of (body.data && body.data.findAnimeByExternalSite) || []) {
        const mal = a.resources && a.resources.nodes && a.resources.nodes[0] && Number(a.resources.nodes[0].externalId);
        if (!mal) continue;
        out[mal] = (a.animethemes || []).filter(t => t.song).map(t => ({
            type: t.type, n: t.sequence || 1,
            title: (t.song.title && t.song.title.romaji) || '',
            artist: (t.song.performances || []).map(p => p.artist && p.artist.name && p.artist.name.main).filter(Boolean).join(', ')
        }));
    }
    return out;
}

// Настоящий сайт для «Топа на сайте»: снимок главной страницы без расширения
async function shootSite(b) {
    const page = await b.openPage('https://animego.me/');
    await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, page.session);
    await wait(9000);
    const { data } = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, page.session);
    fs.writeFileSync(path.join(__dirname, 'site.jpg'), Buffer.from(data, 'base64'));
    await b.closePage(page);
}

// Где тайтлы есть на сайтах: тот же поиск, что у расширения
async function findSites(random) {
    const b = launch();
    try {
        // Снимок сайта — до загрузки расширения: на нём не должно быть нынешнего значка лисы
        await shootSite(b);
        const extId = await b.loadExtension(prepareExtension());
        const worker = await b.serviceWorker(extId);
        await wait(1500);
        const sites = await b.ev(worker, 'AgSites.ready.then(() => AgSites.searchable().map(s => ({ id: s.id, name: s.name, short: s.short, color: s.color, home: s.home })))');
        for (const [i, t] of random.entries()) {
            const query = JSON.stringify({ titles: [t.en, t.ru].filter(Boolean), year: t.year ? String(t.year) : '', shikimoriId: t.id });
            const res = await b.ev(worker, `resolveAllSites(${query}, { timeoutMs: 15000 })`);
            t.sites = (res || []).filter(x => x.url).map(x => ({ id: x.siteId, url: x.url }));
            process.stdout.write(`\rсайты: ${i + 1} из ${random.length}`);
        }
        return sites;
    } finally {
        await b.close();
    }
}

// «Порядок просмотра»: франшиза каждого тайтла «Случайного» — тот же ответ Shikimori и то же сжатие, что в фоне расширения
// (modules/bg-franchise.js), постеры одним запросом GraphQL
const FRANCHISE_HIDDEN = /^(клип|проморолик|реклама|music|pv|cm)$/i;
async function fetchFranchises(random) {
    for (const [i, t] of random.entries()) {
        process.stdout.write(`\rфраншизы: ${i + 1} из ${random.length}`);
        let raw = null;
        for (let attempt = 0; attempt < 3 && !raw; attempt++) {
            const r = await fetch(`https://shikimori.io/api/animes/${t.id}/franchise`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
            if (r.status === 429) { await wait(2000); continue; }
            raw = r.ok ? await r.json() : { nodes: [] };
        }
        await wait(400);
        const nodes = (raw && raw.nodes || []).filter(n => !FRANCHISE_HIDDEN.test(String(n.kind || '').trim()))
            .map(n => ({ id: Number(n.id), name: n.name, kind: n.kind, year: n.year || null, date: Number.isFinite(n.date) ? n.date : null }));
        if (nodes.length < 2) { t.franchise = null; continue; }
        const ids = new Set(nodes.map(n => n.id));
        const links = (raw.links || []).map(l => ({ source_id: Number(l.source_id), target_id: Number(l.target_id), relation: l.relation }))
            .filter(l => ids.has(l.source_id) && ids.has(l.target_id));
        const posters = {};
        for (let k = 0; k < nodes.length; k += 50) {
            const chunk = nodes.slice(k, k + 50).map(n => n.id);
            const data = await gql(`{ animes(ids: "${chunk.join(',')}", limit: ${chunk.length}) { id poster { mainUrl } } }`);
            (data.animes || []).forEach(a => { if (a.poster && a.poster.mainUrl) posters[Number(a.id)] = a.poster.mainUrl; });
        }
        t.franchise = { data: { current_id: t.id, nodes, links }, posters };
    }
    return random;
}

(async () => {
    if (process.argv.includes('--franchise-only')) {
        const text = fs.readFileSync(OUT, 'utf8');
        const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
        await fetchFranchises(data.random);
        fs.writeFileSync(OUT, text.slice(0, text.indexOf('{')) + JSON.stringify(data) + ';\n');
        console.log(`\nфраншизы: ${data.random.filter(t => t.franchise).length} из ${data.random.length} → ${OUT}`);
        return;
    }
    const top = await fetchTop();
    const random = await fetchRandom(pickRandomIds());
    console.log(`\nслучайных: ${random.length}`);
    const schedule = await fetchSchedule();
    console.log(`расписание: ${schedule.length}`);
    // Те же тайтлы, что в примере списка «Смотрю» (pages.js)
    const watchIds = schedule.filter(x => x.poster && x.score >= 7).slice(0, 5).map(x => x.id);
    const songs = await fetchSongs(watchIds);
    console.log(`песни: ${Object.keys(songs).length} тайтлов`);
    await fetchFranchises(random);
    console.log('');
    const sites = await findSites(random);
    const data = { built: new Date().toISOString().slice(0, 10), builtAt: Date.now(), sites, top, random, schedule, songs };
    fs.writeFileSync(OUT, `// Собрано tools/design-lab/build-data.js ${data.built}. Данные Shikimori и ссылки на сайты\nwindow.LAB_DATA = ${JSON.stringify(data)};\n`);
    // Каталог подбора — как в расширении: подбор в презентации работает на настоящей логике (modules/shared/pick-core.js)
    const catalog = fs.readFileSync(path.join(__dirname, '..', '..', 'pick', 'catalog.json'), 'utf8');
    fs.writeFileSync(path.join(__dirname, 'data-pick.js'), `// Копия pick/catalog.json для презентации\nwindow.PICK_CATALOG = ${catalog};\n`);
    console.log(`\nготово: рейтинг ${top.length}, случайных ${random.length}, расписание ${schedule.length}, ${(fs.statSync(OUT).size / 1024).toFixed(0)} КБ → ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
