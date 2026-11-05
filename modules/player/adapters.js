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
    const CVH_MENUS = {
        episodes: { chip: 'button.chip--episode', row: '.nav-erow', matches: (el, item) => el.textContent.trim() === item.title },
        voices: {
            chip: 'button.chip--voice',
            row: '.nav-vrow',
            matches: (el, item) => {
                const name = el.querySelector('.nav-vrow-name');
                const note = el.querySelector('.nav-vrow-note');
                return !!name && name.textContent.trim() === item.title && (!note || note.textContent.trim() === item.note);
            }
        }
    };
    const CVH_MENU_STEP_MS = 200;
    const CVH_MENU_STEPS = 25;
    const CVH_QUALITY_STEP_MS = 100;
    const CVH_QUALITY_STEPS = 40;
    const CVH_MENU_OPEN = '[data-testid="settings-menu"], .sub-menu';
    // Плеер ещё несколько секунд отмечает прежнее качество: в это время его отметку не читаем
    const CVH_QUALITY_PICK_MS = 20000;
    const CVH_LEVELS = '[data-testid="quality-other-settings-sub-menu"] li[data-value]';
    let cvhQualityRun = 0;
    let cvhLevels = [];
    let cvhLevelsSrc = null;
    let cvhPickedAt = 0;
    const cvhLevelEls = (root) => [...root.querySelectorAll(CVH_LEVELS)];
    // Доходит по родному меню до разрешений: каждый уровень появляется не сразу, а обычные разрешения лежат в «Другое».
    // Пока видео идёт, кнопку настроек плеер показывает только при движении мыши
    const cvhOpenLevels = (alive) => new Promise((resolve) => {
        const pressed = new WeakSet();
        const press = (el) => {
            if (pressed.has(el)) return;
            pressed.add(el);
            el.click();
        };
        let steps = 0;
        const step = () => {
            const root = cvhShadow();
            if (!alive() || !root) return resolve(null);
            if (cvhLevelEls(root).length) return resolve(root);
            if (++steps > CVH_QUALITY_STEPS) return resolve(null);
            const next = root.querySelector('[data-testid="quality-other-settings"]') || root.querySelector('[data-testid="quality-settings"]');
            if (next) {
                press(next);
            } else if (!root.querySelector(CVH_MENU_OPEN)) {
                const gear = root.querySelector('[data-testid="settings-btn"]');
                if (gear) {
                    press(gear);
                } else {
                    [root.querySelector('.keyboard-controls'), q('#app')].forEach((el) => {
                        if (el) el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));
                    });
                }
            }
            setTimeout(step, CVH_QUALITY_STEP_MS);
            return undefined;
        };
        step();
    });
    const cvhCloseMenu = () => {
        const root = cvhShadow();
        if (!root || !root.querySelector(CVH_MENU_OPEN)) return;
        const gear = root.querySelector('[data-testid="settings-btn"]');
        if (gear) gear.click();
    };
    // Читает разрешения и сразу закрывает родное меню: дальше панель показывает запомненный список
    const cvhLoadLevels = async () => {
        const run = ++cvhQualityRun;
        const root = await cvhOpenLevels(() => run === cvhQualityRun);
        if (run !== cvhQualityRun) return;
        if (root) {
            cvhLevels = cvhLevelEls(root).map(el => ({
                value: el.dataset.value,
                label: el.getAttribute('aria-label') || el.textContent.trim(),
                current: !!el.querySelector('[data-selected="true"]')
            }));
        }
        cvhCloseMenu();
    };
    const cvhPickLevel = async (value) => {
        cvhPickedAt = Date.now();
        cvhLevels = cvhLevels.map(l => ({ ...l, current: l.value === value }));
        const run = ++cvhQualityRun;
        const root = await cvhOpenLevels(() => run === cvhQualityRun);
        if (run !== cvhQualityRun) return;
        const el = root && cvhLevelEls(root).find(x => x.dataset.value === value);
        if (el) el.click();
        else cvhCloseMenu();
    };
    const cvhControls = () => {
        const c = root.AgCvhControls;
        return c && c.currentEpisode ? c : null;
    };
    const cvh = {
        ...COMMON,
        id: 'cvh',
        name: 'CVH',
        deep: true,
        // Сам запускает серию, выбранную в его меню
        startsPickedEpisode: true,
        css: `
            body.ag-shell-on #app :is(.controls, .player-nav-button, .nav-menu, .nav-scrim) { opacity: 0 !important; pointer-events: none !important; }
        `,
        video() {
            const root = cvhShadow();
            return root ? root.querySelector('video.player-media') : null;
        },
        // Плеер сам рассказывает о сериях и озвучках: только там, где сайт не ведёт их сам (см. modules/player/boot.js)
        read(kind) {
            const c = cvhControls();
            if (!c) return [];
            if (kind === 'episodes') {
                if (!c.isSerial || c.isShowVoiceOnly || !c.currentSeason) return [];
                return Object.values(c.currentSeason.episodes).sort((a, b) => a.name - b.name).map((e, index) => {
                    const label = String(e.visibleName || e.name);
                    return { index, selected: e.name === c.currentEpisode.name, label, title: `Серия ${label}`, type: 'voice', count: '' };
                });
            }
            if (kind === 'voices') {
                return Object.values(c.currentEpisode.voices || {}).map((v, index) => {
                    const title = v.voiceStudio || v.name;
                    return { index, selected: !!c.currentVoice && v.name === c.currentVoice.name, label: title, title, note: v.voiceType || '', type: /субтитр/i.test(v.voiceType || '') ? 'subtitles' : 'voice', count: '' };
                });
            }
            return [];
        },
        // Пока плеер не рассказал о себе, считаем, что списки будут: иначе выбор нужной серии при запуске не дождётся их
        hasLists() { return !!root.AgCvhOwnLists && (!cvhControls() || this.read('episodes').length > 0); },
        // Строки есть только в открытом родном меню. Оно скрыто оболочкой и появляется не сразу, а при смене серии ненадолго пропадает кнопка
        choose(kind, index) {
            const menu = CVH_MENUS[kind];
            const item = this.read(kind)[index];
            if (!menu || !item || item.selected) return;
            let steps = 0;
            let opened = false;
            const step = () => {
                const row = qa(menu.row).find(el => menu.matches(el, item));
                if (row) {
                    row.click();
                    return;
                }
                if (++steps > CVH_MENU_STEPS) return;
                if (!opened && !q('.nav-menu')) {
                    const chip = q(menu.chip);
                    if (chip) {
                        chip.click();
                        opened = true;
                    } else {
                        // Пока видео идёт, плеер убирает кнопки и возвращает их при движении мыши
                        const app = q('#app');
                        if (app) app.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true }));
                    }
                }
                setTimeout(step, CVH_MENU_STEP_MS);
            };
            step();
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
        // Родное управление скрыто, поэтому зритель не видит, как открывается меню. Панель показывает запомненный список
        openQuality() {
            return cvhLevels.length ? Promise.resolve() : cvhLoadLevels();
        },
        // Список узнаём заранее и обновляем с новой серией: у разных серий разрешения могут отличаться
        refreshQuality(v) {
            if (!v || !v.currentSrc || v.currentSrc === cvhLevelsSrc) return;
            cvhLevelsSrc = v.currentSrc;
            if (Date.now() - cvhPickedAt > CVH_QUALITY_PICK_MS) cvhLoadLevels();
        },
        quality() {
            return cvhLevels.map(l => ({ label: l.label, current: l.current, pick: () => cvhPickLevel(l.value) }));
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

    // ---------- Серия, выбранная зрителем ----------

    const HOLD_STEP_MS = 100;
    const HOLD_WAIT_MS = 30000;
    const HOLD_SETTLE_MS = 1500;
    const HOLD_OWN_ACTION_MS = 300;

    /** Плеер сам запускает выбранную серию, а зритель выбрал её, чтобы запустить сам. Возвращает отмену */
    function holdPickedEpisode(player) {
        const current = player.video();
        const before = current ? current.currentSrc : '';
        const startedAt = Date.now();
        let pausedAt = 0;
        let timer = null;
        const stop = () => {
            clearInterval(timer);
            document.removeEventListener('pointerdown', onViewer, true);
            document.removeEventListener('keydown', onViewer, true);
        };
        // Своё нажатие зрителя важнее. Само нажатие, выбравшее серию, сюда не считается
        const onViewer = () => { if (Date.now() - startedAt > HOLD_OWN_ACTION_MS) stop(); };
        document.addEventListener('pointerdown', onViewer, true);
        document.addEventListener('keydown', onViewer, true);
        timer = setInterval(() => {
            const now = Date.now();
            if (now - startedAt > HOLD_WAIT_MS || (pausedAt && now - pausedAt > HOLD_SETTLE_MS)) return stop();
            const v = player.video();
            if (!v || !v.currentSrc || v.currentSrc === before || player.adState(v) !== 'none' || v.paused) return undefined;
            v.pause();
            pausedAt = now;
            return undefined;
        }, HOLD_STEP_MS);
        return stop;
    }

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

    const api = { byHost, current: () => byHost(location.hostname), holdPickedEpisode };
    root.AgPlayerAdapters = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
