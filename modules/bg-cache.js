// modules/bg-cache.js
// Движок кэширования и резолвера прямых ссылок плеера AnimeGO и Jut-Su

let cachedScheduleData = null;
let cachedScheduleTime = 0;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней TTL для кэша ссылок

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

        const cacheKey = getCacheKey(queryTitle, origTitle, targetYear);
        const cachedUrl = await getDirectUrlFromCache(cacheKey);
        if (cachedUrl) {
            return cachedUrl;
        }

        const extractSeasonNumber = (str) => {
            if (!str) return null;
            const s = String(str).toLowerCase().trim();

            const matchEndNum = s.match(/(?:\s+|^)(\d{1,2})\s*$/);
            if (matchEndNum) {
                const num = parseInt(matchEndNum[1]);
                if (num > 0 && num < 20) return num;
            }

            const matchSeason = s.match(/(\d+)\s*(?:st|nd|rd|th)?\s*(?:-?\s*й|-?\s*го)?\s*(?:сезон|season)/i);
            if (matchSeason) return parseInt(matchSeason[1]);

            const matchTv = s.match(/(?:тв|tv|part|часть)-?\s*(\d+)\b/i);
            if (matchTv) return parseInt(matchTv[1]);

            const matchUrlSeason = s.match(/(?:season-?|сезон-?|-)(\d+)(?:\.html|\/|$)/i);
            if (matchUrlSeason) {
                const num = parseInt(matchUrlSeason[1]);
                if (num > 0 && num < 20) return num;
            }

            const romanMap = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
            const words = s.split(/[^a-z0-9]/i);
            for (let i = words.length - 1; i >= 0; i--) {
                const w = words[i].toLowerCase();
                if (romanMap[w]) return romanMap[w];
            }
            return null;
        };

        const targetSeason = extractSeasonNumber(queryTitle) || extractSeasonNumber(origTitle);

        const cleanStr = (s) => (s || '').toLowerCase().replace(/[:.,\-\—!?()]/g, ' ').replace(/\s+/g, ' ').trim();

        const searchJutsu = async (searchQuery) => {
            if (!searchQuery || !searchQuery.trim()) return null;
            const resp = await fetch(`https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(searchQuery.trim())}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!resp.ok) return null;
            const html = await resp.text();

            let bestUrl = null;
            let bestScore = 0;

            const qClean = cleanStr(searchQuery);

            const cardMatches = Array.from(html.matchAll(/<a[^>]+href="(https:\/\/jut-su\.net\/[^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/gi));

            for (const m of cardMatches) {
                const href = m[1];
                const rawText = m[2].replace(/<[^>]+>/g, '').trim();

                if (!href || href.includes('/page/') || href.includes('/tags/')) continue;
                if (!rawText || rawText.length < 2) continue;

                const candClean = cleanStr(rawText);
                let score = 0;

                const isExact = candClean === qClean;
                const isStart = candClean.startsWith(qClean) || qClean.startsWith(candClean);
                const isInclude = candClean.includes(qClean) || qClean.includes(candClean);

                if (isExact) score += 400;
                else if (isStart) score += 250;
                else if (isInclude) score += 150;

                const candSeason = extractSeasonNumber(rawText) || extractSeasonNumber(href);

                if (targetSeason !== null) {
                    if (candSeason === targetSeason) {
                        score += 300;
                    } else if (candSeason !== null && candSeason !== targetSeason) {
                        score -= 500;
                    } else if (targetSeason === 1 && candSeason === null) {
                        score += 100;
                    }
                } else {
                    if (candSeason !== null && candSeason > 1) {
                        score -= 200;
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestUrl = href;
                }
            }

            if (bestUrl && bestScore > 0) {
                return bestUrl;
            }
            return null;
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

async function findAnimeGoDirectUrl(queryTitle, origTitle, targetYear) {
    try {
        if (!queryTitle && !origTitle) return null;
        const cacheKey = `ag_${getCacheKey(queryTitle, origTitle, targetYear)}`;
        const cachedUrl = await getDirectUrlFromCache(cacheKey);
        if (cachedUrl) {
            return cachedUrl;
        }

        const cleanStr = (s) => (s || '').toLowerCase().replace(/[:.,\-\—!?()]/g, ' ').replace(/\s+/g, ' ').trim();
        const qRuClean = cleanStr(queryTitle);
        const qEnClean = cleanStr(origTitle);

        const searchAnimeGo = async (searchQuery) => {
            if (!searchQuery || !searchQuery.trim()) return null;
            const resp = await fetch(`https://animego.me/search/anime?q=${encodeURIComponent(searchQuery.trim())}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (!resp.ok) return null;
            const html = await resp.text();

            let bestUrl = null;
            let bestScore = 0;

            const linkMatches = Array.from(html.matchAll(/<a[^>]+href="(\/anime\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi));
            for (const m of linkMatches) {
                let href = m[1];
                const rawText = m[2].replace(/<[^>]+>/g, '').trim();
                if (!rawText || rawText.length < 2) continue;

                const candClean = cleanStr(rawText);
                let score = 0;

                const isExactRu = qRuClean && candClean === qRuClean;
                const isExactEn = qEnClean && candClean === qEnClean;

                if (isExactRu || isExactEn) {
                    score += 500;
                } else if ((qRuClean && candClean.startsWith(qRuClean)) || (qEnClean && candClean.startsWith(qEnClean))) {
                    score += 350;
                } else if ((qRuClean && candClean.includes(qRuClean)) || (qEnClean && candClean.includes(qEnClean))) {
                    score += 200;
                } else {
                    const qWords = (qRuClean || qEnClean).split(' ').filter(w => w.length > 2);
                    let matchCount = 0;
                    qWords.forEach(w => { if (candClean.includes(w)) matchCount++; });
                    if (qWords.length > 0 && (matchCount / qWords.length) >= 0.5) {
                        score += 150;
                    }
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestUrl = href.startsWith('http') ? href : 'https://animego.me' + href;
                }
            }

            if (bestUrl && bestScore > 0) {
                return bestUrl;
            }
            return null;
        };

        let url = origTitle ? await searchAnimeGo(origTitle) : null;
        if (!url && queryTitle) {
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
