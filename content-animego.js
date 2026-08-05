(async function () {
    'use strict';
    const { AG_RED, AG_FONT, DEFAULT_SETTINGS, isValidOrigin, getSettings } = window;
    let settings = await getSettings();

    if (settings.global_enabled === false) return;

    // ==========================================
    // --- ЛОГИКА ANIMEGO (Сайт) ---
    // ==========================================

    const ensureAgLogoPlus = window.ensureAgLogoPlus || function () {};
    ensureAgLogoPlus();

    const getAnimeId = () => {
        const match = window.location.pathname.match(/\/anime\/([^\/]+)/);
        return match ? match[1] : null;
    };

    const syncAniSkip = window.agSyncAniSkip;
    const { setPseudoFS, handleResume, checkMarathon } = window.agInitPlayerControls
        ? window.agInitPlayerControls(settings, getAnimeId)
        : { setPseudoFS: () => {}, handleResume: () => {}, checkMarathon: () => false };

    window.addEventListener('message', (e) => {
        let isTrusted = false;
        try {
            const iframe = document.querySelector('iframe');
            if (iframe && iframe.src) {
                if (e.origin === new URL(iframe.src).origin) isTrusted = true;
            }
        } catch (err) {}

        if (!isTrusted && !isValidOrigin(e.origin)) return;

        if (e.data?.type === 'AG_PLAYER_READY' || e.data?.type === 'AG_GET_DATA') {
            if (checkMarathon()) e.source.postMessage({ type: 'AG_MARATHON_CONFIRM' }, '*');
            const sel = document.querySelector("select[name='series']");
            let pT = "", nT = "", cT = document.title;
            if (sel) {
                const i = sel.selectedIndex;
                if (sel.options[i - 1]) pT = sel.options[i - 1].textContent;
                if (sel.options[i]) cT = sel.options[i].textContent + " - " + document.title.split(' — ')[0];
                if (sel.options[i + 1]) nT = sel.options[i + 1].textContent;
            }
            e.source.postMessage({ type: 'AG_DATA', prevTitle: pT, nextTitle: nT, currentTitle: cT }, '*');
            if (syncAniSkip) syncAniSkip(e.source);
            const container = document.querySelector('.player__video') || document.querySelector('#video-player');
            const isFs = container ? container.classList.contains('ag-pseudo-fs-active') : false;
            e.source.postMessage({ type: 'AG_FS_STATE', active: isFs }, '*');
        }
        if (e.data?.type === 'AG_START_MARATHON') {
            const currentId = getAnimeId();
            if (currentId) sessionStorage.setItem('ag_active_marathon_id', currentId);
            if (settings.autoFS) {
                setTimeout(() => { setPseudoFS('enable', e.source); }, 300);
            }
        }
        if (e.data?.type === 'AG_PSEUDO_FS') setPseudoFS(e.data.action, e.source);

        if (e.data?.type === 'AG_NAV') {
            const btn = document.querySelector(e.data.dir === 'next' ? '.next.m-ep-arrow' : '.prev.m-ep-arrow');
            if (btn) {
                if (e.data.dir === 'next') {
                    const currentId = getAnimeId();
                    if (currentId) sessionStorage.setItem('ag_active_marathon_id', currentId);
                }
                btn.click();
            }
        }
    });

    const openSettingsModal = () => {
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

    safeRun(() => window.agInitTopPageEnhancer && window.agInitTopPageEnhancer(), 'TopPageEnhancer');
    safeRun(() => window.agInjectHeaderGearButton && window.agInjectHeaderGearButton(openSettingsModal), 'HeaderGearButton');
    safeRun(() => window.agInitRandomAnimeButton && window.agInitRandomAnimeButton(), 'RandomAnimeButton');
    safeRun(() => window.agInitVoiceAutoSelect && window.agInitVoiceAutoSelect(settings), 'VoiceAutoSelect');
    safeRun(() => window.renderSyntheticAnimePage && window.renderSyntheticAnimePage(), 'SyntheticAnimePage');
    safeRun(() => window.checkNoVideoAndInjectJutsuButton && window.checkNoVideoAndInjectJutsuButton(), 'NoVideoJutsuButton');
    safeRun(() => window.initShikimoriAutoSync && window.initShikimoriAutoSync(), 'ShikimoriAutoSync');
    safeRun(() => window.agInitScheduleEnhancer && window.agInitScheduleEnhancer(), 'ScheduleEnhancer');

    const mainObserver = new MutationObserver(() => {
        safeRun(ensureAgLogoPlus, 'LogoPlus');
        safeRun(() => window.agInjectTopButtons && window.agInjectTopButtons(), 'TopButtons');
        safeRun(() => window.agInjectHeaderGearButton && window.agInjectHeaderGearButton(openSettingsModal), 'HeaderGearButton');
        safeRun(() => window.checkNoVideoAndInjectJutsuButton && window.checkNoVideoAndInjectJutsuButton(), 'NoVideoJutsuButton');
        safeRun(() => window.agInitVoiceAutoSelect && window.agInitVoiceAutoSelect(settings), 'VoiceAutoSelect');
        safeRun(() => window.agInitScheduleEnhancer && window.agInitScheduleEnhancer(), 'ScheduleEnhancer');
    });
    mainObserver.observe(document.body, { childList: true, subtree: true });

    safeRun(() => window.agInitJutsuSearchEnhancer && window.agInitJutsuSearchEnhancer(mainObserver), 'JutsuSearchEnhancer');

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'AG_GET_PAGE_INFO') {
            if (window.location.pathname.startsWith('/anime/')) {
                const titleEl = document.querySelector('.entity__title h1')
                    || document.querySelector('.anime-title h1')
                    || document.querySelector('h1.entity__title')
                    || document.querySelector('h1');
                if (titleEl) {
                    const animeTitle = titleEl.innerText.split('/')[0].trim();
                    const origTitle = titleEl.innerText.split('/')[1]?.trim();
                    const sel = document.querySelector("select[name='series']");
                    const currentEp = (sel && sel.options && sel.options[sel.selectedIndex])
                        ? sel.options[sel.selectedIndex].textContent.match(/\d+/)?.[0]
                        : "1";
                    sendResponse({ title: animeTitle, origTitle: origTitle || animeTitle, episode: currentEp });
                    return;
                }
            }
            sendResponse({ title: null, origTitle: null, episode: "1" });
        }
        if (request.type === 'AG_OPEN_SETTINGS') {
            openSettingsModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setPseudoFS('disable');
    });
})();
