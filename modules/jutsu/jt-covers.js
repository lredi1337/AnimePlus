// modules/jutsu/jt-covers.js
// Модуль замены постеров Jut-Su на стандартные обложки высокого качества (Shikimori / Kitsu)

(function () {
    'use strict';

    window.scrapeCurrentPageCover = function () {
        try {
            const titleEl = document.querySelector('.jutsu-page__title-text h1');
            const imgEl = document.querySelector('.jutsu-page__poster.cd-img img');
            if (titleEl && imgEl) {
                const rawTitle = titleEl.textContent.trim();
                const coverUrl = imgEl.getAttribute('src');
                if (rawTitle && coverUrl) {
                    chrome.storage.local.get(['ag_native_covers'], (res) => {
                        const cache = res.ag_native_covers || {};
                        cache[rawTitle.toLowerCase()] = coverUrl;
                        chrome.storage.local.set({ ag_native_covers: cache });
                    });
                }
            }
        } catch (e) {
            console.error("Error scraping page cover:", e);
        }
    };

    window.replaceCoversWithStandard = async function (settings) {
        if (!settings || !settings.use_standard_covers) return;

        const items = document.querySelectorAll('.jutsu-item, .all_search_content .jutsu-item, .all_search_items .jutsu-item');
        items.forEach(async (item) => {
            if (item.dataset.agCoverReplaced) return;

            const titleLink = item.querySelector('.jutsu-item__title a, a.jutsu-item__title, a');
            const imgEl = item.querySelector('.jutsu-item__image img, img');
            if (!titleLink || !imgEl) return;

            const animeTitle = titleLink.textContent.trim();
            if (!animeTitle) return;

            item.dataset.agCoverReplaced = 'true';

            try {
                const res = await new Promise(resolve => {
                    chrome.runtime.sendMessage({
                        action: "fetch_shikimori",
                        url: `https://shikimori.one/api/animes?search=${encodeURIComponent(animeTitle)}&limit=1`
                    }, resolve);
                });

                const data = res && res.data ? res.data : [];
                if (data.length > 0 && data[0].image && data[0].image.original) {
                    const highResUrl = 'https://shikimori.one' + data[0].image.original;
                    imgEl.src = highResUrl;
                }
            } catch (e) {}
        });
    };
})();
