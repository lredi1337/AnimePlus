// pick/pick.js
// «Подбор аниме»: лиса задаёт вопросы и предлагает сразу несколько разных тайтлов. Открывается значком в окне расширения.
// Вопросы, веса и подборка — modules/shared/pick-core.js, каталог — pick/catalog.json (tools/build-pick-catalog.js).
// Подборка — «витрина»: лучший тайтл крупно, с описанием и кнопками сайтов, остальные постерами.
// Любой тайтл открывается панелью поверх подборки: описание, кадры, где смотреть (поиск общий с Топом, modules/shared/ext-page.js).
// Список Shikimori зрителя (если он вошёл) прячет уже увиденное, «Отложить» кладёт тайтл в «Запланировано».
// Без входа увиденное запоминается само: кнопка «Видел» и тайтлы, отмеченные в «Что из этого понравилось?».

(function () {
    'use strict';

    const P = window.AgPick;
    const STATE_KEY = 'ag_pick_state';
    const RECENT_KEY = 'ag_pick_recent';
    const STABLE_KEY = 'ag_pick_stable';
    // Что зритель отметил увиденным без Shikimori: «Видел», «Уже смотрел» и понравившееся в вопросах
    const LOCAL_SEEN_KEY = 'ag_pick_seen_local';
    const LOCAL_SEEN_MAX = 3000;
    const RECENT_SESSIONS = 3;
    // Что показывали в прошлых подборах: тайтлы «Что из этого понравилось?» и сама подборка.
    // Без этой памяти одинаковые ответы каждый раз давали бы одни и те же тайтлы
    const RECENT_LIKED_KEY = 'ag_pick_recent_liked';
    const RECENT_LIKED_MAX = 120;
    const RECENT_SHOWN_KEY = 'ag_pick_recent_shown';
    // «Не сейчас» у подсказки войти в Shikimori: не показываем неделю
    const LOGIN_HINT_KEY = 'ag_pick_login_hint';
    const LOGIN_HINT_PAUSE_MS = 7 * 24 * 60 * 60 * 1000;
    // Главный тайтл и ряд из семи постеров
    const RESULTS = 8;
    const SITE_TIMEOUT_MS = 15000;
    const PLACEHOLDER = '../icons/icon128.png';
    const POSTER_BASE = 'https://shikimori.io/uploads/poster/animes/';
    const ANSWERS = [['yes', 'Да', 'is-yes'], ['prob', 'Скорее да'], ['skip', 'Не важно'], ['probno', 'Скорее нет'], ['no', 'Нет', 'is-no']];
    const KIND = { movie: 'фильм', ova: 'OVA', ona: 'ONA' };

    const h = (tag, attrs = {}, ...children) => {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
            else if (v !== false && v != null) node.setAttribute(k, v);
        });
        children.flat().forEach(c => { if (c != null && c !== '') node.append(c instanceof Node ? c : document.createTextNode(String(c))); });
        return node;
    };
    const btn = (label, onclick, cls = '', attrs = {}) => h('button', { class: `pk__btn ${cls}`, type: 'button', onclick, ...attrs }, label);
    const fox = (pose) => {
        const box = h('span', { class: 'pk__fox', 'aria-hidden': 'true' });
        if (window.AgGuideFox) box.innerHTML = window.AgGuideFox.svg(pose);
        return box;
    };
    const posterUrl = (t) => {
        if (!t.poster) return PLACEHOLDER;
        // У тайтлов каталога путь, у тайтлов из франшизы (не из каталога) — полный адрес
        const url = /^https:\/\//.test(t.poster) ? t.poster : POSTER_BASE + t.poster;
        return (window.agNormalizePosterUrl && window.agNormalizePosterUrl(url)) || url;
    };
    const poster = (t, cls = '') => {
        const img = h('img', { class: cls, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', src: posterUrl(t) });
        img.addEventListener('error', () => { img.src = PLACEHOLDER; }, { once: true });
        return img;
    };
    const facts = (t) => [
        t.kind === 'tv' ? (t.eps ? `${t.eps} эп.` : 'сериал') : (KIND[t.kind] || t.kind) + (t.kind !== 'movie' && t.eps > 1 ? ` · ${t.eps} эп.` : ''),
        t.year || '',
        t.ongoing ? 'онгоинг' : ''
    ].filter(Boolean).join(' · ');
    const nameOf = (t) => t.ru || t.en;

    const store = {
        async get(keys) { try { return await chrome.storage.local.get(keys); } catch (e) { return {}; } },
        set(values) { chrome.storage.local.set(values).catch(() => {}); }
    };

    let toastTimer = 0;
    function toast(text) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = text;
        el.classList.add('is-shown');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2800);
    }

    async function loadCatalog() {
        const res = await fetch(chrome.runtime.getURL('pick/catalog.json'));
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        return P.unpack(await res.json());
    }

    async function start() {
        const app = document.getElementById('app');
        const note = h('span', { class: 'pk__note' });
        const restart = h('button', { class: 'pk__link', type: 'button', hidden: '' }, 'Начать заново');
        const title = h('h1', {}, h('span', { class: 'pk__fox', style: 'width:28px;height:31px', 'aria-hidden': 'true' }), 'Подбор аниме');
        if (window.AgGuideFox) title.firstChild.innerHTML = window.AgGuideFox.svg('hello');
        const body = h('main', { class: 'pk__body', 'aria-live': 'polite' });
        app.replaceChildren(h('header', { class: 'pk__head' }, h('div', { class: 'pk__head-in' }, title, note, restart)), body);

        let cat;
        try {
            cat = await loadCatalog();
        } catch (e) {
            body.replaceChildren(h('p', { class: 'pk__empty' }, 'Не удалось открыть каталог подбора. Переустановите Anime+ или напишите нам.'));
            return null;
        }

        const saved = await store.get([STATE_KEY, RECENT_KEY, STABLE_KEY, LOCAL_SEEN_KEY, RECENT_LIKED_KEY, RECENT_SHOWN_KEY, LOGIN_HINT_KEY]);
        const env = {
            year: new Date().getFullYear(),
            stable: saved[STABLE_KEY] || {},
            recent: new Set(),
            recentLiked: new Set(),
            recentShown: new Set(),
            seen: null
        };
        let recentQuestions = saved[RECENT_KEY] || [];
        let recentLiked = saved[RECENT_LIKED_KEY] || [];
        let recentShown = saved[RECENT_SHOWN_KEY] || [];
        // Память прошлых подборов действует с начала нового подбора, а не посреди текущего
        const applyMemory = (except = []) => {
            env.recent = new Set(recentQuestions.flat());
            env.recentLiked = new Set(recentLiked);
            env.recentShown = new Set(recentShown.flat().filter(id => !except.includes(id)));
        };
        applyMemory();
        let shikiSeen = new Set();
        let localSeen = new Set(saved[LOCAL_SEEN_KEY] || []);
        const updateSeen = () => { env.seen = new Set([...shikiSeen, ...localSeen]); };
        updateSeen();
        // Увиденное запоминается между подборами и без входа в Shikimori
        const rememberSeen = (ids) => {
            const fresh = ids.filter(id => !localSeen.has(id));
            if (!fresh.length) return;
            localSeen = new Set([...localSeen, ...fresh].slice(-LOCAL_SEEN_MAX));
            store.set({ [LOCAL_SEEN_KEY]: [...localSeen] });
            updateSeen();
        };
        let loggedIn = false;
        let planned = new Set();
        let last = saved[STATE_KEY] || null;
        let state = null;
        let view = 'start';
        let current = null;
        let similarOf = null;

        // Список Shikimori приходит позже, чем страница готова: подбор начинается сразу, а увиденное отсеивается, как только список придёт.
        // seenStatus: '' — ещё не знаем, 'guest' — не вошёл, 'user' — вошёл
        let seenStatus = '';
        let loginHintHidden = Date.now() - (saved[LOGIN_HINT_KEY] || 0) < LOGIN_HINT_PAUSE_MS;
        const loadSeen = () => window.agSendMessage({ action: 'pick_seen' }).then((res) => {
            if (!res || !res.loggedIn) {
                seenStatus = res && !res.error ? 'guest' : seenStatus;
                if (view === 'results') render();
                return;
            }
            seenStatus = 'user';
            loggedIn = true;
            shikiSeen = new Set(res.seen || []);
            updateSeen();
            planned = new Set(res.planned || []);
            const hidden = cat.filter(t => shikiSeen.has(t.id)).length;
            note.textContent = hidden ? `Скрыто из вашего списка Shikimori: ${hidden}` : '';
            if (view !== 'ask') render();
        });
        loadSeen();
        // Вошёл в Shikimori в соседней вкладке: список увиденного приходит заново, подборка обновляется
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.shiki_user && changes.shiki_user.newValue) {
                loadSeen().then(() => { if (view === 'results' && state) { refresh(); toast('Вы вошли в Shikimori: убрал то, что уже есть в вашем списке'); } });
            }
        });

        const save = () => store.set({ [STATE_KEY]: { ...state, at: Date.now() } });
        const rng = Math.random;

        function render() {
            restart.hidden = view === 'start';
            body.classList.toggle('is-wide', view === 'results');
            if (view === 'start') renderStart();
            else if (view === 'ask') renderAsk();
            else renderResults();
        }

        // ---------- Начало ----------
        function renderStart() {
            const go = (pre) => begin(pre);
            const chips = h('div', { class: 'pk__chips' },
                h('button', { class: 'pk__chip', type: 'button', onclick: () => go('short') }, 'Что-то короткое'),
                h('button', { class: 'pk__chip', type: 'button', onclick: () => go('nodark') }, 'Без мрачного'),
                h('button', { class: 'pk__chip', type: 'button', onclick: () => go('laugh') }, 'Посмеяться'),
                h('button', { class: 'pk__chip', type: 'button', onclick: () => go('surprise') }, 'Удиви меня'));
            let resume = null;
            const lastShown = last && Array.isArray(last.shown) ? last.shown.filter(id => cat.byId.has(id)) : [];
            if (lastShown.length) {
                resume = h('div', { class: 'pk__resume' },
                    h('div', { class: 'pk__stack' }, lastShown.slice(0, 3).map(id => poster(cat.byId.get(id)))),
                    h('div', { class: 'pk__resume-text' }, h('b', {}, 'Прошлая подборка'), ` · вариантов: ${lastShown.length}, ответов: ${last.answers.length}`),
                    btn('Продолжить', () => {
                        state = { ...P.newState(), ...last };
                        applyMemory(state.shown);
                        view = 'results';
                        similarOf = null;
                        render();
                    }, 'is-sm'));
            }
            const memoLines = [];
            if (env.stable.veteran) {
                const text = { yes: 'вы смотрите много, поэтому меньше очевидных хитов', mid: 'вы смотрели кое-что, поэтому хиты и находки поровну', no: 'вы только начинаете, поэтому больше проверенных хитов' }[env.stable.veteran];
                memoLines.push(h('div', {}, `Помню: ${text}. `, h('button', { class: 'pk__link', type: 'button', onclick: () => {
                    env.stable = {};
                    store.set({ [STABLE_KEY]: {} });
                    toast('Забыл. Спрошу ещё раз');
                    render();
                } }, 'Сбросить')));
            }
            if (localSeen.size) {
                memoLines.push(h('div', {}, `Не предлагаю то, что вы отметили увиденным: ${localSeen.size}. `, h('button', { class: 'pk__link', type: 'button', onclick: () => {
                    localSeen = new Set();
                    store.set({ [LOCAL_SEEN_KEY]: [] });
                    updateSeen();
                    toast('Забыл отметки «Видел»');
                    render();
                } }, 'Забыть')));
            }
            const memo = memoLines.length ? h('div', { class: 'pk__memo' }, memoLines) : null;
            body.replaceChildren(h('section', { class: 'pk__start' },
                fox('hello'),
                h('div', {},
                    h('h2', {}, 'Не знаете, что посмотреть?'),
                    h('p', {}, 'Задам несколько вопросов и предложу сразу несколько разных вариантов. Остановиться можно в любой момент, а неподходящее легко убрать, не начиная заново.'),
                    btn('Начать подбор', () => go(), 'is-primary'),
                    h('div', { class: 'pk__label' }, 'Или сразу с подсказкой'),
                    chips, resume, memo)));
        }

        function begin(pre) {
            applyMemory();
            state = P.newState(pre);
            similarOf = null;
            view = 'ask';
            nextOrFinish();
        }

        // ---------- Вопросы ----------
        function nextOrFinish() {
            if (P.shouldStop(cat, state, env)) return finish();
            current = P.nextQuestion(cat, state, env, rng);
            if (!current) return finish();
            render();
        }

        function finish() {
            rememberSeen(P.seenInState(state));
            const r = P.pickResults(cat, state, env, RESULTS, [], rng);
            state.shown = r.list;
            state.roles = r.roles;
            // Вопросы, примеры «понравилось» и подборка этого раза в следующих подборах пойдут реже
            recentQuestions = [state.answers.map(a => a.q), ...recentQuestions].slice(0, RECENT_SESSIONS);
            recentLiked = [...new Set([...P.likedShownIn(state), ...recentLiked])].slice(0, RECENT_LIKED_MAX);
            recentShown = [state.shown.slice(), ...recentShown].slice(0, RECENT_SESSIONS);
            store.set({ [RECENT_KEY]: recentQuestions, [RECENT_LIKED_KEY]: recentLiked, [RECENT_SHOWN_KEY]: recentShown });
            view = 'results';
            current = null;
            save();
            last = state;
            render();
            window.scrollTo({ top: 0 });
        }

        function phrase(q) {
            if (!state.phr[q.id]) state.phr[q.id] = q.t[Math.floor(rng() * q.t.length)];
            return state.phr[q.id];
        }

        function onAnswer(a) {
            P.answer(state, current, a);
            nextOrFinish();
        }

        function onPick(v) {
            P.answer(state, current, 'pick', v);
            nextOrFinish();
        }

        // Вопрос с выбором: темы и формат — кнопками, «понравилось» — постерами. Пока ничего не выбрано, кнопка — «Ничего конкретного»
        function pickAnswers(q) {
            const picked = new Set();
            const next = btn(q.none, () => onPick([...picked]), 'is-primary pk__next');
            const toggle = (node, id) => {
                if (picked.has(id)) picked.delete(id); else picked.add(id);
                node.classList.toggle('is-on', picked.has(id));
                node.setAttribute('aria-pressed', String(picked.has(id)));
                next.textContent = picked.size ? 'Дальше' : q.none;
            };
            let options;
            if (q.liked) {
                options = h('div', { class: 'pk__liked' }, q.shown.map((t) => {
                    const node = h('button', { class: 'pk__liked-item', type: 'button', 'aria-pressed': 'false', 'data-option': String(t.id) },
                        poster(t), h('b', {}, nameOf(t)), h('span', {}, facts(t)));
                    node.addEventListener('click', () => toggle(node, t.id));
                    return node;
                }));
            } else {
                options = h('div', { class: 'pk__options' }, q.options.map((o) => {
                    const node = h('button', { class: 'pk__chip', type: 'button', 'aria-pressed': 'false', 'data-option': o.id }, o.label);
                    node.addEventListener('click', () => toggle(node, o.id));
                    return node;
                }));
            }
            return h('div', { class: 'pk__pick' }, options, h('div', { class: 'pk__pick-foot' }, next));
        }

        function onVeteran(v) {
            env.stable = { ...env.stable, veteran: v };
            state.askedVeteran = true;
            store.set({ [STABLE_KEY]: env.stable });
            nextOrFinish();
        }

        function onBack() {
            if (current && current.stable) state.askedVeteran = false;
            const undone = P.undo(state);
            if (!undone) return;
            current = P.question(undone.q, cat);
            render();
        }

        function renderAsk() {
            const q = current;
            const prog = P.progress(cat, state, env);
            const share = Math.max(4, 100 - (prog.alive / prog.total) * 100);
            let bubble;
            let answers;
            if (q.stable) {
                bubble = [h('h2', {}, 'Вы уже много аниме посмотрели?'), h('div', { class: 'pk__hint' }, 'Спрошу один раз и запомню')];
                answers = h('div', { class: 'pk__answers is-three' },
                    btn('Да, много', () => onVeteran('yes')), btn('Кое-что', () => onVeteran('mid')), btn('Почти ничего', () => onVeteran('no')));
            } else if (q.choice || q.liked) {
                bubble = [h('h2', {}, q.t[0]), q.hint ? h('div', { class: 'pk__hint' }, q.hint) : null];
                answers = pickAnswers(q);
            } else {
                bubble = [h('h2', {}, phrase(q)), q.hint ? h('div', { class: 'pk__hint' }, q.hint) : null];
                answers = h('div', { class: 'pk__answers' }, ANSWERS.map(([a, label, cls]) => btn(label, () => onAnswer(a), cls || '', { 'data-answer': a })));
            }
            const trail = state.answers.map(a => P.answerLabel(a, cat)).filter(Boolean)
                .map(l => h('span', { class: l.yes ? 'is-yes' : 'is-no' }, l.text));
            const leaders = prog.leaders.map(t => h('li', {}, h('button', { class: 'pk__leader', type: 'button', title: nameOf(t), onclick: () => {
                finish();
                // Зацепивший тайтл — первым в подборке
                state.shown = [t.id, ...state.shown.filter(id => id !== t.id)].slice(0, RESULTS);
                state.roles[t.id] = state.roles[t.id] || 'top';
                save();
                render();
            } }, poster(t), h('div', {}, h('b', {}, nameOf(t)), h('span', {}, facts(t))))));

            body.replaceChildren(h('div', { class: 'pk__ask' },
                h('section', { class: 'pk__qcard' },
                    h('div', { class: 'pk__qmeta' },
                        h('span', {}, 'Подходит ', h('b', {}, String(prog.alive)), ` из ${prog.total}`),
                        h('div', { class: 'pk__meter', 'aria-hidden': 'true' }, h('i', { style: `width:${share.toFixed(1)}%` })),
                        h('span', {}, `вопрос ${state.answers.length + 1}`)),
                    h('div', { class: 'pk__qrow' }, fox(q.liked ? 'wow' : 'think'), h('div', { class: 'pk__bubble' }, bubble)),
                    answers,
                    h('div', { class: 'pk__qfoot' },
                        btn('← Назад', onBack, 'is-ghost is-sm', { disabled: state.answers.length ? false : '' }),
                        h('span', { class: 'pk__keys' }, q.choice || q.liked ? 'Enter — дальше, Backspace — назад' : 'Клавиши 1–5 отвечают, Backspace — назад'),
                        btn('Хватит, покажите', finish, 'is-sm')),
                    trail.length ? h('div', { class: 'pk__trail' }, trail) : null),
                h('aside', { class: 'pk__leaders' },
                    h('h3', {}, 'Пока впереди'),
                    h('p', {}, 'Меняется после каждого ответа. Нажмите, если уже зацепило.'),
                    h('ul', {}, leaders))));
        }

        // ---------- Подборка ----------
        // Подробности тайтла (описание, кадры) и где он есть на сайтах: один запрос на тайтл за всё время страницы
        const detailsCache = new Map();
        const loadDetails = (id) => {
            if (!detailsCache.has(id)) {
                detailsCache.set(id, window.agSendMessage({ action: 'get_anime_card', id }).then(r => (r && r.anime) || null).catch(() => null));
            }
            return detailsCache.get(id);
        };
        const sitesCache = new Map();
        // Просмотр кадров из панели тайтла, общий со «Случайным» (modules/shared/shot-viewer.js)
        const shotViewer = window.AgShotViewer.create('pk');
        document.body.append(shotViewer.node);

        // ---------- «Порядок просмотра» в главной карточке и панели тайтла ----------
        // Франшиза приходит с подробностями тайтла (get_anime_card). Блок общий со «Случайным»: modules/shared/franchise-view.js
        const frState = window.AgFranchiseView ? window.AgFranchiseView.state() : null;
        const frBox = () => h('div', { class: 'pk__franchise', hidden: '' });
        function paintFranchise(box, franchise, current) {
            if (!box || !frState) return;
            box.agFranchise = franchise;
            box.agCurrent = current;
            const markup = window.AgFranchiseView.html(franchise, frState, current);
            box.innerHTML = markup;
            box.hidden = !markup;
        }
        // Тайтл франшизы, которого нет в каталоге подбора: панель по данным франшизы, подробности догрузятся из Shikimori
        const FR_KIND = { 'tv сериал': 'tv', 'фильм': 'movie', ova: 'ova', ona: 'ona', 'спецвыпуск': 'special', 'tv спецвыпуск': 'special' };
        function franchiseTitle(id, box) {
            if (cat.byId.has(id)) return cat.byId.get(id);
            const fr = box && box.agFranchise;
            const node = fr && fr.data && fr.data.nodes.find(n => n.id === id);
            if (!node) return null;
            return { id, ru: node.name, en: '', kind: FR_KIND[String(node.kind || '').toLowerCase()] || '', eps: 0, year: node.year || '', score: 0, poster: (fr.posters && fr.posters[id]) || '', lite: true };
        }
        document.addEventListener('click', (e) => {
            const el = e.target.closest('[data-act^="fr-"]');
            if (!el || !frState) return;
            const box = el.closest('.pk__franchise');
            if (el.dataset.act === 'fr-open') {
                const t = franchiseTitle(Number(el.dataset.v), box);
                if (t) openPanel(t);
                return;
            }
            if (!window.AgFranchiseView.handle(frState, el.dataset.act, el.dataset.v)) return;
            // Переключатели меняют все видимые блоки сразу: главную карточку и панель
            document.querySelectorAll('.pk__franchise').forEach(b => { if (b.agFranchise) paintFranchise(b, b.agFranchise, b.agCurrent); });
        });

        // Место под каждый включённый сайт отведено сразу: пока ищем — заготовка того же размера (is-pending),
        // нашёлся — ссылка, не нашёлся — приглушённая плашка (is-missing). Кнопки не добавляются по одной, и карточка не скачет
        async function fillSites(t, box, note) {
            const badge = (site) => h('span', { class: 'pk__site-badge', style: `background:${site.color};color:${window.AgUI.onAccent(site.color)}` }, site.short);
            const slotNode = ({ site, state, url }) => (state === 'found'
                ? h('a', { class: 'pk__site', href: url, target: '_blank', rel: 'noopener', 'data-site': site.id, style: `--site:${site.color}` }, badge(site), site.name)
                : h('span', {
                    class: `pk__site ${state === 'pending' ? 'is-pending' : 'is-missing'}`, 'data-site': site.id, 'aria-disabled': 'true',
                    style: `--site:${site.color}`, title: state === 'pending' ? `Ищем на ${site.name}…` : `На ${site.name} этого тайтла нет`
                }, badge(site), site.name));
            const draw = (slots) => box.replaceChildren(...slots.map(slotNode));
            note.textContent = '';
            if (sitesCache.has(t.id)) {
                draw(sitesCache.get(t.id));
                return;
            }
            const settings = (await store.get(['ag_settings'])).ag_settings || {};
            const list = window.AgSites.searchable().filter(s => window.AgSites.isEnabled(settings, s.id));
            if (!list.length) { box.replaceChildren(); note.textContent = 'Все сайты выключены в настройках Anime+'; return; }
            const { workingOrigin, findOnSite } = window.AgExtPage;
            const query = { id: t.id, titles: [t.en, t.ru].filter(Boolean), year: t.year ? String(t.year) : '' };
            const slots = list.map(site => ({ site, state: 'pending', url: null }));
            draw(slots);
            await Promise.all(slots.map(async (slot) => {
                let url = null;
                try {
                    url = await Promise.race([
                        workingOrigin(slot.site).then(origin => findOnSite(slot.site, origin, query)),
                        new Promise(resolve => setTimeout(() => resolve(null), SITE_TIMEOUT_MS))
                    ]);
                } catch (e) { /* сайт недоступен: плашка остаётся приглушённой */ }
                Object.assign(slot, url ? { state: 'found', url } : { state: 'missing' });
                // Меняется одна плашка, остальные на месте: размер списка тот же
                const old = box.querySelector(`[data-site="${slot.site.id}"]`);
                if (old) old.replaceWith(slotNode(slot));
            }));
            sitesCache.set(t.id, slots);
        }

        function planButton(t) {
            if (!loggedIn) return null;
            const isPlanned = planned.has(t.id);
            const b = btn(isPlanned ? '✓ В планах' : 'Отложить', () => onPlan(t, b), `is-sm ${isPlanned ? 'is-on' : ''}`, { disabled: isPlanned ? '' : false });
            return b;
        }

        // Главный тайтл подборки — крупно, с описанием и кнопками сайтов прямо на странице
        function hero(id) {
            const t = cat.byId.get(id);
            if (!t) return null;
            const role = state.roles[id] || 'top';
            const desc = h('p', { class: 'pk__hero-desc is-loading' }, 'Загружаем описание…');
            const sites = h('div', { class: 'pk__sites', role: 'group', 'aria-label': 'Где смотреть' });
            const note = h('span', { class: 'pk__sites-note' });
            const slot = h('div', { class: 'pk__reasons-slot' });
            const franchise = frBox();
            const node = h('section', { class: 'pk__hero', 'data-id': String(id) },
                h('div', { class: 'pk__hero-backdrop', style: `background-image:url("${posterUrl(t).replace(/"/g, '%22')}")`, 'aria-hidden': 'true' }),
                h('button', { class: 'pk__hero-poster', type: 'button', 'aria-label': `Подробнее: ${nameOf(t)}`, onclick: () => openPanel(t) }, poster(t)),
                h('div', { class: 'pk__hero-info' },
                    h('span', { class: `pk__role is-${role}` }, role === 'top' ? 'Лучше всего подходит' : (P.ROLES[role] || P.ROLES.more)),
                    h('h2', {}, nameOf(t)),
                    t.en && t.en !== nameOf(t) ? h('div', { class: 'pk__orig' }, t.en) : null,
                    h('div', { class: 'pk__hero-meta' }, t.score ? h('b', { class: 'pk__score-inline' }, `★ ${t.score}`) : null, h('span', { class: 'pk__facts' }, facts(t))),
                    desc,
                    h('div', { class: 'pk__hero-why' }, h('span', {}, 'Почему вам: '), P.whyFor(t, state, env, cat).join(', ')),
                    h('div', { class: 'pk__hero-watch' }, h('span', { class: 'pk__label-inline' }, 'Смотреть на'), sites, note),
                    h('div', { class: 'pk__hero-acts' },
                        btn('Подробнее', () => openPanel(t), 'is-sm'),
                        planButton(t),
                        h('span', { class: 'pk__spacer' }),
                        btn('Видел', () => onReject(node, t, 'seen'), 'is-sm is-ghost', { 'data-seen': String(id), title: 'Уже смотрел: убрать и больше не предлагать' }),
                        btn('Не то', () => toggleReasons(slot, node, t), 'is-sm is-ghost', { 'data-reject': String(id) })),
                    slot),
                franchise);
            loadDetails(id).then((anime) => {
                desc.classList.remove('is-loading');
                desc.textContent = anime && anime.description ? anime.description : 'Описания на Shikimori нет.';
                paintFranchise(franchise, anime && anime.franchise, id);
            });
            fillSites(t, sites, note);
            return node;
        }

        // Остальные варианты — постерами, кнопки на постере при наведении
        function card(id, i, roleOverride, whyList) {
            const t = cat.byId.get(id);
            if (!t) return null;
            const role = roleOverride || state.roles[id] || 'more';
            const why = (whyList || P.whyFor(t, state, env, cat)).join(', ');
            const cover = h('div', { class: 'pk__cover' },
                poster(t, 'pk__poster'),
                h('span', { class: `pk__role is-${role}` }, P.ROLES[role] || P.ROLES.more),
                t.score ? h('span', { class: 'pk__score', title: 'Оценка Shikimori' }, `★ ${t.score}`) : null,
                h('div', { class: 'pk__overlay' },
                    btn('Открыть', () => openPanel(t), 'is-primary', { 'data-open': String(id) }),
                    h('div', { class: 'pk__overlay-row' },
                        btn('Видел', () => onReject(node, t, 'seen'), 'is-sm is-glass', { 'data-seen': String(id), title: 'Уже смотрел: убрать и больше не предлагать' }),
                        btn('Не то', () => toggleReasons(cover, node, t), 'is-sm is-glass', { 'data-reject': String(id) }))));
            // Нажатие на постер (мимо кнопок «Видел» и «Не то») открывает тайтл: кнопки при наведении не все замечают
            cover.addEventListener('click', (e) => { if (!e.target.closest('button, a')) openPanel(t); });
            const node = h('article', { class: 'pk__card', 'data-id': String(id), style: `animation-delay:${i * 40}ms` },
                cover,
                h('h3', { title: t.en && t.en !== nameOf(t) ? t.en : nameOf(t) }, nameOf(t)),
                h('div', { class: 'pk__facts' }, facts(t)),
                h('p', { class: 'pk__why', title: `Почему вам: ${why}` }, why));
            return node;
        }

        // ---------- Панель тайтла: открывается поверх подборки, подборка остаётся на месте ----------
        let panel = null;
        function closePanel() {
            if (!panel) return;
            const { root, back } = panel;
            panel = null;
            root.remove();
            document.body.classList.remove('pk-locked');
            if (back && back.isConnected) back.focus();
        }

        function openPanel(t) {
            closePanel();
            const back = document.activeElement;
            const sites = h('div', { class: 'pk__sites is-grid', role: 'group', 'aria-label': 'Где смотреть' });
            const note = h('p', { class: 'pk__sites-note' });
            const desc = h('p', { class: 'pk__panel-desc is-loading' }, 'Загружаем описание…');
            const shots = h('div', { class: 'pk__shots' });
            const shotsBox = h('section', { class: 'pk__panel-section', hidden: '' }, h('h3', {}, 'Кадры'), shots);
            const genres = h('div', { class: 'pk__panel-genres' });
            const slot = h('div', { class: 'pk__reasons-slot' });
            const close = h('button', { class: 'pk__panel-close', type: 'button', 'aria-label': 'Закрыть', title: 'Закрыть (Esc)', onclick: closePanel }, '×');
            const role = state.roles[t.id];
            const node = () => body.querySelector(`[data-id="${t.id}"]`);
            const franchise = frBox();
            // Тайтл из франшизы не из каталога: «Почему вам» и «Похожее» не по чему считать, оценку и серии допишет карточка
            const meta = h('div', { class: 'pk__hero-meta' }, t.score ? h('b', { class: 'pk__score-inline' }, `★ ${t.score}`) : null, h('span', { class: 'pk__facts' }, facts(t)));
            const dialog = h('aside', { class: 'pk__panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': nameOf(t), 'data-id': String(t.id) },
                h('div', { class: 'pk__panel-head' },
                    h('div', { class: 'pk__hero-backdrop', style: `background-image:url("${posterUrl(t).replace(/"/g, '%22')}")`, 'aria-hidden': 'true' }),
                    poster(t, 'pk__panel-poster'),
                    h('div', { class: 'pk__panel-title' },
                        role ? h('span', { class: `pk__role is-${role}` }, role === 'top' ? 'Лучше всего подходит' : (P.ROLES[role] || P.ROLES.more)) : null,
                        h('h2', {}, nameOf(t)),
                        t.en && t.en !== nameOf(t) ? h('div', { class: 'pk__orig' }, t.en) : null,
                        meta,
                        genres),
                    close),
                h('div', { class: 'pk__panel-body' },
                    t.lite ? null : h('div', { class: 'pk__hero-why' }, h('span', {}, 'Почему вам: '), P.whyFor(t, state, env, cat).join(', ')),
                    h('section', { class: 'pk__panel-section' }, h('h3', {}, 'Смотреть на'), sites, note),
                    franchise,
                    desc,
                    shotsBox,
                    h('div', { class: 'pk__panel-acts' },
                        planButton(t),
                        btn('Видел', () => { closePanel(); const n = node(); if (n) onReject(n, t, 'seen'); else { P.reject(state, t, 'seen'); rememberSeen([t.id]); save(); toast('Отметил: видел'); } }, 'is-sm', { 'data-seen': String(t.id) }),
                        t.lite ? null : btn('Похожее', () => { closePanel(); showSimilar(t.id); }, 'is-sm'),
                        state.shown.includes(t.id) ? btn('Не то', () => toggleReasons(slot, null, t, true), 'is-sm', { 'data-reject': String(t.id) }) : null),
                    slot));
            const root = h('div', { class: 'pk__panel-layer' }, h('div', { class: 'pk__panel-backdrop', onclick: closePanel }), dialog);
            document.body.append(root);
            document.body.classList.add('pk-locked');
            panel = { root, back, id: t.id };
            close.focus();
            fillSites(t, sites, note);
            loadDetails(t.id).then((anime) => {
                if (!panel || panel.id !== t.id) return;
                desc.classList.remove('is-loading');
                desc.textContent = anime && anime.description ? anime.description : 'Описания на Shikimori нет.';
                if (anime && anime.genres && anime.genres.length) genres.textContent = anime.genres.join(' · ');
                paintFranchise(franchise, anime && anime.franchise, t.id);
                if (t.lite && anime) {
                    const parts = [anime.kindLabel, anime.episodes > 1 ? `${anime.episodes} эп.` : '', anime.year].filter(Boolean).join(' · ');
                    meta.replaceChildren(...[anime.score ? h('b', { class: 'pk__score-inline' }, `★ ${anime.score}`) : null, h('span', { class: 'pk__facts' }, parts)].filter(Boolean));
                }
                const list = (anime && anime.screenshots) || [];
                if (list.length) {
                    shotsBox.hidden = false;
                    // Кадр открывается своим просмотром поверх панели (как на «Случайном»): листаются все кадры, не только видимые шесть
                    const rest = list.length - 6;
                    shots.replaceChildren(...list.slice(0, 6).map((s, i) => {
                        const shot = h('button', { class: 'pk__shot', type: 'button', 'aria-label': `Кадр ${i + 1} из ${list.length}` },
                            h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', src: s.thumb || s.full }),
                            i === 5 && rest > 0 ? h('span', { class: 'pk__shot-more' }, `+${rest}`) : null);
                        shot.addEventListener('click', () => shotViewer.open(list, i, shot));
                        return shot;
                    }));
                }
            });
        }

        async function onPlan(t, button) {
            button.disabled = true;
            const res = await window.agSendMessage({ action: 'pick_add_planned', id: t.id });
            if (res && res.success) {
                planned.add(t.id);
                button.textContent = '✓ В планах';
                button.classList.add('is-on');
                toast(res.already ? 'Этот тайтл уже есть в вашем списке Shikimori' : 'Добавлено в «Запланировано» на Shikimori');
            } else {
                button.disabled = false;
                toast(res && res.reason === 'not_logged_in' ? 'Войдите в Shikimori в настройках Anime+' : 'Shikimori не ответил. Попробуйте ещё раз');
            }
        }

        // Причины «Не то»: поверх постера, под главным тайтлом или в панели
        function toggleReasons(slot, node, t, fromPanel = false) {
            const open = slot.querySelector('.pk__reasons');
            document.querySelectorAll('.pk__reasons').forEach(x => x.remove());
            if (open) return;
            slot.append(h('div', { class: 'pk__reasons' },
                h('p', {}, 'Что не так? Подборка подстроится.'),
                h('div', { class: 'pk__chips' }, P.REASONS.map(r => h('button', { class: 'pk__chip', type: 'button', 'data-reason': r.id, onclick: () => {
                    if (fromPanel) closePanel();
                    onReject(node || body.querySelector(`[data-id="${t.id}"]`), t, r.id);
                } }, r.label)))));
        }

        function onReject(node, t, reason) {
            const done = P.reject(state, t, reason);
            if (reason === 'seen') rememberSeen([t.id]);
            const index = state.shown.indexOf(t.id);
            if (index < 0) { save(); toast(done); return; }
            const rest = state.shown.filter(id => id !== t.id);
            const next = P.pickResults(cat, state, env, 1, rest, rng).list[0];
            state.shown = rest;
            if (next != null) { state.shown.splice(index, 0, next); state.roles[next] = index === 0 ? 'top' : 'new'; }
            save();
            if (node) node.classList.add('is-out');
            setTimeout(() => { render(); toast(done); }, node ? 230 : 0);
        }

        function showSimilar(id) {
            similarOf = id;
            render();
            window.scrollTo({ top: 0 });
        }

        function renderResults() {
            if (similarOf != null) {
                const y = cat.byId.get(similarOf);
                const list = P.similarTo(cat, state, env, similarOf, RESULTS - 1);
                const simWhy = P.whyDistinct(list, state, env, cat);
                body.replaceChildren(
                    h('div', { class: 'pk__res-head' },
                        h('div', {}, h('h2', {}, `Похожее на «${nameOf(y)}»`), h('p', {}, 'По жанрам и темам, с учётом ваших ответов.')),
                        btn('← К подборке', () => { similarOf = null; render(); }, 'is-sm')),
                    h('div', { class: 'pk__grid' }, list.map((id, i) => card(id, i, 'similar', simWhy[id]))));
                return;
            }
            const hint = P.relaxHint(cat, state, env);
            const relax = hint ? h('div', { class: 'pk__relax' },
                h('span', {}, `Точно под все ответы подходит только ${hint.now}. Если не важно «${hint.text}», найдётся ${hint.then}.`),
                btn('Убрать это условие', () => {
                    state.answers.splice(hint.index, 1);
                    refresh();
                    toast(`Убрал условие «${hint.text}»`);
                }, 'is-sm')) : null;
            const answered = state.answers.map(a => P.answerLabel(a, cat)).filter(Boolean)
                .map(l => h('span', { class: l.yes ? 'is-yes' : 'is-no' }, l.text));
            const tweaks = h('div', { class: 'pk__tweaks' }, h('span', {}, 'Поправить:'),
                P.TWEAKS.map(x => h('button', { class: `pk__chip ${state.tweakOn.includes(x.id) ? 'is-on' : ''}`, type: 'button', 'aria-pressed': String(state.tweakOn.includes(x.id)), onclick: () => {
                    const on = state.tweakOn.includes(x.id) ? state.tweakOn.filter(id => id !== x.id) : [...state.tweakOn, x.id];
                    P.setTweaks(state, on);
                    refresh();
                } }, x.label)));
            const [first, ...rest] = state.shown;
            const top = first != null ? hero(first) : null;
            const restWhy = P.whyDistinct(rest, state, env, cat);
            const cards = rest.map((id, i) => card(id, i, null, restWhy[id])).filter(Boolean);
            // replaceChildren превратил бы null в текст «null»
            body.replaceChildren(...[
                h('div', { class: 'pk__res-head' },
                    h('div', {}, h('h2', {}, 'Вот что нашлось'), answered.length ? h('div', { class: 'pk__trail' }, answered) : null),
                    btn('Изменить ответы', moreQuestions, 'is-sm')),
                loginHint(),
                relax,
                top || h('p', { class: 'pk__empty' }, 'Ничего не осталось. Уберите поправки или начните заново.'),
                cards.length ? h('div', { class: 'pk__more-head' }, h('h2', {}, 'Ещё варианты'), tweaks) : null,
                cards.length ? h('div', { class: 'pk__grid' }, cards) : null,
                top ? h('div', { class: 'pk__foot' }, btn('Показать ещё', showMore)) : null
            ].filter(Boolean));
        }

        // Смотрит много, но не вошёл в Shikimori: в подборку попадает уже виденное. Со входом его не будет
        function loginHint() {
            if (seenStatus !== 'guest' || env.stable.veteran !== 'yes' || loginHintHidden) return null;
            const box = h('div', { class: 'pk__login' },
                h('span', {}, 'Вы смотрите много, поэтому часть подборки вы наверняка уже видели. Войдите в Shikimori, и я уберу всё из вашего списка.'),
                btn('Войти в Shikimori', async () => {
                    const status = await window.agSendMessage({ action: 'shiki_get_status' });
                    window.agSendMessage({ action: 'shiki_auth_begin', clientId: (status && status.clientId) || '' });
                    toast('Откроется Shikimori. После входа вернитесь сюда: подборка обновится сама');
                }, 'is-sm is-primary'),
                btn('Не сейчас', () => { loginHintHidden = true; store.set({ [LOGIN_HINT_KEY]: Date.now() }); box.remove(); }, 'is-sm is-ghost'));
            return box;
        }

        function refresh() {
            const r = P.pickResults(cat, state, env, RESULTS, [], rng);
            state.shown = r.list;
            state.roles = r.roles;
            save();
            render();
        }

        function showMore() {
            const r = P.pickResults(cat, state, env, RESULTS - 1, state.shown, rng);
            if (!r.list.length) { toast('Больше подходящего нет. Попробуйте поправить подборку'); return; }
            r.list.forEach(id => { state.roles[id] = 'more'; });
            const from = state.shown.length - 1;
            state.shown = [...state.shown, ...r.list];
            save();
            // Новые карточки дописываются в конец: показанные остаются на месте и не грузятся заново
            const grid = body.querySelector('.pk__grid');
            if (!grid) {
                render();
            } else {
                const restWhy = P.whyDistinct(state.shown.slice(1), state, env, cat);
                grid.append(...r.list.map((id, k) => card(id, from + k, null, restWhy[id])).filter(Boolean));
            }
            const firstNew = body.querySelectorAll('.pk__card')[from];
            if (firstNew && firstNew.scrollIntoView) firstNew.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        function moreQuestions() {
            current = P.nextQuestion(cat, state, env, rng);
            if (!current) { toast('Больше спросить нечего'); return; }
            view = 'ask';
            render();
        }

        restart.addEventListener('click', () => { closePanel(); view = 'start'; similarOf = null; render(); });

        // Esc закрывает панель тайтла
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel) { e.preventDefault(); closePanel(); }
        });

        // Клавиши: 1–5 — ответы по порядку кнопок, Backspace — назад
        document.addEventListener('keydown', (e) => {
            if (view !== 'ask' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
            if (e.target.closest && e.target.closest('input, textarea, select')) return;
            if (e.key === 'Backspace') { e.preventDefault(); onBack(); return; }
            const next = body.querySelector('.pk__next');
            if (e.key === 'Enter' && next && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); next.click(); return; }
            const n = Number(e.key);
            const buttons = body.querySelectorAll('.pk__answers .pk__btn');
            if (n >= 1 && n <= buttons.length) { e.preventDefault(); buttons[n - 1].click(); }
        });

        render();
        return { get state() { return state; }, get view() { return view; }, cat, env };
    }

    window.AgPickPage = { start };
    if (!window.AG_PICK_NO_AUTOSTART) start();
})();
