// features/search-redirect.js
// Автопереход со страницы поиска на страницу тайтла, если поиск открыло само расширение
// (параметры ag_from / ag_russian / ag_name). Обычный поиск пользователя не трогается.
// Общая версия логики Jut-Su (modules/jutsu/jt-top.js → handleJutsuSearch) для сайтов-провайдеров.

(function () {
    'use strict';

    window.AgFeatures = window.AgFeatures || {};

    window.AgFeatures.searchRedirect = async function ({ provider, scope }) {
        if (!provider.isSearchPage()) return;
        const params = new URLSearchParams(location.search);
        const query = params.get('story') || params.get('q');
        if (!query) return;
        if (!(params.has('ag_from') || params.has('ag_russian') || params.has('ag_name'))) return;

        const lockKey = `ag_search_redirect_${location.host}_${query}`;
        if (sessionStorage.getItem(lockKey)) return; // назад со страницы тайтла — не зацикливаемся

        // Выдача может догружаться — даём ей до 5 секунд
        let cards = provider.collectSearchCards();
        for (let i = 0; i < 10 && cards.length === 0 && !scope.disposed; i++) {
            await new Promise(r => setTimeout(r, 500));
            cards = provider.collectSearchCards();
        }
        if (scope.disposed || cards.length === 0) return;

        const titles = [params.get('ag_russian'), params.get('ag_name'), query].filter(Boolean);
        const best = window.AgTitleMatch.pickBest(cards, { titles, year: params.get('ag_year') || '' }, { minScore: 250 });
        if (best) {
            sessionStorage.setItem(lockKey, '1');
            location.replace(best.href);
        }
    };
})();
