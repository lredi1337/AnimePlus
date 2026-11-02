// modules/site-selectors.js
// Единый реестр селекторов AnimeGO и Jut-Su + проверка их актуальности.
// Каждый ключ — список вариантов от новой разметки к старой. При обновлении сайта правим только этот файл.
// Проверка (agCheckSelectorHealth) пишет предупреждение в консоль и в storage (ag_selector_health),
// а popup показывает, что разметка сайта изменилась, — о поломке становится известно сразу.

(function () {
    'use strict';

    const SELECTORS = {
        animego: {
            // Страница тайтла
            title: ['.entity__title h1', '.anime-title h1', 'h1.entity__title', 'main h1'],
            titleSynonyms: ['.entity__title-synonyms li'],
            ratingBlock: ['.entity__rating', '.anime-rating', '.media-rating'],
            // Плеер (Stimulus anime-player, ленивая загрузка через anime-player-loader)
            playerContainer: ['.player__video', '#video-player', '.player-video'],
            playerLoaded: ['[data-controller~="anime-player"]', '#video-player iframe'],
            playerIframe: ['[data-anime-player-target="iframeContainer"] iframe', '.player-video__online iframe', '#video-player iframe'],
            episodeItems: ['[data-anime-player-episodes-target="episode"][data-episode-number]'],
            episodeActive: ['[data-anime-player-episodes-target="episode"].active[data-episode-number]', '.player-video-bar__item.active[data-episode-number]'],
            legacyEpisodeSelect: ["select[name='series']"],
            translations: ['[data-anime-player-target="translation"][data-translation]'],
            providers: ['[data-anime-player-target="provider"][data-ptranslation]'],
            navNext: ['.player-video-bar__arrow.next:not([disabled])', '.next.m-ep-arrow:not([disabled])'],
            navPrev: ['.player-video-bar__arrow.prev:not([disabled])', '.prev.m-ep-arrow:not([disabled])'],
            navArrows: ['.player-video-bar__arrow', '.m-ep-arrow'],
            // Каркас сайта
            headerNav: ['header nav.header-navbar-nav', 'header .navbar-nav.header-navbar-nav', 'header .navbar-nav', 'header nav'],
            // На главной нет <main>: содержимое лежит прямо в .wrapper[data-dynamic-content]
            main: ['main.content', 'main', '.wrapper[data-dynamic-content]']
        },
        jutsu: {
            title: ['.jutsu-page__title-text h1', '.title_video', 'h1'],
            originalTitle: ['.jutsu-page__original', '.jutsu-page__title-original', '[class*="title-original"]'],
            info: ['.jutsu-page__info'],
            player: ['#jutsu-page__player', '.jutsu-page__player-video'],
            playerTabs: ['.tabs-block__select'],
            content: ['.jutsu-content', '.jutsu-wrapper__main'],
            navTop100: ['a[href*="/top100/"]']
        }
    };

    // Что обязано находиться на странице данного типа
    const REQUIRED = {
        animego: {
            anime: ['title', 'playerContainer', 'headerNav'],
            // Проверяется, только когда в плеере уже есть видео (у тайтлов без видео нет провайдеров)
            animePlayerLoaded: ['episodeItems', 'translations', 'providers', 'navArrows'],
            any: ['headerNav', 'main']
        },
        jutsu: {
            anime: ['title', 'originalTitle', 'player', 'playerTabs'],
            any: ['content', 'navTop100']
        }
    };

    const selectorString = (site, key) => (SELECTORS[site] && SELECTORS[site][key] || []).join(', ');

    window.agSelectors = SELECTORS;

    window.agFind = function (site, key, root = document) {
        return window.agQueryFirst(SELECTORS[site][key] || [], root);
    };

    window.agFindAll = function (site, key, root = document) {
        const sel = selectorString(site, key);
        return sel ? Array.from(root.querySelectorAll(sel)) : [];
    };

    /**
     * Проверяет обязательные селекторы для типа страницы. Возвращает список ненайденных ключей.
     * Результат пишется в storage только при изменении, чтобы не дёргать хранилище на каждой странице.
     */
    window.agCheckSelectorHealth = async function (site, pageTypes) {
        const missing = [];
        for (const type of pageTypes) {
            for (const key of (REQUIRED[site] && REQUIRED[site][type]) || []) {
                if (!window.agFind(site, key) && !missing.includes(key)) missing.push(key);
            }
        }

        await window.agReportSelectorHealth(site, missing);
        return missing;
    };

    /**
     * Запись результата проверки (общая для старых модулей и сайтов-провайдеров).
     * Пишем в storage только при изменении, чтобы не дёргать хранилище на каждой странице.
     * @param {string} site — id сайта из modules/shared/sites.js
     * @param {string[]} missing — ненайденные ключи
     */
    window.agReportSelectorHealth = async function (site, missing) {
        if (missing.length > 0) {
            console.warn(`[Anime+] ${site}: не найдены элементы разметки (${missing.join(', ')}) на ${location.pathname}. Возможно, сайт обновил вёрстку.`);
        }
        try {
            if (!window.agIsContextValid || !window.agIsContextValid()) return;
            const { ag_selector_health: health = {} } = await chrome.storage.local.get(['ag_selector_health']);
            const prev = health[site];
            if (!prev || prev.missing.join(',') !== missing.join(',')) {
                health[site] = { missing, url: location.href, ts: Date.now() };
                await chrome.storage.local.set({ ag_selector_health: health });
            }
        } catch (e) {}
    };

    /** Проверка набора [[ключ, [селекторы…]], …] — для провайдеров (providers/*.js → requiredSelectors) */
    window.agCheckSelectorPairs = function (site, pairs) {
        const missing = pairs.filter(([, sels]) => !window.agQueryFirst(sels)).map(([key]) => key);
        return window.agReportSelectorHealth(site, missing).then(() => missing);
    };

})();
