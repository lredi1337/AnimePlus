// options/options.js
// Страница настроек расширения: озвучка, случайное аниме, клавиши и настройки целиком. Изменения сохраняются сразу

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

    // ---------- Озвучка ----------
    const moveVoice = (from, to) => {
        const list = [...settings.voice_priority_list];
        list.splice(to, 0, list.splice(from, 1)[0]);
        save({ voice_priority_list: list }).then(renderVoices);
    };

    function renderVoices() {
        const list = settings.voice_priority_list;
        $('voiceList').replaceChildren(...list.map((name, i) => {
            const li = document.createElement('li');
            li.className = 'voice';
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
            const arrow = (d) => `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
            li.append(
                rank,
                title,
                button('Выше', arrow('m2.5 7.5 3.5-3.5 3.5 3.5'), i === 0, () => moveVoice(i, i - 1)),
                button('Ниже', arrow('m2.5 4.5 3.5 3.5 3.5-3.5'), i === list.length - 1, () => moveVoice(i, i + 1)),
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

    const openSupport = () => {
        $('support').scrollIntoView({ block: 'center' });
        $('feedbackMessage').focus({ preventScroll: true });
    };
    $('helpBanner').addEventListener('click', (e) => {
        e.preventDefault();
        openSupport();
    });
    if (location.hash === '#support') openSupport();

    // ---------- Экскурсия ----------
    $('helpFox').innerHTML = window.AgGuideFox.svg('wink');
    window.AgGuide.mark('settings');
    $('guideRestart').addEventListener('click', async () => {
        await window.AgGuide.reset();
        await window.AgGuide.mark('settings');
        showStatus('Откройте окно расширения, лиса уже ждёт');
    });

    // ---------- Настройки целиком ----------
    $('exportBtn').addEventListener('click', async () => {
        const blob = new Blob([JSON.stringify(await window.getSettings(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `animeplus_settings_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showStatus('Настройки выгружены');
    });

    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const imported = JSON.parse(await file.text());
            if (typeof imported !== 'object' || imported === null || Array.isArray(imported)) throw new Error('format');
            await chrome.storage.local.set({ ag_settings: imported });
            location.reload();
        } catch (err) {
            showStatus('Не удалось прочитать файл настроек');
        }
    });

    $('resetBtn').addEventListener('click', async () => {
        if (!window.confirm('Сбросить все настройки Anime+? Вход в Shikimori останется.')) return;
        await chrome.storage.local.set({ ag_settings: JSON.parse(JSON.stringify(window.DEFAULT_SETTINGS)) });
        location.reload();
    });
})();
