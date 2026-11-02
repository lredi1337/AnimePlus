// modules/jutsu/jt-shiki-widget.js
// Модуль виджета рейтингов Shikimori/MAL и синхронизации AniSkip для Jut-Su

(function () {
    'use strict';

    let cachedSkipData = null;
    let cachedMalId = null;
    let lastFetchedEp = null;

    // Сведения о странице тайтла Jut-Su. Оригинальное название теперь в .jutsu-page__original
    window.jtGetAnimePageInfo = function () {
        if (!document.querySelector('#jutsu-page__player, .jutsu-page__player-video, .jutsu-page__poster')) return null;
        const titleEl = window.agFind('jutsu', 'title');
        if (!titleEl) return null;
        const title = titleEl.innerText.trim().replace(/^Смотреть аниме\s+/i, '').replace(/\s+онлайн$/i, '');
        const origEl = window.agFind('jutsu', 'originalTitle');
        const origTitle = origEl ? origEl.innerText.trim() : '';
        const player = document.querySelector('[data-player-anime-id]');
        const pageKey = (player && player.dataset.playerAnimeId) || location.pathname.split('/')[1] || location.pathname;
        // «Статус: Вышел с 3 октября 2020 г. …», «Тип: TV Сериал». В .jutsu-page__meta лежит дата
        // добавления на сайт, а не год выхода — её не трогаем
        const infoText = window.agFind('jutsu', 'info')?.innerText || '';
        const statusLine = infoText.split('\n').find(l => /^(Статус|Выпуск|Год)/i.test(l.trim())) || '';
        const yearMatch = statusLine.match(/\b(19[6-9]\d|20[0-4]\d)\b/);
        const typeLine = (infoText.split('\n').find(l => /^Тип/i.test(l.trim())) || '').toLowerCase();
        const kind = /фильм|movie/.test(typeLine) ? 'movie' : /ova/.test(typeLine) ? 'ova' : /ona/.test(typeLine) ? 'ona' : /tv|сериал/.test(typeLine) ? 'tv' : '';
        return {
            pageKey,
            title,
            origTitle: origTitle || title,
            titles: [origTitle, title].filter(Boolean),
            year: yearMatch ? yearMatch[1] : '',
            kind,
            episode: window.ag_current_episode || '1'
        };
    };

    window.jtSyncAniSkip = async function (episodeNum, forceSendToWindow = null) {
        const titleEl = document.querySelector('.jutsu-page__title-text h1')
            || document.querySelector('h1')
            || document.querySelector('.title_video');
        const currentEp = episodeNum || "1";

        if (forceSendToWindow && cachedSkipData && lastFetchedEp === currentEp) {
            forceSendToWindow.postMessage({ type: 'AS_DATA_UPDATE', data: cachedSkipData, malId: cachedMalId }, '*');
            return;
        }

        if (titleEl && window.agLastEpSkip !== currentEp) {
            window.agLastEpSkip = currentEp;
            const rawTitle = titleEl.innerText.trim();
            const pageInfo = window.jtGetAnimePageInfo();

            try {
                // Общий резолвер ID (названия + год + тип, кэш 30 дней) вместо поиска «первого результата»
                let shiki = [];
                const anime = pageInfo ? await window.agSendMessage({
                    action: 'resolve_shikimori_id',
                    titles: pageInfo.titles,
                    year: pageInfo.year,
                    kind: pageInfo.kind
                }) : null;
                if (anime && anime.id) {
                    const details = await window.agSendMessage({ action: 'fetch_shikimori', url: `https://shikimori.io/api/animes/${anime.id}` });
                    const d = details && details.data;
                    shiki = [{ id: anime.id, url: (d && d.url) || `/animes/${anime.id}`, score: d && d.score }];
                }

                if (shiki.length > 0) {
                    let ratingContainer = document.querySelector('.jutsu-page__ratings');
                    if (!ratingContainer) {
                        const targetParent = document.querySelector('.under_video') || document.querySelector('.jutsu-page__title-text') || document.querySelector('.title_video');
                        if (targetParent) {
                            ratingContainer = document.createElement('div');
                            ratingContainer.className = 'jutsu-page__ratings cd-flex g-2 my-2';
                            targetParent.appendChild(ratingContainer);
                        }
                    }
                    if (ratingContainer) {
                        let shikiBlock = ratingContainer.querySelector('.jutsu-page__ratings-item--shikimori');
                        const shikiUrl = `https://shikimori.io${shiki[0].url}`;
                        const shikiScoreStr = shiki[0].score || '?';

                        if (!shikiBlock) {
                            shikiBlock = document.createElement('a');
                            shikiBlock.id = 'ag-shiki-rating';
                            shikiBlock.href = shikiUrl;
                            shikiBlock.target = '_blank';
                            shikiBlock.className = 'jutsu-page__ratings-item jutsu-page__ratings-item--shikimori flex-grow-1 cd-flex fd-column jc-center';
                            shikiBlock.style.textDecoration = 'none';
                            shikiBlock.innerHTML = `
                                <div class="jutsu-page__ratings-item-count cd-grid-centered">${shikiScoreStr}</div>
                                <div class="jutsu-page__ratings-item-caption">Shikimori</div>
                            `;
                            ratingContainer.insertBefore(shikiBlock, ratingContainer.firstChild);
                        } else if (!shikiBlock.closest('a')) {
                            const linkA = document.createElement('a');
                            linkA.href = shikiUrl;
                            linkA.target = '_blank';
                            linkA.style.textDecoration = 'none';
                            linkA.className = 'flex-grow-1 cd-flex';
                            shikiBlock.parentNode.insertBefore(linkA, shikiBlock);
                            linkA.appendChild(shikiBlock);
                            shikiBlock.style.width = '100%';
                        }

                        const imdbBlock = ratingContainer.querySelector('.jutsu-page__ratings-item--imdb');
                        if (imdbBlock && !imdbBlock.closest('a')) {
                            const imdbUrl = `https://www.imdb.com/find?q=${encodeURIComponent(rawTitle)}&s=tt`;
                            const linkA = document.createElement('a');
                            linkA.href = imdbUrl;
                            linkA.target = '_blank';
                            linkA.style.textDecoration = 'none';
                            linkA.className = 'flex-grow-1 cd-flex';
                            imdbBlock.parentNode.insertBefore(linkA, imdbBlock);
                            linkA.appendChild(imdbBlock);
                            imdbBlock.style.width = '100%';
                        }
                    }

                    const skipResponse = await fetch(`https://api.aniskip.com/v1/skip-times/${shiki[0].id}/${parseInt(currentEp)}?types=op&types=ed`);
                    const skip = await skipResponse.json();
                    let opStart = 0, opEnd = 0, edStart = 0, edEnd = 0;

                    if (skip.statusCode === 200 && skip.results) {
                        const op = skip.results.find(r => r.skipType === 'op');
                        const ed = skip.results.find(r => r.skipType === 'ed');
                        if (op && op.interval) { opStart = op.interval.startTime; opEnd = op.interval.endTime; }
                        if (ed && ed.interval) { edStart = ed.interval.startTime; edEnd = ed.interval.endTime; }
                    }

                    cachedSkipData = { op: { start: opStart, end: opEnd }, ed: { start: edStart, end: edEnd } };
                    cachedMalId = shiki[0].id;
                    lastFetchedEp = currentEp;

                    const iframes = document.querySelectorAll('#jutsu-page__player iframe');
                    iframes.forEach(iframe => {
                        iframe.contentWindow.postMessage({ type: 'AS_DATA_UPDATE', data: cachedSkipData, malId: cachedMalId }, '*');
                    });
                    if (forceSendToWindow) {
                        forceSendToWindow.postMessage({ type: 'AS_DATA_UPDATE', data: cachedSkipData, malId: cachedMalId }, '*');
                    }
                }
            } catch (err) {
                console.error("AnimeGO+ AniSkip Sync Error", err);
            }
        }
    };

    window.initJutsuShikimoriAutoSync = function () {
        if (!window.agInitProgressTracker) return;
        // Раньше серия отмечалась только по событию ended, а автопереход и пропуск эндинга
        // почти никогда не дают видео доиграть до конца. Теперь — 80% просмотра (modules/progress-tracker.js)
        window.agInitProgressTracker({
            site: 'jutsu',
            // На странице «все серии» номер знает только Kodik — берём его из сообщения плеера
            getEpisode: (msgEpisode) => {
                if (msgEpisode && msgEpisode !== '0') window.ag_current_episode = msgEpisode;
                return window.ag_current_episode || '1';
            },
            getTitleInfo: () => window.jtGetAnimePageInfo()
        });
    };
})();
