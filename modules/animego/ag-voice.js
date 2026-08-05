// modules/animego/ag-voice.js
// Модуль авто-выбора приоритетной озвучки и плеера Kodik на AnimeGO

(function () {
    'use strict';

    let isAnimeGoVoiceDone = false;
    let animegoCheckTimer = null;
    let lastAnimegoCheckTime = 0;
    let animeGoVoiceObserver = null;

    function findAndSelectPriorityVoiceAnimeGo(settings) {
        if (isAnimeGoVoiceDone || !settings || settings.auto_select_voice === false) return false;

        const priorityList = (settings && settings.voice_priority_list && settings.voice_priority_list.length > 0)
            ? settings.voice_priority_list
            : (window.DEFAULT_SETTINGS ? window.DEFAULT_SETTINGS.voice_priority_list : ["Anilibria", "Studio Band"]);

        const items = Array.from(document.querySelectorAll('.list-group-item[data-translation], button[data-translation], [data-translation], #video-dubbing .item, [data-dubbing], .video-player__translation-item, .video-player__translation, [data-translation-id], .video-player__translations span, .video-player__translations a, .video-player__translations div'));
        if (items.length === 0) return false;

        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '').trim();

        for (const priorityName of priorityList) {
            const prioClean = clean(priorityName);
            if (!prioClean) continue;

            for (const item of items) {
                const textSpan = item.querySelector('.text-truncate') || item.querySelector('span') || item;
                const itemText = clean(textSpan.innerText || textSpan.textContent || item.innerText || item.getAttribute('data-dubbing') || item.getAttribute('title') || item.getAttribute('data-title') || '');
                if (itemText && (itemText.includes(prioClean) || prioClean.includes(itemText))) {
                    isAnimeGoVoiceDone = true;
                    if (!item.classList.contains('active') && !item.classList.contains('selected')) {
                        item.click();
                        if (textSpan !== item) {
                            textSpan.click();
                        }
                    }
                    return true;
                }
            }
        }
        return false;
    }

    function autoSelectKodikPlayer() {
        let kodikBtn = document.querySelector('span[data-provider="2"]') ||
            document.querySelector('li[data-provider="2"]') ||
            document.querySelector('[data-provider="2"]') ||
            document.querySelector('[data-provider-title*="Kodik"]') ||
            document.querySelector('[data-player-title*="Kodik"]');

        if (!kodikBtn) {
            const candidates = Array.from(document.querySelectorAll('#video-player [data-provider], .video-player__providers [data-provider], #video-player .nav-item, #video-player span, #video-player li, .player-video [data-provider], button, a, span, li'));
            kodikBtn = candidates.find(el => (el.innerText || el.textContent || '').trim().toLowerCase().includes('kodik'));
        }

        if (kodikBtn) {
            const target = kodikBtn.closest('button') || kodikBtn.closest('a') || kodikBtn.closest('li') || kodikBtn;
            if (target.classList.contains('active') || target.classList.contains('is-active') || target.classList.contains('selected')) return;

            const now = Date.now();
            if (!target.dataset.lastClickTime || now - parseInt(target.dataset.lastClickTime) > 1500) {
                target.dataset.lastClickTime = now.toString();
                target.click();
            }
        }
    }

    window.agInitVoiceAutoSelect = function (settings) {
        autoSelectKodikPlayer();
        findAndSelectPriorityVoiceAnimeGo(settings);

        if (animeGoVoiceObserver) return;

        animeGoVoiceObserver = new MutationObserver(() => {
            const now = Date.now();
            if (now - lastAnimegoCheckTime < 300) return;
            lastAnimegoCheckTime = now;

            autoSelectKodikPlayer();

            if (findAndSelectPriorityVoiceAnimeGo(settings)) {
                if (animegoCheckTimer) clearTimeout(animegoCheckTimer);
            }
        });

        if (document.documentElement) {
            animeGoVoiceObserver.observe(document.documentElement, { childList: true, subtree: true });
        }

        animegoCheckTimer = setTimeout(() => {
            if (animeGoVoiceObserver) animeGoVoiceObserver.disconnect();
            animeGoVoiceObserver = null;
        }, 10000);
    };
})();
