// modules/bg-cache.js
// Движок кэширования и резолвера прямых ссылок плеера AnimeGO и Jut-Su

let cachedScheduleData = null;
let cachedScheduleTime = 0;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней TTL для кэша ссылок

// Последовательное обновление объекта в chrome.storage.
// Параллельные get → изменить → set (например, 100 карточек Топа одновременно) теряли записи друг друга.
// Все изменения одного ключа выстраиваются в очередь; maxEntries ограничивает рост кэша
// (удаляются самые старые: по полю ts, иначе по порядку добавления ключей).
const storageWriteQueues = new Map();

function updateStorageObject(key, mutator, { area = chrome.storage.local, maxEntries = 0 } = {}) {
    const prev = storageWriteQueues.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(async () => {
        const res = await area.get([key]);
        const obj = (res[key] && typeof res[key] === 'object') ? res[key] : {};
        const out = (await mutator(obj)) || obj;
        if (maxEntries > 0) {
            const keys = Object.keys(out);
            if (keys.length > maxEntries) {
                const hasTs = keys.every(k => out[k] && typeof out[k].ts === 'number');
                const ordered = hasTs ? keys.sort((a, b) => out[a].ts - out[b].ts) : keys;
                ordered.slice(0, keys.length - maxEntries).forEach(k => delete out[k]);
            }
        }
        await area.set({ [key]: out });
        return out;
    });
    storageWriteQueues.set(key, next);
    next.finally(() => { if (storageWriteQueues.get(key) === next) storageWriteQueues.delete(key); });
    return next;
}

async function getDirectUrlFromCache(key) {
    if (!key) return null;
    try {
        const storage = chrome.storage.session || chrome.storage.local;
        const res = await storage.get([`cache_${key}`]);
        const data = res[`cache_${key}`];
        if (!data) return null;

        // Если кэш сохранён с отметкой времени (новый формат)
        if (typeof data === 'object' && data.url) {
            if (Date.now() - (data.timestamp || 0) > CACHE_TTL_MS) {
                storage.remove([`cache_${key}`]);
                return null;
            }
            return data.url;
        }

        // Обратная совместимость с устаревшими строковыми записями
        return typeof data === 'string' ? data : null;
    } catch (e) {
        return null;
    }
}

async function setDirectUrlInCache(key, url) {
    if (!key || !url) return;
    try {
        const storage = chrome.storage.session || chrome.storage.local;
        await storage.set({ [`cache_${key}`]: { url, timestamp: Date.now() } });
    } catch (e) {}
}

function isChineseAnime(anime) {
    if (!anime) return false;
    const name = (anime.name || '').toLowerCase();
    const russian = (anime.russian || '').toLowerCase();

    const explicitChineseTerms = [
        'donghua', 'bilibili', 'tencent', 'youku', 'iqiyi',
        'douluo dalu', 'doupo cangqiong', 'fanren xiu',
        'xian ni', 'caishen', 'zhanlong', 'xiao he', 'jiu jie',
        'shi xian', 'xian zun', 'yaoshenji', 'wanjie', 'wu dong',
        'shao nian', 'xue ying', 'quanzhi', 'cang lan', 'wusheng',
        'dalu', 'xianxia', 'wuxia', 'tengu tousen'
    ];

    for (const kw of explicitChineseTerms) {
        if (name.includes(kw) || russian.includes(kw)) {
            return true;
        }
    }
    if (russian.includes('китай') || russian.includes('дуньхуа') || russian.includes('дунхуа')) {
        return true;
    }
    return false;
}

/**
 * Генерирует уникальный ключ кэширования на основе названий и года
 * @param {string} ru - Название на русском
 * @param {string} en - Название на английском/оригинальное
 * @param {number|string} [year] - Год выпуска
 * @returns {string} Нормализованный ключ
 */
function getCacheKey(ru, en, year) {
    const clean = (s) => (s || '').toLowerCase().replace(/[:.,\-\—!?()]/g, '').trim();
    return `${clean(ru)}_${clean(en)}_${year || ''}`;
}

/**
 * Ищет прямую ссылку на страницу аниме на портале Jut-Su
 * @param {string} queryTitle - Название на русском
 * @param {string} origTitle - Оригинальное название
 * @param {number|string} [targetYear] - Год выхода
 * @param {string} [kind] - Тип аниме (tv, movie, ova)
 * @returns {Promise<string|null>} URL аниме на Jut-Su или null
 */
async function findJutsuDirectUrl(queryTitle, origTitle, targetYear, kind) {
    try {
        if (!queryTitle && !origTitle) return null;

        const cacheKey = `js_v2_${getCacheKey(queryTitle, origTitle, targetYear)}`;
        const cachedUrl = await getDirectUrlFromCache(cacheKey);
        if (cachedUrl) {
            return cachedUrl;
        }

        const { pickBest, findSameTitle, extractSeason } = globalThis.AgTitleMatch;
        const targetSeason = extractSeason(queryTitle) || extractSeason(origTitle);
        const titles = [queryTitle, origTitle].filter(Boolean);

        const parseJutsuSearchCards = (html) => {
            const cards = new Map();
            const re = /<a\b([^>]*\bjutsu-item__title\b[^>]*)>([\s\S]*?)<\/a>(?:\s*<div[^>]*jutsu-item__subtitle[^>]*>\s*(\d{4}))?/gi;
            for (const m of html.matchAll(re)) {
                const hrefMatch = m[1].match(/href="([^"]+\.html)"/i);
                if (!hrefMatch) continue;
                const href = new URL(hrefMatch[1], 'https://jut-su.net').href;
                if (cards.has(href)) continue;
                cards.set(href, { href, title: m[2].replace(/<[^>]+>/g, '').trim(), year: m[3] || '' });
            }
            if (cards.size === 0) {
                // Резерв на случай смены классов: любые ссылки на страницы тайтлов вида /123-slug.html
                for (const m of html.matchAll(/<a[^>]+href="((?:https:\/\/jut-su\.net)?\/\d+-[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi)) {
                    const href = new URL(m[1], 'https://jut-su.net').href;
                    const title = m[2].replace(/<[^>]+>/g, '').trim();
                    if (!title || cards.has(href)) continue;
                    cards.set(href, { href, title, year: '' });
                }
            }
            return [...cards.values()];
        };

        const searchJutsu = async (searchQuery) => {
            if (!searchQuery || !searchQuery.trim()) return null;
            const resp = await fetch(`https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(searchQuery.trim())}`);
            if (!resp.ok) return null;
            const cards = parseJutsuSearchCards(await resp.text());
            if (cards.length === 0) return null;

            const [same] = findSameTitle(cards, { titles, year: targetYear });
            if (same) return same.href;
            // Поиск по оригинальному названию отдаёт русские заголовки: единственному результату доверяем
            if (cards.length !== 1 || /[а-яё]/i.test(searchQuery)) return null;
            const best = pickBest(cards, { titles, year: targetYear, season: targetSeason });
            return best ? best.href : null;
        };

        let url = queryTitle ? await searchJutsu(queryTitle) : null;
        if (!url && origTitle) {
            url = await searchJutsu(origTitle);
        }

        if (url) {
            await setDirectUrlInCache(cacheKey, url);
            return url;
        }

        return null;
    } catch (err) {
        console.error("Error in findJutsuDirectUrl:", err);
        return null;
    }
}

/** Карточки выдачи поиска AnimeGO: русское и оригинальное название, год */
function parseAnimeGoSearchCards(html) {
    const clean = (t) => t.replace(/<[^>]+>/g, ' ').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const cards = [];
    for (const block of html.split(/(?=<div class="ani-grid__item\s)/).slice(1)) {
        const titleMatch = block.match(/ani-grid__item-title[^>]*>\s*<a\b[^>]*href="(\/anime\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
        if (!titleMatch) continue;
        const body = block.slice(block.indexOf('ani-grid__item-body'));
        const origMatch = body.match(/<div class="fw-lighter[^>]*>([\s\S]*?)<\/div>/);
        const yearMatch = block.match(/ani-grid__item-genres__link">\s*((?:19|20)\d{2})\s*</);
        cards.push({
            href: titleMatch[1],
            title: clean(titleMatch[2]),
            orig: origMatch ? clean(origMatch[1]) : '',
            year: yearMatch ? yearMatch[1] : ''
        });
    }
    return cards;
}

async function findAnimeGoDirectUrl(queryTitle, origTitle, targetYear, extraTitles = []) {
    try {
        if (!queryTitle && !origTitle) return null;
        const cacheKey = `ag_v2_${getCacheKey(queryTitle, origTitle, targetYear)}`;
        const cachedUrl = await getDirectUrlFromCache(cacheKey);
        if (cachedUrl) {
            return cachedUrl;
        }

        const titles = [queryTitle, origTitle, ...extraTitles].filter(Boolean);

        const searchAnimeGo = async (searchQuery) => {
            if (!searchQuery || !searchQuery.trim()) return null;
            const resp = await fetch(`https://animego.me/search/anime?q=${encodeURIComponent(searchQuery.trim())}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!resp.ok) return null;
            // Поиск всегда что-то возвращает: на английский запрос выдача часто состоит из посторонних тайтлов
            const [card] = globalThis.AgTitleMatch.findSameTitle(parseAnimeGoSearchCards(await resp.text()), { titles, year: targetYear });
            return card ? 'https://animego.me' + card.href : null;
        };

        let url = origTitle ? await searchAnimeGo(origTitle) : null;
        if (!url && queryTitle && queryTitle !== origTitle) {
            url = await searchAnimeGo(queryTitle);
        }

        if (url) {
            await setDirectUrlInCache(cacheKey, url);
            return url;
        }

        return null;
    } catch (err) {
        console.error("Error in findAnimeGoDirectUrl:", err);
        return null;
    }
}
