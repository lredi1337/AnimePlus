// modules/animego/ag-settings.js
// Модуль управления окном настроек AnimeGO

(function () {
    'use strict';
    const AG_RED = window.AG_RED || '#ef4444';
    const AG_FONT = window.AG_FONT || "'Inter', system-ui, sans-serif";

    function injectSettingsStyles() {
        if (document.getElementById('ag-settings-styles')) return;
        const style = document.createElement('style');
        style.id = 'ag-settings-styles';
        style.textContent = `
            #ag-modal-overlay {
                position: fixed !important;
                inset: 0 !important;
                background: rgba(0, 0, 0, 0.7) !important;
                z-index: 9999999 !important;
                display: none;
                backdrop-filter: blur(8px) !important;
                -webkit-backdrop-filter: blur(8px) !important;
            }

            #ag-settings-modal {
                --ag-set-accent: ${AG_RED};
                --ag-set-accent-dark: #b32a2a;
                position: fixed !important;
                top: 50% !important;
                left: 50% !important;
                transform: translate(-50%, -50%) !important;
                background: linear-gradient(145deg, #131722, #1b2030) !important;
                color: #fff !important;
                padding: 24px !important;
                border-radius: 16px !important;
                z-index: 10000001 !important;
                display: none;
                width: 540px !important;
                max-width: 92vw !important;
                font-family: ${AG_FONT} !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
                box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8) !important;
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
                font-family: ${AG_FONT} !important;
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

            #ag-settings-modal .ag-modal-close-btn {
                all: unset !important;
                box-sizing: border-box !important;
                width: 30px !important;
                height: 30px !important;
                min-width: 30px !important;
                max-width: 30px !important;
                border-radius: 8px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                color: #94a3b8 !important;
                font-size: 20px !important;
                line-height: 1 !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                background: rgba(255, 255, 255, 0.05) !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
                padding: 0 !important;
                margin: 0 !important;
            }
            #ag-settings-modal .ag-modal-close-btn:hover {
                color: #fff !important;
                background: rgba(255, 255, 255, 0.12) !important;
                border-color: rgba(255, 255, 255, 0.2) !important;
                transform: scale(1.05) !important;
            }

            #ag-settings-modal .ag-tabs-nav {
                display: flex !important;
                background: rgba(0, 0, 0, 0.25) !important;
                padding: 4px !important;
                border-radius: 10px !important;
                margin-bottom: 20px !important;
                border: 1px solid rgba(255, 255, 255, 0.05) !important;
                gap: 3px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }

            #ag-settings-modal .ag-tab-btn {
                all: unset !important;
                box-sizing: border-box !important;
                flex: 1 1 0 !important;
                min-width: 0 !important;
                padding: 8px 4px !important;
                border-radius: 8px !important;
                border: none !important;
                background: transparent !important;
                color: #8892b0 !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                transition: all 0.25s ease !important;
                font-size: 11.5px !important;
                font-family: ${AG_FONT} !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 4px !important;
                white-space: nowrap !important;
                text-transform: none !important;
                letter-spacing: normal !important;
                box-shadow: none !important;
                height: auto !important;
                line-height: 1.2 !important;
                margin: 0 !important;
            }
            #ag-settings-modal .ag-tab-btn:hover {
                color: #fff !important;
                background: rgba(255, 255, 255, 0.04) !important;
            }
            #ag-settings-modal .ag-tab-btn.active {
                background: linear-gradient(135deg, var(--ag-set-accent), var(--ag-set-accent-dark)) !important;
                color: #fff !important;
                box-shadow: 0 4px 12px rgba(227, 68, 68, 0.3) !important;
            }

            #ag-settings-modal .ag-tab-content {
                display: none;
                height: 330px !important;
                overflow-y: auto !important;
                padding-right: 4px !important;
                box-sizing: border-box !important;
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

            #ag-settings-modal .ag-tab-content::-webkit-scrollbar { width: 4px; }
            #ag-settings-modal .ag-tab-content::-webkit-scrollbar-track { background: transparent; }
            #ag-settings-modal .ag-tab-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 2px; }

            #ag-settings-modal .ag-set-row {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                margin: 12px 0 4px 0 !important;
                font-size: 15px !important;
                font-weight: bold !important;
                color: #fff !important;
                text-transform: none !important;
                letter-spacing: normal !important;
                line-height: 1.4 !important;
            }
            #ag-settings-modal .ag-set-desc {
                font-size: 11px !important;
                color: #7e8b9b !important;
                margin-bottom: 16px !important;
                line-height: 1.4 !important;
                padding-right: 20px !important;
                text-transform: none !important;
                letter-spacing: normal !important;
            }

            #ag-settings-modal .ag-switch {
                position: relative !important;
                width: 40px !important;
                height: 22px !important;
                cursor: pointer !important;
                display: inline-block !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
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
                background: #252c3e !important;
                border-radius: 20px !important;
                transition: .3s ease !important;
                border: 1px solid rgba(255, 255, 255, 0.05) !important;
                box-sizing: border-box !important;
            }
            #ag-settings-modal .ag-slider:before {
                position: absolute !important;
                content: "" !important;
                height: 16px !important;
                width: 16px !important;
                left: 2px !important;
                bottom: 2px !important;
                background: white !important;
                transition: .3s cubic-bezier(0.18, 0.89, 0.35, 1.15) !important;
                border-radius: 50% !important;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
            }
            #ag-settings-modal input:checked + .ag-slider {
                background: linear-gradient(135deg, var(--ag-set-accent), var(--ag-set-accent-dark)) !important;
            }
            #ag-settings-modal input:checked + .ag-slider:before {
                transform: translateX(18px) !important;
            }

            #ag-settings-modal .ag-key-btn {
                all: unset !important;
                box-sizing: border-box !important;
                background: #252c3e !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
                color: #e2e8f0 !important;
                padding: 6px 12px !important;
                border-radius: 8px !important;
                font-size: 12px !important;
                cursor: pointer !important;
                min-width: 80px !important;
                text-align: center !important;
                transition: all 0.2s ease !important;
                font-family: monospace !important;
                text-transform: uppercase !important;
                box-shadow: 0 2px 0 rgba(0, 0, 0, 0.3) !important;
                font-weight: bold !important;
                display: inline-block !important;
                height: auto !important;
                line-height: normal !important;
            }
            #ag-settings-modal .ag-key-btn:hover {
                border-color: var(--ag-set-accent) !important;
                color: var(--ag-set-accent) !important;
                background: #2e374f !important;
            }
            #ag-settings-modal .ag-key-btn.listening {
                background: var(--ag-set-accent) !important;
                color: white !important;
                border-color: var(--ag-set-accent) !important;
                animation: pulse 1s infinite !important;
                box-shadow: none !important;
            }

            #ag-settings-modal .ag-footer-btns {
                display: flex !important;
                gap: 12px !important;
                margin-top: 28px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }
            #ag-settings-modal .ag-btn-main {
                all: unset !important;
                box-sizing: border-box !important;
                flex: 1 1 0 !important;
                padding: 12px 20px !important;
                border-radius: 10px !important;
                cursor: pointer !important;
                border: none !important;
                font-weight: 700 !important;
                font-family: ${AG_FONT} !important;
                font-size: 14px !important;
                transition: all 0.2s ease !important;
                text-align: center !important;
                text-transform: none !important;
                letter-spacing: normal !important;
                height: auto !important;
                line-height: normal !important;
                display: block !important;
            }
            #ag-settings-modal #ag-save {
                background: linear-gradient(135deg, var(--ag-set-accent), var(--ag-set-accent-dark)) !important;
                color: white !important;
                box-shadow: 0 4px 12px rgba(227, 68, 68, 0.3) !important;
            }
            #ag-settings-modal #ag-save:hover {
                transform: translateY(-1px) !important;
                box-shadow: 0 6px 16px rgba(227, 68, 68, 0.4) !important;
            }
            #ag-settings-modal #ag-reset {
                background: rgba(255, 255, 255, 0.05) !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
                color: #b4c6ef !important;
                box-shadow: none !important;
            }
            #ag-settings-modal #ag-reset:hover {
                background: rgba(255, 255, 255, 0.08) !important;
                color: #fff !important;
            }

            #ag-settings-modal #ag-add-voice-btn {
                all: unset !important;
                box-sizing: border-box !important;
                background: linear-gradient(135deg, var(--ag-set-accent), var(--ag-set-accent-dark)) !important;
                border: none !important;
                border-radius: 8px !important;
                color: #fff !important;
                font-weight: bold !important;
                padding: 7px 14px !important;
                cursor: pointer !important;
                font-size: 12px !important;
                font-family: ${AG_FONT} !important;
                box-shadow: 0 3px 10px rgba(239, 68, 68, 0.3) !important;
                text-transform: none !important;
                height: auto !important;
                line-height: normal !important;
                display: inline-block !important;
            }
            #ag-settings-modal .ag-vp-up,
            #ag-settings-modal .ag-vp-down {
                all: unset !important;
                box-sizing: border-box !important;
                background: rgba(255, 255, 255, 0.08) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                color: #fff !important;
                border-radius: 6px !important;
                width: 24px !important;
                height: 24px !important;
                min-width: 24px !important;
                max-width: 24px !important;
                cursor: pointer !important;
                font-size: 10px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                box-shadow: none !important;
                text-transform: none !important;
                line-height: 1 !important;
            }
            #ag-settings-modal .ag-vp-del {
                all: unset !important;
                box-sizing: border-box !important;
                background: rgba(239, 68, 68, 0.15) !important;
                border: 1px solid rgba(239, 68, 68, 0.3) !important;
                color: #ef4444 !important;
                border-radius: 6px !important;
                width: 24px !important;
                height: 24px !important;
                min-width: 24px !important;
                max-width: 24px !important;
                cursor: pointer !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 0 !important;
                box-shadow: none !important;
                text-transform: none !important;
                line-height: 1 !important;
            }

            @keyframes pulse { 0% {opacity:1;} 50% {opacity:0.7;} 100% {opacity:1;} }

            #ag-settings-modal .ag-custom-dropdown { position: relative !important; display: inline-block !important; width: 210px !important; font-family: ${AG_FONT} !important; user-select: none !important; text-transform: none !important; }
            #ag-settings-modal .ag-dropdown-trigger { width: 100% !important; box-sizing: border-box !important; background: rgba(255, 255, 255, 0.06) !important; color: #f1f5f9 !important; border: 1px solid rgba(255, 255, 255, 0.14) !important; border-radius: 10px !important; padding: 8px 14px !important; font-size: 13px !important; font-weight: 600 !important; display: flex !important; justify-content: space-between !important; align-items: center !important; cursor: pointer !important; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2) !important; text-transform: none !important; line-height: normal !important; height: auto !important; }
            #ag-settings-modal .ag-dropdown-trigger:hover { background: rgba(255, 255, 255, 0.12) !important; border-color: rgba(255, 255, 255, 0.28) !important; transform: translateY(-1px) !important; }
            #ag-settings-modal .ag-custom-dropdown.open .ag-dropdown-trigger { border-color: var(--ag-set-accent) !important; box-shadow: 0 0 16px rgba(239, 68, 68, 0.35) !important; background: rgba(255, 255, 255, 0.12) !important; }
            #ag-settings-modal .ag-dropdown-arrow { font-size: 10px !important; transition: transform 0.25s ease !important; opacity: 0.7 !important; margin-left: 8px !important; }
            #ag-settings-modal .ag-custom-dropdown.open .ag-dropdown-arrow { transform: rotate(180deg) !important; opacity: 1 !important; color: var(--ag-set-accent) !important; }
            #ag-settings-modal .ag-dropdown-menu { position: absolute !important; top: calc(100% + 6px) !important; left: 0 !important; right: 0 !important; width: 100% !important; box-sizing: border-box !important; background: #141824 !important; border: 1px solid rgba(255, 255, 255, 0.16) !important; border-radius: 12px !important; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05) !important; padding: 6px !important; z-index: 10000030 !important; display: none; max-height: 150px !important; overflow-y: auto !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; text-transform: none !important; }
            #ag-settings-modal .ag-custom-dropdown.open .ag-dropdown-menu { display: block !important; animation: agDropdownPop 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important; }
            @keyframes agDropdownPop { from { opacity: 0; transform: translateY(-8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
            #ag-settings-modal .ag-dropdown-menu::-webkit-scrollbar { width: 4px; }
            #ag-settings-modal .ag-dropdown-menu::-webkit-scrollbar-track { background: transparent; }
            #ag-settings-modal .ag-dropdown-menu::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 2px; }
            #ag-settings-modal .ag-dropdown-item { padding: 8px 12px !important; color: #cbd5e1 !important; border-radius: 8px !important; font-size: 13px !important; font-weight: 500 !important; cursor: pointer !important; transition: all 0.15s ease !important; display: flex !important; align-items: center !important; justify-content: space-between !important; margin-bottom: 2px !important; text-transform: none !important; line-height: normal !important; }
            #ag-settings-modal .ag-dropdown-item:hover { background: rgba(255, 255, 255, 0.08) !important; color: #ffffff !important; padding-left: 16px !important; }
            #ag-settings-modal .ag-dropdown-item.selected { background: var(--ag-set-accent) !important; color: #ffffff !important; font-weight: 700 !important; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3) !important; }
        `;
        document.head.appendChild(style);
    }

    /**
     * Окно настроек расширения. Используется на AnimeGO и на сайтах-провайдерах (features/settings-entry.js).
     * @param {Object} settings
     * @param {Function} onSaveCallback
     * @param {{ brand?: string, accent?: string, getPlayerWindows?: () => Window[] }} [options]
     *        brand — название сайта в заголовке; accent — цвет сайта; getPlayerWindows — куда отправить
     *        AG_SETTINGS_UPDATE (по умолчанию первый iframe страницы, как было на AnimeGO)
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
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 12px; text-align: left;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(227, 68, 68, 0.12); border: 1px solid rgba(227, 68, 68, 0.25); color: var(--ag-set-accent); font-size: 18px; line-height: 1;">⚙️</div>
                    <div style="display: flex; flex-direction: column; justify-content: center;">
                        <h3 style="margin: 0; color: #fff; font-size: 18px; font-weight: 800; line-height: 1.2; letter-spacing: -0.3px; font-family: ${AG_FONT};">Настройки ${window.agEscapeHtml ? window.agEscapeHtml(brand) : brand}<span style="color:var(--ag-set-accent);">+</span></h3>
                        <span style="font-size: 10.5px; color: #64748b; font-weight: 600; letter-spacing: 0.2px; margin-top: 1px; font-family: ${AG_FONT};">by l_red_i</span>
                    </div>
                </div>
                <button type="button" id="ag-settings-close" class="ag-modal-close-btn" title="Закрыть" aria-label="Закрыть">✕</button>
            </div>

            <div class="ag-tabs-nav">
                <button type="button" class="ag-tab-btn active" data-tab="playback">📺 Плеер</button>
                <button type="button" class="ag-tab-btn" data-tab="voice">🎙️ Озвучка</button>
                <button type="button" class="ag-tab-btn" data-tab="interface">🎨 Интерфейс</button>
                <button type="button" class="ag-tab-btn" data-tab="options">⚙️ Опции</button>
                <button type="button" class="ag-tab-btn" data-tab="hotkeys">⌨️ Клавиши</button>
            </div>

            <!-- Tab 1: Playback -->
            <div class="ag-tab-content active" id="tab-playback">
                ${renderRow('autoPlay', 'Авто-плей', 'Автоматически нажимает Play при открытии серии.')}
                ${renderRow('autoNext', 'Авто-переход', 'Автоматически переключает на следующую серию в конце.')}
                ${renderRow('autoFS', 'Псевдо-фуллскрин', 'Улучшенный фуллскрин без рамок.')}
                ${renderRow('autoSkip', 'Авто-скип (AniSkip)', 'Автоматический пропуск опенингов и эндингов по базе AniSkip.')}
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

                <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 8px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                        <span style="font-weight: 700; font-size: 12.5px; color: #fff; display: flex; align-items: center; gap: 6px;">
                            🎙️ Приоритет озвучек
                        </span>
                        <span style="font-size: 10.5px; font-weight: 600; color: #94a3b8; background: rgba(255, 255, 255, 0.08); padding: 2px 8px; border-radius: 10px;">
                            #1 = наивысший
                        </span>
                    </div>

                    <div id="ag-voice-priority-list-container" style="flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 6px;"></div>

                    <div style="display: flex; gap: 8px; margin-top: 2px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <input type="text" id="ag-new-voice-input" placeholder="Добавить озвучку (напр. HDRezka)..." style="flex: 1; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; color: #fff; padding: 7px 12px; font-size: 12px; font-family: ${AG_FONT}; outline: none;">
                        <button type="button" id="ag-add-voice-btn" style="background: linear-gradient(135deg, var(--ag-set-accent), var(--ag-set-accent-dark)); border: none; border-radius: 8px; color: #fff; font-weight: bold; padding: 7px 14px; cursor: pointer; font-size: 12px; font-family: ${AG_FONT}; box-shadow: 0 3px 10px rgba(239, 68, 68, 0.3);">+ Добавить</button>
                    </div>
                </div>
            </div>

            <!-- Tab 3: Interface -->
            <div class="ag-tab-content" id="tab-interface">
                ${renderRow('showNav', 'Стрелки серий', 'Показывать кнопки < и > по бокам плеера.')}
                ${renderRow('showSkipBtn', 'Кнопка +90с', 'Показывать кнопку быстрой перемотки опенинга.')}
                ${renderRow('showPiP', 'Кнопка PiP', 'Показывать кнопку Картинка-в-Картинке.')}
                ${renderRow('showCenterBtn', 'Кнопки перемотки', 'Дополнительные кнопки -5с / +5с в центре плеера.')}
            </div>

            <!-- Tab 4: Options -->
            <div class="ag-tab-content" id="tab-options">
                <div class="ag-set-row">
                    <span>Шаг громкости (скролл)</span>
                    <div class="ag-custom-dropdown" id="s-volStep" data-value="${settings.volStep || 0.05}">
                        <div class="ag-dropdown-trigger">
                            <span class="ag-dropdown-label">${(settings.volStep || 0.05) * 100}%</span>
                            <span class="ag-dropdown-arrow">▼</span>
                        </div>
                        <div class="ag-dropdown-menu">
                            <div class="ag-dropdown-item ${settings.volStep === 0.01 ? 'selected' : ''}" data-value="0.01">1%</div>
                            <div class="ag-dropdown-item ${settings.volStep === 0.05 || !settings.volStep ? 'selected' : ''}" data-value="0.05">5%</div>
                            <div class="ag-dropdown-item ${settings.volStep === 0.10 ? 'selected' : ''}" data-value="0.10">10%</div>
                        </div>
                    </div>
                </div>
                <div class="ag-set-desc">Величина изменения громкости при вращении колесика мыши.</div>

                <div class="ag-set-row" style="margin-top: 15px;">
                    <span>🎲 Случайное аниме: Мин. рейтинг</span>
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
                            <span class="ag-dropdown-arrow">▼</span>
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

                <div class="ag-set-row" style="margin-top: 15px; align-items: flex-start; flex-direction: column; gap: 8px;">
                    <span style="font-weight: 600; color: #fff;">🎲 Случайное аниме: Типы контента</span>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; width: 100%; margin-top: 4px;">
                        ${['tv', 'movie', 'ova', 'ona', 'special'].map(k => {
                            const labels = { tv: 'Сериалы (TV)', movie: 'Фильмы', ova: 'OVA', ona: 'ONA', special: 'Спешлы' };
                            const rkArr = Array.isArray(settings.random_kinds) ? settings.random_kinds : ['tv', 'movie', 'ona', 'ova', 'special'];
                            const isChecked = rkArr.includes(k) ? 'checked' : '';
                            return `
                                <label style="display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #ddd; cursor: pointer; background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.08);">
                                    <input type="checkbox" class="s-rk" value="${k}" ${isChecked} style="accent-color: var(--ag-set-accent); cursor: pointer;"> ${labels[k]}
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div class="ag-set-desc">Разрешенные типы тайтлов при подборе через кнопку «Случайное аниме».</div>

                <div class="ag-set-row" style="margin-top: 15px;">
                    <span>Исчезновение меню: <span id="v-ht" style="color:var(--ag-set-accent);">${settings.hideTime / 1000}</span>с</span>
                </div>
                <div class="ag-set-desc">Задержка до автоматического скрытия панели управления.</div>
                <input type="range" id="s-hideTime" min="500" max="5000" step="500" value="${settings.hideTime}" style="width:100%; accent-color:var(--ag-set-accent); margin-bottom:16px;">
            </div>

            <!-- Tab 5: Hotkeys -->
            <div class="ag-tab-content" id="tab-hotkeys">
                <p style="font-size:11px; color:#7e8b9b; margin-top:-5px; margin-bottom:15px; line-height: 1.4;">Нажмите на клавишу, затем нажмите кнопку на клавиатуре для изменения.</p>
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
            modal.style.setProperty('--ag-set-accent', options.accent);
            modal.style.setProperty('--ag-set-accent-dark', `color-mix(in srgb, ${options.accent} 72%, black)`);
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
                item.style.cssText = 'display:flex; align-items:center; justify-content:space-between; background:linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:6px 10px; font-size:12.5px; transition:all 0.2s ease;';
                
                item.onmouseenter = () => {
                    item.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.04))';
                    item.style.borderColor = 'rgba(255,74,74,0.35)';
                };
                item.onmouseleave = () => {
                    item.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))';
                    item.style.borderColor = 'rgba(255,255,255,0.08)';
                };

                item.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10.5px; font-weight:800; color:#fff; background:linear-gradient(135deg, var(--ag-set-accent), var(--ag-set-accent-dark)); padding:2px 7px; border-radius:5px; box-shadow:0 2px 6px rgba(227,68,68,0.3);">#${index + 1}</span>
                        <span style="color:#f8fafc; font-weight:600;">${window.agEscapeHtml ? window.agEscapeHtml(voiceName) : voiceName}</span>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button type="button" class="ag-vp-up" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;" ${index === 0 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▲</button>
                        <button type="button" class="ag-vp-down" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;" ${index === currentVoiceList.length - 1 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▼</button>
                        <button type="button" class="ag-vp-del" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center;">×</button>
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
            ['autoPlay', 'autoNext', 'autoFS', 'autoSkip', 'showNav', 'showSkipBtn', 'showPiP', 'showCenterBtn', 'showDBL'].forEach(k => {
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
            if (window.showAgToast) window.showAgToast('Настройки сохранены!');
        };

        modal.querySelector('#ag-reset').onclick = () => {
            if (window.DEFAULT_SETTINGS) {
                const newS = JSON.parse(JSON.stringify(window.DEFAULT_SETTINGS));
                chrome.storage.local.set({ ag_settings: newS });
                if (typeof onSaveCallback === 'function') onSaveCallback(newS);
                closeSettings();
                if (window.showAgToast) window.showAgToast('Настройки сброшены!');
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
            btn.title = 'Настройки AnimeGO+';
            btn.setAttribute('aria-label', 'Настройки AnimeGO+');
            btn.style.cssText = 'font-size: 18px; cursor: pointer; border: none; background: transparent; padding: 0 8px; transition: transform 0.25s; text-decoration: none;';
            btn.innerHTML = '⚙️';

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
