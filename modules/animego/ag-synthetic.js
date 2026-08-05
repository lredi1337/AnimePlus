// modules/animego/ag-synthetic.js
// Модуль синтетических страниц аниме и кнопки переключения на Jut-Su

(function () {
    'use strict';

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const ensureAgLogoPlus = window.ensureAgLogoPlus || function () {};

    window.renderSyntheticAnimePage = function () {
        const match = window.location.pathname.match(/\/anime\/shiki-(\d+)/);
        if (!match) return;

        const shikiId = match[1];

        document.title = "Загрузка аниме... | AnimeGO";

        // Скрываем блоки ошибки 404, сохраняя при этом хэдер и навигацию
        const errorBlocks = document.querySelectorAll('.error-page, .alert-danger');
        errorBlocks.forEach(el => el.style.display = 'none');
        document.querySelectorAll('.container.py-5.text-center, .py-5.text-center').forEach(el => {
            if (el.textContent.includes('404') || el.textContent.includes('не найдена') || el.textContent.includes('Запрашиваемый ресурс')) {
                el.style.display = 'none';
            }
        });

        let wrapper = document.querySelector('.wrapper') || document.querySelector('.content-container') || document.body;
        let container = document.getElementById('ag-synthetic-page-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ag-synthetic-page-container';
            container.className = 'content-page mt-3';
            wrapper.appendChild(container);
        }

        container.innerHTML = `
            <div style="text-align: center; padding: 80px 20px; color: #94a3b8; font-size: 18px;">
                <div style="font-size: 36px; margin-bottom: 12px; animation: spin 1s infinite linear;">⌛</div>
                <div>Загрузка информации об аниме...</div>
            </div>
        `;

        const fetchAnimeDetails = async () => {
            let data = null;
            try {
                const resp = await fetch(`https://shikimori.io/api/animes/${shikiId}`);
                if (resp.ok) {
                    const raw = await resp.json();
                    let poster = raw.image ? (raw.image.original || raw.image.preview || '') : '';
                    if (window.agNormalizePosterUrl) {
                        poster = window.agNormalizePosterUrl(poster);
                    } else if (poster && !poster.startsWith('http')) {
                        poster = 'https://shikimori.one' + poster;
                    }
                    if (poster) {
                        poster = poster.replace(/\/preview\//g, '/original/').replace(/\/x\d+\//g, '/original/');
                    }

                    let screenshots = [];
                    try {
                        const scrResp = await fetch(`https://shikimori.io/api/animes/${shikiId}/screenshots`);
                        if (scrResp.ok) {
                            const scrData = await scrResp.json();
                            if (Array.isArray(scrData)) {
                                screenshots = scrData.slice(0, 10).map(s => {
                                    let url = s.original || s.preview || '';
                                    if (window.agNormalizePosterUrl) {
                                        return window.agNormalizePosterUrl(url);
                                    }
                                    if (url && !url.startsWith('http')) {
                                        url = 'https://shikimori.one' + url;
                                    }
                                    return url;
                                }).filter(Boolean);
                            }
                        }
                    } catch (e) {}

                    const kindMap = {
                        tv: 'ТВ Сериал',
                        movie: 'Фильм',
                        ova: 'OVA',
                        ona: 'ONA',
                        special: 'Спешл',
                        music: 'Клип',
                        tv_special: 'ТВ Спешл'
                    };

                    data = {
                        id: raw.id,
                        name: raw.name || '',
                        russian: raw.russian || raw.name || '',
                        japanese: Array.isArray(raw.japanese) ? raw.japanese[0] : (raw.japanese || ''),
                        poster: poster,
                        kind: kindMap[raw.kind] || (raw.kind ? String(raw.kind).toUpperCase() : 'TV'),
                        score: raw.score || '—',
                        status: raw.status || '',
                        episodes: raw.episodes || 0,
                        episodesAired: raw.episodes_aired || 0,
                        airedOn: raw.aired_on ? String(raw.aired_on).split('-')[0] : '',
                        description: raw.description_html || raw.description || '',
                        genres: Array.isArray(raw.genres) ? raw.genres.map(g => g.russian || g.name) : [],
                        studios: Array.isArray(raw.studios) ? raw.studios.map(s => s.name) : [],
                        videos: Array.isArray(raw.videos) ? raw.videos : [],
                        screenshots: screenshots,
                        jutsuUrl: `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(raw.name || raw.russian || '')}`
                    };
                }
            } catch (e) {}
            return data;
        };

        // Request native page template and anime details in parallel
        Promise.all([
            fetchAnimeDetails(),
            new Promise(resolve => {
                try {
                    chrome.runtime.sendMessage({ action: "get_native_page_template" }, res => resolve(res ? res.html : null));
                } catch(err) {
                    resolve(null);
                }
            })
        ]).then(([data, nativeHtml]) => {
            if (!data) {
                container.innerHTML = `
                    <div class="container-xxl py-5 text-center" style="color: #f87171;">
                        <h2>Не удалось загрузить данные об аниме</h2>
                        <p class="text-muted mt-2">Возможно, такого аниме нет в базе Shikimori.</p>
                        <a href="/" class="btn btn-outline-light mt-3">Вернуться на главную</a>
                    </div>
                `;
                return;
            }

            document.title = `${data.russian} / ${data.name} — смотреть онлайн на AnimeGO`;

            if (nativeHtml) {
                const parser = new DOMParser();
                const nativeDoc = parser.parseFromString(nativeHtml, 'text/html');

                // Sync header if missing or hidden
                const nativeHeader = nativeDoc.querySelector('header.header-navbar, header.header, header');
                const existingHeader = document.querySelector('header.header-navbar, header.header, header');
                if (!existingHeader && nativeHeader) {
                    wrapper.insertBefore(nativeHeader, wrapper.firstChild);
                } else if (existingHeader) {
                    existingHeader.style.display = '';
                }

                // Extract .content-page from native doc
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
                        shikiBtn.href = `https://shikimori.one/animes/${data.id}`;
                        shikiBtn.target = '_blank';
                        shikiBtn.className = 'btn d-inline-flex align-items-center';
                        shikiBtn.style.cssText = 'background-color: rgb(33, 33, 33); color: white; font-weight: 600; border-radius: 4px; padding: 0px 12px; font-size: 13px; height: 32px; text-decoration: none; margin-left: 8px;';
                        shikiBtn.textContent = `Shikimori ★ ${data.score}`;
                        ratingContainer.appendChild(shikiBtn);
                    }

                    // Poster Cover
                    const posterImg = nativeContentPage.querySelector('.entity__poster img');
                    if (posterImg) {
                        posterImg.setAttribute('referrerpolicy', 'no-referrer');
                        posterImg.src = data.poster;
                        posterImg.alt = data.russian || data.name;
                        posterImg.onerror = function () {
                            if (window.agHandlePosterError) {
                                window.agHandlePosterError(this, data.russian || data.name, data.id, data.russian, data.name);
                            }
                        };
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
                                        <button class="ag-poster-close" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; width: 44px; height: 44px; border-radius: 50%; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease;" onmouseover="this.style.background='rgba(239,68,68,0.9)'; this.style.borderColor='rgba(239,68,68,1)'; this.style.transform='rotate(90deg) scale(1.05)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.08)'; this.style.borderColor='rgba(255, 255, 255, 0.12)'; this.style.transform='none';">✕</button>
                                    </div>
                                    <div class="ag-poster-content" style="position: relative; max-width: 90vw; max-height: 90vh; display: flex; align-items: center; justify-content: center;">
                                        <img referrerpolicy="no-referrer" src="${data.poster}" style="height: 85vh; max-height: 88vh; max-width: 88vw; border-radius: 18px; box-shadow: 0 35px 100px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.15); object-fit: contain; user-select: none;">
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
                        watchBtn.href = '#player';
                        watchBtn.id = 'ag-synthetic-jutsu-side-btn';
                        watchBtn.innerHTML = `<span>Смотреть на Jut.su</span>`;
                        watchBtn.className = 'btn btn-danger icon-link gap-2 text-nowrap mw-0 justify-content-center w-100 fw-bold';
                        watchBtn.style.cssText = 'background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border: none; font-weight: 700; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 6px;';
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
                            <div class="g-col-7 g-col-sm-12 g-col-md-8 g-col-lg-9 g-col-xl-9 text-break">${data.airedOn || '—'}</div>

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
                                <img referrerpolicy="no-referrer" src="${src}" class="rounded" style="width: 100%; height: 100%; object-fit: cover; display: block;">
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
                                        <button class="ag-lb-close" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; width: 42px; height: 42px; border-radius: 50%; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.25s ease;" onmouseover="this.style.background='rgba(239,68,68,0.9)'; this.style.borderColor='rgba(239,68,68,1)'; this.style.transform='rotate(90deg) scale(1.05)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.08)'; this.style.borderColor='rgba(255, 255, 255, 0.12)'; this.style.transform='none';">✕</button>
                                    </div>
                                    <button class="ag-lb-prev" style="position: absolute; left: 36px; top: 50%; transform: translateY(-50%); background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; width: 54px; height: 54px; border-radius: 50%; font-size: 22px; cursor: pointer; z-index: 10; backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.background='rgba(255, 255, 255, 0.18)'; this.style.borderColor='rgba(255, 255, 255, 0.3)'; this.style.transform='translateY(-50%) scale(1.1)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.06)'; this.style.borderColor='rgba(255, 255, 255, 0.12)'; this.style.transform='translateY(-50%)';">❮</button>
                                    <div class="ag-lightbox-content" style="position: relative; max-width: 82vw; max-height: 76vh; display: flex; align-items: center; justify-content: center;">
                                        <img class="ag-lb-img" referrerpolicy="no-referrer" src="" style="max-width: 82vw; max-height: 76vh; border-radius: 16px; box-shadow: 0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.1); object-fit: contain; user-select: none; transition: opacity 0.2s ease, transform 0.2s ease;">
                                    </div>
                                    <button class="ag-lb-next" style="position: absolute; right: 36px; top: 50%; transform: translateY(-50%); background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); color: #fff; width: 54px; height: 54px; border-radius: 50%; font-size: 22px; cursor: pointer; z-index: 10; backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);" onmouseover="this.style.background='rgba(255, 255, 255, 0.18)'; this.style.borderColor='rgba(255, 255, 255, 0.3)'; this.style.transform='translateY(-50%) scale(1.1)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.06)'; this.style.borderColor='rgba(255, 255, 255, 0.12)'; this.style.transform='translateY(-50%)';">❯</button>
                                    <div class="ag-lb-strip" style="position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; padding: 8px 14px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 30px; backdrop-filter: blur(16px); z-index: 10;">
                                        ${data.screenshots.map((src, i) => `
                                            <div class="ag-lb-dot" data-idx="${i}" style="width: 44px; height: 28px; border-radius: 6px; overflow: hidden; opacity: 0.4; border: 2px solid transparent; cursor: pointer; transition: all 0.2s ease;">
                                                <img referrerpolicy="no-referrer" src="${src}" style="width: 100%; height: 100%; object-fit: cover;">
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
                                            dot.style.borderColor = '#ef4444';
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
                            <div class="container-xxl container-xl container my-4">
                                <h2 class="h5 font-weight-bold mb-3">Смотреть аниме «${escapeHtml(data.russian)}» онлайн</h2>
                                <div class="p-4 text-center rounded-3 bg-body-tertiary" style="border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px;">
                                    <p class="text-body-tertiary mb-3" style="font-size: 0.95rem; line-height: 1.5;">Данное аниме отсутствует в нативном плеере AnimeGO, но доступно для просмотра на Jut-Su:</p>
                                    <a href="${data.jutsuUrl}" target="_blank" id="ag-synthetic-jutsu-btn" class="btn btn-danger btn-lg px-4 py-2" style="font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-size: 1.05rem; cursor: pointer; text-decoration: none; border: none;">
                                        <span>▶ Открыть плеер на Jut-Su</span>
                                    </a>
                                </div>
                            </div>
                        `;
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

                    container.replaceWith(nativeContentPage);
                    nativeContentPage.id = 'ag-synthetic-page-container';

                    ensureAgLogoPlus(document);
                    setTimeout(() => ensureAgLogoPlus(document), 300);

                    const bindJutsuClick = (btnId) => {
                        const btn = document.getElementById(btnId);
                        if (btn) {
                            btn.addEventListener('click', (e) => {
                                e.preventDefault();
                                chrome.runtime.sendMessage({
                                    action: "search_jutsu_direct",
                                    queryTitle: data.russian || data.name,
                                    origTitle: data.name,
                                    targetYear: data.airedOn
                                }, (response) => {
                                    const targetUrl = (response && response.url) ? response.url : data.jutsuUrl;
                                    window.open(targetUrl, '_blank');
                                });
                            });
                        }
                    };

                    bindJutsuClick('ag-synthetic-jutsu-btn');
                    bindJutsuClick('ag-synthetic-jutsu-side-btn');

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
                                            <a href="/anime/shiki-${item.id}" class="d-flex align-items-center gap-3 p-2 rounded bg-body-tertiary text-decoration-none text-reset" style="width: 260px; border: 1px solid rgba(255,255,255,0.08); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                                                <img referrerpolicy="no-referrer" src="${item.poster || ''}" style="width: 48px; height: 68px; object-fit: cover; border-radius: 6px; flex-shrink: 0;" alt="${escapeHtml(item.russian)}" onerror="this.style.display='none'">
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

                    if (window.agSyncAniSkip) {
                        window.agSyncAniSkip();
                    }
                }
            }
        });
    };

    window.checkNoVideoAndInjectJutsuButton = function () {
        const playerContainer = document.querySelector('.player-video, #video-player, .player__video');
        if (!playerContainer) return;

        const hasIframe = playerContainer.querySelector('iframe');
        const hasBlockedText = playerContainer.textContent && (playerContainer.textContent.includes('заблокирован') || playerContainer.textContent.includes('недоступен') || playerContainer.textContent.includes('изъят'));

        if ((!hasIframe || hasBlockedText) && !document.getElementById('ag-jutsu-switch-btn')) {
            const btn = document.createElement('a');
            btn.id = 'ag-jutsu-switch-btn';
            btn.className = 'btn btn-primary btn-lg mt-3 w-100 fw-bold';
            btn.style.cssText = 'background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border: none; border-radius: 10px; color: #fff; padding: 14px 20px; font-size: 16px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 15px rgba(76,175,80,0.3);';
            btn.innerHTML = '<span>🎬 Смотреть этот тайтл на Jut-Su</span>';

            const titleEl = document.querySelector('.entity__title h1, h1');
            const queryTitle = titleEl ? titleEl.innerText.split('/')[0].trim() : document.title;
            btn.href = `https://jut-su.net/?do=search&subaction=search&story=${encodeURIComponent(queryTitle)}`;
            btn.target = '_blank';

            playerContainer.appendChild(btn);
        }
    };
})();
