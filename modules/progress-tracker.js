// modules/progress-tracker.js
// Учёт просмотра серий и синхронизация с Shikimori, не зависящая от конкретного плеера.
//
// Источники событий (все приходят в верхнее окно через postMessage):
//   - AG_VIDEO_PROGRESS — наш content-player.js (Kodik внутри iframe, в т.ч. вложенный на Jut-Su);
//   - нативные события Kodik:  { key: 'kodik_player_time_update' | 'kodik_player_duration_update' | 'kodik_player_video_ended', value };
//   - AniBoom:                 { source: 'aniboom-player', type: 'player.timeupdate' | 'player.ended', payload };
//   - CDNVideoHub (CVH):       { source: 'cdnvideohub-player', eventType: 'timeupdate' | 'ended', data }.
// Серия засчитывается один раз: при 80% длительности (и реально просмотренной половине) либо по событию ended.
// Просмотренные участки и место остановки хранятся в localStorage сайта, поэтому серию можно досмотреть
// после перезагрузки или смены озвучки: плеер спрашивает место сообщением AG_GET_RESUME и получает AG_RESUME.

(function () {
    'use strict';

    const WATCHED_RATIO = 0.8;
    const MIN_REAL_WATCH_RATIO = 0.5;
    const MIN_DURATION_SEC = 60; // отсекаем рекламные ролики
    const MAX_TICK_DELTA_SEC = 5; // большие скачки времени = перемотка, а не просмотр
    const STORAGE_KEY = 'ag_watch_progress';
    const SAVE_INTERVAL_MS = 15000;
    const MAX_SAVED_EPISODES = 200;
    const SAVED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    const MIN_RESUME_SEC = 10; // первые секунды продолжать незачем
    const HISTORY_AFTER_SEC = 60; // открыл и сразу ушёл — это ещё не просмотр
    const FINISHED_RATIO = 0.9; // досмотренная серия при новом запуске идёт сначала

    // Участки [начало, конец] без пересечений: один и тот же кусок серии дважды не считается
    function addRange(ranges, from, to) {
        const start = Math.floor(from);
        const end = Math.ceil(to);
        const merged = [];
        let current = [start, end];
        for (const range of ranges) {
            if (range[1] < current[0]) merged.push(range);
            else if (range[0] > current[1]) { merged.push(current); current = range; }
            else current = [Math.min(range[0], current[0]), Math.max(range[1], current[1])];
        }
        merged.push(current);
        return merged;
    }

    const rangesLength = (ranges) => ranges.reduce((sum, [from, to]) => sum + to - from, 0);

    function readSaved() {
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
            return saved && typeof saved === 'object' ? saved : {};
        } catch (e) {
            return {};
        }
    }

    function writeSaved(changes) {
        try {
            const saved = readSaved();
            for (const [key, value] of Object.entries(changes)) {
                if (value) saved[key] = value;
                else delete saved[key];
            }
            const now = Date.now();
            const fresh = Object.entries(saved)
                .filter(([, item]) => item && now - item.ts < SAVED_TTL_MS)
                .sort((a, b) => b[1].ts - a[1].ts)
                .slice(0, MAX_SAVED_EPISODES);
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(fresh)));
        } catch (e) {}
    }

    function parsePlayerMessage(data) {
        if (!data || typeof data !== 'object') return null;

        if (data.type === 'AG_VIDEO_PROGRESS') {
            return {
                stream: 'ag',
                currentTime: Number(data.currentTime) || 0,
                duration: Number(data.duration) || 0,
                ended: data.isEnded === true,
                episode: data.episode != null ? String(data.episode) : null
            };
        }

        if (typeof data.key === 'string' && data.key.startsWith('kodik_player_')) {
            switch (data.key) {
                case 'kodik_player_time_update': return { stream: 'kodik', currentTime: Number(data.value) || 0 };
                case 'kodik_player_duration_update': return { stream: 'kodik', duration: Number(data.value) || 0 };
                case 'kodik_player_video_ended': return { stream: 'kodik', ended: true };
                default: return null;
            }
        }

        if (data.source === 'aniboom-player') {
            if (data.type === 'player.timeupdate') {
                return { stream: 'aniboom', currentTime: Number(data.payload?.currentTime) || 0, duration: Number(data.payload?.duration) || 0 };
            }
            if (data.type === 'player.ended') return { stream: 'aniboom', ended: true };
            return null;
        }

        if (data.source === 'cdnvideohub-player') {
            if (data.eventType === 'timeupdate') {
                return { stream: 'cvh', currentTime: Number(data.data?.position) || 0, duration: Number(data.data?.duration) || 0 };
            }
            if (data.eventType === 'ended') return { stream: 'cvh', ended: true };
            return null;
        }

        return null;
    }

    /**
     * @param {Object} adapter
     * @param {string} adapter.site — 'animego' | 'jutsu' (для логов)
     * @param {(msgEpisode: string|null) => string|null} adapter.getEpisode — текущий номер серии
     * @param {() => {pageKey: string, titles: string[], year?: string, kind?: string}|null} adapter.getTitleInfo
     */
    /** Серия этой страницы, на которой зритель остановился: { episode, finished } или null */
    window.agLastWatched = function () {
        const prefix = `${location.pathname}#`;
        let last = null;
        for (const [key, item] of Object.entries(readSaved())) {
            if (!key.startsWith(prefix) || !item || (last && last.ts >= item.ts)) continue;
            last = { episode: key.slice(prefix.length), finished: !(Number(item.position) > 0), ts: item.ts };
        }
        return last;
    };

    window.agInitProgressTracker = function (adapter) {
        if (window.__agProgressTrackerActive) return window.__agProgressTrackerActive;

        // Состояние по окну-источнику и потоку событий: окно Kodik шлёт и свои события, и наш AG_VIDEO_PROGRESS,
        // их нельзя смешивать при подсчёте просмотренного времени. WeakMap не удерживает окна удалённых iframe
        let sources = new WeakMap();
        const syncedEpisodes = new Set();
        const watchedEpisodes = new Map();
        let lastSaveTime = 0;
        let shikiIdPromise = null;
        let shikiIdPageKey = null;

        const getSourceState = (source, stream) => {
            let streams = sources.get(source);
            if (!streams) {
                streams = {};
                sources.set(source, streams);
            }
            if (!streams[stream]) streams[stream] = { episode: null, lastTime: null, duration: 0 };
            return streams[stream];
        };

        const getWatched = (key) => {
            let watched = watchedEpisodes.get(key);
            if (!watched) {
                const saved = readSaved()[key];
                watched = { ranges: Array.isArray(saved?.ranges) ? saved.ranges : [], position: Number(saved?.position) || 0, dirty: false, done: false };
                watchedEpisodes.set(key, watched);
            }
            return watched;
        };

        const saveWatched = () => {
            const changes = {};
            for (const [key, watched] of watchedEpisodes) {
                if (!watched.dirty) continue;
                watched.dirty = false;
                changes[key] = watched.ranges.length > 0 || watched.position > 0
                    ? { ranges: watched.ranges, position: watched.position, ts: watched.at || Date.now() }
                    : null;
            }
            if (Object.keys(changes).length > 0) writeSaved(changes);
        };

        const resolveShikiId = (info) => {
            if (shikiIdPromise && shikiIdPageKey === info.pageKey) return shikiIdPromise;
            shikiIdPageKey = info.pageKey;
            // Провайдер мог взять ID прямо со страницы (ссылка на Shikimori, API сайта) — тогда не угадываем
            if (info.shikimoriId) {
                shikiIdPromise = Promise.resolve({ id: parseInt(info.shikimoriId, 10) });
                return shikiIdPromise;
            }
            shikiIdPromise = window.agSendMessage({
                action: 'resolve_shikimori_id',
                titles: info.titles,
                year: info.year || '',
                kind: info.kind || ''
            }).then(res => (res && res.id) ? res : null);
            return shikiIdPromise;
        };

        // Карточка «Продолжить» в окне расширения: последний тайтл, который зритель действительно смотрел
        // Адрес постера бывает без протокола (//static...): в окне расширения такой не откроется
        const pagePoster = () => {
            const src = window.document?.querySelector('meta[property="og:image"]')?.content;
            return src ? new URL(src, location.href).href : '';
        };
        const rememberedEpisodes = new Set();
        const rememberWatching = async (key) => {
            if (rememberedEpisodes.has(key)) return;
            rememberedEpisodes.add(key);
            try {
                const info = await adapter.getTitleInfo();
                if (!info) return;
                const anime = await resolveShikiId(info).catch(() => null);
                window.agSendMessage({
                    action: 'add_watch_history',
                    item: {
                        id: anime ? anime.id : null,
                        russian: info.title,
                        name: info.origTitle,
                        poster: pagePoster(),
                        url: location.href
                    }
                });
            } catch (e) {}
        };

        const commitEpisode = async (episode, watched) => {
            const info = await adapter.getTitleInfo();
            if (!info || (!info.shikimoriId && (!info.titles || info.titles.length === 0))) return;

            const key = `${info.pageKey}#${episode}`;
            if (syncedEpisodes.has(key)) return;
            syncedEpisodes.add(key);

            const anime = await resolveShikiId(info);
            if (!anime) {
                console.warn(`[Anime+][${adapter.site}] Shikimori ID not resolved for`, info.titles);
                syncedEpisodes.delete(key); // дадим шанс повторить на следующем событии
                shikiIdPromise = null;
                return;
            }

            const res = await window.agSendMessage({
                action: 'shiki_sync_progress',
                shikimoriId: anime.id,
                episode: parseInt(episode, 10) || 1,
                status: 'watching'
            });

            if (res && res.success) {
                // Серия отмечена: при пересмотре участки считаются заново, место остановки остаётся
                watched.done = true;
                watched.ranges = [];
                watched.dirty = true;
                saveWatched();
                if (window.showAgToast && !res.noop) {
                    window.showAgToast(`Shikimori: серия ${episode} отмечена ✓`);
                }
            } else if (res && res.reason !== 'not_logged_in') {
                console.warn(`[Anime+][${adapter.site}] Shikimori sync failed:`, res);
                syncedEpisodes.delete(key);
            }
        };

        const onMessage = (e) => {
            if (e.origin !== location.origin && !(window.isValidOrigin && window.isValidOrigin(e.origin))) return;
            if (e.data?.type === 'AG_GET_RESUME') {
                if (!e.source) return;
                const episode = adapter.getEpisode(e.data.episode != null ? String(e.data.episode) : null) || '1';
                const { position } = getWatched(`${location.pathname}#${episode}`);
                if (position >= MIN_RESUME_SEC) e.source.postMessage({ type: 'AG_RESUME', time: position }, e.origin);
                return;
            }
            const ev = parsePlayerMessage(e.data);
            if (!ev) return;

            if (!e.source) return;
            const st = getSourceState(e.source, ev.stream);
            const episode = adapter.getEpisode(ev.episode || null) || '1';
            const watched = getWatched(`${location.pathname}#${episode}`);

            if (st.episode !== episode) {
                st.episode = episode;
                st.lastTime = null;
                st.duration = 0;
            }

            if (ev.duration > 0) st.duration = ev.duration;

            const longEnough = st.duration >= MIN_DURATION_SEC;

            if (typeof ev.currentTime === 'number' && ev.currentTime > 0) {
                if (st.lastTime !== null && longEnough && !watched.done) {
                    const delta = ev.currentTime - st.lastTime;
                    if (delta > 0 && delta <= MAX_TICK_DELTA_SEC) {
                        watched.ranges = addRange(watched.ranges, st.lastTime, ev.currentTime);
                        watched.dirty = true;
                    }
                }
                st.lastTime = ev.currentTime;
                // Перемотать может только наш скрипт в плеере, поэтому место берём из его сообщений
                if (ev.stream === 'ag' && longEnough) {
                    watched.position = ev.currentTime / st.duration < FINISHED_RATIO ? ev.currentTime : 0;
                    // Несколько серий сохраняются разом: по этому времени видно, какую смотрели последней
                    watched.at = Date.now();
                    watched.dirty = true;
                }
            }
            if (ev.ended && ev.stream === 'ag' && longEnough) {
                watched.position = 0;
                watched.dirty = true;
            }

            if (Date.now() - lastSaveTime >= SAVE_INTERVAL_MS) {
                lastSaveTime = Date.now();
                saveWatched();
            }

            if (longEnough && (watched.done || rangesLength(watched.ranges) >= HISTORY_AFTER_SEC)) {
                rememberWatching(`${location.pathname}#${episode}`);
            }

            const reallyWatched = longEnough && rangesLength(watched.ranges) >= st.duration * MIN_REAL_WATCH_RATIO;
            const reachedEnd = longEnough && st.lastTime !== null && st.lastTime / st.duration >= WATCHED_RATIO;

            if (reallyWatched && (reachedEnd || ev.ended)) {
                commitEpisode(episode, watched);
            }
        };

        window.addEventListener('message', onMessage);
        window.addEventListener('pagehide', saveWatched);

        const api = {
            destroy() {
                saveWatched();
                window.removeEventListener('message', onMessage);
                window.removeEventListener('pagehide', saveWatched);
                sources = new WeakMap();
                window.__agProgressTrackerActive = null;
            },
            // Сброс кэша ID при смене тайтла без перезагрузки
            resetTitle() {
                shikiIdPromise = null;
                shikiIdPageKey = null;
                sources = new WeakMap();
            }
        };
        window.__agProgressTrackerActive = api;
        return api;
    };

})();
