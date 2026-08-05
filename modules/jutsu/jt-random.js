// modules/jutsu/jt-random.js
// Модуль кнопки «Случайное аниме» для Jut-Su

(function () {
    'use strict';

    window.jtInitRandomAnimeButton = function () {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href*="/random"], a[href*="/random/"], .header_random_btn, #ag-random-anime-btn, .js-random-anime');
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

                if (res && res.jutsuUrl) {
                    window.location.href = res.jutsuUrl;
                } else if (res && (res.russian || res.name)) {
                    const queryStr = res.russian || res.name;
                    window.location.href = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(queryStr)}`;
                } else if (res && res.url) {
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
