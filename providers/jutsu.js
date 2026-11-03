// providers/jutsu.js
// Jut-Su: тот же движок DLE, что у семейства providers/dle.js. Отличаются только логотип, блок оценок и пункт меню Топа.

(function () {
    'use strict';

    const DleProvider = window.AgProviders.registry.dle;

    const LOGO_STYLE = 'position: relative !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; width: auto !important; height: 27px !important; padding: 0 10px !important; font-size: 15px !important; font-weight: 800 !important; text-transform: none !important; border-radius: 6px !important;';
    const PLUS_STYLE = "position: absolute !important; top: -7px !important; right: -7px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; width: 14px !important; height: 14px !important; font-size: 11px !important; font-weight: 900 !important; color: #ffffff !important; background: linear-gradient(135deg, #e91e63 0%, #9c27b0 100%) !important; border-radius: 4px !important; box-shadow: 0 0 6px rgba(233, 30, 99, 0.4) !important; line-height: 1 !important; font-family: 'Inter', -apple-system, sans-serif !important; border: none !important; padding: 0 0 1px 0 !important; margin: 0 !important;";

    function customizeLogo() {
        const span = document.querySelector('.jutsu-header__logo.logo span');
        if (!span) return;
        const first = span.childNodes[0];
        if (first && first.nodeType === Node.TEXT_NODE) {
            if (first.textContent !== '.net') first.textContent = '.net';
        } else if (span.textContent !== '.net' && !span.querySelector('#ag-logo-plus')) {
            span.textContent = '.net';
        }
        span.style.cssText = LOGO_STYLE;
        if (!document.getElementById('ag-logo-plus')) {
            const plus = document.createElement('span');
            plus.id = 'ag-logo-plus';
            plus.textContent = '+';
            plus.style.cssText = PLUS_STYLE;
            span.appendChild(plus);
        }
    }

    const wrapInLink = (block, href) => {
        if (!block || block.closest('a')) return;
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener';
        link.style.textDecoration = 'none';
        link.className = 'flex-grow-1 cd-flex';
        block.parentNode.insertBefore(link, block);
        link.appendChild(block);
        block.style.width = '100%';
    };

    class JutsuProvider extends DleProvider {
        // Оценка Shikimori уже есть в блоке оценок сайта: отдельная кнопка рядом с названием не нужна
        get showsShikimoriRating() { return !!document.querySelector('.jutsu-page__ratings-item--shikimori'); }

        getNavAnchor() {
            const link = document.querySelector('a[href*="/top100/"]');
            return link ? (link.closest('li') || link) : null;
        }

        getExtraNavAnchors() { return []; }

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

        // Делаем оценки сайта ссылками на Shikimori и IMDb
        async linkRatings(scope) {
            const info = await this.getTitleInfo();
            if (!info || scope.disposed) return;
            let id = info.shikimoriId;
            if (!id) {
                const resolved = await window.agSendMessage({ action: 'resolve_shikimori_id', titles: info.titles, year: info.year, kind: info.kind });
                id = resolved && resolved.id;
            }
            if (scope.disposed) return;
            if (id) wrapInLink(document.querySelector('.jutsu-page__ratings-item--shikimori'), `https://shikimori.io/animes/${id}`);
            wrapInLink(document.querySelector('.jutsu-page__ratings-item--imdb'), `https://www.imdb.com/find?q=${encodeURIComponent(info.title)}&s=tt`);
        }

        mount(scope) {
            if (window.AgProviders.redirectOldTopLink()) return;
            super.mount(scope);
            customizeLogo();
            scope.observe(customizeLogo, { root: document.body, wait: 200 });
            if (this.isTitlePage()) this.linkRatings(scope).catch(e => console.error('[Anime+][jutsu] ratings:', e));
            // На страницах без плеера requiredSelectors не проверяются, а каркас сайта всё равно мог измениться
            scope.timeout(() => {
                if (!/не найдена/i.test(document.title)) window.agCheckSelectorHealth('jutsu', ['any']);
            }, 5000);
        }
    }

    window.AgProviders.register('jutsu', JutsuProvider);
})();
