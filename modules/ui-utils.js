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
        if (!rawUrl || typeof rawUrl !== 'string') return chrome.runtime.getURL('icons/icon128.png');
        let url = rawUrl.trim();
        if (!url || url.includes('missing') || url.includes('stub') || url.includes('no-poster') || url.includes('no-image')) {
            return chrome.runtime.getURL('icons/icon128.png');
        }

        if (url.includes('/system/animes/')) {
            const idx = url.indexOf('/system/animes/');
            url = 'https://shikimori.one' + url.substring(idx);
        } else if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('chrome-extension://')) {
            url = `https://shikimori.one${url.startsWith('/') ? '' : '/'}${url}`;
        }

        return url;
    };

    window.agHandlePosterError = function (img, altTitle = '', shikiId = null, ruTitle = '', enTitle = '') {
        if (!img) return;
        const step = parseInt(img.dataset.agErrorHandled || '0') + 1;
        img.dataset.agErrorHandled = step.toString();

        let curSrc = img.src || '';

        if (step === 1) {
            if (curSrc.includes('shikimori.one') && !curSrc.includes('desu.shikimori.one')) {
                img.src = curSrc.replace('shikimori.one', 'desu.shikimori.one');
                return;
            }
        }

        if (step === 2 && (shikiId || ruTitle || altTitle)) {
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
                        return;
                    }
                    if (img && img.parentNode) {
                        img.src = chrome.runtime.getURL('icons/icon128.png');
                    }
                });
                return;
            } catch (e) {}
        }

        if (img && img.parentNode) {
            img.src = chrome.runtime.getURL('icons/icon128.png');
        }
    };

    window.showAgEpisodeNotification = function (data) {
        if (!data || !data.title) return;
        let notifContainer = document.getElementById('ag-ep-notif-container');
        if (!notifContainer) {
            notifContainer = document.createElement('div');
            notifContainer.id = 'ag-ep-notif-container';
            notifContainer.style.cssText = `
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                gap: 12px;
                pointer-events: none;
            `;
            (document.body || document.documentElement).appendChild(notifContainer);
        }

        const card = document.createElement('div');
        card.style.cssText = `
            background: linear-gradient(135deg, rgba(20, 20, 32, 0.96), rgba(28, 28, 44, 0.98));
            color: #ffffff;
            padding: 12px 14px;
            border-radius: 12px;
            font-family: ${window.AG_FONT};
            box-shadow: 0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12);
            backdrop-filter: blur(16px);
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 310px;
            max-width: 390px;
            transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            opacity: 0;
            transform: translateX(40px) scale(0.95);
            pointer-events: auto;
            position: relative;
            overflow: hidden;
        `;

        const posterUrl = data.poster || 'https://shikimori.one/favicons/favicon-192x192.png';
        const title = window.agEscapeHtml(data.title || '');
        const episode = window.agEscapeHtml(String(data.episode || ''));
        const voiceovers = data.voiceovers ? window.agEscapeHtml(`🎤 ${data.voiceovers}`) : '';

        let btnsHtml = '';
        if (data.animegoUrl) {
            btnsHtml += `<a href="${data.animegoUrl}" target="_blank" style="padding: 5px 11px; font-size: 10.5px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #ef4444, #b91c1c); border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(239,68,68,0.4); transition: transform 0.15s ease;">▶ AnimeGO</a>`;
        }
        if (data.jutsuUrl) {
            btnsHtml += `<a href="${data.jutsuUrl}" target="_blank" style="padding: 5px 11px; font-size: 10.5px; font-weight: 800; color: #fff; background: linear-gradient(135deg, #3b82f6, #1d4ed8); border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(59,130,246,0.4); transition: transform 0.15s ease;">▶ JUT-SU</a>`;
        }

        card.innerHTML = `
            <div style="position: absolute; top:0; left:0; width: 4px; height: 100%; background: linear-gradient(180deg, #ef4444, #3b82f6);"></div>
            <img src="${posterUrl}" style="width: 44px; height: 60px; object-fit: contain; background: rgba(0,0,0,0.3); border-radius: 6px; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.5); margin-left: 2px;">
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;">
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 10px; font-weight: 800; color: #ff9800; background: rgba(255, 152, 0, 0.18); border: 1px solid rgba(255,152,0,0.3); padding: 1px 6px; border-radius: 4px;">🔥 ${episode} серия</span>
                </div>
                <div style="font-size: 12.5px; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${title}">${title}</div>
                ${voiceovers ? `<div style="font-size: 10px; color: #9a99ab; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${voiceovers}</div>` : ''}
                <div style="display: flex; gap: 6px; margin-top: 4px;">${btnsHtml}</div>
            </div>
            <button class="ag-close-btn" style="position: absolute; top: 6px; right: 8px; background: none; border: none; color: #6f6e80; font-size: 14px; cursor: pointer; padding: 2px 4px; border-radius: 4px;">✕</button>
        `;

        const closeBtn = card.querySelector('.ag-close-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                card.style.opacity = '0';
                card.style.transform = 'translateX(30px)';
                setTimeout(() => card.remove(), 300);
            };
        }

        notifContainer.appendChild(card);

        requestAnimationFrame(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateX(0) scale(1)';
        });

        setTimeout(() => {
            if (card.parentNode) {
                card.style.opacity = '0';
                card.style.transform = 'translateX(30px)';
                setTimeout(() => card.remove(), 300);
            }
        }, 12000);
    };

    try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((message) => {
                if (message && message.action === 'SHOW_EPISODE_NOTIFICATION' && message.data) {
                    window.showAgEpisodeNotification(message.data);
                }
            });
        }
    } catch (e) {}

    window.AnimePlus = window.AnimePlus || { Config: {}, UI: {}, Utils: {}, Modules: {} };

    window.AnimePlus.Utils.escapeHtml = window.agEscapeHtml;
    window.AnimePlus.Utils.normalizePosterUrl = window.agNormalizePosterUrl;
    window.AnimePlus.UI.ensureAgLogoPlus = window.ensureAgLogoPlus;
    window.AnimePlus.UI.showAgToast = window.showAgToast;
    window.AnimePlus.UI.showAgEpisodeNotification = window.showAgEpisodeNotification;
    window.AnimePlus.UI.handlePosterError = window.agHandlePosterError;
})();

