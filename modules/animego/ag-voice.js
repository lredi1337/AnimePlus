// modules/animego/ag-voice.js
// Модуль авто-выбора приоритетной озвучки и плеера Kodik на AnimeGO

(function () {
    'use strict';

    const clean = (s) => (s || '').toLowerCase().replace(/\(ошибка\)/g, '').replace(/[^a-z0-9а-яё]/gi, '').trim();

    const getPriorityList = (settings) => (settings && Array.isArray(settings.voice_priority_list) && settings.voice_priority_list.length > 0)
        ? settings.voice_priority_list
        : (window.DEFAULT_SETTINGS ? window.DEFAULT_SETTINGS.voice_priority_list : ["Anilibria", "Studio Band"]);

    const isActive = (el) => el.classList.contains('active') || el.classList.contains('is-active') || el.classList.contains('selected');
    const isBroken = (el) => el.classList.contains('player-error');

    // Не кликаем по одному и тому же элементу чаще, чем раз в 1.5 с (сайт перерисовывает меню после клика)
    const safeClick = (el) => {
        const now = Date.now();
        if (el.dataset.agLastClick && now - parseInt(el.dataset.agLastClick, 10) < 1500) return;
        el.dataset.agLastClick = String(now);
        el.click();
    };

    const findByPriority = (items, priorityList, getText) => {
        for (const name of priorityList) {
            const prio = clean(name);
            if (!prio) continue;
            const hit = items.find(item => {
                const text = clean(getText(item));
                return text && (text.includes(prio) || prio.includes(text));
            });
            if (hit) return hit;
        }
        return null;
    };

    // Кнопки озвучки:   [data-anime-player-target="translation"][data-translation]
    // Кнопки провайдера: [data-anime-player-target="provider"][data-ptranslation][data-provider-slug]

    // Возвращает true, когда больше ничего делать не нужно
    function applyPlayerChoice(settings, state) {
        const translations = window.agFindAll('animego', 'translations');
        const providers = window.agFindAll('animego', 'providers');
        if (translations.length === 0 && providers.length === 0) return false;

        // 1. Озвучка: выбор пользователя, иначе приоритет (одна попытка на загрузку меню)
        if (!state.voiceDone && (chosenVoice || settings.auto_select_voice !== false) && translations.length > 0) {
            const usable = translations.filter(t => !isBroken(t));
            const own = chosenVoice ? voiceChoice.pick(usable, chosenVoice, t => t.textContent) : null;
            const target = own || (settings.auto_select_voice !== false ? findByPriority(usable, getPriorityList(settings), t => t.textContent) : null);
            state.voiceDone = true;
            if (target && !isActive(target)) {
                safeClick(target);
                return false; // дождёмся перерисовки меню провайдеров
            }
        }

        // 2. Плеер зрителя для активной озвучки, а без выбора Kodik: на нём есть всё аниме и работают все функции
        if (!state.providerDone) {
            const activeTranslation = translations.find(isActive);
            const key = activeTranslation ? activeTranslation.dataset.translation : null;
            const usableFor = (slug) => providers.find(p => p.dataset.providerSlug === slug && !isBroken(p) && (!key || p.dataset.ptranslation === key));
            const kodik = (chosenPlayer && usableFor(chosenPlayer)) || usableFor('kodik');
            if (!kodik) {
                state.providerDone = true;
                return true;
            }
            if (isActive(kodik)) {
                state.providerDone = true;
                return true;
            }
            safeClick(kodik);
            return false;
        }
        return true;
    }

    // Состояние привязано к конкретному меню плеера: при смене серии AnimeGO подменяет меню целиком
    let currentMenu = null;
    let state = null;

    // Выбор пользователя запоминается для тайтла и важнее приоритетов
    const voiceChoice = globalThis.AgVoiceChoice;
    let chosenVoice = null;
    let choiceLoaded = false;
    const VOICE_ITEMS = '[data-anime-player-target="translation"]';

    // Плеер, выбранный зрителем: запоминается для сайта
    const playerChoice = globalThis.AgPlayerChoice;
    let chosenPlayer = null;
    const PLAYER_ITEMS = '[data-anime-player-target="provider"]';
    window.agRememberPlayer = (slug) => {
        chosenPlayer = playerChoice.isKodik(slug) ? null : slug;
        if (state) state.providerDone = true;
        playerChoice.set('animego', slug);
    };
    document.addEventListener('click', (e) => {
        if (!e.isTrusted || !e.target.closest) return;
        const item = e.target.closest(PLAYER_ITEMS);
        if (!item || !item.dataset.providerSlug) return;
        if (!isActive(item)) document.dispatchEvent(new CustomEvent('ag-player-switch'));
        window.agRememberPlayer(item.dataset.providerSlug);
    }, true);

    if (voiceChoice) {
        document.addEventListener('click', (e) => {
            if (!e.isTrusted || !e.target.closest) return;
            const item = e.target.closest(VOICE_ITEMS);
            if (!item) return;
            if (!isActive(item)) document.dispatchEvent(new CustomEvent('ag-voice-switch'));
            chosenVoice = voiceChoice.voiceName(item.textContent);
            if (state) state.voiceDone = true;
            voiceChoice.set(voiceChoice.pageKey(), chosenVoice);
        }, true);
    }

    // Выбор в панели плеера: это тоже решение пользователя, хотя клик по кнопке сайта делает расширение
    window.agRememberVoice = (name) => {
        if (!voiceChoice) return;
        chosenVoice = voiceChoice.voiceName(name);
        if (state) state.voiceDone = true;
        voiceChoice.set(voiceChoice.pageKey(), chosenVoice);
    };

    window.agInitVoiceAutoSelect = async function (settings) {
        if (!settings || settings.global_enabled === false) return;
        if (!choiceLoaded) {
            choiceLoaded = true;
            chosenPlayer = await playerChoice.get('animego');
            if (voiceChoice) chosenVoice = await voiceChoice.get(voiceChoice.pageKey());
        }

        const menu = document.querySelector('[data-anime-player-target="translation"]')?.closest('[id], .player-video') || document.body;
        if (menu !== currentMenu || !menu.isConnected) {
            currentMenu = menu;
            state = { voiceDone: false, providerDone: false, finished: false };
        }
        if (state.finished) return;

        state.finished = applyPlayerChoice(settings, state);
    };
})();
