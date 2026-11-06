// features/fox-dock.js
// Значок Anime+ с лисой в углу страницы и его меню: «Shikimori ★» (на странице тайтла), «Топ Shikimori», «Случайное аниме».
// Значок не ищет элементы сайта: он прикреплён к <html> и живёт в собственном Shadow DOM со своими стилями,
// поэтому обновление вёрстки сайта его не ломает. Привязан к сайту, на котором открыт: Топ и случайный тайтл
// открываются на этом же сайте. Топ открывается поверх страницы кадром расширения (top/frame.html?embed=1) внутри
// значка: зритель не уходит с сайта, а вёрстка сайта по-прежнему не трогается. Значок можно перетащить в другой угол, угол запоминается (ag_fox_corner).
// В полноэкранном просмотре (настоящем и псевдо, html.ag-pfs-root) значок прячется.
// Один раз лиса сама рассказывает, что в значке (ag_guide.dockTipDone): так о нём узнают и те, кто прошёл экскурсию
// до его появления, когда Топ ещё был пунктом в меню сайта.

(function () {
    'use strict';

    const CORNER_KEY = 'ag_fox_corner';
    const CORNERS = ['br', 'bl', 'tr', 'tl'];
    const EDGE = 18;
    const DRAG_PX = 6;
    const TIP_DELAY_MS = 1500;
    const SHIKI = 'https://shikimori.io';
    const TOP_SOURCE = 'anime-plus-top';

    const STYLE = `
        :host { all: initial; position: fixed; z-index: 2147482000; display: block; font: 500 13px/1.3 var(--ap-font, system-ui, sans-serif); color: var(--ap-text, #f1f3f7); }
        :host([hidden]) { display: none; }
        * { box-sizing: border-box; }
        .fab { all: unset; box-sizing: border-box; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; cursor: pointer; touch-action: none;
            background: var(--ap-surface, #161a22); border: 1px solid var(--ap-line-strong, rgba(255,255,255,.22)); box-shadow: 0 6px 20px rgba(0,0,0,.45);
            opacity: .82; transition: opacity .15s ease, transform .15s ease, border-color .15s ease; }
        .fab:hover, .fab:focus-visible, .fab[aria-expanded="true"] { opacity: 1; border-color: var(--ap-accent, #ef4444); }
        .fab:focus-visible { outline: 2px solid var(--ap-accent, #ef4444); outline-offset: 2px; }
        .fab.is-dragging { cursor: grabbing; transform: scale(1.08); opacity: 1; }
        .fab svg { width: 36px; height: 40px; pointer-events: none; }
        .menu { position: absolute; min-width: 230px; padding: 6px; border-radius: var(--ap-radius, 8px); background: var(--ap-raised, #1f242e);
            border: 1px solid var(--ap-line-strong, rgba(255,255,255,.22)); box-shadow: var(--ap-shadow, 0 16px 48px rgba(0,0,0,.55)); }
        .menu[hidden] { display: none; }
        :host([data-corner^="b"]) .menu { bottom: calc(100% + 8px); }
        :host([data-corner^="t"]) .menu { top: calc(100% + 8px); }
        :host([data-corner$="r"]) .menu { right: 0; }
        :host([data-corner$="l"]) .menu { left: 0; }
        .head { display: flex; align-items: center; gap: 6px; padding: 4px 8px 8px; color: var(--ap-text-3, #8f96a6); font-size: 11px; font-weight: 600; }
        .head b { color: var(--ap-text, #f1f3f7); }
        .item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border-radius: var(--ap-radius-sm, 6px);
            color: var(--ap-text, #f1f3f7); cursor: pointer; font-weight: 600; }
        .item:hover, .item:focus-visible { background: var(--ap-hover, rgba(255,255,255,.07)); }
        .item[aria-disabled="true"] { opacity: .6; cursor: default; }
        .item svg { flex-shrink: 0; color: var(--ap-text-2, #b6bcc9); }
        .item .star { color: var(--ap-warning, #fbbf24); font-size: 15px; width: 18px; text-align: center; }
        .item .side { margin-left: auto; color: var(--ap-text-3, #8f96a6); font-weight: 500; }
        .note { padding: 6px 8px 2px; color: var(--ap-danger, #f87171); font-size: 12px; }
        .note:empty { display: none; }
        .sep { height: 1px; margin: 4px 2px; background: var(--ap-line, rgba(255,255,255,.1)); }
        .tip { position: absolute; width: 300px; display: flex; gap: 10px; padding: 12px; border-radius: var(--ap-radius-lg, 14px);
            background: var(--ap-raised, #1f242e); border: 1px solid var(--ap-accent, #ef4444); box-shadow: var(--ap-shadow, 0 16px 48px rgba(0,0,0,.55)); }
        .tip[hidden] { display: none; }
        :host([data-corner^="b"]) .tip { bottom: calc(100% + 10px); }
        :host([data-corner^="t"]) .tip { top: calc(100% + 10px); }
        :host([data-corner$="r"]) .tip { right: 0; }
        :host([data-corner$="l"]) .tip { left: 0; }
        .tip .pic { flex: none; width: 52px; }
        .tip .pic svg { width: 52px; height: 58px; }
        .tip p { margin: 0 0 10px; font-size: 13px; line-height: 1.4; color: var(--ap-text, #f1f3f7); }
        .tip .row { display: flex; justify-content: flex-end; gap: 8px; }
        .tip button { all: unset; box-sizing: border-box; padding: 6px 12px; border-radius: var(--ap-radius-sm, 6px); font-size: 12px; font-weight: 600; cursor: pointer; }
        .tip .later { color: var(--ap-text-2, #b6bcc9); }
        .tip .later:hover, .tip .later:focus-visible { background: var(--ap-hover, rgba(255,255,255,.07)); }
        .tip .go { background: var(--ap-accent, #ef4444); color: var(--ap-on-accent, #fff); }
        .tip button:focus-visible { outline: 2px solid var(--ap-accent, #ef4444); outline-offset: 2px; }
        /* Топ поверх страницы. color-scheme как у страницы Топа, иначе Chrome зальёт прозрачный кадр сплошным фоном */
        :host([data-top]) .fab { visibility: hidden; }
        .top-frame { position: fixed; inset: 0; width: 100vw; height: 100vh; border: 0; margin: 0; padding: 0; background: transparent; color-scheme: dark; z-index: 1; }
    `;

    const el = (tag, attrs = {}, ...children) => {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => { if (v !== false && v != null) node.setAttribute(k, v); });
        children.flat().forEach(c => node.append(c instanceof Node ? c : document.createTextNode(String(c))));
        return node;
    };

    const icon = (name) => (window.AgUI ? window.AgUI.iconEl(name, 18) : document.createTextNode(''));

    const foxIcon = (pose = 'calm') => {
        const svg = window.AgGuideFox && window.AgGuideFox.svg(pose);
        if (!svg) return document.createTextNode('A+');
        return new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    };

    const placeHost = (host, corner) => {
        host.dataset.corner = corner;
        host.style.cssText = '';
        host.style.setProperty(corner[0] === 'b' ? 'bottom' : 'top', `${EDGE}px`);
        host.style.setProperty(corner[1] === 'r' ? 'right' : 'left', `${EDGE}px`);
    };

    // Ближайший угол экрана к точке, где отпустили значок
    const nearestCorner = (x, y) => `${y > window.innerHeight / 2 ? 'b' : 't'}${x > window.innerWidth / 2 ? 'r' : 'l'}`;

    // Оценка Shikimori тайтла этой страницы: { id, score } или null
    async function loadRating(provider) {
        const info = await provider.getTitleInfo();
        if (!info) return null;
        let id = info.shikimoriId;
        if (!id) {
            const resolved = await window.agSendMessage({ action: 'resolve_shikimori_id', titles: info.titles, year: info.year, kind: info.kind });
            id = resolved && resolved.id;
        }
        if (!id) return null;
        const details = await window.agSendMessage({ action: 'fetch_shikimori', url: `${SHIKI}/api/animes/${id}` });
        return { id, score: details && details.data && details.data.score };
    }

    window.AgFeatures = window.AgFeatures || {};

    window.AgFeatures.foxDock = function ({ provider, scope, site }) {
        const host = scope.own(document.createElement('ag-fox-dock'));
        const root = host.attachShadow({ mode: 'open' });
        placeHost(host, 'br');

        const fab = el('button', { class: 'fab', type: 'button', title: 'Anime+', 'aria-label': 'Меню Anime+', 'aria-haspopup': 'true', 'aria-expanded': 'false' }, foxIcon());
        const note = el('div', { class: 'note', role: 'status' });
        const ratingItem = el('a', { class: 'item', href: SHIKI, target: '_blank', rel: 'noopener', hidden: '' },
            el('span', { class: 'star' }, '★'), el('span', { class: 'label' }, 'Shikimori'), el('span', { class: 'side' }, '↗'));
        const topItem = el('button', { class: 'item', type: 'button' }, icon('trophy'), 'Топ Shikimori');
        const randomLabel = el('span', {}, 'Случайное аниме');
        const randomItem = el('button', { class: 'item', type: 'button' }, icon('refresh'), randomLabel);
        const menu = el('div', { class: 'menu', role: 'menu', hidden: '' },
            el('div', { class: 'head' }, 'Anime+ ·', el('b', {}, site.name)),
            ratingItem, topItem, randomItem, note);
        const tipLater = el('button', { class: 'later', type: 'button' }, 'Понятно');
        const tipGo = el('button', { class: 'go', type: 'button' }, 'Показать');
        const tip = el('div', { class: 'tip', role: 'dialog', 'aria-label': 'Подсказка Anime+', hidden: '' },
            el('div', { class: 'pic' }, foxIcon('hello')),
            el('div', {},
                el('p', {}, 'Топ Shikimori, оценка тайтла и случайное аниме теперь здесь, в моём меню. Нажмите на меня в любой момент, а если мешаю, перетащите в другой угол.'),
                el('div', { class: 'row' }, tipLater, tipGo)));
        root.append(el('style', {}, STYLE), menu, tip, fab);
        document.documentElement.append(host);

        // Сохранённый угол
        chrome.storage.local.get([CORNER_KEY]).then((res) => {
            const corner = res && res[CORNER_KEY];
            if (CORNERS.includes(corner) && !scope.disposed) placeHost(host, corner);
        }).catch(() => {});

        // Оценка — только на странице тайтла, при первом открытии меню
        let ratingAsked = false;
        const showRating = () => {
            if (ratingAsked || !provider.isTitlePage()) return;
            ratingAsked = true;
            ratingItem.hidden = false;
            ratingItem.querySelector('.label').textContent = 'Shikimori …';
            loadRating(provider).then((rating) => {
                if (scope.disposed) return;
                if (!rating) { ratingItem.hidden = true; return; }
                ratingItem.href = `${SHIKI}/animes/${rating.id}`;
                ratingItem.querySelector('.label').textContent = `Shikimori ${rating.score || '?'}`;
            }).catch(() => { ratingItem.hidden = true; });
        };

        // Подсказка лисы: показывается один раз на всех сайтах, закрывается навсегда любым ответом или открытием меню
        const guide = window.AgGuide;
        const closeTip = () => {
            if (tip.hidden) return;
            tip.hidden = true;
            if (guide) guide.patch({ dockTipDone: true }).catch(() => {});
        };

        const setOpen = (open) => {
            menu.hidden = !open;
            fab.setAttribute('aria-expanded', String(open));
            if (!open) return;
            note.textContent = '';
            closeTip();
            showRating();
            if (guide) guide.mark('dock');
        };

        if (guide) {
            guide.read().then((state) => {
                if (state.dockTipDone || scope.disposed) return;
                scope.timeout(() => {
                    if (host.hidden || topFrame || !menu.hidden) return;
                    tip.hidden = false;
                }, TIP_DELAY_MS);
            }).catch(() => {});
        }
        scope.listen(tipLater, 'click', closeTip);
        scope.listen(tipGo, 'click', () => { setOpen(true); });

        // Топ поверх страницы: на время показа страница сайта не прокручивается
        let topFrame = null;
        let pageOverflow = '';
        const closeTop = () => {
            if (!topFrame) return;
            topFrame.remove();
            topFrame = null;
            delete host.dataset.top;
            document.documentElement.style.overflow = pageOverflow;
            fab.focus({ preventScroll: true });
        };
        const openTop = () => {
            setOpen(false);
            tip.hidden = true;
            if (topFrame) return;
            const params = new URLSearchParams({ embed: '1', site: site.id, origin: location.origin });
            topFrame = el('iframe', { class: 'top-frame', src: `${chrome.runtime.getURL('top/frame.html')}?${params}`, title: 'Топ Shikimori' });
            root.append(topFrame);
            host.dataset.top = '1';
            pageOverflow = document.documentElement.style.overflow;
            document.documentElement.style.overflow = 'hidden';
            topFrame.addEventListener('load', () => { if (topFrame) topFrame.focus(); }, { once: true });
        };
        scope.add(closeTop);

        // Кадр Топа просит закрыть его или открыть тайтл. Принимаем только от своего кадра и только адрес этого сайта
        scope.listen(window, 'message', (e) => {
            const data = e.data;
            if (!topFrame || e.source !== topFrame.contentWindow || !data || data.source !== TOP_SOURCE) return;
            if (data.type === 'close') closeTop();
            if (data.type === 'open') {
                let url = null;
                try { url = new URL(String(data.url), location.origin); } catch (err) { return; }
                const owner = window.AgSites.byHost(url.hostname);
                if (!/^https?:$/.test(url.protocol) || !owner || owner.id !== site.id) return;
                location.href = url.href;
            }
        });

        let randomBusy = false;
        const openRandom = async () => {
            if (randomBusy) return;
            randomBusy = true;
            randomItem.setAttribute('aria-disabled', 'true');
            randomLabel.textContent = 'Подбираем…';
            const done = (message) => {
                randomBusy = false;
                randomItem.removeAttribute('aria-disabled');
                randomLabel.textContent = 'Случайное аниме';
                note.textContent = message || '';
            };
            const res = await window.agSendMessage({ action: 'get_random_shikimori_anime', siteId: site.id, currentUrl: location.href });
            if (scope.disposed) return;
            const target = res ? provider.getRandomUrl(res) : null;
            if (target) {
                location.href = target;
                scope.timeout(() => done(''), 4000);
                return;
            }
            done(res && res.reason === 'no_match'
                ? `Нет тайтлов с оценкой от ${res.minScore || 'любой'}: измените это в настройках`
                : `Не удалось подобрать тайтл на ${site.name}, попробуйте ещё раз`);
        };

        scope.listen(topItem, 'click', openTop);
        scope.listen(randomItem, 'click', () => { openRandom().catch(() => {}); });

        // Нажатие открывает меню, перетаскивание переносит значок в ближайший угол
        let drag = null;
        scope.listen(fab, 'pointerdown', (e) => {
            if (e.button !== 0) return;
            const rect = host.getBoundingClientRect();
            drag = { x: e.clientX, y: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, moved: false };
            try { fab.setPointerCapture(e.pointerId); } catch (err) { /* без захвата перетаскивание тоже работает */ }
        });
        scope.listen(fab, 'pointermove', (e) => {
            if (!drag) return;
            if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_PX) return;
            if (!drag.moved) { drag.moved = true; setOpen(false); closeTip(); fab.classList.add('is-dragging'); }
            host.style.cssText = `left:${e.clientX - drag.dx}px;top:${e.clientY - drag.dy}px`;
        });
        const endDrag = (e, cancelled) => {
            if (!drag) return;
            const moved = drag.moved;
            drag = null;
            fab.classList.remove('is-dragging');
            if (!moved) {
                if (!cancelled) setOpen(menu.hidden);
                return;
            }
            const corner = nearestCorner(e.clientX, e.clientY);
            placeHost(host, corner);
            chrome.storage.local.set({ [CORNER_KEY]: corner }).catch(() => {});
        };
        scope.listen(fab, 'pointerup', (e) => endDrag(e, false));
        scope.listen(fab, 'pointercancel', (e) => endDrag(e, true));
        // Клавиатура: Enter и пробел приходят как click без pointerdown
        scope.listen(fab, 'click', (e) => { if (e.detail === 0) setOpen(menu.hidden); });

        // Меню закрывается нажатием мимо него и клавишей Esc. Нажатия внутри Shadow DOM приходят с целью host
        scope.listen(document, 'pointerdown', (e) => { if (e.target !== host && !menu.hidden) setOpen(false); }, true);
        scope.listen(document, 'keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (topFrame) closeTop();
            else if (!menu.hidden) setOpen(false);
        });

        // Полноэкранный просмотр: значок не лежит поверх видео
        const syncHidden = () => {
            const full = !!document.fullscreenElement || document.documentElement.classList.contains('ag-pfs-root');
            if (full) { setOpen(false); closeTop(); tip.hidden = true; }
            host.hidden = full;
        };
        scope.listen(document, 'fullscreenchange', syncHidden);
        const classWatch = new MutationObserver(syncHidden);
        classWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        scope.add(() => classWatch.disconnect());
        syncHidden();

        // Старые закладки на Топ (…#ag-top-shikimori, /top-shikimori) открывают Топ поверх страницы
        if (location.hash === '#ag-top-shikimori') {
            history.replaceState(null, '', location.pathname + location.search);
            openTop();
        }
    };
})();
