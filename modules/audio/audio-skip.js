// modules/audio/audio-skip.js
// Пропуск по звуку внутри плеера: узнаёт опенинг или эндинг по базе отпечатков песен.
// Порядок для каждой части отдельно: метка самого плеера → метка сайта → узнанная песня → повтор между сериями.
// Метка сайта обычно точна и срабатывает сразу, но бывает грубо неверной: такую показываем кнопкой, пока песню не подтвердит звук.
// AniSkip не используется: его время часто не совпадает с конкретной озвучкой, на замере он ошибался чаще, чем попадал.
// Звук анализируется на устройстве, не сохраняется и никуда не отправляется.

(function () {
    'use strict';

    const FP = globalThis.AgFingerprint;
    if (!FP) return;

    // Конец песни в серии обычно на секунду раньше конца образца: образец заканчивается затуханием
    const END_TRIM_SEC = 1;
    const MAIN_VIDEO_MIN_SEC = 300;
    const CHUNK = 4096;
    const CAPTURE_TRIES = 15;
    const CAPTURE_STEP_MS = 200;
    // Абсолютная тишина столько времени при включённом звуке, а звука этого видео ещё не было: значит, наш обработчик сломал звук
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

    /** Копия звука видео. Дорожка появляется не сразу после запуска */
    async function captureSource(ctx, video) {
        if (!video.captureStream) return null;
        try {
            const stream = video.captureStream();
            for (let i = 0; i < CAPTURE_TRIES && !stream.getAudioTracks().length; i++) {
                await new Promise(r => setTimeout(r, CAPTURE_STEP_MS));
            }
            return stream.getAudioTracks().length ? ctx.createMediaStreamSource(stream) : null;
        } catch (e) {
            return null;
        }
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
        let passive = false;
        try {
            source = ctx.createMediaElementSource(video);
            source.connect(ctx.destination);
        } catch (e) {
            // Плеер сам подключён к обработке звука (Alloha, Aksor), а подключиться можно только один раз. Берём копию звука: зритель слышит всё как раньше
            source = await captureSource(ctx, video);
            passive = true;
        }
        if (!source) {
            ctx.close().catch(() => {});
            return null;
        }
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
        return { ctx, stopFeed, passive };
    }

    const clockToSec = (s) => s.split(':').reduce((sum, x) => sum * 60 + Number(x), 0);

    // Короче этого метка отмечает не песню, а, например, титры озвучки в самом конце файла
    const MIN_MARK_SEC = 60;
    // Сайт отключает метки Kodik значениями вроде [opening]999999-1000000: таких длинных серий не бывает
    const MAX_MARK_START_SEC = 6 * 60 * 60;
    // Точные метки опенинга у сайтов длятся около 89 с, а грубо неверные заметно отличаются: 0-64, 0-109, 0-159.
    // Эндинг бывает разной длины, неверной считаем только явно слишком длинную метку
    const SITE_OP_MIN_SEC = 85;
    const SITE_OP_MAX_SEC = 95;
    const SITE_ED_MAX_SEC = 240;
    // После песни остаётся столько или меньше: это титры озвучки или короткое превью, эндинг идёт до конца файла.
    // Если остаётся больше, там бывает сцена после титров. На замере хвост был либо до 17 с, либо от 32 с
    const ED_TAIL_SEC = 20;

    /**
     * Метки из страницы плеера Kodik: parseSkipButton("03:15-04:46,22:42-24:12", "anime").
     * Сайт может передать свои в адресе кадра, с названием части и в секундах: "[opening]0-89,[ending]1335-1425"
     */
    function parseNativeMarks(text) {
        const m = String(text || '').match(/parseSkipButton\(\s*["']([^"']*)["']/);
        if (!m) return [];
        const out = [];
        for (const part of m[1].split(',')) {
            const r = part.trim().match(/^(?:\[[^\]]*\])?\s*(\d+(?::\d{1,2}){0,2})\s*-\s*(\d+(?::\d{1,2}){0,2})$/);
            if (!r) continue;
            const start = clockToSec(r[1]);
            const end = clockToSec(r[2]);
            if (end - start >= MIN_MARK_SEC && start < MAX_MARK_START_SEC) out.push({ start, end });
        }
        return out;
    }

    /** Метки в этой записи подставил сайт ([opening]...), а не сам Kodik */
    function marksFromSite(text) {
        return /parseSkipButton\(\s*["']\s*\[/.test(String(text || ''));
    }

    /** Похожа ли метка сайта на настоящую песню */
    function siteMarkFits(part, mark) {
        const len = mark.end - mark.start;
        return part === 'op' ? len >= SITE_OP_MIN_SEC && len <= SITE_OP_MAX_SEC : len <= SITE_ED_MAX_SEC;
    }

    /** Эндинг до конца файла, если после песни почти ничего не осталось. Метка за концом файла тоже заканчивается на нём */
    function extendEnding(timings, duration) {
        if (!(duration > 0) || !(timings.end > 0) || timings.end === duration || duration - timings.end > ED_TAIL_SEC) return timings;
        return { ...timings, end: duration };
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

    /**
     * Тишина как признак, что наш обработчик сломал звук. Сломанный обработчик молчит с самого начала,
     * поэтому после звука того же видео тишина идёт из самой серии: у AnimeVost после титров до 50 с чёрного экрана.
     * Тогда перезагрузка плеера и выключение распознавания на 30 дней были бы ложными
     */
    function silenceStep(prev, { peak, sec, src, passive, quiet }) {
        if (peak > 0) return { silentSec: 0, heardSrc: src, rescue: false };
        if (passive || quiet || prev.heardSrc === src) return { silentSec: 0, heardSrc: prev.heardSrc, rescue: false };
        const silentSec = prev.silentSec + sec;
        return { silentSec, heardSrc: prev.heardSrc, rescue: silentSec >= SILENCE_LIMIT_SEC };
    }

    /** Итоговое время для части серии: чистая логика, проверяется тестами */
    function chooseTimings({ native, site, siteFits = true, hit, repeat }) {
        if (native) return { ...native, source: native.source || 'kodik' };
        // Метка сайта срабатывает сразу, без прослушивания. Если песню всё-таки успели узнать, звук точнее
        if (site && siteFits && !hit) return { start: site.start, end: site.end, source: 'site' };
        if (hit) return { start: hit.start, end: hit.start + hit.song.len - END_TRIM_SEC, source: 'audio' };
        // Кусок, повторяющийся в сериях тайтла: найден в этом самом файле
        if (repeat) return { start: repeat.start, end: repeat.end, source: 'repeat', ...(repeat.manual ? { manual: true } : {}) };
        // Метка сайта не похожа на песню: автопрыжок съел бы серию, поэтому только кнопка
        if (site) return { start: site.start, end: site.end, source: 'site', manual: true };
        return { start: 0, end: 0 };
    }

    /** options: { getSettings, getEpisode, onTimings(timings) } — плеер получает итоговые тайминги и пропускает как обычно */
    function create(options) {
        let title = null;
        let songs = null;
        // Метки Kodik и сайта, которые передала страница
        let passed = { op: null, ed: null };
        let found = { op: null, ed: null };
        let repeat = { op: null, ed: null };
        let matcher = null;
        let hasher = null;
        let segment = null;
        let resampler = null;
        let resampleRate = 0;
        let bound = null;
        let loadToken = 0;
        let native = null;
        let blocked = false;
        let silentSec = 0;
        // Источник видео, звук которого уже доходил до обработчика
        let heardSrc = null;
        let analysisOff = false;
        let loadSpent = 0;
        let loadTotal = 0;
        let lastChunkAt = 0;
        const foundAt = {};
        // Для диагностики: доходит ли звук
        const feed = { chunks: 0, peak: 0, rate: 0, hashes: 0 };
        let ahead = null;
        let aheadFor = null;
        const listeners = new WeakMap();

        const listening = (video) => !!(video && listeners.get(video));
        const passedMark = (part) => (passed[part] && passed[part].trusted && passed[part].end > 0 ? passed[part] : null);
        const nativeMark = (part, video) => (native ? splitNativeMarks(native.ranges, video && video.duration)[part] : null);
        // Метка самого Kodik этой серии и озвучки: своя или найденная для другого плеера
        const nativeFor = (part, video) => {
            const passed = passedMark(part);
            if (native && !native.fromSite && nativeMark(part, video)) return nativeMark(part, video);
            return passed && passed.kodik ? { start: passed.start, end: passed.end, source: 'kodik' } : null;
        };
        const siteFor = (part, video) => {
            const passed = passedMark(part);
            if (native && native.fromSite && nativeMark(part, video)) return nativeMark(part, video);
            return passed && !passed.kodik ? passed : null;
        };
        // Метку сайта проверяем звуком, поэтому известной считаем только метку Kodik
        const resolved = (part, video) => !!nativeFor(part, video);

        const timingsFor = (part, video) => {
            const site = siteFor(part, video);
            const timings = chooseTimings({
                native: nativeFor(part, video),
                site,
                siteFits: !site || siteMarkFits(part, site),
                hit: found[part],
                repeat: repeat[part]
            });
            return part === 'ed' ? extendEnding(timings, video ? video.duration : 0) : timings;
        };

        const publish = (video) => {
            const timings = { op: timingsFor('op', video), ed: timingsFor('ed', video) };
            options.onTimings(timings);
            // Для диагностики у пользователя и в тестах: состояние видно в атрибуте видео
            if (video && options.getSettings().audioDebug) {
                video.dataset.agAudio = JSON.stringify({
                    title,
                    songs: songs ? songs.map(s => s.id) : null,
                    listening: listening(video),
                    passive: !!(listeners.get(video) && listeners.get(video).passive),
                    ahead: ahead ? ahead.state : null,
                    feed,
                    blocked,
                    analysisOff,
                    found: { op: found.op && +found.op.start.toFixed(1), ed: found.ed && +found.ed.start.toFixed(1) },
                    repeat,
                    foundAt,
                    timings
                });
            }
        };

        const onHash = (h, frame) => {
            if (!segment || !matcher) return;
            feed.hashes++;
            const sec = segment.base + frame * FP.FRAME_SEC;
            const r = matcher.feed(h, sec);
            if (r) acceptHit(r, sec);
        };

        const acceptHit = (r, sec) => {
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
        };

        // Анализ заранее: песня находится до того, как зазвучит. Нужен, только если места песни ещё никто не знает наверняка
        const startAhead = async (video) => {
            if (!globalThis.AgLookahead || aheadFor === video.currentSrc || !songs) return;
            if (options.getSettings().audioSkip === false || !(video.duration > MAIN_VIDEO_MIN_SEC) || !window.innerWidth) return;
            // Зритель просил экономить трафик: песню найдёт и обычное прослушивание
            if (navigator.connection && navigator.connection.saveData) return;
            aheadFor = video.currentSrc;
            if (ahead) ahead.stop();
            ahead = null;
            const config = await chrome.runtime.sendMessage({ action: 'get_remote_config' }).catch(() => null);
            if ((config && config.lookahead === false) || bound !== video) return;
            // Песен тайтла может не быть в базе: тогда смотреть вперёд есть смысл только ради сравнения серий
            const comparing = !(config && config.repeatSkip === false) && !!globalThis.AgRepeatFinder;
            if (!songs.length && !comparing) return;
            const comparer = comparing ? createEpisodeComparer(video) : null;
            ahead = globalThis.AgLookahead.create({
                video,
                fingerprint: FP,
                songs,
                wanted: (part) => !found[part] && !repeat[part] && !resolved(part, video),
                onFound: (r) => acceptHit(r, video.currentTime),
                onHashes: comparer ? comparer.onHashes : undefined,
                onState: () => { if (options.getSettings().audioDebug) publish(video); }
            });
            ahead.start();
        };

        // Сравнение серий одного тайтла. Эта серия запоминается для следующих, а звук не хранится: только отпечатки в браузере зрителя
        const createEpisodeComparer = (video) => {
            const id = title;
            const episode = String(options.getEpisode ? options.getEpisode() || '' : '');
            if (!id || !episode) return null;
            const comparer = globalThis.AgRepeatFinder.createComparer({
                loadOthers: async (part) => (await chrome.runtime.sendMessage({ action: 'get_episode_prints', title: id, part, episode })) || [],
                onFound: (part, run) => {
                    if (bound !== video || title !== id) return;
                    repeat[part] = run;
                    publish(video);
                }
            });
            return {
                async onHashes(part, list, final) {
                    await comparer.add(part, list, final);
                    if (!final) return;
                    const print = comparer.print(part);
                    if (print) chrome.runtime.sendMessage({ action: 'save_episode_print', title: id, part, episode, print }).catch(() => {});
                }
            };
        };

        // Наш обработчик сломал звук: запоминаем это в браузере и перезагружаем плеер, там звук уже без нас
        const rescueSound = (video) => {
            blocked = true;
            if (globalThis.AgDiag) globalThis.AgDiag.note('audio_rescue');
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
            const passive = listeners.get(v) && listeners.get(v).passive;
            feed.chunks++;
            feed.peak = +peak.toFixed(3);
            feed.rate = rate;
            const silence = silenceStep({ silentSec, heardSrc }, { peak, sec: chunkSec, src: v.currentSrc, passive, quiet: v.muted || !(v.volume > 0) });
            silentSec = silence.silentSec;
            heardSrc = silence.heardSrc;
            if (silence.rescue && !blocked) rescueSound(v);
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
                    if (globalThis.AgDiag) globalThis.AgDiag.note('audio_analysis_off');
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
            repeat = { op: null, ed: null };
            if (ahead) ahead.stop();
            ahead = null;
            aheadFor = null;
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
            } else {
                listeners.delete(video);
            }
            publish(video);
        };

        const checkFeed = (video) => {
            const l = listeners.get(video);
            if (!l || l.passive || blocked || video.paused || video.seeking || video.readyState < 3) {
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
            const kick = () => {
                tryListen(video);
                if (!video.paused) startAhead(video);
            };
            ['play', 'playing', 'loadedmetadata'].forEach(ev => video.addEventListener(ev, kick));
            video.addEventListener('loadstart', () => {
                if (bound === video) { resetEpisode(); publish(video); }
            });
            video.addEventListener('timeupdate', () => {
                if (bound !== video) return;
                checkFeed(video);
                if (ahead) ahead.tail();
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
            setNative(ranges, fromSite = false) {
                native = ranges && ranges.length ? { ranges, fromSite, episode: options.getEpisode ? options.getEpisode() : '' } : null;
                publish(bound);
            },
            /** Метки Kodik и сайта и ID тайтла со страницы сайта */
            async setTitle(id, marks) {
                if (marks) passed = marks;
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
                        tryListen(bound);
                        if (!bound.paused) startAhead(bound);
                    }
                }
                publish(bound);
            }
        };
    }

    globalThis.AgAudioSkip = { create, silenceStep, parseNativeMarks, marksFromSite, siteMarkFits, extendEnding, splitNativeMarks, songInEpisode, chooseTimings };
})();
