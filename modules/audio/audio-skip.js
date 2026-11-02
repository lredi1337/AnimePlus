// modules/audio/audio-skip.js
// Пропуск по звуку внутри плеера: узнаёт опенинг или эндинг по базе отпечатков песен.
// Порядок для каждой части отдельно: метка самого плеера → общая база таймингов → узнанная песня → AniSkip.
// Время в AniSkip часто не совпадает с конкретной озвучкой, поэтому узнанная песня важнее метки.
// Звук анализируется на устройстве, не сохраняется и никуда не отправляется. В общую базу уходит только найденное время.

(function () {
    'use strict';

    const FP = globalThis.AgFingerprint;
    if (!FP) return;

    // Конец песни в серии обычно на секунду раньше конца образца: образец заканчивается затуханием
    const END_TRIM_SEC = 1;
    // Если метка AniSkip начинается там же, что и песня, её конец точнее: песня в серии бывает короче образца
    const SAME_START_SEC = 3;
    // Песню за это время не узнали: метка могла съехать, поэтому только предлагаем кнопку
    const ANISKIP_GRACE_SEC = 30;
    const MAIN_VIDEO_MIN_SEC = 300;
    const CHUNK = 4096;
    // Абсолютная тишина столько времени при включённом звуке: значит, наш обработчик сломал звук видео
    const SILENCE_LIMIT_SEC = 30;
    // Видео идёт, а обработчик не получает звук: контекст встал, и пользователю тоже ничего не слышно
    const NO_AUDIO_LIMIT_MS = 15000;
    const BLOCK_KEY = 'ap_audio_blocked_at';
    const BLOCK_MS = 30 * 24 * 3600 * 1000;
    const RESUME_KEY = 'ap_audio_resume_at';
    // Анализ занимает больше этой доли времени: компьютер не справляется, отключаем только анализ
    const MAX_LOAD = 0.25;
    const LOAD_MIN_SAMPLE_SEC = 30;

    /** Лёгкий фильтр и прореживание: окно усреднения подавляет наложение высоких частот */
    function createResampler(fromRate) {
        const ratio = fromRate / FP.SAMPLE_RATE;
        let pos = 0;
        let sum = 0;
        let count = 0;
        return (input) => {
            const out = new Float32Array(Math.ceil(input.length / ratio) + 1);
            let n = 0;
            for (let i = 0; i < input.length; i++) {
                sum += input[i];
                count++;
                pos += 1;
                if (pos >= ratio) {
                    pos -= ratio;
                    out[n++] = sum / count;
                    sum = 0;
                    count = 0;
                }
            }
            return out.subarray(0, n);
        };
    }

    /**
     * Прослушивание одного элемента video. Источник создаётся один раз на элемент и с этого момента
     * звук идёт через AudioContext, поэтому подключаемся только когда контекст точно работает.
     */
    async function createListener(video, onChunk) {
        // Видео с другого домена без CORS в графе становится тишиной и пользователь потерял бы звук
        if (!String(video.currentSrc || '').startsWith('blob:')) return null;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        const ctx = new AudioCtx();
        if (ctx.state !== 'running') {
            try { await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 1500))]); } catch (e) {}
        }
        if (ctx.state !== 'running') {
            ctx.close().catch(() => {});
            return null;
        }
        let source;
        try {
            source = ctx.createMediaElementSource(video);
        } catch (e) {
            ctx.close().catch(() => {});
            return null;
        }
        source.connect(ctx.destination);
        const proc = ctx.createScriptProcessor(CHUNK, 1, 1);
        const sink = ctx.createGain();
        sink.gain.value = 0;
        source.connect(proc);
        proc.connect(sink);
        sink.connect(ctx.destination);
        proc.onaudioprocess = (e) => onChunk(e.inputBuffer.getChannelData(0), ctx.sampleRate);
        const stopFeed = () => { proc.onaudioprocess = null; };
        // Браузер может приостановить контекст: без него не будет слышно и само видео
        const wake = () => { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); };
        ctx.addEventListener('statechange', wake);
        video.addEventListener('play', wake);
        return { ctx, stopFeed };
    }

    const clockToSec = (s) => s.split(':').reduce((sum, x) => sum * 60 + Number(x), 0);

    /** Метки из страницы плеера Kodik: parseSkipButton("03:15-04:46,22:42-24:12", "anime") */
    function parseNativeMarks(text) {
        const m = String(text || '').match(/parseSkipButton\(\s*["']([^"']*)["']/);
        if (!m) return [];
        const out = [];
        for (const part of m[1].split(',')) {
            const r = part.trim().match(/^(\d{1,2}(?::\d{1,2}){1,2})\s*-\s*(\d{1,2}(?::\d{1,2}){1,2})$/);
            if (!r) continue;
            const start = clockToSec(r[1]);
            const end = clockToSec(r[2]);
            if (end > start) out.push({ start, end });
        }
        return out;
    }

    /**
     * Какая метка опенинг, а какая эндинг. Меток бывает одна: тогда решает место в серии, а вторую часть ищем сами.
     * Если длина серии ещё неизвестна, считаем обычную серию в 24 минуты.
     */
    function splitNativeMarks(ranges, duration) {
        const middle = (duration > 0 ? duration : 1440) / 2;
        const result = { op: null, ed: null };
        for (const r of [...(ranges || [])].sort((a, b) => a.start - b.start)) {
            if (r.start < middle) {
                if (!result.op) result.op = r;
            } else {
                result.ed = r;
            }
        }
        return result;
    }

    /** Идёт ли песня в этой серии по данным AnimeThemes: «1-5, 7, 9-10» */
    function songInEpisode(spec, episode) {
        const ep = Number(episode);
        if (!ep || !spec) return false;
        return String(spec).split(',').some((part) => {
            const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?/);
            return !!m && ep >= Number(m[1]) && ep <= Number(m[2] || m[1]);
        });
    }

    /** Итоговое время для части серии: чистая логика, проверяется тестами */
    function chooseTimings({ native, shared, hit, mark, hasSong, listening, currentTime }) {
        if (native) return { ...native, source: 'kodik' };
        if (shared) return { start: shared.start, end: shared.end, source: 'shared' };
        const m = mark || { start: 0, end: 0 };
        if (hit) {
            const end = hit.start + hit.song.len - END_TRIM_SEC;
            if (m.end > 0 && Math.abs(m.start - hit.start) <= SAME_START_SEC && m.end > hit.start) {
                return { start: hit.start, end: Math.min(m.end, end + END_TRIM_SEC), source: 'audio+aniskip' };
            }
            return { start: hit.start, end, source: 'audio' };
        }
        if (m.end <= 0) return { start: 0, end: 0 };
        if (hasSong && listening) {
            if (currentTime < m.start + ANISKIP_GRACE_SEC) return { start: 0, end: 0 };
            return { ...m, source: 'aniskip', manual: true };
        }
        return { ...m, source: 'aniskip' };
    }

    /** options: { getSettings, getEpisode, getVoice, onTimings(timings) } — плеер получает итоговые тайминги и пропускает как обычно */
    function create(options) {
        let title = null;
        let songs = null;
        let aniskip = { op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } };
        let found = { op: null, ed: null };
        let matcher = null;
        let hasher = null;
        let segment = null;
        let resampler = null;
        let resampleRate = 0;
        let bound = null;
        let loadToken = 0;
        let native = null;
        let shared = {};
        let sharedKey = null;
        let blocked = false;
        let silentSec = 0;
        let analysisOff = false;
        let loadSpent = 0;
        let loadTotal = 0;
        let lastChunkAt = 0;
        const foundAt = {};
        const listeners = new WeakMap();

        const hasSongs = (type) => !!(songs && songs.some(s => s.type === type));
        const listening = (video) => !!(video && listeners.get(video));
        const nativeFor = (part, video) => (native ? splitNativeMarks(native.ranges, video && video.duration)[part] : null);
        const resolved = (part, video) => !!(nativeFor(part, video) || shared[part]);
        const seriesInfo = (video) => {
            const episode = options.getEpisode ? String(options.getEpisode() || '') : '';
            const voice = options.getVoice ? options.getVoice() : '';
            return title && episode && video && video.duration > MAIN_VIDEO_MIN_SEC ? { id: title, episode, voice: voice || '', duration: Math.round(video.duration) } : null;
        };

        const timingsFor = (part, video) => chooseTimings({
            native: nativeFor(part, video),
            shared: shared[part],
            hit: found[part],
            mark: aniskip[part],
            hasSong: hasSongs(part.toUpperCase()),
            listening: listening(video),
            currentTime: video ? video.currentTime : 0
        });

        const publish = (video) => {
            const timings = { op: timingsFor('op', video), ed: timingsFor('ed', video) };
            options.onTimings(timings);
            // Для диагностики у пользователя и в тестах: состояние видно в атрибуте видео
            if (video && options.getSettings().audioDebug) {
                video.dataset.agAudio = JSON.stringify({
                    title,
                    songs: songs ? songs.map(s => s.id) : null,
                    listening: listening(video),
                    blocked,
                    analysisOff,
                    found: { op: found.op && +found.op.start.toFixed(1), ed: found.ed && +found.ed.start.toFixed(1) },
                    foundAt,
                    timings
                });
            }
        };

        const onHash = (h, frame) => {
            if (!segment || !matcher) return;
            const sec = segment.base + frame * FP.FRAME_SEC;
            const r = matcher.feed(h, sec);
            if (!r) return;
            // Опенинг бывает и в конце серии: важно место, а не название песни
            const middle = bound && bound.duration ? bound.duration / 2 : 720;
            const place = r.start >= middle ? 'ed' : 'op';
            const episode = options.getEpisode ? options.getEpisode() : '';
            const old = found[place];
            const newFits = songInEpisode(r.song.episodes, episode);
            // Похожие версии одной песни: важнее та, что заявлена для этой серии
            if (old && !(newFits && !old.fits) && (old.fits && !newFits || old.votes >= r.votes)) return;
            found[place] = { song: r.song, start: Math.max(0, r.start), votes: r.votes, fits: newFits };
            foundAt[place] = +sec.toFixed(1);
            publish(bound);
            shareFound(place);
        };

        // Первый зритель находит тайминг, остальные получают его сразу и без прослушивания
        const shareFound = (part) => {
            if (resolved(part, bound)) return;
            const info = seriesInfo(bound);
            const t = timingsFor(part, bound);
            if (!info || !t.end || !String(t.source).startsWith('audio')) return;
            chrome.runtime.sendMessage({ action: 'report_audio_timing', ...info, part, start: t.start, end: t.end }).catch(() => {});
        };

        const loadShared = async (video) => {
            if (options.getSettings().audioSkip === false) return;
            const info = seriesInfo(video);
            if (!info) return;
            const key = `${info.id}|${info.episode}|${info.voice}|${info.duration}`;
            if (key === sharedKey) return;
            sharedKey = key;
            shared = {};
            let res = null;
            try {
                res = await chrome.runtime.sendMessage({ action: 'get_shared_timings', ...info });
            } catch (e) {}
            if (key !== sharedKey || !res) return;
            shared = { op: res.op || undefined, ed: res.ed || undefined };
            publish(video);
        };

        // Наш обработчик сломал звук: запоминаем это в браузере и перезагружаем плеер, там звук уже без нас
        const rescueSound = (video) => {
            blocked = true;
            try { sessionStorage.setItem(RESUME_KEY, String(video.currentTime)); } catch (e) {}
            chrome.storage.local.set({ [BLOCK_KEY]: Date.now() }).finally(() => location.reload());
        };

        const onChunk = (data, rate) => {
            lastChunkAt = Date.now();
            const v = bound;
            if (!v || v.paused || v.seeking) { segment = null; return; }
            const chunkSec = data.length / rate;

            let peak = 0;
            for (let i = 0; i < data.length; i += 32) {
                const a = Math.abs(data[i]);
                if (a > peak) peak = a;
            }
            // Только для проверки защиты: имитация сломанного звука
            if (options.getSettings().audioDebugBreak === 'silence') peak = 0;
            if (peak === 0 && !v.muted && v.volume > 0) {
                silentSec += chunkSec;
                if (silentSec >= SILENCE_LIMIT_SEC && !blocked) rescueSound(v);
            } else {
                silentSec = 0;
            }
            if (analysisOff || !matcher) return;

            // На другой скорости звук растянут и отпечатки не совпадут
            if (Math.abs(v.playbackRate - 1) > 0.01) { segment = null; return; }
            if (rate !== resampleRate) {
                resampler = createResampler(rate);
                resampleRate = rate;
            }
            const startTime = v.currentTime - chunkSec;
            // Новый участок после перемотки: сдвиг считается во времени видео, поэтому голоса остаются в силе
            if (!segment || Math.abs(startTime - segment.expected) > 0.6) {
                segment = { base: startTime, expected: startTime };
                hasher = FP.createHasher(onHash);
            }
            const t0 = performance.now();
            hasher.push(resampler(data));
            loadSpent += (performance.now() - t0) / 1000;
            loadTotal += chunkSec;
            if (loadTotal >= LOAD_MIN_SAMPLE_SEC) {
                if (loadSpent / loadTotal > MAX_LOAD) {
                    analysisOff = true;
                    publish(v);
                }
                loadSpent = 0;
                loadTotal = 0;
            }
            segment.expected = startTime + chunkSec;
        };

        const resetEpisode = () => {
            // Плеер сменил серию без перезагрузки: метки в странице относятся к прошлой серии
            const episode = options.getEpisode ? options.getEpisode() : '';
            if (native && native.episode !== episode) native = null;
            found = { op: null, ed: null };
            shared = {};
            sharedKey = null;
            delete foundAt.op;
            delete foundAt.ed;
            segment = null;
            hasher = null;
            silentSec = 0;
            if (matcher) matcher.reset();
        };

        const tryListen = async (video) => {
            if (!video || blocked || listeners.has(video) || options.getSettings().audioSkip === false) return;
            if (!songs || !songs.length) return;
            if (!(video.duration > MAIN_VIDEO_MIN_SEC) || video.paused) return;
            // Обе части уже известны: слушать незачем
            if (resolved('op', video) && resolved('ed', video)) return;
            listeners.set(video, null);
            const l = await createListener(video, onChunk);
            // Браузер не дал запустить звук без действия пользователя: попробуем снова после его нажатия
            if (l) {
                listeners.set(video, l);
                lastChunkAt = Date.now();
                if (options.getSettings().audioDebugBreak === 'nofeed') l.stopFeed();
            } else {
                listeners.delete(video);
            }
            publish(video);
        };

        const checkFeed = (video) => {
            const l = listeners.get(video);
            if (!l || blocked || video.paused || video.seeking || video.readyState < 3) {
                lastChunkAt = Date.now();
                return;
            }
            if (Date.now() - lastChunkAt > NO_AUDIO_LIMIT_MS) rescueSound(video);
        };

        const restorePosition = (video) => {
            let saved = null;
            try {
                saved = sessionStorage.getItem(RESUME_KEY);
                if (saved) sessionStorage.removeItem(RESUME_KEY);
            } catch (e) {}
            if (saved) video.currentTime = Number(saved);
        };

        const bind = (video) => {
            if (bound === video) return;
            bound = video;
            resetEpisode();
            restorePosition(video);
            const kick = async () => {
                await loadShared(video);
                tryListen(video);
            };
            ['play', 'playing', 'loadedmetadata'].forEach(ev => video.addEventListener(ev, kick));
            video.addEventListener('loadstart', () => {
                if (bound === video) { resetEpisode(); publish(video); }
            });
            video.addEventListener('timeupdate', () => {
                if (bound !== video) return;
                checkFeed(video);
                // Истекло время на узнавание: подключаем метку AniSkip
                if (aniskip.op.end > 0 || aniskip.ed.end > 0) publish(video);
            });
            kick();
        };

        document.addEventListener('pointerdown', () => { if (bound) tryListen(bound); }, true);
        chrome.storage.local.get(BLOCK_KEY).then((saved) => {
            const at = saved && saved[BLOCK_KEY];
            if (at && Date.now() - at < BLOCK_MS) blocked = true;
        }).catch(() => {});

        return {
            bind,
            /** Собственные метки плеера Kodik для текущей серии */
            setNative(ranges) {
                native = ranges && ranges.length ? { ranges, episode: options.getEpisode ? options.getEpisode() : '' } : null;
                publish(bound);
            },
            /** Метка AniSkip и ID тайтла со страницы сайта */
            async setTitle(id, marks) {
                if (marks) aniskip = marks;
                if (id && id !== title) {
                    title = id;
                    songs = null;
                    const token = ++loadToken;
                    let res = null;
                    try {
                        res = await chrome.runtime.sendMessage({ action: 'get_audio_fingerprints', id });
                    } catch (e) {}
                    if (token !== loadToken) return;
                    songs = res && res.songs ? res.songs.map(s => ({ id: s.slug, type: s.type, len: s.len, episodes: s.episodes, index: FP.indexSong(s.fp) })) : [];
                    matcher = songs.length ? FP.createMatcher(songs) : null;
                    segment = null;
                    hasher = null;
                    if (bound) {
                        await loadShared(bound);
                        tryListen(bound);
                    }
                }
                publish(bound);
            }
        };
    }

    globalThis.AgAudioSkip = { create, parseNativeMarks, splitNativeMarks, songInEpisode, chooseTimings };
})();
