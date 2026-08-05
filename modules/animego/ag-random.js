// modules/animego/ag-random.js
// Модуль кнопки «Случайное аниме» для AnimeGO

(function () {
    'use strict';

    window.agInitRandomAnimeButton = function () {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href*="/anime/random"], .js-random-anime, a[href*="random"]');
            if (!link) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const originalText = link.textContent;
            link.textContent = "⌛ Подбираем...";
            link.style.pointerEvents = "none";

            chrome.runtime.sendMessage({ action: "get_random_shikimori_anime" }, (res) => {
                link.textContent = originalText;
                link.style.pointerEvents = "auto";
                if (res && res.url) {
                    window.location.href = res.url;
                } else {
                    if (res && res.reason === 'no_match') {
                        alert(`Не удалось найти аниме по выбранным критериям (Мин. рейтинг: ${res.minScore || '6.0'}). Попробуйте изменить настройки.`);
                    } else {
                        alert('Ошибка при подборе случайного аниме. Попробуйте еще раз.');
                    }
                }
            });
        }, true);
    };
})();
