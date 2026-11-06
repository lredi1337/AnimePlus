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
            console.error('[AnimeGO+] Failed to build site shell:', e);
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

        let rawScreens = Array.isArray(raw.screenshots) ? raw.screenshots : null;
        if (!rawScreens) {
            const scr = await window.agSendMessage({ action: 'fetch_shikimori', url: `https://shikimori.io/api/animes/${shikiId}/screenshots` });
            rawScreens = scr && Array.isArray(scr.data) ? scr.data : [];
        }
        const screenshots = rawScreens.slice(0, 10).map(s => normalize(s.original || s.preview || '')).filter(Boolean);

        const kindMap = { tv: 'ТВ Сериал', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', music: 'Клип', tv_special: 'ТВ Спешл' };

        return {
            id: raw.id,
            name: raw.name || '',
            russian: raw.russian || raw.name || '',
            japanese: Array.isArray(raw.japanese) ? raw.japanese[0] : (raw.japanese || ''),
            poster,
            kind: kindMap[raw.kind] || (raw.kind ? String(raw.kind).toUpperCase() : 'TV'),
            score: raw.score || '—',
            status: raw.status || '',
            episodes: raw.episodes || 0,
            episodesAired: raw.episodes_aired || 0,
            airedOn: raw.aired_on ? String(raw.aired_on).split('-')[0] : '',
            // description_html — пользовательский HTML Shikimori: только через санитайзер
            description: raw.description_html ? window.agSanitizeHtml(raw.description_html) : escapeHtml(raw.description || ''),
            genres: Array.isArray(raw.genres) ? raw.genres.map(g => g.russian || g.name) : [],
            studios: Array.isArray(raw.studios) ? raw.studios.map(s => s.name) : [],
            videos: Array.isArray(raw.videos) ? raw.videos : [],
            screenshots,
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

    window.renderSyntheticAnimePage = async function () {
        const match = window.location.pathname.match(/\/anime\/shiki-(\d+)/);
        if (!match) return;
        if (document.body.dataset.agSyntheticRendered === match[1]) return;
        document.body.dataset.agSyntheticRendered = match[1];

        const shikiId = match[1];
        document.title = "Загрузка аниме... | AnimeGO";
        document.querySelectorAll('.error-page, .alert-danger').forEach(el => el.style.display = 'none');

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
        const nativeHtml = nativeRes ? nativeRes.html : null;

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

        const nativeDoc = nativeHtml ? new DOMParser().parseFromString(nativeHtml, 'text/html') : null;
        if (!main || !isUsableTemplate(nativeDoc)) {
            renderFallbackPage(main || document.body, data);
            mountWatchChoice(main || document.body, data);
            return;
        }

        (() => {
            if (nativeHtml) {
                const nativeContentPage = nativeDoc.querySelector('.content-page');
                if (nativeContentPage) {
                    // Title
                    const h1 = nativeContentPage.querySelector('h1');
                    if (h1) h1.textContent = data.russian || data.name;

                    const titleSynonyms = nativeContentPage.querySelector('.entity__title-synonyms');
                    if (titleSynonyms) {
                        titleSynonyms.innerHTML = `<ul class="list-unstyled small mb-0"><li class="text-body-tertiary">${escapeHtml(data.name)} ${data.japanese ? '/ ' + escapeHtml(data.japanese) : ''}</li></ul>`;
                    }

                    // Rating Score
                    const ratingValue = nativeContentPage.querySelector('.entity-rating__value');
                    if (ratingValue) ratingValue.textContent = (data.score || '0.0').toString().replace('.', ',');

                    const ratingCount = nativeContentPage.querySelector('.entity-rating__count');
                    if (ratingCount) ratingCount.textContent = 'Shikimori';

                    // Remove vote buttons/forms
                    const userVoteBlock = nativeContentPage.querySelector('.entity-rating__user');
                    if (userVoteBlock) userVoteBlock.remove();

                    // Add / update Shikimori badge in rating block
                    let ratingContainer = nativeContentPage.querySelector('.entity__rating');
                    if (ratingContainer) {
                        const oldShikiBtn = ratingContainer.querySelector('#ag-shiki-btn');
                        if (oldShikiBtn) oldShikiBtn.remove();
                        const shikiBtn = document.createElement('a');
                        shikiBtn.id = 'ag-shiki-btn';
                        shikiBtn.href = `https://shikimori.io/animes/${data.id}`;
                        shikiBtn.target = '_blank';
                        shikiBtn.className = 'd-inline-flex align-items-center';
                        shikiBtn.style.cssText = 'background: var(--ap-raised); border: 1px solid var(--ap-line); color: var(--ap-text); font-weight: 600; border-radius: var(--ap-radius); padding: 0 12px; font-size: var(--ap-fs-md); height: 32px; text-decoration: none;';
                        shikiBtn.textContent = `Shikimori ★ ${data.score}`;
                        ratingContainer.appendChild(shikiBtn);
                    }

                    // Poster Cover
                    const posterImg = nativeContentPage.querySelector('.entity__poster img');
                    if (posterImg) {
                        posterImg.setAttribute('referrerpolicy', 'no-referrer');
                        posterImg.src = data.poster;
                        posterImg.alt = data.russian || data.name;
                        posterImg.removeAttribute('data-src');
                        posterImg.removeAttribute('srcset');
                        posterImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 8px; cursor: pointer; transition: transform 0.25s ease, box-shadow 0.25s ease;';
                        posterImg.onmouseover = function() { this.style.transform = 'scale(1.02)'; this.style.boxShadow = '0 8px 25px rgba(0,0,0,0.5)'; };
                        posterImg.onmouseout = function() { this.style.transform = 'none'; this.style.boxShadow = 'none'; };

                        posterImg.addEventListener('click', () => {
                            let posterOverlay = document.getElementById('ag-poster-lightbox');
                            if (!posterOverlay) {
                                posterOverlay = document.createElement('div');
                                posterOverlay.id = 'ag-poster-lightbox';
                                posterOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(8, 10, 14, 0.94); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); z-index: 999999; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);';
                                posterOverlay.innerHTML = `
                                    <div style="position: absolute; top: 0; left: 0; width: 100%; padding: 24px 36px; display: flex; justify-content: flex-end; align-items: center; z-index: 100; box-sizing: border-box;">
                                        <button class="ag-poster-close" style="background: var(--ap-hover); border: 1px solid var(--ap-line); color: #fff; width: 44px; height: 44px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease;" onmouseover="this.style.background='var(--ap-accent-line)'; this.style.borderColor='var(--ap-accent-line)'; this.style.transform='rotate(90deg) scale(1.05)';" onmouseout="this.style.background='var(--ap-hover)'; this.style.borderColor='var(--ap-line)'; this.style.transform='none';">✕</button>
                                    </div>
                                    <div class="ag-poster-content" style="position: relative; max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center;">
                                        <img referrerpolicy="no-referrer" src="${escapeHtml(data.poster)}" style="height: 85vh; max-height: 88vh; max-width: 88vw; border-radius: 18px; box-shadow: 0 35px 100px rgba(0,0,0,0.95), 0 0 0 1px var(--ap-line-strong); object-fit: contain; user-select: none;">
                                    </div>
                                `;
                                document.body.appendChild(posterOverlay);

                                const closePosterLb = () => {
                                    posterOverlay.style.opacity = '0';
                                    setTimeout(() => { posterOverlay.style.display = 'none'; }, 250);
                                };

                                posterOverlay.querySelector('.ag-poster-close').addEventListener('click', closePosterLb);
                                posterOverlay.addEventListener('click', (e) => {
                                    if (e.target === posterOverlay || e.target.classList.contains('ag-poster-content')) {
                                        closePosterLb();
                                    }
                                });
                                document.addEventListener('keydown', (e) => {
                                    if (posterOverlay.style.display === 'flex' && e.key === 'Escape') {
                                        closePosterLb();
                                    }
                                });
                            }

                            posterOverlay.style.display = 'flex';
                            requestAnimationFrame(() => { posterOverlay.style.opacity = '1'; });
                        });
                    }

                    // Watch Online button under poster
                    const watchBtn = nativeContentPage.querySelector('a[href*="#player"], .entity__sticky a.btn-primary');
                    if (watchBtn) {
                        watchBtn.href = '#ag-watch-choice';
                        watchBtn.id = 'ag-synthetic-watch-side-btn';
                        watchBtn.innerHTML = `<span>Смотреть онлайн</span>`;
                        watchBtn.className = 'btn btn-danger icon-link gap-2 text-nowrap mw-0 justify-content-center w-100 fw-bold';
                        watchBtn.style.cssText = 'background: var(--ap-accent); border: none; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 6px;';
                    }

                    // Hide lists button collapse
                    const myListGroup = nativeContentPage.querySelector('.collapse#collapseMylist, button[data-bs-target="#collapseMylist"]');
                    if (myListGroup) {
                        const parent = myListGroup.closest('.d-flex, .position-relative, .d-grid');
                        if (parent) parent.style.display = 'none';
                    }

                    // Info Table (.entity-field)
                    const genresHtml = data.genres.map(g => `<a href="/anime/genre/${encodeURIComponent(g.toLowerCase())}" class="link-offset-1 link-underline link-underline-opacity-0 link-underline-opacity-75-hover text-danger" style="text-decoration: none; font-weight: 500;">${escapeHtml(g)}</a>`).join(', ');
                    const studioStr = data.studios.length > 0 ? data.studios.join(', ') : 'Неизвестно';

                    const fieldContainer = nativeContentPage.querySelector('.entity-field');
                    if (fieldContainer) {
                        fieldContainer.innerHTML = `
                            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">Тип</div>
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${escapeHtml(data.kind)}</div>

                            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">Эпизоды</div>
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${data.episodes ? data.episodes : 'Выходит'}</div>

                            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">Жанры</div>
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${genresHtml}</div>

                            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">Статус</div>
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${data.status === 'released' ? 'Вышел' : 'Онгоинг'}</div>

                            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">Выпуск</div>
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${escapeHtml(data.airedOn || '—')}</div>

                            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">Студия</div>
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${escapeHtml(studioStr)}</div>

                            <div class="g-col-5 g-col-sm-4 g-col-md-4 g-col-lg-3 g-col-xl-3 text-body-tertiary text-opacity-75">Оригинал</div>
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${escapeHtml(data.name)}</div>
                        `;
                    }

                    // Description
                    const desc = nativeContentPage.querySelector('.description');
                    if (desc) {
                        desc.innerHTML = data.description || 'Описание отсутствует.';
                    }

                    // Purge hardcoded native schedule / episode release dates blocks from cloned template
                    nativeContentPage.querySelectorAll('h1, h2, h3, h4, h5, div, section').forEach(el => {
                        if (el.children.length === 0 && el.textContent && (
                            el.textContent.trim().includes('График выхода серий') ||
                            el.textContent.trim().includes('Расписание выхода серий') ||
                            el.textContent.trim().includes('График серий') ||
                            el.textContent.trim().includes('Даты выхода серий')
                        )) {
                            const scheduleContainer = el.closest('.mb-4, .mt-4, .mb-3, .mt-3, .row, .card-body, .schedule, section') || el.parentElement;
                            if (scheduleContainer && scheduleContainer !== nativeContentPage) {
                                scheduleContainer.remove();
                            }
                        }
                    });
                    nativeContentPage.querySelectorAll('.schedule, #schedule, [class*="schedule"]').forEach(el => el.remove());

                    // Screenshots container
                    let screenshotsBlock = nativeContentPage.querySelector('.screenshots');
                    if (!screenshotsBlock && data.screenshots && data.screenshots.length > 0) {
                        const descEl = nativeContentPage.querySelector('.description') || nativeContentPage.querySelector('.entity__description');
                        const targetParent = descEl ? descEl.parentElement : nativeContentPage.querySelector('.col-md-9, .col-lg-9, .col-12, #ag-synthetic-page-container');
                        if (targetParent) {
                            const sectionHeader = document.createElement('h2');
                            sectionHeader.className = 'h5 fw-bold mt-4 mb-3';
                            sectionHeader.textContent = 'Кадры';
                            screenshotsBlock = document.createElement('div');
                            screenshotsBlock.className = 'screenshots grid mb-4';
                            targetParent.appendChild(sectionHeader);
                            targetParent.appendChild(screenshotsBlock);
                        }
                    }

                    if (screenshotsBlock && data.screenshots && data.screenshots.length > 0) {
                        const gridScreenshots = data.screenshots.slice(0, 4);
                        screenshotsBlock.className = 'screenshots grid mb-4';
                        screenshotsBlock.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; width: 100%;';
                        screenshotsBlock.innerHTML = gridScreenshots.map((src, idx) => `
                            <div class="ag-screenshot-thumb" data-idx="${idx}" style="aspect-ratio: 16 / 9; width: 100%; position: relative; overflow: hidden; border-radius: 8px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='scale(1.03)'; this.style.boxShadow='0 6px 15px rgba(0,0,0,0.4)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
                                <img referrerpolicy="no-referrer" src="${escapeHtml(src)}" class="rounded" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                            </div>
                        `).join('');

                        const initLightbox = () => {
                            let currentIndex = 0;
                            let lightboxOverlay = document.getElementById('ag-screenshot-lightbox');

                            if (!lightboxOverlay) {
                                lightboxOverlay = document.createElement('div');
                                lightboxOverlay.id = 'ag-screenshot-lightbox';
                                lightboxOverlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(10, 12, 16, 0.92); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); z-index: 999999; display: none; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);';
                                lightboxOverlay.innerHTML = `
                                    <div style="position: absolute; top: 0; left: 0; width: 100%; padding: 24px 36px; display: flex; justify-content: space-between; align-items: center; z-index: 100; box-sizing: border-box;">
                                        <div class="ag-lb-counter" style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.65); letter-spacing: 1.5px; text-transform: uppercase; font-family: system-ui, -apple-system, sans-serif;">
                                            <span id="ag-lb-curr">1</span> / <span id="ag-lb-total">${data.screenshots.length}</span>
                                        </div>
                                        <button class="ag-lb-close" style="background: var(--ap-hover); border: 1px solid var(--ap-line); color: #fff; width: 42px; height: 42px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease;" onmouseover="this.style.background='var(--ap-accent-line)'; this.style.borderColor='var(--ap-accent-line)'; this.style.transform='rotate(90deg) scale(1.05)';" onmouseout="this.style.background='var(--ap-hover)'; this.style.borderColor='var(--ap-line)'; this.style.transform='none';">✕</button>
                                    </div>
                                    <button class="ag-lb-prev" style="position: absolute; left: 36px; top: 50%; transform: translateY(-50%); background: var(--ap-hover); border: 1px solid var(--ap-line); color: #fff; width: 54px; height: 54px; border-radius: 50%; font-size: 22px; cursor: pointer; z-index: 10; backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.background='var(--ap-line-strong)'; this.style.borderColor='rgba(255, 255, 255, 0.3)'; this.style.transform='translateY(-50%) scale(1.1)';" onmouseout="this.style.background='var(--ap-hover)'; this.style.borderColor='var(--ap-line)'; this.style.transform='translateY(-50%)';">❮</button>
                                    <div class="ag-lightbox-content" style="position: relative; max-width: 82vw; max-height: 76vh; display: flex; align-items: center; justify-content: center;">
                                        <img class="ag-lb-img" referrerpolicy="no-referrer" src="" style="max-width: 82vw; max-height: 76vh; border-radius: 16px; box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px var(--ap-line); object-fit: contain; user-select: none; transition: opacity 0.2s ease, transform 0.2s ease;">
                                    </div>
                                    <button class="ag-lb-next" style="position: absolute; right: 36px; top: 50%; transform: translateY(-50%); background: var(--ap-hover); border: 1px solid var(--ap-line); color: #fff; width: 54px; height: 54px; border-radius: 50%; font-size: 22px; cursor: pointer; z-index: 10; backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.background='var(--ap-line-strong)'; this.style.borderColor='rgba(255, 255, 255, 0.3)'; this.style.transform='translateY(-50%) scale(1.1)';" onmouseout="this.style.background='var(--ap-hover)'; this.style.borderColor='var(--ap-line)'; this.style.transform='translateY(-50%)';">❯</button>
                                    <div class="ag-lb-strip" style="position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; padding: 8px 14px; background: var(--ap-hover); border: 1px solid var(--ap-line); border-radius: 30px; backdrop-filter: blur(16px); z-index: 10;">
                                        ${data.screenshots.map((src, i) => `
                                            <div class="ag-lb-dot" data-idx="${i}" style="width: 44px; height: 28px; border-radius: 6px; overflow: hidden; opacity: 0.4; border: 2px solid transparent; cursor: pointer; transition: all 0.2s ease;">
                                                <img referrerpolicy="no-referrer" src="${escapeHtml(src)}" style="width: 100%; height: 100%; object-fit: cover;">
                                            </div>
                                        `).join('')}
                                    </div>
                                `;
                                document.body.appendChild(lightboxOverlay);

                                const lbImg = lightboxOverlay.querySelector('.ag-lb-img');
                                const lbClose = lightboxOverlay.querySelector('.ag-lb-close');
                                const lbPrev = lightboxOverlay.querySelector('.ag-lb-prev');
                                const lbNext = lightboxOverlay.querySelector('.ag-lb-next');
                                const currEl = lightboxOverlay.querySelector('#ag-lb-curr');
                                const dots = lightboxOverlay.querySelectorAll('.ag-lb-dot');

                                const showImage = (index) => {
                                    if (index < 0) index = data.screenshots.length - 1;
                                    if (index >= data.screenshots.length) index = 0;
                                    currentIndex = index;

                                    lbImg.style.opacity = '0.4';
                                    lbImg.style.transform = 'scale(0.98)';
                                    setTimeout(() => {
                                        lbImg.src = data.screenshots[currentIndex];
                                        lbImg.style.opacity = '1';
                                        lbImg.style.transform = 'scale(1)';
                                    }, 100);

                                    if (currEl) currEl.textContent = currentIndex + 1;

                                    dots.forEach((dot, idx) => {
                                        if (idx === currentIndex) {
                                            dot.style.opacity = '1';
                                            dot.style.borderColor = 'var(--ap-accent)';
                                            dot.style.transform = 'scale(1.1)';
                                        } else {
                                            dot.style.opacity = '0.4';
                                            dot.style.borderColor = 'transparent';
                                            dot.style.transform = 'scale(1)';
                                        }
                                    });
                                };

                                dots.forEach((dot, idx) => {
                                    dot.addEventListener('click', (e) => {
                                        e.stopPropagation();
                                        showImage(idx);
                                    });
                                });

                                const closeLb = () => {
                                    lightboxOverlay.style.opacity = '0';
                                    setTimeout(() => { lightboxOverlay.style.display = 'none'; }, 250);
                                };

                                const openLb = (index) => {
                                    showImage(index);
                                    lightboxOverlay.style.display = 'flex';
                                    requestAnimationFrame(() => { lightboxOverlay.style.opacity = '1'; });
                                };

                                lbClose.addEventListener('click', (e) => { e.stopPropagation(); closeLb(); });
                                lbPrev.addEventListener('click', (e) => { e.stopPropagation(); showImage(currentIndex - 1); });
                                lbNext.addEventListener('click', (e) => { e.stopPropagation(); showImage(currentIndex + 1); });

                                lightboxOverlay.addEventListener('click', (e) => {
                                    if (e.target === lightboxOverlay || e.target.classList.contains('ag-lightbox-content')) {
                                        closeLb();
                                    }
                                });

                                document.addEventListener('keydown', (e) => {
                                    if (lightboxOverlay.style.display === 'flex') {
                                        if (e.key === 'Escape') closeLb();
                                        if (e.key === 'ArrowLeft') showImage(currentIndex - 1);
                                        if (e.key === 'ArrowRight') showImage(currentIndex + 1);
                                    }
                                });

                                window.agOpenScreenshotLb = openLb;
                            }

                            const thumbs = document.querySelectorAll('.ag-screenshot-thumb');
                            thumbs.forEach((t, i) => {
                                t.addEventListener('click', () => {
                                    if (window.agOpenScreenshotLb) window.agOpenScreenshotLb(i);
                                });
                            });
                        };

                        setTimeout(initLightbox, 100);
                    }

                    // Player Block - Bounded native width matching player area
                    const playerBlock = nativeContentPage.querySelector('#player, #video-player, .player__video, .player-video');
                    if (playerBlock) {
                        playerBlock.style.background = 'transparent';
                        playerBlock.style.border = 'none';
                        playerBlock.style.boxShadow = 'none';
                        playerBlock.style.padding = '0';
                        playerBlock.style.margin = '20px 0';
                        playerBlock.style.maxWidth = '100%';

                        playerBlock.innerHTML = `
                            <div>
                                <h2 class="h5 font-weight-bold mb-3">Смотреть аниме «${escapeHtml(data.russian)}» онлайн</h2>
                                <div id="ag-watch-choice"></div>
                            </div>
                        `;
                        // Сразу под описанием тайтла: в шаблоне плеер стоит в самом низу страницы, за «Связанным»
                        if (fieldContainer) fieldContainer.after(playerBlock);
                    }

                    // Remove comments/reviews
                    nativeContentPage.querySelectorAll('.comments, #comments, .reviews, [id*="comment"]').forEach(el => el.remove());

                    // Purge hardcoded native "Связанное" block from cloned template (wrong anime)
                    nativeContentPage.querySelectorAll('h1, h2, h3, h4, h5, div').forEach(el => {
                        if (el.children.length === 0 && el.textContent && el.textContent.trim() === 'Связанное') {
                            const relContainer = el.closest('.mb-4, .mt-4, .mb-3, .mt-3, .row, .card-body') || el.parentElement;
                            if (relContainer && relContainer !== nativeContentPage) {
                                relContainer.remove();
                            }
                        }
                    });

                    sanitizeTemplate(nativeContentPage, data);
                    container.replaceWith(nativeContentPage);
                    // Цепочку постера привязываем только после вставки в документ: в документе из DOMParser
                    // картинка не грузится и выглядела бы «сломанной»
                    const livePoster = nativeContentPage.querySelector('.entity__poster img');
                    if (livePoster) window.agBindPoster(livePoster, { id: data.id, ru: data.russian, en: data.name });
                    nativeContentPage.id = 'ag-synthetic-page-container';

                    ensureAgLogoPlus(document);
                    setTimeout(() => ensureAgLogoPlus(document), 300);

                    mountWatchChoice(nativeContentPage, data);

                    // Async fetch and render correct related anime from Shikimori
                    chrome.runtime.sendMessage({ action: "get_shikimori_anime_related", id: data.id }, (res) => {
                        if (res && res.related && res.related.length > 0) {
                            const pageContainer = document.getElementById('ag-synthetic-page-container') || nativeContentPage;

                            // Remove any leftover native related block
                            pageContainer.querySelectorAll('h1, h2, h3, h4, h5, div').forEach(el => {
                                if (el.children.length === 0 && el.textContent && el.textContent.trim() === 'Связанное') {
                                    const c = el.closest('.mb-4, .mt-4, .mb-3, .mt-3, .row, .card-body') || el.parentElement;
                                    if (c && !c.classList.contains('ag-related-block')) c.remove();
                                }
                            });

                            if (!pageContainer.querySelector('.ag-related-block')) {
                                const entityContainer = pageContainer.querySelector('.entity') || pageContainer.querySelector('.card-body') || pageContainer;
                                const relatedDiv = document.createElement('div');
                                relatedDiv.className = 'mt-4 ag-related-block';
                                relatedDiv.innerHTML = `
                                    <h2 class="mb-3 h5 font-weight-bold">Связанное</h2>
                                    <div class="d-flex flex-wrap gap-3">
                                        ${res.related.slice(0, 8).map(item => `
                                            <a href="/anime/shiki-${item.id}" class="d-flex align-items-center gap-3 p-2 rounded bg-body-tertiary text-decoration-none text-reset" style="width: 260px; border: 1px solid var(--ap-hover); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                                                <img referrerpolicy="no-referrer" src="${escapeHtml(item.poster || '')}" style="width: 48px; height: 68px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" alt="${escapeHtml(item.russian)}" data-ag-poster-id="${item.id}" data-ag-poster-ru="${escapeHtml(item.russian)}">
                                                <div class="overflow-hidden">
                                                    <div class="fw-bold text-truncate small">${escapeHtml(item.russian)}</div>
                                                    <div class="text-body-tertiary text-truncate" style="font-size: 0.8rem; opacity: 0.75;">${escapeHtml(item.relation)}</div>
                                                    <div class="text-secondary" style="font-size: 0.8rem;">${escapeHtml(item.kind)}${item.year ? ' / ' + item.year : ''}</div>
                                                </div>
                                            </a>
                                        `).join('')}
                                    </div>
                                `;
                                entityContainer.appendChild(relatedDiv);
                            }
                        }
                    });

                }
            }
        })();
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
