// modules/player/frame/episodes.js
// Серии в кадре плеера (content-player.js): какая серия открыта, переключение на соседнюю и сообщения странице сайта.
// У Kodik свои списки на странице плеера, у остальных плееров списки читает и выбирает адаптер.

(function (root) {
    'use strict';

    // Только список серий. В Kodik три одинаковых выпадающих списка (сезоны, серии, озвучки), и общий
    // .dropdown-content .item находит их все: активным оказывался пункт сезона, а «следующим» — всегда первая серия
    const SERIES_ITEMS = '.serial-series-box .dropdown-content .item, .serial-series .dropdown-content .item, .series-select .dropdown-content .item';
    const SERIES_SELECT = '.serial-series-box select, .serial-series select, select[name="series"], .series-select';
    const REPORT_DELAY_MS = 200;

    const numberIn = (text) => (String(text || '').match(/\d+/) || [])[0] || '';
    const isActiveItem = (item) => item.classList.contains('selected') || item.classList.contains('active') || item.classList.contains('current');
    const press = (el) => {
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.click();
    };

    /**
     * player — адаптер плеера, link — связь со страницей, isShown() — кадр виден зрителю,
     * getShell() — оболочка плеера (знает выбранную серию раньше списков), onSwitch(force) — перед каждым переключением
     */
    function create({ player, isKodik, link, isShown, getShell, onSwitch }) {
        let lastSwitch = 0;
        const isJutsu = (document.referrer || '').includes('jut-su.net') || location.href.includes('d=jut-su.net');

        const hasLocalControls = () => !!(document.querySelector(SERIES_SELECT) || document.querySelectorAll(SERIES_ITEMS).length > 0);

        const isDleNavSite = () => isJutsu || (link.parentSite && link.parentSite.platform === 'dle')
            || !!(root.AgSites && root.AgSites.isDleHost(link.sourceHost));

        // Серии переключает сам плеер: на сайтах DLE всегда, на остальных — если у плеера есть свой список, а сайт серии не ведёт
        const shouldUseLocalNav = () => {
            if (isDleNavSite()) return true;
            const isPageNavSite = /animego\.(me|org)|yummyani\.me/.test(link.sourceHost);
            return !isPageNavSite && hasLocalControls();
        };

        /** { current, prev, next } — номера серий по разметке плеера */
        const current = () => {
            if (!isKodik) {
                const shell = getShell();
                const own = (shell && shell.current('episodes')) || player.read('episodes').find(o => o.selected);
                return { current: (own && own.label) || new URLSearchParams(location.search).get('episode') || '1', prev: '', next: '' };
            }

            const sel = document.querySelector(SERIES_SELECT);
            if (sel && sel.tagName === 'SELECT' && sel.options && sel.options.length > 0) {
                const idx = sel.selectedIndex >= 0 ? sel.selectedIndex : Array.from(sel.options).findIndex(o => o.selected);
                const text = (opt) => (opt ? opt.text || opt.value : '');
                if (idx >= 0) {
                    return {
                        current: numberIn(text(sel.options[idx])) || '1',
                        prev: idx > 0 ? numberIn(text(sel.options[idx - 1])) : '',
                        next: idx < sel.options.length - 1 ? numberIn(text(sel.options[idx + 1])) : ''
                    };
                }
            }

            const items = Array.from(document.querySelectorAll(SERIES_ITEMS));
            if (items.length > 0) {
                let idx = items.findIndex(isActiveItem);
                if (idx === -1) {
                    const shown = numberIn((document.querySelector('.serial-series-box .text, .series-select .text, .serial-series .text') || {}).textContent);
                    if (shown) idx = items.findIndex(item => numberIn(item.textContent) === shown);
                }
                if (idx !== -1) {
                    return {
                        current: numberIn(items[idx].textContent) || '1',
                        prev: items[idx - 1] ? numberIn(items[idx - 1].textContent) : '',
                        next: items[idx + 1] ? numberIn(items[idx + 1].textContent) : ''
                    };
                }
            }

            // Номер серии в любом элементе плеера: «39 серия»
            for (const el of document.querySelectorAll('button, div, span, a, p, select option:checked')) {
                if (el.children.length > 3) continue;
                const txt = (el.innerText || el.textContent || '').trim();
                const m = txt.match(/^(\d+)\s*сери[яи]/i) || txt.match(/\b(\d+)\s*сери[яи]/i);
                const num = m ? parseInt(m[1], 10) : 0;
                if (num > 0) return { current: String(num), prev: num > 1 ? String(num - 1) : '', next: String(num + 1) };
            }

            // Боковые стрелки плеера с номерами соседних серий
            const nextNum = parseInt(numberIn((document.querySelector('[class*="next"], .ag-next-ep') || {}).textContent), 10);
            if (nextNum > 1) return { current: String(nextNum - 1), prev: nextNum > 2 ? String(nextNum - 2) : '', next: String(nextNum) };
            const prevNum = parseInt(numberIn((document.querySelector('[class*="prev"], .ag-prev-ep') || {}).textContent), 10);
            if (prevNum >= 1) return { current: String(prevNum + 1), prev: String(prevNum), next: String(prevNum + 2) };

            return { current: '1', prev: '', next: '' };
        };

        // Скрытая вкладка плеера открыта на своей серии: её номер подменил бы серию того плеера, который смотрят
        const report = () => {
            if (!isShown()) return;
            link.toTop({ type: 'AG_EPISODE_CHANGED', episode: current().current });
        };
        const reportSoon = (ms = REPORT_DELAY_MS) => setTimeout(report, ms);

        // Плеер сообщил новые списки: серию могли сменить его собственные кнопки или автопереход
        document.addEventListener('ag-player-lists', report);

        /** Соседняя серия. force — переключает сам плеер в конце серии, иначе зритель; без force частые нажатия отсекаются */
        const switchEpisode = (dir, force = false) => {
            const debounceMs = (root.AG_CONSTANTS && root.AG_CONSTANTS.EPISODE_SWITCH_DEBOUNCE_MS) || 800;
            const now = Date.now();
            if (!force && now - lastSwitch < debounceMs) return false;
            lastSwitch = now;
            onSwitch(force);
            const step = dir === 'next' ? 1 : -1;

            if (!isKodik) {
                const list = player.read('episodes');
                const target = list[list.findIndex(o => o.selected) + step];
                if (!target || !list.some(o => o.selected)) return false;
                player.choose('episodes', target.index);
                reportSoon();
                return true;
            }

            // Собственный выпадающий список Kodik
            const items = Array.from(document.querySelectorAll(SERIES_ITEMS));
            if (items.length > 0) {
                let idx = items.findIndex(isActiveItem);
                if (idx === -1) {
                    const cur = current().current;
                    if (cur) idx = items.findIndex(item => numberIn(item.textContent) === String(cur));
                }
                const target = idx !== -1 ? items[idx + step] : null;
                if (target) {
                    press(target);
                    reportSoon();
                    return true;
                }
            }

            // Обычный <select> со списком серий
            const sel = document.querySelector(SERIES_SELECT);
            if (sel && sel.tagName === 'SELECT' && sel.options && sel.options.length > 0) {
                let idx = sel.selectedIndex;
                if (idx === -1) {
                    const cur = current().current;
                    if (cur) idx = Array.from(sel.options).findIndex(opt => numberIn(opt.text || opt.value) === String(cur));
                }
                // Ничего не выбрано: «дальше» открывает первую серию, как раньше
                const next = idx + step;
                if (next !== idx && next >= 0 && next < sel.options.length) {
                    sel.selectedIndex = next;
                    sel.options[next].selected = true;
                    sel.dispatchEvent(new Event('input', { bubbles: true }));
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    reportSoon();
                    return true;
                }
            }

            // Список серий есть, значит мы на краю сезона: дальше переключать нечего.
            // Нативная кнопка Kodik здесь не годится: с последней серии она уводит в следующий сезон
            if (items.length > 0 || sel) return false;

            // Только для плееров без списка серий — кнопки «Дальше >» / «< Назад»
            const words = dir === 'next' ? ['дальше', 'дальше >', 'следующая серия'] : ['назад', '< назад', 'предыдущая серия'];
            const ownId = dir === 'next' ? 'ag-n' : 'ag-p';
            const button = document.querySelector(dir === 'next' ? '.serial-next, [class*="next-series"], [class*="next-episode"]' : '.serial-prev, [class*="prev-series"], [class*="prev-episode"]')
                || Array.from(document.querySelectorAll('button, a, div, span')).find(el => el.children.length <= 2 && el.id !== ownId
                    && words.includes((el.innerText || el.textContent || '').trim().toLowerCase()));
            if (!button) return false;
            press(button);
            reportSoon();
            return true;
        };

        // Серии переключаются внутри плеера: страница сайта узнаёт номер только от нас
        const watch = (onChanged) => {
            // Чужие плееры меняют серию без перезагрузки кадра и без событий: следим за самим списком
            if (!isKodik) {
                let last = null;
                setInterval(() => {
                    const now = current().current;
                    if (now !== last) {
                        report();
                        onChanged();
                    }
                    last = now;
                }, 1000);
                return;
            }
            if (!shouldUseLocalNav()) return;
            const firstReport = setInterval(() => {
                const sel = document.querySelector(SERIES_SELECT);
                if ((sel && sel.options && sel.options.length > 0) || document.querySelectorAll(SERIES_ITEMS).length > 0) {
                    report();
                    clearInterval(firstReport);
                }
            }, 500);
            setTimeout(() => clearInterval(firstReport), 10000);

            document.addEventListener('change', (e) => {
                if (!e.target.matches(SERIES_SELECT)) return;
                lastSwitch = Date.now();
                reportSoon(100);
            });
            document.addEventListener('click', (e) => {
                const target = e.target.closest(`${SERIES_ITEMS}, .serial-next-button, .serial-next, [class*="next-series"], [class*="next-episode"]`);
                const isNextText = !target && (e.target.innerText || e.target.textContent || '').trim().toLowerCase().startsWith('дальше');
                if (!target && !isNextText) return;
                lastSwitch = Date.now();
                reportSoon();
            });
        };

        return {
            current, report, switchEpisode, watch, isDleNavSite, shouldUseLocalNav,
            // Конец серии: автопереход не должен сработать дважды и сразу после ручного переключения
            sinceSwitch: () => Date.now() - lastSwitch,
            markSwitched: () => { lastSwitch = Date.now(); }
        };
    }

    root.AgFrameEpisodes = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
