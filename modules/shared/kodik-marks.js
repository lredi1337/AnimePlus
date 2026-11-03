// modules/shared/kodik-marks.js
// Метки опенинга и эндинга с Kodik для другого плеера: у Kodik они свои для каждой серии и озвучки.
// Страницы Kodik загружаются без самого плеера: в них есть и метки, и адреса других серий и озвучек.

(function (root) {
    'use strict';

    const QUALITY = '720p';
    const ALLOWED_HOST = /(^|\.)(kodik\.info|kodikplayer\.com|kodik\.biz|kodik\.cc)$/;
    const SITE_PARAMS = ['d', 'd_sign', 'pd', 'pd_sign', 'ref', 'ref_sign'];
    const MIN_MARK_SEC = 30;
    const CACHE_LIMIT = 300;

    const clockToSec = (text) => String(text).split(':').reduce((sum, part) => sum * 60 + Number(part), 0);

    /** parseSkipButton("00:13-01:43,22:53-24:23", "anime") → [{ start, end }] */
    function parseMarks(html) {
        const found = String(html || '').match(/parseSkipButton\(\s*["']([^"']*)["']/);
        if (!found) return [];
        const out = [];
        for (const part of found[1].split(',')) {
            const range = part.trim().match(/^(?:\[[^\]]*\])?\s*(\d+(?::\d{1,2}){0,2})\s*-\s*(\d+(?::\d{1,2}){0,2})$/);
            if (!range) continue;
            const start = clockToSec(range[1]);
            const end = clockToSec(range[2]);
            if (end - start >= MIN_MARK_SEC) out.push({ start, end });
        }
        return out;
    }

    /** Метка до середины серии — опенинг, после — эндинг */
    function splitMarks(ranges, duration) {
        const middle = (duration > 0 ? duration : 1440) / 2;
        const result = { op: null, ed: null };
        for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
            if (range.start < middle) result.op = result.op || range;
            else result.ed = range;
        }
        return result;
    }

    /** Пункты выпадающего списка из страницы плеера: box — класс блока */
    function readOptions(html, box) {
        // Имя блока встречается и в стилях страницы, а нужен сам блок
        const from = String(html || '').search(new RegExp(`class="[^"]*${box}`));
        if (from < 0) return [];
        const to = html.indexOf('</select>', from);
        const block = html.slice(from, to < 0 ? undefined : to);
        return [...block.matchAll(/<option\b([^>]*)>/g)].map((m) => {
            const attrs = {};
            for (const a of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
            return attrs;
        });
    }

    // «Дубляж Flarrow Films», «AniLibria.TV», «(Russian) Anilibria» → одно написание. Части названия не сравниваем: AniStar и AniStar & DEEP — разные озвучки
    const voiceKey = (name) => String(name || '').toLowerCase()
        .replace(/\([^)]*\)/g, '')
        .replace(/дубляж|многоголосый|одноголосый/g, '')
        .replace(/[^a-z0-9а-яё]/g, '')
        .replace(/(tv|online)$/, '');

    const pickVoice = (options, voice) => options.find(o => voiceKey(o['data-title']) === voiceKey(voice)) || null;

    const pickEpisode = (options, episode) => options.find(o => o.value === String(episode) || (o['data-title'] || '').replace(/\D/g, '') === String(episode)) || null;

    const cache = new Map();

    /** { url, episode, voice, season } → [{ start, end }]. url — любая страница этого тайтла на Kodik */
    async function find({ url, episode, voice, season }, fetchPage) {
        const address = new URL(String(url).replace(/^\/\//, 'https://'));
        if (address.protocol !== 'https:' || !ALLOWED_HOST.test(address.hostname)) return [];
        // Подпись сайта действует только в его кадре: с ней страница отвечает ошибкой
        SITE_PARAMS.forEach(name => address.searchParams.delete(name));
        const key = `${address.pathname}|${episode}|${voiceKey(voice)}|${season || ''}`;
        if (cache.has(key)) return cache.get(key);

        const pageOf = (type, id, hash) => fetchPage(`https://${address.hostname}/${type}/${id}/${hash}/${QUALITY}`);
        let html = await fetchPage(address.href);
        if (!html) return [];
        // Плеер открыт сайтом на одну серию и озвучку: метки уже здесь
        const voices = readOptions(html, 'serial-translations-box');
        if (voice && voices.length) {
            const own = pickVoice(voices, voice);
            if (!own) return [];
            if (own.selected === undefined) html = await pageOf(own['data-media-type'], own['data-media-id'], own['data-media-hash']);
        }
        const seasons = readOptions(html, 'serial-seasons-box');
        if (season && seasons.length > 1) {
            const wanted = seasons.find(o => o.value === String(season));
            if (wanted && wanted.selected === undefined) html = await pageOf('serial', wanted['data-serial-id'], wanted['data-serial-hash']);
        }
        const episodes = readOptions(html, 'serial-series-box');
        if (episodes.length) {
            const target = pickEpisode(episodes, episode);
            if (!target) return [];
            html = await pageOf('seria', target['data-id'], target['data-hash']);
            // Сбой сети не запоминаем: в следующий раз метки могут найтись
            if (!html) return [];
        }
        const marks = parseMarks(html);
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(key, marks);
        return marks;
    }

    const api = { parseMarks, splitMarks, readOptions, voiceKey, pickVoice, pickEpisode, find };
    root.AgKodikMarks = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
