// modules/player/adapters.js
// Всё, что оболочке и учёту нужно знать о конкретном плеере: где его видео, как запустить, где списки и реклама.
// Сами функции (пропуск, марафон, учёт, клавиши) общие и работают с обычным <video>.
//
// Адаптер: id, name (название для зрителя), siteFirst (списки сайта важнее своих), css (скрыть родное управление), video(), videos(), started(v), ready(v),
// adState(v) → 'none' | 'visible' | 'playing', ageGate(), start(v), read(kind), choose(kind, index), quality(), preview(ratio),
// по желанию: onBind(v) при появлении нового видео, openQuality() если список качества появляется только в открытом меню,
// inject(on) для стилей внутри Shadow DOM плеера, deep (видео в Shadow DOM), tick() для действий на каждом шаге оболочки,
// fault() плеер показал свою ошибку, gone() вместо плеера страница «контент не найден», listsStable(v) в списках уже можно нажимать

(function (root) {
    'use strict';

    const q = (s) => document.querySelector(s);
    const qa = (s) => [...document.querySelectorAll(s)];
    const shown = (el) => {
        if (!el || el.getBoundingClientRect().width === 0) return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    };
    const runs = (v) => !!v && !v.paused && !v.ended && !!v.currentSrc;

    const COMMON = {
        siteFirst: true,
        css: '',
        video: () => null,
        videos() { const v = this.video(); return v ? [v] : []; },
        // Запущен, если видео хоть раз играло: у чужих плееров нет признака вроде класса на body
        started: (v) => !!v && (!v.paused || v.currentTime > 0 || v.played.length > 0),
        listsStable: () => true,
        ready: (v) => !!v && v.readyState >= 1,
        adState: () => 'none',
        ageGate: () => null,
        start: (v) => { if (v) v.play().catch(() => {}); },
        read: () => [],
        // Плееры на одну серию и озвучку: своих списков у них нет и не появится
        hasLists() { return this.read !== COMMON.read; },
        choose() {},
        quality: () => [],
        preview: () => null
    };

    // ---------- Kodik ----------

    const KODIK_SELECTS = { seasons: '.serial-seasons-box select', episodes: '.serial-series-box select', voices: '.serial-translations-box select' };

    // Блок рекламы лежит в кадре и без рекламы, иногда под самим видео, поэтому смотрим, что на самом деле сверху.
    // Оболочка при этой проверке не считается
    function adIsOnTop(box) {
        if (!document.elementsFromPoint) return true;
        const r = box.getBoundingClientRect();
        const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).filter(e => e.id !== 'ag-shell');
        return !!stack[0] && box.contains(stack[0]);
    }

    const kodik = {
        ...COMMON,
        id: 'kodik',
        name: 'Kodik',
        // У Kodik своих списков может не быть: он открыт сайтом на одну серию, тогда берутся списки сайта
        siteFirst: false,
        css: `
            body.ag-shell-on .fp-ui, body.ag-shell-on .serial-panel { opacity: 0 !important; pointer-events: none !important; }
            body.ag-shell-on .play_button, body.ag-shell-on .play_background { opacity: 0 !important; }
        `,
        video: () => q('video.fp-engine'),
        // Первым в кадре бывает пустой служебный элемент: события серии идут и от него
        videos: () => qa('video'),
        started: () => document.body.classList.contains('active-player'),
        ready: () => document.body.classList.contains('player-is-ready'),
        adState(main) {
            const box = q('.creative-player');
            if (!box || box.getBoundingClientRect().width === 0) return 'none';
            const style = getComputedStyle(box);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return 'none';
            const onTop = adIsOnTop(box);
            const ad = box.querySelector('video');
            if (runs(ad) && (onTop || !main || main.paused)) return 'playing';
            return onTop ? 'visible' : 'none';
        },
        /** Кнопка «Да» в окне «Вам есть 18 лет?», если окно сейчас на экране */
        ageGate() {
            const button = q('.preview-confirmation .pc-confirm');
            if (!button || button.getBoundingClientRect().width === 0) return null;
            const style = getComputedStyle(button);
            return style.display !== 'none' && style.visibility !== 'hidden' ? button : null;
        },
        start() {
            const b = q('.play_button') || q('.play_background a') || q('.play_background');
            if (b) b.click();
        },
        read(kind) {
            const sel = q(KODIK_SELECTS[kind]);
            if (!sel) return [];
            return [...sel.options].map((o, index) => ({
                index,
                selected: o.selected,
                label: (o.dataset.title || o.textContent || '').trim().replace(/\s*(серия|сезон)$/i, ''),
                title: (o.dataset.title || o.textContent || '').replace(/\s*\([^)]*\)\s*$/, '').trim(),
                type: o.dataset.translationType || 'voice',
                count: o.dataset.episodeCount || ''
            }));
        },
        choose(kind, index) {
            const sel = q(KODIK_SELECTS[kind]);
            if (!sel || sel.selectedIndex === index) return;
            sel.selectedIndex = index;
            sel.dispatchEvent(new Event('input', { bubbles: true }));
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        },
        quality: () => qa('.fp-quality-dropdown [data-quality]').map(el => ({
            label: el.textContent.trim(),
            current: el.classList.contains('current'),
            pick: () => el.click()
        })),
        // Миниатюры считает родная шкала: двигаем её и берём готовый кадр
        preview(ratio) {
            const line = q('.fp-timeline');
            if (!line) return null;
            const r = line.getBoundingClientRect();
            if (!r.width) return null;
            line.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + r.width * ratio, clientY: r.top + r.height / 2 }));
            const thumb = q('.fp-timestamp-thumbnail');
            if (!thumb || !thumb.style.backgroundImage) return null;
            return { image: thumb.style.backgroundImage, size: thumb.style.backgroundSize, position: thumb.style.backgroundPosition };
        }
    };

    // ---------- Alloha ----------

    const ALLOHA_LISTS = { seasons: 'seasonType', episodes: 'episodeType', voices: 'translationType' };
    const ALLOHA_HIDDEN = { seasons: 'season', episodes: 'episode', voices: 'translation' };
    const allohaItems = (kind) => qa(`[data-select^="${ALLOHA_LISTS[kind]}"] .select__drop-item`);

    const alloha = {
        ...COMMON,
        id: 'alloha',
        name: 'Alloha',
        css: `
            body.ag-shell-on :is(.allplay__controls, .allplay__control--overlaid, .allplay__control--loader, .allplay__skip, .selects, .time_save, .loader) {
                opacity: 0 !important; pointer-events: none !important; }
            body.ag-shell-on:not(.ag-shell-fault) .error_message { display: none !important; }
        `,
        video: () => q('video.allplay__video'),
        fault: () => !!q('.error_message:not(.hidden):not(.error_unsupported)'),
        gone: () => !q('#allplay') && /контент не найден/i.test(document.body.textContent),
        // Источник подключён и без ошибки: при подключении видео несколько секунд бывает в ошибке, это ещё не повод нажимать
        listsStable: (v) => !!v && !!q('#allplay') && !v.error && String(v.currentSrc || '').startsWith('blob:'),
        videos() { return qa('video'); },
        adState() {
            const ad = q('.rmp-ad-vast-video-player');
            return runs(ad) ? 'playing' : shown(q('.rmp-ad-container')) ? 'visible' : 'none';
        },
        start(v) {
            // Своё окно «Продолжить просмотр» плеер показывает вместо запуска, а место остановки у нас своё
            const resume = q('.time_save:not(.hidden) .time_save__close');
            if (resume) resume.click();
            const b = q('.allplay__control--overlaid[data-allplay="play"]');
            if (b) b.click();
            else if (v) v.play().catch(() => {});
        },
        // Сайт, который ведёт списки сам, просит плеер их спрятать: такие списки не трогаем, иначе страница и плеер разойдутся
        read(kind) {
            const hidden = new URLSearchParams(location.search).get('hidden') || '';
            if (hidden.split(',').includes(ALLOHA_HIDDEN[kind])) return [];
            return allohaItems(kind).map((el, index) => {
                const text = el.textContent.trim();
                return {
                    index,
                    selected: el.classList.contains('active'),
                    label: text.replace(/^(серия|сезон)\s*/i, '').replace(/\s*(серия|сезон)$/i, ''),
                    title: text,
                    type: /субтитр|subtitles/i.test(text) ? 'subtitles' : 'voice',
                    count: ''
                };
            });
        },
        choose(kind, index) {
            const el = allohaItems(kind)[index];
            if (el && !el.classList.contains('active')) el.click();
        },
        quality: () => qa('[data-allplay="quality"]').map(el => ({
            label: (el.querySelector('.allplay__control__title') || el).textContent.replace(/HD|4K|SD/g, '').trim(),
            current: el.getAttribute('aria-checked') === 'true',
            pick: () => el.click()
        }))
    };

    // ---------- Aksor ----------

    // Сам запускается без звука сразу при загрузке: придерживаем до запуска зрителем и включаем звук
    let aksorReleased = false;
    const aksor = {
        ...COMMON,
        id: 'aksor',
        name: 'Aksor',
        css: `
            body.ag-shell-on :is([class*="_controls_"], [class*="_settingsPanel_"]) { opacity: 0 !important; pointer-events: none !important; }
        `,
        video: () => q('video[class*="_video_"]'),
        videos: () => qa('video'),
        started: (v) => !!v && aksorReleased && (!v.paused || v.currentTime > 0),
        onBind(v) {
            const hold = () => { if (!aksorReleased) v.pause(); };
            v.addEventListener('play', hold);
            hold();
        },
        adState: () => (runs(q('[class*="_adContainer_"] video')) ? 'playing' : 'none'),
        start(v) {
            if (!v) return;
            aksorReleased = true;
            v.muted = false;
            if (v.volume === 0) v.volume = 1;
            // Плеер пропускает звук через свою обработку и включает её только своей кнопкой: от video.play() видео считается играющим, но время стоит
            const play = q('[aria-label="Play"]');
            if (play) play.click();
            else v.play().catch(() => {});
        }
    };

    // ---------- CVH (VK Video Player) ----------

    const cvhShadow = () => {
        const host = q('.shadow-root-container');
        return host ? host.shadowRoot : null;
    };
    const CVH_STYLE_ID = 'ag-shell-cvh';
    const cvh = {
        ...COMMON,
        id: 'cvh',
        name: 'CVH',
        deep: true,
        css: `
            body.ag-shell-on #app .controls { opacity: 0 !important; pointer-events: none !important; }
        `,
        video() {
            const root = cvhShadow();
            return root ? root.querySelector('video.player-media') : null;
        },
        adState() {
            if (runs(q('video.ad-module-player'))) return 'playing';
            return shown(q('.ad-wait-screen')) || shown(q('.ad-player')) ? 'visible' : 'none';
        },
        start(v) {
            const root = cvhShadow();
            const b = root && root.querySelector('.playButton');
            if (b && b.getBoundingClientRect().width) b.click();
            else if (v) v.play().catch(() => {});
        },
        // Родное управление скрыто, поэтому открытое меню зритель не видит
        openQuality() {
            const root = cvhShadow();
            if (!root || this.quality().length) return;
            const gear = root.querySelector('[data-testid="settings-btn"]');
            if (gear) gear.click();
            const row = root.querySelector('[data-testid="quality-settings"]');
            if (row) row.click();
        },
        quality() {
            const root = cvhShadow();
            if (!root) return [];
            return [...root.querySelectorAll('[data-testid="quality-settings-sub-menu"] li[data-value]')].map(el => ({
                label: el.getAttribute('aria-label') || el.textContent.trim(),
                current: el.getAttribute('aria-checked') === 'true' || el.classList.contains('selected') || el.classList.contains('active'),
                pick: () => el.click()
            }));
        },
        // Родное управление лежит в Shadow DOM, куда стили страницы не доходят
        inject(on) {
            const root = cvhShadow();
            if (!root) return;
            const had = root.getElementById(CVH_STYLE_ID);
            if (had && !on) had.remove();
            if (had || !on) return;
            const style = document.createElement('style');
            style.id = CVH_STYLE_ID;
            style.textContent = '.keyboard-controls > :not(.video-wrapper) { opacity: 0 !important; pointer-events: none !important; }';
            root.appendChild(style);
        }
    };

    // ---------- ceramet.net (Video.js) ----------

    const CERAMET_LISTS = { seasons: '.seasonSelect', episodes: '.episodeSelect', voices: '.voiceSelect' };
    const ceramet = {
        ...COMMON,
        id: 'ceramet',
        name: 'Parlorate',
        css: `
            body.ag-shell-on :is(.vjs-control-bar, .vjs-big-play-button, .vjs-loading-spinner, .vjs-poster, .playlistControlWrapper, .navigationArrow_wrapper,
                .skip-wrap, .storageButton-wrapper, .postload-wrapper, .tapSeek-wrapper, .loaderWrapper, .volumeChangeIndicator-wrapper) {
                opacity: 0 !important; pointer-events: none !important; }
        `,
        video: () => q('video.vjs-tech'),
        // Плеер сам пропускает песни и уводит с конца серии, даже если зритель это выключил. Пропуском управляет только настройка зрителя
        tick() {
            for (const selector of ['.postload-close-button', '.skip-wrap .close-button']) {
                const off = q(selector);
                if (off && off.getBoundingClientRect().width) off.click();
            }
        },
        videos: () => qa('video'),
        // Рекламный блок лежит в кадре всегда, а пустышка в нём играет и без рекламы
        adState() {
            const ad = qa('video.v-player__video').find(v => runs(v) && !/_blank\.mp4/.test(v.currentSrc));
            return ad || shown(q('.v-player__loader')) ? 'playing' : 'none';
        },
        ageGate() {
            const gate = q('.adult-container');
            return gate && gate.getBoundingClientRect().height > 0 ? gate : null;
        },
        start(v) {
            const b = q('.vjs-big-play-button');
            if (b) b.click();
            else if (v) v.play().catch(() => {});
        },
        // Родное управление скрыто, поэтому открытое меню зритель не видит
        openQuality() {
            if (this.quality().length) return;
            const gear = q('.videoConfig_button');
            if (gear) gear.click();
            const row = q('.configMenu[title="Select quality"]');
            if (row) row.click();
        },
        quality: () => qa('.configList-option').filter(el => /^(\d+p|auto)$/i.test(el.textContent.trim())).map(el => ({
            label: el.textContent.trim().replace(/^auto$/i, 'Авто'),
            current: el.classList.contains('configList-option__isSelected'),
            pick: () => el.click()
        })),
        read(kind) {
            return qa(`${CERAMET_LISTS[kind]} .ultimateSelect_option`).map((el, index) => {
                const text = el.textContent.trim();
                return {
                    index,
                    selected: el.classList.contains('ultimateSelect_option__isSelected'),
                    label: text.replace(/\s*(episode|season|серия|сезон)$/i, ''),
                    title: text,
                    type: /субтитр|subtitles/i.test(text) ? 'subtitles' : 'voice',
                    count: ''
                };
            });
        },
        choose(kind, index) {
            const el = qa(`${CERAMET_LISTS[kind]} .ultimateSelect_option`)[index];
            if (el && !el.classList.contains('ultimateSelect_option__isSelected')) el.click();
        }
    };

    // ---------- AniBoom (Shaka Player) ----------

    const aniboom = {
        ...COMMON,
        id: 'aniboom',
        name: 'AniBoom',
        css: `
            body.ag-shell-on :is(.shaka-controls-container, .shaka-spinner-container, .player-age-badge, .player-start-overlay) { opacity: 0 !important; pointer-events: none !important; }
        `,
        video: () => q('video.shaka-video'),
        videos: () => qa('video'),
        adState() {
            const ad = qa('video').find(v => !v.classList.contains('shaka-video') && runs(v));
            return ad || shown(q('.shaka-ad-controls')) ? 'playing' : 'none';
        },
        start(v) {
            // После этой кнопки плеер сам ищет рекламу и только потом грузит видео: второе нажатие в это время поставило бы его на паузу
            const b = q('.player-start-button');
            if (shown(b)) b.click();
            else if (v && v.duration > 0) v.play().catch(() => {});
        },
        quality: () => qa('.shaka-resolutions button:not(.shaka-back-to-overflow-button)').map(el => ({
            label: (el.querySelector('span') || el).textContent.trim().replace(/^Auto$/i, 'Авто'),
            current: el.getAttribute('aria-selected') === 'true' || !!el.querySelector('.shaka-chosen-item'),
            pick: () => el.click()
        }))
    };

    // ---------- Выбор адаптера по адресу кадра ----------

    const PLAYERS = [
        { host: /(^|\.)(alloha\.yani\.tv|thealloha\.club)$/, adapter: alloha },
        { host: /(^|\.)aksor\.tv$/, adapter: aksor },
        { host: /(^|\.)cdnvideohub\.com$/, adapter: cvh },
        { host: /(^|\.)ceramet\.net$/, adapter: ceramet },
        { host: /(^|\.)aniboom\.one$/, adapter: aniboom }
    ];
    function byHost(hostname) {
        const hit = PLAYERS.find(p => p.host.test(hostname));
        return hit ? hit.adapter : kodik;
    }

    const api = { byHost, current: () => byHost(location.hostname) };
    root.AgPlayerAdapters = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
