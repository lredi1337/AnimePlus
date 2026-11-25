#!/usr/bin/env node
// Сборка каталога для подбора аниме вопросами (pick/pick.js): популярные тайтлы Shikimori с жанрами, темами и числом зрителей.
// Каталог входит в расширение: подбор работает сразу и без запросов к Shikimori. Пересобирать перед выпуском.
//
//   node tools/build-pick-catalog.js                    первые 4000 по популярности → pick/catalog.json
//   node tools/build-pick-catalog.js --top 6000 --out pick/catalog.json
//
// От франшизы остаётся одна часть, самая популярная (обычно первая): продолжение без начала советовать бессмысленно.

const fs = require('fs');
const path = require('path');

const UA = 'AnimePlus-pick/1.0 (https://github.com/lredi1337/AnimePlus)';
const GQL_URL = 'https://shikimori.io/api/graphql';
const PAGE = 50;
// Shikimori: не больше 5 запросов в секунду и 90 в минуту
const PAUSE_MS = 800;
const KINDS = new Set(['tv', 'movie', 'ona', 'ova']);
// Хентай и эротика
const BANNED_GENRES = new Set([12, 539]);
const POSTER_PREFIX = '/uploads/poster/animes/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}

const QUERY = `query ($page: PositiveInt!) {
  animes(limit: ${PAGE}, page: $page, order: popularity) {
    id name russian kind rating score episodes episodesAired status franchise
    airedOn { year }
    poster { previewUrl }
    genres { id russian kind }
    studios { name }
    statusesStats { status count }
  }
}`;

async function gql(query, variables) {
    const r = await fetch(GQL_URL, {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(60000)
    });
    if (!r.ok) throw new Error(`${GQL_URL}: ${r.status}`);
    const body = await r.json();
    if (body.errors && body.errors.length) throw new Error(`GraphQL: ${body.errors.map(e => e.message).join('; ')}`);
    return body.data;
}

/** Путь постера без адреса сайта: «16498/preview-….webp». Адрес Shikimori меняется, путь нет */
function posterPath(url) {
    const s = String(url || '');
    const i = s.indexOf(POSTER_PREFIX);
    return i >= 0 ? s.slice(i + POSTER_PREFIX.length) : '';
}

/** Тайтл GraphQL → строка каталога или null, если подбору он не подходит */
function toItem(a) {
    if (!a || !KINDS.has(a.kind) || a.status === 'anons' || a.rating === 'rx') return null;
    const genres = (a.genres || []).map(g => Number(g.id)).filter(Boolean);
    if (genres.some(g => BANNED_GENRES.has(g))) return null;
    const viewers = (a.statusesStats || []).reduce((sum, s) => sum + (Number(s.count) || 0), 0);
    return {
        id: Number(a.id),
        ru: a.russian || a.name || '',
        en: a.name || '',
        kind: a.kind,
        eps: Number(a.episodes) || Number(a.episodesAired) || 0,
        year: (a.airedOn && a.airedOn.year) || 0,
        score: Math.round((Number(a.score) || 0) * 100) / 100,
        viewers,
        rating: a.rating || '',
        ongoing: a.status === 'ongoing' ? 1 : 0,
        genres,
        studio: (a.studios && a.studios[0] && a.studios[0].name) || '',
        poster: posterPath(a.poster && a.poster.previewUrl),
        franchise: a.franchise || ''
    };
}

// «… 2nd Season», «Season 3», «… II», «… 2», «Part 2»: продолжение по названию
const SEQUEL = /\s*(?:(?:\d+(?:st|nd|rd|th)|second|third|final)\s+season|season\s*\d+|part\s*\d+|\b(?:II|III|IV)|\d)\s*$/i;

/** Название без пометки продолжения, в нижнем регистре; null — если пометки нет */
function sequelBase(name) {
    const s = String(name || '').trim();
    if (!SEQUEL.test(s)) return null;
    const base = s.replace(SEQUEL, '').replace(/[\s:.,-]+$/, '').toLowerCase();
    return base || null;
}

/**
 * Одна часть на франшизу: та, у которой больше всего зрителей. У новых тайтлов Shikimori франшизу ещё не указал,
 * поэтому продолжение узнаём и по названию: «X 2nd Season» уходит, если в каталоге есть «X». Порядок — по зрителям
 */
function onePerFranchise(items) {
    const best = new Map();
    const loose = [];
    for (const it of items) {
        if (!it.franchise) { loose.push(it); continue; }
        const was = best.get(it.franchise);
        if (!was || it.viewers > was.viewers) best.set(it.franchise, it);
    }
    const kept = [...loose, ...best.values()];
    const names = new Set(items.map(it => String(it.en || '').trim().toLowerCase()));
    return kept.filter(it => { const base = sequelBase(it.en); return !base || !names.has(base); })
        .sort((a, b) => b.viewers - a.viewers);
}

/** Каталог компактно: названия полей один раз, тайтлы — массивами */
const FIELDS = ['id', 'ru', 'en', 'kind', 'eps', 'year', 'score', 'viewers', 'rating', 'ongoing', 'genres', 'studio', 'poster'];
function pack(items, genres, built) {
    return { v: 1, built, fields: FIELDS, genres, items: items.map(it => FIELDS.map(f => it[f])) };
}

async function fetchAll(top, request = gql, pause = PAUSE_MS) {
    const raw = [];
    const genres = {};
    for (let page = 1; raw.length < top; page++) {
        const data = await request(QUERY, { page });
        const list = (data && data.animes) || [];
        list.forEach(a => (a.genres || []).forEach(g => { genres[g.id] = g.russian; }));
        raw.push(...list);
        if (list.length < PAGE) break;
        if (process.stdout.isTTY) process.stdout.write(`\rстраниц: ${page}, тайтлов: ${raw.length}`);
        await sleep(pause);
    }
    return { raw: raw.slice(0, top), genres };
}

async function main() {
    const top = Number(arg('top', 4000));
    const out = path.resolve(arg('out', path.join(__dirname, '..', 'pick', 'catalog.json')));
    const { raw, genres } = await fetchAll(top);
    const items = onePerFranchise(raw.map(toItem).filter(Boolean));
    const built = new Date().toISOString().slice(0, 10);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(pack(items, genres, built)));
    console.log(`\nготово: ${items.length} тайтлов из ${raw.length}, ${(fs.statSync(out).size / 1024).toFixed(0)} КБ → ${out}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { toItem, onePerFranchise, sequelBase, pack, posterPath, fetchAll, FIELDS };
