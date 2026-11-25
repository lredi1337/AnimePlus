// modules/shared/pick-core.js
// Подбор аниме вопросами без браузера и сети: вопросы, веса тайтлов, выбор следующего вопроса и подборка.
// Каталог собирает tools/build-pick-catalog.js, страница — pick/pick.js. Состояние подбора — простой объект,
// его можно сохранить в chrome.storage и продолжить позже.
//
// Ответ не выбрасывает тайтл, а умножает его вес: «Нет» сильно, «Скорее нет» мягко. Поэтому одна ошибка
// зрителя не ломает подборку, а «Назад» просто пересчитывает веса без последнего ответа.
//
// Вопросы двух видов. Обычные «да / нет» делят оставшиеся тайтлы пополам и быстро сужают выбор. Но редкий жанр
// (спорт — пара процентов каталога) таким вопросом не спросится никогда, поэтому есть вопросы с выбором:
// «Что-то из этого?» (темы), «Какой формат?» и «Что из этого понравилось?» (четыре известных тайтла).

(function (root) {
    'use strict';

    // Множитель веса: [тайтл подходит под вопрос, не подходит]
    const MULT = { yes: [1, 0.12], prob: [1, 0.45], skip: [1, 1], probno: [0.45, 1], no: [0.12, 1] };
    // Выбор из вариантов: тайтл подходит под выбранное — вес не меняется, нет — так
    const PICK_MISS = 0.2;
    // «Понравилось»: тайтлы, не похожие ни на один выбранный, — так
    const LIKED_MISS = 0.55;
    // Тайтл «ещё в игре», пока множитель ответов не ниже этого
    const ALIVE = 0.3;
    // Каждый какой вопрос — «Что из этого понравилось?»
    const LIKED_EVERY = 4;
    const LIKED_SHOWN = 4;
    // Из скольких самых известных тайтлов выбираются примеры: остальные мало кто видел
    const LIKED_POOL = 150;
    const MAX_QUESTIONS = 12;
    const SURPRISE_QUESTIONS = 6;
    const STOP_ALIVE = 12;
    // Столько «Не важно» подряд — значит, зритель готов смотреть подборку
    const STOP_SKIPS = 4;
    // Следующий вопрос — случайный среди стольких лучших, чтобы подбор каждый раз шёл по-разному
    const TOP_CHOICES = 5;
    const RECENT_PENALTY = 0.55;
    // Тайтлы из прошлых подборок идут ниже: при тех же ответах подборка не повторяется слово в слово
    const RECENT_SHOWN_PENALTY = 0.55;
    // Насколько перемешивать: примеры «понравилось» и подборку (±SHUFFLE к рейтингу тайтла)
    const LIKED_SHUFFLE = 1;
    const SHUFFLE = 0.25;
    // Ниже этой оценки тайтл советуется, только если совсем ничего другого нет
    const MIN_SCORE = 7;
    const HIT_SCORE = 7.5;

    // Жанры и темы Shikimori (id GraphQL)
    const G = {
        action: [1], adventure: [2], comedy: [4, 112, 20], drama: [8], ecchi: [9], fantasy: [10, 197, 124],
        horror: [14], mystery: [7, 39], slice: [36, 140, 119], romance: [22, 107, 151], sport: [30, 102, 118, 3],
        supernatural: [37, 32, 6], scifi: [24], isekai: [130, 106], school: [23], space: [29], mecha: [18],
        music: [19, 142, 145, 150, 136], food: [543], historical: [13, 21], military: [38], psych: [40],
        games: [103, 11, 146], harem: [35, 125], adults: [104], dark: [40, 14, 105, 117], gore: [105]
    };
    // Для сходства тайтлов: аудитория и «Удостоено наград» о сюжете ничего не говорят
    const NOT_FOR_SIMILARITY = new Set([27, 25, 42, 43, 15, 114]);
    const KIDS = 15;

    const has = (t, ids) => ids.some(id => t.genres.has(id));
    const isShort = t => t.kind === 'movie' || (t.eps > 0 && t.eps <= 13);
    const forKids = t => t.genres.has(KIDS) || ((t.rating === 'g' || t.rating === 'pg') && !has(t, G.gore) && !has(t, G.ecchi) && !has(t, G.horror));

    // yes / no — как ответ звучит в строке «Почему вам»
    const QUESTIONS = [
        { id: 'comedy', t: ['Хотите посмеяться?', 'Нужна комедия?'], yes: 'смешное', no: 'без дурачества', test: t => has(t, G.comedy) },
        { id: 'dark', t: ['Готовы к тяжёлому или мрачному?', 'Можно, чтобы было жёстко?'], hint: 'Психологическое, ужасы, жестокость, триллер', yes: 'мрачное', no: 'без мрачности', test: t => has(t, G.dark) || t.rating === 'r_plus' },
        { id: 'drama', t: ['Хочется, чтобы зацепило за живое?', 'Нужна драма?'], yes: 'драма', no: 'без драмы', test: t => has(t, G.drama) },
        { id: 'short', t: ['Что-то на один-два вечера?', 'Хочется покороче?'], hint: 'Фильм или до 13 серий', yes: 'короткое', no: 'длинная история', test: isShort },
        { id: 'long', t: ['Готовы к большой истории, 50+ серий?'], yes: 'надолго', no: 'не бесконечное', test: t => t.eps >= 50 },
        { id: 'movie', t: ['Может, фильм, а не сериал?', 'Хочется посмотреть за один присест?'], yes: 'фильм', no: 'сериал', test: t => t.kind === 'movie' },
        { id: 'new', t: ['Хочется свежего, последних пары лет?', 'Только новинки?'], yes: 'свежее', no: 'не новинка', test: (t, env) => t.year >= env.year - 1 },
        { id: 'old', t: ['Не против классики, до 2010-го?', 'Готовы к старой рисовке?'], yes: 'классика', no: 'современное', test: t => t.year > 0 && t.year < 2010 },
        { id: 'romance', t: ['Нужна романтика?', 'Хочется про любовь?'], yes: 'романтика', no: 'без романтики', test: t => has(t, G.romance) },
        { id: 'isekai', t: ['Попаданцы в другой мир?', 'Герой переносится в другой мир?'], yes: 'другой мир', no: 'без попаданцев', test: t => has(t, G.isekai) },
        { id: 'school', t: ['Про школу или студентов?'], yes: 'школа', no: 'не про школу', test: t => has(t, G.school) },
        { id: 'sport', t: ['Спорт и соревнования?'], yes: 'спорт', no: 'без спорта', test: t => has(t, G.sport) },
        { id: 'space', t: ['Космос?', 'Звёзды, корабли, другие планеты?'], yes: 'космос', no: 'на Земле', test: t => has(t, G.space) },
        { id: 'fantasy', t: ['Магия и фэнтези?', 'Волшебный мир, драконы, заклинания?'], yes: 'фэнтези', no: 'без магии', test: t => has(t, G.fantasy) },
        { id: 'scifi', t: ['Фантастика, технологии, будущее?'], yes: 'фантастика', no: 'без фантастики', test: t => has(t, G.scifi) },
        { id: 'slice', t: ['Хочется спокойного, про обычную жизнь?', 'Уютное, без больших битв?'], yes: 'уютное', no: 'с событиями', test: t => has(t, G.slice) },
        { id: 'action', t: ['Нужны драки и экшен?', 'Чтобы много сражались?'], yes: 'экшен', no: 'без драк', test: t => has(t, G.action) },
        { id: 'adventure', t: ['Хочется приключений и путешествий?'], yes: 'приключения', no: 'без странствий', test: t => has(t, G.adventure) },
        { id: 'mystery', t: ['Хотите разгадывать загадку?', 'Детектив или тайна?'], yes: 'загадка', no: 'без головоломок', test: t => has(t, G.mystery) },
        { id: 'psych', t: ['Хочется подумать над смыслом?', 'Психологическое, игры разума?'], yes: 'есть о чём подумать', no: 'без загрузов', test: t => has(t, G.psych) },
        { id: 'supernatural', t: ['Духи, демоны, вампиры?', 'Сверхъестественное?'], yes: 'сверхъестественное', no: 'без мистики', test: t => has(t, G.supernatural) },
        { id: 'music', t: ['Про музыку или сцену?'], yes: 'музыка', no: 'не про музыку', test: t => has(t, G.music) },
        { id: 'mecha', t: ['Роботы и мехи?'], yes: 'роботы', no: 'без роботов', test: t => has(t, G.mecha) },
        { id: 'horror', t: ['Хотите, чтобы было страшно?'], yes: 'страшное', no: 'не страшное', test: t => has(t, G.horror) },
        { id: 'food', t: ['Про еду, чтобы захотелось есть?'], yes: 'про еду', no: 'не про еду', test: t => has(t, G.food) },
        { id: 'historical', t: ['Прошлые века, самураи?', 'Исторический сеттинг?'], yes: 'история', no: 'не про прошлое', test: t => has(t, G.historical) },
        { id: 'military', t: ['Война и армия?'], yes: 'война', no: 'без войны', test: t => has(t, G.military) },
        { id: 'games', t: ['Игры: видеоигры, стратегии, ставки?'], yes: 'игры', no: 'не про игры', test: t => has(t, G.games) },
        { id: 'adults', t: ['Чтобы герои были взрослыми?'], yes: 'взрослые герои', no: 'юные герои', test: t => has(t, G.adults) },
        { id: 'kids', t: ['Будете смотреть с ребёнком?'], yes: 'для детей', no: '', test: forKids },
        { id: 'harem', t: ['Не против гарема?'], yes: 'гарем', no: 'без гарема', test: t => has(t, G.harem), prio: 0.6 },
        { id: 'ecchi', t: ['Можно с откровенными сценами?'], yes: 'откровенное', no: 'без откровенного', test: t => has(t, G.ecchi), prio: 0.6 },
        { id: 'popular', t: ['Хотите то, что все смотрели?'], yes: 'все смотрели', no: 'не мейнстрим', test: t => t.pop >= 0.85 },
        { id: 'hidden', t: ['Рискнёте на малоизвестном?'], hint: 'Хорошие оценки, но мало зрителей', yes: 'малоизвестное', no: 'проверенное', test: t => t.pop < 0.4 },
        { id: 'high', t: ['Только с высокой оценкой, от 8.3?'], yes: 'оценка 8.3+', no: '', test: t => t.score >= 8.3 }
    ];
    const QMAP = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));

    // Вопросы с выбором. Варианты тем — это обычные вопросы: выбранная тема потом не спрашивается отдельно
    // Сначала жанры, которые знает каждый, потом темы. Настроения тоже здесь: «Игры» или «Фантастику»
    // вопрос «да / нет» почти никогда не спросит — их мало в каталоге
    const THEME_OPTIONS = ['comedy', 'drama', 'action', 'adventure', 'fantasy', 'scifi', 'mystery', 'psych', 'supernatural', 'horror',
        'romance', 'slice', 'sport', 'isekai', 'space', 'mecha', 'music', 'food', 'historical', 'military', 'games', 'school', 'kids'];
    const THEME_LABELS = {
        comedy: 'Комедия', drama: 'Драма', action: 'Экшен', adventure: 'Приключения', scifi: 'Фантастика', psych: 'Психологическое',
        supernatural: 'Мистика', military: 'Война', games: 'Игры',
        sport: 'Спорт', isekai: 'Другой мир', romance: 'Романтика', space: 'Космос', mecha: 'Роботы', fantasy: 'Магия',
        mystery: 'Детектив', horror: 'Ужасы', music: 'Музыка', food: 'Еда', historical: 'Самураи и история', school: 'Школа',
        slice: 'Уютное', kids: 'Для детей'
    };
    const FORMATS = [
        { id: 'movie', label: 'Фильм', why: 'фильм', test: t => t.kind === 'movie' },
        { id: 'shortSeries', label: 'Короткий сериал, до 13 серий', why: 'короткий сериал', test: t => t.kind !== 'movie' && t.eps > 0 && t.eps <= 13 },
        { id: 'midSeries', label: 'Сериал на 20–40 серий', why: 'сериал на пару недель', test: t => t.kind !== 'movie' && t.eps > 13 && t.eps < 50 },
        { id: 'longSeries', label: 'Надолго, от 50 серий', why: 'надолго', test: t => t.eps >= 50 }
    ];
    const CHOICES = {
        themes: {
            id: 'themes', choice: true, multi: true, combine: true, t: ['Что-то из этого хочется?'], hint: 'Можно выбрать несколько',
            none: 'Ничего конкретного',
            options: THEME_OPTIONS.map(id => ({ id, label: THEME_LABELS[id], why: QMAP[id].yes, test: QMAP[id].test, strict: id === 'kids' })),
            covers: THEME_OPTIONS.slice()
        },
        format: {
            id: 'format', choice: true, multi: true, t: ['Какой формат?'], hint: 'Можно выбрать несколько', none: 'Не важно',
            options: FORMATS, covers: ['short', 'movie', 'long']
        }
    };

    // Поправки на экране подборки
    const TWEAKS = [
        // «Короче» — явная просьба зрителя: длинное почти уходит, как при ответе «да» (со «скорее да» длинный хит оставался первым)
        { id: 'shorter', label: 'Короче', answers: [{ q: 'short', a: 'yes' }] },
        { id: 'newer', label: 'Новее', answers: [{ q: 'new', a: 'prob' }] },
        { id: 'funnier', label: 'Повеселее', answers: [{ q: 'comedy', a: 'prob' }, { q: 'dark', a: 'probno' }] },
        { id: 'darker', label: 'Помрачнее', answers: [{ q: 'dark', a: 'prob' }] },
        { id: 'simpler', label: 'Попроще', answers: [{ q: 'psych', a: 'probno' }, { q: 'mystery', a: 'probno' }, { q: 'slice', a: 'prob' }] }
    ];

    // «Не то»: причина → что меняется в подборке
    const REASONS = [
        { id: 'seen', label: 'Уже смотрел', done: 'Убрал. Больше не предложу' },
        { id: 'art', label: 'Не нравится рисовка', done: 'Работы этой студии опущу ниже' },
        { id: 'long', label: 'Слишком длинное', done: 'Учёл: покороче' },
        { id: 'old', label: 'Слишком старое', done: 'Учёл: посвежее' },
        { id: 'dark', label: 'Слишком мрачное', done: 'Учёл: без мрачности' },
        { id: 'meh', label: 'Просто не цепляет', done: 'Убрал этот тайтл' }
    ];

    /** Каталог из pick/catalog.json → тайтлы с Set жанров и популярностью 0..1 (доля тайтлов, у которых зрителей меньше) */
    function unpack(json) {
        const fields = json.fields;
        const list = json.items.map(row => {
            const t = {};
            fields.forEach((f, i) => { t[f] = row[i]; });
            t.genres = new Set(t.genres || []);
            return t;
        });
        const byViewers = [...list].sort((a, b) => a.viewers - b.viewers);
        byViewers.forEach((t, i) => { t.pop = list.length > 1 ? i / (list.length - 1) : 1; });
        list.genreNames = json.genres || {};
        list.byId = new Map(list.map(t => [t.id, t]));
        list.famous = [...list].sort((a, b) => b.viewers - a.viewers).slice(0, LIKED_POOL);
        return list;
    }

    function newState(pre) {
        const s = { answers: [], tweaks: [], tweakOn: [], rejTweaks: [], excluded: [], studios: [], shown: [], roles: {}, phr: {}, planned: [], surprise: false };
        if (pre === 'short') s.answers.push({ q: 'short', a: 'yes' });
        if (pre === 'nodark') s.answers.push({ q: 'dark', a: 'no' });
        if (pre === 'laugh') s.answers.push({ q: 'comedy', a: 'yes' });
        if (pre === 'surprise') { s.answers.push({ q: 'hidden', a: 'prob' }); s.surprise = true; }
        return s;
    }

    function similarity(a, b) {
        let both = 0;
        let all = 0;
        const seen = new Set();
        for (const g of a.genres) { if (NOT_FOR_SIMILARITY.has(g)) continue; seen.add(g); all++; if (b.genres.has(g)) both++; }
        for (const g of b.genres) { if (!NOT_FOR_SIMILARITY.has(g) && !seen.has(g)) all++; }
        return all ? both / all : 0;
    }
    const SIMILAR = 0.4;
    const nameOf = t => t.ru || t.en;

    /** Вопрос по id: обычный, с выбором («themes», «format»), «liked:ID,ID,…» — какие из тайтлов понравились */
    function question(id, cat) {
        if (QMAP[id]) return QMAP[id];
        if (CHOICES[id]) return CHOICES[id];
        const m = /^liked:([\d,]+)$/.exec(id);
        if (!m) return null;
        const shown = m[1].split(',').map(Number).map(x => cat.byId.get(x)).filter(Boolean);
        return { id, liked: true, multi: true, shown, t: ['Что из этого вам понравилось?'], hint: 'Отметьте то, что видели и понравилось', none: 'Ничего из этого' };
    }

    const yesLike = a => a === 'yes' || a === 'prob';
    const noLike = a => a === 'no' || a === 'probno';

    /** Ответ в строке «что уже сказал»: { text, yes } или null для «Не важно» */
    function answerLabel(ans, cat) {
        const q = question(ans.q, cat);
        if (!q || ans.a === 'skip') return null;
        if (ans.a === 'pick') {
            const v = ans.v || [];
            if (!v.length) return null;
            if (q.liked) return { text: `понравилось: ${v.map(id => cat.byId.get(id)).filter(Boolean).map(nameOf).join(', ')}`, yes: true };
            return { text: v.map(id => (q.options.find(o => o.id === id) || {}).why).filter(Boolean).join(', '), yes: true };
        }
        if (yesLike(ans.a)) return { text: q.yes, yes: true };
        return { text: q.no || `не ${q.yes}`, yes: false };
    }

    function allAnswers(state) {
        return [...state.answers, ...state.tweaks, ...state.rejTweaks];
    }

    // Доля каталога, подходящая под вариант: редкую тему зритель выбирает нарочно, и весит она больше
    function optionShare(cat, o, env) {
        if (!cat.optionShare) cat.optionShare = new Map();
        if (!cat.optionShare.has(o.id)) cat.optionShare.set(o.id, cat.filter(t => o.test(t, env)).length / (cat.length || 1));
        return cat.optionShare.get(o.id);
    }

    /**
     * Выбор из вариантов. Формат — «или»: подходит под любой выбранный, и хорошо. Темы складываются: тайтл
     * со «Спортом» и «Школой» лучше, чем только со «Школой», а пропущенная редкая тема стоит дороже частой.
     * «Для детей» — строгое условие
     */
    function choiceFactor(q, v, t, env, cat) {
        const picked = q.options.filter(o => v.includes(o.id));
        const hits = picked.filter(o => o.test(t, env));
        if (!hits.length) return PICK_MISS;
        if (picked.some(o => o.strict && !hits.includes(o))) return 0.1;
        if (!q.combine) return 1;
        return picked.filter(o => !hits.includes(o)).reduce((f, o) => f * (optionShare(cat, o, env) < 0.15 ? 0.35 : 0.6), 1);
    }

    /** Множитель одного ответа для тайтла */
    function answerFactor(q, ans, t, env, cat) {
        if (ans.a === 'pick') {
            const v = ans.v || [];
            if (!v.length) return 1;
            if (q.liked) {
                const liked = v.map(id => cat.byId.get(id)).filter(Boolean);
                return liked.some(y => y.id !== t.id && similarity(t, y) >= SIMILAR) ? 1 : LIKED_MISS;
            }
            return choiceFactor(q, v, t, env, cat);
        }
        const m = MULT[ans.a];
        return m ? m[q.test(t, env) ? 0 : 1] : 1;
    }

    /** Множитель ответов для каждого тайтла: 1 — подходит под всё, около 0 — против всех ответов */
    function fit(cat, state, env, answers = allAnswers(state)) {
        const qs = answers.map(a => [question(a.q, cat), a]).filter(([q]) => q);
        const excluded = new Set(state.excluded);
        const studios = new Set(state.studios);
        return cat.map(t => {
            if (excluded.has(t.id) || (env.seen && env.seen.has(t.id))) return 0;
            let w = 1;
            for (const [q, a] of qs) w *= answerFactor(q, a, t, env, cat);
            if (t.studio && studios.has(t.studio)) w *= 0.45;
            return w;
        });
    }

    /** Насколько тайтл хорош сам по себе: популярность с поправкой на опыт зрителя и оценка */
    function prior(t, env) {
        const veteran = env.stable && env.stable.veteran;
        let p = veteran === 'yes' ? 0.8 + 0.2 * t.pop : veteran === 'no' ? 0.35 + 0.65 * t.pop : 0.55 + 0.45 * t.pop;
        if (veteran === 'yes' && t.pop > 0.97) p *= 0.8;
        if (t.genres.has(KIDS)) p *= 0.6;
        // Слабая оценка — почти никогда: «малоизвестное» не значит «плохое»
        if (t.score > 0 && t.score < MIN_SCORE) p *= 0.15;
        if (env.recentShown && env.recentShown.has(t.id)) p *= RECENT_SHOWN_PENALTY;
        const score = t.score > 0 ? Math.min(1, Math.max(0, (t.score - 6.5) / 2.5)) : 0.3;
        return p * (0.65 + 0.35 * score);
    }

    const aliveCount = w => w.reduce((n, x) => n + (x >= ALIVE ? 1 : 0), 0);

    function ranked(cat, state, env, w = fit(cat, state, env)) {
        return cat.map((t, i) => ({ t, w: w[i], r: w[i] * prior(t, env) })).filter(x => x.w > 0).sort((a, b) => b.r - a.r);
    }

    /** Сколько ещё подходит и кто сейчас впереди */
    function progress(cat, state, env, leaders = 4) {
        const w = fit(cat, state, env);
        return { alive: aliveCount(w), total: cat.length, leaders: ranked(cat, state, env, w).slice(0, leaders).map(x => x.t) };
    }

    const isSkip = a => a.a === 'skip' || (a.a === 'pick' && !(a.v || []).length);

    /** Пора показывать подборку: подходящих мало, вопросов много или зрителю всё равно уже несколько вопросов подряд */
    function shouldStop(cat, state, env) {
        const limit = state.surprise ? SURPRISE_QUESTIONS : MAX_QUESTIONS;
        const tail = state.answers.slice(-STOP_SKIPS);
        if (state.answers.length >= 6 && tail.length === STOP_SKIPS && tail.every(isSkip)) return true;
        return state.answers.length >= limit || aliveCount(fit(cat, state, env)) <= STOP_ALIVE;
    }

    /**
     * Вопросы, на которые ответ уже есть. Темы закрывают только выбранное: «Ничего конкретного» не значит
     * «комедия не нужна», и вопрос «Хотите посмеяться?» потом ещё может прозвучать. Формат закрывает
     * вопросы о длине, только если зритель его выбрал
     */
    function coveredIds(state) {
        const asked = new Set();
        for (const a of state.answers) {
            asked.add(a.q);
            const v = a.v || [];
            if (a.q === 'themes') v.forEach(id => asked.add(id));
            if (a.q === 'format' && v.length) CHOICES.format.covers.forEach(id => asked.add(id));
        }
        return asked;
    }

    /** Четыре известных и непохожих друг на друга тайтла для «Что из этого понравилось?» */
    function likedQuestion(cat, state, env, rng, balance) {
        const asked = new Set(state.answers.filter(a => /^liked:/.test(a.q)).flatMap(a => a.q.slice(6).split(',').map(Number)));
        const excluded = new Set(state.excluded);
        let pool = cat.famous.filter(y => !asked.has(y.id) && !excluded.has(y.id));
        // Что уже показывали в прошлых подборах и зритель не отметил, второй раз не спрашиваем, пока есть из чего выбрать
        const before = env.recentLiked || new Set();
        const fresh = pool.filter(y => !before.has(y.id));
        if (fresh.length >= LIKED_SHOWN * 3) pool = fresh;
        // Зритель вошёл в Shikimori: спрашиваем о том, что он видел, — на такое он точно ответит
        if (env.seen && env.seen.size) {
            const mine = cat.filter(y => env.seen.has(y.id) && !asked.has(y.id) && !excluded.has(y.id))
                .sort((a, b) => b.viewers - a.viewers).slice(0, LIKED_POOL);
            const mineFresh = mine.filter(y => !before.has(y.id));
            if (mineFresh.length >= LIKED_SHOWN * 2) pool = mineFresh;
            else if (mine.length >= LIKED_SHOWN * 2) pool = mine;
        }
        // Полезность примера плюс заметная случайность: из подходящих каждый раз выпадают разные
        const scored = pool.map(y => ({ y, b: balance(t => t.id !== y.id && similarity(t, y) >= SIMILAR) }))
            .filter(x => x.b > 0).map(x => ({ y: x.y, b: x.b + rng() * LIKED_SHUFFLE })).sort((a, b) => b.b - a.b);
        const shown = [];
        for (const { y } of scored) {
            if (shown.every(s => similarity(s, y) < 0.34)) shown.push(y);
            if (shown.length === LIKED_SHOWN) break;
        }
        return shown.length >= 3 ? question(`liked:${shown.map(y => y.id).join(',')}`, cat) : null;
    }

    /**
     * Следующий вопрос. Первым — «Что-то из этого?» (темы), третьим — формат, каждым четвёртым — «Что понравилось?».
     * Остальные — те, что делят оставшиеся тайтлы ближе всего к половине, но случайно среди лучших,
     * а вопросы прошлых подборов (env.recent) идут реже. Раз за всё время — вопрос про опыт зрителя.
     */
    function nextQuestion(cat, state, env, rng = Math.random) {
        const asked = coveredIds(state);
        if (!asked.has('themes')) return CHOICES.themes;
        if (!env.stable || !env.stable.veteran) {
            if (!state.askedVeteran && state.answers.length >= 1) return { id: 'veteran', stable: true };
        }
        if (!asked.has('format') && !['short', 'movie', 'long'].some(id => asked.has(id)) && state.answers.length >= 2) return CHOICES.format;

        const w = fit(cat, state, env);
        const alive = cat.map((t, i) => ({ t, w: w[i] * prior(t, env) })).filter((x, i) => w[i] >= ALIVE);
        const total = alive.reduce((s, x) => s + x.w, 0) || 1;
        const recent = env.recent || new Set();
        const balance = (test) => {
            const p = alive.reduce((s, x) => s + (test(x.t, env) ? x.w : 0), 0) / total;
            return p > 0.03 && p < 0.97 ? 1 - Math.abs(p - 0.5) * 2 : -1;
        };
        // Зритель пропускает вопрос за вопросом: о себе он почти ничего не сказал. Тогда раньше спросить,
        // что из известного ему понравилось, — на постеры отвечать проще, чем на «да / нет»
        let skips = 0;
        for (let i = state.answers.length - 1; i >= 0 && isSkip(state.answers[i]); i--) skips++;
        const likedYet = state.answers.some(a => /^liked:/.test(a.q));
        if (state.answers.length % LIKED_EVERY === LIKED_EVERY - 1 || (!likedYet && skips >= 2)) {
            const liked = likedQuestion(cat, state, env, rng, balance);
            if (liked) return liked;
        }
        const best = QUESTIONS.filter(q => !asked.has(q.id))
            .map(q => ({ q, b: balance(q.test) * (recent.has(q.id) ? RECENT_PENALTY : 1) * (q.prio || 1) }))
            .filter(x => x.b > 0.05).sort((a, b) => b.b - a.b).slice(0, TOP_CHOICES);
        return best.length ? best[Math.floor(rng() * best.length)].q : null;
    }

    /** Ответ на вопрос. v — выбранные варианты вопроса с выбором. Понравившийся тайтл зритель видел: он уходит из подборки */
    function answer(state, q, a, v) {
        if (q.choice || q.liked) {
            const picks = Array.isArray(v) ? v.slice() : [];
            state.answers.push({ q: q.id, a: 'pick', v: picks });
            if (q.liked) picks.forEach(id => { if (!state.excluded.includes(id)) state.excluded.push(id); });
            return;
        }
        state.answers.push({ q: q.id, a });
    }

    function undo(state) {
        const last = state.answers.pop();
        if (last && /^liked:/.test(last.q)) state.excluded = state.excluded.filter(id => !(last.v || []).includes(id));
        return last || null;
    }

    /** Тайтлы, показанные в «Что из этого понравилось?» за этот подбор: в следующих подборах их не повторяем */
    function likedShownIn(state) {
        return [...new Set(state.answers.filter(a => /^liked:/.test(a.q)).flatMap(a => a.q.slice(6).split(',').map(Number)))];
    }

    /** Тайтлы, которые зритель отметил как увиденные за этот подбор: «понравилось» и «Уже смотрел» */
    function seenInState(state) {
        const liked = state.answers.filter(a => /^liked:/.test(a.q)).flatMap(a => a.v || []);
        return [...new Set([...liked, ...(state.seenMarked || [])])];
    }

    const ROLES = {
        top: 'Точное попадание', hit: 'Хит', dark: 'Находка', short: 'Покороче', fresh: 'Посвежее',
        more: 'Подходит', new: 'Новое', similar: 'Похоже'
    };

    const decent = t => !(t.score > 0 && t.score < MIN_SCORE);

    /**
     * Подборка из count тайтлов. Без keep — с ролями: точное попадание, хит, тёмная лошадка, покороче или посвежее,
     * остальные — по рейтингу, но не клоны уже выбранных. С keep — добавка к уже показанным. С rng — перемешано.
     */
    function pickResults(cat, state, env, count = 6, keep = [], rng = null) {
        let all = ranked(cat, state, env).filter(x => !keep.includes(x.t.id));
        // С rng близкие по рейтингу тайтлы меняются местами: одни и те же ответы дают разную подборку
        if (rng) all = all.map(x => ({ ...x, r: x.r * (1 - SHUFFLE + 2 * SHUFFLE * rng()) })).sort((a, b) => b.r - a.r);
        const ok = all.filter(x => decent(x.t));
        if (ok.length >= count) all = ok;
        const good = all.filter(x => x.w >= ALIVE);
        const base = (good.length >= 3 ? good : all).slice(0, 40).map(x => x.t);
        const rank = new Map(all.map(x => [x.t.id, x.r]));
        const picked = [];
        const roles = {};
        const take = (t, role) => { if (t && !picked.includes(t) && picked.length < count) { picked.push(t); roles[t.id] = role; } };
        const free = () => base.filter(t => !picked.includes(t));

        if (!keep.length) {
            take(base[0], 'top');
            take(free().slice(0, 25).filter(t => t.score >= HIT_SCORE).sort((a, b) => b.pop - a.pop)[0], 'hit');
            // Тёмную лошадку ищем глубже первых сорока: наверху почти одни хиты
            const deep = (good.length >= 3 ? good : all).slice(0, 300).filter(x => x.t.pop < 0.5 && !picked.includes(x.t));
            const dark = deep.sort((a, b) => b.w * b.t.score - a.w * a.t.score)[0];
            take(dark && dark.t, 'dark');
            const lead = picked[0];
            if (lead && !isShort(lead)) take(free().find(isShort), 'short');
            else take(free().find(t => t.year >= env.year - 1), 'fresh');
        }
        const before = keep.map(id => cat.byId.get(id)).filter(Boolean);
        while (picked.length < count) {
            const rest = all.map(x => x.t).filter(t => !picked.includes(t)).slice(0, 30);
            if (!rest.length) break;
            let best = null;
            let bestScore = -Infinity;
            for (const t of rest) {
                const near = Math.max(0, ...[...picked, ...before].map(p => similarity(p, t)));
                const s = rank.get(t.id) * (1 - 0.35 * near);
                if (s > bestScore) { bestScore = s; best = t; }
            }
            take(best, keep.length ? 'new' : 'more');
        }
        return { list: picked.map(t => t.id), roles };
    }

    /** Похожие на тайтл: по жанрам и темам, с учётом ответов */
    function similarTo(cat, state, env, id, count = 6) {
        const y = cat.byId.get(id);
        if (!y) return [];
        const w = fit(cat, state, env);
        return cat.map((t, i) => ({ t, s: t.id === id || !w[i] ? 0 : similarity(t, y) * (0.6 + 0.4 * Math.min(1, w[i])) * prior(t, env) }))
            .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, count).map(x => x.t.id);
    }

    /** «Почему вам»: до четырёх ответов, с которыми тайтл совпал. Только то, что зритель хотел, без «не как…» */
    function whyFor(t, state, env, cat) {
        const out = [];
        for (const a of allAnswers(state)) {
            const q = question(a.q, cat);
            if (!q) continue;
            if (a.a === 'pick') {
                const v = a.v || [];
                if (q.liked) {
                    const like = v.map(id => cat.byId.get(id)).find(y => y && y.id !== t.id && similarity(t, y) >= SIMILAR);
                    if (like) out.push(`похоже на «${nameOf(like)}»`);
                } else {
                    q.options.filter(o => v.includes(o.id) && o.test(t, env)).forEach(o => out.push(o.why));
                }
                continue;
            }
            const match = q.test(t, env);
            if (yesLike(a.a) && match && q.yes) out.push(q.yes);
            if (noLike(a.a) && !match && q.no) out.push(q.no);
        }
        const why = [...new Set(out)].slice(0, 4);
        if (why.length < 2 && t.score >= 8.3) why.push(`оценка ${t.score}`);
        if (!why.length) {
            const names = [...t.genres].filter(g => !NOT_FOR_SIMILARITY.has(g)).map(g => cat.genreNames[g]).filter(Boolean);
            why.push(names.slice(0, 3).join(', ').toLowerCase() || 'хорошие оценки');
        }
        return why;
    }

    /**
     * «Почему вам» для ряда постеров: то, что совпало у большинства тайтлов подборки, на каждом постере
     * повторять незачем — оно уже видно в строке ответов. Остаётся то, чем тайтл выделяется; если ничего,
     * то его жанры. { id: [..] }
     */
    function whyDistinct(ids, state, env, cat) {
        const list = ids.map(id => cat.byId.get(id)).filter(Boolean);
        const all = new Map(list.map(t => [t.id, whyFor(t, state, env, cat)]));
        const count = new Map();
        for (const why of all.values()) for (const w of new Set(why)) count.set(w, (count.get(w) || 0) + 1);
        const common = list.length >= 3 ? new Set([...count].filter(([, n]) => n > list.length / 2).map(([w]) => w)) : new Set();
        const out = {};
        for (const t of list) {
            const own = all.get(t.id).filter(w => !common.has(w));
            if (own.length) { out[t.id] = own.slice(0, 3); continue; }
            const genres = [...t.genres].filter(g => !NOT_FOR_SIMILARITY.has(g)).map(g => cat.genreNames[g]).filter(Boolean)
                .map(g => g.toLowerCase()).filter(g => !common.has(g));
            out[t.id] = genres.slice(0, 3);
        }
        return out;
    }

    /** Подходит слишком мало: какое условие убрать, чтобы нашлось больше. { index, now, then, text } или null */
    function relaxHint(cat, state, env, enough = 4) {
        const now = aliveCount(fit(cat, state, env));
        if (now >= enough || state.answers.length < 2) return null;
        let best = null;
        state.answers.forEach((a, index) => {
            if (isSkip(a)) return;
            const rest = state.answers.filter((_, j) => j !== index);
            const then = aliveCount(fit(cat, state, env, [...rest, ...state.tweaks, ...state.rejTweaks]));
            if (!best || then > best.then) best = { index, then };
        });
        if (!best || best.then <= now) return null;
        const label = answerLabel(state.answers[best.index], cat);
        return { index: best.index, now, then: best.then, text: label ? label.text : '' };
    }

    /** «Не то» с причиной: тайтл уходит, причина сдвигает подборку */
    function reject(state, t, reason) {
        if (!state.excluded.includes(t.id)) state.excluded.push(t.id);
        if (reason === 'seen') state.seenMarked = [...new Set([...(state.seenMarked || []), t.id])];
        if (reason === 'art' && t.studio && !state.studios.includes(t.studio)) state.studios.push(t.studio);
        if (reason === 'long') state.rejTweaks.push({ q: 'short', a: 'prob' });
        if (reason === 'old') state.rejTweaks.push({ q: 'new', a: 'prob' });
        if (reason === 'dark') state.rejTweaks.push({ q: 'dark', a: 'probno' });
        const r = REASONS.find(x => x.id === reason);
        return r ? r.done : '';
    }

    function setTweaks(state, on) {
        state.tweakOn = TWEAKS.map(x => x.id).filter(id => on.includes(id));
        state.tweaks = state.tweakOn.flatMap(id => TWEAKS.find(x => x.id === id).answers);
    }

    root.AgPick = {
        MULT, ALIVE, QUESTIONS, CHOICES, TWEAKS, REASONS, ROLES, MIN_SCORE,
        unpack, newState, similarity, question, answerLabel, fit, prior, aliveCount, progress, shouldStop,
        nextQuestion, answer, undo, seenInState, likedShownIn, pickResults, similarTo, whyFor, whyDistinct, relaxHint, reject, setTweaks, isShort
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
