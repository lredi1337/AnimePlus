// background.js — Маршрутизатор фоновых сообщений и событий Chrome Extension
importScripts('./credentials.js', './modules/shared/sites.js', './modules/shared/title-match.js', './modules/shared/kodik-marks.js', './modules/bg-diag.js', './modules/bg-cache.js', './modules/bg-shiki.js', './modules/bg-sites.js', './modules/bg-audio.js', './modules/bg-schedule.js', './modules/bg-random.js');

// Хосты, к которым content-скрипты могут обращаться через fetch_shikimori.
// Без белого списка обработчик был открытым прокси с правами расширения на любой URL
const PROXY_ALLOWED_HOSTS = /^(?:[a-z0-9-]+\.)*(?:shikimori\.(?:io|one|me|org)|api\.animethemes\.moe|kitsu\.io)$/i;

function isAllowedProxyUrl(urlStr) {
    try {
        const url = new URL(urlStr);
        return url.protocol === 'https:' && PROXY_ALLOWED_HOSTS.test(url.hostname);
    } catch (e) {
        return false;
    }
}

async function proxyShikimoriFetch({ url }) {
    if (!url) return { error: 'No URL provided', status: 400 };
    const target = toShikiApiUrl(url);
    if (!isAllowedProxyUrl(target)) {
        console.warn('[Anime+] fetch_shikimori: blocked URL', target);
        return { error: 'URL not allowed', status: 403, data: null };
    }
    const send = /(^|\.)shikimori\./i.test(new URL(target).hostname) ? shikiRateFetch : fetch;
    const res = await send(target, { headers: { 'User-Agent': SHIKI_APP_USER_AGENT, 'Accept': 'application/json, text/plain, */*' } });
    let data = null;
    try {
        const text = await res.text();
        try {
            data = JSON.parse(text);
        } catch (jsonErr) {
            data = { text };
        }
    } catch (readErr) {
        console.error('Background fetch read error:', readErr);
    }
    return { data, status: res.status };
}

async function findKodikMarks(message) {
    const fetchPage = (url) => fetch(url, { credentials: 'omit' }).then(r => (r.ok ? r.text() : ''));
    const ranges = await AgKodikMarks.find(message, fetchPage);
    // Метка за концом серии: у этого плеера другой файл, и время Kodik к нему не подходит
    const fits = ranges.filter(r => !(message.duration > 0) || r.end <= message.duration + 2);
    return AgKodikMarks.splitMarks(fits, message.duration);
}

async function resolveDirectJutsuUrl({ russian, name, year, kind, fallbackUrl }) {
    const parsedYear = year ? parseInt(year) : null;
    let directUrl = await findJutsuDirectUrl(russian, name, parsedYear, kind);
    if (!directUrl && name) directUrl = await findJutsuDirectUrl(name, russian, parsedYear, kind);
    return { url: directUrl || fallbackUrl || `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(name || russian)}&ag_from=animeplus` };
}

// Окно вкладки-отправителя. windows.getCurrent в service worker возвращает
// последнее сфокусированное окно, и фуллскрин мог включиться не там
async function setWindowFullscreen(turningOn, sender) {
    const windowId = sender.tab && sender.tab.windowId !== undefined ? sender.tab.windowId : (await chrome.windows.getLastFocused()).id;
    const key = `ag_window_state_${windowId}`;
    let state = 'fullscreen';
    if (turningOn) {
        const current = await chrome.windows.get(windowId);
        if (current.state !== 'fullscreen') await chrome.storage.local.set({ [key]: current.state });
    } else {
        const saved = await chrome.storage.local.get(key);
        state = saved[key] || 'normal';
        await chrome.storage.local.remove(key);
    }
    await chrome.windows.update(windowId, { state });
    return { success: true };
}

// Шаблон нативной страницы тайтла AnimeGO для синтетических карточек.
// Раньше бралась первая ссылка /anime/*-N из каталога, а это оказывалась «/anime/top-250» (страница-список).
// Теперь отбираем только карточки тайтлов и проверяем, что в HTML есть разметка детальной страницы.
const NATIVE_TEMPLATE_TTL = 12 * 60 * 60 * 1000;
let nativeTemplateMemo = null;

async function getNativePageTemplate(origin) {
    const base = /^https:\/\/animego\.(me|org)$/.test(origin || '') ? origin : 'https://animego.me';
    const isFresh = (m) => m && m.base === base && Date.now() - m.ts < NATIVE_TEMPLATE_TTL;
    if (isFresh(nativeTemplateMemo)) return nativeTemplateMemo.html;
    // Память service worker теряется при каждом засыпании — второй уровень кэша в storage.session
    try {
        const { ag_native_template: stored } = await chrome.storage.session.get(['ag_native_template']);
        if (isFresh(stored)) {
            nativeTemplateMemo = stored;
            return stored.html;
        }
    } catch (e) {}

    const isDetailPage = (html) => /class="[^"]*entity__poster/.test(html) && /class="[^"]*entity__title/.test(html) && /<header[\s>]/.test(html);

    const catalogHtml = await (await fetch(`${base}/anime`)).text();
    const candidates = [...new Set(
        [...catalogHtml.matchAll(/href="(?:https?:\/\/animego\.(?:me|org))?(\/anime\/[a-z0-9-]+-(\d{2,}))"/gi)]
            .filter(m => !/^\/anime\/(top|season|status|genre|type|studio|random)\b/i.test(m[1]))
            .map(m => m[1])
    )].slice(0, 4);

    for (const path of candidates) {
        try {
            const html = await (await fetch(base + path)).text();
            if (isDetailPage(html)) {
                nativeTemplateMemo = { base, html, ts: Date.now() };
                chrome.storage.session.set({ ag_native_template: nativeTemplateMemo }).catch(() => {});
                return html;
            }
        } catch (e) {}
    }
    return null;
}

const isExtensionPage = (sender) => String(sender.url || '').startsWith(chrome.runtime.getURL(''));
const FORBIDDEN = { success: false, reason: 'forbidden' };
const hostOfUrl = (url) => { try { return new URL(url).hostname; } catch (e) { return ''; } };
// Сайт вкладки и кадр, из которого пришло сообщение
const senderHosts = (sender) => [...new Set([hostOfUrl(sender.tab && sender.tab.url), hostOfUrl(sender.url)].filter(Boolean))].join(' > ');
const failure = (err) => ({ success: false, error: err.message });

// Действие: [обработчик, ответ при сбое]. Обработчик возвращает ответ, а ошибку ловит маршрутизатор: отправитель не остаётся без ответа
const MESSAGE_HANDLERS = {
    open_settings: [() => { chrome.runtime.openOptionsPage(); }],
    close_current_tab: [(m, sender) => {
        if (sender.tab && sender.tab.id) chrome.tabs.remove(sender.tab.id).catch(() => {});
        return { success: true };
    }, failure],

    // Журнал сбоев (modules/bg-diag.js)
    diag_note: [(m, sender) => noteDiag(m.where, m.detail, senderHosts(sender)), () => null],
    diag_summary: [async () => ({ text: await diagSummary() }), () => ({ text: '' })],

    // Сайты из реестра (modules/bg-sites.js)
    resolve_site_url: [async (m) => ({ url: await resolveSiteUrl(m.siteId, m) }), () => ({ url: null })],
    resolve_all_sites: [async (m) => ({ results: await resolveAllSites(m, { siteIds: m.siteIds }) }), () => ({ results: [] })],
    resolve_shiki_id_redirect: [async (m) => ({ id: await resolveShikiIdFromRedirect(m.url) }), () => ({ id: null })],
    get_native_page_template: [async (m) => ({ html: await getNativePageTemplate(m.origin) }), (err) => {
        console.error('[Anime+] Error fetching native template:', err);
        return { html: null };
    }],

    // Пропуск опенингов
    get_audio_fingerprints: [(m) => getAudioFingerprints(m.id), () => null],
    get_kodik_marks: [findKodikMarks, () => null],
    get_remote_config: [() => getRemoteConfig(), () => null],
    get_shared_timings: [getSharedTimings, () => null],
    report_audio_timing: [reportAudioTiming, () => null],

    // Данные Shikimori
    resolve_shiki_posters: [async (m) => ({ posters: await getShikiPosters(m.ids || []) }), () => ({ posters: {} })],
    search_shikimori_anime: [async (m) => ({ results: await searchShikimoriAnime(m.query) }), () => ({ results: [] })],
    resolve_shikimori_id: [async (m) => (await resolveShikimoriId(m)) || { id: null }, (err) => ({ id: null, error: err.message })],
    fetch_shikimori: [proxyShikimoriFetch, (err) => {
        console.error('Error fetching shikimori details:', err);
        return { data: null };
    }],
    get_shikimori_anime_related: [(m) => getShikiRelated(m.id), () => ({ related: [] })],
    add_watch_history: [async (m) => { await addToWatchHistory(m.item); return { success: true }; }, () => ({ success: false })],

    // Jut-Su и расписание
    search_jutsu_direct: [async (m) => ({ url: await findJutsuDirectUrl(m.queryTitle, m.origTitle, m.targetYear) }), (err) => {
        console.error('Error in search_jutsu_direct:', err);
        return { url: null };
    }],
    resolve_direct_jutsu_url: [resolveDirectJutsuUrl, (err, m) => ({ url: m.fallbackUrl })],
    resolve_jutsu_cover: [resolveJutsuCover, () => ({ poster: null, url: null })],
    get_ongoing_schedule: [getOngoingSchedule, (err) => {
        console.error('Error in get_ongoing_schedule:', err);
        return { schedule: [] };
    }],
    get_random_shikimori_anime: [getRandomShikimoriAnime, (err) => {
        console.error('Error in get_random_shikimori_anime:', err);
        return { url: null };
    }],

    fullscreen_on: [(m, sender) => setWindowFullscreen(true, sender), failure],
    fullscreen_off: [(m, sender) => setWindowFullscreen(false, sender), failure],

    // Аккаунт Shikimori
    shiki_auth_begin: [async (m, sender) => {
        if (!isExtensionPage(sender)) return FORBIDDEN;
        await beginShikiAuth(m.clientId);
        return { success: true };
    }, failure],
    shiki_auth_expected: [async (m, sender) => ({
        expected: isShikiCodeInProgress(shikiAuthCodeFromUrl(sender.url)) || await isShikiAuthExpected(sender.tab && sender.tab.id)
    }), () => ({ expected: false })],
    shiki_auto_auth: [(m, sender) => completeShikiAuth(m.code, sender.tab && sender.tab.id), failure],
    shiki_oauth_exchange: [(m, sender) => (isExtensionPage(sender) ? exchangeShikiCode(m.code, m.clientId, m.clientSecret) : FORBIDDEN), failure],
    shiki_logout: [() => logoutShiki(), failure],
    shiki_get_status: [() => getShikiStatus(), (err) => ({ isLoggedIn: false, user: null, error: err.message })],
    reset_today_count: [() => resetTodayCount(), failure],
    get_shiki_watching_list: [(m) => getShikiWatchingList(m.status || 'watching'), (err) => ({ success: false, error: err.message, items: [] })],
    shiki_sync_progress: [(m) => syncShikiProgress({ shikimoriId: m.shikimoriId, episode: m.episode, status: m.status }), failure]
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Принимаем сообщения только от собственных контекстов расширения
    if (!sender || sender.id !== chrome.runtime.id || !message || typeof message.action !== 'string') return false;
    // Неизвестное действие: не держим канал открытым — отправитель сразу получит lastError, а не повиснет
    if (!Object.hasOwn(MESSAGE_HANDLERS, message.action)) return false;

    const [run, onError] = MESSAGE_HANDLERS[message.action];
    Promise.resolve()
        .then(() => run(message, sender))
        .catch((err) => (onError ? onError(err, message) : undefined))
        .then(sendResponse);
    return true;
});
