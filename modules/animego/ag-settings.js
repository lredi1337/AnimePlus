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
        style.innerText = `
            #ag-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:9999999; display:none; backdrop-filter:blur(8px); }
            #ag-settings-modal { position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:linear-gradient(145deg, #131722, #1b2030); color:#fff; padding:24px; border-radius:16px; z-index:10000001; display:none; width:540px; max-width:92vw; font-family:${AG_FONT}; border:1px solid rgba(255, 255, 255, 0.08); box-shadow:0 24px 64px rgba(0,0,0,0.8); box-sizing: border-box; }
            
            .ag-tabs-nav { display: flex; background: rgba(0,0,0,0.25); padding: 4px; border-radius: 10px; margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.05); gap: 3px; }
            .ag-tab-btn { flex: 1; padding: 8px 4px; border-radius: 8px; border: none; background: transparent; color: #8892b0; font-weight: 700; cursor: pointer; transition: all 0.25s ease; font-size: 11.5px; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; }
            .ag-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.04); }
            .ag-tab-btn.active { background: linear-gradient(135deg, ${AG_RED}, #b32a2a); color: #fff; box-shadow: 0 4px 12px rgba(227, 68, 68, 0.3); }
            .ag-tab-content { display: none; height: 330px; overflow-y: auto; padding-right: 4px; box-sizing: border-box; }
            .ag-tab-content.active { display: block; }
            #tab-voice.active { display: flex !important; flex-direction: column; overflow: hidden; padding-right: 0; }
            
            .ag-tab-content::-webkit-scrollbar { width: 4px; }
            .ag-tab-content::-webkit-scrollbar-track { background: transparent; }
            .ag-tab-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
            
            .ag-set-row { display:flex; justify-content:space-between; align-items:center; margin: 12px 0 4px 0; font-size:15px; font-weight:bold; }
            .ag-set-desc { font-size:11px; color:#7e8b9b; margin-bottom:16px; line-height:1.4; padding-right:20px; }
            
            .ag-switch { position:relative; width:40px; height:22px; cursor:pointer; display: inline-block; }
            .ag-switch input { opacity:0; width:0; height:0; }
            .ag-slider { position:absolute; inset:0; background:#252c3e; border-radius:20px; transition:.3s ease; border: 1px solid rgba(255,255,255,0.05); }
            .ag-slider:before { position:absolute; content:""; height:16px; width:16px; left:2px; bottom:2px; background:white; transition:.3s cubic-bezier(0.18, 0.89, 0.35, 1.15); border-radius:50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
            input:checked + .ag-slider { background: linear-gradient(135deg, ${AG_RED}, #b32a2a); }
            input:checked + .ag-slider:before { transform:translateX(18px); }
            
            .ag-key-btn { background:#252c3e; border:1px solid rgba(255,255,255,0.08); color:#e2e8f0; padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer; min-width:80px; text-align:center; transition: all 0.2s ease; font-family: monospace; text-transform:uppercase; box-shadow: 0 2px 0 rgba(0,0,0,0.3); font-weight: bold; }
            .ag-key-btn:hover { border-color:${AG_RED}; color:${AG_RED}; background: #2e374f; }
            .ag-key-btn.listening { background:${AG_RED}; color:white; border-color:${AG_RED}; animation: pulse 1s infinite; box-shadow: none; }
            
            .ag-footer-btns { display:flex; gap:12px; margin-top:28px; }
            .ag-btn-main { flex:1; padding:12px; border-radius:10px; cursor:pointer; border:none; font-weight:bold; font-family:${AG_FONT}; font-size: 14px; transition: all 0.2s ease; }
            #ag-save { background: linear-gradient(135deg, ${AG_RED}, #b32a2a); color:white; box-shadow: 0 4px 12px rgba(227, 68, 68, 0.3); }
            #ag-save:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(227, 68, 68, 0.4); }
            #ag-reset { background: rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); color:#b4c6ef; }
            #ag-reset:hover { background: rgba(255,255,255,0.08); color: #fff; }
            @keyframes pulse { 0% {opacity:1;} 50% {opacity:0.7;} 100% {opacity:1;} }

            .ag-custom-dropdown { position: relative; display: inline-block; width: 210px; font-family: ${AG_FONT}; user-select: none; }
            .ag-dropdown-trigger { width: 100%; box-sizing: border-box; background: rgba(255, 255, 255, 0.06); color: #f1f5f9; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); }
            .ag-dropdown-trigger:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.28); transform: translateY(-1px); }
            .ag-custom-dropdown.open .ag-dropdown-trigger { border-color: ${AG_RED}; box-shadow: 0 0 16px rgba(239, 68, 68, 0.35); background: rgba(255, 255, 255, 0.12); }
            .ag-dropdown-arrow { font-size: 10px; transition: transform 0.25s ease; opacity: 0.7; margin-left: 8px; }
            .ag-custom-dropdown.open .ag-dropdown-arrow { transform: rotate(180deg); opacity: 1; color: ${AG_RED}; }
            .ag-dropdown-menu { position: absolute; top: calc(100% + 6px); left: 0; right: 0; width: 100%; box-sizing: border-box; background: #141824; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05); padding: 6px; z-index: 10000030; display: none; max-height: 150px; overflow-y: auto; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
            .ag-custom-dropdown.open .ag-dropdown-menu { display: block; animation: agDropdownPop 0.18s cubic-bezier(0.16, 1, 0.3, 1); }
            @keyframes agDropdownPop { from { opacity: 0; transform: translateY(-8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
            .ag-dropdown-menu::-webkit-scrollbar { width: 4px; }
            .ag-dropdown-menu::-webkit-scrollbar-track { background: transparent; }
            .ag-dropdown-menu::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 2px; }
            .ag-dropdown-item { padding: 8px 12px; color: #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
            .ag-dropdown-item:hover { background: rgba(255, 255, 255, 0.08); color: #ffffff; padding-left: 16px; }
            .ag-dropdown-item.selected { background: ${AG_RED}; color: #ffffff; font-weight: 700; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3); }
        `;
        document.head.appendChild(style);
    }

    window.agOpenAnimeGoSettingsModal = function (settings, onSaveCallback) {
        injectSettingsStyles();

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
        const renderKeyRow = (action, title, desc) => `<div class="ag-set-row"><span>${title}</span><button class="ag-key-btn" data-action="${action}">${settings.keys[action]}</button></div><div class="ag-set-desc">${desc}</div>`;

        let activeKeyListener = null;

        const html = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 12px; text-align: left;">
                <div style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(227, 68, 68, 0.12); border: 1px solid rgba(227, 68, 68, 0.25); color: ${AG_RED}; font-size: 18px; line-height: 1;">⚙️</div>
                <div style="display: flex; flex-direction: column; justify-content: center;">
                    <h3 style="margin: 0; color: #fff; font-size: 18px; font-weight: 800; line-height: 1.2; letter-spacing: -0.3px; font-family: ${AG_FONT};">Настройки AnimeGO<span style="color:${AG_RED};">+</span></h3>
                    <span style="font-size: 10.5px; color: #64748b; font-weight: 600; letter-spacing: 0.2px; margin-top: 1px; font-family: ${AG_FONT};">by l_red_i</span>
                </div>
            </div>

            <div class="ag-tabs-nav">
                <button class="ag-tab-btn active" data-tab="playback">📺 Плеер</button>
                <button class="ag-tab-btn" data-tab="voice">🎙️ Озвучка</button>
                <button class="ag-tab-btn" data-tab="interface">🎨 Интерфейс</button>
                <button class="ag-tab-btn" data-tab="options">⚙️ Опции</button>
                <button class="ag-tab-btn" data-tab="hotkeys">⌨️ Клавиши</button>
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
                        <button id="ag-add-voice-btn" style="background: linear-gradient(135deg, ${AG_RED}, #b32a2a); border: none; border-radius: 8px; color: #fff; font-weight: bold; padding: 7px 14px; cursor: pointer; font-size: 12px; font-family: ${AG_FONT}; box-shadow: 0 3px 10px rgba(239, 68, 68, 0.3);">+ Добавить</button>
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
                                    <input type="checkbox" class="s-rk" value="${k}" ${isChecked} style="accent-color: ${AG_RED}; cursor: pointer;"> ${labels[k]}
                                </label>
                            `;
                        }).join('')}
                    </div>
                </div>
                <div class="ag-set-desc">Разрешенные типы тайтлов при подборе через кнопку «Случайное аниме».</div>

                <div class="ag-set-row" style="margin-top: 15px;">
                    <span>Исчезновение меню: <span id="v-ht" style="color:${AG_RED};">${settings.hideTime / 1000}</span>с</span>
                </div>
                <div class="ag-set-desc">Задержка до автоматического скрытия панели управления.</div>
                <input type="range" id="s-hideTime" min="500" max="5000" step="500" value="${settings.hideTime}" style="width:100%; accent-color:${AG_RED}; margin-bottom:16px;">
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
                <button id="ag-reset" class="ag-btn-main">Сбросить</button>
                <button id="ag-save" class="ag-btn-main">Сохранить</button>
            </div>`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        modal.replaceChildren(...doc.body.childNodes);

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
                        <span style="font-size:10.5px; font-weight:800; color:#fff; background:linear-gradient(135deg, ${AG_RED}, #b32a2a); padding:2px 7px; border-radius:5px; box-shadow:0 2px 6px rgba(227,68,68,0.3);">#${index + 1}</span>
                        <span style="color:#f8fafc; font-weight:600;">${window.agEscapeHtml ? window.agEscapeHtml(voiceName) : voiceName}</span>
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="ag-vp-up" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;" ${index === 0 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▲</button>
                        <button class="ag-vp-down" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:10px; display:flex; align-items:center; justify-content:center;" ${index === currentVoiceList.length - 1 ? 'disabled style="opacity:0.25; cursor:not-allowed;"' : ''}>▼</button>
                        <button class="ag-vp-del" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:6px; width:24px; height:24px; cursor:pointer; font-size:12px; font-weight:700; display:flex; align-items:center; justify-content:center;">×</button>
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

        const saveSettings = () => {
            const rmsVal = modal.querySelector('#s-randomMinScore')?.dataset.value || '6.0';
            const volVal = modal.querySelector('#s-volStep')?.dataset.value || '0.05';

            const selectedKinds = [];
            modal.querySelectorAll('.s-rk').forEach(cb => {
                if (cb.checked) selectedKinds.push(cb.value);
            });

            const newS = {
                ...settings,
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
                if (el) newS[k] = el.checked;
            });

            chrome.storage.local.set({ ag_settings: newS });

            const iframe = document.querySelector('iframe');
            if (iframe?.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'AG_SETTINGS_UPDATE', settings: newS }, '*');
            }

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
