#!/usr/bin/env node
// Сборка базы аудиоотпечатков: для каждого тайтла берёт песни с AnimeThemes и сохраняет отпечатки в <папка>/<ID MAL>.json.
// Звук в базу не попадает. Запускается редко и не спеша: серверы AnimeThemes держат волонтёры.
//
//   node tools/build-fingerprints.js --out fingerprints --ids 1,20,5114
//   node tools/build-fingerprints.js --out fingerprints --top 3000 --ongoing 300    онгоинги и популярное с Shikimori
//   --limit-minutes 300 --audio-cache <папка>                              ограничение времени и кэш скачанного звука
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

async function themesOf(id) {
    const u = `https://api.animethemes.moe/anime?filter[has]=resources&filter[site]=MyAnimeList&filter[external_id]=${id}&include=animethemes.animethemeentries.videos.audio&fields[audio]=link&fields[video]=filename`;
    const anime = (await json(u)).anime || [];
    if (!anime[0]) return [];
    return (anime[0].animethemes || []).map((t) => {
        const entries = t.animethemeentries || [];
        const audio = entries.flatMap(e => e.videos || []).map(v => v.audio && v.audio.link).find(Boolean);
        return { type: t.type, slug: t.slug, episodes: (entries[0] && entries[0].episodes) || '', audio };
    }).filter(t => t.audio && (t.type === 'OP' || t.type === 'ED'));
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

// Онгоинг получает новые песни по ходу сезона, а песни тайтла без записи на AnimeThemes могут появиться позже
function needsBuild(file, ongoing) {
    if (!fs.existsSync(file)) return true;
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return true; }
    const age = Date.now() - (saved.built || 0);
    if (ongoing && age > ONGOING_REFRESH_MS) return true;
    return !saved.songs.length && age > EMPTY_REFRESH_MS;
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

(async () => {
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
        ids = [...new Set([...ongoing, ...(await listIds(Number(arg('top', 100))))])];
    }
    const started = Date.now();
    let built = 0;
    for (const id of ids) {
        if (limitMin && Date.now() - started > limitMin * 60000) break;
        if (!needsBuild(path.join(outDir, `${id}.json`), ongoing.has(id))) continue;
        try {
            const n = await buildTitle(id, outDir, cacheDir);
            built++;
            console.log(`${id}: песен ${n}`);
        } catch (e) {
            console.log(`${id}: ошибка ${e.message}`);
        }
    }
    console.log(`готово, собрано тайтлов: ${built}`);
    process.exit(0);
})();
