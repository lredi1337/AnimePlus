// modules/jutsu/jt-shiki-widget.js
// Модуль виджета рейтингов Shikimori/MAL и синхронизации AniSkip для Jut-Su

(function () {
    'use strict';

    let cachedSkipData = null;
    let lastFetchedEp = null;

    function simplifyTitle(title) {
        if (!title) return null;
        let simple = title.split(/[:\-—]/)[0].trim();
        if (simple && simple !== title) {
            return simple;
        }
        return null;
    }

    window.jtSyncAniSkip = async function (episodeNum, forceSendToWindow = null) {
        const titleEl = document.querySelector('.jutsu-page__title-text h1')
            || document.querySelector('h1')
            || document.querySelector('.title_video');
        const currentEp = episodeNum || "1";

        if (forceSendToWindow && cachedSkipData && lastFetchedEp === currentEp) {
            forceSendToWindow.postMessage({ type: 'AS_DATA_UPDATE', data: cachedSkipData }, '*');
            return;
        }

        if (titleEl && window.agLastEpSkip !== currentEp) {
            window.agLastEpSkip = currentEp;
            const rawTitle = titleEl.innerText.trim();
            const origTitleEl = document.querySelector('.jutsu-page__title-original') 
                || document.querySelector('[class*="title-original"]')
                || document.querySelector('.jutsu-page__title-text span');
            const origTitle = origTitleEl ? origTitleEl.innerText.trim() : null;

            try {
                let shiki = [];
                const searchTitles = [];
                if (origTitle) searchTitles.push(origTitle);
                if (rawTitle) searchTitles.push(rawTitle);

                const simpleOrig = simplifyTitle(origTitle);
                if (simpleOrig && !searchTitles.includes(simpleOrig)) searchTitles.push(simpleOrig);

                const simpleRaw = simplifyTitle(rawTitle);
                if (simpleRaw && !searchTitles.includes(simpleRaw)) searchTitles.push(simpleRaw);

                for (const searchTitle of searchTitles) {
                    const shikiResponse = await new Promise((resolve) => {
                        chrome.runtime.sendMessage({
                            action: "fetch_shikimori",
                            url: `https://shikimori.one/api/animes?search=${encodeURIComponent(searchTitle)}&limit=1`
                        }, resolve);
                    });
                    const data = shikiResponse && shikiResponse.data ? shikiResponse.data : [];
                    if (data.length > 0) {
                        shiki = data;
                        break;
                    }
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
                        const shikiUrl = `https://shikimori.one${shiki[0].url}`;
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
                    lastFetchedEp = currentEp;

                    const iframes = document.querySelectorAll('#jutsu-page__player iframe');
                    iframes.forEach(iframe => {
                        iframe.contentWindow.postMessage({ type: 'AS_DATA_UPDATE', data: cachedSkipData }, '*');
                    });
                    if (forceSendToWindow) {
                        forceSendToWindow.postMessage({ type: 'AS_DATA_UPDATE', data: cachedSkipData }, '*');
                    }
                }
            } catch (err) {
                console.error("AnimeGO+ AniSkip Sync Error", err);
            }
        }
    };

    window.initJutsuShikimoriAutoSync = function () {
        window.addEventListener('message', (e) => {
            if (!e.data) return;
            const msgEp = parseInt(e.data.episode) || 1;
            if (e.data.type === 'AG_VIDEO_PROGRESS' && e.data.isEnded === true) {
                chrome.storage.local.get(['ag_settings'], (res) => {
                    const settings = res.ag_settings || {};
                    if (!settings.shiki_enabled) return;

                    const titleEl = document.querySelector('.jutsu-page__title-text h1, h1');
                    const searchTitle = titleEl ? titleEl.innerText.trim() : '';
                    if (!searchTitle) return;

                    chrome.runtime.sendMessage({
                        action: "fetch_shikimori",
                        url: `https://shikimori.one/api/animes?search=${encodeURIComponent(searchTitle)}&limit=1`
                    }, (shikiRes) => {
                        const list = shikiRes && shikiRes.data ? shikiRes.data : [];
                        if (list.length > 0) {
                            chrome.runtime.sendMessage({
                                action: "shiki_sync_progress",
                                shikimoriId: list[0].id,
                                episode: msgEp,
                                totalEpisodes: list[0].episodes || 0,
                                status: 'completed'
                            });
                        }
                    });
                });
            }
        });
    };
})();
