// modules/shared/shot-viewer.js
// Просмотр кадров тайтла поверх страницы: «Случайное аниме» (random/random.js) и панель тайтла в подборе (pick/pick.js).
// Стрелки и кнопки листают по кругу, Esc и нажатие мимо кадра закрывают. Классы <prefix>__viewer*, стили — у страницы.
// Открытый просмотр забирает Esc и стрелки себе: Esc не закрывает заодно панель тайтла под ним
(function (root) {
    'use strict';

    function create(prefix) {
        const doc = root.document;
        const el = (tag, cls, attrs = {}, ...kids) => {
            const node = doc.createElement(tag);
            if (cls) node.className = cls;
            Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
            node.append(...kids);
            return node;
        };
        let shots = [];
        let index = 0;
        let back = null;
        const img = el('img', `${prefix}__viewer-img`, { alt: '', referrerpolicy: 'no-referrer' });
        const count = el('span', `${prefix}__viewer-count`);
        const prev = el('button', `${prefix}__viewer-nav is-prev`, { type: 'button', 'aria-label': 'Предыдущий кадр' }, '‹');
        const fwd = el('button', `${prefix}__viewer-nav is-next`, { type: 'button', 'aria-label': 'Следующий кадр' }, '›');
        const close = el('button', `${prefix}__viewer-close`, { type: 'button', 'aria-label': 'Закрыть', title: 'Закрыть (Esc)' },
            root.AgUI && root.AgUI.iconEl ? root.AgUI.iconEl('close', 20) : '×');
        const node = el('div', `${prefix}__viewer`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Кадры', hidden: '' }, img, prev, fwd, close, count);

        // Полный кадр Shikimori весит около мегабайта и грузится секунды: пока он идёт, браузер держал бы на экране прошлый.
        // Поэтому сразу показываем превью (оно уже загружено на странице), а полный кадр подставляем, когда догрузится
        const loaded = new Set();
        const preload = (shot) => new Promise((resolve) => {
            if (!shot || loaded.has(shot.full)) { resolve(); return; }
            const full = new root.Image();
            full.referrerPolicy = 'no-referrer';
            full.onload = () => { loaded.add(shot.full); resolve(); };
            full.onerror = () => resolve();
            full.src = shot.full;
        });
        const paint = () => {
            const shot = shots[index];
            const ready = loaded.has(shot.full) || !shot.thumb;
            img.src = ready ? shot.full : shot.thumb;
            img.classList.toggle('is-preview', !ready);
            count.textContent = `${index + 1} / ${shots.length}`;
            prev.hidden = fwd.hidden = shots.length < 2;
            if (!ready) {
                preload(shot).then(() => {
                    if (shots[index] === shot && !node.hidden && loaded.has(shot.full)) {
                        img.src = shot.full;
                        img.classList.remove('is-preview');
                    }
                });
            }
            // Соседние кадры заранее: листание дальше будет сразу в полном качестве
            if (shots.length > 1) {
                preload(shots[(index + 1) % shots.length]);
                preload(shots[(index - 1 + shots.length) % shots.length]);
            }
        };
        const go = (step) => { index = (index + step + shots.length) % shots.length; paint(); };
        const hide = () => {
            node.hidden = true;
            img.removeAttribute('src');
            if (back && back.isConnected) back.focus();
        };
        prev.addEventListener('click', () => go(-1));
        fwd.addEventListener('click', () => go(1));
        close.addEventListener('click', hide);
        node.addEventListener('click', (e) => { if (e.target === node) hide(); });
        // На перехвате: раньше обработчиков страницы (Esc панели, пробел «Другое аниме»)
        doc.addEventListener('keydown', (e) => {
            if (node.hidden) return;
            if (e.key === 'Escape') hide();
            else if (e.key === 'ArrowLeft') go(-1);
            else if (e.key === 'ArrowRight') go(1);
            else return;
            e.preventDefault();
            e.stopImmediatePropagation();
        }, true);
        return {
            node,
            isOpen: () => !node.hidden,
            /** list — [{ full, thumb }], at — с какого кадра, from — куда вернуть фокус */
            open(list, at, from) {
                shots = list.map(s => ({ full: s.full || s.thumb, thumb: s.thumb || s.full })).filter(s => s.full);
                if (!shots.length) return;
                index = Math.min(Math.max(0, at || 0), shots.length - 1);
                back = from || null;
                paint();
                node.hidden = false;
                close.focus();
            }
        };
    }

    root.AgShotViewer = { create };
})(typeof globalThis !== 'undefined' ? globalThis : window);
