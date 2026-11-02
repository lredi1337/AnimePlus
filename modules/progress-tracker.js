// modules/progress-tracker.js
// Учёт просмотра серий и синхронизация с Shikimori, не зависящая от конкретного плеера.
//
// Источники событий (все приходят в верхнее окно через postMessage):
//   - AG_VIDEO_PROGRESS — наш content-kodik.js (Kodik внутри iframe, в т.ч. вложенный на Jut-Su);
//   - нативные события Kodik:  { key: 'kodik_player_time_update' | 'kodik_player_duration_update' | 'kodik_player_video_ended', value };
//   - AniBoom:                 { source: 'aniboom-player', type: 'player.timeupdate' | 'player.ended', payload };
//   - CDNVideoHub (CVH):       { source: 'cdnvideohub-player', eventType: 'timeupdate' | 'ended', data }.
// Серия засчитывается один раз: при 80% длительности (и реально просмотренной половине) либо по событию ended.

(function () {
    'use strict';

    const WATCHED_RATIO = 0.8;
    const MIN_REAL_WATCH_RATIO = 0.5;
    const MIN_DURATION_SEC = 60; // отсекаем рекламные ролики
    const MAX_TICK_DELTA_SEC = 5; // большие скачки времени = перемотка, а не просмотр

    function parsePlayerMessage(data) {
        if (!data || typeof data !== 'object') return null;

        if (data.type === 'AG_VIDEO_PROGRESS') {
            return {
                stream: 'ag',
                currentTime: Number(data.currentTime) || 0,
                duration: Number(data.duration) || 0,
                ended: data.isEnded === true,
                episode: data.episode != null ? String(data.episode) : null,
                // Старый формат (без времени) приходил только после 80% — доверяем ему
                legacyWatched: data.currentTime === undefined
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
    window.agInitProgressTracker = function (adapter) {
        if (window.__agProgressTrackerActive) return window.__agProgressTrackerActive;

        // Состояние по окну-источнику и потоку событий: окно Kodik шлёт и свои события, и наш AG_VIDEO_PROGRESS,
        // их нельзя смешивать при подсчёте просмотренного времени. WeakMap не удерживает окна удалённых iframe
        let sources = new WeakMap();
        const syncedEpisodes = new Set();
        let shikiIdPromise = null;
        let shikiIdPageKey = null;

        const getSourceState = (source, stream) => {
            let streams = sources.get(source);
            if (!streams) {
                streams = {};
                sources.set(source, streams);
            }
            if (!streams[stream]) streams[stream] = { episode: null, lastTime: null, watched: 0, duration: 0 };
            return streams[stream];
        };

        const resolveShikiId = (info) => {
            if (shikiIdPromise && shikiIdPageKey === info.pageKey) return shikiIdPromise;
            shikiIdPageKey = info.pageKey;
            // Провайдер мог взять ID прямо со страницы (ссылка на Shikimori, API сайта) — тогда не угадываем
            if (info.shikimoriId) {
                shikiIdPromise = Promise.resolve({ id: parseInt(info.shikimoriId, 10), episodes: info.totalEpisodes || 0 });
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

        const commitEpisode = async (episode) => {
            const info = await adapter.getTitleInfo();
            if (!info || (!info.shikimoriId && (!info.titles || info.titles.length === 0))) return;

            const key = `${info.pageKey}#${episode}`;
            if (syncedEpisodes.has(key)) return;
            syncedEpisodes.add(key);

            const settings = await window.getSettings();
            if (settings.shiki_enabled === false || settings.shiki_sync_episodes === false) return;

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
                totalEpisodes: anime.episodes || 0,
                status: 'watching'
            });

            if (res && res.success) {
                if (settings.shiki_show_toasts !== false && window.showAgToast && !res.noop) {
                    window.showAgToast(`Shikimori: серия ${episode} отмечена ✓`);
                }
            } else if (res && res.reason !== 'not_logged_in') {
                console.warn(`[Anime+][${adapter.site}] Shikimori sync failed:`, res);
                syncedEpisodes.delete(key);
            }
        };

        const onMessage = (e) => {
            if (e.origin !== location.origin && !(window.isValidOrigin && window.isValidOrigin(e.origin))) return;
            const ev = parsePlayerMessage(e.data);
            if (!ev) return;

            if (!e.source) return;
            const st = getSourceState(e.source, ev.stream);
            const episode = adapter.getEpisode(ev.episode || null) || '1';

            if (st.episode !== episode) {
                st.episode = episode;
                st.lastTime = null;
                st.watched = 0;
                st.duration = 0;
            }

            if (ev.duration > 0) st.duration = ev.duration;

            if (typeof ev.currentTime === 'number' && ev.currentTime > 0) {
                if (st.lastTime !== null) {
                    const delta = ev.currentTime - st.lastTime;
                    if (delta > 0 && delta <= MAX_TICK_DELTA_SEC) st.watched += delta;
                }
                st.lastTime = ev.currentTime;
            }

            const longEnough = st.duration >= MIN_DURATION_SEC;
            const reallyWatched = longEnough && st.watched >= st.duration * MIN_REAL_WATCH_RATIO;
            const reachedEnd = longEnough && st.lastTime !== null && st.lastTime / st.duration >= WATCHED_RATIO;

            if (ev.legacyWatched || (reallyWatched && (reachedEnd || ev.ended))) {
                commitEpisode(episode);
            }
        };

        window.addEventListener('message', onMessage);

        const api = {
            destroy() {
                window.removeEventListener('message', onMessage);
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
