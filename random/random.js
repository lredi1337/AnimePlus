// random/random.js
// «Случайное аниме»: собственная страница расширения, открывается кнопкой «Рандом» в окне расширения.
// Тайтл по фильтрам зрителя (оценка и типы из настроек) подбирает фон: get_random_anime_card, modules/bg-random.js.
// Под карточкой кнопки тех включённых сайтов, где тайтл нашёлся; поиск общий с Топом и расписанием (modules/shared/ext-page.js).
// Рандом на самих сайтах (значок, features/fox-dock.js) остаётся своим.

(function () {
    'use strict';

    const SITE_TIMEOUT_MS = 15000;
    const MAX_EXCLUDE = 60;
    const MAX_HISTORY = 12;
    const STATUS_LABELS = { anons: 'Анонс', ongoing: 'Онгоинг' };
    const KIND_NAMES = { tv: 'Сериалы', movie: 'Фильмы', ova: 'OVA', ona: 'ONA', special: 'Спешлы' };
    const PLACEHOLDER = '../icons/icon128.png';
    const THUMBS_SHOWN = 8;

    const h = (tag, attrs = {}, ...children) => {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'style') node.style.cssText = v;
            else if (v !== false && v != null) node.setAttribute(k, v);
        });
        children.flat().forEach(c => { if (c != null && c !== '') node.append(c instanceof Node ? c : document.createTextNode(String(c))); });
        return node;
    };
    const iconBtn = (cls, icon, label, attrs = {}) => {
        const btn = h('button', { class: cls, type: 'button', ...attrs });
        btn.append(window.AgUI.iconEl(icon, 18), label);
        return btn;
    };
    const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(null), ms))]);
    const posterSrc = (url) => (url && window.agNormalizePosterUrl ? window.agNormalizePosterUrl(url) : url) || PLACEHOLDER;

    async function readSettings() {
        const { ag_settings: settings = {} } = await chrome.storage.local.get(['ag_settings']);
        return settings;
    }

    /** Фильтры зрителя одной строкой: «Оценка от 6 · Сериалы, Фильмы» */
    function filtersText(settings) {
        const score = settings.random_min_score;
        const scoreText = !score || score === 'any' ? 'Любая оценка' : `Оценка от ${String(score).replace(/\.0$/, '')}`;
        const kinds = Array.isArray(settings.random_kinds) && settings.random_kinds.length ? settings.random_kinds : Object.keys(KIND_NAMES);
        const kindsText = kinds.length >= Object.keys(KIND_NAMES).length ? 'все типы' : kinds.map(k => KIND_NAMES[k] || k).join(', ');
        return `${scoreText} · ${kindsText}`;
    }

    /** Просмотр кадров поверх страницы: стрелки листают, Esc и нажатие мимо кадра закрывают */
    function makeViewer() {
        let shots = [];
        let index = 0;
        let back = null;
        const img = h('img', { class: 'rnd__viewer-img', alt: '', referrerpolicy: 'no-referrer' });
        const count = h('span', { class: 'rnd__viewer-count' });
        const prev = h('button', { class: 'rnd__viewer-nav is-prev', type: 'button', 'aria-label': 'Предыдущий кадр' }, '‹');
        const fwd = h('button', { class: 'rnd__viewer-nav is-next', type: 'button', 'aria-label': 'Следующий кадр' }, '›');
        const close = h('button', { class: 'rnd__viewer-close', type: 'button', 'aria-label': 'Закрыть', title: 'Закрыть (Esc)' }, window.AgUI.iconEl('close', 20));
        const node = h('div', { class: 'rnd__viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Кадры', hidden: '' }, img, prev, fwd, close, count);

        // Полный кадр Shikimori весит около мегабайта и грузится секунды: пока он идёт, браузер держал бы на экране прошлый.
        // Поэтому сразу показываем превью (оно уже загружено в карточке), а полный кадр подставляем, когда догрузится
        const loaded = new Set();
        const preload = (shot) => new Promise((resolve) => {
            if (!shot || loaded.has(shot.full)) { resolve(); return; }
            const full = new Image();
            full.referrerPolicy = 'no-referrer';
            full.onload = () => { loaded.add(shot.full); resolve(); };
            full.onerror = () => resolve();
            full.src = shot.full;
        });
        const paint = () => {
            const shot = shots[index];
            const ready = loaded.has(shot.full) || !shot.thumb;
            img.src = ready ? shot.full : shot.thumb;
            img.classList.toggle('is-preview', !ready);
            count.textContent = `${index + 1} / ${shots.length}`;
            prev.hidden = fwd.hidden = shots.length < 2;
            if (!ready) {
                preload(shot).then(() => {
                    if (shots[index] === shot && !node.hidden && loaded.has(shot.full)) {
                        img.src = shot.full;
                        img.classList.remove('is-preview');
                    }
                });
            }
            // Соседние кадры заранее: листание дальше будет сразу в полном качестве
            if (shots.length > 1) {
                preload(shots[(index + 1) % shots.length]);
                preload(shots[(index - 1 + shots.length) % shots.length]);
            }
        };
        const go = (step) => { index = (index + step + shots.length) % shots.length; paint(); };
        const hide = () => {
            node.hidden = true;
            img.removeAttribute('src');
            if (back && back.isConnected) back.focus();
        };
        prev.addEventListener('click', () => go(-1));
        fwd.addEventListener('click', () => go(1));
        close.addEventListener('click', hide);
        node.addEventListener('click', (e) => { if (e.target === node) hide(); });
        document.addEventListener('keydown', (e) => {
            if (node.hidden) return;
            if (e.key === 'Escape') hide();
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === 'ArrowRight') go(1);
            else return;
            e.preventDefault();
        });
        return {
            node,
            isOpen: () => !node.hidden,
            open(list, at, from) {
                shots = list;
                index = at;
                back = from;
                paint();
                node.hidden = false;
                close.focus();
            }
        };
    }

    function start() {
        const app = document.getElementById('app');
        const stage = h('main', { class: 'rnd__stage', 'aria-live': 'polite' });
        const historyRow = h('div', { class: 'rnd__history-row' });
        const history = h('section', { class: 'rnd__history', hidden: '' }, h('h2', {}, 'Уже выпадали'), historyRow);
        const filters = h('span', { class: 'rnd__filters' });
        const tune = h('button', { class: 'rnd__link', type: 'button' }, 'Изменить');
        tune.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#random') }));

        const title = h('h1', {});
        title.append(window.AgUI.iconEl('dice', 22), 'Случайное аниме');
        // «Другое аниме» всегда на одном месте: в закреплённой шапке, а не под описанием разной длины
        const next = iconBtn('rnd__next', 'dice', 'Другое аниме', { title: 'Другое аниме (пробел)' });
        next.addEventListener('click', () => roll());
        const viewer = makeViewer();
        app.replaceChildren(
            h('header', { class: 'rnd__head' },
                h('div', { class: 'rnd__head-in' }, title, h('div', { class: 'rnd__hint' }, filters, tune), next)),
            h('div', { class: 'rnd__body' }, stage, history),
            viewer.node);

        readSettings().then(s => { filters.textContent = filtersText(s); }).catch(() => {});

        let token = 0;
        let busy = false;
        const shown = [];
        const seen = [];

        function skeleton() {
            stage.replaceChildren(h('div', { class: 'rnd__card is-loading', 'aria-busy': 'true' },
                h('div', { class: 'rnd__poster rnd__skel' }),
                h('div', { class: 'rnd__info' },
                    h('div', { class: 'rnd__skel rnd__skel-line is-title' }),
                    h('div', { class: 'rnd__skel rnd__skel-line is-short' }),
                    h('div', { class: 'rnd__skel rnd__skel-line' }),
                    h('div', { class: 'rnd__skel rnd__skel-line' }),
                    h('div', { class: 'rnd__skel rnd__skel-line is-short' }),
                    h('p', { class: 'rnd__note' }, 'Подбираем аниме…'))));
        }

        function renderEmpty(reason) {
            const text = reason === 'no_match'
                ? 'Под ваши фильтры ничего не нашлось. Снизьте порог оценки или добавьте типы в настройках.'
                : 'Не удалось связаться с Shikimori. Попробуйте ещё раз чуть позже.';
            const retry = h('button', { class: 'rnd__ghost', type: 'button' }, 'Попробовать ещё');
            retry.addEventListener('click', () => roll());
            const actions = h('div', { class: 'rnd__actions' }, retry);
            if (reason === 'no_match') {
                const settingsBtn = h('button', { class: 'rnd__ghost', type: 'button' }, 'Настройки');
                settingsBtn.addEventListener('click', () => tune.click());
                actions.append(settingsBtn);
            }
            stage.replaceChildren(h('div', { class: 'rnd__empty' }, h('p', {}, text), actions));
        }

        // Кнопки сайтов появляются по мере поиска, но всегда в порядке списка сайтов
        async function fillSites(anime, sitesBox, note, myToken) {
            const settings = await readSettings();
            const list = window.AgSites.searchable().filter(s => window.AgSites.isEnabled(settings, s.id));
            if (myToken !== token) return;
            if (list.length === 0) {
                note.textContent = 'Все сайты выключены в настройках Anime+';
                return;
            }
            const { workingOrigin, findOnSite } = window.AgExtPage;
            const query = { id: anime.id, titles: [anime.name, anime.russian].filter(Boolean), year: anime.year };
            let done = 0;
            let found = 0;
            const progress = () => { note.textContent = `Ищем на сайтах · ${done} из ${list.length}`; };
            progress();

            await Promise.all(list.map(async (site, index) => {
                let url = null;
                try {
                    url = await withTimeout(workingOrigin(site).then(origin => findOnSite(site, origin, query)), SITE_TIMEOUT_MS);
                } catch (e) { /* сайт недоступен: просто без кнопки */ }
                if (myToken !== token) return;
                done++;
                if (url) {
                    found++;
                    const btn = h('a', { class: 'rnd__site', href: url, target: '_blank', rel: 'noopener', 'data-site': site.id, 'data-order': String(index), style: `--site:${site.color}` },
                        h('span', { class: 'rnd__badge', style: `background:${site.color};color:${window.AgUI.onAccent(site.color)}` }, site.short),
                        h('span', { class: 'rnd__site-name' }, site.name),
                        window.AgUI.iconEl('play', 14));
                    const after = [...sitesBox.children].find(b => Number(b.dataset.order) > index);
                    sitesBox.insertBefore(btn, after || null);
                }
                progress();
            }));
            if (myToken !== token) return;
            note.textContent = found ? '' : 'На включённых сайтах этого тайтла не нашлось. Откройте его на Shikimori или выберите другое.';
            note.hidden = !!found;
        }

        function renderCard(anime) {
            const name = anime.russian || anime.name;
            const src = posterSrc(anime.poster);
            const poster = h('img', { class: 'rnd__poster', alt: '', referrerpolicy: 'no-referrer', src });
            poster.addEventListener('error', () => { poster.src = PLACEHOLDER; poster.classList.add('is-placeholder'); }, { once: true });

            const meta = h('div', { class: 'rnd__meta' },
                anime.score ? h('span', { class: 'rnd__chip is-score', title: 'Оценка Shikimori' }, `★ ${anime.score}`) : null,
                anime.kindLabel ? h('span', { class: 'rnd__chip' }, anime.kindLabel) : null,
                anime.year ? h('span', { class: 'rnd__chip' }, anime.year) : null,
                anime.episodes > 1 ? h('span', { class: 'rnd__chip' }, `${anime.episodes} эп.`) : null,
                STATUS_LABELS[anime.status] ? h('span', { class: 'rnd__chip is-status' }, STATUS_LABELS[anime.status]) : null);

            let desc = null;
            if (anime.description) {
                const text = h('p', { class: 'rnd__desc' }, anime.description);
                const more = h('button', { class: 'rnd__link rnd__more', type: 'button', hidden: '' }, 'Подробнее');
                more.addEventListener('click', () => {
                    const open = text.classList.toggle('is-open');
                    more.textContent = open ? 'Свернуть' : 'Подробнее';
                });
                // Кнопка нужна, только если описание не помещается
                requestAnimationFrame(() => { if (text.scrollHeight > text.clientHeight + 2) more.hidden = false; });
                desc = h('div', {}, text, more);
            }

            const sitesBox = h('div', { class: 'rnd__sites', role: 'group', 'aria-label': 'Где смотреть' });
            const note = h('p', { class: 'rnd__note' }, 'Ищем на сайтах…');
            const shiki = h('a', { class: 'rnd__ghost', href: `https://shikimori.io/animes/${anime.id}`, target: '_blank', rel: 'noopener' }, 'Shikimori ↗');

            stage.replaceChildren(h('article', { class: 'rnd__card', 'data-id': String(anime.id) },
                h('div', { class: 'rnd__backdrop', style: `background-image:url("${src.replace(/"/g, '%22')}")`, 'aria-hidden': 'true' }),
                poster,
                h('div', { class: 'rnd__info' },
                    h('h2', { class: 'rnd__title' }, name),
                    anime.name && anime.name !== name ? h('div', { class: 'rnd__orig' }, anime.name) : null,
                    meta,
                    anime.genres && anime.genres.length ? h('div', { class: 'rnd__genres' }, anime.genres.join(' · ')) : null,
                    desc,
                    h('section', { class: 'rnd__watch' }, h('div', { class: 'rnd__watch-head' }, h('h3', {}, 'Смотреть на'), shiki), sitesBox, note)),
                screensSection(anime)));
            return { sitesBox, note };
        }

        /** Кадры тайтла: первые восемь превью, остальные листаются в просмотре */
        function screensSection(anime) {
            const shots = Array.isArray(anime.screenshots) ? anime.screenshots : [];
            if (!shots.length) return null;
            const grid = h('div', { class: 'rnd__shots' });
            const rest = shots.length - THUMBS_SHOWN;
            shots.slice(0, THUMBS_SHOWN).forEach((shot, i) => {
                const img = h('img', { alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', src: shot.thumb || shot.full });
                const btn = h('button', { class: 'rnd__shot', type: 'button', 'aria-label': `Кадр ${i + 1} из ${shots.length}` }, img);
                img.addEventListener('error', () => btn.remove(), { once: true });
                if (i === THUMBS_SHOWN - 1 && rest > 0) btn.append(h('span', { class: 'rnd__shot-more' }, `+${rest}`));
                btn.addEventListener('click', () => viewer.open(shots, i, btn));
                grid.append(btn);
            });
            return h('section', { class: 'rnd__screens' }, h('h3', {}, `Кадры · ${shots.length}`), grid);
        }

        function addHistory(anime) {
            const i = seen.findIndex(a => a.id === anime.id);
            if (i >= 0) seen.splice(i, 1);
            seen.unshift(anime);
            seen.length = Math.min(seen.length, MAX_HISTORY + 1);
            // Текущий тайтл в полосе не повторяем
            const past = seen.slice(1);
            history.hidden = past.length === 0;
            historyRow.replaceChildren(...past.map(a => {
                const img = h('img', { alt: '', referrerpolicy: 'no-referrer', loading: 'lazy', src: posterSrc(a.poster) });
                img.addEventListener('error', () => { img.src = PLACEHOLDER; }, { once: true });
                const item = h('button', { class: 'rnd__past', type: 'button', title: a.russian || a.name }, img, h('span', {}, a.russian || a.name));
                item.addEventListener('click', () => show(a));
                return item;
            }));
        }

        function show(anime) {
            const myToken = ++token;
            const parts = renderCard(anime);
            addHistory(anime);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return fillSites(anime, parts.sitesBox, parts.note, myToken);
        }

        async function roll() {
            if (busy) return;
            busy = true;
            next.disabled = true;
            const myToken = ++token;
            skeleton();
            let res = null;
            try {
                res = await window.agSendMessage({ action: 'get_random_anime_card', exclude: shown.slice(-MAX_EXCLUDE) });
            } finally {
                busy = false;
                next.disabled = false;
            }
            if (myToken !== token) return;
            if (!res || !res.anime) {
                renderEmpty(res && res.reason);
                return;
            }
            shown.push(res.anime.id);
            await show(res.anime);
        }

        // Пробел — другое аниме (если фокус не на кнопке или ссылке: там пробел нажимает их)
        document.addEventListener('keydown', (e) => {
            if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || viewer.isOpen()) return;
            if (e.target.closest && e.target.closest('button, a, input, textarea, select')) return;
            e.preventDefault();
            roll();
        });

        // Настройки поменяли в соседней вкладке: строка фильтров обновится, следующий тайтл подберётся уже по ним
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.ag_settings) filters.textContent = filtersText(changes.ag_settings.newValue || {});
        });

        roll();
        return { roll };
    }

    window.AgRandomPage = { start, filtersText };
    if (!window.AG_RANDOM_NO_AUTOSTART) start();
})();
