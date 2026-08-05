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

    window.agSyncAniSkip = async function (forceSendToWindow = null) {
        const titleEl = document.querySelector('.entity__title h1')
            || document.querySelector('.anime-title h1')
            || document.querySelector('h1.entity__title')
            || document.querySelector('h1');
        const sel = document.querySelector("select[name='series']");
        const currentEp = (sel && sel.options && sel.options[sel.selectedIndex])
            ? sel.options[sel.selectedIndex].textContent.match(/\d+/)?.[0]
            : "1";

        if (forceSendToWindow && cachedSkipData && lastFetchedEp === currentEp) {
            forceSendToWindow.postMessage({ type: 'AS_DATA_UPDATE', data: cachedSkipData }, '*');
            return;
        }

        if (titleEl && window.agLastEpSkip !== currentEp) {
            window.agLastEpSkip = currentEp;
            const russianTitle = titleEl.innerText.split('/')[0].trim();
            const englishTitle = titleEl.innerText.split('/')[1]?.trim();
            try {
                let shiki = [];
                const searchTitles = [];
                if (englishTitle) searchTitles.push(englishTitle);
                if (russianTitle) searchTitles.push(russianTitle);

                const simpleEng = simplifyTitle(englishTitle);
                if (simpleEng && !searchTitles.includes(simpleEng)) searchTitles.push(simpleEng);

                const simpleRus = simplifyTitle(russianTitle);
                if (simpleRus && !searchTitles.includes(simpleRus)) searchTitles.push(simpleRus);

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
                    let ratingContainer = document.querySelector('.entity__rating') || document.querySelector('.anime-rating') || document.querySelector('.media-rating');
                    if (!ratingContainer) {
                        const parent = document.querySelector('.entity__title') || document.querySelector('.anime-title') || document.querySelector('.entity__sticky');
                        if (parent) {
                            ratingContainer = document.createElement('div');
                            ratingContainer.className = 'entity__rating d-flex align-items-center gap-2 my-2';
                            parent.appendChild(ratingContainer);
                        }
                    }
                    if (ratingContainer && !document.getElementById('ag-shiki-btn')) {
                        const shikiUrl = `https://shikimori.one${shiki[0].url}`;

                        const createBtn = (id, text, url, bgColor) => {
                            const btn = document.createElement('a');
                            btn.id = id;
                            btn.href = url;
                            btn.target = '_blank';
                            btn.className = 'btn d-inline-flex align-items-center';
                            btn.style.cssText = `background-color: ${bgColor}; color: white; font-weight: 600; border-radius: 4px; padding: 0 12px; font-size: 13px; height: 32px; text-decoration: none; margin-top: auto; margin-bottom: auto; border: none; transition: opacity 0.2s;`;
                            btn.onmouseover = () => btn.style.opacity = '0.8';
                            btn.onmouseout = () => btn.style.opacity = '1';
                            btn.innerText = text;
                            return btn;
                        };

                        ratingContainer.appendChild(createBtn('ag-shiki-btn', `Shikimori ★ ${shiki[0].score || '?'}`, shikiUrl, '#212121'));
                    }

                    const res = await fetch(`https://api.aniskip.com/v2/skip-times/${shiki[0].id}/${parseFloat(currentEp)}?types=op&types=ed&episodeLength=0`).then(r => r.json());
                    const data = { op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } };

                    if (res.found) {
                        const op = res.results.find(r => r.skipType === 'op');
                        const ed = res.results.find(r => r.skipType === 'ed');
                        if (op) data.op = { start: op.interval.startTime, end: op.interval.endTime };
                        if (ed) data.ed = { start: ed.interval.startTime, end: ed.interval.endTime };
                    }

                    cachedSkipData = data;
                    lastFetchedEp = currentEp;

                    const iframe = document.querySelector('iframe');
                    if (iframe?.contentWindow) {
                        iframe.contentWindow.postMessage({ type: 'AS_DATA_UPDATE', data }, '*');
                    }
                    if (forceSendToWindow) {
                        forceSendToWindow.postMessage({ type: 'AS_DATA_UPDATE', data }, '*');
                    }
                }
            } catch (e) {
                console.error('[Anime+] AniSkip fetch error:', e);
            }
        }
    };

    window.initShikimoriAutoSync = function () {
        window.addEventListener('message', (e) => {
            if (!e.data) return;
            if (e.data.type === 'AG_VIDEO_PROGRESS') {
                const epNum = parseInt(e.data.episode) || 1;
                const isCompleted = e.data.isEnded === true;
                
                chrome.storage.local.get(['ag_settings'], (res) => {
                    const settings = res.ag_settings || {};
                    if (!settings.shiki_enabled) return;

                    const titleEl = document.querySelector('.entity__title h1') || document.querySelector('h1');
                    const searchTitle = titleEl ? titleEl.innerText.split('/')[0].trim() : '';
                    if (!searchTitle) return;

                    chrome.runtime.sendMessage({
                        action: "fetch_shikimori",
                        url: `https://shikimori.one/api/animes?search=${encodeURIComponent(searchTitle)}&limit=1`
                    }, (shikiRes) => {
                        const list = shikiRes && shikiRes.data ? shikiRes.data : [];
                        if (list.length > 0) {
                            const animeId = list[0].id;
                            chrome.runtime.sendMessage({
                                action: "shiki_sync_progress",
                                shikimoriId: animeId,
                                episode: epNum,
                                totalEpisodes: list[0].episodes || 0,
                                status: isCompleted ? 'completed' : 'watching'
                            });
                        }
                    });
                });
            }
        });
    };
})();
