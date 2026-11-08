// modules/audio/lookahead.js
// Анализ заранее: звук ещё не показанной части серии берётся по тем же адресам, что запрашивает сам плеер, и сверяется с базой песен.
// Песня находится до того, как зазвучит, поэтому пропуск срабатывает сразу, а не через несколько секунд после её начала.
// Качаем только то, что нужно: самое лёгкое качество, звук отдельно там, где сервер это умеет, и останавливаемся, как только песня найдена.
// Звук анализируется на устройстве, не сохраняется и никуда не отправляется.

(function (root) {
    'use strict';

    // Опенинг ищем в начале серии, эндинг в конце. Первые минуты качаем сразу
    const HEAD_SEC = 300;
    // Не нашёлся в начале: ищем дальше, держась впереди просмотра, до середины серии. Опенинг бывает и на 6-й минуте
    const FOLLOW_AHEAD_SEC = 120;
    const FOLLOW_WAIT_MS = 2000;
    const TAIL_SEC = 300;
    // Эндинг ищем не сразу: зритель может и не досмотреть серию, а звук скачивался бы зря
    const TAIL_START_BEFORE_END_SEC = 420;
    const BATCH_SEC = 60;
    const BATCH_PAUSE_MS = 300;
    const FETCH_TIMEOUT_MS = 20000;
    const PROBE_TIMEOUT_MS = 4000;
    // Больше на одну серию не качаем, что бы ни случилось
    const MAX_BYTES = 70 * 1024 * 1024;
    // Поиск опенинга впереди просмотра останавливается раньше: остаток нужен для эндинга
    const FOLLOW_MAX_BYTES = 45 * 1024 * 1024;
    // Длина плейлиста должна совпасть с серией: в кадре бывают плейлисты других озвучек и рекламы
    const DURATION_TOLERANCE_SEC = 5;
    const FIND_TRIES = 20;
    const FIND_STEP_MS = 1000;
    const HASH_SLICE_SEC = 5;
    const MIN_AUDIO_BANDWIDTH = 64000;
    const TS_PACKET = 188;
    const STREAM_AAC = 0x0f;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    /** Где искать опенинг: сразу до head, дальше впереди просмотра до end */
    function opPlan(duration) {
        return { head: Math.min(HEAD_SEC, duration / 3), end: duration / 2 };
    }

    /** Кусок за пределами первых минут: качать, ждать, пока зритель подойдёт ближе, или пропустить уже прозвучавший */
    function followStep(batchAt, now) {
        if (batchAt + BATCH_SEC <= now) return 'skip';
        return batchAt > now + FOLLOW_AHEAD_SEC ? 'wait' : 'go';
    }

    // ---------- Разбор манифестов ----------

    const isMaster = (text) => /#EXT-X-STREAM-INF/.test(text);
    // У CVH (серверы OK и VK: vkuser.net, с ноября 2026 и okcdn.ru) манифест без расширения, его выдаёт параметр ch
    const isManifestUrl = (url) => /\.m3u8(\?|$)|\.mpd(\?|$)|(vkuser\.net|okcdn\.ru)\/\?(.*&)?ch=/i.test(String(url).split('#')[0]);

    /** Самый лёгкий вариант качества: звук в нём тот же, а скачивать меньше */
    function pickLightest(master, baseUrl) {
        const lines = master.split('\n').map(s => s.trim());
        let best = null;
        lines.forEach((line, i) => {
            if (!line.startsWith('#EXT-X-STREAM-INF')) return;
            const bandwidth = Number((line.match(/BANDWIDTH=(\d+)/) || [])[1]) || Infinity;
            const uri = lines.slice(i + 1).find(l => l && !l.startsWith('#'));
            if (uri && (!best || bandwidth < best.bandwidth)) best = { bandwidth, url: new URL(uri, baseUrl).href };
        });
        return best ? best.url : null;
    }

    /** Плейлист серии: [{ url, at, dur }] и начальный сегмент для fMP4 */
    function parseMedia(text, baseUrl) {
        const segments = [];
        let init = null;
        let at = 0;
        let dur = 0;
        for (const raw of text.split('\n')) {
            const line = raw.trim();
            if (line.startsWith('#EXT-X-MAP')) {
                const uri = line.match(/URI="([^"]+)"/);
                if (uri) init = new URL(uri[1], baseUrl).href;
            } else if (line.startsWith('#EXTINF:')) {
                dur = parseFloat(line.slice(8));
            } else if (line && !line.startsWith('#')) {
                segments.push({ url: new URL(line, baseUrl).href, at, dur });
                at += dur;
            }
        }
        return { init, segments, total: at };
    }

    /** Адрес только со звуком: seg-4-f1-v1-a1.m4s → seg-4-f1-a1.m4s. Умеет не каждый сервер, поэтому сначала проверяем */
    const audioOnlyUrl = (url) => (/-f\d+-v\d+-a\d+\./.test(url) ? url.replace(/-v\d+-a(\d+)\./, '-a$1.') : null);

    const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];

    /** Самая лёгкая дорожка, на которой ещё различимы песни */
    function pickAudioRep(reps) {
        const rate = (r) => Number(attr(r, 'bandwidth')) || 0;
        const sorted = [...reps].sort((a, b) => rate(a) - rate(b));
        return sorted.find(r => rate(r) >= MIN_AUDIO_BANDWIDTH) || sorted[sorted.length - 1];
    }

    /** Звуковая дорожка из манифеста DASH: { init, segments, total } или null. При SegmentBase куски описаны в index внутри самого файла */
    function parseDash(xml, baseUrl) {
        const blocks = String(xml).match(/<AdaptationSet\b[\s\S]*?<\/AdaptationSet>/g) || [];
        const audio = blocks.find(b => /contentType="audio"|mimeType="audio\/|codecs="mp4a/.test(b));
        if (!audio) return null;
        const reps = audio.match(/<Representation\b[^>]*\/>|<Representation\b[\s\S]*?<\/Representation>/g) || [];
        if (!reps.length) return null;
        const rep = pickAudioRep(reps);

        const base = (rep.match(/<BaseURL>([^<]+)/) || [])[1];
        const segmentBase = rep.match(/<SegmentBase\b[^>]*indexRange="(\d+)-(\d+)"[\s\S]*?<Initialization\b[^>]*range="(\d+-\d+)"/);
        if (base && segmentBase) {
            const url = new URL(base.replace(/&amp;/g, '&'), baseUrl).href;
            return {
                init: url,
                initRange: segmentBase[3],
                index: { url, range: `${segmentBase[1]}-${segmentBase[2]}`, end: Number(segmentBase[2]) },
                segments: [],
                total: 0,
                audioOnly: true
            };
        }

        const findTemplate = (x) => (x.match(/<SegmentTemplate\b[^>]*\/>|<SegmentTemplate\b[\s\S]*?<\/SegmentTemplate>/) || [])[0];
        const tmpl = findTemplate(rep) || findTemplate(audio);
        if (!tmpl) return null;
        const head = tmpl.slice(0, tmpl.indexOf('>'));
        const timescale = Number(attr(head, 'timescale')) || 1;
        const first = Number(attr(head, 'startNumber') || 1);
        const id = attr(rep, 'id');
        const fill = (x, n) => x.replace(/\$RepresentationID\$/g, id)
            .replace(/\$Number(?:%0(\d+)d)?\$/g, (m, width) => (width ? String(n).padStart(Number(width), '0') : String(n)));
        const durs = [];
        for (const item of tmpl.match(/<S\b[^>]*>/g) || []) {
            const d = Number(attr(item, 'd')) / timescale;
            for (let i = 0; i <= (Number(attr(item, 'r')) || 0); i++) durs.push(d);
        }
        if (!durs.length) return null;
        const media = attr(head, 'media');
        const init = attr(head, 'initialization');
        if (!media || !init) return null;
        let at = 0;
        const segments = durs.map((dur, i) => {
            const item = { url: new URL(fill(media, first + i), baseUrl).href, at, dur };
            at += dur;
            return item;
        });
        return { init: new URL(fill(init, 0), baseUrl).href, segments, total: at, audioOnly: true };
    }

    /** Оглавление файла (sidx): где какой кусок лежит. indexEnd это последний байт самого оглавления */
    function parseSidx(buffer, url, indexEnd) {
        const view = new DataView(buffer);
        if (view.byteLength < 32 || view.getUint32(4) !== 0x73696478) return [];
        const version = view.getUint8(8);
        const timescale = view.getUint32(16);
        const wide = version === 0 ? 0 : 8;
        const firstOffset = version === 0 ? view.getUint32(24) : view.getUint32(32) * 2 ** 32 + view.getUint32(36);
        const count = view.getUint16(30 + wide);
        const segments = [];
        let at = 0;
        let offset = indexEnd + 1 + firstOffset;
        for (let i = 0; i < count; i++) {
            const pos = 32 + wide + i * 12;
            if (pos + 12 > view.byteLength) break;
            const size = view.getUint32(pos) & 0x7fffffff;
            const dur = view.getUint32(pos + 4) / timescale;
            segments.push({ url, range: `${offset}-${offset + size - 1}`, at, dur });
            at += dur;
            offset += size;
        }
        return segments;
    }

    /** Куски нужного участка серии, сгруппированные в порции */
    function batchesFor(segments, from, to) {
        const batches = [];
        let current = null;
        for (const seg of segments) {
            if (seg.at + seg.dur <= from || seg.at >= to) continue;
            if (!current || seg.at + seg.dur - current.at > BATCH_SEC) {
                current = { at: seg.at, segments: [] };
                batches.push(current);
            }
            current.segments.push(seg);
        }
        return batches;
    }

    // ---------- Звук из контейнера TS ----------

    /** Видео и звук в одном файле .ts: вынимаем поток AAC, его умеет декодировать браузер */
    function demuxTs(data) {
        const b = data instanceof Uint8Array ? data : new Uint8Array(data);
        let pmtPid = -1;
        let audioPid = -1;
        const parts = [];
        let size = 0;
        for (let i = 0; i + TS_PACKET <= b.length; i += TS_PACKET) {
            if (b[i] !== 0x47) continue;
            const pid = ((b[i + 1] & 0x1f) << 8) | b[i + 2];
            const start = (b[i + 1] & 0x40) !== 0;
            const adaptation = (b[i + 3] >> 4) & 3;
            if (adaptation === 2) continue;
            let p = i + 4;
            if (adaptation === 3) p += 1 + b[p];
            if (pid === 0 && start && pmtPid < 0) {
                p += 1 + b[p];
                pmtPid = ((b[p + 10] & 0x1f) << 8) | b[p + 11];
            } else if (pid === pmtPid && start && audioPid < 0) {
                p += 1 + b[p];
                const sectionEnd = p + 3 + (((b[p + 1] & 0xf) << 8) | b[p + 2]) - 4;
                let q = p + 12 + (((b[p + 10] & 0xf) << 8) | b[p + 11]);
                while (q < sectionEnd) {
                    if (b[q] === STREAM_AAC) audioPid = ((b[q + 1] & 0x1f) << 8) | b[q + 2];
                    q += 5 + (((b[q + 3] & 0xf) << 8) | b[q + 4]);
                }
            } else if (pid === audioPid) {
                if (start) p += 9 + b[p + 8];
                const piece = b.subarray(p, i + TS_PACKET);
                parts.push(piece);
                size += piece.length;
            }
        }
        const out = new Uint8Array(size);
        let off = 0;
        for (const piece of parts) {
            out.set(piece, off);
            off += piece.length;
        }
        return out;
    }

    const isTs = (bytes) => bytes.length > TS_PACKET && bytes[0] === 0x47 && bytes[TS_PACKET] === 0x47;

    // ---------- Звук из обычного файла MP4 (AnimeVost) ----------
    // Видео одним файлом без плейлиста. Звук в нём разбит на крошечные куски вперемешку с кадрами, а сервер не отдаёт
    // много диапазонов одним запросом без предварительного запроса CORS. Поэтому качаем участок подряд и вынимаем звук по оглавлению moov

    const isMp4Url = (url) => /\.mp4(\?|$)/i.test(String(url).split('#')[0]);
    // Повторы одного файла с разных зеркал и с номером запроса wsn: файл один и тот же
    const mp4Key = (url) => String(url).replace(/[?&]wsn=\d+/, '');
    const MP4_HEAD_BYTES = 64 * 1024;
    const MP4_MAX_MOOV = 16 * 1024 * 1024;
    const MP4_SEGMENT_SEC = 10;

    const fourcc = (view, p) => String.fromCharCode(view.getUint8(p), view.getUint8(p + 1), view.getUint8(p + 2), view.getUint8(p + 3));

    /** Блоки MP4 внутри [start, end): { type, at, size, start (данные), end } */
    function mp4Boxes(view, start, end) {
        const out = [];
        let p = start;
        while (p + 8 <= end) {
            let size = view.getUint32(p);
            let header = 8;
            if (size === 1) {
                if (p + 16 > end) break;
                size = view.getUint32(p + 8) * 2 ** 32 + view.getUint32(p + 12);
                header = 16;
            } else if (size === 0) {
                size = end - p;
            }
            if (size < header) break;
            out.push({ type: fourcc(view, p + 4), at: p, size, start: p + header, end: Math.min(p + size, end) });
            p += size;
        }
        return out;
    }
    const mp4Child = (view, box, type) => (box ? mp4Boxes(view, box.start, box.end).find(b => b.type === type) : null);

    /** Настройки AAC из esds: { aot, freq, chan } или null */
    function parseEsds(view, box) {
        let p = box.start + 4;
        const readLen = () => {
            let len = 0;
            for (let i = 0; i < 4; i++) {
                const b = view.getUint8(p++);
                len = (len << 7) | (b & 0x7f);
                if (!(b & 0x80)) break;
            }
            return len;
        };
        while (p + 2 <= box.end) {
            const tag = view.getUint8(p++);
            const len = readLen();
            if (tag === 0x03) {
                const flags = view.getUint8(p + 2);
                p += 3;
                if (flags & 0x80) p += 2;
                if (flags & 0x40) p += 1 + view.getUint8(p);
                if (flags & 0x20) p += 2;
            } else if (tag === 0x04) {
                p += 13;
            } else if (tag === 0x05) {
                if (len < 2) return null;
                const b0 = view.getUint8(p);
                const b1 = view.getUint8(p + 1);
                const aot = b0 >> 3;
                const freq = ((b0 & 7) << 1) | (b1 >> 7);
                const chan = (b1 >> 3) & 0xf;
                if (aot === 31 || freq === 15) return null;
                // HE-AAC описан ядром AAC LC: браузер сам достроит верхние частоты
                return { aot: aot === 5 || aot === 29 ? 2 : aot, freq, chan };
            } else {
                p += len;
            }
        }
        return null;
    }

    /**
     * Звуковая дорожка из блока moov: { segments, total, aac } или null.
     * Кусок сегмента: подряд идущие байты файла (range) и звуковые кадры в них (samples: [смещение от начала куска, размер])
     */
    function parseMp4Audio(buffer, url) {
        const view = new DataView(buffer);
        const moov = mp4Boxes(view, 0, view.byteLength).find(b => b.type === 'moov');
        if (!moov) return null;
        for (const trak of mp4Boxes(view, moov.start, moov.end).filter(b => b.type === 'trak')) {
            const mdia = mp4Child(view, trak, 'mdia');
            const hdlr = mp4Child(view, mdia, 'hdlr');
            if (!hdlr || fourcc(view, hdlr.start + 8) !== 'soun') continue;
            const mdhd = mp4Child(view, mdia, 'mdhd');
            const stbl = mp4Child(view, mp4Child(view, mdia, 'minf'), 'stbl');
            const stsd = mp4Child(view, stbl, 'stsd');
            if (!mdhd || !stbl || !stsd) return null;
            const timescale = view.getUint32(mdhd.start + (view.getUint8(mdhd.start) === 1 ? 20 : 12));
            const entry = mp4Boxes(view, stsd.start + 8, stsd.end)[0];
            if (!entry || entry.type !== 'mp4a' || !timescale) return null;
            const version = view.getUint16(entry.start + 8);
            const esds = mp4Boxes(view, entry.start + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0), entry.end).find(b => b.type === 'esds');
            const aac = esds ? parseEsds(view, esds) : null;
            if (!aac) return null;

            const stts = mp4Child(view, stbl, 'stts');
            const stsc = mp4Child(view, stbl, 'stsc');
            const stsz = mp4Child(view, stbl, 'stsz');
            const stco = mp4Child(view, stbl, 'stco');
            const co64 = mp4Child(view, stbl, 'co64');
            if (!stts || !stsc || !stsz || !(stco || co64)) return null;
            const count = view.getUint32(stsz.start + 8);
            const fixed = view.getUint32(stsz.start + 4);
            const sizeOf = (i) => (fixed || view.getUint32(stsz.start + 12 + i * 4));
            const chunks = view.getUint32((stco || co64).start + 4);
            const chunkOffset = (i) => (stco ? view.getUint32(stco.start + 8 + i * 4) : view.getUint32(co64.start + 8 + i * 8) * 2 ** 32 + view.getUint32(co64.start + 12 + i * 8));
            const runs = [];
            for (let i = 0, n = view.getUint32(stsc.start + 4); i < n; i++) runs.push({ first: view.getUint32(stsc.start + 8 + i * 12) - 1, per: view.getUint32(stsc.start + 12 + i * 12) });
            const deltas = [];
            for (let i = 0, n = view.getUint32(stts.start + 4); i < n; i++) deltas.push({ count: view.getUint32(stts.start + 8 + i * 8), delta: view.getUint32(stts.start + 12 + i * 8) });

            const segments = [];
            let seg = null;
            let sample = 0;
            let ticks = 0;
            let d = 0;
            let left = deltas.length ? deltas[0].count : 0;
            const close = () => {
                if (!seg) return;
                const base = seg.samples[0][0];
                seg.range = `${base}-${seg.last - 1}`;
                seg.samples = seg.samples.map(([off, size]) => [off - base, size]);
                seg.dur = ticks / timescale - seg.at;
                delete seg.last;
                segments.push(seg);
            };
            let run = 0;
            for (let c = 0; c < chunks && sample < count; c++) {
                while (run + 1 < runs.length && runs[run + 1].first <= c) run++;
                let off = chunkOffset(c);
                for (let k = 0; k < runs[run].per && sample < count; k++, sample++) {
                    const size = sizeOf(sample);
                    const at = ticks / timescale;
                    // Новый кусок каждые 10 с, а также если звук пошёл назад по файлу: тогда подряд их уже не скачать
                    if (!seg || at - seg.at >= MP4_SEGMENT_SEC || off < seg.last) {
                        close();
                        seg = { url, at, samples: [], last: off };
                    }
                    seg.samples.push([off, size]);
                    seg.last = Math.max(seg.last, off + size);
                    off += size;
                    while (left === 0 && d + 1 < deltas.length) left = deltas[++d].count;
                    ticks += deltas[d] ? deltas[d].delta : 0;
                    left--;
                }
            }
            close();
            if (!segments.length) return null;
            return { segments, total: ticks / timescale, aac, init: null, audioOnly: false };
        }
        return null;
    }

    /** Кусок файла строго по диапазону: сервер без поддержки диапазонов отдал бы весь файл, его не качаем */
    async function fetchRange(url, range) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const r = await fetch(url, { signal: controller.signal, headers: { Range: `bytes=${range}` } });
            if (r.status !== 206) {
                controller.abort();
                throw new Error(`статус ${r.status}`);
            }
            return await r.arrayBuffer();
        } finally {
            clearTimeout(timer);
        }
    }

    /** Звук файла MP4 по его оглавлению: moov бывает и в начале, и в конце файла, поэтому идём по заголовкам блоков */
    async function fetchMp4Stream(url) {
        const head = await fetchRange(url, `0-${MP4_HEAD_BYTES - 1}`);
        if (head.byteLength < 8 || fourcc(new DataView(head), 4) !== 'ftyp') return null;
        let pos = 0;
        for (let i = 0; i < 16; i++) {
            const header = new DataView(pos + 16 <= head.byteLength ? head.slice(pos, pos + 16) : await fetchRange(url, `${pos}-${pos + 15}`));
            if (header.byteLength < 8) return null;
            let size = header.getUint32(0);
            if (size === 1 && header.byteLength >= 16) size = header.getUint32(8) * 2 ** 32 + header.getUint32(12);
            if (size < 8) return null;
            if (fourcc(header, 4) === 'moov') {
                if (size > MP4_MAX_MOOV) return null;
                const moov = pos + size <= head.byteLength ? head.slice(pos, pos + size) : await fetchRange(url, `${pos}-${pos + size - 1}`);
                return parseMp4Audio(moov, url);
            }
            pos += size;
        }
        return null;
    }

    /** Кадры AAC из куска MP4 с заголовками ADTS: такой поток браузер декодирует без контейнера */
    function mp4ToAdts(buffers, segments, aac) {
        let size = 0;
        segments.forEach((seg) => seg.samples.forEach(([, len]) => { size += len + 7; }));
        const out = new Uint8Array(size);
        let p = 0;
        segments.forEach((seg, i) => {
            const bytes = new Uint8Array(buffers[i]);
            for (const [off, len] of seg.samples) {
                if (off + len > bytes.length) continue;
                const frame = len + 7;
                out[p] = 0xff;
                out[p + 1] = 0xf1;
                out[p + 2] = ((aac.aot - 1) << 6) | (aac.freq << 2) | (aac.chan >> 2);
                out[p + 3] = ((aac.chan & 3) << 6) | (frame >> 11);
                out[p + 4] = (frame >> 3) & 0xff;
                out[p + 5] = ((frame & 7) << 5) | 0x1f;
                out[p + 6] = 0xfc;
                out.set(bytes.subarray(off, off + len), p + 7);
                p += frame;
            }
        });
        return out.subarray(0, p);
    }

    function join(parts) {
        const out = new Uint8Array(parts.reduce((sum, p) => sum + p.byteLength, 0));
        let off = 0;
        for (const p of parts) {
            out.set(new Uint8Array(p), off);
            off += p.byteLength;
        }
        return out;
    }

    // ---------- Поиск потока этой серии ----------

    async function fetchWith(url, ms, type, range) {
        const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: range ? { Range: `bytes=${range}` } : undefined });
        if (!r.ok) throw new Error(`статус ${r.status}`);
        return type === 'text' ? r.text() : r.arrayBuffer();
    }

    /** Kodik: то же самое в 360p, сколько бы ни смотрел зритель */
    const kodikLightUrl = (url) => (/\/\d+\.mp4:hls:/.test(url) ? url.replace(/\/\d+\.mp4:hls:/, '/360.mp4:hls:') : null);

    /** Последние части пути: у ceramet в начале адреса разовый токен, а конец у одного качества всегда один */
    const pathTail = (url) => new URL(url).pathname.split('/').slice(-3).join('/');

    /** Плеер смотрит в высоком качестве: ищем тот же плейлист полегче, иначе зря скачаем много */
    async function lighterMedia(mediaUrl, entries) {
        const kodik = kodikLightUrl(mediaUrl);
        if (kodik) return kodik === mediaUrl ? null : kodik;
        const tail = pathTail(mediaUrl);
        for (const url of entries) {
            if (url === mediaUrl) continue;
            let text;
            try { text = await fetchWith(url, FETCH_TIMEOUT_MS, 'text'); } catch (e) { continue; }
            if (!isMaster(text)) continue;
            const has = text.split('\n').some(l => l.trim() && !l.startsWith('#') && pathTail(new URL(l.trim(), url).href) === tail);
            if (!has) continue;
            const lightest = pickLightest(text, url);
            return lightest && pathTail(lightest) !== tail ? lightest : null;
        }
        return null;
    }

    /** Поток этой серии среди запросов самого плеера: длина должна совпасть с длиной видео */
    async function findStream(duration, seen) {
        const all = performance.getEntriesByType('resource').map(e => e.name).reverse();
        const entries = all.filter(isManifestUrl);
        const fits = (stream) => stream && stream.segments.length && Math.abs(stream.total - duration) <= DURATION_TOLERANCE_SEC;
        for (const url of entries) {
            if (seen.has(url)) continue;
            seen.add(url);
            let text;
            try { text = await fetchWith(url, FETCH_TIMEOUT_MS, 'text'); } catch (e) { continue; }
            let stream = null;
            if (/<MPD\b/.test(text)) {
                stream = parseDash(text, url);
                if (stream && stream.index) {
                    try {
                        const sidx = await fetchWith(stream.index.url, FETCH_TIMEOUT_MS, 'buffer', stream.index.range);
                        stream.segments = parseSidx(sidx, stream.index.url, stream.index.end);
                        stream.total = stream.segments.reduce((sum, seg) => sum + seg.dur, 0);
                    } catch (e) { continue; }
                }
            } else if (/^#EXTM3U/.test(text.trim())) {
                let mediaUrl = url;
                let media = text;
                if (isMaster(text)) {
                    mediaUrl = pickLightest(text, url);
                    if (!mediaUrl) continue;
                    try { media = await fetchWith(mediaUrl, FETCH_TIMEOUT_MS, 'text'); } catch (e) { continue; }
                }
                stream = parseMedia(media, mediaUrl);
                if (fits(stream) && mediaUrl === url) {
                    try {
                        const lighter = await lighterMedia(url, entries);
                        const alt = lighter && parseMedia(await fetchWith(lighter, FETCH_TIMEOUT_MS, 'text'), lighter);
                        if (fits(alt)) stream = alt;
                    } catch (e) { /* остаётся качество самого плеера */ }
                }
            }
            if (fits(stream)) return stream;
        }
        // Плейлиста нет: плеер играет обычный файл MP4
        for (const url of all.filter(isMp4Url)) {
            const key = mp4Key(url);
            if (seen.has(key)) continue;
            seen.add(key);
            try {
                const stream = await fetchMp4Stream(url);
                if (fits(stream)) return stream;
            } catch (e) { /* другое зеркало того же файла */ }
        }
        return null;
    }

    /** Переводит поток на адреса только со звуком, если сервер их отдаёт */
    async function preferAudioOnly(stream) {
        const sample = stream.segments[Math.min(3, stream.segments.length - 1)];
        const probe = audioOnlyUrl(sample.url);
        if (!probe) return stream;
        try {
            await fetchWith(probe, PROBE_TIMEOUT_MS, 'buffer');
            return {
                ...stream,
                audioOnly: true,
                init: stream.init ? (audioOnlyUrl(stream.init) || stream.init) : null,
                segments: stream.segments.map(s => ({ ...s, url: audioOnlyUrl(s.url) || s.url }))
            };
        } catch (e) {
            return stream;
        }
    }

    // ---------- Сам анализ ----------

    /** Звук одной порции: { pcm, sampleRate } или null */
    async function decodeBatch(init, buffers, targetRate, mp4 = null) {
        let bytes = mp4 ? mp4ToAdts(buffers, mp4.segments, mp4.aac) : join(init ? [init, ...buffers] : buffers);
        if (!mp4 && isTs(bytes)) bytes = demuxTs(bytes);
        if (!bytes.length) return null;
        const decoded = await new OfflineAudioContext(1, 8, 44100).decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        const render = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
        const source = render.createBufferSource();
        source.buffer = decoded;
        source.connect(render.destination);
        source.start();
        return (await render.startRendering()).getChannelData(0);
    }

    /**
     * options: { video, fingerprint, songs, wanted(part), onFound(result), onState(state), onHashes(part, list, final) }.
     * start() ищет опенинг, tail() эндинг, stop() прекращает всё.
     */
    function create(options) {
        const FP = options.fingerprint;
        const video = options.video;
        const state = { status: 'ожидание', bytes: 0, audioOnly: false, ms: 0 };
        const seen = new Set();
        let stream = null;
        let streamPromise = null;
        let init = null;
        let stopped = false;
        let tailStarted = false;
        const report = (patch) => {
            Object.assign(state, patch);
            if (options.onState) options.onState(state);
        };

        const getStream = () => {
            if (!streamPromise) {
                streamPromise = (async () => {
                    for (let i = 0; i < FIND_TRIES && !stopped; i++) {
                        const found = await findStream(video.duration, seen);
                        if (found) {
                            const prepared = await preferAudioOnly(found);
                            state.audioOnly = !!prepared.audioOnly;
                            return prepared;
                        }
                        await sleep(FIND_STEP_MS);
                    }
                    return null;
                })();
            }
            return streamPromise;
        };

        // follow: с этого места качаем только впереди просмотра
        const scan = async (part, from, to, follow = Infinity) => {
            stream = stream || await getStream();
            if (!stream || stopped) return report({ status: stream ? 'остановлен' : 'поток не найден' });
            if (stream.init && !init) {
                init = await fetchWith(stream.init, FETCH_TIMEOUT_MS, 'buffer', stream.initRange);
                state.bytes += init.byteLength;
            }
            const matcher = FP.createMatcher(options.songs);
            const started = performance.now();
            for (const batch of batchesFor(stream.segments, from, to)) {
                if (stopped || !options.wanted(part)) break;
                if (state.bytes >= MAX_BYTES) return report({ status: 'лимит' });
                const ahead = batch.at >= follow;
                if (ahead) {
                    let step = followStep(batch.at, video.currentTime);
                    while (step === 'wait' && !stopped && options.wanted(part)) {
                        report({ status: `${part}: ждёт ${Math.round(batch.at)} с` });
                        await sleep(FOLLOW_WAIT_MS);
                        step = followStep(batch.at, video.currentTime);
                    }
                    if (stopped || !options.wanted(part)) break;
                    if (step === 'skip') continue;
                    if (state.bytes >= FOLLOW_MAX_BYTES) break;
                }
                report({ status: `${part}: ${Math.round(batch.at)} с` });
                const buffers = await Promise.all(batch.segments.map(s => fetchWith(s.url, FETCH_TIMEOUT_MS, 'buffer', s.range)));
                state.bytes += buffers.reduce((sum, b) => sum + b.byteLength, 0);
                if (stopped) break;
                const pcm = await decodeBatch(init, buffers, FP.SAMPLE_RATE, stream.aac ? { segments: batch.segments, aac: stream.aac } : null);
                if (!pcm) continue;
                const hits = [];
                const heard = [];
                const hasher = FP.createHasher((h, frame) => {
                    const sec = batch.at + frame * FP.FRAME_SEC;
                    const r = matcher.feed(h, sec);
                    if (r) hits.push(r);
                    // Сравнение серий работает по первым минутам, как раньше
                    if (options.onHashes && !ahead) heard.push({ h, sec });
                });
                const slice = HASH_SLICE_SEC * FP.SAMPLE_RATE;
                for (let i = 0; i < pcm.length && !stopped; i += slice) {
                    hasher.push(pcm.subarray(i, i + slice));
                    await sleep(0);
                }
                hasher.finish();
                hits.forEach(r => options.onFound(r));
                if (options.onHashes && !ahead) await options.onHashes(part, heard, false);
                state.ms += Math.round(performance.now() - started);
                await sleep(BATCH_PAUSE_MS);
            }
            if (options.onHashes) await options.onHashes(part, [], true);
            return report({ status: `${part}: готово` });
        };

        const guarded = (part, from, to) => scan(part, from, to).catch((e) => report({ status: `сбой: ${String(e.message || e).slice(0, 60)}` }));

        return {
            state,
            start() {
                const t = video.currentTime;
                const plan = opPlan(video.duration);
                // Без песен в базе искать дальше нечего: сравнение серий смотрит только первые минуты
                const end = options.songs && options.songs.length ? plan.end : plan.head;
                return t < end && options.wanted('op') ? guarded('op', t, end, plan.head) : Promise.resolve();
            },
            /** Вызывается при просмотре: эндинг ищем, когда зритель приблизился к концу */
            tail() {
                if (tailStarted || stopped || !options.wanted('ed')) return null;
                if (video.duration - video.currentTime > TAIL_START_BEFORE_END_SEC) return null;
                tailStarted = true;
                return guarded('ed', Math.max(video.currentTime, video.duration - TAIL_SEC), video.duration);
            },
            stop() { stopped = true; }
        };
    }

    const api = { create, opPlan, followStep, isManifestUrl, isMp4Url, mp4Key, parseMp4Audio, mp4ToAdts, pickLightest, parseMedia, audioOnlyUrl, parseDash, parseSidx, kodikLightUrl, batchesFor, demuxTs, isTs };
    root.AgLookahead = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
