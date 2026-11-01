// modules/shared/title-match.js
// Единая логика сравнения названий аниме: нормализация, номер сезона, оценка совпадения.
// Используется и в service worker (importScripts), и в content-скриптах — поэтому только globalThis.
// Раньше эта логика была скопирована в 5 файлов и уже начала расходиться.

(function (root) {
    'use strict';

    const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };

    // Нижний регистр, всё кроме букв (латиница/кириллица) и цифр — в пробел
    function normalize(str) {
        return String(str || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
    }

    // Номер сезона из названия или URL: «2 сезон», «2nd Season», «ТВ-2», «Part 2», «II», «… 3», «…-2.html»
    function extractSeason(str) {
        if (!str) return null;
        const s = String(str).toLowerCase().trim();

        const season = s.match(/(\d+)\s*(?:st|nd|rd|th)?\s*(?:-?\s*й|-?\s*го)?\s*(?:сезон|season)/i);
        if (season) return parseInt(season[1], 10);

        // «Season 3», «сезон 2» — номер после слова
        const seasonAfter = s.match(/(?:season|сезон)\s*(\d+)/i);
        if (seasonAfter) return parseInt(seasonAfter[1], 10);

        const tv = s.match(/(?:тв|tv|part|часть)-?\s*(\d+)\b/i);
        if (tv) return parseInt(tv[1], 10);

        const endNum = s.match(/(?:\s+|^)(\d{1,2})\s*$/);
        if (endNum) {
            const num = parseInt(endNum[1], 10);
            if (num > 0 && num < 20) return num;
        }

        const urlSeason = s.match(/(?:season-?|сезон-?|-)(\d+)(?:\.html|\/|$)/i);
        if (urlSeason) {
            const num = parseInt(urlSeason[1], 10);
            if (num > 0 && num < 20) return num;
        }

        const words = s.split(/[^a-z0-9]/i);
        for (let i = words.length - 1; i >= 0; i--) {
            if (ROMAN[words[i]]) return ROMAN[words[i]];
        }
        return null;
    }

    // Текстовое сходство кандидата с любым из искомых названий: 400 / 250 / 150 / 0
    function textScore(candidate, titles) {
        const c = normalize(candidate);
        if (!c) return 0;
        let best = 0;
        for (const t of titles) {
            const q = normalize(t);
            if (!q) continue;
            if (c === q) return 400;
            if (c.startsWith(q) || q.startsWith(c)) best = Math.max(best, 250);
            else if (c.includes(q) || q.includes(c)) best = Math.max(best, 150);
        }
        return best;
    }

    /**
     * Итоговая оценка кандидата.
     * @param {{title: string, href?: string, year?: string|number}} cand
     * @param {{titles: string[], year?: string|number, season?: number|null}} target
     */
    function scoreCandidate(cand, target) {
        let score = textScore(cand.title, target.titles || []);

        const targetSeason = target.season !== undefined
            ? target.season
            : (target.titles || []).map(extractSeason).find(Boolean) || null;
        const candSeason = extractSeason(cand.title) || extractSeason(cand.href);

        if (targetSeason) {
            if (candSeason === targetSeason) score += 300;
            else if (candSeason) score -= 500;
            else if (targetSeason === 1) score += 100;
        } else if (candSeason && candSeason > 1) {
            score -= 200;
        }

        if (target.year && cand.year) score += String(cand.year) === String(target.year) ? 150 : -150;
        return score;
    }

    /**
     * Лучший кандидат или null. Единственный кандидат принимается, если не противоречит году/сезону
     * (поиск по английскому названию возвращает карточки с русскими заголовками — текст не совпадёт).
     */
    function pickBest(cands, target, { minScore = 1 } = {}) {
        let best = null;
        let bestScore = -Infinity;
        for (const cand of cands) {
            const s = scoreCandidate(cand, target);
            if (s > bestScore) { bestScore = s; best = cand; }
        }
        if (!best) return null;
        if (bestScore >= minScore) return best;
        if (cands.length === 1 && bestScore > -150) return best;
        return null;
    }

    root.AgTitleMatch = { normalize, extractSeason, textScore, scoreCandidate, pickBest };
})(typeof globalThis !== 'undefined' ? globalThis : window);
