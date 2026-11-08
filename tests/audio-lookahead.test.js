// Анализ заранее: разбор манифестов настоящих плееров и звук из контейнера TS
const { test } = require('node:test');
const assert = require('node:assert');
const ahead = require('../modules/audio/lookahead.js');

const KODIK_MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXT-X-VERSION:3
#EXTINF:6.000,
./360.mp4:hls:seg-1-v1-a1.ts
#EXTINF:6.000,
./360.mp4:hls:seg-2-v1-a1.ts
#EXTINF:3.500,
./360.mp4:hls:seg-3-v1-a1.ts
#EXT-X-ENDLIST`;

const ALLOHA_MEDIA = `#EXTM3U
#EXT-X-MAP:URI="init-c1-f1-v1-a1.mp4"
#EXTINF:6.000,
seg-1-f1-v1-a1.m4s
#EXTINF:6.000,
seg-2-f1-v1-a1.m4s`;

const AKSOR_MPD = `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period>
<AdaptationSet contentType="video"><Representation id="0" bandwidth="1253647" codecs="avc1.4d4028"/><SegmentTemplate timescale="12800" initialization="init-stream$RepresentationID$.m4s" media="chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1"><SegmentTimeline><S t="0" d="64000" r="9"/></SegmentTimeline></SegmentTemplate></AdaptationSet>
<AdaptationSet contentType="audio"><Representation id="1" bandwidth="161783" codecs="mp4a.40.2"/><SegmentTemplate timescale="48000" initialization="init-stream$RepresentationID$.m4s" media="chunk-stream$RepresentationID$-$Number%05d$.m4s" startNumber="1">
<SegmentTimeline><S t="0" d="719872"/><S d="720000" r="1"/></SegmentTimeline></SegmentTemplate></AdaptationSet></Period></MPD>`;

test('адрес манифеста узнаётся, сегменты и прочие файлы нет', () => {
    assert.ok(ahead.isManifestUrl('https://cdn/useruploads/x:1/360.mp4:hls:manifest.m3u8'));
    assert.ok(ahead.isManifestUrl('https://cdn/a/1080.mpd'));
    assert.ok(ahead.isManifestUrl('https://cdn/index.m3u8?x=1'));
    assert.ok(!ahead.isManifestUrl('https://cdn/seg-1.ts'));
    assert.ok(!ahead.isManifestUrl('https://cdn/chunk.m4s'));
});

test('из вариантов качества берётся самый лёгкий', () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:RESOLUTION=1920x1080,BANDWIDTH=1986000
https://s/1080/index.m3u8
#EXT-X-STREAM-INF:RESOLUTION=640x360,BANDWIDTH=400000
https://s/360/index.m3u8
#EXT-X-STREAM-INF:RESOLUTION=1280x720,BANDWIDTH=1096000
720/index.m3u8`;
    assert.strictEqual(ahead.pickLightest(master, 'https://s/index.m3u8'), 'https://s/360/index.m3u8');
});

test('плейлист Kodik: адреса с двоеточием и время каждого куска', () => {
    const base = 'https://cdn/useruploads/u/hash:1/360.mp4:hls:manifest.m3u8';
    const m = ahead.parseMedia(KODIK_MEDIA, base);
    assert.strictEqual(m.segments.length, 3);
    assert.strictEqual(m.segments[0].url, 'https://cdn/useruploads/u/hash:1/360.mp4:hls:seg-1-v1-a1.ts');
    assert.strictEqual(m.segments[2].at, 12);
    assert.strictEqual(m.total, 15.5);
    assert.strictEqual(m.init, null);
});

test('плейлист Alloha: начальный сегмент и адреса только со звуком', () => {
    const m = ahead.parseMedia(ALLOHA_MEDIA, 'https://cdn/0/x/index-f1-v1-a1.m3u8');
    assert.strictEqual(m.init, 'https://cdn/0/x/init-c1-f1-v1-a1.mp4');
    assert.strictEqual(ahead.audioOnlyUrl(m.segments[0].url), 'https://cdn/0/x/seg-1-f1-a1.m4s');
    assert.strictEqual(ahead.audioOnlyUrl(m.init), 'https://cdn/0/x/init-c1-f1-a1.mp4');
    // Kodik только со звуком не отдаёт: такой адрес не строим
    assert.strictEqual(ahead.audioOnlyUrl('https://cdn/360.mp4:hls:seg-1-v1-a1.ts'), null);
});

test('манифест Aksor: берётся звук, а не видео', () => {
    const d = ahead.parseDash(AKSOR_MPD, 'https://cdn/a/1080.mpd');
    assert.strictEqual(d.init, 'https://cdn/a/init-stream1.m4s');
    assert.strictEqual(d.segments.length, 3);
    assert.strictEqual(d.segments[1].url, 'https://cdn/a/chunk-stream1-00002.m4s');
    assert.ok(Math.abs(d.segments[1].at - 14.997) < 0.01);
    assert.ok(Math.abs(d.total - 44.997) < 0.01);
});

test('манифест AniBoom: шаблон внутри дорожки', () => {
    const xml = `<MPD><Period><AdaptationSet contentType="video"><Representation id="0" bandwidth="400000"><SegmentTemplate timescale="24000" initialization="x_init_$RepresentationID$.m4s" media="x_chunk_$RepresentationID$_$Number%05d$.m4s" startNumber="1"><SegmentTimeline><S t="0" d="96000"/></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet>
<AdaptationSet contentType="audio"><Representation id="1" bandwidth="128000"><SegmentTemplate timescale="48000" initialization="x_init_$RepresentationID$.m4s" media="x_chunk_$RepresentationID$_$Number%05d$.m4s" startNumber="1"><SegmentTimeline><S t="0" d="192000"/><S d="96000" r="1"/></SegmentTimeline></SegmentTemplate></Representation></AdaptationSet></Period></MPD>`;
    const d = ahead.parseDash(xml, 'https://cdn/a.mpd');
    assert.strictEqual(d.init, 'https://cdn/x_init_1.m4s');
    assert.strictEqual(d.segments[2].url, 'https://cdn/x_chunk_1_00003.m4s');
    assert.strictEqual(d.total, 8);
});

test('манифест CVH: куски в оглавлении файла, дорожка не самая слабая', () => {
    const rep = (id, bw, type) => `<Representation audioSamplingRate="48000" bandwidth="${bw}" codecs="mp4a.40.2" id="${id}"><BaseURL>?expires=1&amp;type=${type}&amp;ct=12</BaseURL><SegmentBase indexRange="838-2093" indexRangeExact="true"><Initialization range="0-837"/></SegmentBase></Representation>`;
    const xml = `<MPD><Period><AdaptationSet id="1"><Representation bandwidth="84620" codecs="avc1.4D400C" id="1" mimeType="video/mp4"><BaseURL>?type=9</BaseURL><SegmentBase indexRange="1-2"><Initialization range="0-0"/></SegmentBase></Representation></AdaptationSet><AdaptationSet id="2" mimeType="audio/mp4">${rep(7, 36163, 4)}${rep(8, 52547, 0)}${rep(9, 96000, 3)}${rep(10, 192000, 5)}</AdaptationSet></Period></MPD>`;
    const d = ahead.parseDash(xml, 'https://ok6-14.vkuser.net/?ch=1&type=1');
    assert.strictEqual(d.init, 'https://ok6-14.vkuser.net/?expires=1&type=3&ct=12');
    assert.strictEqual(d.initRange, '0-837');
    assert.deepStrictEqual(d.index, { url: d.init, range: '838-2093', end: 2093 });
    assert.ok(ahead.isManifestUrl('https://ok6-14.vkuser.net/?expires=1&ch=-16&type=1'));
    assert.ok(!ahead.isManifestUrl('https://ok6-14.vkuser.net/?expires=1&type=3&bytes=0-2093'));
});

test('оглавление sidx: куски и их байты', () => {
    const b = new ArrayBuffer(32 + 24);
    const v = new DataView(b);
    v.setUint32(0, 56);
    v.setUint32(4, 0x73696478);
    v.setUint32(16, 1000);
    v.setUint32(24, 10);
    v.setUint16(30, 2);
    v.setUint32(32, 500);
    v.setUint32(36, 4000);
    v.setUint32(44, 700);
    v.setUint32(48, 2000);
    const segs = ahead.parseSidx(b, 'u', 99);
    assert.deepStrictEqual(segs, [
        { url: 'u', range: '110-609', at: 0, dur: 4 },
        { url: 'u', range: '610-1309', at: 4, dur: 2 }
    ]);
    assert.deepStrictEqual(ahead.parseSidx(new ArrayBuffer(8), 'u', 0), []);
});

test('Kodik: лёгкое качество того же плейлиста', () => {
    assert.strictEqual(ahead.kodikLightUrl('https://c/x:1/720.mp4:hls:manifest.m3u8'), 'https://c/x:1/360.mp4:hls:manifest.m3u8');
    assert.strictEqual(ahead.kodikLightUrl('https://c/index.m3u8'), null);
});

test('манифест без звуковой дорожки не ломает разбор', () => {
    assert.strictEqual(ahead.parseDash('<MPD><AdaptationSet contentType="video"><Representation id="0" bandwidth="1"/></AdaptationSet></MPD>', 'https://c/a.mpd'), null);
});

test('порции: только нужный участок, не длиннее минуты', () => {
    const segments = Array.from({ length: 50 }, (_, i) => ({ url: `s${i}`, at: i * 6, dur: 6 }));
    const batches = ahead.batchesFor(segments, 10, 130);
    assert.strictEqual(batches[0].segments[0].url, 's1');
    assert.ok(batches.every(b => b.segments.length <= 10));
    const all = batches.flatMap(b => b.segments);
    assert.strictEqual(all[all.length - 1].url, 's21');
});

// Пакет TS: заголовок, полезная часть и заполнение
function packet(pid, start, payload) {
    const p = new Uint8Array(188).fill(0xff);
    p[0] = 0x47;
    p[1] = (start ? 0x40 : 0) | (pid >> 8);
    p[2] = pid & 0xff;
    const room = 184 - payload.length;
    if (room > 0) {
        p[3] = 0x30;
        p[4] = room - 1;
        if (room > 1) p[5] = 0;
    } else {
        p[3] = 0x10;
    }
    p.set(payload, 4 + Math.max(0, room));
    return p;
}

function tsSample() {
    const pat = [0, 0, 0xb0, 13, 0, 1, 0xc1, 0, 0, 0, 1, 0xe1, 0x00, 0, 0, 0, 0];
    const pmt = [0, 2, 0xb0, 23, 0, 1, 0xc1, 0, 0, 0xe1, 0x01, 0xf0, 0, 0x1b, 0xe1, 0x01, 0xf0, 0, 0x0f, 0xe1, 0x02, 0xf0, 0, 0, 0, 0, 0];
    const pes = [0, 0, 1, 0xc0, 0, 0, 0x80, 0x80, 2, 9, 9];
    const parts = [
        packet(0, true, pat),
        packet(0x100, true, pmt),
        packet(0x101, true, [1, 2, 3]),
        packet(0x102, true, [...pes, 0xff, 0xf1, 0x50]),
        packet(0x101, false, [4, 5]),
        packet(0x102, false, [0x80, 0x01])
    ];
    const out = new Uint8Array(parts.length * 188);
    parts.forEach((p, i) => out.set(p, i * 188));
    return out;
}

test('из TS вынимается только звук, без видео и служебных заголовков', () => {
    const ts = tsSample();
    assert.ok(ahead.isTs(ts));
    assert.deepStrictEqual([...ahead.demuxTs(ts)], [0xff, 0xf1, 0x50, 0x80, 0x01]);
    assert.ok(!ahead.isTs(new Uint8Array([0, 0, 0, 0x18])));
});

test('опенинг ищется и после первых 5 минут: впереди просмотра, до середины серии', () => {
    // Магическая битва, 2 серия: опенинг на 345 с, первых 5 минут не хватало
    assert.deepEqual(ahead.opPlan(1435), { head: 300, end: 717.5 });
    // Короткая серия: заранее только треть, дальше впереди просмотра
    assert.deepEqual(ahead.opPlan(600), { head: 200, end: 300 });
});

test('поиск впереди просмотра: не дальше двух минут, просмотренное не качается', () => {
    assert.equal(ahead.followStep(300, 200), 'go');
    assert.equal(ahead.followStep(330, 200), 'wait');
    assert.equal(ahead.followStep(400, 290), 'go');
    // Зритель перемотал дальше: этот кусок уже звучал, его слушает обычное прослушивание
    assert.equal(ahead.followStep(300, 500), 'skip');
    assert.equal(ahead.followStep(300, 330), 'go');
});
