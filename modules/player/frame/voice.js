// modules/player/frame/voice.js
// Озвучка в кадре плеера (content-player.js): выбор зрителя для тайтла, иначе первая из списка приоритетов.
// Плеер перезагружается при смене озвучки, поэтому выбор хранится вне страницы (modules/shared/voice-choice.js).

(function (root) {
    'use strict';

    const VOICE_BOX = '.serial-translations-box, .serial-translations, .translation-select, [class*="translation"]';
    const VOICE_SELECT = '.serial-translations-box select, .serial-translations select, select[name="translation"], select[name="voice"], [class*="translation"] select';
    const VOICE_ITEMS = '.serial-translations-box .dropdown-content .item, .serial-translations .dropdown-content .item, .translation-select .dropdown-content .item, [class*="translation"] .dropdown-content .item';
    const CHECK_GAP_MS = 300;

    const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '').trim();
    const similar = (a, b) => {
        const x = clean(a);
        const y = clean(b);
        return !!x && !!y && (x.includes(y) || y.includes(x));
    };

    /**
     * Запускает выбор озвучки. getSettings() — текущие настройки, listsReady() — плеер уже показал свои списки.
     * Возвращает { select() — попытка выбора, true когда больше ничего делать не нужно; remember(voice) — выбор зрителя }
     */
    async function start({ getSettings, isKodik, player, listsReady }) {
        const voiceChoice = root.AgVoiceChoice;
        // У других плееров заголовок кадра не содержит названия: их выбор хранит страница сайта
        const titleKey = () => {
            const name = isKodik ? (document.title || '').trim() : '';
            return name ? `kodik:${name.toLowerCase()}` : '';
        };
        let chosen = null;
        let done = false;

        const remember = (voice) => {
            if (!voiceChoice) return;
            chosen = voiceChoice.voiceName(voice);
            done = true;
            voiceChoice.set(titleKey(), voice);
            voiceChoice.tellPage(voice);
        };

        if (voiceChoice) {
            document.addEventListener('change', (e) => {
                if (!e.isTrusted || !e.target.matches || !e.target.matches('select') || !e.target.closest(VOICE_BOX)) return;
                const option = e.target.selectedOptions && e.target.selectedOptions[0];
                if (option) remember(option.textContent);
            }, true);
            document.addEventListener('click', (e) => {
                if (!e.isTrusted || !e.target.closest) return;
                const item = e.target.closest('.dropdown-content .item');
                if (item && item.closest(VOICE_BOX)) remember(item.textContent);
            }, true);
            chosen = (await voiceChoice.get(titleKey())) || (await voiceChoice.askPage());
        }

        const pick = (list, text) => (chosen && voiceChoice ? voiceChoice.pick(list, chosen, text) : null);

        // Плееры с адаптером: списки читаются и выбираются через него
        const selectInAdapter = (priority) => {
            const voices = player.read('voices');
            if (!voices.length) return false;
            const hit = pick(voices, o => o.title) || priority.map(name => voices.find(o => similar(o.title, name))).find(Boolean);
            if (!hit) return false;
            done = true;
            if (!hit.selected) player.choose('voices', hit.index);
            return true;
        };

        // Kodik: сначала обычный <select>, он есть сразу
        const selectInKodikSelect = (priority) => {
            const select = document.querySelector(VOICE_SELECT);
            if (!select || !select.options) return false;
            const options = Array.from(select.options);
            const hit = (options.length && pick(options, o => o.text || o.value))
                || priority.map(name => options.find(o => similar(o.text || o.value || '', name))).find(Boolean);
            if (!hit) return false;
            done = true;
            const index = options.indexOf(hit);
            if (select.selectedIndex !== index) {
                select.selectedIndex = index;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                select.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return true;
        };

        // Kodik: собственный выпадающий список
        const selectInKodikDropdown = (priority) => {
            const items = Array.from(document.querySelectorAll(VOICE_ITEMS));
            if (!items.length) return false;
            const text = (el) => el.innerText || el.textContent || '';
            const hit = pick(items, text) || priority.map(name => items.find(el => similar(text(el), name))).find(Boolean);
            if (!hit) return false;
            done = true;
            if (!hit.classList.contains('selected') && !hit.classList.contains('active')) hit.click();
            return true;
        };

        const select = () => {
            const settings = getSettings();
            if (done || !settings || !listsReady()) return false;
            // Выбор зрителя действует даже при выключенном автовыборе: это его решение, а не автоматика
            if (!chosen && settings.auto_select_voice === false) return false;
            const saved = settings.voice_priority_list || (root.DEFAULT_SETTINGS ? root.DEFAULT_SETTINGS.voice_priority_list : ['Anilibria', 'Studio Band']);
            const priority = settings.auto_select_voice === false ? [] : saved;
            if (!chosen && (!priority || priority.length === 0)) return false;
            if (!isKodik) return selectInAdapter(priority);
            return selectInKodikSelect(priority) || selectInKodikDropdown(priority);
        };

        select();
        // Списки плеера появляются не сразу: пробуем при изменениях разметки, но недолго
        let lastCheck = 0;
        const observer = new MutationObserver(() => {
            const now = Date.now();
            if (now - lastCheck < CHECK_GAP_MS) return;
            lastCheck = now;
            if (select()) {
                observer.disconnect();
                clearTimeout(stopTimer);
            }
        });
        if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
        const stopTimer = setTimeout(() => observer.disconnect(), isKodik ? 4000 : 15000);

        return { select, remember };
    }

    root.AgFrameVoice = { start };
})(typeof globalThis !== 'undefined' ? globalThis : this);
