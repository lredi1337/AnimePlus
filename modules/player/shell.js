// modules/player/shell.js
// Оболочка плеера, вариант «Кинотеатр». Живёт в Shadow DOM внутри iframe плеера, поэтому стили не пересекаются ни с плеером, ни с сайтом.
// Своей логики воспроизведения нет: управляет родным <video> и родными списками через адаптер плеера (modules/player/adapters.js).
// Реклама не трогается: пока она идёт, виден родной интерфейс. При любой ошибке оболочка снимается и плеер остаётся обычным.

(function (root) {
    'use strict';

    const { MANUAL_SKIP_SEC, icon, paintSkin, STYLE, TEMPLATE } = root.AgShellView;
    const EPISODE_GROUP = 100;
    const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
    const SEEN_KEY = 'ag_seen_eps';
    const SEEN_MAX_TITLES = 300;
    const SEEN_AT = 0.8;
    const SYNC_MS = 400;
    const DOUBLE_CLICK_MS = 250;
    // Столько ждём автозапуск следующей серии, потом показываем кнопку
    const AUTOSTART_WAIT_MS = 6000;
    // Kodik на мгновение показывает пустой рекламный блок и без рекламы: это ещё не реклама, иначе оболочка мигает и теряет нажатия
    const AD_CONFIRM_MS = 1200;
    const HIDE_CONTROLS_MS = 2000;
    const VOLUME_STEP = 0.01;
    // Столько плееру нужно, чтобы показать список качества в своём меню
    const QUALITY_MENU_MS = 250;
    // Плеер показывает ошибку и когда видео идёт. Настоящая ошибка: видео стоит столько времени
    const FAULT_CONFIRM_MS = 3000;

    // ---------- Чистые функции ----------

    function formatTime(sec) {
        const s = Math.max(0, Math.floor(Number(sec) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = String(s % 60).padStart(2, '0');
        return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
    }

    /** Группы длинного сериала: [{ label, from, to }]. До одной сотни группы не нужны */
    function episodeGroups(episodes) {
        if (episodes.length <= EPISODE_GROUP) return [];
        const groups = [];
        for (let i = 0; i < episodes.length; i += EPISODE_GROUP) {
            const chunk = episodes.slice(i, i + EPISODE_GROUP);
            groups.push({ label: `${chunk[0].label}–${chunk[chunk.length - 1].label}`, from: i, to: i + chunk.length });
        }
        return groups;
    }

    /** Сначала озвучки из списка приоритетов в его порядке, затем остальные как у Kodik */
    function sortVoices(voices, priority) {
        const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '');
        const rank = (v) => {
            const name = clean(v.title);
            const i = (priority || []).findIndex((p) => {
                const c = clean(p);
                return c && (name.includes(c) || c.includes(name));
            });
            return i < 0 ? Infinity : i;
        };
        return voices.map((v, i) => ({ v, i, r: rank(v) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.v);
    }

    /** Что показывать: реклама (оболочка уходит с экрана), экран запуска, загрузка или сам эпизод */
    function playerMode({ active, ready, adPlaying, hasVideo, autoStarting }) {
        if (adPlaying) return 'ad';
        if (!active) return autoStarting ? 'loading' : 'start';
        return ready && hasVideo ? 'play' : 'loading';
    }

    /** Ответ зрителя: Kodik сохраняет его в этой вкладке, но всё равно показывает окно на каждой серии */
    function ageConfirmed() {
        try { return sessionStorage.getItem('minAgeConfirmed') === 'true'; } catch (e) { return false; }
    }

    // Родной интерфейс скрыт, но остаётся в разметке: его логика продолжает работать
    const NATIVE_CSS = `
        body.ag-shell-on { background: #000 !important; }
    `;

    /**
     * options: { getSettings, patchSettings(patch), getTimings(), nav(dir), toggleFs(), openSettings(), onVoicePicked(text), expectsAutoStart(), sitePick(kind, index) }
     * Возвращает { destroy } или null, если подключиться нельзя.
     */
    function create(options) {
        if (!document.body || document.getElementById('ag-shell')) return null;
        const player = options.player || root.AgPlayerAdapters.current();
        const host = document.createElement('div');
        host.id = 'ag-shell';
        host.style.cssText = 'position:fixed;inset:0;z-index:9999980;display:none;';
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
        const nativeStyle = document.createElement('style');
        nativeStyle.id = 'ag-shell-native';
        nativeStyle.textContent = NATIVE_CSS + player.css;
        document.head.appendChild(nativeStyle);
        document.body.appendChild(host);

        const $ = (s) => shadow.querySelector(s);
        const rootEl = $('.root');
        const panel = $('.panel');
        let video = null;
        let mode = null;
        let adSeenSince = 0;
        const bornAt = Date.now();
        let openPanel = null;
        let idleTimer = null;
        let clickTimer = null;
        let dragging = false;
        let noteTimer = null;
        let rewindSum = 0;
        let rewindTimer = null;
        let destroyed = false;
        let seen = new Set();
        let seenMarked = false;
        let episodeGroup = null;
        let rangeGridOpen = false;
        let fullShown = false;
        let resumeAfterGate = false;
        let siteData = null;
        const titleName = () => (siteData && siteData.title) || (player.id === 'kodik' ? document.title : '') || '';
        const titleKey = () => titleName().trim().toLowerCase();

        const settings = () => options.getSettings() || {};

        // Тема меняется на странице настроек: открытая вкладка подхватывает её при следующей сверке
        // Встроенная или своя тема (основа плюс переменные), неизвестная — нынешний вид
        function applySkin() {
            paintSkin(rootEl, settings());
        }

        // ---------- Просмотренные серии ----------

        const loadSeen = () => chrome.storage.local.get(SEEN_KEY).then((saved) => {
            const entry = saved && saved[SEEN_KEY] && saved[SEEN_KEY][titleKey()];
            seen = new Set(entry ? entry.eps : []);
        }).catch(() => {});
        loadSeen();

        const markSeen = (episode) => {
            if (!episode || seen.has(episode) || !titleKey()) return;
            seen.add(episode);
            chrome.storage.local.get(SEEN_KEY).then((saved) => {
                const all = (saved && saved[SEEN_KEY]) || {};
                all[titleKey()] = { eps: [...seen], at: Date.now() };
                const keys = Object.keys(all);
                if (keys.length > SEEN_MAX_TITLES) {
                    keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - SEEN_MAX_TITLES).forEach((k) => { delete all[k]; });
                }
                return chrome.storage.local.set({ [SEEN_KEY]: all });
            }).catch(() => {});
        };

        // ---------- Показ и скрытие ----------

        const wake = () => {
            rootEl.classList.remove('idle');
            clearTimeout(idleTimer);
            if (mode === 'start' || mode === 'loading' || openPanel || dragging || (video && video.paused)) return;
            idleTimer = setTimeout(() => rootEl.classList.add('idle'), HIDE_CONTROLS_MS);
        };

        const note = (text) => {
            const el = $('.note');
            el.textContent = text;
            el.classList.add('on');
            clearTimeout(noteTimer);
            noteTimer = setTimeout(() => el.classList.remove('on'), 800);
        };

        // ---------- Данные на экране ----------

        // Родные списки плеера, а если плеер открыт на одну серию или сайт ведёт списки сам, то списки со страницы сайта
        const usesSite = (kind) => !!(siteData && siteData[kind] && siteData[kind].length) && (player.siteFirst || player.read(kind).length <= 1);
        const listOf = (kind) => (usesSite(kind) ? siteData[kind] : player.read(kind));
        const pickItem = (kind, index) => {
            if (usesSite(kind)) {
                options.sitePick(kind, index);
                return;
            }
            if (kind === 'voices' && options.onOwnVoiceChange) options.onOwnVoiceChange();
            if (kind === 'episodes' && options.onOwnEpisodePick) options.onOwnEpisodePick();
            player.choose(kind, index);
        };
        const currentEpisode = () => listOf('episodes').find(o => o.selected);
        const sitePlayers = () => (siteData && siteData.players ? siteData.players : []);

        let headKey = '';
        function renderHead() {
            $('.title').textContent = titleName().trim();
            const seasons = player.read('seasons');
            // Единственный первый сезон упоминать незачем
            const season = seasons.length > 1 || (seasons[0] && seasons[0].label !== '1') ? seasons.find(o => o.selected) : null;
            const ep = currentEpisode();
            const voice = listOf('voices').find(o => o.selected);
            $('.player-name').textContent = player.name ? `Плеер ${player.name}` : '';
            const before = headKey;
            headKey = $('.sub').textContent = [season && `Сезон ${season.label}`, ep && `Серия ${ep.label}`, voice && voice.title].filter(Boolean).join(' · ');
            // Открытая панель серий отмечает новую серию вместе с заголовком: не все плееры сообщают о смене,
            // а заголовок перерисовывают и смена режима, и обход плеера
            if (before && headKey !== before && openPanel === 'episodes') renderEpisodes();
        }

        function renderNav() {
            const list = listOf('episodes');
            const hasList = list.length > 0;
            const i = list.findIndex(o => o.selected);
            $('[data-act="prev"]').style.display = hasList && i <= 0 ? 'none' : '';
            $('[data-act="next"]').style.display = hasList && i >= list.length - 1 ? 'none' : '';
            // На сайтах с одной серией в плеере список серий находится на самой странице
            $('[data-act="episodes"]').style.display = list.length > 1 || player.read('seasons').length > 1 ? '' : 'none';
            $('[data-act="voices"]').style.display = listOf('voices').length > 1 ? '' : 'none';
            $('[data-act="players"]').style.display = sitePlayers().length > 1 ? '' : 'none';
        }

        function renderState() {
            const paused = !video || video.paused;
            const big = $('.big');
            big.innerHTML = icon(paused ? 'play' : 'pause');
            big.setAttribute('aria-label', paused ? 'Играть' : 'Пауза');
            if (!video) return;
            const muted = video.muted || video.volume === 0;
            $('[data-act="mute"]').innerHTML = icon(muted ? 'mute' : 'vol');
            $('.slider i').style.width = `${(muted ? 0 : video.volume) * 100}%`;
        }

        function renderProgress() {
            if (!video || !video.duration) return;
            const d = video.duration;
            const p = (video.currentTime / d) * 100;
            $('.done').style.width = `${p}%`;
            $('.thumb').style.left = `${p}%`;
            $('.clock').textContent = `${formatTime(video.currentTime)} / ${formatTime(d)}`;
            const b = video.buffered;
            for (let i = 0; i < b.length; i++) {
                if (b.start(i) <= video.currentTime && video.currentTime <= b.end(i)) {
                    $('.buffer').style.width = `${(b.end(i) / d) * 100}%`;
                    break;
                }
            }
        }

        function renderZones() {
            const box = $('.zones');
            box.replaceChildren();
            if (!video || !video.duration) return;
            const t = options.getTimings() || {};
            for (const part of ['op', 'ed']) {
                const r = t[part];
                if (!r || !(r.end > r.start)) continue;
                const z = document.createElement('i');
                z.className = 'zone';
                z.style.left = `${(r.start / video.duration) * 100}%`;
                z.style.width = `${((r.end - r.start) / video.duration) * 100}%`;
                box.appendChild(z);
            }
        }

        // ---------- Панели ----------

        // Прокручиваем только сам список: scrollIntoView сдвинул бы и страницу сайта
        function revealInList(scroll, el) {
            if (el) scroll.scrollTop = el.offsetTop - scroll.clientHeight / 2;
        }

        function panelHead(title) {
            const h = document.createElement('h3');
            h.textContent = title;
            const close = document.createElement('button');
            close.innerHTML = icon('close');
            close.setAttribute('aria-label', 'Закрыть');
            close.addEventListener('click', closePanel);
            h.appendChild(close);
            return h;
        }

        // Ряд кнопок прокручивается вбок, а полоса прокрутки скрыта: колесо мыши крутит его вбок
        function chips(items, onPick) {
            const box = document.createElement('div');
            box.className = 'chips';
            box.addEventListener('wheel', (e) => {
                if (box.scrollWidth <= box.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
                box.scrollLeft += e.deltaY;
                e.preventDefault();
            }, { passive: false });
            for (const it of items) {
                const b = document.createElement('button');
                b.className = `chip${it.on ? ' on' : ''}`;
                b.textContent = it.label;
                b.addEventListener('click', () => onPick(it));
                box.appendChild(b);
            }
            return box;
        }

        // Плеер без родных списков на странице сам сообщает о смене серии: открытая панель не должна отставать
        const onPlayerLists = () => {
            renderNav();
            if (openPanel === 'episodes') renderEpisodes();
        };
        document.addEventListener('ag-player-lists', onPlayerLists);

        function renderEpisodes() {
            panel.replaceChildren(panelHead('Серии'));
            const seasons = player.read('seasons');
            if (seasons.length > 1) {
                panel.appendChild(chips(seasons.map(s => ({ label: `Сезон ${s.label}`, on: s.selected, index: s.index })), it => player.choose('seasons', it.index)));
            }
            const list = listOf('episodes');
            const groups = episodeGroups(list);
            const nowIndex = list.findIndex(o => o.selected);
            if (groups.length) {
                if (episodeGroup === null) episodeGroup = Math.max(0, groups.findIndex(g => nowIndex >= g.from && nowIndex < g.to));
                // Одна строка: поиск по номеру и «‹ сотня ›». Нажатие на сотню раскрывает сетку всех сотен
                const row = document.createElement('div');
                row.className = 'find-row';
                const field = document.createElement('label');
                field.className = 'field';
                field.innerHTML = `${icon('search')}<input inputmode="numeric" placeholder="Номер серии" aria-label="Номер серии">`;
                const step = document.createElement('div');
                step.className = 'range-step';
                step.innerHTML = `<button class="range-prev" aria-label="Предыдущие серии">${icon('chevronLeft')}</button><button class="range-now" aria-expanded="${rangeGridOpen}" aria-label="Все серии по сотням"></button><button class="range-next" aria-label="Следующие серии">${icon('chevronRight')}</button>`;
                step.querySelector('.range-now').textContent = groups[episodeGroup].label;
                const prev = step.querySelector('.range-prev');
                const next = step.querySelector('.range-next');
                prev.disabled = episodeGroup === 0;
                next.disabled = episodeGroup === groups.length - 1;
                const goGroup = (g) => {
                    episodeGroup = g;
                    rangeGridOpen = false;
                    renderEpisodes();
                };
                prev.addEventListener('click', () => goGroup(Math.max(0, episodeGroup - 1)));
                next.addEventListener('click', () => goGroup(Math.min(groups.length - 1, episodeGroup + 1)));
                step.querySelector('.range-now').addEventListener('click', () => {
                    rangeGridOpen = !rangeGridOpen;
                    renderEpisodes();
                });
                row.append(field, step);
                panel.appendChild(row);
                if (rangeGridOpen) {
                    const grid = document.createElement('div');
                    grid.className = 'range-grid';
                    groups.forEach((g, i) => {
                        const b = document.createElement('button');
                        b.className = i === episodeGroup ? 'on' : '';
                        b.textContent = g.label;
                        b.addEventListener('click', () => goGroup(i));
                        grid.appendChild(b);
                    });
                    panel.appendChild(grid);
                }
                const input = field.querySelector('input');
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key !== 'Enter') return;
                    const hit = list.find(o => o.label === input.value.trim());
                    if (hit) pickItem('episodes', hit.index);
                });
                input.addEventListener('input', () => {
                    const i = list.findIndex(o => o.label === input.value.trim());
                    if (i < 0) return;
                    const g = groups.findIndex(x => i >= x.from && i < x.to);
                    if (g !== episodeGroup) {
                        const value = input.value;
                        goGroup(g);
                        const again = panel.querySelector('.find-row input');
                        again.value = value;
                        again.focus();
                    }
                });
            }
            const scroll = document.createElement('div');
            scroll.className = 'scroll';
            const grid = document.createElement('div');
            grid.className = 'grid';
            const range = groups.length ? groups[episodeGroup] : { from: 0, to: list.length };
            let current = null;
            for (const o of list.slice(range.from, range.to)) {
                const b = document.createElement('button');
                b.className = `ep${o.selected ? ' now' : ''}${(o.seen || seen.has(o.label)) && !o.selected ? ' seen' : ''}`;
                b.textContent = o.label;
                b.setAttribute('aria-label', `Серия ${o.label}`);
                b.addEventListener('click', () => pickItem('episodes', o.index));
                if (o.selected) current = b;
                grid.appendChild(b);
            }
            scroll.appendChild(grid);
            panel.appendChild(scroll);
            revealInList(scroll, current);
        }

        function renderVoices(filter = '', tab = null) {
            panel.replaceChildren(panelHead('Озвучка'));
            const all = sortVoices(listOf('voices'), settings().auto_select_voice === false ? [] : settings().voice_priority_list);
            const field = document.createElement('label');
            field.className = 'field';
            field.innerHTML = `${icon('search')}<input placeholder="Найти озвучку" aria-label="Найти озвучку">`;
            panel.appendChild(field);
            const input = field.querySelector('input');
            input.value = filter;
            const voices = all.filter(v => v.type !== 'subtitles');
            const subs = all.filter(v => v.type === 'subtitles');
            const selected = all.find(v => v.selected);
            const activeTab = tab || (selected && selected.type === 'subtitles' ? 'subtitles' : 'voice');
            if (voices.length && subs.length) {
                panel.appendChild(chips([
                    { label: `Озвучка ${voices.length}`, on: activeTab === 'voice', id: 'voice' },
                    { label: `Субтитры ${subs.length}`, on: activeTab === 'subtitles', id: 'subtitles' }
                ], it => renderVoices(input.value, it.id)));
            }
            const scroll = document.createElement('div');
            scroll.className = 'scroll';
            const needle = filter.trim().toLowerCase();
            const shown = (activeTab === 'subtitles' ? subs : voices).filter(v => !needle || v.title.toLowerCase().includes(needle));
            let current = null;
            for (const v of shown) {
                const b = document.createElement('button');
                b.className = `row${v.selected ? ' on' : ''}`;
                b.innerHTML = `<span class="mark">${v.selected ? icon('check') : ''}</span><span class="name"></span><span class="meta"></span>`;
                b.querySelector('.name').textContent = v.title;
                b.querySelector('.meta').textContent = v.count ? `${v.count} сер.` : '';
                b.addEventListener('click', () => {
                    if (v.selected) return;
                    if (guideOpen) closeGuide();
                    if (options.onVoicePicked && !usesSite('voices')) options.onVoicePicked(v.title);
                    pickItem('voices', v.index);
                });
                if (v.selected) current = b;
                scroll.appendChild(b);
            }
            if (!shown.length) {
                const none = document.createElement('div');
                none.className = 'none';
                none.textContent = 'Такой озвучки нет.';
                scroll.appendChild(none);
            }
            panel.appendChild(scroll);
            revealInList(scroll, current);
            input.addEventListener('keydown', e => e.stopPropagation());
            input.addEventListener('input', () => {
                const value = input.value;
                renderVoices(value, activeTab);
                const again = panel.querySelector('input');
                again.focus();
                again.setSelectionRange(value.length, value.length);
            });
        }

        function toggleRow(label, on, onChange) {
            const b = document.createElement('button');
            b.className = `row${on ? ' on' : ''}`;
            b.setAttribute('role', 'switch');
            b.setAttribute('aria-checked', String(on));
            b.innerHTML = '<span class="name"></span><span class="sw"></span>';
            b.querySelector('.name').textContent = label;
            b.addEventListener('click', () => onChange(!on));
            return b;
        }

        function renderPlayers() {
            panel.replaceChildren(panelHead('Плеер'));
            const scroll = document.createElement('div');
            scroll.className = 'scroll';
            for (const p of sitePlayers()) {
                const b = document.createElement('button');
                b.className = `row player-row${p.selected ? ' on' : ''}`;
                b.innerHTML = `<span class="mark">${p.selected ? icon('check') : ''}</span><span class="name"></span>`;
                b.querySelector('.name').textContent = p.title;
                b.addEventListener('click', () => {
                    if (p.selected) return;
                    if (guideOpen) closeGuide();
                    // Новый плеер запустится сам: этот должен замолчать сразу, а не когда его кадр уберут
                    if (video) video.pause();
                    // Открытая панель осталась бы здесь до возвращения на этот плеер, уже с устаревшим выбором
                    closePanel();
                    options.sitePick('players', p.index);
                });
                scroll.appendChild(b);
            }
            panel.appendChild(scroll);
        }

        function renderSettings() {
            panel.replaceChildren(panelHead('Настройки'));
            const scroll = document.createElement('div');
            scroll.className = 'scroll';
            const cap = (text) => {
                const c = document.createElement('div');
                c.className = 'cap';
                c.textContent = text;
                scroll.appendChild(c);
            };
            const items = player.quality();
            if (items.length) {
                cap('Качество');
                for (const it of items) {
                    const b = document.createElement('button');
                    b.className = `row${it.current ? ' on' : ''}`;
                    b.innerHTML = `<span class="mark">${it.current ? icon('check') : ''}</span><span class="name"></span>`;
                    b.querySelector('.name').textContent = it.label;
                    b.addEventListener('click', () => {
                        it.pick();
                        if (!player.refreshQuality) {
                            setTimeout(renderSettings, 150);
                            return;
                        }
                        // Плеер с запомненным списком отвечает сразу: перерисовка не должна сбивать прокрутку и мигать
                        const position = scroll.scrollTop;
                        renderSettings();
                        const fresh = panel.querySelector('.scroll');
                        if (fresh) fresh.scrollTop = position;
                    });
                    scroll.appendChild(b);
                }
            }
            if (video) {
                cap('Скорость');
                const box = chips(SPEEDS.map(s => ({ label: `${s}x`, on: video.playbackRate === s, s })), (it) => {
                    video.playbackRate = it.s;
                    renderSettings();
                });
                box.style.margin = '4px 8px 0';
                box.style.flexWrap = 'wrap';
                scroll.appendChild(box);
            }
            cap('Просмотр');
            const s = settings();
            const skip = (key) => s.autoSkip !== false && s[key] !== false;
            const set = async (patch) => {
                await options.patchSettings(patch);
                renderSettings();
            };
            // Общая настройка должна остаться включённой, если нужна хотя бы одна из частей
            scroll.appendChild(toggleRow('Автопропуск опенинга', skip('autoSkipOp'), v => set({ autoSkip: true, autoSkipOp: v, autoSkipEd: skip('autoSkipEd') })));
            scroll.appendChild(toggleRow('Автопропуск эндинга', skip('autoSkipEd'), v => set({ autoSkip: true, autoSkipOp: skip('autoSkipOp'), autoSkipEd: v })));
            scroll.appendChild(toggleRow('Автопереход на следующую серию', s.autoNext !== false, v => set({ autoNext: v })));
            scroll.appendChild(toggleRow('Автозапуск серии', s.autoPlay !== false, v => set({ autoPlay: v })));
            scroll.appendChild(toggleRow('Пропуск по звуку', s.audioSkip !== false, v => set({ audioSkip: v })));
            scroll.appendChild(toggleRow('Двойной клик: перемотка и весь экран', s.showDBL !== false, v => set({ showDBL: v })));
            const more = document.createElement('button');
            more.className = 'row';
            more.innerHTML = '<span class="name">Озвучка, клавиши и другие настройки</span>';
            more.addEventListener('click', () => options.openSettings());
            scroll.appendChild(more);
            panel.appendChild(scroll);
            // Список качества приходит позже и перерисовывает панель: подсветка лисы не должна пропасть
            if (guideTip && guideTip.panel === 'settings') spotGuideTarget();
        }

        // Звук выключил сам зритель: плееры, которые глушат себя при запуске, отличаются от этого только такой отметкой
        function rememberMute(muted) {
            if (!!settings().playerMuted !== muted) options.patchSettings({ playerMuted: muted });
        }

        const PANELS = { episodes: renderEpisodes, voices: () => renderVoices(), players: renderPlayers, settings: renderSettings };

        // Кнопка открытой панели отмечена: темы подсвечивают её
        const markPanelButtons = () => {
            for (const name of Object.keys(PANELS)) $(`[data-act="${name}"]`).setAttribute('aria-expanded', String(openPanel === name));
        };

        function togglePanel(name, byGuide = false) {
            if (openPanel === name) return closePanel();
            openPanel = name;
            episodeGroup = null;
            rangeGridOpen = false;
            // Зритель мог сменить плеер на сайте: у каждой вкладки свой кадр, и список плееров в нём мог устареть
            if (options.refreshSite) options.refreshSite();
            if (name !== 'settings' && name !== 'players' && options.guide && !byGuide) options.guide.mark('panel');
            panel.classList.add('on');
            rootEl.classList.add('with-panel');
            document.body.classList.add('ag-shell-panel');
            markPanelButtons();
            PANELS[name]();
            wake();
            if (name === 'settings' && player.openQuality && !player.quality().length) {
                const show = () => { if (openPanel === 'settings') renderSettings(); };
                const opening = player.openQuality();
                if (opening && opening.then) opening.then(show);
                else setTimeout(show, QUALITY_MENU_MS);
            } else if (name === 'settings' && player.openQuality && !player.refreshQuality) {
                player.openQuality();
                setTimeout(() => { if (openPanel === 'settings') renderSettings(); }, QUALITY_MENU_MS);
            }
        }

        function closePanel() {
            openPanel = null;
            panel.classList.remove('on');
            rootEl.classList.remove('with-panel');
            document.body.classList.remove('ag-shell-panel');
            markPanelButtons();
            panel.replaceChildren();
            wake();
        }

        // ---------- Действия ----------

        const startNative = () => player.start(player.video());

        const toggle = () => {
            if (mode === 'start') return startNative();
            if (!video) return;
            if (video.paused) video.play().catch(() => {}); else video.pause();
        };

        const rewind = (sec) => {
            if (!video) return;
            rewindSum += sec;
            note(`${rewindSum > 0 ? '+' : ''}${rewindSum} с`);
            clearTimeout(rewindTimer);
            rewindTimer = setTimeout(() => {
                video.currentTime = Math.max(0, Math.min(video.duration || Infinity, video.currentTime + rewindSum));
                rewindSum = 0;
            }, 350);
        };

        const ACTIONS = {
            toggle,
            back: () => rewind(-5),
            fwd: () => rewind(5),
            prev: () => options.nav('prev'),
            next: () => options.nav('next'),
            episodes: () => togglePanel('episodes'),
            voices: () => togglePanel('voices'),
            players: () => togglePanel('players'),
            settings: () => togglePanel('settings'),
            full: () => options.toggleFs(),
            skip: () => {
                if (!video) return;
                video.currentTime = Math.min(video.duration || Infinity, video.currentTime + MANUAL_SKIP_SEC);
                note(`+${MANUAL_SKIP_SEC} с`);
                if (options.guide) options.guide.mark('skip');
            },
            mute: () => {
                if (!video) return;
                rememberMute(!video.muted);
                video.muted = !video.muted;
                if (!video.muted && video.volume === 0) video.volume = 0.5;
            },
            pip: async () => {
                try {
                    if (document.pictureInPictureElement) await document.exitPictureInPicture();
                    else if (video) await video.requestPictureInPicture();
                } catch (e) {}
            }
        };

        rootEl.addEventListener('click', (e) => {
            const b = e.target.closest('[data-act]');
            if (b && ACTIONS[b.dataset.act]) {
                e.stopPropagation();
                ACTIONS[b.dataset.act]();
                wake();
            }
        });

        // Щелчок по кадру: пауза, двойной по краям перематывает, в центре разворачивает
        const surface = $('.surface');
        surface.addEventListener('click', (e) => {
            if (openPanel) return closePanel();
            if (mode === 'start') return startNative();
            const w = rootEl.clientWidth || 1;
            const x = e.clientX / w;
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
                if (settings().showDBL === false) return toggle();
                if (x < 0.25) rewind(-5);
                else if (x > 0.75) rewind(5);
                else options.toggleFs();
                return;
            }
            clickTimer = setTimeout(() => {
                clickTimer = null;
                toggle();
            }, DOUBLE_CLICK_MS);
        });

        // ---------- Шкала времени и громкость ----------

        const track = $('.track');
        const ratioAt = (e, el) => {
            const r = el.getBoundingClientRect();
            return Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1)));
        };

        // Миниатюры есть не у всех плееров: показываем, только если плеер отдал готовый кадр
        function nativePreview(ratio) {
            const pic = $('.tip .pic');
            const frame = player.preview(ratio);
            pic.style.display = frame ? 'block' : 'none';
            if (!frame) return;
            pic.style.backgroundImage = frame.image;
            pic.style.backgroundSize = frame.size;
            pic.style.backgroundPosition = frame.position;
        }

        function showTip(e) {
            if (!video || !video.duration) return;
            const ratio = ratioAt(e, track);
            const at = ratio * video.duration;
            const tip = $('.tip');
            const t = options.getTimings() || {};
            const inPart = (p) => t[p] && t[p].end > t[p].start && at >= t[p].start && at <= t[p].end;
            const name = inPart('op') ? 'Опенинг' : inPart('ed') ? 'Эндинг' : '';
            tip.querySelector('.name').textContent = name;
            tip.querySelector('.name').style.display = name ? '' : 'none';
            tip.querySelector('.time').textContent = formatTime(at);
            nativePreview(ratio);
            tip.classList.add('on');
            const half = tip.offsetWidth / 2;
            const w = track.clientWidth;
            tip.style.left = `${Math.max(half, Math.min(w - half, ratio * w))}px`;
        }

        track.addEventListener('pointermove', showTip);
        track.addEventListener('pointerleave', () => { if (!dragging) $('.tip').classList.remove('on'); });
        track.addEventListener('pointerdown', (e) => {
            if (!video || !video.duration) return;
            dragging = true;
            track.classList.add('drag');
            track.setPointerCapture(e.pointerId);
            const seek = (ev) => {
                const ratio = ratioAt(ev, track);
                $('.done').style.width = `${ratio * 100}%`;
                $('.thumb').style.left = `${ratio * 100}%`;
                showTip(ev);
                return ratio * video.duration;
            };
            let target = seek(e);
            const move = (ev) => { target = seek(ev); };
            const up = () => {
                dragging = false;
                track.classList.remove('drag');
                track.removeEventListener('pointermove', move);
                track.removeEventListener('pointerup', up);
                track.removeEventListener('pointercancel', up);
                video.currentTime = target;
                $('.tip').classList.remove('on');
                wake();
            };
            track.addEventListener('pointermove', move);
            track.addEventListener('pointerup', up);
            track.addEventListener('pointercancel', up);
        });

        const slider = $('.slider');
        const setVolume = (e) => {
            if (!video) return;
            video.volume = ratioAt(e, slider.firstElementChild);
            rememberMute(video.volume === 0);
            video.muted = video.volume === 0;
        };
        slider.addEventListener('pointerdown', (e) => {
            slider.setPointerCapture(e.pointerId);
            setVolume(e);
            const up = () => {
                slider.removeEventListener('pointermove', setVolume);
                slider.removeEventListener('pointerup', up);
            };
            slider.addEventListener('pointermove', setVolume);
            slider.addEventListener('pointerup', up);
        });
        $('.vol').addEventListener('wheel', (e) => {
            if (!video) return;
            e.preventDefault();
            const step = VOLUME_STEP;
            rememberMute(false);
            video.muted = false;
            video.volume = Math.max(0, Math.min(1, video.volume + (e.deltaY < 0 ? step : -step)));
            note(`Громкость ${Math.round(video.volume * 100)}%`);
        }, { passive: false });

        // ---------- Связь с плеером ----------

        const onVideoEvent = () => { renderState(); wake(); };
        const onTime = () => {
            if (dragging) return;
            renderProgress();
            if (!seenMarked && video.duration && video.currentTime / video.duration >= SEEN_AT) {
                seenMarked = true;
                const ep = currentEpisode();
                if (ep) markSeen(ep.label);
            }
        };

        function bindVideo(v) {
            if (video === v) return;
            video = v;
            seenMarked = false;
            ['play', 'pause', 'volumechange'].forEach(ev => v.addEventListener(ev, onVideoEvent));
            ['timeupdate', 'progress'].forEach(ev => v.addEventListener(ev, onTime));
            ['durationchange', 'loadedmetadata'].forEach(ev => v.addEventListener(ev, renderZones));
            renderState();
            renderProgress();
            renderZones();
        }

        function setMode(next) {
            if (next === mode) return;
            mode = next;
            // Родной интерфейс скрыт всегда: во время рекламы оболочка уходит и остаётся только сама реклама
            const show = next !== 'ad';
            host.style.display = show ? '' : 'none';
            document.body.classList.add('ag-shell-on');
            if (player.inject) player.inject(true);
            if (globalThis.AgPlayerBoot) globalThis.AgPlayerBoot.release();
            rootEl.classList.toggle('start', next === 'start');
            rootEl.classList.toggle('loading', next === 'loading');
            if (next === 'play') startGuide();
            if (show) {
                renderHead();
                renderNav();
                renderState();
                wake();
            } else {
                closePanel();
            }
        }

        // Настоящая ошибка: просим страницу перезагрузиться, место остановки вернётся. Страница делает это не чаще раза в несколько минут,
        // поэтому если не помогло, остаётся родное окно: оболочка его не закрывает
        let faultSince = 0;
        let faultTime = 0;
        let faultReported = false;
        function faultShown(v) {
            const failed = player.fault ? player.fault() : false;
            if (!failed || (v && !v.paused && v.currentTime !== faultTime)) {
                faultSince = 0;
                faultTime = v ? v.currentTime : 0;
                document.body.classList.remove('ag-shell-fault');
                return false;
            }
            if (!faultSince) faultSince = Date.now();
            if (Date.now() - faultSince < FAULT_CONFIRM_MS) return false;
            if (!faultReported && options.reloadPage) {
                faultReported = true;
                options.reloadPage();
            }
            document.body.classList.add('ag-shell-fault');
            return true;
        }

        function sync() {
            applySkin();
            const v = player.video();
            if (v) bindVideo(v);
            if (player.tick) player.tick();
            // Shadow DOM плеера появляется позже оболочки
            if (player.inject && mode) player.inject(true);
            // Другая вкладка плеера на сайте: кадр скрыт, а звук из него играть не должен
            if (v && !v.paused && options.isShown && !options.isShown()) v.pause();
            const ad = player.adState(v);
            if (ad === 'none') adSeenSince = 0;
            else if (!adSeenSince) adSeenSince = Date.now();
            // Ответить может только сам зритель: оболочка уходит с окна, а звук за окном не играет
            let gate = player.ageGate();
            if (gate && ageConfirmed()) {
                gate.click();
                gate = null;
            }
            if (gate && v && !v.paused) {
                v.pause();
                resumeAfterGate = true;
            } else if (!gate && resumeAfterGate) {
                resumeAfterGate = false;
                if (v) v.play().catch(() => {});
            }
            const adPlaying = faultShown(v) || !!gate || ad === 'playing' || (ad === 'visible' && Date.now() - adSeenSince >= AD_CONFIRM_MS);
            const autoStarting = (!!(options.expectsAutoStart && options.expectsAutoStart()) && Date.now() - bornAt < AUTOSTART_WAIT_MS)
                || !!(options.takingOver && options.takingOver());
            setMode(playerMode({ active: player.started(v), ready: player.ready(v), adPlaying, hasVideo: !!v, autoStarting }));
            // Только после запуска: до него идёт реклама, и родное меню трогать незачем
            if (mode === 'play' && player.refreshQuality) player.refreshQuality(v);
            if (guideOpen) wake();
            if (mode !== 'ad') {
                // Серия и сезон меняются и без смены режима: например, плеер открывает нужный сезон ещё до запуска
                const before = headKey;
                renderHead();
                if (headKey !== before) renderNav();
                renderZones();
                const full = document.body.dataset.agFsState === 'true';
                if (full !== fullShown) {
                    fullShown = full;
                    const b = $('[data-act="full"]');
                    b.innerHTML = icon(full ? 'unfull' : 'full');
                    b.setAttribute('aria-label', full ? 'Свернуть' : 'На весь экран');
                }
            }
        }

        // Подсказки лисы: один раз, при первом запуске серии. Видео не останавливают и нажатий не перехватывают
        const SITE_LISTS_WAIT_MS = 4000;
        const otherPair = (kind) => {
            const list = listOf(kind);
            const on = list.find(o => o.selected);
            const other = list.find(o => !o.selected);
            return on && other ? [on.title, other.title] : null;
        };
        // Панель лиса раскрывает только после того, как показала её кнопку: иначе непонятно, куда потом нажимать
        const hasVoices = () => listOf('voices').length > 1;
        const hasPlayers = () => sitePlayers().length > 1;
        const SWITCH_TIPS = [
            { target: '[data-act="voices"]', pose: 'down', when: hasVoices, text: 'Эта кнопка открывает список озвучек. Сейчас покажу, что внутри.' },
            { panel: 'voices', target: '.row:not(.on)', anchor: '[data-act="voices"]', pose: 'right', when: hasVoices, demo: () => otherPair('voices'), text: 'Озвучка меняется без перерыва: выберите другую, и видео само продолжится с этого же места. Ваш выбор запомнится для тайтла.' },
            { target: '[data-act="players"]', pose: 'down', when: hasPlayers, text: 'А эта кнопка открывает список плееров сайта.' },
            { panel: 'players', target: '.player-row:not(.on)', anchor: '[data-act="players"]', pose: 'right', when: hasPlayers, demo: () => {
                const on = sitePlayers().find(p => p.selected);
                const other = sitePlayers().find(p => !p.selected);
                return on && other ? [on.title, other.title] : null;
            }, text: 'Плеер тормозит? Здесь можно выбрать другой. Он продолжит с того же места и запустится сам, а полный экран не свернётся.' }
        ];
        const GUIDE_TIPS = [
            { target: '.rail', pose: 'down', text: 'Опенинг и эндинг отмечены на шкале. Если автопропуск включён, они пропускаются сами.' },
            { target: '.jump', pose: 'down', text: 'Меток нет или песня не пропустилась? Эта кнопка перематывает на 89 секунд.' },
            { target: '[data-act="episodes"]', pose: 'down', text: 'Эта кнопка открывает список серий. Серии меняются прямо здесь, даже в полном экране.' },
            { panel: 'episodes', target: '.grid', anchor: '[data-act="episodes"]', pose: 'right', text: 'Нажмите на номер, и серия сменится. Текущая серия выделена, просмотренные отмечены.' },
            ...SWITCH_TIPS,
            { target: '[data-act="settings"]', pose: 'down', text: 'Шестерёнка открывает настройки просмотра.' },
            { panel: 'settings', target: '.scroll', anchor: '[data-act="settings"]', pose: 'wink', text: 'Здесь качество, скорость и автопропуск. На этом всё, приятного просмотра!' }
        ];
        let guideOpen = false;
        let guideStarted = false;
        let guideSpot = null;
        let guideTip = null;
        let guidePanel = false;

        function spotGuideTarget() {
            if (guideSpot) guideSpot.classList.remove('guide-spot');
            guideSpot = (guideTip.panel && panel.querySelector(guideTip.target)) || $(guideTip.anchor || guideTip.target);
            guideSpot.classList.add('guide-spot');
            if (guideTip.panel && guideSpot.scrollIntoView) guideSpot.scrollIntoView({ block: 'nearest' });
        }

        function closeGuidePanel() {
            if (guidePanel) closePanel();
            guidePanel = false;
        }

        function closeGuide() {
            guideOpen = false;
            if (guideSpot) guideSpot.classList.remove('guide-spot');
            guideSpot = null;
            guideTip = null;
            closeGuidePanel();
            $('.guide').hidden = true;
            options.guide.tipsDone();
        }

        // Список плееров приходит от сайта позже подсказок, поэтому подходящие считаем на каждом шаге
        const guideTipFits = (t) => !t.when || t.when();

        function showGuideTip(tip, tips) {
            const live = tips.filter(guideTipFits);
            const index = live.indexOf(tip);
            const box = $('.guide');
            guideTip = tip;
            closeGuidePanel();
            // Смену показываем там, где она происходит: панель открыта, а нужная строка подсвечена
            if (tip.panel && openPanel !== tip.panel) {
                togglePanel(tip.panel, true);
                guidePanel = true;
            }
            spotGuideTarget();
            const isLast = index === live.length - 1;
            box.innerHTML = `<div class="fox">${options.guide.fox(tip.pose)}</div><div class="body"><p></p><div class="row"><span>${index + 1} из ${live.length}</span><button type="button" class="skip">Хватит</button><button type="button" class="go">${isLast ? 'Понятно' : 'Дальше'}</button></div></div>`;
            box.querySelector('p').textContent = tip.text;
            if (tip.demo && options.guide.demo) {
                const pair = tip.demo();
                if (pair) box.querySelector('.body').prepend(options.guide.demo(pair[0], pair[1], formatTime(video ? video.currentTime : 0)));
            }
            box.querySelector('.skip').hidden = isLast;
            box.querySelector('.skip').addEventListener('click', closeGuide);
            box.querySelector('.go').addEventListener('click', () => (isLast ? closeGuide() : showGuideTip(live[index + 1], tips)));
            box.hidden = false;
        }

        async function startGuide() {
            if (!options.guide || guideStarted) return;
            guideStarted = true;
            options.guide.mark('play');
            let list = GUIDE_TIPS;
            if (await options.guide.tipsSeen()) {
                // Подсказки уже видели до появления бесшовной смены: показываем только её
                if (!options.guide.switchTipSeen || await options.guide.switchTipSeen()) return;
                await new Promise(r => setTimeout(r, SITE_LISTS_WAIT_MS));
                list = SWITCH_TIPS;
            }
            // Кнопка панели может быть ещё скрыта, пока сайт не прислал списки: такие подсказки проверяются перед показом
            // У шага с панелью цель появляется только в открытой панели, поэтому проверяется её кнопка
            const shownEl = (t) => $(t.anchor || t.target);
            const tips = list.filter(t => t.when || (shownEl(t) && getComputedStyle(shownEl(t)).display !== 'none'));
            const first = tips.find(guideTipFits);
            if (destroyed || mode !== 'play' || !first) return;
            guideOpen = true;
            showGuideTip(first, tips);
        }

        function destroy() {
            if (destroyed) return;
            destroyed = true;
            clearInterval(syncTimer);
            document.removeEventListener('ag-player-lists', onPlayerLists);
            document.removeEventListener('mousemove', wake);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('keyup', onKeyUp, true);
            document.body.classList.remove('ag-shell-on', 'ag-shell-panel', 'ag-shell-fault');
            if (player.inject) player.inject(false);
            if (globalThis.AgPlayerBoot) globalThis.AgPlayerBoot.release();
            host.remove();
            nativeStyle.remove();
        }

        // Любая ошибка оболочки не должна мешать смотреть: возвращаем родной интерфейс
        const guarded = (fn) => (...args) => {
            try {
                return fn(...args);
            } catch (e) {
                console.error('[Anime+] Оболочка плеера отключена:', e);
                if (globalThis.AgDiag) globalThis.AgDiag.note('shell_off', e);
                destroy();
                return undefined;
            }
        };

        let spaceHandled = false;

        const onKey = (e) => {
            if (mode === 'ad') return;
            if (e.key === 'Escape' && openPanel) {
                e.stopPropagation();
                closePanel();
                return;
            }
            if (e.code === 'Space' && mode === 'play' && !e.composedPath().some(n => n.tagName === 'INPUT')) {
                e.preventDefault();
                e.stopPropagation();
                spaceHandled = true;
                if (!e.repeat) toggle();
            }
            wake();
        };

        // Kodik переключает паузу при отпускании пробела: без перехвата видео сразу запускается снова
        const onKeyUp = (e) => {
            if (e.code !== 'Space' || !spaceHandled) return;
            spaceHandled = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        };

        document.addEventListener('mousemove', wake);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKeyUp, true);
        const safeSync = guarded(sync);
        const syncTimer = setInterval(safeSync, SYNC_MS);
        applySkin();
        renderHead();
        safeSync();

        return {
            destroy,
            /** Кнопки «Пропустить» и «Вернуться»: живут только в оболочке, после её снятия их нет */
            skipButtons: () => (destroyed ? null : { skip: $('#ag-smart-skip'), undo: $('#ag-skip-undo') }),
            /** Выбранный пункт списка, откуда бы он ни был: со страницы сайта или из самого плеера */
            current: (kind) => listOf(kind).find(o => o.selected) || null,
            /** Списки со страницы сайта для плееров на одну серию */
            setSite(data) {
                // Перерисовка панели заменяет её кнопки: если это случится под курсором, нажатие зрителя потеряется
                if (JSON.stringify(data) === JSON.stringify(siteData)) return;
                const before = titleKey();
                siteData = data;
                if (titleKey() !== before) loadSeen();
                guarded(() => {
                    renderHead();
                    renderNav();
                    if (openPanel) PANELS[openPanel]();
                    if (guideOpen) spotGuideTarget();
                })();
            }
        };
    }

    const api = { create, formatTime, episodeGroups, sortVoices, playerMode };
    root.AgPlayerShell = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
