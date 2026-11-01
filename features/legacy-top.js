// features/legacy-top.js
// Общее окно «Топ Shikimori» (features/top-overlay.js) для сайтов на собственных модулях: AnimeGO.me и Jut-Su.
// Здесь только то, чем эти сайты отличаются: где в меню стоит пункт и что открыть, если тайтла нет на сайте.

(function () {
    'use strict';

    const ADAPTERS = {
        animego: {
            getTopMenuSample: () => null,
            getNavAnchor() {
                const menu = window.agFind('animego', 'headerNav');
                if (!menu) return null;
                const link = menu.querySelector('a[href*="/anime/random"]') || menu.querySelector('a[href*="/anime"]');
                return link ? (link.closest('li') || link) : null;
            },
            // В боковом меню пункты — голые ссылки без <li>
            getExtraNavAnchors() {
                const last = document.querySelector('#mmenu .nav.flex-column > a:last-of-type');
                return last ? [last] : [];
            },
            createExtraNavItem() {
                const link = document.createElement('a');
                link.className = 'nav-link fw-semibold text-reset fs-5 ag-top-nav-link';
                link.href = '#ag-top-shikimori';
                link.textContent = 'Топ Shikimori';
                return link;
            },
            beforeTopOpen() {
                const mmenu = document.getElementById('mmenu');
                if (mmenu && mmenu.classList.contains('show')) mmenu.querySelector('.btn-close')?.click();
            },
            // Тайтла нет в каталоге — синтетическая страница (ag-synthetic.js)
            getTopFallbackUrl: (item) => `/anime/shiki-${item.id}`
        },
        jutsu: {
            getTopMenuSample: () => null,
            getNavAnchor() {
                const link = document.querySelector('a[href*="/top100/"]');
                return link ? (link.closest('li') || link) : null;
            },
            getExtraNavAnchors: () => []
        }
    };

    /** Раньше у этих сайтов был свой адрес Топа: старые ссылки ведут в общее окно */
    const redirectOldLink = () => {
        const params = new URLSearchParams(location.search);
        if (location.pathname !== '/top-shikimori' && !params.has('show_ag_top')) return false;
        location.replace('/#ag-top-shikimori');
        return true;
    };

    window.agMountLegacyTop = function (siteId, settings) {
        if (redirectOldLink()) return;
        const site = window.AgSites.byId(siteId);
        window.AgFeatures.topOverlay({
            provider: ADAPTERS[siteId],
            scope: new window.AgProviders.Scope(),
            site,
            settings
        });
    };
})();
