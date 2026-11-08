// Сравнение серий одного тайтла: настоящий расчёт отпечатков на созданном звуке, разные сдвиги и обманные случаи
const test = require('node:test');
const assert = require('node:assert/strict');
const FP = require('../modules/audio/fingerprint.js');
const { packPrint, unpackPrint, findRuns, pickRun, createComparer } = require('../modules/audio/repeat-finder.js');
const { loadInContext } = require('./helpers');

require('../modules/audio/audio-skip.js');
const { chooseTimings } = globalThis.AgAudioSkip;

const SR = FP.SAMPLE_RATE;

function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

// «Песня» и «речь»: последовательности случайных нот. У каждой серии своя речь, у песни общие ноты
function tones(seed, seconds, noteSec = 0.18) {
    const r = rng(seed);
    const out = new Float32Array(Math.floor(seconds * SR));
    const noteLen = Math.floor(SR * noteSec);
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

function episodeAudio(seed, seconds, inserts = []) {
    const r = rng(seed);
    const speech = tones(seed + 1000, seconds, 0.3);
    const out = new Float32Array(seconds * SR);
    for (let i = 0; i < out.length; i++) out[i] = speech[i] * 0.5 + (r() - 0.5) * 0.04;
    for (const { pcm, at, gain = 1 } of inserts) {
        const from = Math.floor(at * SR);
        for (let i = 0; i < pcm.length && from + i < out.length; i++) out[from + i] = out[from + i] * 0.05 + pcm[i] * gain;
    }
    return out;
}

function hashesOf(pcm, base = 0) {
    return FP.hashes(pcm).map(x => ({ h: x.h, sec: base + x.t * FP.FRAME_SEC }));
}

const printOf = (pcm, base = 0) => unpackPrint(packPrint(hashesOf(pcm, base)));

const OPENING = tones(77, 90);
const close = (actual, expected, within, name) => assert.ok(Math.abs(actual - expected) <= within, `${name}: ${actual} вместо ${expected}`);

test('опенинг находится, даже если в сериях он начинается в разное время', () => {
    const one = episodeAudio(1, 300, [{ pcm: OPENING, at: 20 }]);
    const two = episodeAudio(2, 300, [{ pcm: OPENING, at: 150 }]);
    const runs = findRuns(hashesOf(two), printOf(one));
    assert.ok(runs.length >= 1);
    const best = pickRun('op', runs);
    close(best.start, 150, 2, 'начало');
    close(best.end, 240, 3, 'конец');
    assert.equal(best.manual, false);
});

test('время считается в самой серии, а не от начала участка', () => {
    const one = episodeAudio(3, 300, [{ pcm: OPENING, at: 10 }]);
    const two = episodeAudio(4, 300, [{ pcm: OPENING, at: 60 }]);
    const best = pickRun('ed', findRuns(hashesOf(two, 1200), printOf(one, 1100)));
    close(best.start, 1260, 2, 'начало');
    close(best.end, 1350, 3, 'конец');
});

test('разная озвучка поверх одной музыки не мешает', () => {
    const one = episodeAudio(5, 300, [{ pcm: OPENING, at: 0, gain: 0.6 }]);
    const two = episodeAudio(6, 300, [{ pcm: OPENING, at: 0, gain: 1 }]);
    const best = pickRun('op', findRuns(hashesOf(two), printOf(one)));
    close(best.start, 0, 2, 'начало');
    close(best.end, 90, 3, 'конец');
});

test('разные серии без общего куска: ничего не находится', () => {
    assert.deepEqual(findRuns(hashesOf(episodeAudio(7, 300)), printOf(episodeAudio(8, 300))), []);
});

test('короткая общая заставка песней не считается', () => {
    const jingle = tones(99, 15);
    const runs = findRuns(hashesOf(episodeAudio(9, 200, [{ pcm: jingle, at: 40 }])), printOf(episodeAudio(10, 200, [{ pcm: jingle, at: 70 }])));
    assert.deepEqual(runs, []);
});

test('длинный повтор куска серии песней не считается', () => {
    const scene = tones(100, 280);
    const runs = findRuns(hashesOf(episodeAudio(11, 300, [{ pcm: scene, at: 5 }])), printOf(episodeAudio(12, 300, [{ pcm: scene, at: 5 }])));
    assert.deepEqual(runs, []);
});

test('пересказ прошлой серии рядом с опенингом: выбирается кусок длины песни', () => {
    const recap = tones(101, 55);
    const one = episodeAudio(13, 300, [{ pcm: recap, at: 5 }, { pcm: OPENING, at: 100 }]);
    const two = episodeAudio(14, 300, [{ pcm: recap, at: 10 }, { pcm: OPENING, at: 80 }]);
    const best = pickRun('op', findRuns(hashesOf(two), printOf(one)));
    close(best.start, 80, 2, 'начало');
    assert.equal(best.manual, false);
});

test('кусок необычной длины: только кнопка, а не автопрыжок', () => {
    const recap = tones(102, 60);
    const best = pickRun('op', findRuns(hashesOf(episodeAudio(15, 200, [{ pcm: recap, at: 10 }])), printOf(episodeAudio(16, 200, [{ pcm: recap, at: 30 }]))));
    assert.ok(best);
    assert.equal(best.manual, true);
});

test('эндинг обычной длины идёт автопрыжком, у него длина шире, чем у опенинга', () => {
    assert.equal(pickRun('ed', [{ start: 1300, end: 1420, votes: 500 }]).manual, false);
    assert.equal(pickRun('op', [{ start: 0, end: 120, votes: 500 }]).manual, true);
    assert.equal(pickRun('op', []), null);
});

test('отпечаток для хранения компактный и после распаковки работает так же', () => {
    const pcm = episodeAudio(17, 300, [{ pcm: OPENING, at: 20 }]);
    const list = hashesOf(pcm, 500);
    const packed = packPrint(list);
    const size = Buffer.byteLength(JSON.stringify(packed));
    assert.ok(size < 400 * 1024, `размер ${size}`);
    assert.ok(Math.abs(packed.base - 500) < 2);
    assert.equal(typeof packed.fp, 'string');
    const best = pickRun('op', findRuns(hashesOf(episodeAudio(18, 300, [{ pcm: OPENING, at: 40 }]), 500), unpackPrint(packed)));
    close(best.start, 540, 2, 'начало');
});

test('сравнение занимает доли секунды: оно идёт на устройстве зрителя', () => {
    const current = hashesOf(episodeAudio(19, 300, [{ pcm: OPENING, at: 20 }]));
    const other = printOf(episodeAudio(20, 300, [{ pcm: OPENING, at: 40 }]));
    const started = Date.now();
    findRuns(current, other);
    assert.ok(Date.now() - started < 500, `${Date.now() - started} мс`);
});

// ---------- Порции анализа заранее ----------

async function feed(comparer, part, list, size = 3000) {
    for (let i = 0; i < list.length; i += size) await comparer.add(part, list.slice(i, i + size));
}

test('песня находится по порциям, и не раньше, чем закончилась', async () => {
    const other = packPrint(hashesOf(episodeAudio(21, 300, [{ pcm: OPENING, at: 20 }])));
    const list = hashesOf(episodeAudio(22, 300, [{ pcm: OPENING, at: 50 }]));
    const found = [];
    const comparer = createComparer({ loadOthers: async () => [other], onFound: (part, run) => found.push({ part, run, heard: lastHeard }) });
    let lastHeard = 0;
    for (let i = 0; i < list.length && !found.length; i += 2000) {
        const chunk = list.slice(i, i + 2000);
        lastHeard = chunk[chunk.length - 1].sec;
        await comparer.add('op', chunk);
    }
    assert.equal(found.length, 1);
    assert.equal(found[0].part, 'op');
    close(found[0].run.start, 50, 2, 'начало');
    close(found[0].run.end, 140, 3, 'конец');
    assert.ok(found[0].heard >= found[0].run.end, 'кусок не обрезан порцией');
});

test('первая серия тайтла: сравнивать не с чем, отпечаток готов для следующей', async () => {
    const found = [];
    const comparer = createComparer({ loadOthers: async () => [], onFound: (part, run) => found.push(run) });
    await feed(comparer, 'op', hashesOf(episodeAudio(23, 200, [{ pcm: OPENING, at: 20 }])));
    await comparer.add('op', [], true);
    assert.equal(found.length, 0);
    assert.equal(typeof comparer.print('op').fp, 'string');
});

test('песня найдётся только один раз, сбой загрузки не мешает работе', async () => {
    const other = packPrint(hashesOf(episodeAudio(24, 200, [{ pcm: OPENING, at: 20 }])));
    const found = [];
    const comparer = createComparer({ loadOthers: async () => [other], onFound: (part, run) => found.push(run) });
    await feed(comparer, 'op', hashesOf(episodeAudio(25, 200, [{ pcm: OPENING, at: 10 }])));
    await comparer.add('op', [], true);
    assert.equal(found.length, 1);
    const failing = createComparer({ loadOthers: async () => { throw new Error('нет'); }, onFound: () => found.push('лишнее') });
    await failing.add('ed', [{ h: 1, sec: 1 }], true);
    assert.equal(found.length, 1);
});

test('слишком мало звука: отпечаток не запоминается', () => {
    const comparer = createComparer({ loadOthers: async () => [], onFound() {} });
    assert.equal(comparer.print('op'), null);
});

// ---------- Выбор времени ----------

test('повтор между сериями: после узнанной песни', () => {
    const repeat = { start: 90, end: 180, manual: false };
    assert.equal(chooseTimings({ repeat }).source, 'repeat');
    assert.equal(chooseTimings({ repeat }).manual, undefined);
    assert.equal(chooseTimings({ repeat: { ...repeat, manual: true } }).manual, true);
    assert.equal(chooseTimings({ repeat, native: { start: 1, end: 90 } }).source, 'kodik');
    assert.equal(chooseTimings({ repeat, site: { start: 3, end: 92 } }).source, 'site');
    assert.match(chooseTimings({ repeat, hit: { start: 4, song: { len: 90 } } }).source, /^audio/);
});

test('повтор берёт свой конец, метка AniSkip его не меняет', () => {
    const repeat = { start: 81, end: 166, manual: false };
    assert.deepEqual(chooseTimings({ repeat, mark: { start: 81.7, end: 171.7 } }), { start: 81, end: 166, source: 'repeat' });
    assert.equal(chooseTimings({ repeat: { ...repeat, manual: true }, mark: { start: 81.7, end: 171.7 } }).manual, true);
});

// ---------- Хранение ----------

function fakeBackground() {
    const store = new Map();
    const cache = {
        match: async (key) => { const v = store.get(String(key)); return v === undefined ? undefined : new Response(v); },
        put: async (key, res) => { store.set(String(key), await res.text()); },
        delete: async (key) => store.delete(String(key)),
        keys: async () => [...store.keys()].map(url => ({ url }))
    };
    const ctx = loadInContext(['modules/bg-audio.js'], {
        URLSearchParams, Response, AbortSignal, encodeURIComponent,
        caches: { open: async () => cache },
        chrome: { alarms: { get: async () => null, create: async () => {}, onAlarm: { addListener() {} } } }
    });
    return { ctx, store };
}
const print = (fp) => ({ base: 5, fp });

test('фон отдаёт отпечатки других серий, свои не отдаёт', async () => {
    const { ctx } = fakeBackground();
    await ctx.saveEpisodePrint({ title: 21, part: 'op', episode: '1', print: print('A') });
    await ctx.saveEpisodePrint({ title: 21, part: 'op', episode: '2', print: print('B') });
    await ctx.saveEpisodePrint({ title: 21, part: 'ed', episode: '1', print: print('E') });
    await ctx.saveEpisodePrint({ title: 22, part: 'op', episode: '1', print: print('Z') });
    const got = await ctx.getEpisodePrints({ title: 21, part: 'op', episode: '2' });
    assert.deepEqual(Array.from(got, p => p.fp), ['A']);
});

test('на тайтл хранится несколько последних серий', async () => {
    const { ctx, store } = fakeBackground();
    for (let ep = 1; ep <= 5; ep++) {
        await ctx.saveEpisodePrint({ title: 21, part: 'op', episode: String(ep), print: print(`P${ep}`) });
        await new Promise(r => setTimeout(r, 3));
    }
    assert.equal(store.size, 3);
    const got = await ctx.getEpisodePrints({ title: 21, part: 'op', episode: '9' });
    assert.deepEqual(Array.from(got, p => p.fp), ['P5', 'P4', 'P3']);
});

test('странные данные не сохраняются и не ломают чтение', async () => {
    const { ctx, store } = fakeBackground();
    await ctx.saveEpisodePrint({ title: 'a/b', part: 'op', episode: '1', print: print('A') });
    await ctx.saveEpisodePrint({ title: 21, part: 'xx', episode: '1', print: print('A') });
    await ctx.saveEpisodePrint({ title: 21, part: 'op', episode: '../1', print: print('A') });
    await ctx.saveEpisodePrint({ title: 21, part: 'op', episode: '1', print: { base: 1, fp: 5 } });
    assert.equal(store.size, 0);
    assert.equal((await ctx.getEpisodePrints({ title: 'x', part: 'op', episode: '1' })).length, 0);
});

test('опенинг, найденный чуть короче из-за тихих краёв, всё равно идёт автопрыжком', () => {
    const best = pickRun('op', [{ start: 81, end: 165, votes: 300 }]);
    assert.equal(best.manual, false);
    assert.equal(best.end, 166, 'конец с поправкой на последнее совпадение');
    assert.equal(pickRun('op', [{ start: 0, end: 70, votes: 300 }]).manual, true);
});
