// modules/animego/ag-shiki-widget.js
// Сведения о странице тайтла AnimeGO, виджет Shikimori, AniSkip и учёт просмотра

(function () {
    'use strict';

    let cachedSkipData = null;
    let cachedMalId = null;
    let lastFetchedEp = null;
    let skipRequestEp = null;

    // ---------- Сведения о странице (новый DOM 2026 + старые фолбэки) ----------

    const readJsonLd = () => {
        for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                const data = JSON.parse(script.textContent);
                const items = Array.isArray(data) ? data : [data];
                const anime = items.find(d => d && /TVSeries|Movie|CreativeWork/i.test(d['@type'] || ''));
                if (anime) return anime;
            } catch (e) {}
        }
        return null;
    };

    const KIND_BY_LD_TYPE = { TVSeries: 'tv', Movie: 'movie' };

    window.agGetCurrentEpisode = function () {
        // Новый плеер: Stimulus anime-player-episodes, активная серия помечена .active
        const active = window.agFind('animego', 'episodeActive');
        if (active) return active.dataset.episodeNumber;

        // Старый плеер: <select name="series">
        const sel = window.agFind('animego', 'legacyEpisodeSelect');
        if (sel && sel.options && sel.options[sel.selectedIndex]) {
            return sel.options[sel.selectedIndex].textContent.match(/\d+/)?.[0] || '1';
        }
        return '1';
    };

    // Адрес плеера CVH содержит ID тайтла (/cdn-iframe/52991/...), он совпадает с ID на Shikimori
    const readShikimoriId = () => {
        const source = window.agFind('animego', 'shikimoriIdSource');
        const match = source && (source.dataset.player || source.src || '').match(/\/cdn-iframe\/(\d+)\//);
        return match ? parseInt(match[1], 10) : null;
    };

    window.agGetAnimePageInfo = function () {
        if (!/^\/anime\/[^/]+/.test(location.pathname)) return null;

        const titleEl = window.agFind('animego', 'title');
        const rawTitle = titleEl ? titleEl.innerText.trim() : '';
        const ld = readJsonLd();

        // Раньше h1 имел вид «Русское / English», теперь оригинал лежит в JSON-LD alternateName
        let title = rawTitle.split('/')[0].trim();
        let origTitle = rawTitle.split('/')[1]?.trim() || '';
        if (!origTitle && ld && ld.alternateName) {
            origTitle = Array.isArray(ld.alternateName) ? ld.alternateName[0] : ld.alternateName;
        }
        if (!title && ld && ld.name) title = ld.name;

        const synonyms = window.agFindAll('animego', 'titleSynonyms')
            .map(li => li.innerText.trim()).filter(Boolean);

        const year = ld && ld.datePublished ? String(ld.datePublished).slice(0, 4) : '';
        const kind = ld ? (KIND_BY_LD_TYPE[ld['@type']] || '') : '';
        const pageKey = (location.pathname.match(/\/anime\/([^/]+)/) || [])[1] || location.pathname;

        return {
            pageKey,
            title,
            origTitle: origTitle || title,
            titles: [origTitle, title, ...synonyms].filter(Boolean),
            year,
            kind,
            shikimoriId: readShikimoriId(),
            episode: window.agGetCurrentEpisode()
        };
    };

    // ---------- Кнопка Shikimori + AniSkip ----------

    const sendSkipData = (target, data) => {
        if (!target) return;
        try { target.postMessage({ type: 'AS_DATA_UPDATE', data, malId: cachedMalId }, '*'); } catch (e) {}
    };

    const getPlayerIframeWindow = () => {
        const iframe = window.agFind('animego', 'playerIframe');
        return iframe?.contentWindow || null;
    };

    const injectShikiButton = (anime) => {
        if (document.getElementById('ag-shiki-btn')) return;
        let ratingContainer = window.agFind('animego', 'ratingBlock');
        if (!ratingContainer) {
            const parent = window.agQueryFirst(['.entity__title', '.anime-title', '.entity__sticky']);
            if (!parent) return;
            ratingContainer = document.createElement('div');
            ratingContainer.className = 'entity__rating d-flex align-items-center gap-2 my-2';
            parent.appendChild(ratingContainer);
        }

        const btn = document.createElement('a');
        btn.id = 'ag-shiki-btn';
        btn.href = `https://shikimori.io/animes/${anime.id}`;
        btn.target = '_blank';
        btn.rel = 'noopener';
        btn.className = 'btn d-inline-flex align-items-center';
        btn.style.cssText = 'background-color: #212121; color: white; font-weight: 600; border-radius: 4px; padding: 0 12px; font-size: 13px; height: 32px; text-decoration: none; margin-top: auto; margin-bottom: auto; border: none; transition: opacity 0.2s;';
        btn.onmouseover = () => btn.style.opacity = '0.8';
        btn.onmouseout = () => btn.style.opacity = '1';
        btn.innerText = `Shikimori ★ ${anime.score || '?'}`;
        ratingContainer.appendChild(btn);
    };

    window.agSyncAniSkip = async function (forceSendToWindow = null) {
        const info = window.agGetAnimePageInfo();
        if (!info || info.titles.length === 0) return;
        const currentEp = info.episode;

        if (cachedSkipData && lastFetchedEp === currentEp) {
            sendSkipData(forceSendToWindow || getPlayerIframeWindow(), cachedSkipData);
            return;
        }
        if (skipRequestEp === currentEp) return; // запрос по этой серии уже в полёте
        skipRequestEp = currentEp;

        try {
            const anime = info.shikimoriId ? { id: info.shikimoriId } : await window.agSendMessage({
                action: 'resolve_shikimori_id',
                titles: info.titles,
                year: info.year,
                kind: info.kind
            });
            if (!anime || !anime.id) return;
            cachedMalId = anime.id;

            // Счёт берём из полной карточки (resolve хранит только ID)
            const details = await window.agSendMessage({ action: 'fetch_shikimori', url: `https://shikimori.io/api/animes/${anime.id}` });
            injectShikiButton({ id: anime.id, score: details?.data?.score });

            const res = await fetch(`https://api.aniskip.com/v2/skip-times/${anime.id}/${parseFloat(currentEp)}?types=op&types=ed&episodeLength=0`).then(r => r.json());
            const data = { op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } };
            if (res && res.found) {
                const op = res.results.find(r => r.skipType === 'op');
                const ed = res.results.find(r => r.skipType === 'ed');
                if (op) data.op = { start: op.interval.startTime, end: op.interval.endTime };
                if (ed) data.ed = { start: ed.interval.startTime, end: ed.interval.endTime };
            }

            cachedSkipData = data;
            lastFetchedEp = currentEp;
            sendSkipData(getPlayerIframeWindow(), data);
            if (forceSendToWindow) sendSkipData(forceSendToWindow, data);
        } catch (e) {
            console.error('[Anime+] AniSkip fetch error:', e);
        } finally {
            if (skipRequestEp === currentEp) skipRequestEp = null;
        }
    };

    // ---------- Учёт просмотра ----------

    window.initShikimoriAutoSync = function () {
        if (!window.agInitProgressTracker) return;
        window.agInitProgressTracker({
            site: 'animego',
            // На AnimeGO Kodik открыт в режиме одной серии (/seria/...) и не знает её номер —
            // источник истины — активная серия в плеере сайта
            getEpisode: () => window.agGetCurrentEpisode(),
            getTitleInfo: () => window.agGetAnimePageInfo()
        });
    };
})();
