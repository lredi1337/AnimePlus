// modules/ui-utils.js
// Общие DOM-хелперы, тоасты и утилиты интерфейса Anime+

(function () {
    'use strict';

    window.AG_RED = "#ef4444";

    // Санитайзер для стороннего HTML (описания Shikimori — пользовательский контент).
    // Разбор в инертном документе DOMParser: ни скрипты, ни onerror там не выполняются.
    // Оставляем только безопасные теги; атрибуты — только href (http/https) у ссылок.
    const SAFE_TAGS = new Set(['A', 'B', 'I', 'EM', 'STRONG', 'BR', 'P', 'SPAN', 'DIV', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SMALL']);
    window.agSanitizeHtml = function (html) {
        if (!html) return '';
        const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
        const root = doc.body.firstElementChild;
        const walk = (node) => {
            Array.from(node.children).forEach(el => {
                // У элементов SVG/MathML tagName в нижнем регистре
                const tag = el.tagName.toUpperCase();
                if (!SAFE_TAGS.has(tag)) {
                    // Неизвестный тег: удаляем целиком опасные, у остальных сохраняем текст
                    if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|SVG|MATH|TEMPLATE|NOSCRIPT|FORM|INPUT|LINK|META)$/.test(tag)) {
                        el.remove();
                    } else {
                        walk(el);
                        el.replaceWith(...el.childNodes);
                    }
                    return;
                }
                const href = tag === 'A' ? el.getAttribute('href') : null;
                Array.from(el.attributes).forEach(a => el.removeAttribute(a.name));
                if (href) {
                    try {
                        const url = new URL(href, 'https://shikimori.io');
                        if (url.protocol === 'https:' || url.protocol === 'http:') {
                            el.setAttribute('href', url.href);
                            el.setAttribute('target', '_blank');
                            el.setAttribute('rel', 'noopener noreferrer');
                        }
                    } catch (e) {}
                }
                walk(el);
            });
        };
        walk(root);
        return root.innerHTML;
    };

    window.ensureAgLogoPlus = function (targetRoot) {
        const root = targetRoot || document;
        const brandLink = root.querySelector('.header-navbar__brand, .navbar-brand, a[href="/"].navbar-brand');
        if (brandLink && !brandLink.querySelector('#ag-logo-plus')) {
            const plusSpan = document.createElement('span');
            plusSpan.id = 'ag-logo-plus';
            plusSpan.innerText = '+';
            plusSpan.style.cssText = `color: ${window.AG_RED}; font-weight: 700; font-size: 30px; line-height: 0.8; margin-left: 2px; padding-bottom: 2px; font-family: var(--ap-font); display: inline-block;`;
            brandLink.appendChild(plusSpan);
            brandLink.style.display = 'inline-flex';
            brandLink.style.alignItems = 'center';
        }
    };

    window.showAgToast = function (text, duration = 3000, isError = false) {
        let toastContainer = document.getElementById('ag-toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'ag-toast-container';
            toastContainer.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                gap: 8px;
                pointer-events: none;
            `;
            (document.body || document.documentElement).appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.style.cssText = `
            background: var(--ap-raised);
            color: ${isError ? 'var(--ap-danger)' : 'var(--ap-text)'};
            padding: 10px 14px;
            border-radius: var(--ap-radius);
            font-family: var(--ap-font);
            font-size: var(--ap-fs-md);
            font-weight: 500;
            box-shadow: var(--ap-shadow);
            border: 1px solid var(--ap-line-strong);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            opacity: 0;
            transform: translateY(12px) scale(0.95);
            pointer-events: auto;
        `;
        toast.textContent = text;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0) scale(1)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px) scale(0.95)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    };

    // ==========================================
    // --- ПОСТЕРЫ: ЦЕПОЧКА ФОЛБЭКОВ ---
    // ==========================================
    // 1) постер из данных Shikimori → 2) GraphQL Shikimori (REST часто отдаёт заглушку «лису»
    //    /assets/globals/missing_*.jpg, которая грузится без ошибки) → 3) Kitsu / og:image Jut-Su
    //    (resolve_jutsu_cover) → 4) значок расширения.
    // Обработчики вешаются через addEventListener: inline onerror="" из content-скрипта выполняется
    // в мире страницы, где функций расширения нет, а в popup inline-обработчики запрещены CSP.

    const PLACEHOLDER_POSTER = chrome.runtime.getURL('icons/icon128.png');

    window.agIsPlaceholderPoster = function (url) {
        if (!url || typeof url !== 'string') return true;
        return url === PLACEHOLDER_POSTER || url.endsWith('/icons/icon128.png') || /\/assets\/globals\/|missing_|\/missing\b|no-poster|no-image|stub/i.test(url);
    };

    window.agNormalizePosterUrl = function (rawUrl) {
        if (window.agIsPlaceholderPoster(rawUrl)) return PLACEHOLDER_POSTER;
        let url = rawUrl.trim();
        if (url.startsWith('//')) return 'https:' + url;
        if (url.includes('/system/animes/') || url.includes('/uploads/poster/')) {
            const idx = url.search(/\/(system\/animes|uploads\/poster)\//);
            return 'https://shikimori.io' + url.substring(idx);
        }
        if (!/^(https?|chrome-extension):\/\//.test(url)) {
            return `https://shikimori.io${url.startsWith('/') ? '' : '/'}${url}`;
        }
        return url.replace(/^https:\/\/(desu\.)?shikimori\.(one|me|org)\//, 'https://shikimori.io/');
    };

    // Пакетные запросы постеров в GraphQL: карточки Топа запрашивают их одним сообщением
    const posterMemo = new Map();
    let posterQueue = new Map();
    let posterTimer = null;
    const requestShikiPoster = (id) => {
        const key = parseInt(id, 10);
        if (!key) return Promise.resolve(null);
        if (posterMemo.has(key)) return posterMemo.get(key);
        const promise = new Promise((resolve) => {
            posterQueue.set(key, resolve);
            if (posterTimer) return;
            posterTimer = setTimeout(async () => {
                const batch = posterQueue;
                posterQueue = new Map();
                posterTimer = null;
                const res = await window.agSendMessage({ action: 'resolve_shiki_posters', ids: [...batch.keys()] });
                const posters = (res && res.posters) || {};
                batch.forEach((done, batchId) => done(posters[batchId] || null));
            }, 40);
        });
        posterMemo.set(key, promise);
        return promise;
    };

    // native — уже известная обложка с самого сайта (например, кэш Jut-Su), идёт после Shikimori
    window.agBindPoster = function (img, { id = null, ru = '', en = '', native = '' } = {}) {
        if (!img) return null;
        if (img._agPosterAdvance) return img._agPosterAdvance;
        img.dataset.agPosterBound = '1';
        img.referrerPolicy = 'no-referrer';

        // Только адреса, которые реально не загрузились. Рабочий текущий постер цепочка не заменяет
        const failed = new Set();
        const steps = [
            () => requestShikiPoster(id),
            async () => native || null,
            async () => {
                if (!id && !ru && !en) return null;
                const r = await window.agSendMessage({ action: 'resolve_jutsu_cover', id, russian: ru, name: en });
                return r ? (r.poster || r.url) : null;
            }
        ];
        let stepIdx = 0;
        let running = false;

        const currentIsUsable = () => {
            const cur = img.getAttribute('src') || '';
            return cur && !window.agIsPlaceholderPoster(cur) && !failed.has(img.src);
        };

        const advance = async () => {
            if (running) return;
            running = true;
            try {
                while (stepIdx < steps.length) {
                    let url = null;
                    try { url = await steps[stepIdx++](); } catch (e) {}
                    if (url) url = window.agNormalizePosterUrl(url);
                    if (!url || window.agIsPlaceholderPoster(url) || failed.has(url)) continue;
                    if (url === img.src && currentIsUsable()) return; // уже показан этот же постер
                    img.classList.remove('ag-poster-placeholder');
                    img.src = url;
                    return;
                }
                if (currentIsUsable()) return;
                img.classList.add('ag-poster-placeholder');
                if (img.src !== PLACEHOLDER_POSTER) img.src = PLACEHOLDER_POSTER;
            } finally {
                running = false;
            }
        };
        img._agPosterAdvance = advance;

        img.addEventListener('error', () => {
            if (img.src === PLACEHOLDER_POSTER) return;
            failed.add(img.src);
            advance();
        });

        const current = img.getAttribute('src') || '';
        // Картинка в документе из DOMParser не загружается вовсе — её состояние ничего не говорит об ошибке
        const isLive = img.isConnected && img.ownerDocument === document;
        if (window.agIsPlaceholderPoster(current)) {
            advance();
        } else if (isLive && img.complete && img.naturalWidth === 0) {
            // Картинка упала ещё до привязки обработчика
            failed.add(img.src);
            advance();
        }
        return advance;
    };

    // Привязывает все <img data-ag-poster-id / data-ag-poster-ru> внутри root
    window.agBindPostersIn = function (root = document) {
        root.querySelectorAll('img[data-ag-poster-id]:not([data-ag-poster-bound]), img[data-ag-poster-ru]:not([data-ag-poster-bound])').forEach(img => {
            window.agBindPoster(img, {
                id: img.dataset.agPosterId || null,
                ru: img.dataset.agPosterRu || '',
                en: img.dataset.agPosterEn || '',
                native: img.dataset.agPosterNative || ''
            });
        });
    };

    // ==========================================
    // --- ЖИЗНЕННЫЙ ЦИКЛ DOM / SPA ---
    // ==========================================

    // Первый элемент, найденный по цепочке селекторов (от нового DOM к старому)
    window.agQueryFirst = function (selectors, root = document) {
        for (const sel of selectors) {
            try {
                const el = root.querySelector(sel);
                if (el) return el;
            } catch (e) {}
        }
        return null;
    };

    // Ожидание появления элемента. Возвращает Promise<Element|null>, observer всегда отключается
    window.agWaitForElement = function (selectors, { root = document, timeout = 15000 } = {}) {
        const list = Array.isArray(selectors) ? selectors : [selectors];
        const found = window.agQueryFirst(list, root);
        if (found) return Promise.resolve(found);

        return new Promise((resolve) => {
            let timer = null;
            const observer = new MutationObserver(() => {
                const el = window.agQueryFirst(list, root);
                if (el) finish(el);
            });
            const finish = (el) => {
                observer.disconnect();
                clearTimeout(timer);
                resolve(el);
            };
            observer.observe(root === document ? document.documentElement : root, { childList: true, subtree: true });
            if (timeout > 0) timer = setTimeout(() => finish(null), timeout);
        });
    };

    // После обновления/перезагрузки расширения старые content-скрипты остаются на открытых вкладках,
    // но любой вызов chrome.* бросает «Extension context invalidated». Такие скрипты должны затихнуть
    window.agIsContextValid = function () {
        try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
    };

    const domObserverTeardowns = new Set();
    const teardownOrphanedScript = () => {
        domObserverTeardowns.forEach(fn => { try { fn(); } catch (e) {} });
        domObserverTeardowns.clear();
    };

    // MutationObserver с объединением мутаций (не чаще раза в `wait` мс).
    // Отключается сам, если контекст расширения стал невалидным
    window.agObserveDom = function (callback, { root = document.body, wait = 150 } = {}) {
        let timer = null;
        const observer = new MutationObserver(() => {
            if (timer) return;
            timer = setTimeout(() => {
                timer = null;
                if (!window.agIsContextValid()) return teardownOrphanedScript();
                try { callback(); } catch (e) { console.error('[Anime+] DOM observer callback error:', e); }
            }, wait);
        });
        observer.observe(root, { childList: true, subtree: true });
        const teardown = () => { observer.disconnect(); clearTimeout(timer); domObserverTeardowns.delete(teardown); };
        domObserverTeardowns.add(teardown);
        return teardown;
    };

    // Смена URL без перезагрузки (pushState сайта не виден из изолированного мира,
    // поэтому используем Navigation API + popstate + страховочный опрос)
    const urlListeners = new Set();
    let lastHref = location.href;
    const checkUrl = () => {
        if (location.href === lastHref) return;
        const prev = lastHref;
        lastHref = location.href;
        urlListeners.forEach(fn => { try { fn(location.href, prev); } catch (e) {} });
    };
    let urlWatchStarted = false;
    const startUrlWatch = () => {
        if (urlWatchStarted) return;
        urlWatchStarted = true;
        lastHref = location.href;
        if (window.navigation && typeof window.navigation.addEventListener === 'function') {
            window.navigation.addEventListener('navigatesuccess', checkUrl);
        }
        window.addEventListener('popstate', checkUrl);
        window.addEventListener('hashchange', checkUrl);
        setInterval(checkUrl, 1000);
    };

    // Сейчас оба сайта перезагружают страницу при переходах (Turbo Drive на AnimeGO выключен),
    // поэтому наблюдение запускается только при первой подписке
    window.agOnUrlChange = function (fn) {
        startUrlWatch();
        urlListeners.add(fn);
        return () => urlListeners.delete(fn);
    };

    // Промис-обёртка над chrome.runtime.sendMessage, не падает при перезагрузке расширения
    window.agSendMessage = function (message) {
        return new Promise((resolve) => {
            if (!window.agIsContextValid()) {
                teardownOrphanedScript();
                resolve(null);
                return;
            }
            try {
                chrome.runtime.sendMessage(message, (res) => {
                    if (chrome.runtime.lastError) resolve(null);
                    else resolve(res);
                });
            } catch (e) {
                resolve(null);
            }
        });
    };


})();

