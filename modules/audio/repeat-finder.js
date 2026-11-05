// modules/audio/repeat-finder.js
// Сравнение серий одного тайтла: опенинг и эндинг повторяются из серии в серию, а сюжет нет.
// Звук не хранится: только его необратимые отпечатки начала и конца серии, в браузере зрителя.
// Совпавшие хэши с одним и тем же сдвигом времени между сериями образуют непрерывный кусок. Это и есть песня.

(function (root) {
    'use strict';

    const FP = root.AgFingerprint;

    const LIMITS = {
        minSec: 30,          // короче это не песня, а, например, заставка или общий звук
        maxSec: 240,         // длиннее это не песня: повтор большого куска серии
        maxGapSec: 6,        // тихие места внутри песни дают разрывы, но не такие длинные
        minVotes: 40,        // столько совпадений за один сдвиг случайно не набирается
        minDensity: 0.4,     // совпадений в секунду: у песни плотно, у случайных редко
        maxPerHash: 10,      // частые хэши не различают места в серии
        bucketFrames: 4
    };
    // Автопрыжок только при обычной длине песни. Иначе это может быть пересказ прошлой серии, поэтому только кнопка.
    // Края песни часто тише и совпадают хуже: на замере опенинг в 90 с находился как 84 с
    const AUTO = { op: { min: 80, max: 95 }, ed: { min: 60, max: 130 } };
    // Последнее совпадение стоит раньше настоящего конца: замер на настоящих сериях давал 1-1,3 с
    const END_PAD_SEC = 1;

    /** Отпечаток участка серии для хранения: только четверть хэшей, как в базе песен */
    function packPrint(list) {
        const kept = list.filter(x => FP.keepHash(x.h));
        const base = kept.reduce((least, x) => Math.min(least, x.sec), kept.length ? Infinity : 0);
        const frames = kept.map(x => ({ h: x.h, t: Math.round((x.sec - base) / FP.FRAME_SEC) }));
        return { base, fp: FP.encodeSong(frames) };
    }

    function unpackPrint(print) {
        return { base: print.base, index: FP.indexSong(print.fp) };
    }

    /** Непрерывные куски среди отсортированных времён совпадений */
    function runsOf(times, cfg) {
        const runs = [];
        let start = 0;
        for (let i = 1; i <= times.length; i++) {
            if (i < times.length && times[i] - times[i - 1] <= cfg.maxGapSec) continue;
            const from = times[start];
            const to = times[i - 1];
            const votes = i - start;
            const len = to - from;
            if (len >= cfg.minSec && len <= cfg.maxSec && votes >= cfg.minVotes && votes / len >= cfg.minDensity) runs.push({ start: from, end: to, votes });
            start = i;
        }
        return runs;
    }

    /**
     * Куски текущей серии, которые повторяются в другой. current: [{ h, sec }], other: распакованный отпечаток.
     * Сдвиг у куска один: песня идёт в обеих сериях с одной скоростью, хотя и может начинаться в разное время.
     */
    function findRuns(current, other, options) {
        const cfg = { ...LIMITS, ...(options || {}) };
        const step = cfg.bucketFrames * FP.FRAME_SEC;
        const byOffset = new Map();
        for (const { h, sec } of current) {
            if (!FP.keepHash(h)) continue;
            const refs = other.index.get(h);
            if (!refs || refs.length > cfg.maxPerHash) continue;
            for (const frame of refs) {
                const key = Math.round((sec - (other.base + frame * FP.FRAME_SEC)) / step);
                let times = byOffset.get(key);
                if (!times) byOffset.set(key, times = []);
                times.push(sec);
            }
        }
        const runs = [];
        for (const key of byOffset.keys()) {
            // Округление разносит один сдвиг по соседним корзинам: считаем их вместе, но с вершины
            const here = byOffset.get(key).length;
            if ((byOffset.get(key - 1) || []).length > here || (byOffset.get(key + 1) || []).length >= here) continue;
            const times = [...byOffset.get(key), ...(byOffset.get(key - 1) || []), ...(byOffset.get(key + 1) || [])].sort((a, b) => a - b);
            runs.push(...runsOf(times, cfg));
        }
        return runs.sort((a, b) => b.votes - a.votes);
    }

    /** Лучший кусок для части серии: { start, end, manual }. Кусок обычной длины важнее самого длинного: рядом бывает пересказ прошлой серии */
    function pickRun(part, runs) {
        if (!runs.length) return null;
        const auto = AUTO[part];
        const fits = (r) => {
            const len = r.end - r.start;
            return len >= auto.min && len <= auto.max;
        };
        const best = runs.find(fits) || runs[0];
        return { start: best.start, end: best.end + END_PAD_SEC, manual: !fits(best) };
    }

    // Кусок считаем законченным, если после него уже есть звук: иначе песня может просто продолжаться в следующей порции
    const SETTLE_SEC = 3;
    const MIN_PRINT_HASHES = 200;

    /**
     * Накопление отпечатков серии по порциям анализа заранее и сравнение с прошлыми сериями.
     * loadOthers(part) → упакованные отпечатки других серий, onFound(part, { start, end, manual }).
     */
    function createComparer({ loadOthers, onFound }) {
        const buffers = { op: [], ed: [] };
        const others = {};
        const done = {};
        const compare = async (part, final) => {
            if (done[part] || !buffers[part].length) return;
            if (!others[part]) {
                const list = (await loadOthers(part).catch(() => null)) || [];
                others[part] = list.map(unpackPrint);
            }
            const last = buffers[part][buffers[part].length - 1].sec;
            const picks = others[part].map(o => pickRun(part, findRuns(buffers[part], o))).filter(Boolean);
            const best = picks.find(p => !p.manual) || picks[0];
            if (!best || (!final && best.end > last - SETTLE_SEC)) return;
            done[part] = true;
            onFound(part, best);
        };
        return {
            /** Очередная порция хэшей: { h, sec }. final — участок закончился */
            add(part, list, final = false) {
                for (const x of list) if (FP.keepHash(x.h)) buffers[part].push(x);
                return compare(part, final);
            },
            /** Отпечаток участка для следующих серий или null, если звука мало */
            print(part) {
                return buffers[part].length >= MIN_PRINT_HASHES ? packPrint(buffers[part]) : null;
            }
        };
    }

    const api = { LIMITS, AUTO, packPrint, unpackPrint, findRuns, pickRun, createComparer };
    root.AgRepeatFinder = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
