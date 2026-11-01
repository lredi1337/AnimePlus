// features/random-anime.js
// Перехват кнопки «Случайное аниме» на сайтах-провайдерах.
// Учитывает настройки Anime+ (минимальный рейтинг, типы тайтлов).
// Запрашивает случайный тайтл через background get_random_shikimori_anime с siteId текущего сайта,
// находит страницу тайтла на этом же сайте и переходит на неё.

(function () {
    'use strict';

    window.AgFeatures = window.AgFeatures || {};

    const isRandomLink = (el) => {
        if (!el || typeof el.getAttribute !== 'function') return false;
        const hotkey = el.getAttribute('data-hotkey-id') || '';
        if (hotkey.toLowerCase() === 'random') return true;
        const href = el.getAttribute('href') || '';
        if (/^\/catalog\/random\b/i.test(href) || /(?:^|\/)random(?:\/|$|\?)/i.test(href) || /do=random/i.test(href)) return true;
        if (el.classList && (el.classList.contains('js-random-anime') || el.classList.contains('header_random_btn'))) return true;
        return false;
    };

    window.AgFeatures.randomAnime = function ({ scope, site }) {
        let isBusy = false;

        scope.listen(document, 'click', (e) => {
            const link = e.target && e.target.closest && (
                e.target.closest('a[data-hotkey-id="random"], a[href*="/catalog/random"], a[href*="random"], .js-random-anime, .header_random_btn')
            );
            if (!link || !isRandomLink(link)) return;

            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === 'function') {
                e.stopImmediatePropagation();
            }

            if (isBusy) return;
            isBusy = true;

            const labelEl = link.querySelector('span, .fP') || link;
            const originalText = labelEl.textContent;
            labelEl.textContent = '⌛ Подбираем…';
            const prevPointerEvents = link.style.pointerEvents;
            link.style.pointerEvents = 'none';

            const restore = () => {
                isBusy = false;
                labelEl.textContent = originalText;
                link.style.pointerEvents = prevPointerEvents;
            };

            const msg = {
                action: 'get_random_shikimori_anime',
                siteId: site.id,
                currentUrl: location.href
            };

            const send = window.agSendMessage || ((m) => new Promise(res => chrome.runtime.sendMessage(m, res)));

            Promise.resolve(send(msg))
                .then(res => {
                    if (res && res.url) {
                        if (typeof window.agNavigateTo === 'function') {
                            window.agNavigateTo(res.url);
                        } else {
                            location.href = res.url;
                        }
                        setTimeout(restore, 4000);
                    } else {
                        restore();
                        if (res && res.reason === 'no_match') {
                            alert(`Не удалось найти аниме по выбранным критериям (Мин. рейтинг: ${res.minScore || 'любой'}). Попробуйте изменить настройки.`);
                        } else {
                            alert('Не удалось подобрать случайное аниме на этом сайте. Попробуйте еще раз.');
                        }
                    }
                })
                .catch(err => {
                    console.error('[Anime+] Ошибка случайного аниме:', err);
                    restore();
                    alert('Ошибка при подборе случайного аниме. Попробуйте еще раз.');
                });
        }, true);
    };
})();
