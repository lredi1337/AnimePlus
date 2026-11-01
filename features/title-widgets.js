// features/title-widgets.js
// Панель на странице тайтла: «Shikimori ★ 8.9» и меню «Смотреть на…» со ссылками на этот же тайтл
// на остальных включённых сайтах (поиск выполняет background: resolve_all_sites, по ID Shikimori).

(function () {
    'use strict';

    const STYLE_ID = 'ag-title-widgets-style';
    const injectStyle = () => {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .ag-tw { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0; font: 600 var(--ap-fs-md)/1.2 var(--ap-font); position: relative; z-index: 5; }
            .ag-tw__btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: var(--ap-radius); border: 1px solid var(--ap-line);
                background: var(--ap-raised); color: var(--ap-text) !important; text-decoration: none !important; cursor: pointer; text-transform: none; transition: border-color var(--ap-ease); }
            .ag-tw__btn:hover, .ag-tw__btn[aria-expanded="true"] { border-color: var(--ap-line-strong); background: var(--ap-raised); }
            .ag-tw__menu { position: absolute; top: calc(100% + 6px); left: 0; min-width: 260px; max-height: 320px; overflow: auto; padding: 4px;
                border-radius: var(--ap-radius); background: var(--ap-raised); border: 1px solid var(--ap-line-strong); box-shadow: var(--ap-shadow); scrollbar-width: thin; }
            .ag-tw__item { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: var(--ap-radius-sm); color: var(--ap-text) !important; text-decoration: none !important; font-weight: 500; }
            .ag-tw__item:hover { background: var(--ap-hover); }
            .ag-tw__item.is-missing { opacity: .5; pointer-events: none; }
            .ag-tw__badge { width: 24px; height: 24px; border-radius: var(--ap-radius-sm); display: grid; place-items: center; font-size: var(--ap-fs-xs); font-weight: 700; flex-shrink: 0; }
            .ag-tw__state { display: inline-flex; margin-left: auto; font-size: var(--ap-fs-sm); color: var(--ap-text-3); }
            .ag-tw__note { padding: 8px; font-size: var(--ap-fs-sm); color: var(--ap-text-2); font-weight: 500; }
        `;
        (document.head || document.documentElement).appendChild(style);
    };

    const el = (tag, attrs = {}, text = '') => {
        const node = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'style') node.style.cssText = v;
            else node.setAttribute(k, v);
        });
        if (text) node.textContent = text;
        return node;
    };

    window.AgFeatures = window.AgFeatures || {};

    window.AgFeatures.titleWidgets = async function ({ provider, scope, site, settings }) {
        if (!provider.isTitlePage()) return;
        const anchor = await window.agWaitForElement(['h1'], { timeout: 10000 });
        if (!anchor || scope.disposed) return;
        const host = provider.getTitleAnchor();
        if (!host || document.querySelector('.ag-tw')) return;

        injectStyle();
        const bar = scope.own(el('div', { class: 'ag-tw' }));
        host.appendChild(bar);

        const info = await provider.getTitleInfo();
        if (!info || scope.disposed) return;

        // Shikimori ★
        let shikimoriId = info.shikimoriId;
        if (!shikimoriId) {
            const resolved = await window.agSendMessage({ action: 'resolve_shikimori_id', titles: info.titles, year: info.year, kind: info.kind });
            shikimoriId = resolved && resolved.id;
        }
        if (shikimoriId && !scope.disposed) {
            const details = await window.agSendMessage({ action: 'fetch_shikimori', url: `https://shikimori.io/api/animes/${shikimoriId}` });
            const score = details && details.data && details.data.score;
            bar.prepend(el('a', { class: 'ag-tw__btn', href: `https://shikimori.io/animes/${shikimoriId}`, target: '_blank', rel: 'noopener' }, `Shikimori ★ ${score || '?'}`));
        }

        // «Смотреть на…» — только включённые сайты, кроме текущего
        const others = window.AgSites.list.filter(s => s.id !== site.id && window.AgSites.isEnabled(settings, s.id));
        if (others.length === 0) return;

        const toggle = el('button', { class: 'ag-tw__btn', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true' }, 'Смотреть на… ▾');
        const menu = el('div', { class: 'ag-tw__menu', role: 'menu', hidden: '' });
        bar.append(toggle, menu);

        let loaded = false;
        const load = async () => {
            loaded = true;
            menu.replaceChildren(el('div', { class: 'ag-tw__note' }, 'Ищем на других сайтах…'));
            const res = await window.agSendMessage({
                action: 'resolve_all_sites',
                siteIds: others.map(s => s.id),
                titles: info.titles,
                year: info.year,
                shikimoriId
            });
            if (scope.disposed) return;
            const results = (res && res.results) || [];
            menu.replaceChildren(...others.map(s => {
                const r = results.find(x => x.siteId === s.id);
                const item = el('a', { class: 'ag-tw__item' + (r && r.url ? '' : ' is-missing'), role: 'menuitem', href: (r && r.url) || '#', target: '_blank', rel: 'noopener' });
                item.append(
                    el('span', { class: 'ag-tw__badge', style: `background:${s.color}; color:${window.AgUI ? window.AgUI.onAccent(s.color) : '#fff'}` }, s.short),
                    el('span', {}, s.name),
                    el('span', { class: 'ag-tw__state' }, r && r.url ? '↗' : (r && r.timedOut ? 'нет ответа' : 'не найдено'))
                );
                return item;
            }));
        };

        const setOpen = (open) => {
            menu.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            if (open && !loaded) load();
        };
        scope.listen(toggle, 'click', (e) => { e.preventDefault(); setOpen(menu.hidden); });
        scope.listen(document, 'click', (e) => { if (!bar.contains(e.target)) setOpen(false); });
        scope.listen(document, 'keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
    };
})();
