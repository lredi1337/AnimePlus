(async function () {
    'use strict';
    const { AG_RED, AG_FONT, DEFAULT_SETTINGS, isValidOrigin, getSettings } = window;
    let settings = await getSettings();

    if (settings.global_enabled === false) return;

    // ==========================================
    // --- ИНИЦИАЛИЗАЦИЯ МОДУЛЕЙ JUT-SU ---
    // ==========================================

    const getAnimeId = () => {
        const pathParts = window.location.pathname.split('/');
        return pathParts[1] || '';
    };

    // 1. Инициализация управления плеером (псевдо-фуллскрин, хоткеи)
    window.jtInitPlayerControls ? window.jtInitPlayerControls(settings, getAnimeId) : null;

    // 2. Инициализация окна настроек
    const openSettingsModal = () => {
        if (window.jtOpenJutsuSettingsModal) {
            window.jtOpenJutsuSettingsModal(settings, async (newS) => { settings = newS; });
        }
    };

    // 3. Авто-выбор плеера Kodik
    // Точная логика из оригинала: только .tabs-block__select, target.click()
    let kodikDone = false;
    const autoSelectKodik = () => {
        if (kodikDone) return;
        const selectContainer = document.querySelector('.tabs-block__select');
        if (!selectContainer) return;

        const kodikBtn = Array.from(selectContainer.querySelectorAll('button, a, span, div'))
            .find(btn => (btn.innerText || btn.textContent || '').trim().toLowerCase().includes('kodik'));
        if (!kodikBtn) return;

        const target = kodikBtn.closest('button') || kodikBtn;
        if (target.classList.contains('is-active') || target.classList.contains('active')) {
            kodikDone = true;
            return;
        }

        const now = Date.now();
        if (target.dataset.agKodikClickTime && (now - parseInt(target.dataset.agKodikClickTime)) < 3000) return;
        target.dataset.agKodikClickTime = now.toString();

        target.click();
        // Проверим через 500ms — если выбрался, помечаем done
        setTimeout(() => {
            if (target.classList.contains('is-active') || target.classList.contains('active')) {
                kodikDone = true;
            }
        }, 500);
    };

    // 4. Кнопка настроек у плеера
    const injectGearButton = () => {
        const selectContainer = document.querySelector('.tabs-block__select');
        if (selectContainer && !document.getElementById('ag-settings-gear')) {
            const gear = document.createElement('button');
            gear.id = 'ag-settings-gear';
            gear.type = 'button';
            gear.className = 'icon icon-cog flex-grow-0';
            gear.style.cssText = `max-width: 45px; margin-left: 10px; padding: 0 15px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(30,30,30,0.5); color: #fff; cursor: pointer;`;
            gear.title = 'Настройки JUT-SU+';
            gear.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                openSettingsModal();
            };
            selectContainer.appendChild(gear);
        }
    };

    // 5. Логотип .net+
    const customizeLogo = () => {
        const logo = document.querySelector('.jutsu-header__logo.logo');
        if (!logo) return;
        const span = logo.querySelector('span');
        if (!span) return;

        const firstChild = span.childNodes[0];
        if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
            if (firstChild.textContent !== '.net') firstChild.textContent = '.net';
        } else if (span.textContent !== '.net' && !span.querySelector('#ag-logo-plus')) {
            span.textContent = '.net';
        }

        span.style.cssText = `position: relative !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; width: auto !important; height: 27px !important; padding: 0 10px !important; font-size: 15px !important; font-weight: 800 !important; text-transform: none !important; border-radius: 6px !important;`;

        if (!document.getElementById('ag-logo-plus')) {
            const plus = document.createElement('span');
            plus.id = 'ag-logo-plus';
            plus.textContent = '+';
            plus.style.cssText = `position: absolute !important; top: -7px !important; right: -7px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; width: 14px !important; height: 14px !important; font-size: 11px !important; font-weight: 900 !important; color: #ffffff !important; background: linear-gradient(135deg, #e91e63 0%, #9c27b0 100%) !important; border-radius: 4px !important; box-shadow: 0 0 6px rgba(233, 30, 99, 0.4) !important; line-height: 1 !important; font-family: 'Inter', -apple-system, sans-serif !important; border: none !important; padding: 0 0 1px 0 !important; margin: 0 !important;`;
            span.appendChild(plus);
        }
    };

    // 6. Слушатель запросов popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'AG_GET_PAGE_INFO') {
            const playerEl = document.querySelector('.jutsu-page__player-video') || document.querySelector('.jutsu-page__poster');
            if (playerEl) {
                const titleEl = document.querySelector('.title_video') || document.querySelector('.jutsu-page__title-text h1');
                if (titleEl) {
                    let cleanTitle = titleEl.innerText.trim()
                        .replace(/^Смотреть аниме\s+/i, '')
                        .replace(/\s+онлайн$/i, '');
                    const origTitleEl = document.querySelector('.jutsu-page__title-original')
                        || document.querySelector('[class*="title-original"]')
                        || document.querySelector('.jutsu-page__title-text span');
                    const origTitle = origTitleEl ? origTitleEl.innerText.trim() : cleanTitle;
                    sendResponse({ title: cleanTitle, origTitle: origTitle, episode: window.ag_current_episode || "1" });
                    return;
                }
            }
            sendResponse({ title: null, origTitle: null, episode: "1" });
        }
        if (request.type === 'AG_OPEN_SETTINGS') openSettingsModal();
        return true;
    });

    const safeRun = (fn, name) => {
        try { if (fn) fn(); }
        catch (err) { console.error(`[JUT-SU+] Module error in ${name}:`, err); }
    };

    // 7. MutationObserver — реагирует на появление .tabs-block__select в DOM
    const pageObserver = new MutationObserver(() => {
        safeRun(injectGearButton, 'GearButton');
        safeRun(() => window.jtInjectHeaderGearButton && window.jtInjectHeaderGearButton(openSettingsModal), 'HeaderGearButton');
        safeRun(customizeLogo, 'Logo');
        safeRun(autoSelectKodik, 'AutoSelectKodik');
        safeRun(() => window.replaceCoversWithStandard && window.replaceCoversWithStandard(settings), 'ReplaceCovers');
    });
    pageObserver.observe(document.body, { childList: true, subtree: true });

    // 8. Первичная инициализация
    safeRun(() => window.jtInjectHeaderGearButton && window.jtInjectHeaderGearButton(openSettingsModal), 'HeaderGearButton');
    safeRun(() => window.jtInitRandomAnimeButton && window.jtInitRandomAnimeButton(), 'RandomAnimeButton');
    safeRun(() => window.jtInitVoiceAutoSelect && window.jtInitVoiceAutoSelect(settings), 'VoiceAutoSelect');
    safeRun(() => window.scrapeCurrentPageCover && window.scrapeCurrentPageCover(), 'ScrapeCover');
    safeRun(() => window.replaceCoversWithStandard && window.replaceCoversWithStandard(settings), 'ReplaceCovers');
    safeRun(() => window.initJutsuShikimoriAutoSync && window.initJutsuShikimoriAutoSync(), 'ShikimoriAutoSync');
    safeRun(() => window.handleRankIndexFallback && window.handleRankIndexFallback(), 'RankIndexFallback');
    safeRun(() => window.handleJutsuSearch && window.handleJutsuSearch(), 'JutsuSearch');
    safeRun(() => window.jtInitTopPageEnhancer && window.jtInitTopPageEnhancer(), 'TopPageEnhancer');
    safeRun(customizeLogo, 'Logo');
    safeRun(injectGearButton, 'GearButton');

    // Отложенные попытки авто-выбора Kodik (плеер загружается асинхронно)
    autoSelectKodik();
    setTimeout(autoSelectKodik, 500);
    setTimeout(autoSelectKodik, 1500);
    setTimeout(autoSelectKodik, 3000);

    // 9. Определение текущего эпизода
    const pathParts = window.location.pathname.split('/');
    const pageName = pathParts[pathParts.length - 1] || '';
    const epMatch = pageName.match(/(\d+)-(?:seria|episode)/) || pageName.match(/^(\d+)-/);
    const initialEp = epMatch ? epMatch[1] : "1";
    window.ag_current_episode = initialEp;

    if (window.jtSyncAniSkip) {
        window.jtSyncAniSkip(initialEp);
    }
})();
