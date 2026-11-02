// Аудиоотпечатки: потоковый расчёт, узнавание песни в серии, чужая песня и выбор источника времени
const test = require('node:test');
const assert = require('node:assert');
const FP = require('../modules/audio/fingerprint.js');

require('../modules/audio/audio-skip.js');
const { parseNativeMarks, splitNativeMarks, songInEpisode, chooseTimings } = globalThis.AgAudioSkip;

const SR = FP.SAMPLE_RATE;

test('метка сайта для этой озвучки важнее общей базы и узнанной песни', () => {
    const site = { start: 0, end: 89, source: 'site' };
    assert.deepStrictEqual(chooseTimings({ native: site, shared: { start: 5, end: 95 }, hit: null, mark: null }), site);
    assert.equal(chooseTimings({ native: { start: 1, end: 90 } }).source, 'kodik');
});

test('метки Kodik: обе части, часы и пустая строка', () => {
    const script = 'playerSettings.skipButton = parseSkipButton("03:15-04:46,22:42-24:12", "anime");';
    assert.deepStrictEqual(parseNativeMarks(script), [{ start: 195, end: 286 }, { start: 1362, end: 1452 }]);
    assert.deepStrictEqual(parseNativeMarks('parseSkipButton("1:02:03-1:03:33", "anime")'), [{ start: 3723, end: 3813 }]);
    assert.deepStrictEqual(parseNativeMarks('parseSkipButton("", "anime")'), []);
    assert.deepStrictEqual(parseNativeMarks('нет меток'), []);
});

test('метка с начала серии без минут: 00-01:30', () => {
    assert.deepStrictEqual(parseNativeMarks('parseSkipButton("00-01:30,24:20-25:59", "anime")'), [{ start: 0, end: 90 }, { start: 1460, end: 1559 }]);
});

test('метки сайта в адресе кадра: название части и секунды', () => {
    assert.deepStrictEqual(parseNativeMarks('parseSkipButton("[opening]0-89,[ending]1335-1425")'), [{ start: 0, end: 89 }, { start: 1335, end: 1425 }]);
    assert.deepStrictEqual(parseNativeMarks('parseSkipButton("[opening]01:05-02:34")'), [{ start: 65, end: 154 }]);
});

test('заглушка сайта и титры озвучки не считаются метками песни', () => {
    assert.deepStrictEqual(parseNativeMarks('parseSkipButton("[opening]999999-1000000,[ending]999999-1000000,[intro]999999-1000000,[credits]999999-1000000")'), []);
    assert.deepStrictEqual(parseNativeMarks('parseSkipButton("[opening]0-89,[ending]1428-1442")'), [{ start: 0, end: 89 }]);
});

test('метка только на одной части: вторую оставляем поиску', () => {
    assert.deepStrictEqual(splitNativeMarks([{ start: 195, end: 286 }], 1452), { op: { start: 195, end: 286 }, ed: null });
    assert.deepStrictEqual(splitNativeMarks([{ start: 1362, end: 1452 }], 1452), { op: null, ed: { start: 1362, end: 1452 } });
    const both = splitNativeMarks([{ start: 1362, end: 1452 }, { start: 195, end: 286 }], 1452);
    assert.strictEqual(both.op.start, 195);
    assert.strictEqual(both.ed.start, 1362);
    assert.deepStrictEqual(splitNativeMarks([], 1452), { op: null, ed: null });
});

test('опенинг в позднем месте остаётся опенингом, если серия длинная', () => {
    const r = splitNativeMarks([{ start: 800, end: 890 }], 3000);
    assert.strictEqual(r.op.start, 800);
});

// Детерминированный генератор: «песня» это последовательность случайных нот, «серия» это шум с речевыми всплесками
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function song(seed, seconds) {
    const r = rng(seed);
    const out = new Float32Array(seconds * SR);
    const noteLen = Math.floor(SR * 0.18);
    for (let n = 0; n * noteLen < out.length; n++) {
        const freqs = [0, 1, 2, 3].map(() => 120 + r() * 3200);
        for (let i = 0; i < noteLen && n * noteLen + i < out.length; i++) {
            const env = Math.sin(Math.PI * i / noteLen);
            let v = 0;
            for (const f of freqs) v += Math.sin(2 * Math.PI * f * i / SR);
            out[n * noteLen + i] = 0.2 * env * v;
        }
    }
    return out;
}

function episode(seed, seconds, inserts) {
    const r = rng(seed);
    const out = new Float32Array(seconds * SR);
    for (let i = 0; i < out.length; i++) out[i] = (r() - 0.5) * 0.05;
    const speech = song(seed + 1000, seconds);
    for (let i = 0; i < out.length; i++) out[i] += speech[i] * 0.4 * (Math.sin(i / SR / 3) > 0 ? 1 : 0.1);
    for (const { pcm, at, gain = 1 } of inserts) {
        for (let i = 0; i < pcm.length && at * SR + i < out.length; i++) {
            out[at * SR + i] = out[at * SR + i] * 0.05 + pcm[i] * gain;
        }
    }
    return out;
}

function live(pcm, songs, base = 0) {
    const matcher = FP.createMatcher(songs);
    const hits = [];
    const hasher = FP.createHasher((h, t) => {
        const sec = base + t * FP.FRAME_SEC;
        const r = matcher.feed(h, sec);
        if (r) hits.push({ id: r.song.id, start: r.start, at: sec });
    });
    for (let i = 0; i < pcm.length; i += SR) hasher.push(pcm.subarray(i, i + SR));
    hasher.finish();
    return hits;
}

const prepared = (id, pcm) => {
    const fp = FP.encodeSong(FP.hashes(pcm));
    return { id, type: 'OP', len: pcm.length / SR, index: FP.indexSong(fp), fp };
};

test('потоковый расчёт хэшей совпадает с расчётом целиком при любом размере порций', () => {
    const pcm = song(1, 20);
    const whole = FP.hashes(pcm);
    for (const step of [777, SR, 4096]) {
        const got = [];
        const h = FP.createHasher((x, t) => got.push({ h: x, t }));
        for (let i = 0; i < pcm.length; i += step) h.push(pcm.subarray(i, i + step));
        h.finish();
        assert.deepStrictEqual(got, whole);
    }
});

test('упаковка оставляет примерно четверть хэшей и переживает кодирование', () => {
    const list = FP.hashes(song(2, 30));
    const fp = FP.encodeSong(list);
    const kept = list.filter(x => FP.keepHash(x.h));
    assert.ok(kept.length > list.length * 0.15 && kept.length < list.length * 0.35, `оставлено ${kept.length} из ${list.length}`);
    const index = FP.indexSong(fp);
    const x = kept[0];
    assert.ok(index.get(x.h).includes(x.t));
});

test('песня узнаётся в середине серии, и начало находится точно', () => {
    const op = song(3, 90);
    const ep = episode(4, 240, [{ pcm: op, at: 73 }]);
    const hits = live(ep, [prepared('OP1', op)]);
    assert.strictEqual(hits.length, 1);
    assert.ok(Math.abs(hits[0].start - 73) < 0.3, `начало ${hits[0].start}`);
    assert.ok(hits[0].at - 73 < 30, `узнано через ${hits[0].at - 73} с`);
});

test('время считается по шкале видео: запись может начаться не с нуля', () => {
    const op = song(5, 60);
    const ep = episode(6, 120, [{ pcm: op, at: 20 }]);
    const hits = live(ep, [prepared('OP1', op)], 1200);
    assert.ok(Math.abs(hits[0].start - 1220) < 0.3, `начало ${hits[0].start}`);
});

test('тихая песня тоже узнаётся: громкость не важна', () => {
    const op = song(7, 90);
    const ep = episode(8, 180, [{ pcm: op, at: 30, gain: 0.3 }]);
    const hits = live(ep, [prepared('OP1', op)]);
    assert.strictEqual(hits.length, 1);
});

test('чужая песня не срабатывает', () => {
    const ep = episode(9, 240, [{ pcm: song(10, 90), at: 40 }]);
    const hits = live(ep, [prepared('other', song(11, 90))]);
    assert.strictEqual(hits.length, 0);
});

test('песня из диапазона серий AnimeThemes', () => {
    assert.strictEqual(songInEpisode('1-5, 7, 9-10', 7), true);
    assert.strictEqual(songInEpisode('1-5, 7, 9-10', 6), false);
    assert.strictEqual(songInEpisode('', 3), false);
    assert.strictEqual(songInEpisode('1-12', ''), false);
});

const sampleSong = { len: 90 };
const mark = { start: 100, end: 190 };

test('метка плеера важнее всего для своей части', () => {
    const t = chooseTimings({ native: { start: 50, end: 140 }, hit: { start: 100, song: sampleSong }, mark, hasSong: true, listening: true, currentTime: 0 });
    assert.deepStrictEqual(t, { start: 50, end: 140, source: 'kodik' });
});

test('узнанная песня важнее съехавшей метки AniSkip, конец на секунду раньше образца', () => {
    const t = chooseTimings({ hit: { start: 196.9, song: sampleSong }, mark: { start: 173, end: 263 }, hasSong: true, listening: true, currentTime: 200 });
    assert.strictEqual(t.source, 'audio');
    assert.strictEqual(t.start, 196.9);
    assert.ok(Math.abs(t.end - 285.9) < 0.01);
});

test('метка начинается там же: её конец точнее, песня в серии бывает короче образца', () => {
    const t = chooseTimings({ hit: { start: 47, song: { len: 92 } }, mark: { start: 47, end: 121 }, hasSong: true, listening: true, currentTime: 60 });
    assert.strictEqual(t.end, 121);
    assert.strictEqual(t.source, 'audio+aniskip');
});

test('образец есть, песня ещё не узнана: метку AniSkip не применяем', () => {
    const t = chooseTimings({ mark, hasSong: true, listening: true, currentTime: 110 });
    assert.deepStrictEqual(t, { start: 0, end: 0 });
});

test('песню так и не узнали: метка только кнопкой, без автопрыжка', () => {
    const t = chooseTimings({ mark, hasSong: true, listening: true, currentTime: 135 });
    assert.strictEqual(t.manual, true);
    assert.strictEqual(t.end, 190);
});

test('образца нет или слушать нельзя: метка AniSkip работает как раньше', () => {
    assert.strictEqual(chooseTimings({ mark, hasSong: false, listening: false, currentTime: 0 }).manual, undefined);
    assert.strictEqual(chooseTimings({ mark, hasSong: true, listening: false, currentTime: 0 }).source, 'aniskip');
    assert.deepStrictEqual(chooseTimings({ mark: { start: 0, end: 0 }, hasSong: false, listening: false, currentTime: 0 }), { start: 0, end: 0 });
});

test('общая база важнее поиска, но метка плеера важнее базы', () => {
    const shared = { start: 60, end: 150 };
    assert.strictEqual(chooseTimings({ shared, hit: { start: 100, song: sampleSong }, mark, hasSong: true, listening: true, currentTime: 0 }).source, 'shared');
    assert.strictEqual(chooseTimings({ native: { start: 50, end: 140 }, shared, hasSong: true, listening: false, currentTime: 0 }).source, 'kodik');
});
