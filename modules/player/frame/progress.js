// modules/player/frame/progress.js
// Видео серии в кадре плеера (content-player.js): ход просмотра для страницы сайта, место остановки,
// звук и пропуск по звуку. Плееры подменяют <video> при смене серии, поэтому за DOM следим постоянно.

(function (root) {
    'use strict';

    const PROGRESS_THROTTLE_MS = 2000;
    // Реклама короче и места остановки не запрашивает
    const MIN_EPISODE_SEC = 60;
    // Зритель уже сам ушёл дальше — не перематываем
    const RESUME_MAX_START_SEC = 5;
    const EPISODE_CACHE_MS = 10000;
    const SCAN_DEBOUNCE_MS = 500;
    const SCAN_EVERY_MS = 1000;

    /**
     * player — адаптер плеера, link — связь со страницей (frame/link.js), sound — frame/sound.js,
     * getEpisode() — { current } по разметке плеера, takePendingSeek() — место после смены плеера (или null), audioSkip — пропуск по звуку
     */
    function start({ player, isKodik, link, sound, getEpisode, takePendingSeek, audioSkip }) {
        const tracked = new WeakSet();
        const audioBound = new WeakSet();

        // Место остановки хранит страница сайта (modules/progress-tracker.js): серию и тайтл знает только она
        let resumeVideo = null;
        window.addEventListener('message', (e) => {
            if (e.data?.type !== 'AG_RESUME' || !link.isParentSiteOrigin(e.origin)) return;
            const v = resumeVideo;
            resumeVideo = null;
            if (!v || v.currentTime > RESUME_MAX_START_SEC) return;
            const time = Number(e.data.time);
            if (time > 0 && time < v.duration) v.currentTime = time;
        });

        const attachProgressReporter = (v) => {
            if (tracked.has(v)) return;
            tracked.add(v);
            // Kodik обнуляет громкость и после старта, поэтому смотрим всё время, пока видео идёт
            v.addEventListener('timeupdate', () => sound.keepSound(v));
            // Номер серии в худшем случае ищется обходом всего плеера: пересчитываем не чаще раза в 10 с и при смене видео
            let episodeCache = null;
            let episodeCacheTs = 0;
            const episodeNow = () => {
                if (!episodeCache || Date.now() - episodeCacheTs > EPISODE_CACHE_MS) {
                    episodeCache = getEpisode();
                    episodeCacheTs = Date.now();
                }
                return episodeCache;
            };
            let resumeAsked = false;
            const askResume = () => {
                if (resumeAsked || !(v.duration >= MIN_EPISODE_SEC)) return;
                resumeAsked = true;
                // Плеер сменили: место известно точно, спрашивать страницу незачем
                const seek = takePendingSeek();
                if (seek !== null) {
                    if (seek < v.duration) v.currentTime = seek;
                    return;
                }
                resumeVideo = v;
                link.toTop({ type: 'AG_GET_RESUME', episode: episodeNow().current });
            };
            v.addEventListener('loadstart', () => { episodeCache = null; resumeAsked = false; });
            v.addEventListener('loadedmetadata', askResume);
            v.addEventListener('durationchange', askResume);
            askResume();

            // Реклама идёт в отдельном video и бывает длиннее минуты: её время не место остановки серии, а её конец не конец серии
            const isEpisode = () => { const main = player.video(); return !main || main === v; };
            const report = (isEnded) => isEpisode() && link.toTop({
                type: 'AG_VIDEO_PROGRESS',
                episode: episodeNow().current,
                currentTime: v.currentTime || 0,
                duration: Number.isFinite(v.duration) ? v.duration : 0,
                volume: v.volume,
                isEnded
            });
            let lastSent = 0;
            v.addEventListener('timeupdate', () => {
                const now = Date.now();
                if (now - lastSent < PROGRESS_THROTTLE_MS) return;
                lastSent = now;
                report(false);
            });
            v.addEventListener('ended', () => report(true));
        };

        // Реклама идёт в отдельном video: слушаем только саму серию
        const bindAudioSkip = (v) => {
            if (!audioSkip || audioBound.has(v)) return;
            audioBound.add(v);
            const check = () => { if (v.duration > 300) audioSkip.bind(v); };
            v.addEventListener('loadedmetadata', check);
            v.addEventListener('durationchange', check);
            check();
        };

        const scan = () => player.videos().forEach((v) => {
            attachProgressReporter(v);
            bindAudioSkip(v);
        });
        scan();
        let scanTimer = null;
        new MutationObserver(() => {
            if (scanTimer) return;
            scanTimer = setTimeout(() => { scanTimer = null; scan(); }, SCAN_DEBOUNCE_MS);
        }).observe(document.documentElement, { childList: true, subtree: true });
        if (!isKodik) setInterval(scan, SCAN_EVERY_MS);
    }

    root.AgFrameProgress = { start, MIN_EPISODE_SEC };
})(typeof globalThis !== 'undefined' ? globalThis : this);
