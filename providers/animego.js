// providers/animego.js
// Провайдер AnimeGO.me: новый плеер на Stimulus (anime-player), серии и озвучка лежат на странице сайта.
// Общее делают features/*. Здесь только сведения о странице и то, что есть лишь на AnimeGO:
// автовыбор озвучки на сайте, страницы тайтлов, которых нет в каталоге, расписание и объединённый поиск.

(function () {
    'use strict';

    const { BaseProvider } = window.AgProviders;

    const EPISODES = '[data-anime-player-episodes-target="episode"][data-episode-number]';
    const VOICES = '[data-anime-player-target="translation"][data-translation]';
    const PLAYERS = '[data-anime-player-target="provider"][data-ptranslation]';
    const MARATHON_KEY = 'ag_active_marathon_id';
    const KIND_BY_LD_TYPE = { TVSeries: 'tv', Movie: 'movie' };

    // В полном экране остаётся только плеер: панель серий сайта и подпись под видео открываются в оболочке
    const FULLSCREEN_CSS = `
        .ag-pfs-active .player-video__online, .ag-pfs-active .player-video, .ag-pfs-active .player-video__main, .ag-pfs-active #video-player {
            width: 100% !important; height: 100% !important; margin: 0 !important; padding: 0 !important;
            max-width: none !important; max-height: none !important; aspect-ratio: auto !important; border-radius: 0 !important; }
        .ag-pfs-active .player-video-bar, .ag-pfs-active .player-video__side, .ag-pfs-active .episode-info { display: none !important; }
    `;

    const items = (selector) => Array.from(document.querySelectorAll(selector));
    const isActive = (el) => el.classList.contains('active');
    const label = (el) => (el.querySelector('.text-truncate') || el).textContent.trim().split('\n')[0].trim();

    const readJsonLd = () => {
        for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
                const data = JSON.parse(script.textContent);
                const list = Array.isArray(data) ? data : [data];
                const anime = list.find(d => d && /TVSeries|Movie|CreativeWork/i.test(d['@type'] || ''));
                if (anime) return anime;
            } catch (e) {}
        }
        return null;
    };

    // Адрес плеера CVH содержит ID тайтла (/cdn-iframe/52991/...), он совпадает с ID на Shikimori
    const readShikimoriId = () => {
        const source = window.agFind('animego', 'shikimoriIdSource');
        const match = source && (source.dataset.player || source.src || '').match(/\/cdn-iframe\/(\d+)\//);
        return match ? parseInt(match[1], 10) : null;
    };

    const isSyntheticPage = () => /^\/anime\/shiki-\d+/.test(location.pathname);
    // Адрес вида /anime/top-250 тоже подходит под шаблон, поэтому страницу тайтла узнаём по её содержимому
    const isTitlePage = () => /^\/anime\/[^/]+-\d+$/.test(location.pathname) && !isSyntheticPage()
        && !!(readJsonLd() || window.agFind('animego', 'ratingBlock'));

    const currentEpisode = () => {
        const active = window.agFind('animego', 'episodeActive');
        if (active) return active.dataset.episodeNumber;
        return '1';
    };

    const pageInfo = () => {
        if (!isTitlePage() && !isSyntheticPage()) return null;
        const titleEl = window.agFind('animego', 'title');
        const rawTitle = titleEl ? titleEl.innerText.trim() : '';
        const ld = readJsonLd();

        // Раньше h1 имел вид «Русское / English», теперь оригинал лежит в JSON-LD alternateName
        let title = rawTitle.split('/')[0].trim();
        let origTitle = rawTitle.split('/')[1]?.trim() || '';
        if (!origTitle && ld && ld.alternateName) {
            origTitle = Array.isArray(ld.alternateName) ? ld.alternateName[0] : ld.alternateName;
        }
        if (!title && ld && ld.name) title = ld.name;
        const synonyms = window.agFindAll('animego', 'titleSynonyms').map(li => li.innerText.trim()).filter(Boolean);

        return {
            pageKey: (location.pathname.match(/\/anime\/([^/]+)/) || [])[1] || location.pathname,
            title,
            origTitle: origTitle || title,
            titles: [origTitle, title, ...synonyms].filter(Boolean),
            year: ld && ld.datePublished ? String(ld.datePublished).slice(0, 4) : '',
            kind: ld ? (KIND_BY_LD_TYPE[ld['@type']] || '') : '',
            shikimoriId: readShikimoriId(),
            episode: currentEpisode()
        };
    };

    // Нужно модулям AnimeGO (ag-synthetic.js)
    window.agGetAnimePageInfo = pageInfo;

    class AnimegoProvider extends BaseProvider {
        isTitlePage() { return isTitlePage(); }

        async getTitleInfo() { return pageInfo(); }

        // Kodik открыт в режиме одной серии и не знает её номер: источник истины — активная серия на странице
        getEpisode() { return currentEpisode(); }

        getPlayerContainer() { return window.agFind('animego', 'playerContainer'); }

        // CVH на AnimeGO открывает Kodik внутри своего кадра: ему команды тоже нужны
        getPlayerWindows() {
            const windows = [];
            const frame = window.agFind('animego', 'playerIframe');
            if (!frame || !frame.contentWindow) return windows;
            windows.push(frame.contentWindow);
            try {
                (frame.contentDocument?.querySelectorAll('iframe') || []).forEach(f => { if (f.contentWindow) windows.push(f.contentWindow); });
            } catch (e) {}
            return windows;
        }

        // Страница Kodik для этой серии и озвучки: у других плееров берём метки с неё
        getKodikUrl() {
            const voice = items(VOICES).find(isActive);
            const kodik = items(PLAYERS).find(p => p.dataset.providerSlug === 'kodik' && (!voice || p.dataset.ptranslation === voice.dataset.translation));
            return kodik ? kodik.dataset.player || null : null;
        }

        // Сначала список серий: стрелки сайта бывают скрыты и меняются, а пункты списка работают всегда
        navigate(dir) {
            const list = items(EPISODES);
            const index = list.findIndex(isActive);
            let target = null;
            if (index !== -1) {
                const episode = list[index + (dir === 'prev' ? -1 : 1)];
                if (!episode) return true; // Дальше серий нет: переключать в плеере нечего
                target = episode.querySelector('button') || episode;
            } else {
                const selectors = window.agSelectors.animego[dir === 'prev' ? 'navPrev' : 'navNext'];
                for (const selector of selectors) {
                    target = Array.from(document.querySelectorAll(selector)).find(b => b.offsetParent !== null);
                    if (target) break;
                }
                target = target || window.agQueryFirst(selectors);
                if (!target) return false;
            }
            if (dir !== 'prev') sessionStorage.setItem(MARATHON_KEY, pageInfo()?.pageKey || location.pathname);
            target.click();
            return true;
        }

        // Озвучку и плеер выбирает ag-voice.js: при смене серии сайт подменяет меню целиком
        selectPreferredPlayer() { return true; }

        async getShellSite() {
            const voice = items(VOICES).find(isActive);
            const key = voice ? voice.dataset.translation : null;
            const heading = document.querySelector('.player__title, h1');
            return {
                title: heading ? heading.textContent.trim() : '',
                episodes: items(EPISODES).map((el, index) => ({
                    index,
                    selected: isActive(el),
                    label: el.dataset.episodeNumber,
                    seen: el.dataset.episodeWatched === 'true',
                    title: el.dataset.episodeNumber
                })),
                voices: items(VOICES).filter(el => !el.classList.contains('player-error')).map(el => ({
                    index: items(VOICES).indexOf(el),
                    selected: isActive(el),
                    title: label(el),
                    type: /субтитр|subtitles/i.test(el.textContent) ? 'subtitles' : 'voice',
                    count: ''
                })),
                players: items(PLAYERS).filter(el => !key || el.dataset.ptranslation === key).map(el => ({
                    index: items(PLAYERS).indexOf(el),
                    selected: isActive(el),
                    title: label(el),
                    slug: el.dataset.providerSlug || ''
                }))
            };
        }

        // Нажимаем кнопки самого сайта, поэтому всё переключается как обычно, без выхода из полного экрана
        async shellPick(kind, index) {
            if (kind === 'episodes') {
                const el = items(EPISODES)[index];
                if (el) (el.querySelector('button') || el).click();
            } else if (kind === 'voices') {
                const el = items(VOICES)[index];
                if (!el) return;
                if (window.agRememberVoice) window.agRememberVoice(label(el));
                const slug = items(PLAYERS).find(isActive)?.dataset.providerSlug;
                el.click();
                // Сайт мог выбрать для этой озвучки другой плеер: остаёмся на плеере зрителя, если он здесь есть
                setTimeout(() => {
                    const forVoice = items(PLAYERS).filter(p => p.dataset.ptranslation === el.dataset.translation);
                    const own = forVoice.find(p => p.dataset.providerSlug === slug) || forVoice.find(p => p.dataset.providerSlug === 'kodik');
                    if (own && !isActive(own)) own.click();
                }, 300);
            } else if (kind === 'players') {
                const el = items(PLAYERS)[index];
                if (!el) return;
                if (window.agRememberPlayer) window.agRememberPlayer(el.dataset.providerSlug);
                el.click();
            }
        }

        getTitleAnchor() { return window.agFind('animego', 'title')?.parentElement || null; }

        getNavAnchor() {
            const menu = window.agFind('animego', 'headerNav');
            if (!menu) return null;
            const link = menu.querySelector('a[href*="/anime/random"]') || menu.querySelector('a[href*="/anime"]');
            return link ? (link.closest('li') || link) : null;
        }

        // В боковом меню пункты — голые ссылки без <li>
        getExtraNavAnchors() {
            const last = document.querySelector('#mmenu .nav.flex-column > a:last-of-type');
            return last ? [last] : [];
        }

        createExtraNavItem() {
            const link = document.createElement('a');
            link.className = 'nav-link fw-semibold text-reset fs-5 ag-top-nav-link';
            link.href = '#ag-top-shikimori';
            link.textContent = 'Топ Shikimori';
            return link;
        }

        beforeTopOpen() {
            const menu = document.getElementById('mmenu');
            if (menu && menu.classList.contains('show')) menu.querySelector('.btn-close')?.click();
        }

        // Тайтла нет в каталоге — страница из данных Shikimori (ag-synthetic.js)
        getTopFallbackUrl(item) { return `/anime/shiki-${item.id}`; }

        mount(scope) {
            if (window.AgProviders.redirectOldTopLink()) return;
            const style = document.createElement('style');
            style.textContent = FULLSCREEN_CSS;
            (document.head || document.documentElement).appendChild(style);
            scope.own(style);

            const settings = this.settings;
            const safeRun = (fn, name) => {
                try {
                    const result = fn();
                    if (result && typeof result.catch === 'function') result.catch(e => console.error(`[Anime+][animego] ${name}:`, e));
                } catch (e) {
                    console.error(`[Anime+][animego] ${name}:`, e);
                }
            };
            const domTasks = () => {
                safeRun(() => window.ensureAgLogoPlus(), 'LogoPlus');
                safeRun(() => window.checkNoVideoAndInjectJutsuButton(), 'NoVideoJutsuButton');
                safeRun(() => window.agInitVoiceAutoSelect(settings), 'VoiceAutoSelect');
                safeRun(() => window.agInitScheduleEnhancer(), 'ScheduleEnhancer');
                safeRun(() => window.agBindPostersIn(document), 'Posters');
            };

            // Страница тайтла вне каталога строит каркас сама: общим функциям он нужен раньше
            scope.timeout(() => {
                safeRun(() => window.renderSyntheticAnimePage(), 'SyntheticAnimePage');
                domTasks();
                scope.observe(domTasks, { root: document.body, wait: 200 });
                safeRun(() => window.agInitJutsuSearchEnhancer(), 'JutsuSearchEnhancer');
            }, 0);

            // Плеер грузится лениво. Страницы вне каталога и «голую» 404 не проверяем: их каркас строит расширение
            scope.timeout(() => {
                if (document.querySelector('.error-page') || isSyntheticPage()) return;
                const types = ['any'];
                if (isTitlePage()) types.push('anime');
                if (window.agFind('animego', 'playerLoaded') && window.agFind('animego', 'playerIframe')) types.push('animePlayerLoaded');
                safeRun(() => window.agCheckSelectorHealth('animego', types), 'SelectorHealth');
            }, 8000);
        }
    }

    window.AgProviders.register('animego', AnimegoProvider);
})();
