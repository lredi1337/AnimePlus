// providers/runtime.js
// Запуск сайта-провайдера: выбор провайдера по hostname (modules/shared/sites.js),
// монтирование фич на каждую страницу и полный демонтаж при SPA-переходе или выключении сайта.

(function () {
    'use strict';

    const FEATURES = ['playerBridge', 'titleWidgets', 'topOverlay', 'searchRedirect', 'settingsEntry', 'randomAnime'];

    window.AgProviders.start = async function () {
        const site = window.AgSites.byHost(location.hostname);
        if (!site || site.legacy) return; // AnimeGO.me / Jut-Su — собственные модули

        let settings = await window.getSettings();
        const Provider = window.AgProviders.registry[site.platform];
        if (!Provider) {
            console.warn(`[Anime+] Нет провайдера для платформы «${site.platform}» (${site.id})`);
            return;
        }

        const provider = new Provider(site, settings);
        let tracker = null;
        let scope = null;
        let mountedKey = null;

        const pageKey = () => location.pathname + location.search;

        const unmount = () => {
            if (scope) scope.dispose();
            scope = null;
            mountedKey = null;
        };

        const mount = () => {
            unmount();
            if (!window.AgSites.isEnabled(settings, site.id)) return;

            scope = new window.AgProviders.Scope();
            mountedKey = pageKey();
            provider.settings = settings;
            provider.mount(scope);

            if (!tracker) {
                tracker = window.agInitProgressTracker({
                    site: site.id,
                    getEpisode: (msgEpisode) => provider.getEpisode(msgEpisode),
                    // Выключенный в popup сайт не отмечает серии, даже если трекер уже подписан на сообщения
                    getTitleInfo: () => (window.AgSites.isEnabled(settings, site.id) ? provider.getTitleInfo() : null)
                });
            }
            tracker.resetTitle();

            const ctx = { provider, scope, site, settings };
            for (const name of FEATURES) {
                try {
                    const result = window.AgFeatures[name](ctx);
                    if (result && typeof result.catch === 'function') {
                        result.catch(e => console.error(`[Anime+][${site.id}] ${name}:`, e));
                    }
                } catch (e) {
                    console.error(`[Anime+][${site.id}] ${name}:`, e);
                }
            }

            // Предпочтительный плеер (Kodik): плеер подгружается асинхронно — ждём не дольше 15 с
            if (provider.isTitlePage() && !provider.selectPreferredPlayer()) {
                const stop = window.agObserveDom(() => { if (provider.selectPreferredPlayer()) stop(); }, { wait: 300 });
                scope.add(stop);
                scope.timeout(stop, 15000);
            }

            // Проверка актуальности вёрстки (баннер в popup, если сайт изменил разметку)
            scope.timeout(() => {
                if (provider.isTitlePage()) window.agCheckSelectorPairs(site.id, provider.requiredSelectors());
            }, 8000);
        };

        mount();

        // SPA (ru.yummyani.me): страница меняется без перезагрузки — перемонтируем при смене адреса
        if (site.spa) {
            window.agOnUrlChange(() => {
                if (pageKey() !== mountedKey) mount();
            });
        }

        // Включение/выключение сайта из popup применяется без перезагрузки вкладки
        chrome.storage.onChanged.addListener(async (changes, area) => {
            if (area !== 'local' || !changes.ag_settings || !window.agIsContextValid()) return;
            const wasEnabled = window.AgSites.isEnabled(settings, site.id);
            settings = await window.getSettings();
            const isEnabled = window.AgSites.isEnabled(settings, site.id);
            if (wasEnabled !== isEnabled) {
                if (isEnabled) mount(); else unmount();
            }
        });

        // Сведения для popup (поиск музыки, заголовок)
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!request) return false;
            if (request.type === 'AG_OPEN_SETTINGS') {
                if (typeof window.agOpenAnimeGoSettingsModal === 'function') {
                    window.agOpenAnimeGoSettingsModal(settings, async (newS) => { settings = newS; }, {
                        brand: site.name || 'YummyAnime',
                        accent: site.color || '#ef4444',
                        getPlayerWindows: () => (provider.getPlayerWindows ? provider.getPlayerWindows() : [])
                    });
                }
                return false;
            }
            if (request.type !== 'AG_GET_PAGE_INFO') return false;
            provider.getTitleInfo()
                .then(info => sendResponse(info
                    ? { title: info.title, origTitle: info.origTitle, episode: provider.getEpisode(), siteId: site.id }
                    : { title: null, origTitle: null, episode: '1', siteId: site.id }))
                .catch(() => sendResponse({ title: null, origTitle: null, episode: '1', siteId: site.id }));
            return true;
        });
    };
})();
