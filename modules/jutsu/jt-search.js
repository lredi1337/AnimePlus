// modules/jutsu/jt-search.js
// Автопереход на тайтл со страницы поиска Jut-Su. Топ Shikimori — общее окно, features/top-overlay.js

(function () {
    'use strict';

    window.handleRankIndexFallback = async function () {
        if (!window.location.search.includes('ag_rank=')) return;

        const urlParams = new URLSearchParams(window.location.search);
        const targetRank = parseInt(urlParams.get('ag_rank'));
        if (!targetRank || isNaN(targetRank)) return;

        const targetKind = urlParams.get('ag_kind') || '';
        const fallbackQuery = urlParams.get('ag_query') || '';

        const lockKey = `ag_rank_opened_${targetKind}_${targetRank}`;
        if (sessionStorage.getItem(lockKey)) return;
        sessionStorage.setItem(lockKey, '1');

        try {
            const shikiPage = Math.ceil(targetRank / 50);
            const indexInPage = (targetRank - 1) % 50;

            let kindParam = '';
            if (targetKind && targetKind !== 'all') {
                kindParam = `&kind=${targetKind}`;
            }

            const shikiUrl = `https://shikimori.io/api/animes?limit=50&order=ranked&page=${shikiPage}${kindParam}`;

            const shikiRes = await new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: "fetch_shikimori",
                    url: shikiUrl
                }, resolve);
            });

            const data = shikiRes && shikiRes.data ? shikiRes.data : [];
            const targetItem = data[indexInPage];

            let queryTitle = fallbackQuery;

            if (targetItem) {
                queryTitle = (targetItem.russian || targetItem.name || fallbackQuery).split('/')[0].split('[')[0].trim();
            }

            const form = new FormData();
            form.append('do', 'search');
            form.append('subaction', 'search');
            form.append('story', queryTitle);

            const searchRes = await fetch('/index.php?do=search', { method: 'POST', body: form });
            const text = await searchRes.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const results = Array.from(doc.querySelectorAll('.jutsu-item'));
            let bestMatchUrl = null;

            if (results.length > 0) {
                const resLink = results[0].querySelector('.jutsu-item__title a, a.jutsu-item__title') || results[0].querySelector('a');
                if (resLink) bestMatchUrl = resLink.href;
            }

            if (bestMatchUrl) {
                window.location.href = bestMatchUrl;
            } else {
                window.location.href = `/?do=search&subaction=search&story=${encodeURIComponent(queryTitle)}&ag_from=animeplus`;
            }
        } catch (err) {
            console.error("Error processing Shikimori index N fallback", err);
        }
    };

    // Автопереход со страницы поиска Jut-Su на страницу тайтла, если поиск открыло само расширение
    // (параметры ag_from / ag_russian). Раньше переход срабатывал только при ровно одном блоке выдачи,
    // а Jut-Su выводит каждую карточку дважды — переход не происходил никогда.
    window.handleJutsuSearch = async function () {
        const urlParams = new URLSearchParams(window.location.search);
        const searchQuery = urlParams.get('story') || urlParams.get('q');
        if (!searchQuery) return;

        const fromExtension = urlParams.has('ag_from') || urlParams.has('ag_russian') || urlParams.has('ag_name');
        if (!fromExtension) return; // обычный поиск пользователя не трогаем

        // Защита от зацикливания при возврате кнопкой «Назад»
        const lockKey = `ag_search_redirect_${searchQuery}`;
        if (sessionStorage.getItem(lockKey)) return;

        const titles = [urlParams.get('ag_russian'), urlParams.get('ag_name'), searchQuery].filter(Boolean);
        const targetYear = urlParams.get('ag_year') || '';

        const collectCards = () => {
            const cards = new Map();
            document.querySelectorAll('.jutsu-item').forEach(item => {
                const link = item.querySelector('a.jutsu-item__title, .jutsu-item__title a, a[href$=".html"]');
                const href = link && link.getAttribute('href');
                if (!href || !/\.html$/.test(href) || /do=search|subaction=/.test(href)) return;
                const abs = new URL(href, location.origin).href;
                if (cards.has(abs)) return; // дубликаты карточек (две сетки в разметке)
                cards.set(abs, {
                    href: abs,
                    title: link.textContent.trim(),
                    year: (item.querySelector('.jutsu-item__subtitle')?.textContent.match(/\d{4}/) || [''])[0]
                });
            });
            return [...cards.values()];
        };

        const cards = collectCards();
        if (cards.length === 0) return;

        // Общая логика сравнения названий (modules/shared/title-match.js): текст, сезон, год
        const best = window.AgTitleMatch.pickBest(cards, { titles, year: targetYear }, { minScore: 250 });
        if (best) {
            sessionStorage.setItem(lockKey, '1');
            window.location.replace(best.href);
        }
    };
})();
