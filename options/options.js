// options/options.js
// Страница настроек расширения: меню разделов слева (вид плеера, озвучка, клавиши, случайное аниме, помощь),
// открыт один раздел за раз. Изменения сохраняются сразу

(async function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const KINDS = { tv: 'Сериалы', movie: 'Фильмы', ova: 'OVA', ona: 'ONA', special: 'Спешлы' };
    const KEYS = [
        ['fs', 'На весь экран'],
        ['skip', 'Пропустить песню или перемотать на 89 секунд'],
        ['next', 'Следующая серия'],
        ['prev', 'Предыдущая серия'],
        ['forward', 'Вперёд на 5 секунд'],
        ['rewind', 'Назад на 5 секунд']
    ];

    // Перетаскивание (озвучки, кнопки панели) начинается, когда указатель ушёл дальше этого
    const DRAG_START_PX = 4;
    const FEEDBACK_URL = 'https://animeplus-timings.ruscadred.workers.dev/v1/feedback';

    let settings = await window.getSettings();
    let statusTimer = null;

    const showStatus = (text) => {
        $('status').textContent = text;
        $('status').classList.add('on');
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => $('status').classList.remove('on'), 1600);
    };

    const save = async (patch) => {
        settings = await window.agPatchSettings(patch);
        showStatus('Сохранено');
    };

    // ---------- Оформление плеера ----------
    // Превью собирается из тех же стилей и разметки, что и оболочка в плеере, поэтому всегда совпадает с ней
    const { SKINS, BAR_ITEMS, CUSTOM_MAX, STYLE, TEMPLATE, icon, cleanCustom, cleanValues, presetOf, paintSkin } = window.AgShellView;
    // Крупное превью размером с обычный плеер на сайте, миниатюры как плеер на весь экран
    const STAGE_W = 784;
    const THUMB_W = 1120;
    // Нарисованный кадр: ночное небо, луна и холмы
    const SCENE = 'radial-gradient(circle at 72% 28%, #fdf6d8 0 4.2%, rgba(253,246,216,.22) 4.8%, transparent 15%), radial-gradient(120% 60% at 25% 100%, #141a33 55%, transparent 56%), radial-gradient(90% 50% at 85% 100%, #1d2140 55%, transparent 56%), linear-gradient(170deg, #1d2547 0%, #4b3a6e 55%, #b0607a 100%)';
    const previewOf = (skin, width) => {
        const host = document.createElement('div');
        host.style.width = `${width}px`;
        host.style.height = `${Math.round(width * 9 / 16)}px`;
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
        const q = (sel) => shadow.querySelector(sel);
        q('.root').dataset.skin = skin;
        q('.surface').style.background = SCENE;
        q('.title').textContent = 'Монолог фармацевта';
        q('.sub').textContent = 'Сезон 2 · Серия 7 · AniLibria';
        q('.player-name').textContent = 'Плеер Kodik';
        q('.big').innerHTML = icon('pause');
        q('[data-act="mute"]').innerHTML = icon('vol');
        q('.clock').textContent = '7:42 / 23:40';
        q('.buffer').style.width = '46%';
        q('.done').style.width = '32.5%';
        q('.thumb').style.left = '32.5%';
        q('.zones').innerHTML = '<i class="zone" style="left:6%;width:6.3%"></i><i class="zone" style="left:88%;width:6.3%"></i>';
        return { host, shadow };
    };
    // Оболочка рассчитана на размер кадра плеера: рамка уменьшает её целиком
    const fit = (frame) => {
        const host = frame.firstElementChild;
        if (host) host.style.transform = `scale(${frame.clientWidth / parseFloat(host.style.width)})`;
    };
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => entries.forEach(e => fit(e.target))) : null;
    const mount = (frame, skin, width) => {
        const view = previewOf(skin, width);
        frame.replaceChildren(view.host);
        fit(frame);
        if (resized) resized.observe(frame);
        return view.shadow;
    };

    // Крупное превью можно нажимать: открываются те же панели, что в плеере, с примерными списками.
    // Это только показ: выбор серии, озвучки и переключатели в превью ничего не сохраняют
    const demo = { season: 1, episode: 6, voiceTab: 'voice', voice: 0, player: 0, quality: 1, speed: 1, paused: false, muted: false, toggles: null };
    const DEMO_VOICES = [['AniLibria', 24], ['AniDub', 24], ['Studio Band', 18], ['Dream Cast', 24], ['JAM', 12], ['SHIZA Project', 24]];
    const DEMO_SUBS = [['Русские субтитры', 24], ['Надписи', 10]];
    const DEMO_PLAYERS = ['Kodik', 'Плеер сайта', 'Запасной плеер'];
    const DEMO_QUALITY = ['1080p', '720p', '480p', '360p'];
    const DEMO_SPEEDS = [0.75, 1, 1.25, 1.5, 2];
    const toggleNames = [['Автопропуск опенинга', 'autoSkipOp'], ['Автопропуск эндинга', 'autoSkipEd'], ['Автопереход на следующую серию', 'autoNext'], ['Автозапуск серии', 'autoPlay'], ['Пропуск по звуку', 'audioSkip'], ['Двойной клик: перемотка и весь экран', 'showDBL']];
    let stage = null;
    let openPanel = null;
    let noteTimer = null;

    const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const head = (title) => `<h3>${title}<button type="button" data-p="close" aria-label="Закрыть">${icon('close')}</button></h3>`;
    const chips = (items, style = '') => `<div class="chips"${style ? ` style="${style}"` : ''}>${items.map(([label, on, p]) => `<button type="button" class="chip${on ? ' on' : ''}" data-p="${p}">${esc(label)}</button>`).join('')}</div>`;
    const row = (name, on, p, meta = '') => `<button type="button" class="row${on ? ' on' : ''}" data-p="${p}"><span class="mark">${on ? icon('check') : ''}</span><span class="name">${esc(name)}</span><span class="meta">${meta}</span></button>`;
    const PANELS = {
        episodes: () => head('Серии')
            + chips([['Сезон 1', demo.season === 0, 'season:0'], ['Сезон 2', demo.season === 1, 'season:1']])
            + `<div class="scroll"><div class="grid">${Array.from({ length: 24 }, (_, i) => `<button type="button" class="ep${i === demo.episode ? ' now' : ''}${i < demo.episode ? ' seen' : ''}" data-p="ep:${i}">${i + 1}</button>`).join('')}</div></div>`,
        voices: () => {
            const list = demo.voiceTab === 'voice' ? DEMO_VOICES : DEMO_SUBS;
            const offset = demo.voiceTab === 'voice' ? 0 : DEMO_VOICES.length;
            return head('Озвучка')
                + `<label class="field">${icon('search')}<input placeholder="Найти озвучку" aria-label="Найти озвучку"></label>`
                + chips([[`Озвучка ${DEMO_VOICES.length}`, demo.voiceTab === 'voice', 'tab:voice'], [`Субтитры ${DEMO_SUBS.length}`, demo.voiceTab === 'subtitles', 'tab:subtitles']])
                + `<div class="scroll">${list.map(([name, count], i) => row(name, demo.voice === offset + i, `voice:${offset + i}`, `${count} сер.`)).join('')}</div>`;
        },
        players: () => head('Плеер') + `<div class="scroll">${DEMO_PLAYERS.map((name, i) => row(name, demo.player === i, `player:${i}`)).join('')}</div>`,
        settings: () => head('Настройки') + '<div class="scroll">'
            + '<div class="cap">Качество</div>' + DEMO_QUALITY.map((q, i) => row(q, demo.quality === i, `quality:${i}`)).join('')
            + '<div class="cap">Скорость</div>' + chips(DEMO_SPEEDS.map((v, i) => [`${v}x`, demo.speed === i, `speed:${i}`]), 'margin: 4px 8px 0; flex-wrap: wrap')
            + '<div class="cap">Просмотр</div>'
            + toggleNames.map(([label, key]) => `<button type="button" class="row${demo.toggles[key] ? ' on' : ''}" role="switch" aria-checked="${demo.toggles[key]}" data-p="toggle:${key}"><span class="name">${label}</span><span class="sw"></span></button>`).join('')
            + '<button type="button" class="row" data-p="more"><span class="name">Озвучка, клавиши и другие настройки</span></button>'
            + '</div>'
    };
    const NOTES = { back: '−5 с', fwd: '+5 с', skip: '+89 с', prev: 'Предыдущая серия', next: 'Следующая серия', full: 'В плеере откроется на весь экран', pip: 'В плеере откроется картинка в картинке' };

    const note = (text) => {
        const el = stage.querySelector('.note');
        el.textContent = text;
        el.classList.add('on');
        clearTimeout(noteTimer);
        noteTimer = setTimeout(() => el.classList.remove('on'), 1100);
    };
    const renderPanel = () => {
        const root = stage.querySelector('.root');
        const panel = stage.querySelector('.panel');
        root.classList.toggle('with-panel', !!openPanel);
        panel.classList.toggle('on', !!openPanel);
        panel.innerHTML = openPanel ? PANELS[openPanel]() : '';
        for (const name of Object.keys(PANELS)) stage.querySelector(`[data-act="${name}"]`).setAttribute('aria-expanded', String(openPanel === name));
    };
    const onStageClick = (e) => {
        const act = e.target.closest('[data-act]');
        const pick = e.target.closest('[data-p]');
        if (act) {
            const name = act.dataset.act;
            if (PANELS[name]) openPanel = openPanel === name ? null : name;
            else if (name === 'toggle') {
                demo.paused = !demo.paused;
                act.innerHTML = icon(demo.paused ? 'play' : 'pause');
            } else if (name === 'mute') {
                demo.muted = !demo.muted;
                act.innerHTML = icon(demo.muted ? 'mute' : 'vol');
            } else if (NOTES[name]) note(NOTES[name]);
            if (PANELS[name]) renderPanel();
            return;
        }
        if (pick) {
            const [kind, value] = pick.dataset.p.split(':');
            if (kind === 'close') openPanel = null;
            else if (kind === 'season') demo.season = Number(value);
            else if (kind === 'ep') demo.episode = Number(value);
            else if (kind === 'tab') demo.voiceTab = value;
            else if (kind === 'voice') demo.voice = Number(value);
            else if (kind === 'player') demo.player = Number(value);
            else if (kind === 'quality') demo.quality = Number(value);
            else if (kind === 'speed') demo.speed = Number(value);
            else if (kind === 'toggle') demo.toggles[value] = !demo.toggles[value];
            else if (kind === 'more') return note('Вы уже на этой странице');
            renderPanel();
            return;
        }
        // Щелчок по кадру закрывает панель, как в плеере
        if (e.target.closest('.surface') && openPanel) {
            openPanel = null;
            renderPanel();
        }
    };

    // ---------- Свои темы и конструктор ----------
    // Своя тема собирается из независимых частей (AgShellView.KNOBS). Хранятся в custom_skins, встроенные не меняются
    const customs = () => (Array.isArray(settings.custom_skins) ? settings.custom_skins.map(cleanCustom).filter(c => c && c.id) : []);
    const entries = () => [
        ...SKINS.map(s => ({ id: s.id, name: s.name, tag: s.tag })),
        ...customs().map(c => ({ id: c.id, name: c.name, tag: 'своя тема', custom: c }))
    ];
    const currentEntry = () => entries().find(e => e.id === settings.playerSkin) || entries()[0];
    // Правка, которая ещё не сохранена: { id (null у новой), name, values }
    let draft = null;
    let deleteArmed = false;

    // Превью показывает правку сразу, а без правки — выбранную тему
    const paintStage = () => {
        const root = stage.querySelector('.root');
        if (draft) paintSkin(root, { playerSkin: '__draft', custom_skins: [{ id: '__draft', name: draft.name, values: draft.values }] });
        else paintSkin(root, settings);
    };

    const renderSkins = () => {
        const now = currentEntry();
        if (!stage) {
            // Переключатели в превью начинают с настоящих значений зрителя
            const s = settings;
            demo.toggles = { autoSkipOp: s.autoSkip !== false && s.autoSkipOp !== false, autoSkipEd: s.autoSkip !== false && s.autoSkipEd !== false, autoNext: s.autoNext !== false, autoPlay: s.autoPlay !== false, audioSkip: s.audioSkip !== false, showDBL: s.showDBL !== false };
            stage = mount($('skinPreview'), SKINS[0].id, STAGE_W);
            stage.addEventListener('click', onStageClick);
            stage.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Escape' && openPanel) {
                    openPanel = null;
                    renderPanel();
                }
            });
        }
        // Тема меняется на том же превью: открытая панель остаётся, темы удобно сравнивать
        paintStage();
        $('skinName').textContent = draft ? (draft.name.trim() || 'Моя тема') : now.name;
        $('skinTag').textContent = draft ? 'правка, ещё не сохранено' : now.tag;
        $('skinCopy').hidden = !!now.custom || !!draft;
        $('skinEdit').hidden = !now.custom || !!draft;
        $('skinDelete').hidden = !now.custom || !!draft;
        if (!deleteArmed) $('skinDelete').textContent = 'Удалить';
        const full = customs().length >= CUSTOM_MAX;
        $('skinCreate').disabled = full || !!draft;
        $('skinLimit').hidden = !full;

        // Список перестраивается, только когда меняется набор тем или своя тема
        const list = $('skinList');
        const all = entries();
        const sig = JSON.stringify(all.map(e => [e.id, e.name, e.custom ? e.custom.values : null]));
        if (list.dataset.sig !== sig) {
            list.dataset.sig = sig;
            list.replaceChildren();
            for (const e of all) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `skin${e.custom ? ' mine' : ''}`;
                b.dataset.skin = e.id;
                b.setAttribute('role', 'radio');
                b.title = e.tag;
                const frame = document.createElement('span');
                frame.className = 'preview';
                frame.setAttribute('aria-hidden', 'true');
                const name = document.createElement('b');
                name.className = 'skin-name';
                name.textContent = e.name;
                b.append(frame, name);
                b.addEventListener('click', () => {
                    // Выбор другой темы во время правки отменяет правку
                    if (draft) closeEditor();
                    deleteArmed = false;
                    if (b.getAttribute('aria-checked') === 'true') return;
                    save({ playerSkin: e.id }).then(renderSkins);
                });
                // Рамка уже на странице: ширина нужна, чтобы уменьшить оболочку
                list.appendChild(b);
                const shadow = mount(frame, SKINS[0].id, THUMB_W);
                paintSkin(shadow.querySelector('.root'), { playerSkin: e.id, custom_skins: e.custom ? [e.custom] : [] });
            }
        }
        for (const b of list.children) {
            const on = b.dataset.skin === now.id;
            b.setAttribute('aria-checked', String(on));
            b.tabIndex = on ? 0 : -1;
        }
    };

    // Стрелки переключают тему, как обычная группа переключателей
    $('skinList').addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!step || draft) return;
        e.preventDefault();
        const all = entries();
        const i = all.findIndex(x => x.id === currentEntry().id);
        const next = all[(i + step + all.length) % all.length].id;
        save({ playerSkin: next }).then(() => {
            renderSkins();
            $('skinList').querySelector(`[data-skin="${next}"]`).focus();
        });
    });

    // Поля редактора: значение конструктора, элемент и перевод в обе стороны
    const percent = { get: (el) => Number(el.value) / 100, set: (el, v) => { el.value = String(Math.round(v * 100)); } };
    const number = { get: (el) => Number(el.value), set: (el, v) => { el.value = String(v); } };
    const text = { get: (el) => el.value, set: (el, v) => { el.value = v; } };
    const flag = { get: (el) => el.checked, set: (el, v) => { el.checked = v; } };
    const FIELDS = [
        ['bar', 'edBar', text], ['barColor', 'edBarColor', text], ['barAlpha', 'edBarAlpha', percent],
        ['title', 'edTitlePos', text], ['center', 'edCenter', text], ['big', 'edBig', text],
        ['panel', 'edPanel', text], ['panelColor', 'edPanelColor', text], ['panelAlpha', 'edPanelAlpha', percent],
        ['size', 'edSize', text], ['labels', 'edLabels', flag], ['radius', 'edRadius', number], ['rail', 'edRail', number], ['font', 'edFont', text],
        ['accent', 'edAccent', text], ['text', 'edText', text], ['scrim', 'edScrim', percent], ['blur', 'edBlur', flag]
    ];
    const notes = () => {
        const v = draft.values;
        $('edBarAlphaNote').textContent = `${Math.round(v.barAlpha * 100)}%`;
        $('edPanelAlphaNote').textContent = `${Math.round(v.panelAlpha * 100)}%: ${v.panelAlpha >= 0.95 ? 'сплошные' : 'кадр просвечивает'}`;
        $('edRadiusNote').textContent = `${v.radius} px`;
        $('edRailNote').textContent = `${v.rail} px`;
        $('edScrimNote').textContent = `${Math.round(v.scrim * 100)}%`;
        $('edCenterWarn').hidden = v.center !== 'big';
    };

    // Порядок кнопок: полоса под превью повторяет нижнюю панель. Кнопку перетаскивают мышью или стрелками
    // влево-вправо, нажатие прячет её или возвращает. Промежуток делит панель на левую и правую группу
    const CHIP_FACE = { skip: [icon('skip'), '+89'], clock: [null, '7:42'], vol: [icon('vol')], episodes: [icon('list')], voices: [icon('mic')], players: [icon('screen')], settings: [icon('gear')], full: [icon('full')] };
    const chipsOf = () => [...$('edOrder').children];
    const orderFromStrip = () => {
        draft.values.order = chipsOf().map(c => c.dataset.id);
        paintStage();
    };
    let justDragged = false;

    const renderOrder = () => {
        $('edOrder').replaceChildren(...draft.values.order.map((id) => {
            const item = BAR_ITEMS.find(x => x.id === id);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `chip${id === 'gap' ? ' gap' : ''}`;
            b.dataset.id = id;
            b.setAttribute('role', 'listitem');
            const shown = !draft.values.hide.includes(id);
            b.classList.toggle('off', !shown);
            if (item.hide) b.setAttribute('aria-pressed', String(shown));
            const state = item.hide ? (shown ? 'видна, нажмите, чтобы спрятать' : 'спрятана, нажмите, чтобы вернуть') : 'видна всегда';
            b.title = `${item.name}: ${state}`;
            b.setAttribute('aria-label', `${item.name}, ${state}. Стрелки влево и вправо меняют место`);
            if (id === 'gap') b.innerHTML = '<span>пусто</span>';
            else {
                const [svg, text] = CHIP_FACE[id];
                b.innerHTML = `${svg || ''}${text ? `<span>${esc(text)}</span>` : ''}`;
            }
            b.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                startChipDrag(b, e);
            });
            return b;
        }));
    };

    function startChipDrag(chip, down) {
        const strip = $('edOrder');
        const startX = down.clientX;
        let dragging = false;
        const move = (e) => {
            if (!dragging) {
                if (Math.abs(e.clientX - startX) < DRAG_START_PX) return;
                dragging = true;
                chip.classList.add('dragging');
                strip.classList.add('sorting');
            }
            e.preventDefault();
            // Кнопка встаёт перед первой соседней, чья середина правее указателя, иначе в конец
            const before = chipsOf().filter(c => c !== chip).find(c => {
                const r = c.getBoundingClientRect();
                return e.clientX < r.left + r.width / 2;
            });
            if (before ? chip.nextElementSibling !== before : strip.lastElementChild !== chip) {
                strip.insertBefore(chip, before || null);
                orderFromStrip();
            }
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            document.removeEventListener('pointercancel', up);
            if (!dragging) return;
            chip.classList.remove('dragging');
            strip.classList.remove('sorting');
            // Щелчок, которым закончилось перетаскивание, кнопку не прячет
            justDragged = true;
            setTimeout(() => { justDragged = false; }, 0);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
    }

    $('edOrder').addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip || !draft || justDragged) return;
        const id = chip.dataset.id;
        if (!BAR_ITEMS.find(x => x.id === id).hide) return;
        const hide = draft.values.hide;
        draft.values.hide = hide.includes(id) ? hide.filter(x => x !== id) : [...hide, id];
        renderOrder();
        $('edOrder').querySelector(`[data-id="${id}"]`).focus();
        renderSkins();
    });
    $('edOrder').addEventListener('keydown', (e) => {
        const chip = e.target.closest('.chip');
        const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
        if (!chip || !step || !draft) return;
        e.preventDefault();
        const order = draft.values.order;
        const i = order.indexOf(chip.dataset.id);
        const j = i + step;
        if (j < 0 || j >= order.length) return;
        [order[i], order[j]] = [order[j], order[i]];
        renderOrder();
        $('edOrder').querySelector(`[data-id="${order[j]}"]`).focus();
        renderSkins();
    });

    const fillEditor = () => {
        ED_NAME.value = draft.name;
        for (const [key, id, kind] of FIELDS) kind.set($(id), draft.values[key]);
        $('edThumb').checked = draft.values.thumb === 'always';
        $('edPip').checked = !draft.values.hide.includes('pip');
        renderOrder();
        notes();
    };
    const readEditor = () => {
        draft.name = ED_NAME.value;
        const v = draft.values;
        for (const [key, id, kind] of FIELDS) v[key] = kind.get($(id));
        v.thumb = $('edThumb').checked ? 'always' : 'hover';
        // Кнопки панели прячутся в полосе, «Картинка в картинке» — переключателем
        v.hide = v.hide.filter(id => id !== 'pip');
        if (!$('edPip').checked) v.hide.push('pip');
    };
    const ED_NAME = $('edName');

    // Части темы на вкладках: видна одна группа ручек, превью рядом
    const edGroups = [...$('skinEditor').querySelectorAll('.ed-group')];
    const showEdTab = (index) => {
        edGroups.forEach((g, i) => { g.hidden = i !== index; });
        [...$('edTabs').children].forEach((b, i) => {
            b.setAttribute('aria-selected', String(i === index));
            b.tabIndex = i === index ? 0 : -1;
        });
    };
    $('edTabs').replaceChildren(...edGroups.map((g, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-tab';
        b.setAttribute('role', 'tab');
        b.textContent = g.dataset.tab;
        b.addEventListener('click', () => showEdTab(i));
        return b;
    }));
    $('edTabs').addEventListener('keydown', (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        e.preventDefault();
        const tabs = [...$('edTabs').children];
        const next = (tabs.indexOf(document.activeElement) + step + tabs.length) % tabs.length;
        showEdTab(next);
        tabs[next].focus();
    });

    // Во время правки превью и ручки стоят рядом (класс editing у карточки), список тем убран
    const showEditor = (on) => {
        $('skinEditor').hidden = !on;
        $('edStrip').hidden = !on;
        $('skinEditor').closest('.card').classList.toggle('editing', on);
        if (on) showEdTab(0);
    };
    const openEditor = (next, title) => {
        draft = { id: next.id, name: next.name, values: cleanValues(next.values) };
        deleteArmed = false;
        $('edTitle').textContent = title;
        fillEditor();
        showEditor(true);
        renderSkins();
    };
    function closeEditor() {
        draft = null;
        showEditor(false);
        renderSkins();
    }

    $('skinCreate').addEventListener('click', () => openEditor({ id: null, name: 'Моя тема', values: presetOf(SKINS[0].id) }, 'Новая тема'));
    $('skinCopy').addEventListener('click', () => {
        const now = currentEntry();
        openEditor({ id: null, name: `${now.name}, копия`.slice(0, 30), values: presetOf(now.id) }, `Новая тема на основе «${now.name}»`);
    });
    $('skinEdit').addEventListener('click', () => {
        const c = currentEntry().custom;
        if (c) openEditor({ id: c.id, name: c.name, values: c.values }, `Правка «${c.name}»`);
    });
    $('skinDelete').addEventListener('click', () => {
        const now = currentEntry();
        if (!now.custom) return;
        // Удаление насовсем: первое нажатие только спрашивает
        if (!deleteArmed) {
            deleteArmed = true;
            $('skinDelete').textContent = 'Точно удалить?';
            return;
        }
        deleteArmed = false;
        save({ custom_skins: customs().filter(c => c.id !== now.id), playerSkin: SKINS[0].id }).then(renderSkins);
    });
    $('skinEditor').addEventListener('input', () => {
        if (!draft) return;
        readEditor();
        notes();
        renderSkins();
    });
    $('edCancel').addEventListener('click', closeEditor);
    $('skinEditor').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!draft) return;
        readEditor();
        const id = draft.id || `custom-${Date.now().toString(36)}`;
        const clean = cleanCustom({ id, name: draft.name, values: draft.values });
        const list = customs();
        const at = list.findIndex(c => c.id === id);
        if (at >= 0) list[at] = clean;
        else list.push(clean);
        draft = null;
        showEditor(false);
        save({ custom_skins: list, playerSkin: id }).then(renderSkins);
    });
    renderSkins();

    // ---------- Озвучка ----------
    const moveVoice = (from, to) => {
        const list = [...settings.voice_priority_list];
        list.splice(to, 0, list.splice(from, 1)[0]);
        return save({ voice_priority_list: list }).then(renderVoices);
    };

    // Перетаскивание: строка встаёт на новое место прямо во время движения, порядок сохраняется при отпускании.
    // Тянуть можно за всю строку, кроме кнопки удаления; короткое нажатие без движения ничего не двигает
    const voiceRows = () => [...$('voiceList').children];
    const renumber = () => voiceRows().forEach((li, i) => { li.querySelector('.rank').textContent = i + 1; });

    function startVoiceDrag(li, down) {
        const list = $('voiceList');
        const startY = down.clientY;
        let dragging = false;
        const move = (e) => {
            if (!dragging) {
                if (Math.abs(e.clientY - startY) < DRAG_START_PX) return;
                dragging = true;
                li.classList.add('dragging');
                list.classList.add('sorting');
            }
            e.preventDefault();
            // Строка встаёт перед первой соседней, чья середина ниже указателя, иначе в конец
            const before = voiceRows().filter(r => r !== li).find(r => {
                const rect = r.getBoundingClientRect();
                return e.clientY < rect.top + rect.height / 2;
            });
            if (before ? li.nextElementSibling !== before : list.lastElementChild !== li) {
                list.insertBefore(li, before || null);
                renumber();
            }
        };
        const up = () => {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', up);
            document.removeEventListener('pointercancel', up);
            if (!dragging) return;
            li.classList.remove('dragging');
            list.classList.remove('sorting');
            const order = voiceRows().map(r => r.dataset.name);
            if (order.join('\n') !== settings.voice_priority_list.join('\n')) save({ voice_priority_list: order }).then(renderVoices);
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
        document.addEventListener('pointercancel', up);
    }

    function renderVoices() {
        const list = settings.voice_priority_list;
        $('voiceList').replaceChildren(...list.map((name, i) => {
            const li = document.createElement('li');
            li.className = 'voice';
            li.dataset.name = name;
            li.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 || e.target.closest('.icon-btn')) return;
                e.preventDefault();
                startVoiceDrag(li, e);
            });
            // Ручка: за неё видно, что строку можно тянуть, а с клавиатуры стрелки двигают озвучку на одно место
            const grip = document.createElement('span');
            grip.className = 'grip';
            grip.tabIndex = 0;
            grip.setAttribute('role', 'button');
            grip.setAttribute('aria-label', `Перетащить: ${name}. Стрелки вверх и вниз меняют место`);
            grip.title = 'Перетащите, чтобы поменять место';
            grip.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="7.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="7" r="1.4"/><circle cx="7.5" cy="7" r="1.4"/><circle cx="2.5" cy="11.5" r="1.4"/><circle cx="7.5" cy="11.5" r="1.4"/></svg>';
            grip.addEventListener('keydown', (e) => {
                const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
                if (to < 0 || to >= list.length) return;
                e.preventDefault();
                moveVoice(i, to).then(() => voiceRows()[to].querySelector('.grip').focus());
            });
            const rank = document.createElement('span');
            rank.className = 'rank';
            rank.textContent = i + 1;
            const title = document.createElement('span');
            title.className = 'name';
            title.textContent = name;
            const button = (label, svg, disabled, onClick) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'icon-btn';
                b.setAttribute('aria-label', `${label}: ${name}`);
                b.title = label;
                b.disabled = disabled;
                b.innerHTML = svg;
                b.addEventListener('click', onClick);
                return b;
            };
            li.append(
                grip,
                rank,
                title,
                button('Удалить', window.AgUI.icon('close', 13), false, () => {
                    save({ voice_priority_list: list.filter((_, n) => n !== i) }).then(renderVoices);
                })
            );
            return li;
        }));
    }

    $('autoVoice').checked = settings.auto_select_voice !== false;
    $('autoVoice').addEventListener('change', (e) => save({ auto_select_voice: e.target.checked }));
    $('voiceForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('voiceInput').value.trim();
        if (!name || settings.voice_priority_list.includes(name)) return;
        $('voiceInput').value = '';
        save({ voice_priority_list: [...settings.voice_priority_list, name] }).then(renderVoices);
    });
    renderVoices();

    // ---------- Случайное аниме ----------
    const score = String(settings.random_min_score ?? '6').replace(/\.0$/, '');
    $('randomScore').value = [...$('randomScore').options].some(o => o.value === score) ? score : '6';
    $('randomScore').addEventListener('change', (e) => {
        save({ random_min_score: e.target.value === 'any' ? 'any' : parseFloat(e.target.value) });
    });

    const activeKinds = Array.isArray(settings.random_kinds) ? settings.random_kinds : Object.keys(KINDS);
    $('randomKinds').replaceChildren(...Object.entries(KINDS).map(([kind, label]) => {
        const chip = document.createElement('label');
        chip.className = 'chip';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = kind;
        input.checked = activeKinds.includes(kind);
        input.addEventListener('change', () => {
            const checked = [...$('randomKinds').querySelectorAll('input:checked')].map(i => i.value);
            // Хотя бы один тип нужен: иначе подбирать было бы не из чего
            if (!checked.length) {
                input.checked = true;
                return;
            }
            save({ random_kinds: checked });
        });
        chip.append(input, label);
        return chip;
    }));

    // ---------- Клавиши ----------
    let stopListening = null;
    const renderKeys = () => {
        $('keyList').replaceChildren(...KEYS.map(([action, title]) => {
            const row = document.createElement('div');
            row.className = 'key-row';
            const name = document.createElement('span');
            name.textContent = title;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'key-btn';
            btn.textContent = settings.keys[action];
            btn.setAttribute('aria-label', `${title}: ${settings.keys[action]}`);
            btn.addEventListener('click', () => {
                if (stopListening) stopListening();
                btn.classList.add('listening');
                btn.textContent = '...';
                const onKey = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    stopListening();
                    if (e.key === 'Escape') return;
                    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
                    save({ keys: { ...settings.keys, [action]: key } }).then(renderKeys);
                };
                stopListening = () => {
                    document.removeEventListener('keydown', onKey, true);
                    stopListening = null;
                    renderKeys();
                };
                document.addEventListener('keydown', onKey, true);
            });
            row.append(name, btn);
            return row;
        }));
    };
    renderKeys();

    // ---------- Поддержка ----------
    const version = chrome.runtime.getManifest().version;
    const FEEDBACK_ERRORS = {
        limit: 'Слишком много сообщений. Попробуйте через час.',
        busy: 'Сегодня пришло слишком много сообщений. Попробуйте завтра.',
        'bad message': 'Сообщение слишком короткое или слишком длинное.'
    };

    const DIAG_MAX = 3500;
    const browserLine = () => {
        const match = navigator.userAgent.match(/(YaBrowser|Edg|OPR|Chrome)\/(\d+)/);
        return `${match ? `${match[1]} ${match[2]}` : 'Браузер не определён'}, ${navigator.platform}`;
    };
    const diagText = async () => {
        let log = '';
        try {
            const res = await chrome.runtime.sendMessage({ action: 'diag_summary' });
            log = (res && res.text) || '';
        } catch (err) {}
        return `${browserLine()}\n${log || 'Сбоев не записано'}`.slice(0, DIAG_MAX);
    };
    const showDiag = async () => { $('feedbackDiagText').textContent = await diagText(); };
    document.querySelector('.feedback-diag-text').addEventListener('toggle', showDiag);
    showDiag();

    $('feedbackForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const result = $('feedbackResult');
        result.classList.remove('error');
        result.textContent = 'Отправляем...';
        $('feedbackSend').disabled = true;
        let error = 'Не удалось отправить. Попробуйте ещё раз чуть позже.';
        let sent = false;
        const diag = $('feedbackDiag').checked ? await diagText() : '';
        try {
            const response = await fetch(FEEDBACK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    kind: $('feedbackKind').value,
                    message: $('feedbackMessage').value,
                    contact: $('feedbackContact').value,
                    website: $('feedbackWebsite').value,
                    version,
                    diag
                }),
                signal: AbortSignal.timeout(15000)
            });
            const data = await response.json().catch(() => ({}));
            sent = response.ok && data.ok === true;
            error = FEEDBACK_ERRORS[data.error] || error;
        } catch (err) {}
        $('feedbackSend').disabled = false;
        // При ошибке текст остаётся в форме, чтобы не писать его заново
        if (sent) {
            $('feedbackMessage').value = '';
            $('feedbackContact').value = '';
            result.textContent = 'Спасибо, сообщение отправлено.';
        } else {
            result.classList.add('error');
            result.textContent = error;
        }
    });

    // ---------- Разделы ----------
    // Открыт один раздел за раз, выбранный записан в адресе. Старые ссылки (#support, #guide) ведут в «Помощь»
    const PANES = ['player', 'voice', 'keys', 'random', 'help'];
    const ALIASES = { support: 'help', guide: 'help', skin: 'player' };
    const paneOf = (hash) => {
        const name = hash.replace(/^#/, '');
        return PANES.includes(name) ? name : ALIASES[name] || PANES[0];
    };
    const showPane = (name) => {
        for (const pane of document.querySelectorAll('.pane')) pane.hidden = pane.dataset.pane !== name;
        for (const link of document.querySelectorAll('.nav-item')) {
            if (link.dataset.pane === name) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        }
        window.scrollTo(0, 0);
        // Ссылка «Написать» сразу ставит курсор в сообщение
        if (location.hash === '#support') $('feedbackMessage').focus({ preventScroll: true });
    };
    window.addEventListener('hashchange', () => showPane(paneOf(location.hash)));
    // Повторное нажатие «Написать» при том же адресе hashchange не даёт
    $('helpBanner').addEventListener('click', () => {
        if (location.hash === '#support') showPane('help');
    });
    showPane(paneOf(location.hash));

    // ---------- Экскурсия ----------
    $('helpFox').innerHTML = window.AgGuideFox.svg('wink');
    window.AgGuide.mark('settings');
    $('guideRestart').addEventListener('click', async () => {
        await window.AgGuide.reset();
        await window.AgGuide.mark('settings');
        showStatus('Откройте окно расширения, лиса уже ждёт');
    });
})();
