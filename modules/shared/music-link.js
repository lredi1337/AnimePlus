// modules/shared/music-link.js
// Кнопка опенинга и эндинга в окне расширения открывает сразу ролик YouTube.
// Номер песни для серии берётся из нашей базы песен (те же данные, что у пропуска по звуку),
// ID ролика находит сервер Anime+ (server/timings/src/youtube.js). При любом сбое остаётся обычный поиск YouTube.
(function (root) {
    const WORKER = 'https://animeplus-timings.ruscadred.workers.dev/v1/yt';
    const VIDEO_TTL = 30 * 24 * 3600 * 1000;
    const VIDEO_ID = /^[\w-]{11}$/;

    /** Идёт ли песня в этой серии: «1-5, 7, 9-10» */
    function inEpisode(spec, ep) {
        return String(spec || '').split(',').some((part) => {
            const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?/);
            return !!m && ep >= Number(m[1]) && ep <= Number(m[2] || m[1]);
        });
    }
    const firstEpisode = (spec) => { const m = String(spec || '').match(/\d+/); return m ? Number(m[0]) : 0; };

    /** Песня типа OP или ED для серии, null если в базе таких нет */
    function pickSong(songs, type, episode) {
        const list = (songs || []).filter(s => s && s.type === type);
        if (!list.length) return null;
        const ep = Number(episode) || 1;
        const exact = list.find(s => inEpisode(s.episodes, ep));
        if (exact) return exact;
        if (list.length === 1) return list[0];
        // Серия за пределами диапазонов: последняя песня, начавшаяся до неё
        const started = list.filter(s => firstEpisode(s.episodes) && firstEpisode(s.episodes) <= ep);
        return started.length ? started.reduce((a, b) => (firstEpisode(b.episodes) > firstEpisode(a.episodes) ? b : a)) : list[0];
    }

    const songNumber = (song, episode) => {
        if (song) { const m = String(song.slug || '').match(/\d+/); return m ? Number(m[0]) : 1; }
        return Math.floor(((Number(episode) || 1) - 1) / 13) + 1;
    };

    function songQuery(name, type, episode, song) {
        return `${name} ${type === 'OP' ? 'opening' : 'ending'} ${songNumber(song, episode)}`;
    }

    /** ID ролика или null. Ответ хранится месяц, чтобы окно не спрашивало сервер при каждом открытии */
    async function videoId(query, { fetch: fetchFn = root.fetch && root.fetch.bind(root), storage = root.chrome && root.chrome.storage && root.chrome.storage.local } = {}) {
        const key = `ytv_${query.toLowerCase()}`;
        try {
            const saved = storage && (await storage.get(key))[key];
            if (saved && VIDEO_ID.test(saved.id) && Date.now() - saved.at < VIDEO_TTL) return saved.id;
        } catch (e) {}
        try {
            const res = await fetchFn(`${WORKER}?q=${encodeURIComponent(query)}`);
            if (!res.ok) return null;
            const { id } = await res.json();
            if (!VIDEO_ID.test(String(id))) return null;
            try { if (storage) await storage.set({ [key]: { id, at: Date.now() } }); } catch (e) {}
            return id;
        } catch (e) {
            return null;
        }
    }

    const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;
    const searchUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

    root.AgMusic = { pickSong, songQuery, songNumber, videoId, watchUrl, searchUrl };
})(typeof globalThis !== 'undefined' ? globalThis : window);
