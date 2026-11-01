(function () {
    'use strict';

    if (!window.location.pathname.includes('/oauth/authorize')) return;

    // 1. Инъекция стилей спиннера (без agFadeIn для предотвращения любой полупрозрачности при появлении)
    const style = document.createElement('style');
    style.textContent = `
        @keyframes agSpin { to { transform: rotate(360deg); } }
        .ag-auth-btn-primary {
            background: #ef4444 !important;
            color: #ffffff !important;
            border: none !important;
            height: 38px !important;
            padding: 0 20px !important;
            border-radius: 8px !important;
            font: 600 13px inherit !important;
            cursor: pointer !important;
            transition: background 0.15s ease !important;
        }
        .ag-auth-btn-primary:hover {
            background: #f15e5e !important;
        }
        .ag-auth-btn-secondary {
            background: transparent !important;
            color: #b6bcc9 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            height: 38px !important;
            padding: 0 20px !important;
            border-radius: 8px !important;
            font: 600 13px inherit !important;
            cursor: pointer !important;
            transition: background 0.15s ease !important;
        }
        .ag-auth-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.07) !important;
            color: #f1f3f7 !important;
        }
    `;
    (document.documentElement || document.head).appendChild(style);

    function createAuthModal(type = 'loading') {
        let backdrop = document.getElementById('animeplus-autoauth-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'animeplus-autoauth-backdrop';
            backdrop.style.cssText = `
                position: fixed;
                inset: 0;
                background: #0f1218 !important;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
                opacity: 1 !important;
            `;

            const card = document.createElement('div');
            card.id = 'animeplus-autoauth-card';
            card.style.cssText = `
                background: #161a22;
                color: #f1f3f7;
                padding: 28px 32px;
                border-radius: 14px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                text-align: center;
                max-width: 440px;
                width: 90%;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 16px;
            `;

            backdrop.appendChild(card);
            (document.documentElement || document.body || document).appendChild(backdrop);
        }

        const card = backdrop.querySelector('#animeplus-autoauth-card') || backdrop;

        const logoUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) 
            ? chrome.runtime.getURL('icons/icon128.png') 
            : '';

        const logoHeaderHtml = `
            <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                ${logoUrl ? `<img src="${logoUrl}" alt="" style="width: 36px; height: 36px; object-fit: contain;" />` : ''}
                <span style="font-size: 20px; font-weight: 700; color: #f1f3f7;">Anime<span style="color: #ef4444;">+</span></span>
            </div>
        `;

        if (type === 'consent') {
            card.innerHTML = `
                ${logoHeaderHtml}

                <div id="ag-auth-title" style="font-size: 16px; font-weight: 600; color: #f1f3f7; margin-top: 4px;">Привязать аккаунт Shikimori?</div>
                <div id="ag-auth-desc" style="font-size: 13px; color: #b6bcc9; line-height: 1.5; margin-bottom: 4px;">
                    Расширение <b>Anime+</b> запрашивает доступ для автоматического отслеживания серий и синхронизации вашего списка.
                </div>

                <div style="display: flex; gap: 8px; width: 100%; justify-content: center; margin-top: 8px;">
                    <button id="ag-btn-allow-auth" class="ag-auth-btn-primary">Разрешить доступ</button>
                    <button id="ag-btn-deny-auth" class="ag-auth-btn-secondary">Отмена</button>
                </div>
            `;

            const btnAllow = card.querySelector('#ag-btn-allow-auth');
            const btnDeny = card.querySelector('#ag-btn-deny-auth');

            if (btnAllow) {
                btnAllow.onclick = async () => {
                    createAuthModal('loading');

                    const form = document.querySelector('form');
                    if (form) {
                        try {
                            const formData = new FormData(form);
                            if (!formData.has('commit')) {
                                formData.append('commit', 'Разрешить');
                            }
                            const resp = await fetch(form.action || window.location.href, {
                                method: 'POST',
                                body: formData,
                                redirect: 'follow'
                            });

                            let code = '';
                            const finalUrl = resp.url || '';
                            if (finalUrl.includes('/oauth/authorize/')) {
                                const parts = finalUrl.split('/oauth/authorize/');
                                if (parts[1]) {
                                    code = parts[1].split('/')[0].split('?')[0].trim();
                                }
                            }
                            if (!code) {
                                const htmlText = await resp.text();
                                const match = htmlText.match(/(?:code|authorization_code)[:\s>]+([a-zA-Z0-9_\-]{20,80})/i);
                                if (match && match[1]) {
                                    code = match[1].trim();
                                }
                            }

                            if (code && code.length >= 15) {
                                window.agAuthProcessed = true;
                                performCodeAuth(code);
                                return;
                            }
                        } catch (e) {
                            console.error('[Anime+] AJAX Auth error:', e);
                        }
                    }

                    // Фолбэк на оригинальный клик если AJAX не сработал
                    const nativeBtn = document.querySelector('input[type="submit"][name="commit"], input[value="Разрешить"], button[type="submit"], input[type="submit"]');
                    if (nativeBtn) {
                        nativeBtn.click();
                    } else if (form) {
                        form.submit();
                    }
                };
            }

            if (btnDeny) {
                btnDeny.onclick = () => {
                    chrome.runtime.sendMessage({ action: "close_current_tab" });
                };
            }
        } else if (type === 'loading') {
            card.innerHTML = `
                ${logoHeaderHtml}
                
                <div id="ag-auth-spinner" style="width: 36px; height: 36px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #ef4444; border-radius: 50%; animation: agSpin 0.9s infinite linear; margin: 8px 0;"></div>
                <div id="ag-auth-icon" style="display: none; width: 36px; height: 36px; line-height: 36px; border-radius: 50%; font-size: 18px; font-weight: 700; text-align: center;"></div>

                <div id="ag-auth-title" style="font-size: 16px; font-weight: 600; color: #f1f3f7; margin-top: 4px;">Выполняем авторизацию…</div>
                <div id="ag-auth-desc" style="font-size: 13px; color: #b6bcc9; line-height: 1.5;">Связываем ваш аккаунт Shikimori с расширением Anime+. Пожалуйста, подождите.</div>
            `;
        }

        return backdrop;
    }

    function performCodeAuth(code) {
        const backdrop = createAuthModal('loading');
        const card = backdrop.querySelector('#animeplus-autoauth-card') || backdrop;

        chrome.runtime.sendMessage({
            action: "shiki_auto_auth",
            code: code
        }, (res) => {
            const spinner = card.querySelector('#ag-auth-spinner');
            const icon = card.querySelector('#ag-auth-icon');
            const title = card.querySelector('#ag-auth-title');
            const desc = card.querySelector('#ag-auth-desc');

            if (res && res.success) {
                if (spinner) spinner.style.display = 'none';
                if (icon) {
                    icon.textContent = '✓';
                    icon.style.color = '#34d399';
                    icon.style.background = 'rgba(52, 211, 153, 0.15)';
                    icon.style.display = 'block';
                }
                if (title) {
                    title.textContent = 'Аккаунт привязан';
                }
                
                let secondsLeft = 3;
                const updateCountdown = () => {
                    if (desc) {
                        desc.innerHTML = `Ваш аккаунт Shikimori успешно привязан.<br>Вкладка закроется через <b style="color: #f1f3f7;">${secondsLeft} сек...</b>`;
                    }
                };
                updateCountdown();

                const timer = setInterval(() => {
                    secondsLeft--;
                    if (secondsLeft <= 0) {
                        clearInterval(timer);
                        chrome.runtime.sendMessage({ action: "close_current_tab" });
                    } else {
                        updateCountdown();
                    }
                }, 1000);
            } else {
                if (spinner) spinner.style.display = 'none';
                if (icon) {
                    icon.textContent = '✕';
                    icon.style.color = '#f87171';
                    icon.style.background = 'rgba(248, 113, 113, 0.15)';
                    icon.style.display = 'block';
                }
                if (title) {
                    title.textContent = 'Ошибка авторизации';
                }
                if (desc) {
                    desc.textContent = (res && res.error) ? res.error : 'Сбой обмена токенов. Попробуйте еще раз в окне расширения.';
                }
            }
        });
    }

    // Мгновенный показ подходящего окна при запуске скрипта
    const path = window.location.pathname;
    if (path.includes('/oauth/authorize/')) {
        createAuthModal('loading');
    } else if (path.includes('/oauth/authorize')) {
        createAuthModal('consent');
    }

    function tryExtractCode() {
        if (window.agAuthProcessed) return;

        let code = '';
        const currentPath = window.location.pathname;

        // 1. Проверяем URL страницы: https://shikimori.io/oauth/authorize/El5ur-VqU7...
        if (currentPath.includes('/oauth/authorize/')) {
            const parts = currentPath.split('/oauth/authorize/');
            if (parts[1]) {
                const urlCode = parts[1].split('/')[0].split('?')[0].trim();
                if (urlCode && urlCode.length >= 15) {
                    code = urlCode;
                }
            }
        }

        // 2. Ищем по элементам в DOM
        if (!code) {
            const selectors = [
                '#authorization_code',
                'code#authorization_code',
                'code.b-code',
                '.b-code',
                'code',
                'input[readonly]',
                'input#code',
                'input[name="code"]'
            ];

            for (const sel of selectors) {
                const els = document.querySelectorAll(sel);
                for (const el of els) {
                    const val = (el.textContent || el.innerText || el.value || '').trim();
                    if (val && val.length >= 15 && !val.includes(' ') && !val.includes('<') && !val.includes('{')) {
                        code = val;
                        break;
                    }
                }
                if (code) break;
            }
        }

        // 3. Фолбэк по тексту на странице
        if (!code && document.body) {
            const bodyText = document.body.innerText || '';
            const match = bodyText.match(/(?:код|code|authorization_code)[:\s]+([a-zA-Z0-9_\-]{20,80})/i);
            if (match && match[1]) {
                code = match[1].trim();
            }
        }

        if (code && code.length >= 15) {
            window.agAuthProcessed = true;
            performCodeAuth(code);
        }
    }

    tryExtractCode();

    // Наблюдатель и страховочный опрос живут, пока код не получен, но не дольше 2 минут:
    // раньше при закрытом/отменённом диалоге они работали вечно (опрос каждые 50 мс)
    const AUTH_WATCH_LIMIT_MS = 2 * 60 * 1000;
    let stopped = false;
    const stopWatching = () => {
        if (stopped) return;
        stopped = true;
        observer.disconnect();
        clearInterval(interval);
        clearTimeout(limitTimer);
    };
    const check = () => {
        if (window.agAuthProcessed) return stopWatching();
        tryExtractCode();
        if (window.agAuthProcessed) stopWatching();
    };

    const observer = new MutationObserver(check);
    if (document.documentElement) {
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    const interval = setInterval(check, 250);
    const limitTimer = setTimeout(stopWatching, AUTH_WATCH_LIMIT_MS);
})();
