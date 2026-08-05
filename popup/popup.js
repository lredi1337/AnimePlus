document.addEventListener('DOMContentLoaded', async () => {
    // --- State & Settings ---
    const res = await chrome.storage.local.get(['ag_settings']);
    let settings = res.ag_settings || {};
    if (settings.global_enabled === undefined) settings.global_enabled = true;

    // --- DOM Elements ---
    const extToggle = document.getElementById('extToggle');
    const extBody = document.getElementById('extBody');
    const extOffNote = document.getElementById('extOffNote');
    const brandEl = document.getElementById('popup-brand');
    const statusBox = document.getElementById('status-box');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');

    const siteToast = document.getElementById('siteToast');
    const playToast = document.getElementById('playToast');
    const trackerToast = document.getElementById('trackerToast');

    const btnAnimego = document.getElementById('btn-animego');
    const btnJutsu = document.getElementById('btn-jutsu');

    const shikiLoggedOut = document.getElementById('shiki-logged-out');
    const shikiLoggedIn = document.getElementById('shiki-logged-in');
    const shikiClientIdInput = document.getElementById('shiki-client-id');
    const shikiClientSecretInput = document.getElementById('shiki-client-secret');
    const shikiAuthCodeInput = document.getElementById('shiki-auth-code');
    const shikiCodeWrapper = document.getElementById('shiki-code-wrapper');
    const shikiErrorMsg = document.getElementById('shiki-error-msg');

    const btnShikiLoginLink = document.getElementById('btn-shiki-login-link');
    const btnShikiSubmitCode = document.getElementById('btn-shiki-submit-code');
    const btnShikiLogout = document.getElementById('btn-shiki-logout');

    const toggleCustomCreds = document.getElementById('toggle-custom-credentials');
    const customCredsWrapper = document.getElementById('custom-credentials-wrapper');

    const statusTextEl = document.getElementById('shiki-status-text');
    const todayCountEl = document.getElementById('shiki-today-count');

    const btnTabWatching = document.getElementById('btn-tab-watching');
    const btnTabRewatching = document.getElementById('btn-tab-rewatching');
    const watchingContainer = document.getElementById('shiki-watching-list');
    const searchWrapper = document.getElementById('shiki-search-wrapper');
    const listSearchInput = document.getElementById('shiki-list-search');
    const filterNote = document.getElementById('filterNote');

    const btnMusic = document.getElementById('btnMusic');
    const btnPlayer = document.getElementById('btnPlayer');
    const panelMusic = document.getElementById('panelMusic');
    const panelPlayer = document.getElementById('panelPlayer');
    const activationSection = document.getElementById('activation-section');
    const activateBtn = document.getElementById('btn-activate-player');

    const btnShiki = document.getElementById('btn-shiki');

    // --- Helper: Toast Notification ---
    function showToast(toastEl, message, duration = 2000) {
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.style.display = 'block';
        clearTimeout(toastEl.hideTimer);
        toastEl.hideTimer = setTimeout(() => {
            toastEl.style.display = 'none';
        }, duration);
    }

    // --- Extension Global Toggle ---
    function updateToggleState() {
        const isEnabled = settings.global_enabled !== false;
        if (extToggle) extToggle.classList.toggle('off', !isEnabled);
        if (extBody) extBody.style.display = isEnabled ? 'block' : 'none';
        if (extOffNote) extOffNote.style.display = isEnabled ? 'none' : 'block';
    }

    if (extToggle) {
        extToggle.addEventListener('click', async () => {
            settings.global_enabled = !(settings.global_enabled !== false);
            await chrome.storage.local.set({ ag_settings: settings });
            updateToggleState();

            // Reload active tab on toggle change
            chrome.tabs.query({ url: ["*://animego.me/*", "*://animego.org/*", "*://jut-su.net/*", "*://*.jut-su.net/*"] }, (tabs) => {
                tabs.forEach(tab => chrome.tabs.reload(tab.id));
            });
        });
    }
    updateToggleState();

    // --- Active Tab Check & Portal State ---
    let activeTab = null;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        activeTab = tabs[0];

        if (activeTab && activeTab.url) {
            const url = activeTab.url;
            if (url.includes("jut-su.net")) {
                setTheme('jutsu');
            } else if (url.includes("animego.me") || url.includes("animego.org")) {
                setTheme('animego');
            } else {
                setTheme('default');
            }
        } else {
            setTheme('default');
        }

        if (activeTab && (activeTab.url.includes("animego.me") || activeTab.url.includes("animego.org") || activeTab.url.includes("jut-su.net"))) {
            if (statusBox) statusBox.classList.add('active');
            if (statusDot) statusDot.className = 'dot';
            if (statusText) statusText.textContent = 'активно';

            if (activationSection) activationSection.style.display = 'block';

            // Ask for page info
            chrome.tabs.sendMessage(activeTab.id, { type: 'AG_GET_PAGE_INFO' }, (response) => {
                const musicLoading = document.getElementById('music-loading');
                if (chrome.runtime.lastError || !response) {
                    if (musicLoading) {
                        musicLoading.innerHTML = `
                            <div>⚠ Не удалось загрузить данные об аниме.</div>
                            <button id="btn-reload-tab" style="margin-top:6px; padding:5px 10px; font-size:11px; width:auto;">Обновить страницу</button>
                        `;
                        const reloadBtn = document.getElementById('btn-reload-tab');
                        if (reloadBtn) reloadBtn.onclick = () => chrome.tabs.reload(activeTab.id);
                    }
                    return;
                }

                if (response.title) {
                    const header = document.getElementById('anime-info-header');
                    if (header) {
                        header.style.display = 'block';
                        document.getElementById('detected-anime-title').textContent = response.origTitle 
                            ? `${response.title} / ${response.origTitle}` 
                            : response.title;
                        document.getElementById('detected-anime-episode').textContent = response.episode || "1";
                    }
                    fetchOPED(response.title, response.origTitle, response.episode || "1");
                } else {
                    if (musicLoading) musicLoading.textContent = "Аниме не найдено на этой странице.";
                }
            });
        } else {
            if (statusBox) statusBox.classList.remove('active');
            if (statusText) statusText.textContent = 'откройте плеер';
            const musicLoading = document.getElementById('music-loading');
            if (musicLoading) musicLoading.textContent = 'Откройте страницу аниме...';
        }
    });

    function setTheme(theme) {
        document.body.classList.remove('theme-animego', 'theme-jutsu', 'theme-default');
        if (theme === 'jutsu') {
            document.body.classList.add('theme-jutsu');
            if (brandEl) brandEl.innerHTML = 'JUT-SU<span>+</span>';
            if (btnJutsu) btnJutsu.classList.add('active');
            if (btnAnimego) btnAnimego.classList.remove('active');
        } else if (theme === 'animego') {
            document.body.classList.add('theme-animego');
            if (brandEl) brandEl.innerHTML = 'AnimeGO<span>+</span>';
            if (btnAnimego) btnAnimego.classList.add('active');
            if (btnJutsu) btnJutsu.classList.remove('active');
        } else {
            document.body.classList.add('theme-default');
            if (brandEl) brandEl.innerHTML = 'ANIME<span>+</span>';
            if (btnAnimego) btnAnimego.classList.remove('active');
            if (btnJutsu) btnJutsu.classList.remove('active');
        }
    }

    if (btnAnimego) {
        btnAnimego.onclick = () => {
            setTheme('animego');
            showToast(siteToast, "Переключено на AnimeGO — настройки плеера обновлены");
            window.open('https://animego.me', '_blank');
        };
    }
    if (btnJutsu) {
        btnJutsu.onclick = () => {
            setTheme('jutsu');
            showToast(siteToast, "Переключено на JUT-SU — настройки плеера обновлены");
            window.open('https://jut-su.net', '_blank');
        };
    }

    // --- Player Manual Activation ---
    if (activateBtn) {
        activateBtn.onclick = async () => {
            if (!activeTab) return;
            activateBtn.textContent = 'Активация...';
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id, allFrames: true },
                    files: ["config.js", "content-kodik.js"]
                });
                activateBtn.textContent = '✅ Плеер активирован!';
                setTimeout(() => window.close(), 1500);
            } catch (e) {
                console.error("Activation failed", e);
                activateBtn.textContent = '❌ Ошибка прав';
            }
        };
    }

    function setupPanel(btn, panel, otherPanel, otherBtn) {
        if (!btn || !panel) return;
        btn.addEventListener('click', () => {
            const isOpen = panel.style.display === 'block';
            if (otherPanel) otherPanel.style.display = 'none';
            if (otherBtn) otherBtn.classList.remove('active');
            panel.style.display = isOpen ? 'none' : 'block';
            btn.classList.toggle('active', !isOpen);
        });
    }
    setupPanel(btnMusic, panelMusic, panelPlayer, btnPlayer);
    setupPanel(btnPlayer, panelPlayer, panelMusic, btnMusic);

    // --- Footer Links ---
    if (btnShiki) {
        btnShiki.onclick = () => {
            showToast(trackerToast, "Открывается профиль на Shikimori");
            window.open('https://shikimori.one/animes', '_blank');
        };
    }

    // --- Shikimori Auth & Watchlist ---
    if (toggleCustomCreds && customCredsWrapper) {
        toggleCustomCreds.onclick = () => {
            const isHidden = customCredsWrapper.style.display === 'none';
            customCredsWrapper.style.display = isHidden ? 'flex' : 'none';
        };
    }

    function showCustomConfirm(title, desc, onConfirm) {
        const overlay = document.getElementById('customModalOverlay');
        const btnCancel = document.getElementById('btnModalCancel');
        const btnConfirm = document.getElementById('btnModalConfirm');
        if (!overlay || !btnCancel || !btnConfirm) return;

        const titleEl = overlay.querySelector('.modal-title');
        const descEl = overlay.querySelector('.modal-desc');
        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = desc;

        overlay.style.display = 'flex';

        const close = () => {
            overlay.style.display = 'none';
            btnCancel.onclick = null;
            btnConfirm.onclick = null;
        };

        btnCancel.onclick = close;
        btnConfirm.onclick = () => {
            close();
            if (typeof onConfirm === 'function') onConfirm();
        };
    }

    let activeClientId = "";
    let activeClientSecret = "";

    async function loadShikiStatus() {
        chrome.runtime.sendMessage({ action: "shiki_get_status" }, (res) => {
            if (chrome.runtime.lastError || !res) return;

            activeClientId = res.clientId || "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI";
            activeClientSecret = res.clientSecret || "";

            if (res.clientId && shikiClientIdInput) shikiClientIdInput.value = res.clientId;
            if (res.clientSecret && shikiClientSecretInput) shikiClientSecretInput.value = res.clientSecret;

            if (todayCountEl) {
                todayCountEl.textContent = res.todayCount || 0;
                const parentStat = todayCountEl.closest('.profile-stat');
                if (parentStat && !parentStat.dataset.hasResetListener) {
                    parentStat.dataset.hasResetListener = 'true';
                    parentStat.style.cursor = 'pointer';
                    parentStat.title = 'Нажмите, чтобы сбросить счётчик за сегодня';
                    parentStat.onclick = () => {
                        showCustomConfirm(
                            "⚠️ Сбросить счётчик?",
                            "Вы действительно хотите сбросить число серий за сегодня до 0?",
                            () => {
                                chrome.runtime.sendMessage({ action: "reset_today_count" }, (resetRes) => {
                                    if (resetRes && resetRes.success) {
                                        todayCountEl.textContent = '0';
                                        showToast(trackerToast, "Счётчик серий за сегодня сброшен на 0");
                                    }
                                });
                            }
                        );
                    };
                }
            }

            if (res.isLoggedIn && res.user) {
                shikiLoggedOut.style.display = 'none';
                shikiLoggedIn.style.display = 'block';

                document.getElementById('shiki-user-name').textContent = res.user.nickname || res.user.name || 'Пользователь';

                let avatarUrl = res.user.avatar || res.user.image?.x64 || 'https://shikimori.one/favicons/favicon-64x64.png';
                if (avatarUrl && !avatarUrl.startsWith('http')) {
                    avatarUrl = 'https://shikimori.one' + avatarUrl;
                }
                const avatarEl = document.getElementById('shiki-user-avatar');
                if (avatarEl) avatarEl.src = avatarUrl;

                if (statusTextEl) {
                    if (res.authError) {
                        statusTextEl.textContent = '⚠️ Токен истёк';
                        statusTextEl.style.color = '#f87171';
                    } else if (res.lastSyncTime) {
                        const mins = Math.max(1, Math.floor((Date.now() - res.lastSyncTime) / 60000));
                        statusTextEl.textContent = `Shikimori · отметка ${mins}m назад 🍃`;
                        statusTextEl.style.color = '#2dd4a5';
                    } else {
                        statusTextEl.textContent = 'Shikimori · подключено 🍃';
                        statusTextEl.style.color = '#2dd4a5';
                    }
                }

                // Auto-open "Смотрю" tab right from start
                if (activeTabStatus === null && btnTabWatching) {
                    btnTabWatching.classList.add('active');
                    activeTabStatus = 'watching';
                    loadShikiList('watching');
                }
                loadWatchHistory();
            } else {
                shikiLoggedOut.style.display = 'block';
                shikiLoggedIn.style.display = 'none';
                loadWatchHistory();
            }
        });
    }

    async function loadWatchHistory() {
        const historyWrapper = document.getElementById('history-wrapper');
        const historyItems = document.getElementById('history-items');
        if (!historyWrapper || !historyItems) return;

        try {
            const data = await chrome.storage.local.get(['ag_watch_history']);
            const list = Array.isArray(data.ag_watch_history) ? data.ag_watch_history : [];

            if (list.length === 0) {
                historyWrapper.style.display = 'none';
                return;
            }

            historyWrapper.style.display = 'block';
            historyItems.innerHTML = '';

            list.forEach(item => {
                const chip = document.createElement('div');
                chip.className = 'history-chip';
                chip.style.cssText = 'flex: 0 0 auto; background: rgba(255,255,255,0.06); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--border); cursor: pointer; font-size: 10px; white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis; color: var(--text); transition: background 0.2s;';
                chip.textContent = item.russian || item.name;
                chip.title = `Открыть ${item.russian || item.name}`;

                chip.onmouseenter = () => chip.style.background = 'rgba(255,255,255,0.12)';
                chip.onmouseleave = () => chip.style.background = 'rgba(255,255,255,0.06)';

                chip.onclick = () => {
                    if (item.url) {
                        window.open(item.url, '_blank');
                    } else {
                        window.open(`https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(item.russian || item.name)}`, '_blank');
                    }
                };

                historyItems.appendChild(chip);
            });
        } catch (e) {}
    }

    let activeTabStatus = null;
    let currentLoadedItems = [];
    let currentLoadedStatus = null;
    let activeKindFilter = 'all';

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showSkeletonLoader(container, count = 3) {
        if (!container) return;
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="skeleton-row">
                    <div class="skeleton-thumb"></div>
                    <div class="skeleton-lines">
                        <div class="skeleton-text-1"></div>
                        <div class="skeleton-text-2"></div>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;
    }

    function renderShikiItems(items, status) {
        if (!watchingContainer) return;
        watchingContainer.innerHTML = '';

        if (!items || items.length === 0) {
            watchingContainer.innerHTML = `<div class="loading-text">Ничего не найдено</div>`;
            return;
        }

        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'anime-row';
            itemDiv.setAttribute('data-type', (item.kind || 'TV').toUpperCase());

            const epText = status === 'rewatching' 
                ? `Перепросмотр: ${item.episodesWatched}${item.episodesTotal ? ' / ' + item.episodesTotal : ''} эп.` 
                : `${item.episodesWatched}${item.episodesTotal ? ' / ' + item.episodesTotal : ''} эп.`;

            let kindTagHtml = '';
            if (item.kind) {
                const k = item.kind.toUpperCase();
                const kindName = k === 'TV' ? 'TV' : (k === 'MOVIE' ? 'Фильм' : (k === 'SPECIAL' ? 'Спешл' : k));
                kindTagHtml = `<span style="font-size:9px; color:var(--text-muted); margin-left:4px;">${escapeHtml(kindName)}</span>`;
            }

            const safeTitle = escapeHtml(item.russian || item.name || '');

            itemDiv.innerHTML = `
                <img class="anime-thumb" src="${escapeHtml(item.poster || 'https://shikimori.one/favicons/favicon-64x64.png')}" alt="poster">
                <div style="flex:1; min-width:0;">
                    <div class="anime-title" title="${safeTitle}">${safeTitle}${kindTagHtml}</div>
                    <div class="anime-progress">${escapeHtml(epText)}</div>
                </div>
                <button class="play-btn" data-title="${safeTitle}">▶</button>
            `;

            const watchBtn = itemDiv.querySelector('.play-btn');
            watchBtn.onclick = (e) => {
                e.stopPropagation();
                if (itemDiv.querySelector('.shiki-portal-choice')) return;

                showToast(playToast, `Открываю плеер: ${item.russian}…`);
                watchBtn.textContent = 'Ищем...';
                watchBtn.disabled = true;

                chrome.runtime.sendMessage({
                    action: "search_both_portals",
                    queryTitle: item.russian,
                    origTitle: item.name
                }, (res) => {
                    watchBtn.textContent = '▶';
                    watchBtn.disabled = false;

                    const jutsuInfo = res && res.jutsu;
                    const animegoInfo = res && res.animego;

                    if (jutsuInfo && jutsuInfo.isDirect && animegoInfo && animegoInfo.isDirect) {
                        let choiceBar = itemDiv.querySelector('.shiki-portal-choice');
                        if (!choiceBar) {
                            choiceBar = document.createElement('div');
                            choiceBar.className = 'shiki-portal-choice';
                            choiceBar.innerHTML = `
                                <button class="btn-choice btn-choice-animego" title="Смотреть на AnimeGO">AnimeGO</button>
                                <button class="btn-choice btn-choice-jutsu" title="Смотреть на JUT-SU">JUT-SU</button>
                            `;
                            watchBtn.replaceWith(choiceBar);

                            choiceBar.querySelector('.btn-choice-animego').onclick = () => {
                                window.open(animegoInfo.url, '_blank');
                            };
                            choiceBar.querySelector('.btn-choice-jutsu').onclick = () => {
                                window.open(jutsuInfo.url, '_blank');
                            };
                        }
                    } else {
                        const targetUrl = (animegoInfo && animegoInfo.isDirect)
                            ? animegoInfo.url
                            : (jutsuInfo ? jutsuInfo.url : `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(item.russian)}`);
                        window.open(targetUrl, '_blank');
                    }
                });
            };

            watchingContainer.appendChild(itemDiv);
        });
    }

    function applyShikiFilters() {
        const query = listSearchInput ? listSearchInput.value.toLowerCase().trim() : '';

        const filtered = currentLoadedItems.filter(item => {
            const ru = (item.russian || '').toLowerCase();
            const en = (item.name || '').toLowerCase();
            const matchesQuery = !query || ru.includes(query) || en.includes(query);

            if (!matchesQuery) return false;

            const kind = (item.kind || '').toUpperCase();
            if (activeKindFilter === 'all') return true;
            if (activeKindFilter === 'tv') return kind === 'TV';
            if (activeKindFilter === 'movie') return kind === 'MOVIE';
            if (activeKindFilter === 'ova') return kind === 'OVA' || kind === 'ONA' || kind === 'SPECIAL';

            return true;
        });

        if (filterNote) {
            filterNote.textContent = activeKindFilter === 'all' && !query ? '' : `Показано: ${filtered.length}`;
        }

        renderShikiItems(filtered, currentLoadedStatus);
    }

    async function loadShikiList(status) {
        if (!watchingContainer) return;
        watchingContainer.style.display = 'block';
        if (searchWrapper) searchWrapper.style.display = 'block';
        if (listSearchInput) listSearchInput.value = '';

        const cacheKey = `shiki_list_cache_${status}`;
        try {
            const cacheRes = await chrome.storage.local.get([cacheKey]);
            if (cacheRes && Array.isArray(cacheRes[cacheKey]) && cacheRes[cacheKey].length > 0) {
                currentLoadedItems = cacheRes[cacheKey];
                currentLoadedStatus = status;
                applyShikiFilters();
            } else if (!currentLoadedItems || currentLoadedItems.length === 0) {
                showSkeletonLoader(watchingContainer, 3);
            }
        } catch (e) {
            if (!currentLoadedItems || currentLoadedItems.length === 0) {
                showSkeletonLoader(watchingContainer, 3);
            }
        }

        chrome.runtime.sendMessage({ action: "get_shiki_watching_list", status: status }, (res) => {
            if (!res || !res.success || !Array.isArray(res.items) || res.items.length === 0) {
                if (!currentLoadedItems || currentLoadedItems.length === 0) {
                    currentLoadedItems = [];
                    currentLoadedStatus = status;
                    const labelText = status === 'rewatching' ? '«Пересматриваю»' : '«Смотрю»';
                    watchingContainer.innerHTML = `<div class="loading-text">В списке ${labelText} пока ничего нет.</div>`;
                    if (filterNote) filterNote.textContent = '';
                }
                return;
            }

            currentLoadedItems = res.items;
            currentLoadedStatus = status;
            applyShikiFilters();
        });
    }

    if (listSearchInput) {
        listSearchInput.oninput = () => applyShikiFilters();
    }

    const filterPills = document.querySelectorAll('.filter-pill');
    filterPills.forEach(pill => {
        pill.onclick = () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            activeKindFilter = pill.getAttribute('data-kind') || 'all';
            applyShikiFilters();
        };
    });

    if (btnTabWatching && btnTabRewatching) {
        btnTabWatching.onclick = () => {
            if (activeTabStatus === 'watching' && watchingContainer.style.display !== 'none') {
                watchingContainer.style.display = 'none';
                if (searchWrapper) searchWrapper.style.display = 'none';
                btnTabWatching.classList.remove('active');
                activeTabStatus = null;
            } else {
                btnTabWatching.classList.add('active');
                btnTabRewatching.classList.remove('active');
                activeTabStatus = 'watching';
                loadShikiList('watching');
            }
        };

        btnTabRewatching.onclick = () => {
            if (activeTabStatus === 'rewatching' && watchingContainer.style.display !== 'none') {
                watchingContainer.style.display = 'none';
                if (searchWrapper) searchWrapper.style.display = 'none';
                btnTabRewatching.classList.remove('active');
                activeTabStatus = null;
            } else {
                btnTabRewatching.classList.add('active');
                btnTabWatching.classList.remove('active');
                activeTabStatus = 'rewatching';
                loadShikiList('rewatching');
            }
        };
    }

    if (btnShikiLoginLink) {
        btnShikiLoginLink.onclick = async () => {
            if (shikiCodeWrapper) shikiCodeWrapper.style.display = 'block';
            shikiErrorMsg.style.display = 'none';

            const customId = shikiClientIdInput ? shikiClientIdInput.value.trim() : "";
            const customSecret = shikiClientSecretInput ? shikiClientSecretInput.value.trim() : "";

            const targetClientId = customId || activeClientId || "SDRlebImRwlk9l3e-h380zUp-8HM725SHq1MLw73lzI";

            if (!targetClientId || targetClientId.includes('DefaultID')) {
                shikiErrorMsg.style.display = 'block';
                shikiErrorMsg.innerHTML = 'Введите ваш <b>Client ID</b> в разворачиваемом поле ниже или вставьте в <code>config.js</code>.<br><a href="https://shikimori.one/oauth/applications/new" target="_blank" style="color:var(--accent);">Создать приложение на Shikimori (1 раз)</a>';
                if (customCredsWrapper) customCredsWrapper.style.display = 'flex';
                return;
            }

            if (customId || customSecret) {
                const currentSettings = await window.getSettings();
                const storageObj = { ag_settings: currentSettings };
                if (customId) {
                    currentSettings.shiki_client_id = customId;
                    storageObj.shiki_client_id = customId;
                }
                if (customSecret) {
                    currentSettings.shiki_client_secret = customSecret;
                    storageObj.shiki_client_secret = customSecret;
                }
                await chrome.storage.local.set(storageObj);
            }

            const authUrl = `https://shikimori.io/oauth/authorize?client_id=${encodeURIComponent(targetClientId)}&redirect_uri=urn%3Aietf%3Awg%3Aoauth%3A2.0%3Aoob&response_type=code&scope=user_rates`;

            try {
                if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
                    chrome.tabs.create({ url: authUrl, active: true });
                } else {
                    window.open(authUrl, '_blank');
                }
            } catch (e) {
                window.open(authUrl, '_blank');
            }
        };
    }

    if (btnShikiSubmitCode) {
        btnShikiSubmitCode.onclick = () => {
            const customId = shikiClientIdInput ? shikiClientIdInput.value.trim() : "";
            const customSecret = shikiClientSecretInput ? shikiClientSecretInput.value.trim() : "";
            const code = shikiAuthCodeInput.value.trim();

            if (!code) {
                if (shikiCodeWrapper) shikiCodeWrapper.style.display = 'block';
                shikiErrorMsg.style.display = 'block';
                shikiErrorMsg.textContent = 'Вставьте код авторизации со страницы Shikimori!';
                return;
            }

            shikiErrorMsg.style.display = 'none';
            btnShikiSubmitCode.disabled = true;
            btnShikiSubmitCode.textContent = 'Вход...';

            chrome.runtime.sendMessage({
                action: "shiki_oauth_exchange",
                code: code,
                clientId: customId || activeClientId,
                clientSecret: customSecret || activeClientSecret
            }, (res) => {
                btnShikiSubmitCode.disabled = false;
                btnShikiSubmitCode.textContent = 'Войти';

                if (chrome.runtime.lastError) {
                    shikiErrorMsg.style.display = 'block';
                    shikiErrorMsg.textContent = chrome.runtime.lastError.message;
                    return;
                }

                if (res && res.success) {
                    shikiAuthCodeInput.value = '';
                    loadShikiStatus();
                } else {
                    shikiErrorMsg.style.display = 'block';
                    let err = res?.error || 'Ошибка входа!';
                    if (err.includes('invalid_grant') || err.includes('400')) {
                        err = 'Код устарел или уже был использован. Нажмите войти заново.';
                    }
                    shikiErrorMsg.textContent = err;
                }
            });
        };
    }

    if (btnShikiLogout) {
        btnShikiLogout.onclick = () => {
            chrome.runtime.sendMessage({ action: "shiki_logout" }, () => {
                loadShikiStatus();
            });
        };
    }

    loadShikiStatus();

    // --- Music Fetching ---
    function simplifyTitle(title) {
        if (!title) return null;
        let simple = title.split(/[:\-—]/)[0].trim();
        if (simple && simple !== title) {
            return simple;
        }
        return null;
    }

    async function fetchOPED(title, origTitle, currentEpStr) {
        const opList = document.getElementById('op-list');
        const edList = document.getElementById('ed-list');
        const content = document.getElementById('music-content');
        const loading = document.getElementById('music-loading');
        const currentEp = parseInt(currentEpStr, 10) || 1;

        if (opList) opList.innerHTML = "";
        if (edList) edList.innerHTML = "";

        try {
            loading.textContent = 'Поиск аниме...';

            const searchTitles = [];
            if (origTitle) searchTitles.push(origTitle);
            if (title) searchTitles.push(title);

            const simpleOrig = simplifyTitle(origTitle);
            if (simpleOrig && !searchTitles.includes(simpleOrig)) searchTitles.push(simpleOrig);

            const simpleTitle = simplifyTitle(title);
            if (simpleTitle && !searchTitles.includes(simpleTitle)) searchTitles.push(simpleTitle);

            let shikiAnime = null;
            for (const searchTitle of searchTitles) {
                const shikiResponse = await new Promise((resolve) => {
                    chrome.runtime.sendMessage({
                        action: "fetch_shikimori",
                        url: `https://shikimori.one/api/animes?search=${encodeURIComponent(searchTitle)}&limit=1`
                    }, resolve);
                });
                const data = shikiResponse && shikiResponse.data;
                if (Array.isArray(data) && data.length > 0 && data[0]) {
                    shikiAnime = data[0];
                    break;
                }
            }

            if (shikiAnime) {
                const shikiId = shikiAnime.id;
                loading.textContent = 'Загрузка треков...';

                let jikanData = null;
                const cacheKey = `themes_${shikiId}`;
                try {
                    const cacheRes = await chrome.storage.local.get([cacheKey]);
                    if (cacheRes && cacheRes[cacheKey]) {
                        jikanData = cacheRes[cacheKey];
                    }
                } catch (cacheErr) {}

                if (!jikanData) {
                    try {
                        const animethemesRes = await new Promise((resolve) => {
                            chrome.runtime.sendMessage({
                                action: "fetch_shikimori",
                                url: `https://api.animethemes.moe/anime?filter[has]=resources&filter[site]=MyAnimeList&filter[external_id]=${shikiId}&include=animethemes.animethemeentries,animethemes.song.artists`
                            }, resolve);
                        });

                        if (animethemesRes && animethemesRes.status === 200 && animethemesRes.data) {
                            const animeList = animethemesRes.data.anime || animethemesRes.data.data;
                            if (animeList && animeList.length > 0) {
                                const anime = animeList[0];
                                const openings = [];
                                const endings = [];
                                
                                if (anime.animethemes) {
                                    anime.animethemes.forEach(theme => {
                                        const type = theme.type;
                                        const slug = theme.slug;
                                        const titleVal = theme.song ? theme.song.title : "";
                                        const artistsVal = theme.song && theme.song.artists ? theme.song.artists.map(a => a.name).join(", ") : "";
                                        
                                        const epRanges = theme.animethemeentries ? theme.animethemeentries.map(e => e.episodes).filter(Boolean) : [];
                                        const epStr = epRanges.length > 0 ? ` (eps ${epRanges.join(", ")})` : "";
                                        const artistStr = artistsVal ? ` by ${artistsVal}` : "";
                                        
                                        const songStr = `${slug}: "${titleVal}"${artistStr}${epStr}`;
                                        
                                        if (type === "OP") openings.push(songStr);
                                        else if (type === "ED") endings.push(songStr);
                                    });
                                }
                                
                                if (openings.length > 0 || endings.length > 0) {
                                    jikanData = { data: { openings, endings } };
                                    try { await chrome.storage.local.set({ [cacheKey]: jikanData }); } catch (e) {}
                                }
                            }
                        }
                    } catch (e) {}
                }

                if (jikanData && jikanData.data) {
                    renderTracks(jikanData.data.openings || [], opList, "Опенинг", currentEp, title, origTitle);
                    renderTracks(jikanData.data.endings || [], edList, "Эндинг", currentEp, title, origTitle);
                }
            }
        } catch (err) {
            console.error("Error loading track data:", err);
        } finally {
            loading.style.display = 'none';
            content.style.display = 'block';

            if (!opList.innerHTML && !edList.innerHTML) {
                renderSmartFallback(opList, "Опенинг", currentEp, title, origTitle);
                renderSmartFallback(edList, "Эндинг", currentEp, title, origTitle);
            }
        }
    }

    function renderSmartFallback(container, label, currentEp, animeTitle, animeOrigTitle) {
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'track-item';
        
        const isOp = label.toLowerCase().includes('опен') || label.toLowerCase().includes('op');
        const typeLabel = isOp ? 'OP' : 'ED';
        const displayType = isOp ? 'Опенинг' : 'Эндинг';
        
        const songNum = Math.floor((currentEp - 1) / 13) + 1;
        const displayName = `${animeOrigTitle || animeTitle} ${typeLabel} ${songNum}`;
        
        div.innerHTML = `
            <div style="min-width:0; flex:1;">
                <div class="track-label">${displayType} (Поиск)</div>
                <div class="track-name">${displayName}</div>
            </div>
            <button class="btn-youtube" title="Искать на YouTube">▶</button>
        `;
        
        div.querySelector('.btn-youtube').onclick = () => {
            const animeSearchName = animeOrigTitle || animeTitle || "";
            const query = `${animeSearchName} ${typeLabel} ${songNum} episode ${currentEp}`;
            window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
        };
        
        container.appendChild(div);
    }

    function cleanTrackName(track) {
        let cleaned = track.replace(/^\s*(?:[a-zA-Z\d#\s\.\-]{1,8}[:\.]\s+)?/, '').trim();
        cleaned = cleaned.replace(/\(eps?.*?\)/gi, '').trim();
        cleaned = cleaned.replace(/\\"/g, '"');
        cleaned = cleaned.replace(/^"([^"]+)"\s+by\s+(.+)$/i, '$1 - $2');
        cleaned = cleaned.replace(/^["']|["']$/g, '');
        return cleaned.trim();
    }

    function renderTracks(tracks, container, label, currentEp, animeTitle, animeOrigTitle) {
        if (!tracks || tracks.length === 0 || !container) return;

        tracks.forEach((track) => {
            let isTrackForCurrentEp = false;
            const epRegex = /\(eps?\.?\s*([\d\-\,\.\s]+)\)/i;
            const epMatch = track.match(epRegex);

            if (epMatch && epMatch[1]) {
                const ranges = epMatch[1].replace(/\s/g, '').split(',');
                for (const range of ranges) {
                    if (range.includes('-')) {
                        const parts = range.split('-');
                        const start = parts[0] ? parseInt(parts[0], 10) : 1;
                        const end = parts[1] ? parseInt(parts[1], 10) : Infinity;
                        if (currentEp >= start && currentEp <= end) {
                            isTrackForCurrentEp = true;
                            break;
                        }
                    } else {
                        if (currentEp === parseInt(range, 10)) {
                            isTrackForCurrentEp = true;
                            break;
                        }
                    }
                }
            } else {
                isTrackForCurrentEp = true;
            }

            if (!isTrackForCurrentEp) return;

            const div = document.createElement('div');
            div.className = 'track-item';
            const cleanedName = cleanTrackName(track);

            div.innerHTML = `
                <div style="min-width:0; flex:1;">
                    <div class="track-label">${label}</div>
                    <div class="track-name" title="${cleanedName}">${cleanedName}</div>
                </div>
                <button class="btn-youtube" title="Слушать на YouTube">▶</button>
            `;

            div.querySelector('.btn-youtube').onclick = () => {
                const animeSearchName = animeOrigTitle || animeTitle || "";
                const isOp = label.toLowerCase().includes('опен') || label.toLowerCase().includes('op');
                const typeLabel = isOp ? 'OP' : 'ED';
                const query = `${animeSearchName} ${typeLabel} ${cleanedName}`;
                window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, '_blank');
            };

            container.appendChild(div);
        });
    }

    // --- Config Export & Import Handlers ---
    const btnExportSettings = document.getElementById('btn-export-settings');
    const btnImportSettings = document.getElementById('btn-import-settings');
    const inputImportSettings = document.getElementById('input-import-settings');

    if (btnExportSettings) {
        btnExportSettings.onclick = async () => {
            const currentSettings = await window.getSettings();
            const blob = new Blob([JSON.stringify(currentSettings, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `animeplus_settings_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(siteToast, "Настройки экспортированы в JSON");
        };
    }

    if (btnImportSettings && inputImportSettings) {
        btnImportSettings.onclick = () => inputImportSettings.click();
        inputImportSettings.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const imported = JSON.parse(evt.target.result);
                    if (typeof imported === 'object' && imported !== null) {
                        await chrome.storage.local.set({ ag_settings: imported });
                        showToast(siteToast, "✅ Настройки успешно импортированы!");
                        setTimeout(() => window.location.reload(), 1000);
                    } else {
                        showToast(siteToast, "❌ Неверный формат файла");
                    }
                } catch (err) {
                    showToast(siteToast, "❌ Ошибка чтения JSON файла");
                }
            };
            reader.readAsText(file);
        };
    }
});
