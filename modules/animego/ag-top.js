// modules/animego/ag-top.js
// Модуль интеграции и отображения страницы Топ-100 Shikimori на AnimeGO

(function () {
    'use strict';

    let topCurrentPage = 1;
    let topCurrentKind = 'all';
    let topIsLoading = false;
    let topHasMore = true;

    const injectTopStyles = () => {
        if (document.getElementById('ag-animego-top-styles')) return;
        const style = document.createElement('style');
        style.id = 'ag-animego-top-styles';
        style.textContent = `
            /* --- ТОП-100 ПРЕМИУМ ДИЗАЙН ANIMEGO --- */
            .ag-top-header {
                margin-bottom: 24px;
                padding: 20px 24px;
                background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(19, 23, 34, 0.6) 100%);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 16px;
                backdrop-filter: blur(12px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            }
            .ag-top-header h1 {
                font-size: 24px !important;
                font-weight: 800 !important;
                color: #ffffff !important;
                margin: 0 0 6px 0 !important;
                letter-spacing: -0.3px !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
            }
            .ag-top-header p {
                margin: 0 !important;
                font-size: 13px !important;
                color: #94a3b8 !important;
                font-weight: 500 !important;
            }

            .ag-top-filters {
                display: flex !important;
                gap: 8px !important;
                margin-top: 14px !important;
                flex-wrap: wrap !important;
            }
            .ag-filter-btn {
                background: rgba(255, 255, 255, 0.06) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                color: #94a3b8 !important;
                padding: 6px 14px !important;
                border-radius: 8px !important;
                font-size: 12px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                transition: all 0.2s ease !important;
            }
            .ag-filter-btn:hover {
                background: rgba(255, 255, 255, 0.12) !important;
                color: #ffffff !important;
            }
            .ag-filter-btn.active {
                background: linear-gradient(135deg, #ef4444, #b91c1c) !important;
                border-color: #ef4444 !important;
                color: #ffffff !important;
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.35) !important;
            }

            .ag-top-card {
                background: linear-gradient(145deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.6) 100%) !important;
                border: 1px solid rgba(255, 255, 255, 0.07) !important;
                border-radius: 14px !important;
                padding: 14px !important;
                margin-bottom: 14px !important;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
                backdrop-filter: blur(10px) !important;
                position: relative !important;
                overflow: hidden !important;
                cursor: pointer !important;
            }
            .ag-top-card:hover {
                transform: translateY(-3px) !important;
                border-color: rgba(239, 68, 68, 0.4) !important;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.4), 0 0 20px rgba(239, 68, 68, 0.15) !important;
                background: linear-gradient(145deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%) !important;
            }

            .ag-top-poster-wrap {
                position: relative !important;
                flex-shrink: 0 !important;
                width: 110px !important;
                border-radius: 10px !important;
                overflow: hidden !important;
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4) !important;
            }
            .ag-top-poster-img {
                width: 100% !important;
                height: 155px !important;
                object-fit: cover !important;
                display: block !important;
                transition: transform 0.4s ease !important;
                border-radius: 10px !important;
            }
            .ag-top-card:hover .ag-top-poster-img {
                transform: scale(1.06) !important;
            }

            .ag-top-poster-fallback {
                width: 100% !important;
                height: 155px !important;
                background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%) !important;
                border-radius: 10px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                padding: 10px !important;
                text-align: center !important;
                box-sizing: border-box !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
                gap: 6px !important;
            }
            .ag-top-poster-fallback span {
                font-size: 28px !important;
                opacity: 0.8 !important;
            }
            .ag-top-poster-fallback small {
                font-size: 10px !important;
                font-weight: 700 !important;
                color: #94a3b8 !important;
                line-height: 1.2 !important;
                display: -webkit-box !important;
                -webkit-line-clamp: 3 !important;
                -webkit-box-orient: vertical !important;
                overflow: hidden !important;
                word-break: break-word !important;
            }

            .ag-top-badge {
                position: absolute !important;
                top: 6px !important;
                left: 6px !important;
                padding: 3px 8px !important;
                border-radius: 20px !important;
                font-size: 11px !important;
                font-weight: 800 !important;
                color: #fff !important;
                z-index: 2 !important;
                display: flex !important;
                align-items: center !important;
                gap: 3px !important;
                letter-spacing: 0.3px !important;
                backdrop-filter: blur(4px) !important;
            }
            .ag-top-badge-1 {
                background: linear-gradient(135deg, #ffd700, #ff8c00) !important;
                color: #1a1000 !important;
                box-shadow: 0 0 12px rgba(255, 215, 0, 0.7) !important;
                border: 1px solid rgba(255, 255, 255, 0.6) !important;
            }
            .ag-top-badge-2 {
                background: linear-gradient(135deg, #ffffff, #9e9e9e) !important;
                color: #111827 !important;
                box-shadow: 0 0 12px rgba(255, 255, 255, 0.6) !important;
                border: 1px solid rgba(255, 255, 255, 0.8) !important;
            }
            .ag-top-badge-3 {
                background: linear-gradient(135deg, #f97316, #b45309) !important;
                color: #ffffff !important;
                box-shadow: 0 0 12px rgba(249, 115, 22, 0.6) !important;
                border: 1px solid rgba(255, 255, 255, 0.4) !important;
            }
            .ag-top-badge-top10 {
                background: linear-gradient(135deg, #ef4444, #b91c1c) !important;
                box-shadow: 0 0 8px rgba(239, 68, 68, 0.5) !important;
            }
            .ag-top-badge-other {
                background: rgba(15, 23, 42, 0.85) !important;
                border: 1px solid rgba(255, 255, 255, 0.15) !important;
                color: #cbd5e1 !important;
            }

            .ag-top-score-badge {
                position: absolute !important;
                bottom: 6px !important;
                right: 6px !important;
                background: linear-gradient(135deg, #10b981 0%, #047857 100%) !important;
                color: #ffffff !important;
                font-weight: 800 !important;
                font-size: 11px !important;
                padding: 2px 7px !important;
                border-radius: 6px !important;
                box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4) !important;
                display: flex !important;
                align-items: center !important;
                gap: 3px !important;
                z-index: 2 !important;
            }

            .ag-top-card-body {
                margin-left: 16px !important;
                flex: 1 !important;
                min-width: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
            }

            .ag-top-card-title {
                font-size: 17px !important;
                font-weight: 700 !important;
                color: #f8fafc !important;
                margin: 0 0 4px 0 !important;
                line-height: 1.3 !important;
                text-decoration: none !important;
                transition: color 0.2s !important;
            }
            .ag-top-card:hover .ag-top-card-title {
                color: #ef4444 !important;
            }

            .ag-top-card-orig {
                font-size: 12px !important;
                color: #64748b !important;
                margin-bottom: 8px !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
            }

            .ag-top-tags {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                flex-wrap: wrap !important;
                margin-bottom: 8px !important;
            }
            .ag-top-tag {
                background: rgba(255, 255, 255, 0.05) !important;
                border: 1px solid rgba(255, 255, 255, 0.08) !important;
                padding: 2px 8px !important;
                border-radius: 6px !important;
                font-size: 11px !important;
                font-weight: 600 !important;
                color: #94a3b8 !important;
            }

            .ag-top-episodes-info {
                font-size: 12px !important;
                color: #94a3b8 !important;
                line-height: 1.4 !important;
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
            }

            .ag-top-loading-overlay {
                position: absolute !important;
                inset: 0 !important;
                background: rgba(15, 23, 42, 0.85) !important;
                backdrop-filter: blur(6px) !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 20 !important;
                gap: 10px !important;
                color: #ef4444 !important;
                font-weight: 700 !important;
                font-size: 13px !important;
                border-radius: 14px !important;
            }

            .ag-top-overlay-jutsu {
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(88, 28, 135, 0.95) 100%) !important;
                color: #e9d5ff !important;
                border: 1px solid rgba(168, 85, 247, 0.5) !important;
            }

            .ag-load-more-btn {
                display: block !important;
                width: 100% !important;
                padding: 14px !important;
                margin: 24px 0 !important;
                background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(185, 28, 28, 0.1) 100%) !important;
                border: 1px solid rgba(239, 68, 68, 0.3) !important;
                color: #fca5a5 !important;
                text-align: center !important;
                border-radius: 12px !important;
                font-weight: 700 !important;
                font-size: 14px !important;
                cursor: pointer !important;
                transition: all 0.25s ease !important;
                backdrop-filter: blur(8px) !important;
            }
            .ag-load-more-btn:hover {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
                color: #ffffff !important;
                border-color: #ef4444 !important;
                box-shadow: 0 6px 20px rgba(239, 68, 68, 0.35) !important;
                transform: translateY(-2px) !important;
            }

            /* Скрываем нативную кнопку AnimeGO «Загрузить ещё» когда топ активен */
            .ag-top-page-active .button-list-loading,
            .ag-top-page-active [data-ajax-more],
            .ag-top-page-active .load-more {
                display: none !important;
            }

            /* --- СИНТЕТИЧЕСКАЯ СТРАНИЦА АНИМЕ --- */
            .ag-synth-page {
                max-width: 900px;
                margin: 0 auto;
                padding: 24px 0;
                font-family: 'Inter', system-ui, sans-serif;
                animation: agSynthFadeIn 0.35s ease;
            }
            @keyframes agSynthFadeIn {
                from { opacity: 0; transform: translateY(12px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            .ag-synth-back {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                color: #94a3b8;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
                margin-bottom: 20px;
                background: none;
                border: none;
                padding: 0;
                transition: color 0.2s;
                text-decoration: none;
            }
            .ag-synth-back:hover { color: #ef4444; }
            .ag-synth-hero {
                display: flex;
                gap: 28px;
                align-items: flex-start;
                background: linear-gradient(135deg, rgba(30,41,59,0.6) 0%, rgba(15,23,42,0.8) 100%);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 20px;
                padding: 24px;
                backdrop-filter: blur(12px);
                box-shadow: 0 12px 40px rgba(0,0,0,0.4);
            }
            .ag-synth-poster {
                flex-shrink: 0;
                width: 180px;
                border-radius: 14px;
                overflow: hidden;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            }
            .ag-synth-poster img {
                width: 100%;
                display: block;
                border-radius: 14px;
            }
            .ag-synth-poster-fallback {
                width: 180px;
                height: 255px;
                background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%);
                border-radius: 14px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #475569;
                font-size: 48px;
            }
            .ag-synth-info { flex: 1; min-width: 0; }
            .ag-synth-rank {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                background: linear-gradient(135deg, #ef4444, #b91c1c);
                color: #fff;
                font-size: 12px;
                font-weight: 800;
                padding: 3px 10px;
                border-radius: 20px;
                margin-bottom: 10px;
                letter-spacing: 0.3px;
            }
            .ag-synth-title {
                font-size: 26px;
                font-weight: 800;
                color: #f8fafc;
                margin: 0 0 4px 0;
                line-height: 1.2;
            }
            .ag-synth-orig {
                font-size: 13px;
                color: #64748b;
                margin-bottom: 14px;
            }
            .ag-synth-tags {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 16px;
            }
            .ag-synth-tag {
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                padding: 3px 10px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                color: #94a3b8;
            }
            .ag-synth-score {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: linear-gradient(135deg, #10b981, #047857);
                color: #fff;
                font-weight: 800;
                font-size: 15px;
                padding: 5px 14px;
                border-radius: 10px;
                margin-bottom: 18px;
                box-shadow: 0 4px 12px rgba(16,185,129,0.35);
            }
            .ag-synth-notice {
                background: rgba(239,68,68,0.1);
                border: 1px solid rgba(239,68,68,0.25);
                border-radius: 12px;
                padding: 12px 16px;
                font-size: 13px;
                color: #fca5a5;
                margin-bottom: 18px;
                line-height: 1.5;
            }
            .ag-synth-watch-btn {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                background: linear-gradient(135deg, #7c3aed, #5b21b6);
                color: #fff;
                font-weight: 800;
                font-size: 15px;
                padding: 12px 28px;
                border-radius: 12px;
                border: none;
                cursor: pointer;
                transition: all 0.25s ease;
                box-shadow: 0 6px 20px rgba(124,58,237,0.4);
                text-decoration: none;
            }
            .ag-synth-watch-btn:hover {
                background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                transform: translateY(-2px);
                box-shadow: 0 10px 28px rgba(124,58,237,0.55);
                color: #fff;
            }
            .ag-synth-watch-btn.ag-synth-loading {
                opacity: 0.7;
                cursor: wait;
            }
            .ag-synth-search-btn {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.12);
                color: #94a3b8;
                font-size: 13px;
                font-weight: 600;
                padding: 10px 20px;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s;
                margin-left: 12px;
                text-decoration: none;
            }
            .ag-synth-search-btn:hover {
                background: rgba(255,255,255,0.1);
                color: #fff;
            }
        `;
        document.head.appendChild(style);
    };

    const renderSpinner = () => {
        return `<div class="ag-spinner-container g-col-12"><div class="spinner-border text-danger" role="status"><span class="visually-hidden">Загрузка...</span></div></div>`;
    };

    const getRankBadgeHTML = (rank) => {
        if (rank === 1) return `<div class="ag-top-badge ag-top-badge-1">👑 #1</div>`;
        if (rank === 2) return `<div class="ag-top-badge ag-top-badge-2">🥈 #2</div>`;
        if (rank === 3) return `<div class="ag-top-badge ag-top-badge-3">🥉 #3</div>`;
        if (rank <= 10) return `<div class="ag-top-badge ag-top-badge-top10">#${rank}</div>`;
        return `<div class="ag-top-badge ag-top-badge-other">#${rank}</div>`;
    };

    const fetchFallbackCover = async (item) => {
        if (!item) return null;
        try {
            const searchResponse = await new Promise((resolve) => {
                try {
                    chrome.runtime.sendMessage({
                        action: "resolve_jutsu_cover",
                        id: item.id,
                        russian: item.russian || item.title_ru || item.title,
                        name: item.name || item.title_english
                    }, (response) => {
                        if (chrome.runtime.lastError) resolve(null);
                        else resolve(response);
                    });
                } catch (err) {
                    resolve(null);
                }
            });
            return searchResponse ? (searchResponse.poster || searchResponse.url) : null;
        } catch (e) {
            console.error("Error fetching fallback cover:", e);
        }
        return null;
    };

    const getPosterUrl = (anime) => {
        if (anime.ag_resolved_poster) {
            return anime.ag_resolved_poster;
        }
        let rawUrl = '';
        if (anime.image) {
            rawUrl = anime.image.original || anime.image.preview || anime.image.x96 || '';
        } else if (anime.images?.jpg?.large_image_url) {
            rawUrl = anime.images.jpg.large_image_url;
        } else if (anime.images?.webp?.large_image_url) {
            rawUrl = anime.images.webp.large_image_url;
        }

        if (window.agNormalizePosterUrl) {
            return window.agNormalizePosterUrl(rawUrl);
        }

        if (!rawUrl || rawUrl.includes('missing') || rawUrl.includes('404') || rawUrl.includes('no-poster')) {
            return null;
        }

        if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
            return rawUrl;
        }

        return `https://shikimori.one${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    };

    const renderAnimeCard = (anime, rank) => {
        const title = anime.russian || anime.title_ru || anime.title;
        const origTitle = anime.name || anime.title_english || anime.title_japanese || '';
        const score = anime.score || '?';
        const posterUrl = getPosterUrl(anime);
        const safeTitle = (title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeRu = (anime.russian || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeEn = (anime.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const posterHTML = posterUrl 
            ? `<img class="ag-top-poster-img" src="${posterUrl}" alt="${title}" loading="lazy" onerror="if(window.agHandlePosterError) window.agHandlePosterError(this, '${safeTitle}', ${anime.id || 'null'}, '${safeRu}', '${safeEn}'); else this.outerHTML='<div class=\\'ag-top-poster-fallback\\'><span>🎬</span><small>${safeTitle}</small></div>';">`
            : `<div class="ag-top-poster-fallback"><span>🎬</span><small>${title}</small></div>`;

        const type = anime.kind === 'tv' ? 'Сериал' : anime.kind === 'movie' ? 'Фильм' : (anime.type === 'TV' ? 'Сериал' : anime.type || 'Аниме');
        const year = anime.aired_on ? anime.aired_on.split('-')[0] : (anime.year || '');
        const episodes = anime.episodes ? `${anime.episodes} эп.` : '';
        const status = anime.status === 'released' ? 'Вышло' : anime.status === 'ongoing' ? 'Онгоинг' : (anime.status || '');
        
        const queryTitle = (anime.russian || anime.title_ru || anime.name || anime.title_english || anime.title || '').split('/')[0].split('[')[0].trim();
        const fallbackSearchUrl = `/search/all?q=${encodeURIComponent(queryTitle)}`;

        return `
            <div class="ag-top-card d-flex g-col-12" data-query="${queryTitle}" data-orig="${origTitle.replace(/"/g, '&quot;')}" data-year="${year}" data-rank="${rank}" data-kind="${topCurrentKind}">
                <div class="ag-top-poster-wrap">
                    ${getRankBadgeHTML(rank)}
                    <div class="ag-top-score-badge">★ ${score}</div>
                    <a class="d-block ag-top-link" href="${fallbackSearchUrl}" data-query="${queryTitle}" data-year="${year}" data-rank="${rank}" data-kind="${topCurrentKind}">
                        ${posterHTML}
                    </a>
                </div>
                <div class="ag-top-card-body">
                    <div>
                        <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                            <a class="ag-top-card-title ag-top-link" title="${title}" href="${fallbackSearchUrl}" data-query="${queryTitle}" data-year="${year}" data-rank="${rank}" data-kind="${topCurrentKind}">${title}</a>
                        </div>
                        <div class="ag-top-card-orig">${origTitle}</div>
                        <div class="ag-top-tags">
                            <span class="ag-top-tag">${type}</span>
                            ${year ? `<span class="ag-top-tag">${year}</span>` : ''}
                            ${episodes ? `<span class="ag-top-tag">${episodes}</span>` : ''}
                            ${status ? `<span class="ag-top-tag">${status}</span>` : ''}
                        </div>
                    </div>
                    <div class="ag-top-episodes-info">
                        <span>▶ Кликните для быстрого перехода к просмотру на AnimeGO</span>
                    </div>
                </div>
            </div>
        `;
    };

    const fetchTopData = async (kind) => {
        try {
            let kindParam = '';
            if (kind && kind !== 'all') {
                kindParam = `&kind=${kind}`;
            }

            const p1 = new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: "fetch_shikimori",
                    url: `https://shikimori.one/api/animes?limit=50&order=ranked&page=1${kindParam}`
                }, resolve);
            });

            const p2 = new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    action: "fetch_shikimori",
                    url: `https://shikimori.one/api/animes?limit=50&order=ranked&page=2${kindParam}`
                }, resolve);
            });

            const [shikiRes1, shikiRes2] = await Promise.all([p1, p2]);
            const data1 = (shikiRes1 && shikiRes1.data && Array.isArray(shikiRes1.data)) ? shikiRes1.data : [];
            const data2 = (shikiRes2 && shikiRes2.data && Array.isArray(shikiRes2.data)) ? shikiRes2.data : [];

            return [...data1, ...data2];
        } catch (e) {
            console.error("AnimeGO+ Top Error", e);
            return [];
        }
    };

    const getSeasonNumber = (str) => {
        const matchSeason = str.match(/(\d+)\s*сезон/i) || str.match(/(\d+)\s*season/i);
        if (matchSeason) return parseInt(matchSeason[1]);
        
        const matchTv = str.match(/тв-?(\d+)\b/i) || str.match(/tv-?(\d+)\b/i);
        if (matchTv) return parseInt(matchTv[1]);
        
        const romanMap = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
        const words = str.split(/[^a-z0-9]/i);
        for (let i = words.length - 1; i >= 0; i--) {
            const w = words[i].toLowerCase();
            if (romanMap[w] !== undefined) {
                return romanMap[w];
            }
        }
        
        const matchDigit = str.match(/\b(\d+)\b/);
        if (matchDigit) return parseInt(matchDigit[1]);
        
        return 1;
    };

    const findBestAnimeMatch = (doc, queryTitle) => {
        const normalize = (str) => (str || '').toLowerCase().replace(/[^\w\u0400-\u04FF0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const targetNorm = normalize(queryTitle);
        
        const candidates = Array.from(doc.querySelectorAll('a[href*="/anime/"]')).filter(a => {
            const href = a.getAttribute('href') || '';
            return href !== '/anime' && !href.includes('/random') && !href.includes('/status/') && !href.includes('/season/') && !href.includes('/catalog');
        });

        if (candidates.length === 0) return null;

        let bestCandidate = null;
        let bestScore = -1;

        const targetWords = targetNorm.split(' ').filter(w => w.length >= 2);

        for (const cand of candidates) {
            const textNorm = normalize(cand.innerText || cand.getAttribute('title') || cand.textContent || '');
            if (!textNorm) continue;

            const candWords = textNorm.split(' ').filter(w => w.length >= 2);
            if (candWords.length === 0) continue;

            let score = 0;

            if (textNorm === targetNorm) {
                score = 100;
            } else {
                const targetMatchesInCand = targetWords.filter(w => candWords.includes(w)).length;
                const targetMatchRatio = targetWords.length > 0 ? (targetMatchesInCand / targetWords.length) : 0;

                const candMatchesInTarget = candWords.filter(w => targetWords.includes(w)).length;
                const candMatchRatio = candWords.length > 0 ? (candMatchesInTarget / candWords.length) : 0;

                const combinedRatio = (targetMatchRatio + candMatchRatio) / 2;
                score = combinedRatio * 90;
            }

            if (score > bestScore) {
                bestScore = score;
                bestCandidate = cand;
            }
        }

        if (bestScore < 75) {
            return null;
        }

        return bestCandidate;
    };

    const findJutsuDirectUrl = async (queryTitle, origTitle = '', targetYear = '') => {
        return new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({
                    action: "search_jutsu_direct",
                    queryTitle,
                    origTitle,
                    targetYear
                }, (response) => {
                    if (chrome.runtime.lastError || !response) {
                        resolve(null);
                    } else {
                        resolve(response.url || null);
                    }
                });
            } catch (e) {
                resolve(null);
            }
        });
    };

    const loadTopPage = async (container) => {
        if (topIsLoading) return;
        topIsLoading = true;

        injectTopStyles();

        const titleEl = document.querySelector('.entity__title h1') || document.querySelector('.entity__title');
        if (titleEl) {
            titleEl.innerHTML = `
                <div class="ag-top-header">
                    <h1>🏆 Топ-100 Аниме по версии Shikimori</h1>
                    <p>Самые высокооценённые тайтлы по мнению мирового сообщества</p>
                    <div class="ag-top-filters" id="ag-top-filters">
                        <button class="ag-filter-btn ${!topCurrentKind || topCurrentKind === 'all' ? 'active' : ''}" data-kind="all">Все аниме</button>
                        <button class="ag-filter-btn ${topCurrentKind === 'tv' ? 'active' : ''}" data-kind="tv">Сериалы</button>
                        <button class="ag-filter-btn ${topCurrentKind === 'movie' ? 'active' : ''}" data-kind="movie">Фильмы</button>
                        <button class="ag-filter-btn ${topCurrentKind === 'ova' ? 'active' : ''}" data-kind="ova">OVA</button>
                        <button class="ag-filter-btn ${topCurrentKind === 'ona' ? 'active' : ''}" data-kind="ona">ONA</button>
                        <button class="ag-filter-btn ${topCurrentKind === 'special' ? 'active' : ''}" data-kind="special">Спешлы</button>
                    </div>
                </div>
            `;

            document.querySelectorAll('#ag-top-filters .ag-filter-btn').forEach(btn => {
                btn.onclick = (e) => {
                    e.preventDefault();
                    const newKind = btn.getAttribute('data-kind');
                    if (topCurrentKind !== newKind) {
                        topCurrentKind = newKind;
                        loadTopPage(container);
                    }
                };
            });
        }
        
        document.querySelectorAll('.sorter, .catalog-small-description, .button-list-loading, .entity__navigation').forEach(el => el.style.display = 'none');
        container.innerHTML = renderSpinner();
        document.body.classList.add('ag-top-page-active');

        const items = await fetchTopData(topCurrentKind);
        const spinner = container.querySelector('.ag-spinner-container');
        if (spinner) spinner.remove();
        const oldBtn = document.getElementById('ag-load-more');
        if (oldBtn) oldBtn.remove();

        // Фоновая подгрузка обложек без блокировки интерфейса
        items.forEach(async (item) => {
            let pUrl = getPosterUrl(item);
            const isPlaceholder = !pUrl || pUrl.includes('/assets/') || pUrl.includes('missing') || pUrl.includes('404');
            if (isPlaceholder) {
                const realUrl = await fetchFallbackCover(item);
                if (realUrl) {
                    item.ag_resolved_poster = realUrl;
                    const queryTitle = (item.russian || item.title_ru || item.name || item.title_english || item.title || '').split('/')[0].split('[')[0].trim();
                    const card = container.querySelector(`.ag-top-card[data-query="${queryTitle}"]`);
                    if (card) {
                        const wrap = card.querySelector('.ag-top-poster-wrap a.ag-top-link');
                        if (wrap) {
                            wrap.innerHTML = `<img class="ag-top-poster-img" src="${realUrl}" alt="${item.russian || item.name}" loading="lazy">`;
                        }
                    }
                }
            }
        });

        items.forEach((item, idx) => {
            const rank = idx + 1;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderAnimeCard(item, rank);
            const cardEl = tempDiv.firstElementChild;
            container.appendChild(cardEl);

            cardEl.addEventListener('click', async (e) => {
                e.preventDefault();
                if (cardEl.querySelector('.ag-top-loading-overlay')) return;

                const overlay = document.createElement('div');
                overlay.className = 'ag-top-loading-overlay';
                overlay.innerHTML = `
                    <div class="spinner-border text-danger" style="width: 2rem; height: 2rem;" role="status"></div>
                    <span>Ищем на AnimeGO...</span>
                `;
                cardEl.appendChild(overlay);

                const safetyTimer = setTimeout(() => {
                    if (overlay.parentNode) overlay.remove();
                }, 7000);

                const query = cardEl.getAttribute('data-query');

                // Открыть полноценную синтетическую страницу аниме (обрабатывает ag-synthetic.js)
                const openSyntheticPage = () => {
                    clearTimeout(safetyTimer);
                    if (overlay.parentNode) overlay.remove();
                    window.location.href = `/anime/shiki-${item.id}`;
                };

                try {
                    const searchRes = await fetch(`/search/all?q=${encodeURIComponent(query)}`);
                    const text = await searchRes.text();
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');
                    
                    const bestResult = findBestAnimeMatch(doc, query);
                    
                    if (bestResult && bestResult.href && bestResult.href.includes('/anime/') && bestResult.getAttribute('href') !== '/anime') {
                        clearTimeout(safetyTimer);
                        if (overlay.parentNode) overlay.remove();
                        window.location.href = bestResult.href;
                    } else {
                        openSyntheticPage();
                    }
                } catch (err) {
                    openSyntheticPage();
                }
            });
        });

        if (items.length > 0) {
            const msg = document.createElement('div');
            msg.className = 'text-center text-secondary my-4 g-col-12';
            msg.style.gridColumn = '1 / -1';
            msg.innerText = 'Это весь Топ-100!';
            container.appendChild(msg);
        }

        topIsLoading = false;
    };

    const handleNavigation = (urlPath) => {
        if (urlPath === '/top-shikimori') {
            topCurrentKind = topCurrentKind || 'all';
            topCurrentPage = 1;

            let container = document.getElementById('content-container') || document.querySelector('.content-container') || document.querySelector('.ani-list');
            if (!container) {
                window.location.replace('/anime?show_ag_top=shikimori');
                return true;
            }

            if (container) {
                document.body.classList.add('ag-top-active');
                loadTopPage(container, false);
                return true;
            }
        }
        
        document.body.classList.remove('ag-top-active');
        document.body.classList.remove('ag-top-page-active');
        return false;
    };

    const injectTopButtons = () => {
        if (document.querySelector('a[href="/top-shikimori"]')) return;

        const anchorLink = document.querySelector('a[href*="/anime/random"]')
            || document.querySelector('a[href*="random"]')
            || document.querySelector('a[href="/anime"]')
            || document.querySelector('a[href*="/ongoing"]')
            || document.querySelector('.navbar-nav a');

        if (anchorLink) {
            const parentLi = anchorLink.closest('li');
            if (parentLi && parentLi.parentElement) {
                const topLi = document.createElement('li');
                topLi.className = parentLi.className ? `${parentLi.className} ag-top-injected` : 'nav-item ag-top-injected';
                const linkClass = anchorLink.className || 'nav-link';
                topLi.innerHTML = `<a class="${linkClass}" href="/top-shikimori">Топ Shikimori</a>`;
                parentLi.parentElement.appendChild(topLi);
            } else if (anchorLink.parentElement) {
                const topA = document.createElement('a');
                topA.className = `${anchorLink.className || 'nav-link'} ag-top-injected`;
                topA.href = '/top-shikimori';
                topA.textContent = 'Топ Shikimori';
                anchorLink.parentElement.appendChild(topA);
            }
        } else {
            const desktopMenu = document.querySelector('.navbar-nav.header-navbar-nav.text-nowrap.flex-grow-1')
                || document.querySelector('.navbar-nav.header-navbar-nav')
                || document.querySelector('.header-navbar-nav')
                || document.querySelector('.navbar-nav')
                || document.querySelector('header .navbar-nav')
                || document.querySelector('header nav');

            if (desktopMenu) {
                const li = document.createElement('li');
                li.className = 'nav-item ag-top-injected';
                li.innerHTML = `<a class="nav-link" href="/top-shikimori">Топ Shikimori</a>`;
                desktopMenu.appendChild(li);
            }
        }

        const mobileMenu1 = document.querySelector('#mmenu .nav.flex-column');
        if (mobileMenu1 && !mobileMenu1.querySelector('a[href="/top-shikimori"]')) {
             mobileMenu1.insertAdjacentHTML('beforeend', `
                <a class="nav-link fw-semibold text-reset fs-5 ag-top-injected" href="/top-shikimori">Топ Shikimori</a>
             `);
        }

        const mobileMenu2 = document.querySelector('#mmenu nav.nav.flex-column:not(:first-of-type)');
        if (mobileMenu2 && !mobileMenu2.querySelector('a[href="/top-shikimori"]')) {
             mobileMenu2.insertAdjacentHTML('beforeend', `
                <a class="nav-link text-reset fs-5 ag-top-injected" href="/top-shikimori">Топ Shikimori</a>
             `);
        }

        if (!window.agTopClickListenerBound) {
            window.agTopClickListenerBound = true;
            document.body.addEventListener('click', (e) => {
                const link = e.target.closest('a[href="/top-shikimori"]');
                if (link) {
                    e.preventDefault();
                    const path = link.getAttribute('href');
                    if (window.location.pathname !== path) {
                        if (handleNavigation(path)) {
                            history.pushState(null, '', path);
                        } else {
                            window.location.href = path;
                            return;
                        }

                        const closeBtn = document.querySelector('#mmenu .btn-close');
                        if (closeBtn && document.getElementById('mmenu').classList.contains('show')) {
                            closeBtn.click();
                        }
                    }
                }
            });
        }
    };

    window.agInjectTopButtons = injectTopButtons;

    window.agInitTopPageEnhancer = function () {
        injectTopButtons();

        window.addEventListener('popstate', () => {
            if (!handleNavigation(window.location.pathname)) {
                window.location.reload(); 
            }
        });

        const urlParams = new URLSearchParams(window.location.search);
        const showTopParams = urlParams.get('show_ag_top');
        if (showTopParams) {
            history.replaceState(null, '', '/top-shikimori');
            handleNavigation('/top-shikimori');
        } else {
            handleNavigation(window.location.pathname);
        }

        window.addEventListener('pageshow', () => {
            document.querySelectorAll('.ag-top-loading-overlay').forEach(el => el.remove());
        });

        if (window.location.pathname === '/top-shikimori') {
            const errorBlocks = document.querySelectorAll('.error-page, .alert-danger');
            errorBlocks.forEach(el => el.style.display = 'none');
        }
    };
})();
