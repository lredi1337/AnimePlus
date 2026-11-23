// modules/shared/schedule-core.js
// Расписание онгоингов без браузера и сети: неделя с понедельника по воскресенье, память о сериях и фильтры.
// Shikimori отдаёт только следующую серию тайтла: как только серия вышла, запись переключается на серию через неделю.
// Чтобы вышедшая серия не пропадала из своего дня, фон запоминает каждую серию, которую видел в календаре (remember),
// а страница показывает запомненное за текущую неделю (weekEntries). Фон: modules/bg-schedule.js, страница: schedule/schedule.js.

(function (root) {
    'use strict';

    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    // Серий запоминается немного: на тайтл хватает текущей и прошлой недели
    const MAX_PER_TITLE = 8;
    // Серии одного тайтла ближе этого не выходят. Ближе — это одна и та же серия под разными номерами
    const SAME_SLOT = 3 * DAY;

    const DEFAULT_FILTERS = {
        mine: false, fresh: false, types: [],
        hideCn: true, hideKids: true, hideShort: true, hideUnrated: false,
        long: 0, min: 0, sort: 'time', noGenres: [], hidden: []
    };
    const LONG_STEPS = [0, 30, 50, 100];
    const MIN_STEPS = [0, 6, 6.5, 7, 7.5, 8];
    const SHORT_MINUTES = 10;
    const FRESH_DAYS = 95;

    const nearest = (steps, value) => steps.reduce((best, step) => (Math.abs(step - value) < Math.abs(best - value) ? step : best), steps[0]);

    /** Фильтры зрителя. Настройки прежнего расписания на AnimeGO (ongoing_*) переходят один раз, пока зритель не менял новые */
    function filters(settings) {
        const s = settings || {};
        const legacy = {};
        if (s.ongoing_hide_chinese === false) legacy.hideCn = false;
        if (s.ongoing_hide_long_running === true) legacy.long = 30;
        if (parseFloat(s.ongoing_min_score) > 0) legacy.min = nearest(MIN_STEPS, parseFloat(s.ongoing_min_score));
        const saved = s.schedule && typeof s.schedule === 'object' ? s.schedule : {};
        const out = { ...DEFAULT_FILTERS, ...legacy, ...saved };
        for (const key of ['types', 'noGenres', 'hidden']) out[key] = Array.isArray(out[key]) ? out[key] : [];
        out.long = LONG_STEPS.includes(out.long) ? out.long : 0;
        out.min = MIN_STEPS.includes(out.min) ? out.min : 0;
        out.sort = out.sort === 'score' ? 'score' : 'time';
        return out;
    }

    // Китайское аниме Shikimori отдельно не помечает. Признак: оригинальное название записано иероглифами без каны
    // и в нём есть то, чего в японском названии не бывает: упрощённые иероглифы или счёт сезонов через «季».
    // Одних иероглифов без каны мало: так пишутся и японские названия («呪術廻戦»)
    const KANA = /[぀-ヿ]/;
    const HAN = /[一-鿿]/;
    const SIMPLIFIED = /[们这为东车马门风龙凤华战动剧镇苍师张灵圣传养乐买卖亲爱时书长无对开关见说话语请让红绿银钱铁问间难电飞鱼鸟龟齐岁两严丧个丰临举么义乌乔习乡亚产优伤伟专业丛丢]/;
    const CHINESE_MARKS = /第[一二三四五六七八九十百\d]+季|[\d一二三四五六七八九十]季|年番/;

    function isChinese(native) {
        const text = String(native || '');
        if (!HAN.test(text) || KANA.test(text)) return false;
        return SIMPLIFIED.test(text) || CHINESE_MARKS.test(text);
    }

    /** Начало недели (понедельник, 00:00) по часам зрителя */
    function weekStart(now) {
        const d = new Date(now);
        const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        return monday.getTime();
    }

    /**
     * Память о сериях: { [id тайтла]: [{ ep, at }] }. Возвращает новую память с сериями из календаря.
     * При первом знакомстве с тайтлом прошлая серия неизвестна: если по недельному шагу она вышла на этой неделе,
     * добавляем её как догадку (guess), иначе тайтл появился бы в своём дне только через неделю
     */
    function remember(seen, calendar, now) {
        const out = {};
        const start = weekStart(now);
        for (const [id, list] of Object.entries(seen || {})) {
            if (Array.isArray(list)) out[id] = list.filter(e => e && e.ep >= 1 && Number.isFinite(e.at)).map(e => ({ ...e }));
        }
        for (const item of calendar || []) {
            const id = item && item.anime && parseInt(item.anime.id, 10);
            const at = Date.parse(item && item.next_episode_at);
            if (!id || !Number.isFinite(at)) continue;
            const ep = parseInt(item.next_episode, 10) || 1;
            // Shikimori переносит дату на следующую неделю раньше, чем меняет номер серии,
            // поэтому та же дата могла запомниться и с прежним номером
            const list = out[id] = (out[id] || []).filter(e => e.ep >= ep || Math.abs(e.at - at) >= SAME_SLOT);
            const same = list.find(e => e.ep === ep);
            if (same) {
                same.at = at;
                delete same.guess;
            } else {
                list.push({ ep, at });
            }
            const before = at - WEEK;
            if (ep > 1 && before >= start && before <= now && !list.some(e => e.ep === ep - 1)) list.push({ ep: ep - 1, at: before, guess: true });
        }
        for (const id of Object.keys(out)) {
            const list = out[id].filter(e => e.at >= start - WEEK).sort((a, b) => a.at - b.at);
            // В одном слоте остаётся старшая серия: младший номер там остался от запоздавшего Shikimori
            out[id] = list.filter(e => !list.some(o => o.ep > e.ep && Math.abs(o.at - e.at) < SAME_SLOT)).slice(-MAX_PER_TITLE);
            if (!out[id].length) delete out[id];
        }
        return out;
    }

    /** Серии этой недели из памяти: [{ id, ep, at }] по времени выхода */
    function weekEntries(seen, now) {
        const start = weekStart(now);
        const entries = [];
        for (const [id, list] of Object.entries(seen || {})) {
            for (const e of list || []) {
                // Неделя считается по дате, а не по 168 часам: в неделю с переводом часов она короче или длиннее
                const day = Math.round((new Date(new Date(e.at).getFullYear(), new Date(e.at).getMonth(), new Date(e.at).getDate()).getTime() - start) / DAY);
                if (day >= 0 && day <= 6) entries.push({ id: Number(id), ep: e.ep, at: e.at, day });
            }
        }
        return entries.sort((a, b) => a.at - b.at || a.id - b.id);
    }

    /** Признаки тайтла для фильтров */
    function flags(entry, now) {
        const genres = entry.genres || [];
        const aired = Date.parse(entry.airedOn || '');
        return {
            kids: genres.includes('Детское') || entry.rating === 'g',
            short: entry.duration > 0 && entry.duration <= SHORT_MINUTES,
            len: Math.max(entry.episodes || 0, entry.episodesAired || 0, entry.ep || 0),
            fresh: Number.isFinite(aired) && now - aired <= FRESH_DAYS * DAY
        };
    }

    /**
     * Показывать ли серию. watching — список «Смотрю» зрителя { [id]: просмотрено серий } или null.
     * Тайтлы из списка зрителя видны при любых фильтрах «не показывать»: их он выбрал сам
     */
    function passes(entry, f, { query = '', watching = null, now = Date.now() } = {}) {
        if (f.hidden.includes(entry.id)) return false;
        if (query && !`${entry.russian || ''} ${entry.name || ''}`.toLowerCase().includes(query)) return false;
        const mine = !!watching && Object.hasOwn(watching, entry.id);
        if (f.mine && watching && !mine) return false;
        const sign = flags(entry, now);
        if (f.fresh && !sign.fresh) return false;
        if (f.types.length && !f.types.includes(entry.kind)) return false;
        if (mine) return true;
        if (f.hideCn && entry.cn) return false;
        if (f.hideKids && sign.kids) return false;
        if (f.hideShort && sign.short) return false;
        const score = parseFloat(entry.score) || 0;
        if (f.hideUnrated && !(score > 0)) return false;
        if (f.long && sign.len >= f.long) return false;
        if (f.min && score > 0 && score < f.min) return false;
        if (f.noGenres.length && (entry.genres || []).some(g => f.noGenres.includes(g))) return false;
        return true;
    }

    root.AgSchedule = { DEFAULT_FILTERS, LONG_STEPS, MIN_STEPS, DAY, WEEK, filters, isChinese, weekStart, remember, weekEntries, flags, passes };
})(typeof globalThis !== 'undefined' ? globalThis : window);
