// modules/audio/fingerprint.js
// Аудиоотпечатки по ориентирам: пики спектра → пары пиков → хэши. Совпадения голосуют за сдвиг относительно образца.
// Работает только на устройстве пользователя: наружу ничего не отправляется. Без зависимостей: тот же код в Node для сборки базы и тестов.

(function (root) {
    'use strict';

    const SAMPLE_RATE = 11025;
    const WINDOW = 1024;
    const HOP = 256;
    const FRAME_SEC = HOP / SAMPLE_RATE;
    const BANDS = [[6, 12], [12, 24], [24, 48], [48, 96], [96, 192], [192, 384]];
    const FAN = 5;
    const MIN_DT = 3;
    const MAX_DT = 60;
    // В базе хранится примерно четверть хэшей: и в образце, и в серии остаются одни и те же, поэтому сдвиг находится так же
    const KEEP_MOD = 4;
    const keepHash = (h) => (Math.imul(h, 2654435761) >>> 0) % KEEP_MOD === 0;

    const HANN = new Float32Array(WINDOW);
    for (let i = 0; i < WINDOW; i++) HANN[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WINDOW - 1));

    function fft(re, im) {
        const n = re.length;
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) {
                let t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        for (let len = 2; len <= n; len <<= 1) {
            const ang = -2 * Math.PI / len;
            const wr = Math.cos(ang);
            const wi = Math.sin(ang);
            for (let i = 0; i < n; i += len) {
                let cr = 1;
                let ci = 0;
                for (let k = 0; k < len / 2; k++) {
                    const a = i + k;
                    const b = a + len / 2;
                    const tr = re[b] * cr - im[b] * ci;
                    const ti = re[b] * ci + im[b] * cr;
                    re[b] = re[a] - tr; im[b] = im[a] - ti;
                    re[a] += tr; im[a] += ti;
                    const nr = cr * wr - ci * wi;
                    ci = cr * wi + ci * wr;
                    cr = nr;
                }
            }
        }
    }

    /**
     * Потоковый расчёт хэшей. push() принимает звук 11025 Гц, onHash получает (хэш, номер кадра).
     * Пара пиков готова, когда второй пик уже прошёл, поэтому хэши приходят с задержкой меньше секунды.
     */
    function createHasher(onHash) {
        const re = new Float64Array(WINDOW);
        const im = new Float64Array(WINDOW);
        const mags = new Float32Array(WINDOW / 2);
        const prev = new Float32Array(BANDS.length);
        let tail = new Float32Array(0);
        let frame = 0;
        let pending = [];

        const flushPending = (now) => {
            let i = 0;
            while (i < pending.length && (now == null || now - pending[i].f > MAX_DT)) {
                const a = pending[i];
                let fan = 0;
                for (let j = i + 1; j < pending.length && fan < FAN; j++) {
                    const dt = pending[j].f - a.f;
                    if (dt < MIN_DT) continue;
                    if (dt > MAX_DT) break;
                    onHash((a.bin << 15) | (pending[j].bin << 6) | dt, a.f);
                    fan++;
                }
                i++;
            }
            if (i) pending = pending.slice(i);
        };

        const processFrame = (buf, off) => {
            for (let i = 0; i < WINDOW; i++) { re[i] = buf[off + i] * HANN[i]; im[i] = 0; }
            fft(re, im);
            let sum = 0;
            for (let i = 1; i < WINDOW / 2; i++) {
                mags[i] = Math.log1p(Math.hypot(re[i], im[i]));
                sum += mags[i];
            }
            const avg = sum / (WINDOW / 2 - 1);
            for (let b = 0; b < BANDS.length; b++) {
                const [lo, hi] = BANDS[b];
                let best = 0;
                let bin = -1;
                for (let i = lo; i < hi; i++) if (mags[i] > best) { best = mags[i]; bin = i; }
                // Порог с затуханием: только новые вершины, а не каждый кадр длинной ноты
                if (bin >= 0 && best > avg * 1.15 && best > prev[b] * 1.02 && best > 0.02) {
                    pending.push({ f: frame, bin });
                    prev[b] = best;
                } else {
                    prev[b] *= 0.985;
                }
            }
            frame++;
        };

        return {
            push(pcm) {
                const buf = new Float32Array(tail.length + pcm.length);
                buf.set(tail);
                buf.set(pcm, tail.length);
                let off = 0;
                for (; off + WINDOW <= buf.length; off += HOP) processFrame(buf, off);
                tail = buf.slice(off);
                flushPending(frame);
            },
            finish() { flushPending(null); },
            get frame() { return frame; }
        };
    }

    /** Хэши целого фрагмента: [{ h, t }], t в кадрах */
    function hashes(pcm) {
        const out = [];
        const hasher = createHasher((h, t) => out.push({ h, t }));
        hasher.push(pcm);
        hasher.finish();
        return out;
    }

    /** Упаковка отпечатка песни для базы: хэши (4 байта) и кадры (2 байта) в base64 */
    function encodeSong(list) {
        const kept = list.filter(x => keepHash(x.h) && x.t < 65536);
        const bytes = new Uint8Array(kept.length * 6);
        const view = new DataView(bytes.buffer);
        kept.forEach((x, i) => {
            view.setUint32(i * 6, x.h >>> 0, true);
            view.setUint16(i * 6 + 4, x.t, true);
        });
        let s = '';
        for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
        return btoa(s);
    }

    /** Индекс образца: хэш → кадры в образце. Частые хэши не различают песни, их отбрасываем */
    function indexSong(encoded) {
        const raw = atob(encoded);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        const view = new DataView(bytes.buffer);
        const index = new Map();
        for (let i = 0; i + 6 <= bytes.length; i += 6) {
            const h = view.getUint32(i, true);
            const t = view.getUint16(i + 4, true);
            const a = index.get(h);
            if (a) a.push(t); else index.set(h, [t]);
        }
        return index;
    }

    // Пороги подобраны на записях реальных серий: см. README, раздел про пропуск по звуку
    const MATCH = {
        minVotes: 32,        // столько голосов за один сдвиг случайно не набирается даже за всю зону поиска
        fastVotes: 18,       // быстрое узнавание: настоящая песня даёт плотные совпадения,
        fastWindowSec: 15,   // а случайные размазаны на минуты
        minSpreadSec: 5,     // совпадения растянуты во времени, а не случайная вспышка
        minLead: 3,          // во столько раз лучше следующего сдвига этой же песни
        maxPerHash: 10
    };

    /**
     * Потоковое сравнение с образцами. Сдвиг считается во времени самого видео, поэтому пауза и перемотка голоса не сбивают.
     * songs: [{ id, type, len, index }]. feed(h, sec) → найденная песня или null.
     */
    function createMatcher(songs, options) {
        const cfg = { ...MATCH, ...(options || {}) };
        const states = songs.map(song => ({ song, votes: new Map(), times: new Map(), seen: new Map(), done: false }));

        // Округление разносит один сдвиг по соседним корзинам: считаем их вместе
        const near = (key) => [key - 1, key, key + 1];

        const judge = (st, key, sec) => {
            let count = 0;
            let recent = 0;
            let first = Infinity;
            let last = -Infinity;
            for (const k of near(key)) {
                count += st.votes.get(k) || 0;
                for (const t of st.times.get(k) || []) {
                    if (t < first) first = t;
                    if (t > last) last = t;
                    if (sec - t <= cfg.fastWindowSec) recent++;
                }
            }
            if (count < cfg.minVotes && recent < cfg.fastVotes) return null;
            if (last - first < cfg.minSpreadSec) return null;
            let runner = 0;
            for (const [k, v] of st.votes) {
                if (Math.abs(k - key) > 2 && v > runner) runner = v;
            }
            return count >= runner * cfg.minLead ? count : null;
        };

        return {
            feed(h, sec) {
                if (!keepHash(h)) return null;
                let found = null;
                for (const st of states) {
                    if (st.done) continue;
                    const refs = st.song.index.get(h);
                    if (!refs || refs.length > cfg.maxPerHash) continue;
                    for (const frame of refs) {
                        const offset = sec - frame * FRAME_SEC;
                        const key = Math.round(offset / (4 * FRAME_SEC));
                        // Один хэш голосует за сдвиг один раз: длинная нота и ритм повторяют хэш и набирали голоса у чужих песен
                        let seen = st.seen.get(key);
                        if (!seen) st.seen.set(key, seen = new Set());
                        if (seen.has(h)) continue;
                        seen.add(h);
                        st.votes.set(key, (st.votes.get(key) || 0) + 1);
                        let times = st.times.get(key);
                        if (!times) st.times.set(key, times = []);
                        // Для плотности и размаха хватает последних совпадений и самого первого
                        if (times.length >= 64) times.splice(1, 1);
                        times.push(sec);
                        const votes = found ? null : judge(st, key, sec);
                        if (votes !== null) {
                            st.done = true;
                            found = { song: st.song, start: key * 4 * FRAME_SEC, votes };
                        }
                    }
                }
                return found;
            },
            reset() {
                states.forEach((st) => { st.votes.clear(); st.times.clear(); st.seen.clear(); st.done = false; });
            }
        };
    }

    const api = { SAMPLE_RATE, FRAME_SEC, KEEP_MOD, MATCH, keepHash, createHasher, hashes, encodeSong, indexSong, createMatcher };
    root.AgFingerprint = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
