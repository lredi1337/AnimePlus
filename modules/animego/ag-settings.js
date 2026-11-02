// modules/animego/ag-settings.js
// Модуль управления окном настроек AnimeGO

(function () {
    'use strict';
    const icon = (name, size) => (window.AgUI ? window.AgUI.icon(name, size) : '');

    function injectSettingsStyles() {
        if (document.getElementById('ag-settings-styles')) return;
        const style = document.createElement('style');
        style.id = 'ag-settings-styles';
        style.textContent = `
            #ag-modal-overlay {
                position: fixed !important;
                inset: 0 !important;
                background: var(--ap-scrim) !important;
                z-index: 9999999 !important;
                display: none;
            }

            #ag-settings-modal {
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                background: var(--ap-surface) !important;
                color: var(--ap-text) !important;
                padding: 20px !important;
                border-radius: var(--ap-radius-lg) !important;
                z-index: 10000001 !important;
                display: none;
                width: 560px !important;
                max-width: 92vw !important;
                font-family: var(--ap-font) !important;
                color-scheme: dark !important;
                font-size: var(--ap-fs-md) !important;
                border: 1px solid var(--ap-line) !important;
                box-shadow: var(--ap-shadow) !important;
                box-sizing: border-box !important;
                line-height: normal !important;
                text-align: left !important;
            }

            #ag-settings-modal,
            #ag-settings-modal * {
                box-sizing: border-box !important;
            }

            /* Защита и сброс от глобальных правил хост-сайта (например DLE: button:not(...) { height: 40px; padding: 0 30px; background: ...; uppercase }) */
            #ag-settings-modal button {
                all: unset !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
                font-family: var(--ap-font) !important;
                text-transform: none !important;
                letter-spacing: normal !important;
                line-height: normal !important;
                white-space: normal !important;
                box-shadow: none !important;
                border: none !important;
                background: transparent !important;
                color: inherit !important;
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                min-width: 0 !important;
                max-width: none !important;
                text-align: inherit !important;
                font-size: inherit !important;
                font-weight: inherit !important;
                border-radius: 0 !important;
            }
            #ag-settings-modal button:focus-visible,
            #ag-settings-modal input:focus-visible + .ag-slider {
                outline: 2px solid var(--ap-accent) !important;
                outline-offset: 1px !important;
            }

            #ag-settings-modal .ag-set-head {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                margin-bottom: 16px !important;
            }
            #ag-settings-modal .ag-set-brand {
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
            }
            #ag-settings-modal .ag-set-logo {
                display: grid !important;
                place-items: center !important;
                width: 36px !important;
                height: 36px !important;
                border-radius: var(--ap-radius) !important;
                background: var(--ap-accent-soft) !important;
                color: var(--ap-accent) !important;
            }
            #ag-settings-modal .ag-set-title {
                margin: 0 !important;
                padding: 0 !important;
                color: var(--ap-text) !important;
                font-family: var(--ap-font) !important;
                font-size: var(--ap-fs-xl) !important;
                font-weight: 700 !important;
                line-height: 1.25 !important;
                text-transform: none !important;
            }
            #ag-settings-modal .ag-set-title span { color: var(--ap-accent) !important; }
            #ag-settings-modal .ag-set-sub {
                display: block !important;
                margin-top: 1px !important;
                color: var(--ap-text-3) !important;
                font-size: var(--ap-fs-sm) !important;
            }

            #ag-settings-modal .ag-modal-close-btn {
                width: 30px !important;
                height: 30px !important;
                min-width: 30px !important;
                max-width: 30px !important;
                border-radius: var(--ap-radius) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                color: var(--ap-text-2) !important;
                cursor: pointer !important;
                transition: background var(--ap-ease), color var(--ap-ease) !important;
            }
            #ag-settings-modal .ag-modal-close-btn:hover {
                color: var(--ap-text) !important;
                background: var(--ap-hover) !important;
            }

            #ag-settings-modal .ag-tabs-nav {
                display: flex !important;
                background: var(--ap-bg) !important;
                padding: 3px !important;
                border-radius: var(--ap-radius) !important;
                margin-bottom: 14px !important;
                gap: 2px !important;
                width: 100% !important;
            }

            #ag-settings-modal .ag-tab-btn {
                flex: 1 1 0 !important;
                min-width: 0 !important;
                height: 32px !important;
                padding: 0 4px !important;
                border-radius: var(--ap-radius-sm) !important;
                color: var(--ap-text-2) !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                transition: background var(--ap-ease), color var(--ap-ease) !important;
                font-size: var(--ap-fs-sm) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 6px !important;
                white-space: nowrap !important;
            }
            #ag-settings-modal .ag-tab-btn:hover {
                color: var(--ap-text) !important;
                background: var(--ap-hover) !important;
            }
            #ag-settings-modal .ag-tab-btn.active {
                background: var(--ap-raised) !important;
                color: var(--ap-text) !important;
                box-shadow: inset 0 0 0 1px var(--ap-line) !important;
            }
            #ag-settings-modal .ag-tab-btn.active svg { color: var(--ap-accent) !important; }

            #ag-settings-modal .ag-tab-content {
                display: none;
                height: 340px !important;
                overflow-y: auto !important;
                padding-right: 6px !important;
                scrollbar-width: thin !important;
                scrollbar-color: var(--ap-line-strong) transparent !important;
            }
            #ag-settings-modal .ag-tab-content.active {
                display: block !important;
            }
            #ag-settings-modal #tab-voice.active {
                display: flex !important;
                flex-direction: column !important;
                overflow: hidden !important;
                padding-right: 0 !important;
            }

            #ag-settings-modal .ag-set-row {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                gap: 12px !important;
                margin: 10px 0 3px 0 !important;
                font-size: var(--ap-fs-lg) !important;
                font-weight: 600 !important;
                color: var(--ap-text) !important;
                text-transform: none !important;
                letter-spacing: normal !important;
                line-height: 1.35 !important;
            }
            #ag-settings-modal .ag-set-row-stack {
                align-items: flex-start !important;
                flex-direction: column !important;
                gap: 8px !important;
            }
            #ag-settings-modal .ag-set-desc {
                font-size: var(--ap-fs-sm) !important;
                color: var(--ap-text-2) !important;
                margin-bottom: 14px !important;
                line-height: 1.4 !important;
                padding-right: 56px !important;
                text-transform: none !important;
                letter-spacing: normal !important;
            }
            #ag-settings-modal .ag-set-value { color: var(--ap-accent) !important; }
            #ag-settings-modal .ag-range {
                width: 100% !important;
                margin: 0 0 14px !important;
                accent-color: var(--ap-accent) !important;
            }
            #ag-settings-modal .ag-chips {
                display: flex !important;
                flex-wrap: wrap !important;
                gap: 6px !important;
                width: 100% !important;
            }
            #ag-settings-modal .ag-chip {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                height: 30px !important;
                margin: 0 !important;
                padding: 0 10px !important;
                font-size: var(--ap-fs-sm) !important;
                font-weight: 500 !important;
                color: var(--ap-text-2) !important;
                background: var(--ap-raised) !important;
                border-radius: var(--ap-radius-sm) !important;
                cursor: pointer !important;
            }
            #ag-settings-modal .ag-chip input {
                margin: 0 !important;
                accent-color: var(--ap-accent) !important;
                cursor: pointer !important;
            }

            #ag-settings-modal .ag-switch {
                position: relative !important;
                flex-shrink: 0 !important;
                width: 36px !important;
                height: 20px !important;
                cursor: pointer !important;
                display: inline-block !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            #ag-settings-modal .ag-switch input {
                opacity: 0 !important;
                width: 0 !important;
                height: 0 !important;
                position: absolute !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            #ag-settings-modal .ag-slider {
                position: absolute !important;
                inset: 0 !important;
                background: var(--ap-raised) !important;
                border-radius: 999px !important;
                transition: background var(--ap-ease) !important;
            }
            #ag-settings-modal .ag-slider:before {
                position: absolute !important;
                content: "" !important;
                height: 16px !important;
                width: 16px !important;
                left: 2px !important;
                bottom: 2px !important;
                background: var(--ap-text-3) !important;
                transition: transform var(--ap-ease), background var(--ap-ease) !important;
                border-radius: 50% !important;
            }
            #ag-settings-modal input:checked + .ag-slider {
                background: var(--ap-accent) !important;
            }
            #ag-settings-modal input:checked + .ag-slider:before {
                background: #fff !important;
                transform: translateX(16px) !important;
            }

            #ag-settings-modal .ag-key-btn {
                flex-shrink: 0 !important;
                background: var(--ap-raised) !important;
                border: 1px solid var(--ap-line) !important;
                color: var(--ap-text) !important;
                height: 30px !important;
                line-height: 28px !important;
                padding: 0 12px !important;
                border-radius: var(--ap-radius-sm) !important;
                font-size: var(--ap-fs-sm) !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                min-width: 80px !important;
                text-align: center !important;
                transition: border-color var(--ap-ease) !important;
                font-family: ui-monospace, "Cascadia Mono", Consolas, monospace !important;
                text-transform: uppercase !important;
                display: inline-block !important;
            }
            #ag-settings-modal .ag-key-btn:hover {
                border-color: var(--ap-line-strong) !important;
            }
            #ag-settings-modal .ag-key-btn.listening {
                background: var(--ap-accent) !important;
                color: var(--ap-on-accent) !important;
                border-color: transparent !important;
                animation: agSetPulse 1s infinite !important;
            }

            #ag-settings-modal .ag-footer-btns {
                display: flex !important;
                justify-content: flex-end !important;
                gap: 8px !important;
                margin-top: 16px !important;
                padding-top: 14px !important;
                border-top: 1px solid var(--ap-line) !important;
                width: 100% !important;
            }
            #ag-settings-modal .ag-btn-main {
                height: 36px !important;
                line-height: 36px !important;
                padding: 0 18px !important;
                border-radius: var(--ap-radius) !important;
                cursor: pointer !important;
                font-weight: 600 !important;
                font-size: var(--ap-fs-md) !important;
                transition: background var(--ap-ease), color var(--ap-ease) !important;
                text-align: center !important;
                display: block !important;
            }
            #ag-settings-modal #ag-save {
                background: var(--ap-accent) !important;
                color: var(--ap-on-accent) !important;
            }
            #ag-settings-modal #ag-save:hover {
                background: color-mix(in srgb, var(--ap-accent) 86%, white) !important;
            }
            #ag-settings-modal #ag-reset {
                background: transparent !important;
                color: var(--ap-text-2) !important;
                margin-right: auto !important;
            }
            #ag-settings-modal #ag-reset:hover {
                background: var(--ap-hover) !important;
                color: var(--ap-text) !important;
            }

            #ag-settings-modal .ag-vp-box {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 !important;
                min-height: 0 !important;
                gap: 8px !important;
                padding: 10px !important;
                background: var(--ap-bg) !important;
                border-radius: var(--ap-radius) !important;
            }
            #ag-settings-modal .ag-vp-head {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                font-size: var(--ap-fs-md) !important;
                font-weight: 600 !important;
            }
            #ag-settings-modal .ag-vp-hint {
                font-size: var(--ap-fs-sm) !important;
                font-weight: 400 !important;
                color: var(--ap-text-3) !important;
            }
            #ag-settings-modal .ag-vp-list {
                flex: 1 !important;
                min-height: 0 !important;
                overflow-y: auto !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
                padding-right: 4px !important;
                scrollbar-width: thin !important;
                scrollbar-color: var(--ap-line-strong) transparent !important;
            }
            #ag-settings-modal .ag-vp-item {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 8px !important;
                padding: 5px 6px 5px 8px !important;
                background: var(--ap-surface) !important;
                border-radius: var(--ap-radius-sm) !important;
                font-size: var(--ap-fs-md) !important;
            }
            #ag-settings-modal .ag-vp-name {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                min-width: 0 !important;
                font-weight: 500 !important;
            }
            #ag-settings-modal .ag-vp-rank {
                min-width: 20px !important;
                font-size: var(--ap-fs-sm) !important;
                font-weight: 700 !important;
                color: var(--ap-accent) !important;
            }
            #ag-settings-modal .ag-vp-actions {
                display: flex !important;
                flex-shrink: 0 !important;
                gap: 2px !important;
            }
            #ag-settings-modal .ag-vp-add {
                display: flex !important;
                gap: 6px !important;
            }
            #ag-settings-modal #ag-new-voice-input {
                flex: 1 !important;
                min-width: 0 !important;
                height: 32px !important;
                margin: 0 !important;
                padding: 0 10px !important;
                font-family: var(--ap-font) !important;
                font-size: var(--ap-fs-sm) !important;
                color: var(--ap-text) !important;
                background: var(--ap-surface) !important;
                border: 1px solid var(--ap-line) !important;
                border-radius: var(--ap-radius-sm) !important;
                outline: none !important;
            }
            #ag-settings-modal #ag-new-voice-input:focus { border-color: var(--ap-accent) !important; }
            #ag-settings-modal #ag-add-voice-btn {
                flex-shrink: 0 !important;
                height: 32px !important;
                line-height: 32px !important;
                padding: 0 12px !important;
                background: var(--ap-accent) !important;
                color: var(--ap-on-accent) !important;
                border-radius: var(--ap-radius-sm) !important;
                font-size: var(--ap-fs-sm) !important;
                font-weight: 600 !important;
                cursor: pointer !important;
            }
            #ag-settings-modal .ag-vp-up,
            #ag-settings-modal .ag-vp-down,
            #ag-settings-modal .ag-vp-del {
                width: 26px !important;
                height: 26px !important;
                min-width: 26px !important;
                max-width: 26px !important;
                color: var(--ap-text-2) !important;
                border-radius: var(--ap-radius-sm) !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
            }
            #ag-settings-modal .ag-vp-up:hover,
            #ag-settings-modal .ag-vp-down:hover {
                color: var(--ap-text) !important;
                background: var(--ap-hover) !important;
            }
            #ag-settings-modal .ag-vp-del:hover {
                color: var(--ap-danger) !important;
                background: var(--ap-danger-soft) !important;
            }
            #ag-settings-modal .ag-vp-up:disabled,
            #ag-settings-modal .ag-vp-down:disabled {
                opacity: 0.3 !important;
                cursor: default !important;
                background: transparent !important;
            }

            @keyframes agSetPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

            #ag-settings-modal .ag-custom-dropdown { position: relative !important; display: inline-block !important; flex-shrink: 0 !important; width: 210px !important; user-select: none !important; text-transform: none !important; }
            #ag-settings-modal .ag-dropdown-trigger { width: 100% !important; background: var(--ap-raised) !important; color: var(--ap-text) !important; border: 1px solid var(--ap-line) !important; border-radius: var(--ap-radius-sm) !important; height: 30px !important; padding: 0 10px !important; font-size: var(--ap-fs-sm) !important; font-weight: 500 !important; display: flex !important; justify-content: space-between !important; align-items: center !important; cursor: pointer !important; transition: border-color var(--ap-ease) !important; text-transform: none !important; line-height: normal !important; }
            #ag-settings-modal .ag-dropdown-trigger:hover { border-color: var(--ap-line-strong) !important; }
            #ag-settings-modal .ag-custom-dropdown.open .ag-dropdown-trigger { border-color: var(--ap-accent) !important; }
            #ag-settings-modal .ag-dropdown-arrow { display: inline-flex !important; transition: transform var(--ap-ease) !important; color: var(--ap-text-3) !important; margin-left: 8px !important; }
            #ag-settings-modal .ag-custom-dropdown.open .ag-dropdown-arrow { transform: rotate(180deg) !important; }
            #ag-settings-modal .ag-dropdown-menu { position: absolute !important; top: calc(100% + 4px) !important; left: 0 !important; right: 0 !important; width: 100% !important; background: var(--ap-raised) !important; border: 1px solid var(--ap-line-strong) !important; border-radius: var(--ap-radius) !important; box-shadow: var(--ap-shadow) !important; padding: 4px !important; z-index: 10000030 !important; display: none; max-height: 170px !important; overflow-y: auto !important; text-transform: none !important; scrollbar-width: thin !important; scrollbar-color: var(--ap-line-strong) transparent !important; }
            #ag-settings-modal .ag-custom-dropdown.open .ag-dropdown-menu { display: block !important; }
            #ag-settings-modal .ag-dropdown-item { padding: 6px 8px !important; color: var(--ap-text-2) !important; border-radius: var(--ap-radius-sm) !important; font-size: var(--ap-fs-sm) !important; font-weight: 500 !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: space-between !important; text-transform: none !important; line-height: normal !important; }
            #ag-settings-modal .ag-dropdown-item:hover { background: var(--ap-hover) !important; color: var(--ap-text) !important; }
            #ag-settings-modal .ag-dropdown-item.selected { color: var(--ap-accent) !important; font-weight: 600 !important; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Окно настроек расширения. Используется на AnimeGO и на сайтах-провайдерах (features/settings-entry.js).
     * @param {Object} settings
     * @param {Function} onSaveCallback
     * @param {{ brand?: string, accent?: string, getPlayerWindows?: () => Window[], extraInterfaceRows?: Array<{id: string, title: string, desc: string}> }} [options]
     *        brand — название сайта в заголовке; accent — цвет сайта; getPlayerWindows — куда отправить
     *        AG_SETTINGS_UPDATE (по умолчанию первый iframe страницы, как было на AnimeGO);
     *        extraInterfaceRows — переключатели только для этого сайта на вкладке «Интерфейс»
     */
    window.agOpenAnimeGoSettingsModal = function (settings, onSaveCallback, options = {}) {
        injectSettingsStyles();
        const brand = options.brand || 'AnimeGO';

        let overlay = document.getElementById('ag-modal-overlay');
        let modal = document.getElementById('ag-settings-modal');

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ag-modal-overlay';
            document.body.appendChild(overlay);
        }
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ag-settings-modal';
            document.body.appendChild(modal);
        }

        const renderRow = (id, title, desc) => `<div class="ag-set-row"><span>${title}</span><label class="ag-switch"><input type="checkbox" id="s-${id}" ${settings[id] ? 'checked' : ''}> <span class="ag-slider"></span></label></div><div class="ag-set-desc">${desc}</div>`;
        const renderKeyRow = (action, title, desc) => `<div class="ag-set-row"><span>${title}</span><button type="button" class="ag-key-btn" data-action="${action}">${settings.keys[action]}</button></div><div class="ag-set-desc">${desc}</div>`;

        let activeKeyListener = null;

        const html = `
            <div class="ag-set-head">
                <div class="ag-set-brand">
                    <div class="ag-set-logo">${icon('gear', 20)}</div>
                    <div>
                        <h3 class="ag-set-title">Настройки Anime<span>+</span></h3>
                        <span class="ag-set-sub">${window.agEscapeHtml ? window.agEscapeHtml(brand) : brand} · by l_red_i</span>
                    </div>
                </div>
                <button type="button" id="ag-settings-close" class="ag-modal-close-btn" title="Закрыть" aria-label="Закрыть">${icon('close', 16)}</button>
            </div>

            <div class="ag-tabs-nav">
                <button type="button" class="ag-tab-btn active" data-tab="playback">${icon('tv', 15)}Плеер</button>
                <button type="button" class="ag-tab-btn" data-tab="voice">${icon('mic', 15)}Озвучка</button>
                <button type="button" class="ag-tab-btn" data-tab="interface">${icon('sliders', 15)}Интерфейс</button>
                <button type="button" class="ag-tab-btn" data-tab="options">${icon('gear', 15)}Опции</button>
                <button type="button" class="ag-tab-btn" data-tab="hotkeys">${icon('keyboard', 15)}Клавиши</button>
            </div>

            <!-- Tab 1: Playback -->
            <div class="ag-tab-content active" id="tab-playback">
                ${renderRow('kodikShell', 'Новый плеер', 'Современный вид плеера Kodik: серии, озвучка и настройки в одной панели. Изменения применятся после перезагрузки серии.')}
                ${renderRow('autoPlay', 'Авто-плей', 'Автоматически нажимает Play при открытии серии.')}
                ${renderRow('autoNext', 'Авто-переход', 'Автоматически переключает на следующую серию в конце.')}
                ${renderRow('autoFS', 'Псевдо-фуллскрин', 'Улучшенный фуллскрин без рамок.')}
                ${renderRow('autoSkip', 'Авто-скип', 'Автоматически пропускает опенинги и эндинги. Если выключить, появится кнопка пропуска.')}
                ${renderRow('audioSkip', 'Пропуск по звуку', 'Узнаёт песню по звуку серии, точнее меток, но первые секунды будут слышны. Звук анализируется только на этом устройстве.')}
                ${renderRow('showDBL', 'Двойной клик', 'Перемотка по краям и фуллскрин в центре по двойному клику.')}
            </div>

            <!-- Tab 2: Voiceover -->
            <div class="ag-tab-content" id="tab-voice">
                <div class="ag-set-row" style="margin-bottom: 2px;">
                    <span>Автовыбор приоритетной озвучки</span>
                    <label class="ag-switch">
                        <input type="checkbox" id="set-autoSelectVoice" ${settings.auto_select_voice !== false ? 'checked' : ''}>
                        <span class="ag-slider"></span>
                    </label>
                </div>
                <div class="ag-set-desc" style="margin-bottom: 8px;">Автоматически переключать плеер на наиболее предпочтительную доступную озвучку из списка ниже.</div>

                <div class="ag-vp-box">
                    <div class="ag-vp-head">
                        <span>Приоритет озвучек</span>
                        <span class="ag-vp-hint">выше — важнее</span>
                    </div>

                    <div id="ag-voice-priority-list-container" class="ag-vp-list"></div>

                    <div class="ag-vp-add">
                        <input type="text" id="ag-new-voice-input" placeholder="Добавить озвучку, например HDRezka">
                        <button type="button" id="ag-add-voice-btn">Добавить</button>
                    </div>
                </div>
            </div>

            <!-- Tab 3: Interface -->
            <div class="ag-tab-content" id="tab-interface">
                ${renderRow('showNav', 'Стрелки серий', 'Показывать кнопки < и > по бокам плеера.')}
                ${renderRow('showSkipBtn', 'Кнопка +89 с', 'Показывать кнопку быстрой перемотки опенинга.')}
                ${renderRow('showPiP', 'Кнопка PiP', 'Показывать кнопку Картинка-в-Картинке.')}
                ${renderRow('showCenterBtn', 'Кнопки перемотки', 'Дополнительные кнопки -5с / +5с в центре плеера.')}
                ${(options.extraInterfaceRows || []).map(r => renderRow(r.id, r.title, r.desc)).join('')}
            </div>

            <!-- Tab 4: Options -->
            <div class="ag-tab-content" id="tab-options">
                <div class="ag-set-row">
                    <span>Шаг громкости (скролл)</span>
                    <div class="ag-custom-dropdown" id="s-volStep" data-value="${settings.volStep || 0.05}">
                        <div class="ag-dropdown-trigger">
                            <span class="ag-dropdown-label">${(settings.volStep || 0.05) * 100}%</span>
                            <span class="ag-dropdown-arrow"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m2 3.5 3 3 3-3"/></svg></span>
                        </div>
                        <div class="ag-dropdown-menu">
                            <div class="ag-dropdown-item ${settings.volStep === 0.01 ? 'selected' : ''}" data-value="0.01">1%</div>
                            <div class="ag-dropdown-item ${settings.volStep === 0.05 || !settings.volStep ? 'selected' : ''}" data-value="0.05">5%</div>
                            <div class="ag-dropdown-item ${settings.volStep === 0.10 ? 'selected' : ''}" data-value="0.10">10%</div>
                        </div>
                    </div>
                </div>
                <div class="ag-set-desc">Величина изменения громкости при вращении колесика мыши.</div>

                <div class="ag-set-row">
                    <span>Случайное аниме: минимальная оценка</span>
                    <div class="ag-custom-dropdown" id="s-randomMinScore" data-value="${settings.random_min_score || '6.0'}">
                        <div class="ag-dropdown-trigger">
                            <span class="ag-dropdown-label">${
                                {
                                    'any': 'Без ограничений',
                                    '5.0': 'От 5.0 ★', '5': 'От 5.0 ★',
                                    '5.5': 'От 5.5 ★',
                                    '6.0': 'От 6.0 ★ (Среднее)', '6': 'От 6.0 ★ (Среднее)',
                                    '6.5': 'От 6.5 ★',
                                    '7.0': 'От 7.0 ★ (Хорошие)', '7': 'От 7.0 ★ (Хорошие)',
                                    '7.5': 'От 7.5 ★',
                                    '8.0': 'От 8.0 ★ (Высокий)', '8': 'От 8.0 ★ (Высокий)',
                                    '8.5': 'От 8.5 ★',
                                    '9.0': 'От 9.0 ★ (Шедевры)', '9': 'От 9.0 ★ (Шедевры)'
                                }[String(settings.random_min_score)] || 'От 6.0 ★ (Среднее)'
                            }</span>
                            <span class="ag-dropdown-arrow"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m2 3.5 3 3 3-3"/></svg></span>
                        </div>
                        <div class="ag-dropdown-menu">
                            <div class="ag-dropdown-item ${settings.random_min_score === 'any' ? 'selected' : ''}" data-value="any">Без ограничений</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '5.0' || String(settings.random_min_score) === '5' ? 'selected' : ''}" data-value="5.0">От 5.0 ★</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '5.5' ? 'selected' : ''}" data-value="5.5">От 5.5 ★</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '6.0' || String(settings.random_min_score) === '6' || !settings.random_min_score ? 'selected' : ''}" data-value="6.0">От 6.0 ★ (Среднее)</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '6.5' ? 'selected' : ''}" data-value="6.5">От 6.5 ★</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '7.0' || String(settings.random_min_score) === '7' ? 'selected' : ''}" data-value="7.0">От 7.0 ★ (Хорошие)</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '7.5' ? 'selected' : ''}" data-value="7.5">От 7.5 ★</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '8.0' || String(settings.random_min_score) === '8' ? 'selected' : ''}" data-value="8.0">От 8.0 ★ (Высокий)</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '8.5' ? 'selected' : ''}" data-value="8.5">От 8.5 ★</div>
                            <div class="ag-dropdown-item ${String(settings.random_min_score) === '9.0' || String(settings.random_min_score) === '9' ? 'selected' : ''}" data-value="9.0">От 9.0 ★ (Шедевры)</div>
                        </div>
                    </div>
                </div>
                <div class="ag-set-desc">Минимальная оценка на Shikimori для подбора через кнопку «Случайное аниме».</div>

                <div class="ag-set-row ag-set-row-stack">
                    <span>Случайное аниме: типы</span>
                    <div class="ag-chips">
                        ${['tv', 'movie', 'ova', 'ona', 'special'].map(k => {
                            const labels = { tv: 'Сериалы (TV)', movie: 'Фильмы', ova: 'OVA', ona: 'ONA', special: 'Спешлы' };
                            const rkArr = Array.isArray(settings.random_kinds) ? settings.random_kinds : ['tv', 'movie', 'ona', 'ova', 'special'];
                            const isChecked = rkArr.includes(k) ? 'checked' : '';
                            return `
                                <label class="ag-chip">
                                    <input type="checkbox" class="s-rk" value="${k}" ${isChecked}> ${labels[k]}
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div class="ag-set-desc">Разрешенные типы тайтлов при подборе через кнопку «Случайное аниме».</div>

                <div class="ag-set-row">
                    <span>Исчезновение меню: <span id="v-ht" class="ag-set-value">${settings.hideTime / 1000}</span>с</span>
                </div>
                <div class="ag-set-desc">Задержка до автоматического скрытия панели управления.</div>
                <input type="range" id="s-hideTime" min="500" max="5000" step="500" value="${settings.hideTime}" class="ag-range">
            </div>

            <!-- Tab 5: Hotkeys -->
            <div class="ag-tab-content" id="tab-hotkeys">
                <div class="ag-set-desc">Нажмите на кнопку, затем на клавишу, которую хотите назначить.</div>
                ${renderKeyRow('fs', 'На весь экран', 'Разворачивает плеер в кастомный полноэкранный режим.')}
                ${renderKeyRow('skip', 'Пропустить (Skip)', 'Пропускает опенинг/эндинг или перематывает на 85 секунд вперед.')}
                ${renderKeyRow('next', 'След. серия', 'Переключает на следующую серию.')}
                ${renderKeyRow('prev', 'Пред. серия', 'Переключает на предыдущую серию.')}
                ${renderKeyRow('forward', 'Вперед на 5с', 'Перематывает видео на 5 секунд вперед.')}
                ${renderKeyRow('rewind', 'Назад на 5с', 'Перематывает видео на 5 секунд назад.')}
            </div>
            
            <div class="ag-footer-btns">
                <button type="button" id="ag-reset" class="ag-btn-main">Сбросить</button>
                <button type="button" id="ag-save" class="ag-btn-main">Сохранить</button>
            </div>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        modal.replaceChildren(...doc.body.childNodes);

        if (options.accent) {
            if (window.AgUI) window.AgUI.applyAccent(options.accent, modal);
        }
        overlay.style.display = modal.style.display = 'block';
        document.body.classList.add('ag-modal-open');

        const tabs = modal.querySelectorAll('.ag-tab-btn');
        const contents = modal.querySelectorAll('.ag-tab-content');
        tabs.forEach(tab => {
            tab.onclick = () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.getAttribute('data-tab');
                modal.querySelector(`#tab-${target}`)?.classList.add('active');
            };
        });

        let currentVoiceList = Array.isArray(settings.voice_priority_list) ? [...settings.voice_priority_list] : [
            "Anilibria", "Studio Band", "Dream Cast", "Дубляж", "SHIZA Project", "Subtitles"
        ];

        const renderVoicePriorityList = () => {
            const listContainer = modal.querySelector('#ag-voice-priority-list-container');
            if (!listContainer) return;
            listContainer.innerHTML = '';

            currentVoiceList.forEach((voiceName, index) => {
                const item = document.createElement('div');
                item.className = 'ag-vp-item';
                item.innerHTML = `
                    <div class="ag-vp-name">
                        <span class="ag-vp-rank">${index + 1}</span>
                        <span>${window.agEscapeHtml ? window.agEscapeHtml(voiceName) : voiceName}</span>
                    </div>
                    <div class="ag-vp-actions">
                        <button type="button" class="ag-vp-up" aria-label="Выше" ${index === 0 ? 'disabled' : ''}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 7.5 3.5-3.5 3.5 3.5"/></svg></button>
                        <button type="button" class="ag-vp-down" aria-label="Ниже" ${index === currentVoiceList.length - 1 ? 'disabled' : ''}><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 4.5 3.5 3.5 3.5-3.5"/></svg></button>
                        <button type="button" class="ag-vp-del" aria-label="Удалить">${icon('close', 13)}</button>
                    </div>
                `;

                item.querySelector('.ag-vp-up')?.addEventListener('click', () => {
                    if (index > 0) {
                        const temp = currentVoiceList[index];
                        currentVoiceList[index] = currentVoiceList[index - 1];
                        currentVoiceList[index - 1] = temp;
                        renderVoicePriorityList();
                    }
                });

                item.querySelector('.ag-vp-down')?.addEventListener('click', () => {
                    if (index < currentVoiceList.length - 1) {
                        const temp = currentVoiceList[index];
                        currentVoiceList[index] = currentVoiceList[index + 1];
                        currentVoiceList[index + 1] = temp;
                        renderVoicePriorityList();
                    }
                });

                item.querySelector('.ag-vp-del')?.addEventListener('click', () => {
                    currentVoiceList.splice(index, 1);
                    renderVoicePriorityList();
                });

                listContainer.appendChild(item);
            });
        };

        const addVoiceBtn = modal.querySelector('#ag-add-voice-btn');
        const addVoiceInput = modal.querySelector('#ag-new-voice-input');
        if (addVoiceBtn && addVoiceInput) {
            const handleAdd = () => {
                const val = addVoiceInput.value.trim();
                if (val && !currentVoiceList.includes(val)) {
                    currentVoiceList.push(val);
                    addVoiceInput.value = '';
                    renderVoicePriorityList();
                }
            };
            addVoiceBtn.onclick = handleAdd;
            addVoiceInput.onkeydown = (e) => { if (e.key === 'Enter') handleAdd(); };
        }

        renderVoicePriorityList();

        const saveSettings = async () => {
            const rmsVal = modal.querySelector('#s-randomMinScore')?.dataset.value || '6.0';
            const volVal = modal.querySelector('#s-volStep')?.dataset.value || '0.05';

            const selectedKinds = [];
            modal.querySelectorAll('.s-rk').forEach(cb => {
                if (cb.checked) selectedKinds.push(cb.value);
            });

            // Только поля этого окна: остальное берётся из хранилища (agPatchSettings)
            const patch = {
                hideTime: parseInt(document.getElementById('s-hideTime').value),
                volStep: parseFloat(volVal),
                random_min_score: rmsVal !== 'any' ? parseFloat(rmsVal) : 'any',
                random_kinds: selectedKinds.length > 0 ? selectedKinds : ['tv', 'movie', 'ona', 'ova', 'special'],
                auto_select_voice: modal.querySelector('#set-autoSelectVoice') ? modal.querySelector('#set-autoSelectVoice').checked : true,
                voice_priority_list: currentVoiceList,
                keys: settings.keys
            };
            ['autoPlay', 'autoNext', 'autoFS', 'autoSkip', 'audioSkip', 'kodikShell', 'showNav', 'showSkipBtn', 'showPiP', 'showCenterBtn', 'showDBL', ...(options.extraInterfaceRows || []).map(r => r.id)].forEach(k => {
                const el = document.getElementById(`s-${k}`);
                if (el) patch[k] = el.checked;
            });

            const newS = await window.agPatchSettings(patch);

            // Новые настройки — во все окна плеера (на сайтах-провайдерах первый iframe бывает баннером)
            const targets = typeof options.getPlayerWindows === 'function'
                ? options.getPlayerWindows()
                : [document.querySelector('iframe')?.contentWindow].filter(Boolean);
            targets.forEach(w => { try { w.postMessage({ type: 'AG_SETTINGS_UPDATE', settings: newS }, '*'); } catch (e) {} });

            if (typeof onSaveCallback === 'function') {
                onSaveCallback(newS);
            }
        };

        modal.querySelectorAll('.ag-custom-dropdown').forEach(dropdown => {
            const trigger = dropdown.querySelector('.ag-dropdown-trigger');
            const menu = dropdown.querySelector('.ag-dropdown-menu');
            const label = dropdown.querySelector('.ag-dropdown-label');

            if (!trigger || !menu) return;

            trigger.onclick = (e) => {
                e.stopPropagation();
                modal.querySelectorAll('.ag-custom-dropdown.open').forEach(other => {
                    if (other !== dropdown) other.classList.remove('open');
                });
                dropdown.classList.toggle('open');
            };

            menu.querySelectorAll('.ag-dropdown-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    const val = item.getAttribute('data-value');
                    const txt = item.textContent.trim();
                    dropdown.setAttribute('data-value', val);
                    label.textContent = txt;

                    menu.querySelectorAll('.ag-dropdown-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    dropdown.classList.remove('open');
                };
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.ag-custom-dropdown')) {
                modal.querySelectorAll('.ag-custom-dropdown.open').forEach(d => d.classList.remove('open'));
            }
        }, { capture: true });

        const closeSettings = () => {
            overlay.style.display = modal.style.display = 'none';
            document.body.classList.remove('ag-modal-open');
            if (activeKeyListener) {
                document.removeEventListener('keydown', activeKeyListener, true);
                activeKeyListener = null;
            }
        };

        overlay.onclick = closeSettings;
        modal.querySelector('#ag-settings-close')?.addEventListener('click', closeSettings);

        modal.querySelectorAll('.ag-key-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                if (activeKeyListener) {
                    document.removeEventListener('keydown', activeKeyListener, true);
                    modal.querySelectorAll('.ag-key-btn').forEach(b => b.classList.remove('listening'));
                }

                btn.classList.add('listening');
                const action = btn.getAttribute('data-action');

                activeKeyListener = (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    let key = evt.key.toUpperCase();
                    if (key === ' ') key = 'SPACE';
                    if (key === 'ESCAPE') key = settings.keys[action];

                    settings.keys[action] = key;
                    btn.textContent = key;
                    btn.classList.remove('listening');
                    document.removeEventListener('keydown', activeKeyListener, true);
                    activeKeyListener = null;
                };

                document.addEventListener('keydown', activeKeyListener, true);
            };
        });

        document.getElementById('s-hideTime').oninput = (e) => {
            document.getElementById('v-ht').textContent = (e.target.value / 1000).toFixed(1);
        };

        modal.querySelector('#ag-save').onclick = () => {
            saveSettings();
            closeSettings();
            if (window.showAgToast) window.showAgToast('Настройки сохранены');
        };

        modal.querySelector('#ag-reset').onclick = () => {
            if (window.DEFAULT_SETTINGS) {
                const newS = JSON.parse(JSON.stringify(window.DEFAULT_SETTINGS));
                chrome.storage.local.set({ ag_settings: newS });
                if (typeof onSaveCallback === 'function') onSaveCallback(newS);
                closeSettings();
                if (window.showAgToast) window.showAgToast('Настройки сброшены');
            }
        };
    };

    window.agInjectHeaderGearButton = function (openCallback) {
        if (document.getElementById('ag-header-settings-gear')) return;

        const rightNav = document.querySelector('.header-navbar .navbar-nav.header-navbar-nav.justify-content-end') ||
                         document.querySelector('.header-navbar .justify-content-end');

        if (rightNav) {
            const navItem = document.createElement('div');
            navItem.className = 'nav-item';

            const btn = document.createElement('button');
            btn.id = 'ag-header-settings-gear';
            btn.type = 'button';
            btn.className = 'nav-link d-inline-flex icon-link align-items-center justify-content-center';
            btn.title = 'Настройки Anime+';
            btn.setAttribute('aria-label', 'Настройки Anime+');
            btn.style.cssText = 'font-size: 18px; cursor: pointer; border: none; background: transparent; padding: 0 8px; transition: transform 0.25s; text-decoration: none;';
            btn.innerHTML = icon('gear', 18);

            btn.onmouseover = () => { btn.style.transform = 'rotate(45deg)'; };
            btn.onmouseout = () => { btn.style.transform = 'rotate(0deg)'; };

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof openCallback === 'function') openCallback();
            };

            navItem.appendChild(btn);

            const themeItem = rightNav.querySelector('.nav-item:has(.navbar-theme)') || rightNav.firstElementChild;
            if (themeItem) {
                rightNav.insertBefore(navItem, themeItem);
            } else {
                rightNav.appendChild(navItem);
            }
        }
    };
})();
