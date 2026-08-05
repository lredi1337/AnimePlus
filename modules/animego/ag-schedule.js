// modules/animego/ag-schedule.js
// Модуль интеграции расписания онгоингов на AnimeGO

(function () {
    'use strict';

    const AG_RED = '#ef4444';
    const AG_FONT = "'Inter', system-ui, sans-serif";
    const AG_NO_POSTER_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='140' viewBox='0 0 100 140'><rect width='100' height='140' fill='%231e293b'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-size='12'>Нет фото</text></svg>";

    const injectScheduleStyles = () => {
        if (document.getElementById('ag-schedule-styles')) return;
        const style = document.createElement('style');
        style.id = 'ag-schedule-styles';
        style.textContent = `
            /* --- НАСТРОЙКИ РАСПИСАНИЯ (SCHEDULE SETTINGS) --- */
            #ag-schedule-settings-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                color: #f8fafc;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 5px 12px;
                font-size: 12px;
                font-weight: 600;
                font-family: ${AG_FONT};
                cursor: pointer;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                backdrop-filter: blur(8px);
                margin-left: auto;
                user-select: none;
                outline: none;
            }
            #ag-schedule-settings-btn:hover, #ag-schedule-settings-btn.active {
                background: rgba(239, 68, 68, 0.15);
                border-color: rgba(239, 68, 68, 0.45);
                color: #ff6b6b;
                box-shadow: 0 4px 14px rgba(239, 68, 68, 0.25);
                transform: translateY(-1px);
            }
            #ag-schedule-settings-btn svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
                transition: transform 0.4s ease;
            }
            #ag-schedule-settings-btn:hover svg, #ag-schedule-settings-btn.active svg {
                transform: rotate(60deg);
            }

            #ag-schedule-settings-modal {
                display: none;
                position: relative;
                background: linear-gradient(145deg, rgba(17, 22, 34, 0.98) 0%, rgba(25, 31, 46, 0.98) 100%);
                color: #f8fafc;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 14px;
                padding: 18px 20px;
                margin-top: 10px;
                margin-bottom: 18px;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05), 0 0 24px rgba(239, 68, 68, 0.12);
                z-index: 9999;
                font-size: 13px;
                font-family: ${AG_FONT};
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                animation: agScheduleModalPop 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes agScheduleModalPop {
                from { opacity: 0; transform: translateY(-8px) scale(0.98); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            .ag-schedule-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .ag-schedule-modal-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 800;
                font-size: 13px;
                letter-spacing: 0.5px;
                text-transform: uppercase;
                color: #f8fafc;
            }
            .ag-schedule-modal-title .ag-badge-tag {
                background: linear-gradient(135deg, ${AG_RED} 0%, #b32a2a 100%);
                color: #ffffff;
                font-size: 10px;
                font-weight: 800;
                padding: 2px 7px;
                border-radius: 6px;
                letter-spacing: 0.3px;
                box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
            }
            .ag-schedule-modal-close {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: #94a3b8;
                width: 26px;
                height: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                padding: 0;
                outline: none;
            }
            .ag-schedule-modal-close:hover {
                background: rgba(239, 68, 68, 0.2);
                border-color: rgba(239, 68, 68, 0.4);
                color: #ffffff;
                transform: scale(1.05);
            }
            .ag-schedule-modal-close svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
            }

            .ag-schedule-group {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .ag-schedule-card-row {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 10px;
                padding: 10px 14px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                transition: border-color 0.2s ease, background 0.2s ease;
            }
            .ag-schedule-card-row:hover {
                background: rgba(255, 255, 255, 0.05);
                border-color: rgba(255, 255, 255, 0.1);
            }
            .ag-schedule-label-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .ag-schedule-label-title {
                font-size: 13px;
                font-weight: 600;
                color: #e2e8f0;
            }
            .ag-schedule-label-desc {
                font-size: 11px;
                color: #94a3b8;
            }

            /* Toggle Switch */
            .ag-switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
                flex-shrink: 0;
            }
            .ag-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .ag-slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: rgba(255, 255, 255, 0.15);
                transition: .3s;
                border-radius: 24px;
            }
            .ag-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .3s;
                border-radius: 50%;
            }
            .ag-switch input:checked + .ag-slider {
                background-color: ${AG_RED};
            }
            .ag-switch input:checked + .ag-slider:before {
                transform: translateX(20px);
            }

            /* Custom Dropdown */
            .ag-custom-dropdown {
                position: relative;
                user-select: none;
            }
            .ag-dropdown-trigger {
                background: rgba(255, 255, 255, 0.06);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                padding: 5px 10px;
                font-size: 12px;
                color: #e2e8f0;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 6px;
            }
            .ag-dropdown-trigger:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            .ag-dropdown-arrow {
                font-size: 9px;
                color: #94a3b8;
                transition: transform 0.2s ease;
            }
            .ag-custom-dropdown.open .ag-dropdown-arrow {
                transform: rotate(180deg);
            }
            .ag-dropdown-menu {
                display: none;
                position: absolute;
                right: 0;
                top: 105%;
                background: #1e293b;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                z-index: 10000;
                min-width: 110px;
                overflow: hidden;
            }
            .ag-custom-dropdown.open .ag-dropdown-menu {
                display: block;
            }
            .ag-dropdown-item {
                padding: 7px 12px;
                font-size: 12px;
                color: #cbd5e1;
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .ag-dropdown-item:hover {
                background: rgba(239, 68, 68, 0.2);
                color: #fff;
            }
            .ag-dropdown-item.selected {
                background: ${AG_RED};
                color: #fff;
                font-weight: 700;
            }

            .ag-schedule-types-container {
                background: rgba(255, 255, 255, 0.03);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 10px;
                padding: 12px 14px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .ag-schedule-types-header {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.6px;
                color: #94a3b8;
            }
            .ag-schedule-chips-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .ag-schedule-chip {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                border-radius: 20px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: #94a3b8;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                user-select: none;
                margin: 0;
            }
            .ag-schedule-chip input {
                display: none;
            }
            .ag-schedule-chip:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.2);
                color: #f1f5f9;
            }
            .ag-schedule-chip.active {
                background: linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.35) 100%);
                border-color: rgba(239, 68, 68, 0.6);
                color: #ffffff;
                box-shadow: 0 2px 10px rgba(239, 68, 68, 0.2);
            }
            .ag-schedule-chip-icon {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #64748b;
                transition: all 0.2s ease;
            }
            .ag-schedule-chip.active .ag-schedule-chip-icon {
                background: ${AG_RED};
                box-shadow: 0 0 6px ${AG_RED};
            }
        `;
        document.head.appendChild(style);
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function isDuplicateAnime(jutsuAnime, animeGoTitles) {
        if (!jutsuAnime || !animeGoTitles || animeGoTitles.length === 0) return false;
        const jTitle = (jutsuAnime.russian || jutsuAnime.name || '').toLowerCase().trim();
        if (!jTitle) return false;

        const cleanJTitle = jTitle.replace(/[^a-zа-я0-9]/gi, '');

        for (const agTitle of animeGoTitles) {
            const cleanAg = agTitle.toLowerCase().trim().replace(/[^a-zа-я0-9]/gi, '');
            if (!cleanAg || !cleanJTitle) continue;
            if (cleanJTitle === cleanAg || cleanJTitle.includes(cleanAg) || cleanAg.includes(cleanJTitle)) {
                return true;
            }
        }
        return false;
    }

    function injectScheduleSettingsButton() {
        if (document.getElementById('ag-schedule-settings-btn')) return;

        let titleEl = null;
        const candidates = document.querySelectorAll('.card-title, .h3, .h2, h3, h2, .title, .card-header');
        for (const el of candidates) {
            if (el.textContent && el.textContent.toLowerCase().includes('расписание')) {
                titleEl = el;
                break;
            }
        }

        if (!titleEl) {
            const widget = document.querySelector('.anime-widget, #schedule, .schedule');
            if (widget && widget.previousElementSibling) {
                titleEl = widget.previousElementSibling;
            }
        }

        if (!titleEl) return;

        titleEl.style.display = 'flex';
        titleEl.style.justifyContent = 'space-between';
        titleEl.style.alignItems = 'center';

        const btn = document.createElement('button');
        btn.id = 'ag-schedule-settings-btn';
        btn.type = 'button';
        btn.title = 'Настройки расписания (AnimeGO+)';
        btn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
            <span>Настройки</span>
        `;

        titleEl.appendChild(btn);

        let modal = document.getElementById('ag-schedule-settings-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'ag-schedule-settings-modal';
            titleEl.parentNode.insertBefore(modal, titleEl.nextSibling);
        }

        const closeModal = () => {
            modal.style.display = 'none';
            btn.classList.remove('active');
        };

        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (modal.style.display === 'block') {
                closeModal();
                return;
            }

            chrome.storage.local.get(['ag_settings'], (res) => {
                const settings = res.ag_settings || {};
                const allowedTypes = settings.ongoing_types || ["TV", "ONA", "OVA"];

                const scoreMap = {
                    0: 'Любой',
                    5: '≥ 5.0',
                    6: '≥ 6.0',
                    7: '≥ 7.0'
                };
                const currentMinScore = Number(settings.ongoing_min_score || 0);

                modal.innerHTML = `
                    <div class="ag-schedule-modal-header">
                        <div class="ag-schedule-modal-title">
                            <svg style="width:16px; height:16px; fill:#f87171;" viewBox="0 0 24 24">
                                <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                            </svg>
                            <span>Настройки расписания</span>
                            <span class="ag-badge-tag">AnimeGO+</span>
                        </div>
                        <button class="ag-schedule-modal-close" id="ag-settings-close" title="Закрыть">
                            <svg viewBox="0 0 24 24">
                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="ag-schedule-group">
                        <div class="ag-schedule-card-row">
                            <div class="ag-schedule-label-info">
                                <div class="ag-schedule-label-title">Интеграция с Jut.su</div>
                                <div class="ag-schedule-label-desc">Дополнять расписание аниме тайтлами с Jut.su</div>
                            </div>
                            <label class="ag-switch">
                                <input type="checkbox" id="ag-set-enabled" ${settings.ongoing_enabled !== false ? 'checked' : ''}>
                                <span class="ag-slider"></span>
                            </label>
                        </div>

                        <div class="ag-schedule-card-row">
                            <div class="ag-schedule-label-info">
                                <div class="ag-schedule-label-title">Фильтр китайских аниме</div>
                                <div class="ag-schedule-label-desc">Скрывать дуньхуа (китайские тайтлы)</div>
                            </div>
                            <label class="ag-switch">
                                <input type="checkbox" id="ag-set-hide-chinese" ${settings.ongoing_hide_chinese !== false ? 'checked' : ''}>
                                <span class="ag-slider"></span>
                            </label>
                        </div>

                        <div class="ag-schedule-card-row">
                            <div class="ag-schedule-label-info">
                                <div class="ag-schedule-label-title">Скрывать долгострои</div>
                                <div class="ag-schedule-label-desc">Скрывать длинные сериалы (>24 серий)</div>
                            </div>
                            <label class="ag-switch">
                                <input type="checkbox" id="ag-set-hide-long" ${settings.ongoing_hide_long_running ? 'checked' : ''}>
                                <span class="ag-slider"></span>
                            </label>
                        </div>

                        <div class="ag-schedule-card-row">
                            <div class="ag-schedule-label-info">
                                <div class="ag-schedule-label-title">Мин. рейтинг Shikimori</div>
                                <div class="ag-schedule-label-desc">Фильтровать тайтлы по оценке</div>
                            </div>
                            <div class="ag-custom-dropdown" id="ag-min-score-dropdown" style="width: 120px;">
                                <div class="ag-dropdown-trigger">
                                    <span id="ag-min-score-val">${scoreMap[currentMinScore] || 'Любой'}</span>
                                    <span class="ag-dropdown-arrow">▼</span>
                                </div>
                                <div class="ag-dropdown-menu">
                                    <div class="ag-dropdown-item ${currentMinScore === 0 ? 'selected' : ''}" data-value="0">Любой</div>
                                    <div class="ag-dropdown-item ${currentMinScore === 5 ? 'selected' : ''}" data-value="5">≥ 5.0</div>
                                    <div class="ag-dropdown-item ${currentMinScore === 6 ? 'selected' : ''}" data-value="6">≥ 6.0</div>
                                    <div class="ag-dropdown-item ${currentMinScore === 7 ? 'selected' : ''}" data-value="7">≥ 7.0</div>
                                </div>
                            </div>
                            <input type="hidden" id="ag-set-min-score" value="${currentMinScore}">
                        </div>

                        <div class="ag-schedule-types-container">
                            <div class="ag-schedule-types-header">Показывать типы</div>
                            <div class="ag-schedule-chips-grid">
                                <label class="ag-schedule-chip ${allowedTypes.includes('TV') ? 'active' : ''}">
                                    <span class="ag-schedule-chip-icon"></span>
                                    <input type="checkbox" id="ag-type-tv" ${allowedTypes.includes('TV') ? 'checked' : ''}> TV
                                </label>
                                <label class="ag-schedule-chip ${allowedTypes.includes('ONA') ? 'active' : ''}">
                                    <span class="ag-schedule-chip-icon"></span>
                                    <input type="checkbox" id="ag-type-ona" ${allowedTypes.includes('ONA') ? 'checked' : ''}> ONA
                                </label>
                                <label class="ag-schedule-chip ${allowedTypes.includes('OVA') ? 'active' : ''}">
                                    <span class="ag-schedule-chip-icon"></span>
                                    <input type="checkbox" id="ag-type-ova" ${allowedTypes.includes('OVA') ? 'checked' : ''}> OVA
                                </label>
                                <label class="ag-schedule-chip ${allowedTypes.includes('MOVIE') ? 'active' : ''}">
                                    <span class="ag-schedule-chip-icon"></span>
                                    <input type="checkbox" id="ag-type-movie" ${allowedTypes.includes('MOVIE') ? 'checked' : ''}> Фильмы
                                </label>
                                <label class="ag-schedule-chip ${allowedTypes.includes('SPECIAL') ? 'active' : ''}">
                                    <span class="ag-schedule-chip-icon"></span>
                                    <input type="checkbox" id="ag-type-special" ${allowedTypes.includes('SPECIAL') ? 'checked' : ''}> Спешлы
                                </label>
                            </div>
                        </div>
                    </div>
                `;

                modal.style.display = 'block';
                btn.classList.add('active');

                const closeBtn = document.getElementById('ag-settings-close');
                if (closeBtn) closeBtn.onclick = closeModal;

                const dropdown = document.getElementById('ag-min-score-dropdown');
                const hiddenInput = document.getElementById('ag-set-min-score');
                const valSpan = document.getElementById('ag-min-score-val');
                if (dropdown) {
                    const trigger = dropdown.querySelector('.ag-dropdown-trigger');
                    trigger.onclick = (e) => {
                        e.stopPropagation();
                        dropdown.classList.toggle('open');
                    };
                    dropdown.querySelectorAll('.ag-dropdown-item').forEach(item => {
                        item.onclick = (e) => {
                            e.stopPropagation();
                            const val = item.dataset.value;
                            hiddenInput.value = val;
                            valSpan.textContent = item.textContent;
                            dropdown.querySelectorAll('.ag-dropdown-item').forEach(i => i.classList.remove('selected'));
                            item.classList.add('selected');
                            dropdown.classList.remove('open');
                            saveAndRefresh();
                        };
                    });
                }

                modal.querySelectorAll('.ag-schedule-chip').forEach(chip => {
                    const cb = chip.querySelector('input[type="checkbox"]');
                    cb.addEventListener('change', () => {
                        chip.classList.toggle('active', cb.checked);
                        saveAndRefresh();
                    });
                });

                const saveAndRefresh = () => {
                    const types = [];
                    if (document.getElementById('ag-type-tv')?.checked) types.push('TV');
                    if (document.getElementById('ag-type-ona')?.checked) types.push('ONA');
                    if (document.getElementById('ag-type-ova')?.checked) types.push('OVA');
                    if (document.getElementById('ag-type-movie')?.checked) types.push('MOVIE');
                    if (document.getElementById('ag-type-special')?.checked) types.push('SPECIAL');

                    const newSettings = {
                        ...settings,
                        ongoing_enabled: document.getElementById('ag-set-enabled').checked,
                        ongoing_hide_chinese: document.getElementById('ag-set-hide-chinese').checked,
                        ongoing_hide_long_running: document.getElementById('ag-set-hide-long').checked,
                        ongoing_min_score: parseFloat(document.getElementById('ag-set-min-score').value),
                        ongoing_types: types
                    };

                    chrome.storage.local.set({ ag_settings: newSettings }, () => {
                        document.querySelectorAll('.ag-jutsu-schedule-card').forEach(el => el.remove());
                        window.agInitScheduleEnhancer();
                    });
                };

                ['ag-set-enabled', 'ag-set-hide-chinese', 'ag-set-hide-long'].forEach(id => {
                    const elem = document.getElementById(id);
                    if (elem) elem.addEventListener('change', saveAndRefresh);
                });
            });
        };

        document.addEventListener('click', (e) => {
            if (modal && modal.style.display === 'block') {
                if (!modal.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                    closeModal();
                }
            }
        });
    }

    window.agInitScheduleEnhancer = function () {
        injectScheduleStyles();
        injectScheduleSettingsButton();

        const scheduleWidget = document.querySelector('.anime-widget, .aw-day, #schedule, .schedule');
        if (!scheduleWidget) {
            const section = document.querySelector('#ag-jutsu-schedule-section');
            if (section) section.remove();
            return;
        }

        chrome.runtime.sendMessage({ action: "get_ongoing_schedule" }, (response) => {
            if (!response || !Array.isArray(response.schedule) || response.schedule.length === 0) {
                document.querySelectorAll('.ag-jutsu-schedule-card').forEach(el => el.remove());
                return;
            }
            renderJutsuScheduleItems(response.schedule);
        });
    };

    function findTargetDayContainer(dayNum, dayNameMap, dayIdMap) {
        const keywords = dayNameMap[dayNum];
        if (!keywords) return null;

        const targetId = dayIdMap[dayNum];
        if (targetId) {
            const el = document.getElementById(targetId);
            if (el) return el;
        }

        const tabLinks = Array.from(document.querySelectorAll('.nav-tabs .nav-link, .schedule .nav-link, [data-bs-toggle="tab"], [data-toggle="tab"], .schedule-nav a, .schedule-nav button, .list-group-item, a[href*="#"]'));
        for (const tab of tabLinks) {
            const text = (tab.textContent || '').toLowerCase().trim();
            if (keywords.some(kw => text.includes(kw))) {
                const targetSel = tab.getAttribute('data-bs-target') || tab.getAttribute('href') || tab.getAttribute('data-target');
                if (targetSel && targetSel.startsWith('#') && targetSel.length > 1) {
                    const pane = document.querySelector(targetSel);
                    if (pane) return pane;
                }
            }
        }

        const directPane = document.querySelector(`#schedule-${dayNum}, [data-day="${dayNum}"], #day-${dayNum}`);
        if (directPane) return directPane;

        const allDayBlocks = Array.from(document.querySelectorAll('.tab-pane, .aw-day, .schedule-day, [data-day]'));
        for (const block of allDayBlocks) {
            const text = (block.textContent || '').toLowerCase();
            if (keywords.some(kw => text.includes(kw))) {
                return block;
            }
        }

        return null;
    }

    function findInnerListGrid(dayEl) {
        if (!dayEl) return null;
        const grid = dayEl.querySelector('.d-grid, .schedule-body');
        if (grid) return grid;

        const list = dayEl.querySelector('[class*="scroll"], [style*="overflow"], [style*="max-height"], .tab-pane-content, .schedule-item-list, .media-list, .list-group');
        if (list) return list;

        const firstCard = dayEl.querySelector('a[href*="/anime/"], .media, .aw-item, .d-flex');
        if (firstCard && firstCard.parentElement && firstCard.parentElement !== dayEl) {
            return firstCard.parentElement;
        }

        return dayEl;
    }

    function renderJutsuScheduleItems(schedule) {
        if (!schedule || schedule.length === 0) return;

        const oldWidget = document.querySelector('#ag-jutsu-schedule-section');
        if (oldWidget) oldWidget.remove();

        const dayNameMap = {
            1: ['monday', 'понедельник', 'пн'],
            2: ['tuesday', 'вторник', 'вт'],
            3: ['wednesday', 'среда', 'ср'],
            4: ['thursday', 'четверг', 'чт'],
            5: ['friday', 'пятница', 'пт'],
            6: ['saturday', 'суббота', 'сб'],
            0: ['sunday', 'воскресенье', 'вс']
        };

        const dayIdMap = {
            1: 'collapse-monday',
            2: 'collapse-tuesday',
            3: 'collapse-wednesday',
            4: 'collapse-thursday',
            5: 'collapse-friday',
            6: 'collapse-saturday',
            0: 'collapse-sunday'
        };

        const allPageTitles = [];
        const titleNodes = document.querySelectorAll('.anime-widget .aw-name, .schedule .aw-name, .tab-content .aw-name, .aw-day .aw-name');
        titleNodes.forEach(el => {
            if (el.closest('.ag-jutsu-schedule-card')) return;
            const txt = el.textContent ? el.textContent.trim() : '';
            if (txt) allPageTitles.push(txt);
        });

        if (allPageTitles.length === 0) {
            const linkNodes = document.querySelectorAll('.anime-widget a[href*="/anime/"]:not(.ag-jutsu-schedule-card), .schedule a[href*="/anime/"]:not(.ag-jutsu-schedule-card)');
            linkNodes.forEach(el => {
                const txt = (el.getAttribute('title') || el.textContent || '').trim();
                if (txt && txt.length > 1) allPageTitles.push(txt);
            });
        }

        const missingOngoings = [];
        const addedIds = new Set();

        schedule.forEach(item => {
            if (!item || !item.id || addedIds.has(item.id)) return;
            if (isDuplicateAnime(item, allPageTitles)) return;
            addedIds.add(item.id);
            allPageTitles.push(item.russian || item.name);
            missingOngoings.push(item);
        });

        if (missingOngoings.length === 0) return;

        missingOngoings.forEach(item => {
            if (item.dayOfWeek === null || item.dayOfWeek === undefined) return;

            const dayNum = item.dayOfWeek;
            const targetDayEl = findTargetDayContainer(dayNum, dayNameMap, dayIdMap);
            if (!targetDayEl) return;

            const targetList = findInnerListGrid(targetDayEl);
            if (!targetList) return;

            if (targetList.querySelector(`[data-ag-shiki-id="${item.id}"]`)) return;

            const titleStr = escapeHtml(item.russian || item.name);
            let posterUrl = item.poster || '';
            if (window.agNormalizePosterUrl) {
                posterUrl = window.agNormalizePosterUrl(posterUrl);
            }
            const needsLazyPoster = !posterUrl || posterUrl.includes('missing') || posterUrl.includes('404') || posterUrl.includes('assets/globals') || posterUrl.includes('no-image') || posterUrl.includes('stub') || posterUrl.includes('no-poster');
            if (needsLazyPoster) {
                posterUrl = AG_NO_POSTER_SVG;
            }

            const epNum = item.nextEpisode ? `Серия ${item.nextEpisode}` : 'Новая серия';
            const isAccordionLayout = !!targetDayEl.closest('.anime-widget') || (targetDayEl.id && targetDayEl.id.startsWith('collapse-'));

            const card = document.createElement('a');
            card.href = item.jutsuUrl;
            card.target = '_blank';
            card.dataset.agShikiId = item.id;
            card.dataset.agRussian = item.russian || '';
            card.dataset.agName = item.name || '';
            card.dataset.agYear = item.year || '';
            card.dataset.agKind = item.kind || '';

            const safeRuStr = (item.russian || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeEnStr = (item.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

            if (isAccordionLayout) {
                card.className = 'aw-item text-decoration-none text-reset mw-0 ag-jutsu-schedule-card';
                card.innerHTML = `
                    <div class="aw-cover">
                        <div class="image__picture aspect-ratio-5-7">
                            <img referrerpolicy="no-referrer" class="image__img img-fluid rounded ag-lazy-poster-img" src="${posterUrl}" alt="${titleStr}" onerror="if(window.agHandlePosterError) window.agHandlePosterError(this, '${titleStr}', ${item.id || 'null'}, '${safeRuStr}', '${safeEnStr}'); else this.src='${AG_NO_POSTER_SVG}';">
                        </div>
                    </div>
                    <div class="aw-info gap-1 mw-0 justify-content-start">
                        <div class="aw-name text-line-clamp" style="--lines-to-show: 2;">
                            ${titleStr}
                        </div>
                        <div class="aw-meta small opacity-75 d-flex align-items-center gap-1 flex-wrap">
                            <span>${epNum}</span>
                            <span class="badge" style="font-size: 0.65rem; font-weight: 500; background: rgba(239, 68, 68, 0.15) !important; color: #f87171 !important; border: 1px solid rgba(239, 68, 68, 0.3) !important; padding: 1px 5px; border-radius: 4px; vertical-align: middle;">jut-su.net ↗</span>
                        </div>
                    </div>
                `;
            } else {
                card.className = 'd-flex align-items-center p-2 mb-2 rounded ag-jutsu-schedule-card text-decoration-none';
                card.style.cssText = 'background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; cursor: pointer; transition: background 0.2s, border-color 0.2s; display: flex;';
                card.onmouseover = () => { card.style.background = 'rgba(239, 68, 68, 0.08)'; card.style.borderColor = 'rgba(239, 68, 68, 0.5)'; };
                card.onmouseout = () => { card.style.background = 'rgba(255, 255, 255, 0.03)'; card.style.borderColor = 'rgba(239, 68, 68, 0.25)'; };

                card.innerHTML = `
                    <div style="width: 48px; height: 68px; flex-shrink: 0; margin-right: 12px; overflow: hidden; border-radius: 6px; position: relative;">
                        <img referrerpolicy="no-referrer" class="image__img img-fluid rounded ag-lazy-poster-img" src="${posterUrl}" alt="${titleStr}" style="width: 100%; height: 100%; object-fit: cover;" onerror="if(window.agHandlePosterError) window.agHandlePosterError(this, '${titleStr}', ${item.id || 'null'}, '${safeRuStr}', '${safeEnStr}'); else this.src='${AG_NO_POSTER_SVG}';">
                    </div>
                    <div style="flex-grow: 1; min-width: 0;">
                        <div class="text-truncate" style="font-weight: 600; font-size: 0.9rem; color: #fff; margin-bottom: 2px;">${titleStr}</div>
                        <div class="text-truncate" style="font-size: 0.78rem; color: #94a3b8; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                            <span>${epNum}</span>
                            <span class="badge" style="font-size: 0.65rem; font-weight: 500; background: rgba(239, 68, 68, 0.15) !important; color: #f87171 !important; border: 1px solid rgba(239, 68, 68, 0.3) !important; padding: 1px 5px; border-radius: 4px;">jut-su.net ↗</span>
                        </div>
                    </div>
                `;
            }

            if (needsLazyPoster) {
                chrome.runtime.sendMessage({
                    action: "resolve_jutsu_cover",
                    id: item.id,
                    russian: item.russian,
                    name: item.name
                }, (res) => {
                    const coverUrl = res ? (res.poster || res.url) : null;
                    if (coverUrl) {
                        const img = card.querySelector('.ag-lazy-poster-img');
                        if (img) img.src = coverUrl;
                    }
                });
            }

            card.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                let targetUrl = item.jutsuUrl || card.href;
                if (targetUrl && !targetUrl.includes('do=search') && !targetUrl.includes('subaction=')) {
                    window.open(targetUrl, '_blank');
                    return;
                }

                const russian = card.dataset.agRussian || item.russian || '';
                const name = card.dataset.agName || item.name || '';
                const year = card.dataset.agYear || item.year || '';
                const kind = card.dataset.agKind || item.kind || '';
                const searchQuery = russian || name;
                const fallbackUrl = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(searchQuery)}&ag_russian=${encodeURIComponent(russian)}&ag_name=${encodeURIComponent(name)}&ag_year=${encodeURIComponent(year)}&ag_kind=${encodeURIComponent(kind)}`;

                try {
                    const res = await new Promise((resolve) => {
                        const timer = setTimeout(() => resolve(null), 250);
                        chrome.runtime.sendMessage({
                            action: "resolve_direct_jutsu_url",
                            russian, name, year, kind, fallbackUrl
                        }, (resp) => {
                            clearTimeout(timer);
                            resolve(resp);
                        });
                    });
                    window.open((res && res.url) ? res.url : fallbackUrl, '_blank');
                } catch (err) {
                    window.open(fallbackUrl, '_blank');
                }
            });

            targetList.appendChild(card);
        });
    }

    document.addEventListener('click', (e) => {
        if (e.target && (e.target.closest('#schedule') || e.target.closest('.schedule') || e.target.closest('[data-day]') || e.target.closest('.nav-tabs') || e.target.closest('.list-group-item'))) {
            setTimeout(() => {
                if (window.agInitScheduleEnhancer) window.agInitScheduleEnhancer();
            }, 250);
        }
    });
})();
