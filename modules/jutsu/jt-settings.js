// modules/jutsu/jt-settings.js
// Модуль управления окном настроек Jut-Su

(function () {
    'use strict';
    const accentColor = '#3c8fff';
    const AG_FONT = window.AG_FONT || "'Inter', system-ui, sans-serif";
    const AG_RED = window.AG_RED || '#ef4444';

    function injectJutsuSettingsStyles() {
        if (document.getElementById('jt-settings-styles')) return;
        const style = document.createElement('style');
        style.id = 'jt-settings-styles';
        style.innerText = `
            #ag-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:9999999; display:none; backdrop-filter:blur(8px); }
            #ag-settings-modal { position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:linear-gradient(145deg, #131722, #1b2030); color:#fff; padding:24px; border-radius:16px; z-index:10000001; display:none; width:540px; max-width:92vw; font-family:${AG_FONT}; border:1px solid rgba(255, 255, 255, 0.08); box-shadow:0 24px 64px rgba(0,0,0,0.8); box-sizing: border-box; }
            
            .ag-tabs-nav { display: flex; background: rgba(0,0,0,0.25); padding: 4px; border-radius: 10px; margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.05); gap: 3px; }
            .ag-tab-btn { flex: 1; padding: 8px 4px; border-radius: 8px; border: none; background: transparent; color: #8892b0; font-weight: 700; cursor: pointer; transition: all 0.25s ease; font-size: 11.5px; display: flex; align-items: center; justify-content: center; gap: 4px; white-space: nowrap; }
            .ag-tab-btn:hover { color: #fff; background: rgba(255,255,255,0.04); }
            .ag-tab-btn.active { background: ${accentColor}; color: #fff; box-shadow: 0 4px 12px rgba(60, 143, 255, 0.3); }
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
            input:checked + .ag-slider { background: linear-gradient(135deg, ${accentColor}, #2273e6); }
            input:checked + .ag-slider:before { transform:translateX(18px); }
            
            .ag-key-btn { background:#252c3e; border:1px solid rgba(255,255,255,0.08); color:#e2e8f0; padding:6px 12px; border-radius:8px; font-size:12px; cursor:pointer; min-width:80px; text-align:center; transition: all 0.2s ease; font-family: monospace; text-transform:uppercase; box-shadow: 0 2px 0 rgba(0,0,0,0.3); font-weight: bold; }
            .ag-key-btn:hover { border-color:${accentColor}; color:${accentColor}; background: #2e374f; }
            .ag-key-btn.listening { background:${accentColor}; color:white; border-color:${accentColor}; animation: pulse 1s infinite; box-shadow: none; }
            
            .ag-footer-btns { display:flex; gap:12px; margin-top:28px; }
            .ag-btn-main { flex:1; padding:12px; border-radius:10px; cursor:pointer; border:none; font-weight:bold; font-family:${AG_FONT}; font-size: 14px; transition: all 0.2s ease; }
            #ag-save { background: linear-gradient(135deg, ${accentColor}, #2273e6); color:white; box-shadow: 0 4px 12px rgba(60, 143, 255, 0.3); }
            #ag-save:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(60, 143, 255, 0.4); }
            #ag-reset { background: rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); color:#b4c6ef; }
            #ag-reset:hover { background: rgba(255,255,255,0.08); color: #fff; }

            .jutsu-header__btn-settings { background: none !important; border: none !important; color: #a8b3cf !important; cursor: pointer !important; font-size: 20px !important; padding: 0 10px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; height: 40px !important; transition: color 0.25s, transform 0.25s !important; margin: 0 !important; }
            .jutsu-header__btn-settings:hover { color: #818cf8 !important; transform: rotate(45deg) !important; }

            .ag-custom-dropdown { position: relative; display: inline-block; width: 210px; font-family: ${AG_FONT}; user-select: none; }
            .ag-dropdown-trigger { width: 100%; box-sizing: border-box; background: rgba(255, 255, 255, 0.06); color: #f1f5f9; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px; padding: 8px 14px; font-size: 13px; font-weight: 600; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); }
            .ag-dropdown-trigger:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255, 255, 255, 0.28); transform: translateY(-1px); }
            .ag-custom-dropdown.open .ag-dropdown-trigger { border-color: ${accentColor}; box-shadow: 0 0 16px rgba(60, 143, 255, 0.35); background: rgba(255, 255, 255, 0.12); }
            .ag-dropdown-arrow { font-size: 10px; transition: transform 0.25s ease; opacity: 0.7; margin-left: 8px; }
            .ag-custom-dropdown.open .ag-dropdown-arrow { transform: rotate(180deg); opacity: 1; color: ${accentColor}; }
            .ag-dropdown-menu { position: absolute; top: calc(100% + 6px); left: 0; right: 0; width: 100%; box-sizing: border-box; background: #141824; border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05); padding: 6px; z-index: 10000030; display: none; max-height: 150px; overflow-y: auto; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
            .ag-custom-dropdown.open .ag-dropdown-menu { display: block; animation: agDropdownPop 0.18s cubic-bezier(0.16, 1, 0.3, 1); }
            @keyframes agDropdownPop { from { opacity: 0; transform: translateY(-8px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
            .ag-dropdown-menu::-webkit-scrollbar { width: 4px; }
            .ag-dropdown-menu::-webkit-scrollbar-track { background: transparent; }
            .ag-dropdown-menu::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 2px; }
            .ag-dropdown-item { padding: 8px 12px; color: #cbd5e1; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
            .ag-dropdown-item:hover { background: rgba(255, 255, 255, 0.08); color: #ffffff; padding-left: 16px; }
            .ag-dropdown-item.selected { background: ${accentColor}; color: #ffffff; font-weight: 700; box-shadow: 0 4px 12px rgba(60, 143, 255, 0.3); }
        `;
        document.head.appendChild(style);
    }

    window.jtInjectHeaderGearButton = function (openSettingsCallback) {
        if (document.getElementById('ag-header-settings-gear')) return;

        const header = document.querySelector('.jutsu-header__main') ||
            document.querySelector('.jutsu-header') ||
            document.querySelector('.header') ||
            document.querySelector('#header');

        if (!header) return;

        injectJutsuSettingsStyles();

        const themeBtn = header.querySelector('.jutsu-header__btn-theme-toggle') || header.querySelector('[class*="theme"]');

        const gear = document.createElement('button');
        gear.id = 'ag-header-settings-gear';
        gear.type = 'button';
        gear.className = 'jutsu-header__btn-settings icon icon-cog';
        gear.title = 'Настройки JUT-SU+';
        gear.setAttribute('aria-label', 'Настройки JUT-SU+');
        gear.innerHTML = '';

        gear.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openSettingsCallback === 'function') openSettingsCallback();
        };

        if (themeBtn && themeBtn.parentNode) {
            themeBtn.parentNode.insertBefore(gear, themeBtn);
        } else {
            header.appendChild(gear);
        }
    };

    window.jtOpenJutsuSettingsModal = function (settings, saveCallback) {
        injectJutsuSettingsStyles();

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

        const rmsVal = (settings.random_min_score !== undefined) ? String(settings.random_min_score) : '6.0';
        const volVal = settings.volStep || 0.05;

        modal.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 12px; text-align: left;">
                <div style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.25); color: #818cf8; font-size: 18px; line-height: 1;">⚙️</div>
                <div style="display: flex; flex-direction: column; justify-content: center;">
                    <h3 style="margin: 0; color: #fff; font-size: 18px; font-weight: 800; line-height: 1.2; letter-spacing: -0.3px; font-family: ${AG_FONT};">Настройки JUT-SU+</h3>
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

            <div class="ag-tab-content" id="tab-voice">
                <div class="ag-set-row" style="margin-bottom: 2px;">
                    <span>Автовыбор приоритетной озвучки</span>
                    <label class="ag-switch"><input type="checkbox" id="set-autoSelectVoice" ${settings.auto_select_voice !== false ? 'checked' : ''}><span class="ag-slider"></span></label>
                </div>
                <div class="ag-set-desc" style="margin-bottom: 8px;">Автоматически переключать плеер на наиболее предпочтительную доступную озвучку из списка ниже.</div>

                <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 8px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                        <span style="font-weight: 700; font-size: 12.5px; color: #fff; display: flex; align-items: center; gap: 6px;">🎙️ Приоритет озвучек</span>
                        <span style="font-size: 10.5px; font-weight: 600; color: #94a3b8; background: rgba(255, 255, 255, 0.08); padding: 2px 8px; border-radius: 10px;">#1 = наивысший</span>
                    </div>

                    <div id="ag-voice-priority-list-container" style="flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 6px;"></div>

                    <div style="display: flex; gap: 8px; margin-top: 2px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
                        <input type="text" id="ag-new-voice-input" placeholder="Добавить озвучку (напр. HDRezka)..." style="flex:1; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.12); color:#fff; padding:7px 12px; border-radius:8px; font-size:12px; outline:none;">
                        <button id="ag-add-voice-btn" style="background: linear-gradient(135deg, ${accentColor}, #2273e6); border:none; color:#fff; padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; box-shadow: 0 3px 10px rgba(60, 143, 255, 0.3);">+ Добавить</button>
                    </div>
                </div>
            </div>

            <div class="ag-tab-content active" id="tab-playback">
                <div class="ag-set-row"><span>Автоплей</span><label class="ag-switch"><input type="checkbox" id="set-autoPlay" ${settings.autoPlay ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Автоматически запускать воспроизведение при открытии серии.</div>

                <div class="ag-set-row"><span>Авто-развертывание</span><label class="ag-switch"><input type="checkbox" id="set-autoFS" ${settings.autoFS ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Автоматически расширять плеер на всю страницу при начале воспроизведения.</div>

                <div class="ag-set-row"><span>Автоматический переход</span><label class="ag-switch"><input type="checkbox" id="set-autoNext" ${settings.autoNext ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Автоматически переходить к следующей серии по окончании видео.</div>

                <div class="ag-set-row"><span>Пропуск опенингов (AniSkip)</span><label class="ag-switch"><input type="checkbox" id="set-autoSkip" ${settings.autoSkip ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Автоматически пропускать опенинги и эндинги по базе AniSkip.</div>

                <div class="ag-set-row"><span>Зоны клика</span><label class="ag-switch"><input type="checkbox" id="set-showDBL" ${settings.showDBL ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Двойной клик по левой/правой части экрана перематывает, по центру - во весь экран.</div>
            </div>

            <div class="ag-tab-content" id="tab-interface">
                <div class="ag-set-row"><span>Показывать панель</span><label class="ag-switch"><input type="checkbox" id="set-showNav" ${settings.showNav ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Показывать верхние кнопки перемотки и навигации в плеере.</div>

                <div class="ag-set-row"><span>Кнопки по центру</span><label class="ag-switch"><input type="checkbox" id="set-showCenterBtn" ${settings.showCenterBtn ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Показывать крупные кнопки перемотки на 5 секунд в центре плеера.</div>

                <div class="ag-set-row"><span>Кнопка PiP</span><label class="ag-switch"><input type="checkbox" id="set-showPiP" ${settings.showPiP !== false ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Отображать кнопку картинка-в-картинке в плеере.</div>

                <div class="ag-set-row"><span>Быстрый пропуск (85с)</span><label class="ag-switch"><input type="checkbox" id="set-showSkipBtn" ${settings.showSkipBtn ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Показывать кнопку быстрой перемотки вперед на опенинг (» 85с).</div>

                <div class="ag-set-row"><span>Стандартные обложки</span><label class="ag-switch"><input type="checkbox" id="set-useStandardCovers" ${settings.use_standard_covers ? 'checked' : ''}><span class="ag-slider"></span></label></div>
                <div class="ag-set-desc">Заменять оригинальные постеры Jut-Su на стандартные обложки аниме со Shikimori/Kitsu.</div>
            </div>

            <div class="ag-tab-content" id="tab-options">
                <div class="ag-set-row">
                    <span>Шаг громкости (скролл)</span>
                    <div class="ag-custom-dropdown" id="set-volStep" data-value="${volVal}">
                        <div class="ag-dropdown-trigger"><span class="ag-dropdown-label">${(volVal * 100)}%</span><span class="ag-dropdown-arrow">▼</span></div>
                        <div class="ag-dropdown-menu">
                            <div class="ag-dropdown-item ${volVal === 0.01 ? 'selected' : ''}" data-value="0.01">1%</div>
                            <div class="ag-dropdown-item ${volVal === 0.05 ? 'selected' : ''}" data-value="0.05">5%</div>
                            <div class="ag-dropdown-item ${volVal === 0.10 ? 'selected' : ''}" data-value="0.10">10%</div>
                        </div>
                    </div>
                </div>
                <div class="ag-set-desc">Величина изменения громкости при вращении колесика мыши.</div>

                <div class="ag-set-row" style="margin-top:16px;">
                    <span>🎲 Случайное аниме: Мин. рейтинг</span>
                    <div class="ag-custom-dropdown" id="s-randomMinScore" data-value="${rmsVal}">
                        <div class="ag-dropdown-trigger"><span class="ag-dropdown-label">От ${rmsVal} ★</span><span class="ag-dropdown-arrow">▼</span></div>
                        <div class="ag-dropdown-menu">
                            <div class="ag-dropdown-item ${rmsVal === 'any' ? 'selected' : ''}" data-value="any">Без ограничений</div>
                            <div class="ag-dropdown-item ${rmsVal === '6.0' ? 'selected' : ''}" data-value="6.0">От 6.0 ★ (Среднее)</div>
                            <div class="ag-dropdown-item ${rmsVal === '7.0' ? 'selected' : ''}" data-value="7.0">От 7.0 ★ (Хорошие)</div>
                            <div class="ag-dropdown-item ${rmsVal === '8.0' ? 'selected' : ''}" data-value="8.0">От 8.0 ★ (Высокий)</div>
                        </div>
                    </div>
                </div>
                <div class="ag-set-desc">Минимальная оценка на Shikimori для подбора через кнопку «Случайное аниме».</div>

                <div class="ag-set-row" style="margin-top:16px;">
                    <span>Исчезновение меню: <span id="v-ht-jutsu" style="color:${accentColor};">${(settings.hideTime || 2000) / 1000}</span>с</span>
                </div>
                <div class="ag-set-desc">Задержка до автоматического скрытия панели управления.</div>
                <input type="range" id="set-hideTime" min="500" max="5000" step="500" value="${settings.hideTime || 2000}" style="width:100%; accent-color:${accentColor}; margin-bottom:16px;">
            </div>

            <div class="ag-tab-content" id="tab-hotkeys">
                <div class="ag-set-row"><span>Расширить/Сжать</span><button class="ag-key-btn" id="key-fs">${settings.keys?.fs || 'Esc'}</button></div>
                <div style="height: 12px;"></div>
                <div class="ag-set-row"><span>Вперед +5с</span><button class="ag-key-btn" id="key-forward">${settings.keys?.forward || '→'}</button></div>
                <div style="height: 12px;"></div>
                <div class="ag-set-row"><span>Назад -5с</span><button class="ag-key-btn" id="key-rewind">${settings.keys?.rewind || '←'}</button></div>
                <div style="height: 12px;"></div>
                <div class="ag-set-row"><span>Следующая серия</span><button class="ag-key-btn" id="key-next">${settings.keys?.next || 'N'}</button></div>
                <div style="height: 12px;"></div>
                <div class="ag-set-row"><span>Предыдущая серия</span><button class="ag-key-btn" id="key-prev">${settings.keys?.prev || 'P'}</button></div>
                <div style="height: 12px;"></div>
                <div class="ag-set-row"><span>Пропуск (Умный)</span><button class="ag-key-btn" id="key-skip">${settings.keys?.skip || 'S'}</button></div>
            </div>

            <div class="ag-footer-btns">
                <button class="ag-btn-main" id="ag-reset">Сбросить</button>
                <button class="ag-btn-main" id="ag-save">Сохранить</button>
            </div>
        `;

        overlay.style.display = 'block';
        modal.style.display = 'block';
        document.body.classList.add('ag-modal-open');

        const close = () => {
            overlay.style.display = 'none';
            modal.style.display = 'none';
            document.body.classList.remove('ag-modal-open');
        };
        overlay.onclick = close;

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
                    item.style.borderColor = 'rgba(60, 143, 255, 0.35)';
                };
                item.onmouseleave = () => {
                    item.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))';
                    item.style.borderColor = 'rgba(255,255,255,0.08)';
                };

                item.innerHTML = `
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="font-size:10.5px; font-weight:800; color:#fff; background:linear-gradient(135deg, ${accentColor}, #2273e6); padding:2px 7px; border-radius:5px; box-shadow:0 2px 6px rgba(60,143,255,0.3);">#${index + 1}</span>
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

        modal.querySelector('#ag-save').onclick = async () => {
            const updated = {
                ...settings,
                autoPlay: modal.querySelector('#set-autoPlay')?.checked ?? true,
                autoFS: modal.querySelector('#set-autoFS')?.checked ?? false,
                autoNext: modal.querySelector('#set-autoNext')?.checked ?? true,
                showNav: modal.querySelector('#set-showNav')?.checked ?? true,
                showCenterBtn: modal.querySelector('#set-showCenterBtn')?.checked ?? true,
                showPiP: modal.querySelector('#set-showPiP')?.checked ?? true,
                showSkipBtn: modal.querySelector('#set-showSkipBtn')?.checked ?? true,
                autoSkip: modal.querySelector('#set-autoSkip')?.checked ?? true,
                showDBL: modal.querySelector('#set-showDBL')?.checked ?? true,
                use_standard_covers: modal.querySelector('#set-useStandardCovers')?.checked ?? false,
                auto_select_voice: modal.querySelector('#set-autoSelectVoice')?.checked ?? true,
                voice_priority_list: currentVoiceList,
                volStep: parseFloat(modal.querySelector('#set-volStep')?.dataset.value || 0.05),
                hideTime: parseInt(modal.querySelector('#set-hideTime')?.value || 2000)
            };
            await chrome.storage.local.set({ ag_settings: updated });
            if (typeof saveCallback === 'function') saveCallback(updated);
            close();
        };

        modal.querySelector('#ag-reset').onclick = () => {
            if (window.DEFAULT_SETTINGS) {
                const def = JSON.parse(JSON.stringify(window.DEFAULT_SETTINGS));
                chrome.storage.local.set({ ag_settings: def });
                if (typeof saveCallback === 'function') saveCallback(def);
                close();
            }
        };
    };
})();
