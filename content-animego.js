(async function () {
    'use strict';
    const { isValidOrigin, getSettings } = window;
    let settings = await getSettings();

    if (settings.global_enabled === false) return;
    // Переключатель сайта в popup (modules/shared/sites.js)
    if (window.AgSites && !window.AgSites.isEnabled(settings, 'animego')) return;

    // ==========================================
    // --- ЛОГИКА ANIMEGO (Сайт) ---
    // ==========================================

    const ensureAgLogoPlus = window.ensureAgLogoPlus || function () {};
    ensureAgLogoPlus();

    const getAnimeId = () => {
        const match = window.location.pathname.match(/\/anime\/([^\/]+)/);
        return match ? match[1] : null;
    };

    // Эпизоды нового плеера (Stimulus anime-player-episodes) и старого <select>
    const getEpisodeNeighbours = () => {
        const items = window.agFindAll('animego', 'episodeItems');
        const idx = items.findIndex(el => el.classList.contains('active'));
        if (idx !== -1) {
            const label = (el) => el ? `${el.dataset.episodeNumber} серия` : '';
            return { prev: label(items[idx - 1]), current: label(items[idx]), next: label(items[idx + 1]) };
        }
        const sel = document.querySelector("select[name='series']");
        if (sel) {
            const i = sel.selectedIndex;
            return {
                prev: sel.options[i - 1]?.textContent || '',
                current: sel.options[i]?.textContent || '',
                next: sel.options[i + 1]?.textContent || ''
            };
        }
        return { prev: '', current: '', next: '' };
    };

    const NAV_SELECTORS = {
        next: window.agSelectors.animego.navNext,
        prev: window.agSelectors.animego.navPrev
    };

    // Видимая стрелка (у AnimeGO есть отдельные стрелки для мобильной и десктопной вёрстки)
    const findNavButton = (dir) => {
        for (const sel of NAV_SELECTORS[dir]) {
            const btn = Array.from(document.querySelectorAll(sel)).find(b => b.offsetParent !== null);
            if (btn) return btn;
        }
        return window.agQueryFirst(NAV_SELECTORS[dir]);
    };

    const getPlayerContainer = () => window.agFind('animego', 'playerContainer');

    const syncAniSkip = window.agSyncAniSkip;
    const { setPseudoFS, checkMarathon } = window.agInitPlayerControls
        ? window.agInitPlayerControls(settings, getAnimeId)
        : { setPseudoFS: () => {}, checkMarathon: () => false };

    window.addEventListener('message', (e) => {
        if (!e.data || typeof e.data.type !== 'string' || !e.data.type.startsWith('AG_')) return;

        // Доверяем либо проверенным доменам плееров, либо окну iframe текущего плеера
        const fromPlayerFrame = Array.from(document.querySelectorAll('iframe')).some(f => f.contentWindow === e.source);
        if (!fromPlayerFrame && !isValidOrigin(e.origin)) return;

        if (e.data.type === 'AG_PLAYER_READY' || e.data.type === 'AG_GET_DATA') {
            if (checkMarathon()) e.source.postMessage({ type: 'AG_MARATHON_CONFIRM' }, '*');
            const ep = getEpisodeNeighbours();
            const animeName = document.title.split(' — ')[0];
            e.source.postMessage({
                type: 'AG_DATA',
                prevTitle: ep.prev,
                nextTitle: ep.next,
                currentTitle: ep.current ? `${ep.current} - ${animeName}` : document.title
            }, '*');
            if (syncAniSkip) syncAniSkip(e.source);
            const container = getPlayerContainer();
            const isFs = container ? container.classList.contains('ag-pseudo-fs-active') : false;
            e.source.postMessage({ type: 'AG_FS_STATE', active: isFs }, '*');
        }
        if (e.data.type === 'AG_START_MARATHON') {
            const currentId = getAnimeId();
            if (currentId) sessionStorage.setItem('ag_active_marathon_id', currentId);
            if (settings.autoFS) {
                setTimeout(() => { setPseudoFS('enable', e.source); }, 300);
            }
        }
        if (e.data.type === 'AG_PSEUDO_FS') setPseudoFS(e.data.action, e.source);

        if (e.data.type === 'AG_NAV') {
            const btn = findNavButton(e.data.dir === 'next' ? 'next' : 'prev');
            if (btn) {
                if (e.data.dir === 'next') {
                    const currentId = getAnimeId();
                    if (currentId) sessionStorage.setItem('ag_active_marathon_id', currentId);
                }
                btn.click();
            }
        }
    });

    const openSettingsModal = async () => {
        settings = await getSettings();
        if (window.agOpenAnimeGoSettingsModal) {
            window.agOpenAnimeGoSettingsModal(settings, async (newS) => { settings = newS; });
        }
    };

    // ==========================================
    // --- ИНИЦИАЛИЗАЦИЯ ВСЕХ МОДУЛЕЙ AnimeGO ---
    // ==========================================

    const safeRun = (fn, name) => {
        try { if (fn) fn(); }
        catch (err) { console.error(`[AnimeGO+] Module error in ${name}:`, err); }
    };

    safeRun(() => window.agMountLegacyTop('animego', settings), 'TopOverlay');
    safeRun(() => window.agInjectHeaderGearButton && window.agInjectHeaderGearButton(openSettingsModal), 'HeaderGearButton');
    safeRun(() => window.agInitRandomAnimeButton && window.agInitRandomAnimeButton(), 'RandomAnimeButton');
    safeRun(() => window.agInitVoiceAutoSelect && window.agInitVoiceAutoSelect(settings), 'VoiceAutoSelect');
    safeRun(() => window.renderSyntheticAnimePage && window.renderSyntheticAnimePage(), 'SyntheticAnimePage');
    safeRun(() => window.checkNoVideoAndInjectJutsuButton && window.checkNoVideoAndInjectJutsuButton(), 'NoVideoJutsuButton');
    safeRun(() => window.initShikimoriAutoSync && window.initShikimoriAutoSync(), 'ShikimoriAutoSync');
    safeRun(() => window.agInitScheduleEnhancer && window.agInitScheduleEnhancer(), 'ScheduleEnhancer');

    // Смена серии в новом плеере происходит через AJAX без перезагрузки — подтягиваем AniSkip заново
    let lastEpisode = window.agGetCurrentEpisode ? window.agGetCurrentEpisode() : null;
    const onEpisodeMaybeChanged = () => {
        if (!window.agGetCurrentEpisode) return;
        const ep = window.agGetCurrentEpisode();
        if (ep !== lastEpisode) {
            lastEpisode = ep;
            if (syncAniSkip) syncAniSkip();
        }
    };

    // Один наблюдатель с объединением мутаций (раньше все модули вызывались на каждую мутацию DOM)
    const runDomTasks = () => {
        safeRun(ensureAgLogoPlus, 'LogoPlus');
        safeRun(() => window.agInjectHeaderGearButton && window.agInjectHeaderGearButton(openSettingsModal), 'HeaderGearButton');
        safeRun(() => window.checkNoVideoAndInjectJutsuButton && window.checkNoVideoAndInjectJutsuButton(), 'NoVideoJutsuButton');
        safeRun(() => window.agInitVoiceAutoSelect && window.agInitVoiceAutoSelect(settings), 'VoiceAutoSelect');
        safeRun(() => window.agInitScheduleEnhancer && window.agInitScheduleEnhancer(), 'ScheduleEnhancer');
        safeRun(onEpisodeMaybeChanged, 'EpisodeWatcher');
        safeRun(() => window.agBindPostersIn && window.agBindPostersIn(document), 'Posters');
    };
    window.agObserveDom(runDomTasks, { root: document.body, wait: 200 });

    // Раньше модуль поиска отключал главный observer на время своих правок DOM.
    // Наблюдатель с debounce не зацикливается, поэтому передаём заглушку с тем же интерфейсом
    const observerStub = { observe() {}, disconnect() {} };
    safeRun(() => window.agInitJutsuSearchEnhancer && window.agInitJutsuSearchEnhancer(observerStub), 'JutsuSearchEnhancer');

    // Проверка актуальности селекторов: плеер грузится лениво, поэтому даём странице 8 с.
    // Синтетические страницы и «голую» 404 не проверяем — их каркас строит само расширение
    setTimeout(() => {
        if (document.querySelector('.error-page') || /\/anime\/shiki-\d+/.test(location.pathname)) return;
        const types = ['any'];
        if (/^\/anime\/[^/]+-\d+$/.test(location.pathname)) types.push('anime');
        if (window.agFind('animego', 'playerLoaded') && window.agFind('animego', 'playerIframe')) types.push('animePlayerLoaded');
        safeRun(() => window.agCheckSelectorHealth('animego', types), 'SelectorHealth');
    }, 8000);

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'AG_GET_PAGE_INFO') {
            const info = window.agGetAnimePageInfo ? window.agGetAnimePageInfo() : null;
            if (info && info.title) {
                sendResponse({ title: info.title, origTitle: info.origTitle, episode: info.episode });
            } else {
                sendResponse({ title: null, origTitle: null, episode: "1" });
            }
        }
        if (request.type === 'AG_OPEN_SETTINGS') {
            openSettingsModal();
        }
    });
})();
