// modules/ui-utils.js
// Общие DOM-хелперы, тоасты и утилиты интерфейса Anime+

(function () {
    'use strict';

    window.AG_RED = "#ff4a4a";
    window.AG_FONT = '"Ubuntu", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

    window.agEscapeHtml = function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    window.ensureAgLogoPlus = function (targetRoot) {
        const root = targetRoot || document;
        const brandLink = root.querySelector('.header-navbar__brand, .navbar-brand, a[href="/"].navbar-brand');
        if (brandLink && !brandLink.querySelector('#ag-logo-plus')) {
            const plusSpan = document.createElement('span');
            plusSpan.id = 'ag-logo-plus';
            plusSpan.innerText = '+';
            plusSpan.style.cssText = `color: ${window.AG_RED}; font-weight: 900; font-size: 32px; line-height: 0.8; margin-left: 2px; padding-bottom: 2px; font-family: 'Nunito', 'Segoe UI', sans-serif; display: inline-block;`;
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
            background: ${isError ? 'rgba(239, 68, 68, 0.95)' : 'rgba(15, 23, 42, 0.95)'};
            color: #ffffff;
            padding: 10px 16px;
            border-radius: 8px;
            font-family: ${window.AG_FONT};
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 8px 24px rgba(0,0,0,0.4);
            border: 1px solid rgba(255,255,255,0.1);
            backdrop-filter: blur(8px);
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

    window.agNormalizePosterUrl = function (rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return null;
        let url = rawUrl.trim();
        if (!url || url.includes('missing') || url.includes('404') || url.includes('no-poster') || url.includes('no-image') || url.includes('stub')) {
            return null;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = `https://shikimori.one${url.startsWith('/') ? '' : '/'}${url}`;
        }

        if (url.includes('desu.shikimori.one') || url.includes('moe.shikimori.one')) {
            return url;
        }

        return url;
    };

    window.agHandlePosterError = function (img, altTitle = '', shikiId = null, ruTitle = '', enTitle = '') {
        if (!img) return;
        const step = parseInt(img.dataset.agErrorHandled || '0') + 1;
        img.dataset.agErrorHandled = step.toString();

        if (step > 3) {
            const title = altTitle || ruTitle || enTitle || 'Аниме';
            const safeTitle = window.agEscapeHtml(title);
            img.outerHTML = `<div class="ag-top-poster-fallback"><span>🎬</span><small>${safeTitle}</small></div>`;
            return;
        }

        let curSrc = img.src || '';

        if (step === 1) {
            if (curSrc.includes('shikimori.one')) {
                img.src = curSrc.replace('shikimori.one', 'shikimori.me');
                return;
            } else if (curSrc.includes('shikimori.io')) {
                img.src = curSrc.replace('shikimori.io', 'shikimori.one');
                return;
            }
        }

        if (step === 2) {
            if (!curSrc.includes('shikimori.io')) {
                img.src = curSrc.replace(/shikimori\.(one|me)/, 'shikimori.io');
                return;
            }
        }

        if (step === 3 && (shikiId || ruTitle || enTitle)) {
            try {
                chrome.runtime.sendMessage({
                    action: "resolve_jutsu_cover",
                    id: shikiId,
                    russian: ruTitle || altTitle,
                    name: enTitle
                }, (response) => {
                    const fallbackUrl = response ? (response.poster || response.url) : null;
                    if (fallbackUrl && img && img.parentNode) {
                        img.src = fallbackUrl;
                    } else if (img && img.parentNode) {
                        const title = altTitle || ruTitle || enTitle || 'Аниме';
                        const safeTitle = window.agEscapeHtml(title);
                        img.outerHTML = `<div class="ag-top-poster-fallback"><span>🎬</span><small>${safeTitle}</small></div>`;
                    }
                });
                return;
            } catch (e) {}
        }

        const title = altTitle || ruTitle || enTitle || 'Аниме';
        const safeTitle = window.agEscapeHtml(title);
        img.outerHTML = `<div class="ag-top-poster-fallback"><span>🎬</span><small>${safeTitle}</small></div>`;
    };

    window.AnimePlus = window.AnimePlus || { Config: {}, UI: {}, Utils: {}, Modules: {} };

    window.AnimePlus.Utils.escapeHtml = window.agEscapeHtml;
    window.AnimePlus.Utils.normalizePosterUrl = window.agNormalizePosterUrl;
    window.AnimePlus.UI.ensureAgLogoPlus = window.ensureAgLogoPlus;
    window.AnimePlus.UI.showAgToast = window.showAgToast;
    window.AnimePlus.UI.handlePosterError = window.agHandlePosterError;
})();
