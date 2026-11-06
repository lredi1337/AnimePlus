// Реестр сайтов (modules/shared/sites.js подключён в popup.html до этого файла)
const AgSites = window.AgSites;
const AgUI = window.AgUI;
const escapeHtml = window.agEscapeHtml;

// Фолбэк постеров в popup. Inline onerror="" в страницах расширения запрещён CSP Manifest V3,
// поэтому обработчик вешается через addEventListener. Заглушку Shikimori («лису» /assets/globals/missing_*)
// заменяем настоящим постером из GraphQL (resolve_shiki_posters в background).
const POPUP_PLACEHOLDER_POSTER = '../icons/icon128.png';
function bindPopupPoster(img, animeId) {
    if (!img) return;
    let triedShiki = false;
    const fallback = () => {
        if (!triedShiki && animeId) {
            triedShiki = true;
            chrome.runtime.sendMessage({ action: 'resolve_shiki_posters', ids: [animeId] }, (res) => {
                if (chrome.runtime.lastError) { img.src = POPUP_PLACEHOLDER_POSTER; return; }
                const url = res && res.posters ? res.posters[parseInt(animeId, 10)] : null;
                img.src = url || POPUP_PLACEHOLDER_POSTER;
            });
            return;
        }
        if (!img.src.endsWith('icons/icon128.png')) img.src = POPUP_PLACEHOLDER_POSTER;
    };
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', fallback);
    if (/\/assets\/globals\/|missing_|icons\/icon128\.png$/.test(img.getAttribute('src') || '')) fallback();
}

// Предупреждение о том, что сайт изменил вёрстку (пишет agCheckSelectorHealth в content-скриптах)
async function renderSelectorHealth() {
    const box = document.getElementById('selectorHealth');
    if (!box) return;
    const { ag_selector_health: health = {} } = await chrome.storage.local.get(['ag_selector_health']);
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const broken = Object.entries(health)
        .filter(([, h]) => h && Array.isArray(h.missing) && h.missing.length > 0 && Date.now() - h.ts < WEEK)
        .map(([site]) => (AgSites.byId(site) || { name: site }).name);
    if (broken.length === 0) return;
    box.textContent = `${broken.join(' и ')}: сайт изменил разметку, часть функций может не работать. Подробности — в консоли страницы.`;
    box.hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
    AgUI.hydrate();
    renderSelectorHealth().catch(() => {});
    // --- State & Settings ---
    const res = await chrome.storage.local.get(['ag_settings']);
    let settings = res.ag_settings || {};
    if (settings.global_enabled === undefined) settings.global_enabled = true;

    // --- DOM Elements ---
    const extToggle = document.getElementById('extToggle');
    const extBody = document.getElementById('extBody');
    const extOffNote = document.getElementById('extOffNote');
    const statusBox = document.getElementById('status-box');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const STATUS_ON = 'Anime+ работает на этом сайте';
    const STATUS_OFF = 'Anime+ выключен на этом сайте';

    const siteToast = document.getElementById('siteToast');
    const playToast = document.getElementById('playToast');
    const trackerToast = document.getElementById('trackerToast');


    const shikiLoggedOut = document.getElementById('shiki-logged-out');
    const shikiLoggedIn = document.getElementById('shiki-logged-in');
    const shikiAuthCodeInput = document.getElementById('shiki-auth-code');
    const shikiCodeWrapper = document.getElementById('shiki-code-wrapper');
    const shikiErrorMsg = document.getElementById('shiki-error-msg');

    const btnShikiLoginLink = document.getElementById('btn-shiki-login-link');
    const btnShikiSubmitCode = document.getElementById('btn-shiki-submit-code');
    const btnShikiLogout = document.getElementById('btn-shiki-logout');


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
    const activateBtn = document.getElementById('btn-activate-player');

    const btnShiki = document.getElementById('btn-shiki');

    // --- Helper: всплывающая подсказка ---
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
        if (extBody) extBody.style.display = isEnabled ? 'flex' : 'none';
        document.getElementById('popupApp').classList.toggle('ext-off', !isEnabled);
        document.getElementById('sitesToggle').hidden = !isEnabled;
        if (extOffNote) extOffNote.style.display = isEnabled ? 'none' : 'block';
    }

    if (extToggle) {
        extToggle.addEventListener('click', async () => {
            settings.global_enabled = !(settings.global_enabled !== false);
            await window.agPatchSettings({ global_enabled: settings.global_enabled });
            updateToggleState();

            // Перезагружаем вкладки всех поддерживаемых сайтов
            const patterns = AgSites.allHosts().flatMap(h => [`*://${h}/*`, `*://*.${h}/*`]);
            chrome.tabs.query({ url: patterns }, (tabs) => {
                tabs.forEach(tab => chrome.tabs.reload(tab.id));
            });
        });
    }
    updateToggleState();

    // --- Active Tab Check & Portal State ---
    let activeTab = null;
    let currentSite = null; // запись из AgSites для активной вкладки
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        activeTab = tabs[0];
        // Новые адреса переехавших сайтов, которые зритель уже разрешил
        await AgSites.ready;

        currentSite = activeTab && activeTab.url ? AgSites.byUrl(activeTab.url) : null;
        applySiteTheme(currentSite);
        renderSitesList();
        if (!currentSite) offerMirror(activeTab);

        if (currentSite && AgSites.isEnabled(settings, currentSite.id)) {
            if (statusBox) statusBox.classList.add('active');
            if (statusDot) statusDot.className = 'dot';
            if (statusText) statusText.textContent = STATUS_ON;


            // Ask for page info
            chrome.tabs.sendMessage(activeTab.id, { type: 'AG_GET_PAGE_INFO' }, (response) => {
                const musicLoading = document.getElementById('music-loading');
                if (chrome.runtime.lastError || !response) {
                    if (musicLoading) {
                        musicLoading.innerHTML = `
                            <div class="panel-hint">Не удалось загрузить данные об аниме.</div>
                            <button class="btn-secondary" id="btn-reload-tab">Обновить страницу</button>
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
            if (statusText) statusText.textContent = currentSite ? STATUS_OFF : 'откройте сайт с аниме';
            const musicLoading = document.getElementById('music-loading');
            if (musicLoading) musicLoading.textContent = 'Откройте страницу аниме...';
        }
    });

    // --- Сайты: кнопка в шапке раскрывает плитки ---
    // Источник списка — modules/shared/sites.js; новый сайт появляется здесь автоматически
    const sitesToggle = document.getElementById('sitesToggle');
    const sitesPanel = document.getElementById('sitesPanel');
    const sitesList = document.getElementById('sitesList');
    // Пока список ни разу не открывали, кнопка подсвечена: новичок не догадывался, что сайты за ней
    const SITES_SEEN_KEY = 'ag_sites_seen';
    const sitesSeen = () => { try { return localStorage.getItem(SITES_SEEN_KEY) === '1'; } catch (e) { return true; } };

    // Цвет окна один на все сайты: красный цвет бренда из tokens.css, цветом сайта отмечен только его значок
    function applySiteTheme(site) {
        const name = document.getElementById('siteCurrentName');
        if (name) name.textContent = site ? site.name : 'Выбрать сайт';
        if (sitesToggle) {
            sitesToggle.classList.toggle('is-hint', !sitesSeen());
            sitesToggle.title = site ? 'Все сайты с аниме' : 'Выбрать сайт с аниме';
        }
    }

    // Состояние переключателя без учёта глобального выключателя (он отображается отдельно)
    const isSiteOn = (siteId) => AgSites.isEnabled({ ...settings, global_enabled: true }, siteId);

    async function setSiteEnabled(siteId, enabled) {
        const map = { ...(settings.sites_enabled || {}) };
        if (enabled) delete map[siteId]; else map[siteId] = false;
        settings.sites_enabled = map;
        await window.agPatchSettings({ sites_enabled: map });

        const site = AgSites.byId(siteId);
        showToast(siteToast, `${site.name}: ${enabled ? 'включено' : 'выключено'}`);
        renderSitesList();
        if (currentSite && currentSite.id === siteId) {
            if (statusText) statusText.textContent = enabled ? STATUS_ON : STATUS_OFF;
            if (statusBox) statusBox.classList.toggle('active', enabled);
        }
    }

    // Сайт переехал: страница похожа на сайт из списка, а адреса такого нет. Нужен activeTab: окно открыто зрителем на этой вкладке
    const mirrorOrigins = (host) => [`https://${host}/*`, `https://*.${host}/*`];
    async function detectMirrorSite(tab) {
        const candidates = AgSites.list.filter(s => s.mirrors && s.detect);
        if (!tab || !/^https:/.test(tab.url || '') || !candidates.length || !chrome.scripting) return null;
        try {
            const [res] = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (pairs) => { const hit = pairs.find(([, sel]) => document.querySelector(sel)); return hit ? hit[0] : null; },
                args: [candidates.map(s => [s.id, s.detect])]
            });
            return res && res.result ? AgSites.byId(res.result) : null;
        } catch (e) {
            return null;
        }
    }

    async function offerMirror(tab) {
        const site = await detectMirrorSite(tab);
        const card = document.getElementById('mirrorCard');
        if (!site || !card) return;
        const host = new URL(tab.url).hostname.replace(/^www\./, '');
        const badge = document.getElementById('mirrorBadge');
        badge.textContent = site.short;
        badge.style.background = site.color;
        badge.style.color = AgUI.onAccent(site.color);
        document.getElementById('mirrorTitle').textContent = `Это ${site.name} на новом адресе ${host}?`;
        card.hidden = false;
        document.getElementById('mirrorAdd').addEventListener('click', () => {
            // Запрос разрешения должен идти прямо из нажатия, без ожиданий перед ним
            chrome.permissions.request({ origins: mirrorOrigins(host) }, (granted) => {
                if (!granted) return showToast(siteToast, 'Без разрешения Anime+ здесь не заработает');
                chrome.runtime.sendMessage({ action: 'site_mirror_add', host, siteId: site.id }, (res) => {
                    if (chrome.runtime.lastError || !res || !res.success) return showToast(siteToast, 'Не получилось добавить адрес');
                    chrome.tabs.reload(tab.id);
                    window.close();
                    return undefined;
                });
                return undefined;
            });
        });
    }

    // Последний рабочий адрес переезжающего сайта: старый домен может быть уже заблокирован
    let siteHomes = {};
    chrome.storage.local.get(['ag_site_home']).then((res) => { siteHomes = (res && res.ag_site_home) || {}; }).catch(() => {});
    const homeOf = (site) => (site.mirrors && siteHomes[site.id]) || site.home;

    function renderSitesList() {
        if (!sitesList) return;
        const isCurrent = (s) => !!currentSite && currentSite.id === s.id;
        const ordered = [...AgSites.list].sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a)));
        sitesList.replaceChildren(...ordered.map(site => {
            const enabled = isSiteOn(site.id);
            const li = document.createElement('li');
            li.className = 'site-tile' + (isCurrent(site) ? ' is-current' : '') + (enabled ? '' : ' is-off');
            li.dataset.site = site.id;
            li.innerHTML = `
                <button type="button" class="site-tile-open" title="Открыть ${escapeHtml(site.hosts[0])}">
                    <span class="site-badge" style="background:${site.color}; color:${AgUI.onAccent(site.color)}">${escapeHtml(site.short)}</span>
                    <span class="site-tile-name">${escapeHtml(site.name)}</span>
                    <span class="site-tile-host">${isCurrent(site) ? 'открыт сейчас' : escapeHtml(site.hosts[0])}</span>
                </button>
                <label class="site-switch" title="${enabled ? 'Выключить' : 'Включить'} Anime+ на ${escapeHtml(site.name)}">
                    <input type="checkbox" ${enabled ? 'checked' : ''} aria-label="Anime+ на ${escapeHtml(site.name)}">
                    <span></span>
                </label>
            `;
            li.querySelector('.site-tile-open').addEventListener('click', () => chrome.tabs.create({ url: homeOf(site) }));
            li.querySelector('input').addEventListener('change', (e) => setSiteEnabled(site.id, e.target.checked));
            return li;
        }));
    }

    if (sitesToggle && sitesPanel) {
        sitesToggle.addEventListener('click', () => {
            const open = sitesPanel.hidden;
            sitesPanel.hidden = !open;
            sitesToggle.setAttribute('aria-expanded', String(open));
            try { localStorage.setItem(SITES_SEEN_KEY, '1'); } catch (e) {}
            sitesToggle.classList.remove('is-hint');
        });
    }
    applySiteTheme(null);
    renderSitesList();

    // --- Player Manual Activation ---
    if (activateBtn) {
        activateBtn.onclick = async () => {
            if (!activeTab) return;
            activateBtn.textContent = 'Активация…';
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: activeTab.id, allFrames: true },
                    files: ["config.js", "modules/shared/sites.js", "modules/shared/ui-kit.js", "modules/player/skip-memory.js", "content-player.js"]
                });
                activateBtn.textContent = 'Плеер активирован';
                setTimeout(() => window.close(), 1500);
            } catch (e) {
                console.error("Activation failed", e);
                activateBtn.textContent = 'Нет прав на эту вкладку';
            }
        };
    }

    const panelsList = [
        { btn: btnMusic, panel: panelMusic },
        { btn: btnPlayer, panel: panelPlayer }
    ];

    panelsList.forEach(item => {
        if (!item.btn || !item.panel) return;
        item.btn.addEventListener('click', () => {
            const isOpen = item.panel.style.display === 'block';
            panelsList.forEach(other => {
                if (other.panel) other.panel.style.display = 'none';
                if (other.btn) other.btn.classList.remove('active');
            });
            if (!isOpen) {
                item.panel.style.display = 'block';
                item.btn.classList.add('active');
            }
        });
    });

    document.getElementById('btnSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('btn-support').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#support') });
    });

    // --- Footer Links ---
    if (btnShiki) {
        btnShiki.onclick = () => {
            showToast(trackerToast, "Открывается профиль на Shikimori");
            window.open('https://shikimori.io/animes', '_blank');
        };
    }

    // --- Shikimori Auth & Watchlist ---
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

    async function loadShikiStatus() {
        chrome.runtime.sendMessage({ action: "shiki_get_status" }, (res) => {
            if (chrome.runtime.lastError || !res) return;

            activeClientId = res.clientId || '';

            if (todayCountEl) {
                todayCountEl.textContent = res.todayCount || 0;
                const parentStat = todayCountEl.closest('.profile-stat');
                if (parentStat && !parentStat.dataset.hasResetListener) {
                    parentStat.dataset.hasResetListener = 'true';
                    parentStat.style.cursor = 'pointer';
                    parentStat.title = 'Нажмите, чтобы сбросить счётчик за сегодня';
                    parentStat.onclick = () => {
                        showCustomConfirm(
                            "Сбросить счётчик?",
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

            document.getElementById('popupApp').classList.toggle('has-list', !!(res.isLoggedIn && res.user));

            if (res.isLoggedIn && res.user) {
                shikiLoggedOut.style.display = 'none';
                shikiLoggedIn.style.display = 'block';

                document.getElementById('shiki-user-name').textContent = res.user.nickname || res.user.name || 'Пользователь';

                let avatarUrl = res.user.avatar || res.user.image?.x64 || 'https://shikimori.io/favicons/favicon-64x64.png';
                if (avatarUrl && !avatarUrl.startsWith('http')) {
                    avatarUrl = 'https://shikimori.io' + avatarUrl;
                }
                const avatarEl = document.getElementById('shiki-user-avatar');
                if (avatarEl) avatarEl.src = avatarUrl;

                if (statusTextEl) {
                    if (res.authError) {
                        statusTextEl.textContent = 'Токен истёк, войдите заново';
                        statusTextEl.className = 'profile-sub is-error';
                    } else if (res.lastSyncTime) {
                        const mins = Math.max(1, Math.floor((Date.now() - res.lastSyncTime) / 60000));
                        statusTextEl.textContent = `Отметка ${mins} мин назад`;
                        statusTextEl.className = 'profile-sub is-ok';
                    } else {
                        statusTextEl.textContent = 'Shikimori · подключено';
                        statusTextEl.className = 'profile-sub is-ok';
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

    // Карточка «Продолжить»: последний просмотренный тайтл, а если истории нет, первый недосмотренный из списка
    async function loadWatchHistory() {
        const card = document.getElementById('continueCard');
        if (!card) return;
        try {
            const data = await chrome.storage.local.get(['ag_watch_history']);
            const last = Array.isArray(data.ag_watch_history) ? data.ag_watch_history[0] : null;
            const unfinished = (i) => !i.episodesTotal || i.episodesWatched < i.episodesTotal;
            const item = last
                ? watchingItems.find(i => (last.id && (i.animeId || i.id) === last.id) || [i.russian, i.name].includes(last.russian) || (last.name && i.name === last.name))
                : watchingItems.find(unfinished);
            if (!last && !item) {
                card.hidden = true;
                return;
            }

            const title = (last && last.russian) || item.russian || item.name;
            const posterRaw = (item && item.poster) || (last && last.poster) || POPUP_PLACEHOLDER_POSTER;
            const poster = (window.agNormalizePosterUrl && window.agNormalizePosterUrl(posterRaw)) || posterRaw;
            for (const id of ['continueBg', 'continuePoster']) {
                const img = document.getElementById(id);
                img.src = poster;
                bindPopupPoster(img, item && (item.animeId || item.id));
            }
            document.getElementById('continueTitle').textContent = title;
            document.getElementById('continueMeta').textContent = item && unfinished(item)
                ? `Серия ${item.episodesWatched + 1}${item.episodesTotal ? ` из ${item.episodesTotal}` : ''}`
                : 'Недавно смотрели';
            const hasProgress = !!(item && item.episodesTotal);
            document.getElementById('continueProgress').hidden = !hasProgress;
            if (hasProgress) document.getElementById('continueBar').style.width = `${Math.min(100, Math.round(item.episodesWatched / item.episodesTotal * 100))}%`;

            let play = document.getElementById('continuePlay');
            if (!play) {
                // Прошлый выбор сайта заменил кнопку: возвращаем её
                card.querySelector('.shiki-portal-choice')?.remove();
                play = document.createElement('button');
                play.id = 'continuePlay';
                play.className = 'continue-play';
                play.setAttribute('aria-label', 'Продолжить просмотр');
                card.appendChild(play);
            }
            play.innerHTML = AgUI.icon('play', 18);
            play.onclick = () => {
                if (last && last.url) window.open(last.url, '_blank');
                else if (item) watchItem(item, play, 18);
                else window.open(`https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(title)}&ag_from=animeplus`, '_blank');
            };
            card.hidden = false;
        } catch (e) {}
    }

    // Сэкономленное за месяц время: считает content-player.js при каждом пропуске опенинга или эндинга
    let activeTabStatus = null;
    let currentLoadedItems = [];
    let watchingItems = [];
    let currentLoadedStatus = null;
    let activeKindFilter = 'all';


    function showSkeletonLoader(container, count = 6) {
        if (!container) return;
        container.innerHTML = '<div class="poster-skeleton"></div>'.repeat(count);
    }

    // Поиск тайтла на включённых сайтах; кнопка показывает ход поиска, а при нескольких сайтах уступает место выбору
    function watchItem(item, watchBtn, iconSize = 14) {
        showToast(playToast, `Ищу «${item.russian}» на сайтах…`);
        watchBtn.textContent = '…';
        watchBtn.disabled = true;

        // Все включённые сайты; текущий открытый сайт — первым
        const siteIds = AgSites.searchable()
            .filter(s => AgSites.isEnabled(settings, s.id))
            .sort((a, b) => Number(!!currentSite && b.id === currentSite.id) - Number(!!currentSite && a.id === currentSite.id))
            .map(s => s.id);

        chrome.runtime.sendMessage({
            action: 'resolve_all_sites',
            siteIds,
            titles: [item.name, item.russian].filter(Boolean),
            shikimoriId: item.animeId
        }, (res) => {
            watchBtn.innerHTML = AgUI.icon('play', iconSize);
            watchBtn.disabled = false;
            const found = ((res && res.results) || []).filter(r => r.url);

            if (found.length === 0) {
                // Ничего не нашли — поиск на первом включённом сайте (DLE-сайты сами перейдут на тайтл по ag_from)
                const fallback = AgSites.byId(siteIds[0]) || AgSites.byId('jutsu');
                const searchPath = fallback.dle ? fallback.dle.searchPath : null;
                window.open(searchPath
                    ? fallback.home + searchPath + encodeURIComponent(item.russian) + '&ag_from=animeplus'
                    : `https://shikimori.io/animes/${item.animeId}`, '_blank');
                return;
            }
            if (found.length === 1) {
                window.open(found[0].url, '_blank');
                return;
            }

            // Несколько сайтов — выбор кнопками в цвете сайта
            const choiceBar = document.createElement('div');
            choiceBar.className = 'shiki-portal-choice';
            found.forEach(r => {
                const site = AgSites.byId(r.siteId);
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn-choice-site';
                btn.style.background = site.color;
                btn.style.color = AgUI.onAccent(site.color);
                btn.textContent = site.short;
                btn.title = `Смотреть на ${site.name}`;
                btn.onclick = (ev) => { ev.stopPropagation(); window.open(r.url, '_blank'); };
                choiceBar.appendChild(btn);
            });
            watchBtn.replaceWith(choiceBar);
        });
    }

    function renderShikiItems(items, status) {
        if (!watchingContainer) return;
        watchingContainer.innerHTML = '';

        if (!items || items.length === 0) {
            watchingContainer.innerHTML = `<div class="loading-text">Ничего не найдено</div>`;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'poster-card';
            card.setAttribute('data-type', (item.kind || 'TV').toUpperCase());

            const eps = `${item.episodesWatched}${item.episodesTotal ? '/' + item.episodesTotal : ''}`;
            const percent = item.episodesTotal ? Math.min(100, Math.round(item.episodesWatched / item.episodesTotal * 100)) : 0;
            const safeTitle = escapeHtml(item.russian || item.name || '');
            const hint = status === 'rewatching' ? `${safeTitle}. Перепросмотр: ${eps}` : `${safeTitle}. Просмотрено: ${eps}`;
            const posterRaw = item.poster || POPUP_PLACEHOLDER_POSTER;
            const posterSrc = (window.agNormalizePosterUrl && typeof window.agNormalizePosterUrl === 'function')
                ? (window.agNormalizePosterUrl(posterRaw) || posterRaw)
                : posterRaw;

            card.innerHTML = `
                <div class="poster-cover">
                    <img class="poster-img" loading="lazy" src="${escapeHtml(posterSrc)}" alt="">
                    <span class="poster-eps">${escapeHtml(eps)}</span>
                    <div class="progress"><i style="width:${percent}%"></i></div>
                    <button class="poster-play" title="${hint}" aria-label="Смотреть: ${hint}">${AgUI.icon('play', 18)}</button>
                </div>
                <div class="poster-title" title="${safeTitle}">${safeTitle}</div>
            `;

            bindPopupPoster(card.querySelector('.poster-img'), item.animeId || item.id);
            const watchBtn = card.querySelector('.poster-play');
            watchBtn.onclick = () => watchItem(item, watchBtn, 18);
            watchingContainer.appendChild(card);
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
        watchingContainer.style.display = 'grid';
        if (searchWrapper) searchWrapper.style.display = 'block';
        if (listSearchInput) listSearchInput.value = '';

        const cacheKey = `shiki_list_cache_${status}`;
        try {
            const cacheRes = await chrome.storage.local.get([cacheKey]);
            if (cacheRes && Array.isArray(cacheRes[cacheKey]) && cacheRes[cacheKey].length > 0) {
                currentLoadedItems = cacheRes[cacheKey];
                currentLoadedStatus = status;
                if (status === 'watching') {
                    watchingItems = cacheRes[cacheKey];
                    loadWatchHistory();
                }
                applyShikiFilters();
            } else if (!currentLoadedItems || currentLoadedItems.length === 0 || currentLoadedStatus !== status) {
                showSkeletonLoader(watchingContainer);
            }
        } catch (e) {
            if (!currentLoadedItems || currentLoadedItems.length === 0) {
                showSkeletonLoader(watchingContainer);
            }
        }

        chrome.runtime.sendMessage({ action: "get_shiki_watching_list", status: status }, (res) => {
            if (activeTabStatus !== status) return;
            if (!res || !res.success || !Array.isArray(res.items) || res.items.length === 0) {
                // Сбой сети не стирает уже показанный список этой вкладки, но чужой список на ней не остаётся
                if (!currentLoadedItems || currentLoadedItems.length === 0 || currentLoadedStatus !== status) {
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
            if (status === 'watching') {
                watchingItems = res.items;
                loadWatchHistory();
            }
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
        const openStatusTab = (status) => {
            btnTabWatching.classList.toggle('active', status === 'watching');
            btnTabRewatching.classList.toggle('active', status === 'rewatching');
            if (activeTabStatus === status) return;
            activeTabStatus = status;
            loadShikiList(status);
        };
        btnTabWatching.onclick = () => openStatusTab('watching');
        btnTabRewatching.onclick = () => openStatusTab('rewatching');
    }

    const btnListSearch = document.getElementById('btn-list-search');
    const listSearchBox = document.getElementById('listSearchBox');
    if (btnListSearch && listSearchBox) {
        btnListSearch.onclick = () => {
            const open = listSearchBox.hidden;
            listSearchBox.hidden = !open;
            btnListSearch.classList.toggle('active', open);
            btnListSearch.setAttribute('aria-expanded', String(open));
            if (open) {
                listSearchInput.focus();
            } else if (listSearchInput.value) {
                listSearchInput.value = '';
                applyShikiFilters();
            }
        };
    }

    if (btnShikiLoginLink) {
        btnShikiLoginLink.onclick = async () => {
            if (shikiCodeWrapper) shikiCodeWrapper.style.display = 'block';
            shikiErrorMsg.style.display = 'none';

            // Вкладку открывает фон: окно расширения закроется вместе с переходом на неё, а номер вкладки нужно запомнить
            chrome.runtime.sendMessage({ action: 'shiki_auth_begin', clientId: activeClientId });
        };
    }

    if (btnShikiSubmitCode) {
        btnShikiSubmitCode.onclick = () => {
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
                clientId: activeClientId
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

            // Общий резолвер ID в background (оригинальное + русское название, сокращённые варианты, кэш)
            const resolved = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'resolve_shikimori_id', titles: [origTitle, title].filter(Boolean) }, (res) => {
                    resolve(chrome.runtime.lastError ? null : res);
                });
            });
            const shikiAnime = resolved && resolved.id ? resolved : null;

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
            <div class="track-body">
                <div class="track-label">${displayType} (поиск)</div>
                <div class="track-name">${escapeHtml(displayName)}</div>
            </div>
            <button class="btn-youtube" title="Искать на YouTube" aria-label="Искать на YouTube">${AgUI.icon('play', 13)}</button>
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
                <div class="track-body">
                    <div class="track-label">${label}</div>
                    <div class="track-name" title="${escapeHtml(cleanedName)}">${escapeHtml(cleanedName)}</div>
                </div>
                <button class="btn-youtube" title="Слушать на YouTube" aria-label="Слушать на YouTube">${AgUI.icon('play', 13)}</button>
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
});
