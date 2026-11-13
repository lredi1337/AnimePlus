// modules/animego/ag-synthetic.js
// Модуль синтетических страниц аниме и кнопки переключения на Jut-Su

(function () {
    'use strict';

    const escapeHtml = window.agEscapeHtml;

    const ensureAgLogoPlus = window.ensureAgLogoPlus || function () {};

    // ---------- Оболочка сайта для «голой» 404-страницы ----------
    // С 2026 года 404-страница AnimeGO содержит только картинку и текст: ни шапки, ни <main>, ни скриптов.
    // Достраиваем каркас из нативной страницы тайтла (шапка, мобильное меню, футер) и пустой <main>.
    let shellPromise = null;

    window.agEnsureAnimeGoShell = function () {
        const existing = document.querySelector('main.content, main');
        if (existing) return Promise.resolve(existing);
        if (shellPromise) return shellPromise;

        shellPromise = (async () => {
            const res = await window.agSendMessage({ action: 'get_native_page_template', origin: location.origin });
            if (!res || !res.html) return null;

            const doc = new DOMParser().parseFromString(res.html, 'text/html');
            const wrapper = doc.querySelector('.wrapper');
            const contentPage = wrapper && wrapper.querySelector('.content-page');
            if (!wrapper || !contentPage) return null;

            const shellContent = doc.createElement('div');
            shellContent.className = 'content-page';
            shellContent.innerHTML = '<div class="container-xxl"><main class="content_first content card"><div class="card-body"></div></main></div>';
            contentPage.replaceWith(shellContent);

            if (!document.documentElement.hasAttribute('data-bs-theme')) {
                document.documentElement.setAttribute('data-bs-theme', doc.documentElement.getAttribute('data-bs-theme') || 'dark');
            }
            document.querySelectorAll('.error-page').forEach(el => el.style.display = 'none');
            document.body.prepend(document.adoptNode(wrapper));
            ensureAgLogoPlus(document);
            return document.querySelector('main');
        })().catch((e) => {
            console.error('[Anime+] Failed to build site shell:', e);
            shellPromise = null;
            return null;
        });
        return shellPromise;
    };

    const fetchAnimeDetails = async (shikiId) => {
        const res = await window.agSendMessage({ action: 'fetch_shikimori', url: `https://shikimori.io/api/animes/${shikiId}` });
        const raw = res && res.status === 200 ? res.data : null;
        if (!raw || !raw.id) return null;

        const normalize = (url) => {
            if (!url) return '';
            if (window.agNormalizePosterUrl) return window.agNormalizePosterUrl(url);
            return url.startsWith('http') ? url : 'https://shikimori.io' + url;
        };

        let poster = normalize(raw.image ? (raw.image.original || raw.image.preview || '') : '');
        if (poster) poster = poster.replace(/\/preview\//g, '/original/').replace(/\/x\d+\//g, '/original/');
        // REST часто отдаёт заглушку «лису» — настоящий постер берём из GraphQL
        if (window.agIsPlaceholderPoster(poster)) {
            const gql = await window.agSendMessage({ action: 'resolve_shiki_posters', ids: [raw.id] });
            poster = (gql && gql.posters && gql.posters[raw.id]) || poster;
        }

        // В карточке тайтла Shikimori только первые 2–4 кадра, все кадры отдаёт отдельный запрос
        const scr = await window.agSendMessage({ action: 'fetch_shikimori', url: `https://shikimori.io/api/animes/${shikiId}/screenshots` });
        const rawScreens = (scr && Array.isArray(scr.data) && scr.data.length ? scr.data : raw.screenshots) || [];
        const shots = rawScreens
            .map(x => ({ full: normalize(x.original || x.preview || ''), thumb: normalize(x.preview || x.original || '') }))
            .filter(x => x.full);
        const screenshots = shots.map(x => x.full);
        const screenshotThumbs = shots.map(x => x.thumb);

        const kindMap = { tv: 'ТВ Сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', music: 'Клип', tv_special: 'ТВ Спешл' };

        return {
            // Номер и число серий попадают в разметку страницы: только числа
            id: parseInt(raw.id, 10),
            name: raw.name || '',
            russian: raw.russian || raw.name || '',
            japanese: Array.isArray(raw.japanese) ? raw.japanese[0] : (raw.japanese || ''),
            poster,
            kind: kindMap[raw.kind] || (raw.kind ? String(raw.kind).toUpperCase() : 'TV'),
            score: raw.score || '—',
            status: raw.status || '',
            episodes: parseInt(raw.episodes, 10) || 0,
            episodesAired: parseInt(raw.episodes_aired, 10) || 0,
            airedOn: raw.aired_on ? String(raw.aired_on).split('-')[0] : '',
            // description_html — пользовательский HTML Shikimori: только через санитайзер
            description: raw.description_html ? window.agSanitizeHtml(raw.description_html) : escapeHtml(raw.description || ''),
            genres: Array.isArray(raw.genres) ? raw.genres.map(g => g.russian || g.name) : [],
            studios: Array.isArray(raw.studios) ? raw.studios.map(s => s.name) : [],
            videos: Array.isArray(raw.videos) ? raw.videos : [],
            screenshots,
            screenshotThumbs,
            english: Array.isArray(raw.english) ? raw.english.filter(Boolean) : []
        };
    };

    // Шаблон годится, только если это детальная страница тайтла с постером, инфо-блоком и плеером
    const isUsableTemplate = (doc) => !!(doc
        && doc.querySelector('.content-page .entity__poster img')
        && doc.querySelector('.content-page .entity__title h1')
        && doc.querySelector('.content-page .entity-field'));

    // Убираем всё, что в шаблоне относится к чужому тайтлу и не перезаписывается ниже
    const sanitizeTemplate = (page, data) => {
        const rating = page.querySelector('.entity__rating');
        if (rating) {
            rating.removeAttribute('data-controller');
            Array.from(rating.children).forEach(el => { if (el.id !== 'ag-shiki-btn') el.remove(); });
        }

        page.querySelectorAll('.fancybox-trigger-cover').forEach(el => {
            el.setAttribute('data-src', data.poster || '');
            el.removeAttribute('data-fancybox');
        });
        page.querySelectorAll('[data-controller="anime-watched-progress"]').forEach(el => el.remove());

        if (!data.screenshots || data.screenshots.length === 0) {
            page.querySelectorAll('.screenshots').forEach(el => {
                const heading = el.previousElementSibling;
                if (heading && /^H[1-6]$/.test(heading.tagName)) heading.remove();
                el.remove();
            });
        }

        // Секции «График выхода серий», «Рецензии и отзывы», «Комментарии» из шаблона
        page.querySelectorAll('h2, h3').forEach(h => {
            if (!/График выхода|Расписание|Рецензии|Отзывы|Комментари/i.test(h.textContent)) return;
            const block = h.closest('.card-body > *, section, .content_third') || h.parentElement;
            if (block && block !== page) block.remove();
        });
        page.querySelectorAll('.content_third, .comments, #comments, .reviews').forEach(el => el.remove());
    };

    // Запасная страница на случай, если нативный шаблон недоступен
    const renderFallbackPage = (main, data) => {
        const body = main.querySelector('.card-body') || main;
        body.innerHTML = `
            <div class="d-flex flex-column flex-md-row gap-4" id="ag-synthetic-page-container">
                <div style="flex: 0 0 240px; max-width: 240px;">
                    <img referrerpolicy="no-referrer" src="${escapeHtml(data.poster)}" alt="${escapeHtml(data.russian)}" data-ag-poster-id="${data.id}" data-ag-poster-ru="${escapeHtml(data.russian)}" data-ag-poster-en="${escapeHtml(data.name)}" class="rounded w-100" style="aspect-ratio: 5/7; object-fit: cover;">
                    <a href="#ag-watch-choice" id="ag-synthetic-watch-side-btn" class="btn btn-danger w-100 fw-bold mt-2">Смотреть онлайн</a>
                </div>
                <div class="flex-grow-1 mw-0">
                    <div class="entity__title mb-3">
                        <h1>${escapeHtml(data.russian)}</h1>
                        <div class="text-body-tertiary small">${escapeHtml(data.name)}${data.japanese ? ' / ' + escapeHtml(data.japanese) : ''}</div>
                    </div>
                    <div class="mb-3">
                        <a id="ag-shiki-btn" href="https://shikimori.io/animes/${data.id}" target="_blank" rel="noopener" class="btn btn-dark btn-sm fw-semibold">Shikimori ★ ${escapeHtml(String(data.score))}</a>
                    </div>
                    <div class="mb-3 text-body-secondary small">
                        ${escapeHtml(data.kind)} · ${data.episodes || 'выходит'} эп. · ${escapeHtml(data.airedOn || '—')} · ${escapeHtml(data.genres.join(', '))}
                    </div>
                    <div class="description mb-4">${data.description || 'Описание отсутствует.'}</div>
                    <div id="ag-watch-choice"></div>
                </div>
            </div>
        `;
    };

    const injectWatchChoiceStyle = () => {
        if (document.getElementById('ag-watch-choice-style')) return;
        const style = document.createElement('style');
        style.id = 'ag-watch-choice-style';
        // Цвета страницы — из темы AnimeGO: у сайта есть и светлая, и тёмная
        style.textContent = `
            .ag-wc { font-family: var(--ap-font); }
            .ag-wc__note { margin: 0 0 12px; font-size: var(--ap-fs-lg); color: var(--bs-secondary-color); }
            .ag-wc__list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 8px; }
            .ag-wc__item { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 12px 8px 8px; border-radius: var(--ap-radius); background: var(--bs-body-bg); border: 1px solid var(--bs-border-color); color: var(--bs-body-color) !important; text-decoration: none !important; transition: border-color var(--ap-ease); }
            a.ag-wc__item:hover { border-color: var(--ap-accent); }
            .ag-wc__badge { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: var(--ap-radius-sm); font-size: var(--ap-fs-sm); font-weight: 700; }
            .ag-wc__name { flex: 1; min-width: 0; font-size: var(--ap-fs-md); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .ag-wc__state { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; font-size: var(--ap-fs-sm); color: var(--bs-secondary-color); }
            .ag-wc__item.is-found .ag-wc__state { color: var(--ap-accent); font-weight: 600; }
            .ag-wc__item.is-pending, .ag-wc__item.is-missing { opacity: .6; }
        `;
        document.head.appendChild(style);
    };

    const siteSearchUrl = (site, data) => (site.dle && site.dle.searchPath
        ? `${site.home}${site.dle.searchPath}${encodeURIComponent(data.russian || data.name)}&ag_from=animeplus`
        : null);

    // Выбор сайта для просмотра: тайтла нет на AnimeGO, поэтому ищем его на остальных включённых сайтах
    window.agRenderWatchChoice = async function (box, data) {
        injectWatchChoiceStyle();
        const note = document.createElement('p');
        note.className = 'ag-wc__note';
        box.className = 'ag-wc';

        const settings = await window.getSettings();
        const sites = window.AgSites.searchable().filter(s => s.id !== 'animego' && window.AgSites.isEnabled(settings, s.id));
        if (sites.length === 0) {
            note.textContent = 'Все остальные сайты выключены в настройках Anime+.';
            box.replaceChildren(note);
            return;
        }

        const makeRow = (site, { state, url = null, cls }) => {
            const row = document.createElement(url ? 'a' : 'div');
            row.className = `ag-wc__item ${cls}`;
            row.dataset.site = site.id;
            if (url) {
                row.href = url;
                row.target = '_blank';
                row.rel = 'noopener';
            }
            const badge = document.createElement('span');
            badge.className = 'ag-wc__badge';
            badge.style.background = site.color;
            badge.style.color = window.AgUI.onAccent(site.color);
            badge.textContent = site.short;
            const name = document.createElement('span');
            name.className = 'ag-wc__name';
            name.textContent = site.name;
            const stateEl = document.createElement('span');
            stateEl.className = 'ag-wc__state';
            stateEl.textContent = state;
            if (url) stateEl.prepend(window.AgUI.iconEl('external', 13));
            row.append(badge, name, stateEl);
            return row;
        };

        const list = document.createElement('div');
        list.className = 'ag-wc__list';
        note.textContent = 'Этого аниме нет в плеере AnimeGO. Ищем его на других сайтах…';
        list.append(...sites.map(site => makeRow(site, { state: 'ищем…', cls: 'is-pending' })));
        box.replaceChildren(note, list);

        const res = await window.agSendMessage({
            action: 'resolve_all_sites',
            siteIds: sites.map(s => s.id),
            titles: [...new Set([data.name, data.russian, ...(data.english || [])].filter(Boolean))],
            year: data.airedOn,
            shikimoriId: data.id
        });
        if (!box.isConnected) return;

        const results = (res && res.results) || [];
        const resultOf = (site) => results.find(r => r.siteId === site.id) || {};
        const urlOf = (site) => resultOf(site).url || null;
        // Найденные — первыми
        const ordered = [...sites.filter(urlOf), ...sites.filter(s => !urlOf(s))];
        list.replaceChildren(...ordered.map((site) => {
            const url = urlOf(site);
            if (url) return makeRow(site, { state: 'смотреть', url, cls: 'is-found' });
            const search = siteSearchUrl(site, data);
            return search
                ? makeRow(site, { state: 'искать', url: search, cls: 'is-search' })
                : makeRow(site, { state: resultOf(site).timedOut ? 'нет ответа' : 'нет на сайте', cls: 'is-missing' });
        }));
        note.textContent = sites.some(urlOf)
            ? 'Этого аниме нет в плеере AnimeGO. Выберите, где смотреть:'
            : 'Этого аниме нет в плеере AnimeGO, и прямых ссылок на других сайтах не нашлось. Попробуйте поиск:';
    };

    // Блок выбора и кнопка под постером, которая к нему ведёт
    const mountWatchChoice = (root, data) => {
        let box = root.querySelector('#ag-watch-choice');
        if (!box) {
            box = document.createElement('div');
            box.id = 'ag-watch-choice';
            box.style.margin = '20px 0';
            const anchor = root.querySelector('.description');
            if (anchor) anchor.after(box);
            else root.appendChild(box);
        }
        const sideBtn = root.querySelector('#ag-synthetic-watch-side-btn');
        if (sideBtn) {
            sideBtn.addEventListener('click', (e) => {
                e.preventDefault();
                box.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
        window.agRenderWatchChoice(box, data);
    };

    // ---------- Синтетическая страница из шаблона настоящей страницы тайтла ----------
    // Эффекты наведения — в стилях, а не в onmouseover="…": встроенные обработчики выполняются в мире страницы
    // и перестали бы работать, если AnimeGO включит строгий CSP

    const injectSyntheticStyle = () => {
        if (document.getElementById('ag-synthetic-style')) return;
        const style = document.createElement('style');
        style.id = 'ag-synthetic-style';
        style.textContent = `
            .ag-syn-poster { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 8px; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease; }
            .ag-syn-poster:hover { transform: scale(1.02); box-shadow: 0 8px 25px rgba(0,0,0,0.5); }
            .ag-poster-close, .ag-lb-close { background: var(--ap-hover); border: 1px solid var(--ap-line); color: #fff; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease; }
            .ag-poster-close { width: 44px; height: 44px; font-size: 18px; }
            .ag-lb-close { width: 42px; height: 42px; font-size: 16px; }
            .ag-poster-close:hover, .ag-lb-close:hover { background: var(--ap-accent-line); border-color: var(--ap-accent-line); transform: rotate(90deg) scale(1.05); }
            .ag-lb-nav { position: absolute; top: 50%; transform: translateY(-50%); background: var(--ap-hover); border: 1px solid var(--ap-line); color: #fff; width: 54px; height: 54px; border-radius: 50%; font-size: 22px; cursor: pointer; z-index: 10; backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
            .ag-lb-nav:hover { background: var(--ap-line-strong); border-color: rgba(255, 255, 255, 0.3); transform: translateY(-50%) scale(1.1); }
            .ag-lb-prev { left: 36px; }
            .ag-lb-next { right: 36px; }
            .ag-screenshot-thumb { aspect-ratio: 16 / 9; width: 100%; position: relative; overflow: hidden; border-radius: 8px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
            .ag-screenshot-thumb:hover { transform: scale(1.03); box-shadow: 0 6px 15px rgba(0,0,0,0.4); }
            .ag-related-card { width: 260px; border: 1px solid var(--ap-hover); transition: transform 0.2s; }
            .ag-related-card:hover { transform: translateY(-2px); }
            @keyframes ag-lb-spin { to { transform: rotate(360deg); } }
            .ag-lb-spinner { animation: ag-lb-spin 0.8s linear infinite; }
            @media (prefers-reduced-motion: reduce) { .ag-lb-spinner { animation-duration: 2.4s !important; } }
        `;
        document.head.appendChild(style);
    };

    // Окна просмотра появляются и исчезают плавно
    const OVERLAY_STYLE = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);';
    const showOverlay = (overlay) => {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => { overlay.style.opacity = '1'; });
    };
    const hideOverlay = (overlay) => {
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.style.display = 'none'; }, 250);
    };

    /** Название, второе название и кнопка Shikimori вместо оценки чужого тайтла */
    function fillTitle(page, data) {
        const h1 = page.querySelector('h1');
        if (h1) h1.textContent = data.russian || data.name;

        const synonyms = page.querySelector('.entity__title-synonyms');
        if (synonyms) {
            synonyms.innerHTML = `<ul class="list-unstyled small mb-0"><li class="text-body-tertiary">${escapeHtml(data.name)} ${data.japanese ? '/ ' + escapeHtml(data.japanese) : ''}</li></ul>`;
        }

        const ratingValue = page.querySelector('.entity-rating__value');
        if (ratingValue) ratingValue.textContent = (data.score || '0.0').toString().replace('.', ',');
        const ratingCount = page.querySelector('.entity-rating__count');
        if (ratingCount) ratingCount.textContent = 'Shikimori';
        const userVote = page.querySelector('.entity-rating__user');
        if (userVote) userVote.remove();

        const rating = page.querySelector('.entity__rating');
        if (rating) {
            const old = rating.querySelector('#ag-shiki-btn');
            if (old) old.remove();
            const shikiBtn = document.createElement('a');
            shikiBtn.id = 'ag-shiki-btn';
            shikiBtn.href = `https://shikimori.io/animes/${data.id}`;
            shikiBtn.target = '_blank';
            shikiBtn.className = 'd-inline-flex align-items-center';
            shikiBtn.style.cssText = 'background: var(--ap-raised); border: 1px solid var(--ap-line); color: var(--ap-text); font-weight: 600; border-radius: var(--ap-radius); padding: 0 12px; font-size: var(--ap-fs-md); height: 32px; text-decoration: none;';
            shikiBtn.textContent = `Shikimori ★ ${data.score}`;
            rating.appendChild(shikiBtn);
        }
    }

    /** Постер на весь экран: окно создаётся один раз и показывается снова */
    function openPosterLightbox(data) {
        let overlay = document.getElementById('ag-poster-lightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'ag-poster-lightbox';
            overlay.style.cssText = `${OVERLAY_STYLE} background: rgba(8, 10, 14, 0.94); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); z-index: 999999;`;
            overlay.innerHTML = `
                <div style="position: absolute; top: 0; left: 0; width: 100%; padding: 24px 36px; display: flex; justify-content: flex-end; align-items: center; z-index: 100; box-sizing: border-box;">
                    <button class="ag-poster-close">✕</button>
                </div>
                <div class="ag-poster-content" style="position: relative; max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center;">
                    <img referrerpolicy="no-referrer" src="${escapeHtml(data.poster)}" style="height: 85vh; max-height: 88vh; max-width: 88vw; border-radius: 18px; box-shadow: 0 35px 100px rgba(0,0,0,0.95), 0 0 0 1px var(--ap-line-strong); object-fit: contain; user-select: none;">
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('.ag-poster-close').addEventListener('click', () => hideOverlay(overlay));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target.classList.contains('ag-poster-content')) hideOverlay(overlay);
            });
            document.addEventListener('keydown', (e) => {
                if (overlay.style.display === 'flex' && e.key === 'Escape') hideOverlay(overlay);
            });
        }
        showOverlay(overlay);
    }

    function fillPoster(page, data) {
        const img = page.querySelector('.entity__poster img');
        if (!img) return;
        img.setAttribute('referrerpolicy', 'no-referrer');
        img.src = data.poster;
        img.alt = data.russian || data.name;
        img.removeAttribute('data-src');
        img.removeAttribute('srcset');
        img.removeAttribute('style');
        img.classList.add('ag-syn-poster');
        img.addEventListener('click', () => openPosterLightbox(data));
    }

    /** Кнопка под постером, сведения о тайтле, описание. Расписание серий из шаблона относится к чужому тайтлу */
    function fillInfo(page, data) {
        const watchBtn = page.querySelector('a[href*="#player"], .entity__sticky a.btn-primary');
        if (watchBtn) {
            watchBtn.href = '#ag-watch-choice';
            watchBtn.id = 'ag-synthetic-watch-side-btn';
            watchBtn.innerHTML = '<span>Смотреть онлайн</span>';
            watchBtn.className = 'btn btn-danger icon-link gap-2 text-nowrap mw-0 justify-content-center w-100 fw-bold';
            watchBtn.style.cssText = 'background: var(--ap-accent); border: none; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 6px;';
        }

        const myList = page.querySelector('.collapse#collapseMylist, button[data-bs-target="#collapseMylist"]');
        if (myList) {
            const parent = myList.closest('.d-flex, .position-relative, .d-grid');
            if (parent) parent.style.display = 'none';
        }

        const genresHtml = data.genres.map(g => `<a href="/anime/genre/${encodeURIComponent(g.toLowerCase())}" class="link-offset-1 link-underline link-underline-opacity-0 link-underline-opacity-75-hover text-danger" style="text-decoration: none; font-weight: 500;">${escapeHtml(g)}</a>`).join(', ');
        const studios = data.studios.length > 0 ? data.studios.join(', ') : 'Неизвестно';
        const row = (label, value) => `
            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">${label}</div>
            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${value}</div>`;
        const fields = page.querySelector('.entity-field');
        if (fields) {
            fields.innerHTML = [
                row('Тип', escapeHtml(data.kind)),
                row('Эпизоды', data.episodes ? data.episodes : 'Выходит'),
                row('Жанры', genresHtml),
                row('Статус', data.status === 'released' ? 'Вышел' : 'Онгоинг'),
                row('Выпуск', escapeHtml(data.airedOn || '—')),
                row('Студия', escapeHtml(studios)),
                row('Оригинал', escapeHtml(data.name))
            ].join('');
        }

        // Описание уже очищено санитайзером или экранировано в fetchAnimeDetails
        const desc = page.querySelector('.description');
        if (desc) desc.innerHTML = data.description || 'Описание отсутствует.';

        page.querySelectorAll('h1, h2, h3, h4, h5, div, section').forEach(el => {
            if (el.children.length !== 0 || !el.textContent) return;
            if (!/График выхода серий|Расписание выхода серий|График серий|Даты выхода серий/.test(el.textContent.trim())) return;
            const block = el.closest('.mb-4, .mt-4, .mb-3, .mt-3, .row, .card-body, .schedule, section') || el.parentElement;
            if (block && block !== page) block.remove();
        });
        page.querySelectorAll('.schedule, #schedule, [class*="schedule"]').forEach(el => el.remove());
        return fields;
    }

    /** Просмотрщик кадров: создаётся один раз на странице и открывается с нужного кадра */
    function createScreenshotLightbox(data, thumbUrls) {
        let currentIndex = 0;
        const overlay = document.createElement('div');
        overlay.id = 'ag-screenshot-lightbox';
        overlay.style.cssText = `${OVERLAY_STYLE} background: rgba(10, 12, 16, 0.92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 2147483000;`;
        overlay.innerHTML = `
            <div style="position: absolute; top: 0; left: 0; width: 100%; padding: 24px 36px; display: flex; justify-content: space-between; align-items: center; z-index: 100; box-sizing: border-box;">
                <div class="ag-lb-counter" style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.65); letter-spacing: 1.5px; text-transform: uppercase; font-family: system-ui, -apple-system, sans-serif;">
                    <span id="ag-lb-curr">1</span> / <span id="ag-lb-total">${data.screenshots.length}</span>
                </div>
                <button class="ag-lb-close">✕</button>
            </div>
            <button class="ag-lb-nav ag-lb-prev">❮</button>
            <div class="ag-lightbox-content" style="position: relative; max-width: 82vw; max-height: 76vh; display: flex; align-items: center; justify-content: center;">
                <img class="ag-lb-img" referrerpolicy="no-referrer" src="" style="max-width: 82vw; max-height: 76vh; border-radius: 16px; box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px var(--ap-line); object-fit: contain; user-select: none; transition: filter 0.2s ease, opacity 0.2s ease;">
                <div class="ag-lb-loading" role="status" aria-label="Кадр загружается" style="position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 12px; pointer-events: none; color: #fff; font: 600 13px system-ui, -apple-system, sans-serif; text-shadow: 0 1px 6px rgba(0,0,0,0.8);">
                    <span class="ag-lb-spinner" style="width: 42px; height: 42px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.25); border-top-color: var(--ap-accent, #ef4444);"></span>
                    <span>Загружается…</span>
                </div>
            </div>
            <button class="ag-lb-nav ag-lb-next">❯</button>
            <div class="ag-lb-strip" style="position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); max-width: 82vw; overflow-x: auto; scrollbar-width: thin; display: flex; gap: 10px; padding: 8px 14px; background: var(--ap-hover); border: 1px solid var(--ap-line); border-radius: 30px; backdrop-filter: blur(16px); z-index: 10;">
                ${thumbUrls.map((src, i) => `
                    <div class="ag-lb-dot" data-idx="${i}" style="flex: none; width: 44px; height: 28px; border-radius: 6px; overflow: hidden; opacity: 0.4; border: 2px solid transparent; cursor: pointer; transition: all 0.2s ease;">
                        <img referrerpolicy="no-referrer" loading="lazy" src="${escapeHtml(src)}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                `).join('')}
            </div>
        `;
        document.body.appendChild(overlay);

        const img = overlay.querySelector('.ag-lb-img');
        const counter = overlay.querySelector('#ag-lb-curr');
        const dots = overlay.querySelectorAll('.ag-lb-dot');
        const loading = overlay.querySelector('.ag-lb-loading');
        const loadingText = loading.querySelector('span:last-child');
        const total = data.screenshots.length;
        const loaded = new Set();

        // Полный кадр грузится в фоне; соседние подгружаются заранее, чтобы листать без ожидания
        const preload = (index, onDone) => {
            const src = data.screenshots[index];
            if (!src) return;
            const probe = new Image();
            probe.referrerPolicy = 'no-referrer';
            probe.onload = () => { loaded.add(src); if (onDone) onDone(true); };
            probe.onerror = () => { if (onDone) onDone(false); };
            probe.src = src;
        };

        // Сразу показываем выбранный кадр: пока полный размер грузится, на его месте размытая
        // уменьшенная копия того же кадра и значок загрузки, а не прежний кадр
        const show = (index) => {
            currentIndex = (index + total) % total;
            const shown = currentIndex;
            const full = data.screenshots[shown];
            const ready = () => {
                if (currentIndex !== shown) return;
                img.src = full;
                img.style.width = '';
                img.style.filter = 'none';
                img.style.opacity = '1';
                loading.style.display = 'none';
                preload((shown + 1) % total);
                preload((shown - 1 + total) % total);
            };
            if (loaded.has(full)) {
                ready();
            } else {
                // Уменьшенная копия меньше полного кадра: держим прежний размер окна, чтобы оно не прыгало
                const width = img.getBoundingClientRect().width;
                img.style.width = width > 0 ? `${Math.round(width)}px` : 'min(82vw, calc(76vh * 16 / 9))';
                img.src = thumbUrls[shown] || full;
                img.style.filter = 'blur(6px) brightness(0.7)';
                loading.style.display = 'flex';
                loadingText.textContent = 'Загружается…';
                preload(shown, (ok) => {
                    if (ok) ready();
                    else if (currentIndex === shown) loadingText.textContent = 'Не удалось загрузить кадр';
                });
            }
            counter.textContent = currentIndex + 1;
            dots.forEach((dot, i) => {
                const on = i === currentIndex;
                if (on) dot.scrollIntoView({ block: 'nearest', inline: 'center' });
                dot.style.opacity = on ? '1' : '0.4';
                dot.style.borderColor = on ? 'var(--ap-accent)' : 'transparent';
                dot.style.transform = on ? 'scale(1.1)' : 'scale(1)';
            });
        };

        const step = (delta) => (e) => { e.stopPropagation(); show(currentIndex + delta); };
        dots.forEach((dot, i) => dot.addEventListener('click', (e) => { e.stopPropagation(); show(i); }));
        overlay.querySelector('.ag-lb-close').addEventListener('click', (e) => { e.stopPropagation(); hideOverlay(overlay); });
        overlay.querySelector('.ag-lb-prev').addEventListener('click', step(-1));
        overlay.querySelector('.ag-lb-next').addEventListener('click', step(1));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('ag-lightbox-content')) hideOverlay(overlay);
        });
        document.addEventListener('keydown', (e) => {
            if (overlay.style.display !== 'flex') return;
            if (e.key === 'Escape') hideOverlay(overlay);
            if (e.key === 'ArrowLeft') show(currentIndex - 1);
            if (e.key === 'ArrowRight') show(currentIndex + 1);
        });

        return (index) => {
            show(index);
            showOverlay(overlay);
        };
    }

    /** Кадры: как на страницах AnimeGO, в сетке один ряд из 4 уменьшенных копий, нажатие открывает просмотрщик со всеми */
    function fillScreenshots(page, data) {
        if (!data.screenshots || data.screenshots.length === 0) return;
        let block = page.querySelector('.screenshots');
        if (!block) {
            const desc = page.querySelector('.description') || page.querySelector('.entity__description');
            const parent = desc ? desc.parentElement : page.querySelector('.col-md-9, .col-lg-9, .col-12, #ag-synthetic-page-container');
            if (!parent) return;
            const heading = document.createElement('h2');
            heading.className = 'h5 fw-bold mt-4 mb-3';
            heading.textContent = 'Кадры';
            block = document.createElement('div');
            parent.append(heading, block);
        }
        const thumbUrls = data.screenshotThumbs && data.screenshotThumbs.length === data.screenshots.length ? data.screenshotThumbs : data.screenshots;
        block.className = 'screenshots grid mb-4';
        block.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; width: 100%;';
        block.innerHTML = thumbUrls.slice(0, 4).map((src, idx) => `
            <div class="ag-screenshot-thumb" data-idx="${idx}">
                <img referrerpolicy="no-referrer" loading="lazy" decoding="async" src="${escapeHtml(src)}" class="rounded" style="width: 100%; height: 100%; object-fit: cover; display: block;">
            </div>
        `).join('');

        // Просмотрщик создаётся при первом нажатии и дальше открывается тот же
        let open = null;
        block.querySelectorAll('.ag-screenshot-thumb').forEach((thumb, i) => {
            thumb.addEventListener('click', () => {
                if (!open) open = createScreenshotLightbox(data, thumbUrls);
                open(i);
            });
        });
    }

    /** Место плеера: выбор сайта для просмотра сразу под сведениями. В шаблоне плеер в самом низу, за «Связанным» */
    function fillPlayerBlock(page, data, fields) {
        const block = page.querySelector('#player, #video-player, .player__video, .player-video');
        if (!block) return;
        block.style.background = 'transparent';
        block.style.border = 'none';
        block.style.boxShadow = 'none';
        block.style.padding = '0';
        block.style.margin = '20px 0';
        block.style.maxWidth = '100%';
        block.innerHTML = `
            <div>
                <h2 class="h5 font-weight-bold mb-3">Смотреть аниме «${escapeHtml(data.russian)}» онлайн</h2>
                <div id="ag-watch-choice"></div>
            </div>
        `;
        if (fields) fields.after(block);
    }

    /** Блоки «Связанное» из шаблона: своего класса у них нет, узнаём по заголовку */
    const removeTemplateRelated = (root, keep = () => false) => {
        root.querySelectorAll('h1, h2, h3, h4, h5, div').forEach(el => {
            if (el.children.length !== 0 || !el.textContent || el.textContent.trim() !== 'Связанное') return;
            const block = el.closest('.mb-4, .mt-4, .mb-3, .mt-3, .row, .card-body') || el.parentElement;
            if (block && block !== root && !keep(block)) block.remove();
        });
    };

    /** Связанные тайтлы этого аниме из Shikimori */
    function loadRelated(page, data) {
        chrome.runtime.sendMessage({ action: 'get_shikimori_anime_related', id: data.id }, (res) => {
            if (!res || !res.related || res.related.length === 0) return;
            const root = document.getElementById('ag-synthetic-page-container') || page;
            removeTemplateRelated(root, block => block.classList.contains('ag-related-block'));
            if (root.querySelector('.ag-related-block')) return;

            const target = root.querySelector('.entity') || root.querySelector('.card-body') || root;
            const related = document.createElement('div');
            related.className = 'mt-4 ag-related-block';
            related.innerHTML = `
                <h2 class="mb-3 h5 font-weight-bold">Связанное</h2>
                <div class="d-flex flex-wrap gap-3">
                    ${res.related.slice(0, 8).map(item => `
                        <a href="/anime/shiki-${escapeHtml(String(item.id))}" class="ag-related-card d-flex align-items-center gap-3 p-2 rounded bg-body-tertiary text-decoration-none text-reset">
                            <img referrerpolicy="no-referrer" src="${escapeHtml(item.poster || '')}" style="width: 48px; height: 68px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" alt="${escapeHtml(item.russian)}" data-ag-poster-id="${escapeHtml(String(item.id))}" data-ag-poster-ru="${escapeHtml(item.russian)}">
                            <div class="overflow-hidden">
                                <div class="fw-bold text-truncate small">${escapeHtml(item.russian)}</div>
                                <div class="text-body-tertiary text-truncate" style="font-size: 0.8rem; opacity: 0.75;">${escapeHtml(item.relation)}</div>
                                <div class="text-secondary" style="font-size: 0.8rem;">${escapeHtml(item.kind)}${item.year ? ' / ' + escapeHtml(String(item.year)) : ''}</div>
                            </div>
                        </a>
                    `).join('')}
                </div>
            `;
            target.appendChild(related);
        });
    }

    /** Страница из шаблона: всё чужое заменено данными Shikimori, затем она встаёт на место содержимого 404 */
    function renderFromTemplate(nativeDoc, container, data) {
        const page = nativeDoc.querySelector('.content-page');
        if (!page) return;
        injectSyntheticStyle();
        fillTitle(page, data);
        fillPoster(page, data);
        const fields = fillInfo(page, data);
        fillScreenshots(page, data);
        fillPlayerBlock(page, data, fields);
        page.querySelectorAll('.comments, #comments, .reviews, [id*="comment"]').forEach(el => el.remove());
        removeTemplateRelated(page);
        sanitizeTemplate(page, data);

        container.replaceWith(page);
        // Цепочку постера привязываем только после вставки в документ: в документе из DOMParser
        // картинка не грузится и выглядела бы «сломанной»
        const livePoster = page.querySelector('.entity__poster img');
        if (livePoster) window.agBindPoster(livePoster, { id: data.id, ru: data.russian, en: data.name });
        page.id = 'ag-synthetic-page-container';

        ensureAgLogoPlus(document);
        setTimeout(() => ensureAgLogoPlus(document), 300);
        mountWatchChoice(page, data);
        loadRelated(page, data);
    }

    window.renderSyntheticAnimePage = async function () {
        const match = window.location.pathname.match(/\/anime\/shiki-(\d+)/);
        if (!match) return;
        if (document.body.dataset.agSyntheticRendered === match[1]) return;
        document.body.dataset.agSyntheticRendered = match[1];

        const shikiId = match[1];
        document.title = 'Загрузка аниме... | AnimeGO';
        document.querySelectorAll('.error-page, .alert-danger').forEach(el => { el.style.display = 'none'; });

        const main = await window.agEnsureAnimeGoShell();
        const host = main ? (main.querySelector('.card-body') || main) : document.body;
        const loader = document.createElement('div');
        loader.id = 'ag-synthetic-loader';
        loader.innerHTML = `
            <div style="text-align: center; padding: 80px 20px; color: var(--ap-text-2); font-size: 18px;">
                <div class="spinner-border text-danger mb-3" role="status"></div>
                <div>Загрузка информации об аниме...</div>
            </div>
        `;
        host.replaceChildren(loader);

        // Тот .content-page, который подменим нативной разметкой
        const container = (main && main.closest('.content-page')) || loader;

        const [data, nativeRes] = await Promise.all([
            fetchAnimeDetails(shikiId).catch(() => null),
            window.agSendMessage({ action: 'get_native_page_template', origin: location.origin })
        ]);

        if (!data) {
            host.innerHTML = `
                <div class="py-5 text-center" style="color: var(--ap-accent);">
                    <h2>Не удалось загрузить данные об аниме</h2>
                    <p class="text-muted mt-2">Возможно, такого аниме нет в базе Shikimori или сервер временно недоступен.</p>
                    <a href="/" class="btn btn-outline-light mt-3">Вернуться на главную</a>
                </div>
            `;
            return;
        }

        document.title = `${data.russian} / ${data.name} — смотреть онлайн на AnimeGO`;

        const nativeHtml = nativeRes ? nativeRes.html : null;
        const nativeDoc = nativeHtml ? new DOMParser().parseFromString(nativeHtml, 'text/html') : null;
        if (!main || !isUsableTemplate(nativeDoc)) {
            renderFallbackPage(main || document.body, data);
            mountWatchChoice(main || document.body, data);
            return;
        }
        renderFromTemplate(nativeDoc, container, data);
    };

    // Кнопка «Смотреть на Jut-Su», если у AnimeGO нет рабочего видео.
    // Плеер грузится лениво (anime-player-loader → /player/{id}), поэтому до загрузки ничего не решаем —
    // раньше кнопка появлялась на каждой странице, пока iframe ещё не успел создаться.
    const NO_VIDEO_RE = /Нет видео|заблокирован|недоступен|изъят/i;

    const getPlayerVideoState = () => {
        const modern = document.querySelector('[data-controller~="anime-player"]');
        if (modern) {
            const providers = Array.from(modern.querySelectorAll('[data-anime-player-target="provider"]'));
            const working = providers.filter(p => !p.classList.contains('player-error') && p.dataset.player);
            const globalError = modern.querySelector('.player-error-global:not(.d-none)');
            const online = modern.querySelector('[data-anime-player-target="iframeContainer"]');
            const noVideoText = online && !online.querySelector('iframe') && NO_VIDEO_RE.test(online.textContent || '');
            return (working.length === 0 || globalError || noVideoText) ? 'no-video' : 'ok';
        }

        // Плеер ещё загружается
        if (document.querySelector('[data-controller~="anime-player-loader"]')) return 'loading';

        // Старый плеер
        const legacy = document.querySelector('#video-player');
        if (legacy) {
            const blocked = NO_VIDEO_RE.test(legacy.textContent || '');
            return (!legacy.querySelector('iframe') || blocked) ? 'no-video' : 'ok';
        }
        return 'unknown';
    };

    window.checkNoVideoAndInjectJutsuButton = function () {
        if (/\/anime\/shiki-\d+/.test(location.pathname)) return;
        if (document.getElementById('ag-jutsu-switch-btn')) return;
        if (getPlayerVideoState() !== 'no-video') return;

        const anchor = window.agQueryFirst(['.player__video', '#video-player', '.player-video']);
        if (!anchor) return;

        const info = window.agGetAnimePageInfo ? window.agGetAnimePageInfo() : null;
        const queryTitle = info && info.title ? info.title : document.title.split(' — ')[0];

        const btn = document.createElement('a');
        btn.id = 'ag-jutsu-switch-btn';
        btn.className = 'btn btn-primary btn-lg mt-3 w-100 fw-bold';
        btn.style.cssText = 'background: var(--ap-accent); border: none; border-radius: 10px; color: #fff; padding: 14px 20px; font-size: 16px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(76,175,80,0.3);';
        btn.innerHTML = '<span>Смотреть этот тайтл на Jut-Su</span>';
        btn.href = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(queryTitle)}&ag_from=animeplus`;
        btn.target = '_blank';
        btn.rel = 'noopener';

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const res = await window.agSendMessage({
                action: 'search_jutsu_direct',
                queryTitle,
                origTitle: info ? info.origTitle : '',
                targetYear: info ? info.year : ''
            });
            window.open((res && res.url) ? res.url : btn.href, '_blank');
        });

        // Вставляем после контейнера плеера: его содержимое целиком подменяет Stimulus-контроллер
        anchor.after(btn);
    };
})();
