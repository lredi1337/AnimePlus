#!/usr/bin/env node
// Сборка базы аудиоотпечатков: для каждого тайтла берёт песни с AnimeThemes и сохраняет отпечатки в <папка>/<ID MAL>.json.
// Звук в базу не попадает. Запускается редко и не спеша: серверы AnimeThemes держат волонтёры.
//
//   node tools/build-fingerprints.js --out fingerprints --ids 1,20,5114
//   node tools/build-fingerprints.js --out fingerprints --top 3000 --ongoing 300    онгоинги и популярное с Shikimori
//   --animethemes                                                          затем все остальные тайтлы с AnimeThemes
//   --limit-minutes 300 --audio-cache <папка>                              ограничение времени и кэш скачанного звука
//   --max-errors 20                                                        столько ошибок подряд останавливают сборку с кодом 1
//
// Нужен ffmpeg в PATH. Уже собранные тайтлы пропускаются, поэтому прервать и продолжить можно в любой момент.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const FP = require('../modules/audio/fingerprint.js');

const UA = 'AnimePlus-fingerprints/1.0 (https://github.com/lredi1337/AnimePlus)';
const PAUSE_MS = 1500;
const PARTS = 4;
const ONGOING_REFRESH_MS = 7 * 24 * 3600 * 1000;
const EMPTY_REFRESH_MS = 30 * 24 * 3600 * 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

async function json(url) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
}

// AnimeThemes отвечает только через GraphQL: старый REST api.animethemes.moe с ноября 2026 отдаёт 503.
// Ошибки GraphQL приходят со статусом 200 в поле errors
const GQL_URL = 'https://graphql.animethemes.moe/';

function gqlData(body) {
    if (body.errors && body.errors.length) throw new Error(`GraphQL: ${body.errors.map(e => e.message).join('; ')}`);
    return body.data;
}

async function gql(query, variables = {}) {
    const r = await fetch(GQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(60000)
    });
    if (!r.ok) throw new Error(`${GQL_URL}: ${r.status}`);
    return gqlData(await r.json());
}

const THEMES_QUERY = `query ($id: [Int!]) {
  findAnimeByExternalSite(site: MAL, id: $id) {
    animethemes { type slug animethemeentries { episodes videos { nodes { audio { link } } } } }
  }
}`;

function themesFromAnime(anime) {
    return ((anime && anime.animethemes) || []).map((t) => {
        const entries = t.animethemeentries || [];
        const audio = entries.flatMap(e => (e.videos && e.videos.nodes) || []).map(v => v.audio && v.audio.link).find(Boolean);
        return { type: t.type, slug: t.slug, episodes: (entries[0] && entries[0].episodes) || '', audio };
    }).filter(t => t.audio && (t.type === 'OP' || t.type === 'ED'));
}

async function themesOf(id) {
    const found = (await gql(THEMES_QUERY, { id: [id] })).findAnimeByExternalSite || [];
    return themesFromAnime(found[0]);
}

// Сервер отдаёт файлы медленно: несколько диапазонов параллельно и лимит времени
async function download(url, file) {
    const head = await fetch(url, { headers: { 'User-Agent': UA, Range: 'bytes=0-0' }, signal: AbortSignal.timeout(40000) });
    if (!head.ok) throw new Error(`образец: ${head.status}`);
    const total = Number((head.headers.get('content-range') || '').split('/')[1]);
    await head.arrayBuffer();
    if (!total) throw new Error('образец: нет размера');
    const size = Math.ceil(total / PARTS);
    const parts = await Promise.all(Array.from({ length: PARTS }, async (_, i) => {
        const r = await fetch(url, { headers: { 'User-Agent': UA, Range: `bytes=${i * size}-${Math.min(total, (i + 1) * size) - 1}` }, signal: AbortSignal.timeout(300000) });
        return Buffer.from(await r.arrayBuffer());
    }));
    fs.writeFileSync(file, Buffer.concat(parts));
}

async function songPcm(url, cacheDir) {
    const name = url.split('/').pop().replace(/\W+/g, '_');
    const cached = cacheDir && path.join(cacheDir, `ref_${name}.f32`);
    if (cached && fs.existsSync(cached)) {
        const b = fs.readFileSync(cached);
        return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ap-fp-'));
    const src = path.join(dir, 'song');
    const pcmFile = path.join(dir, 'song.f32');
    try {
        for (let attempt = 0; ; attempt++) {
            try {
                await download(url, src);
                break;
            } catch (e) {
                if (attempt >= 2) throw e;
                await sleep(5000 * (attempt + 1));
            }
        }
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-ac', '1', '-ar', String(FP.SAMPLE_RATE), '-f', 'f32le', pcmFile], { stdio: 'ignore' });
        const b = fs.readFileSync(pcmFile);
        return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function listIds(count, status) {
    const ids = [];
    for (let page = 1; ids.length < count; page++) {
        const list = await json(`https://shikimori.io/api/animes?order=popularity&limit=50&page=${page}${status ? `&status=${status}` : ''}`);
        if (!list.length) break;
        list.forEach(a => ids.push(a.id));
        await sleep(PAUSE_MS);
    }
    return ids.slice(0, count);
}

// Все тайтлы AnimeThemes со ссылкой на MyAnimeList: animePagination страницами по 100, около 50 запросов.
// Сбой сервера не роняет сборку: остаётся очередь с Shikimori
const LIST_QUERY = `query ($page: Int) {
  animePagination(first: 100, page: $page) {
    paginatorInfo { hasMorePages }
    data { resources(site: MAL) { nodes { externalId } } }
  }
}`;

async function animeThemesIds(getGql = gql, pauseMs = PAUSE_MS) {
    const ids = new Set();
    try {
        for (let page = 1; ; page++) {
            const p = (await getGql(LIST_QUERY, { page })).animePagination;
            for (const a of p.data || []) {
                for (const r of (a.resources && a.resources.nodes) || []) {
                    const id = Number(r.externalId);
                    if (Number.isInteger(id) && id > 0) ids.add(id);
                }
            }
            if (!p.paginatorInfo || !p.paginatorInfo.hasMorePages) break;
            await sleep(pauseMs);
        }
    } catch (e) {
        console.log(`список AnimeThemes: ${e.message}, собрано ${ids.size}`);
    }
    return [...ids];
}

// Порядок: онгоинги (их смотрят сейчас), популярное, затем остальное с AnimeThemes, новые тайтлы раньше старых
function buildQueue(ongoing, top, themes = []) {
    const first = [...new Set([...ongoing, ...top])];
    const seen = new Set(first);
    return [...first, ...themes.filter(id => !seen.has(id)).sort((a, b) => b - a)];
}

// Онгоинг получает новые песни по ходу сезона, а песни тайтла без записи на AnimeThemes могут появиться позже
function needsBuild(file, ongoing) {
    if (!fs.existsSync(file)) return true;
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return true; }
    const age = Date.now() - (saved.built || 0);
    if (ongoing && age > ONGOING_REFRESH_MS) return true;
    return !saved.songs.length && age > EMPTY_REFRESH_MS;
}

// Серия ошибок подряд значит, что источник недоступен: сборка останавливается и прогон краснеет, а не молча ничего не делает
class Stopper {
    constructor(limit) { this.limit = limit; this.streak = 0; }
    ok() { this.streak = 0; }
    fail() { this.streak++; }
    get stopped() { return this.streak >= this.limit; }
}

async function buildTitle(id, outDir, cacheDir) {
    const themes = await themesOf(id);
    const songs = [];
    for (const t of themes) {
        const pcm = await songPcm(t.audio, cacheDir);
        songs.push({
            slug: t.slug,
            type: t.type,
            episodes: t.episodes,
            len: Math.round(pcm.length / FP.SAMPLE_RATE * 10) / 10,
            fp: FP.encodeSong(FP.hashes(pcm))
        });
        await sleep(PAUSE_MS);
    }
    fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify({ id, built: Date.now(), songs }));
    return songs.length;
}

async function main() {
    const outDir = arg('out', 'fingerprints');
    const cacheDir = arg('audio-cache', null);
    const limitMin = Number(arg('limit-minutes', 0));
    fs.mkdirSync(outDir, { recursive: true });
    let ongoing = new Set();
    let ids;
    if (arg('ids')) {
        ids = arg('ids').split(',').map(Number);
    } else {
        // Сначала онгоинги: их смотрят прямо сейчас, затем популярное
        ongoing = new Set(await listIds(Number(arg('ongoing', 300)), 'ongoing'));
        const top = await listIds(Number(arg('top', 100)));
        const themes = process.argv.includes('--animethemes') ? await animeThemesIds() : [];
        ids = buildQueue([...ongoing], top, themes);
        console.log(`очередь: ${ids.length} тайтлов, из них с AnimeThemes сверх Shikimori ${ids.length - new Set([...ongoing, ...top]).size}`);
    }
    const started = Date.now();
    let built = 0;
    const stopper = new Stopper(Number(arg('max-errors', 20)));
    for (const id of ids) {
        if (limitMin && Date.now() - started > limitMin * 60000) break;
        if (!needsBuild(path.join(outDir, `${id}.json`), ongoing.has(id))) continue;
        try {
            const n = await buildTitle(id, outDir, cacheDir);
            built++;
            stopper.ok();
            console.log(`${id}: песен ${n}`);
        } catch (e) {
            stopper.fail();
            console.log(`${id}: ошибка ${e.message}`);
            if (stopper.stopped) break;
        }
    }
    console.log(`готово, собрано тайтлов: ${built}`);
    if (stopper.stopped) console.log(`остановлено: ${stopper.streak} ошибок подряд, источник недоступен`);
    process.exit(stopper.stopped ? 1 : 0);
}

if (require.main === module) main();

module.exports = { animeThemesIds, buildQueue, themesFromAnime, gqlData, Stopper };
