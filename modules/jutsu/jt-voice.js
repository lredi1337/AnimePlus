// modules/jutsu/jt-voice.js
// Модуль авто-выбора приоритетной озвучки на Jut-Su

(function () {
    'use strict';

    let isJutsuVoiceDone = false;
    let jutsuCheckTimer = null;
    let lastJutsuCheckTime = 0;
    let jutsuVoiceObserver = null;

    function clickElementNative(el) {
        if (!el) return;
        try {
            const opts = { bubbles: true, cancelable: true, composed: true, view: window };
            el.dispatchEvent(new PointerEvent('pointerdown', opts));
            el.dispatchEvent(new MouseEvent('mousedown', opts));
            el.dispatchEvent(new PointerEvent('pointerup', opts));
            el.dispatchEvent(new MouseEvent('mouseup', opts));
            el.dispatchEvent(new MouseEvent('click', opts));
            if (typeof el.click === 'function') el.click();
        } catch (e) {
            console.error('[JUT-SU+] clickElementNative error:', e);
        }
    }

    function findAndSelectPriorityVoiceJutsu(settings) {
        if (isJutsuVoiceDone) return false;

        // Если активен Kodik плеер — он управляет озвучкой сам
        const activeTab = document.querySelector('.tabs-block__select button.is-active, .tabs-block__select button.active');
        if (activeTab && (activeTab.textContent || '').toLowerCase().includes('kodik')) {
            return false;
        }

        const isAutoSelect = (settings && settings.auto_select_voice !== false);
        if (!isAutoSelect) return false;

        const priorityList = (settings && settings.voice_priority_list && settings.voice_priority_list.length > 0)
            ? settings.voice_priority_list
            : (window.DEFAULT_SETTINGS ? window.DEFAULT_SETTINGS.voice_priority_list : ["Anilibria", "Studio Band"]);

        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '').trim();

        // Если топ-приоритет уже выбран — останавливаемся
        const topPrioClean = clean(priorityList[0]);
        if (topPrioClean) {
            const selectedItem = document.querySelector('.dropdown-content .item.selected, .dropdown-content .item.active, select option:checked');
            if (selectedItem) {
                const selText = clean(selectedItem.innerText || selectedItem.textContent || '');
                if (selText && (selText.includes(topPrioClean) || topPrioClean.includes(selText))) {
                    isJutsuVoiceDone = true;
                    return true;
                }
            }
        }

        let dropdownItems = Array.from(document.querySelectorAll('.dropdown-content .item, .dropdown .item'));

        const dropdownContent = document.querySelector('.dropdown-content');
        const isDropdownHidden = !dropdownContent || getComputedStyle(dropdownContent).display === 'none' || getComputedStyle(dropdownContent).visibility === 'hidden';

        if (dropdownItems.length === 0 || isDropdownHidden) {
            const dropdownHeader = document.querySelector('.dropdown > div:first-child, .dropdown > button, .dropdown > span, .dropdown');
            if (dropdownHeader && !dropdownHeader.dataset.agAutoOpened) {
                dropdownHeader.dataset.agAutoOpened = 'true';
                clickElementNative(dropdownHeader);
                setTimeout(() => findAndSelectPriorityVoiceJutsu(settings), 350);
                return false;
            }
        }

        dropdownItems = Array.from(document.querySelectorAll('.dropdown-content .item, .dropdown .item'));

        for (const priorityName of priorityList) {
            const prioClean = clean(priorityName);
            if (!prioClean) continue;

            for (const item of dropdownItems) {
                const itemText = clean(item.innerText || item.textContent || '');
                if (itemText && (itemText.includes(prioClean) || prioClean.includes(itemText))) {
                    isJutsuVoiceDone = true;
                    clickElementNative(item);
                    return true;
                }
            }

            // Также проверяем select (нативный)
            const selectEl = document.querySelector('select.voice-select, select[name="voice"], select.dropdown-select');
            if (selectEl) {
                for (let i = 0; i < selectEl.options.length; i++) {
                    const optText = clean(selectEl.options[i].text);
                    if (optText && (optText.includes(prioClean) || prioClean.includes(optText))) {
                        isJutsuVoiceDone = true;
                        selectEl.selectedIndex = i;
                        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }
            }
        }

        return false;
    }

    window.jtInitVoiceAutoSelect = function (settings) {
        isJutsuVoiceDone = false;
        findAndSelectPriorityVoiceJutsu(settings);

        if (jutsuVoiceObserver) jutsuVoiceObserver.disconnect();

        jutsuVoiceObserver = new MutationObserver(() => {
            const now = Date.now();
            if (now - lastJutsuCheckTime < 300) return;
            lastJutsuCheckTime = now;

            if (findAndSelectPriorityVoiceJutsu(settings)) {
                if (jutsuVoiceObserver) jutsuVoiceObserver.disconnect();
                if (jutsuCheckTimer) clearTimeout(jutsuCheckTimer);
            }
        });

        if (document.documentElement) {
            jutsuVoiceObserver.observe(document.documentElement, { childList: true, subtree: true });
        }

        jutsuCheckTimer = setTimeout(() => {
            if (jutsuVoiceObserver) jutsuVoiceObserver.disconnect();
        }, 5000);
    };
})();
