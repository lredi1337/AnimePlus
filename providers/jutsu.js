// providers/jutsu.js
// Jut-Su: тот же движок DLE, что у семейства providers/dle.js. Отличаются поиск, случайный тайтл и проверка вёрстки.

(function () {
    'use strict';

    const DleProvider = window.AgProviders.registry.dle;

    class JutsuProvider extends DleProvider {
        // Год лежит в подзаголовке карточки .jutsu-item, а ссылка на тайтл сама похожа на карточку.
        // Каждая карточка выводится дважды: для двух сеток в разметке
        collectSearchCards() {
            const cards = new Map();
            document.querySelectorAll('.jutsu-item').forEach(item => {
                const link = item.querySelector('a.jutsu-item__title, .jutsu-item__title a, a[href$=".html"]');
                const href = link && link.getAttribute('href');
                if (!href || !/\.html$/.test(href) || /do=search|subaction=/.test(href)) return;
                const abs = new URL(href, location.origin).href;
                if (cards.has(abs)) return;
                cards.set(abs, {
                    href: abs,
                    title: link.textContent.trim(),
                    year: (item.querySelector('.jutsu-item__subtitle')?.textContent.match(/\d{4}/) || [''])[0]
                });
            });
            return [...cards.values()];
        }

        // Для Jut-Su фон ищет свой адрес отдельно, а обычный url ведёт в каталог AnimeGO
        getRandomUrl(res) {
            if (res.jutsuUrl) return res.jutsuUrl;
            const title = res.russian || res.name;
            if (title) return `/?do=search&subaction=search&story=${encodeURIComponent(title)}&ag_from=animeplus`;
            return res.url || null;
        }

        mount(scope) {
            if (window.AgProviders.redirectOldTopLink()) return;
            super.mount(scope);
            // На страницах без плеера requiredSelectors не проверяются, а каркас сайта всё равно мог измениться
            scope.timeout(() => {
                if (!/не найдена/i.test(document.title)) window.agCheckSelectorHealth('jutsu', ['any']);
            }, 5000);
        }
    }

    window.AgProviders.register('jutsu', JutsuProvider);
})();
