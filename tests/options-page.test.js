// Страница настроек: изменения сохраняются сразу и не откатывают то, что поменяли в плеере или окне расширения
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));

async function openPage(initial) {
    const body = read('options/options.html').match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url: 'https://example.test/options.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const store = { ag_settings: initial };
    w.chrome = {
        runtime: { id: 'test', getURL: (p) => p, getManifest: () => JSON.parse(read('manifest.json')), sendMessage() {}, onMessage: { addListener() {} } },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, store[k]])),
                set: async (obj) => { Object.assign(store, obj); }
            },
            onChanged: { addListener() {} }
        }
    };
    for (const f of ['config.js', 'modules/shared/ui-kit.js', 'modules/shared/guide.js', 'modules/shared/guide-fox.js', 'options/options.js']) w.eval(read(f));
    await tick();
    return { w, doc: w.document, store };
}

const names = (doc) => [...doc.querySelectorAll('.voice .name')].map(e => e.textContent);

// В jsdom нет раскладки: строка высотой 36 px, шаг 40 px, место строки — её место в списке
function layoutVoices(w, doc) {
    const list = doc.getElementById('voiceList');
    for (const li of list.children) {
        li.getBoundingClientRect = () => {
            const top = [...list.children].indexOf(li) * 40;
            return { top, bottom: top + 36, height: 36, left: 0, right: 600, width: 600, x: 0, y: top };
        };
    }
}
const pointer = (w, el, type, y) => el.dispatchEvent(new w.PointerEvent(type, { bubbles: true, cancelable: true, clientX: 300, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1 }));

test('озвучку можно перетащить мышью на любое место: зажал, протянул, отпустил', async () => {
    const { w, doc, store } = await openPage({ voice_priority_list: ['A', 'B', 'C', 'D', 'Новая'] });
    layoutVoices(w, doc);
    const row = doc.querySelectorAll('.voice')[4];
    pointer(w, row.querySelector('.grip'), 'pointerdown', 178);
    // Протягиваем вверх через весь список: строки расступаются на лету
    for (const y of [160, 120, 80, 40, 10]) pointer(w, doc, 'pointermove', y);
    assert.deepEqual(names(doc), ['Новая', 'A', 'B', 'C', 'D'], 'строка уже стоит на новом месте');
    assert.ok(row.classList.contains('dragging'));
    assert.deepEqual([...store.ag_settings.voice_priority_list], ['A', 'B', 'C', 'D', 'Новая'], 'пока не отпустили, ничего не сохранено');
    pointer(w, doc, 'pointerup', 10);
    await tick();
    assert.deepEqual([...store.ag_settings.voice_priority_list], ['Новая', 'A', 'B', 'C', 'D']);
    assert.deepEqual([...doc.querySelectorAll('.voice .rank')].map(e => e.textContent), ['1', '2', '3', '4', '5']);
    assert.equal(doc.querySelectorAll('.voice.dragging').length, 0);

    // Тянуть можно за всю строку, кроме кнопки удаления; короткое нажатие ничего не двигает
    layoutVoices(w, doc);
    const second = doc.querySelectorAll('.voice')[1];
    pointer(w, second.querySelector('.name'), 'pointerdown', 58);
    pointer(w, doc, 'pointermove', 60);
    pointer(w, doc, 'pointerup', 60);
    await tick();
    assert.deepEqual(names(doc), ['Новая', 'A', 'B', 'C', 'D']);
    pointer(w, second.querySelector('.name'), 'pointerdown', 58);
    for (const y of [80, 120, 150, 200]) pointer(w, doc, 'pointermove', y);
    pointer(w, doc, 'pointerup', 200);
    await tick();
    assert.deepEqual([...store.ag_settings.voice_priority_list], ['Новая', 'B', 'C', 'D', 'A']);
    assert.equal(doc.querySelectorAll('[title="Выше"], [title="Ниже"]').length, 0, 'стрелок больше нет');
    w.close();
});

test('блока «Настройки целиком» больше нет', async () => {
    const { w, doc } = await openPage({});
    for (const id of ['exportBtn', 'importBtn', 'importFile', 'resetBtn', 'data-title']) assert.equal(doc.getElementById(id), null, id);
    w.close();
});

test('список озвучек: порядок, удаление и добавление сохраняются сразу', async () => {
    const { w, doc, store } = await openPage({ voice_priority_list: ['A', 'B', 'C'] });
    assert.deepEqual(names(doc), ['A', 'B', 'C']);

    // Ручка строки на клавиатуре: стрелка вниз опускает озвучку на одно место
    doc.querySelectorAll('.voice')[0].querySelector('.grip').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await tick();
    assert.deepEqual(names(doc), ['B', 'A', 'C']);
    assert.deepEqual([...store.ag_settings.voice_priority_list], ['B', 'A', 'C']);

    doc.querySelectorAll('.voice')[2].querySelector('[title="Удалить"]').click();
    await tick();
    assert.deepEqual([...store.ag_settings.voice_priority_list], ['B', 'A']);

    doc.getElementById('voiceInput').value = 'HDRezka';
    doc.getElementById('voiceForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await tick();
    assert.deepEqual([...store.ag_settings.voice_priority_list], ['B', 'A', 'HDRezka']);
    w.close();
});

test('случайное аниме: оценка сохраняется, а последний тип снять нельзя', async () => {
    const { w, doc, store } = await openPage({ random_min_score: 7, random_kinds: ['tv'] });
    assert.equal(doc.getElementById('randomScore').value, '7');

    doc.getElementById('randomScore').value = 'any';
    doc.getElementById('randomScore').dispatchEvent(new w.Event('change'));
    await tick();
    assert.equal(store.ag_settings.random_min_score, 'any');

    const tv = doc.querySelector('#randomKinds input[value="tv"]');
    tv.checked = false;
    tv.dispatchEvent(new w.Event('change'));
    await tick();
    assert.equal(tv.checked, true);
    assert.deepEqual([...store.ag_settings.random_kinds], ['tv']);
    w.close();
});

test('клавиша назначается, а Esc отменяет назначение', async () => {
    const { w, doc, store } = await openPage({});
    const button = () => doc.querySelector('.key-btn');
    assert.equal(button().textContent, 'f');

    button().click();
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    assert.equal(button().textContent, 'f');
    assert.deepEqual({ ...store.ag_settings }, {}, 'отмена ничего не сохраняет');

    button().click();
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'g', bubbles: true }));
    await tick();
    assert.equal(button().textContent, 'g');
    assert.equal(store.ag_settings.keys.fs, 'g');
    assert.equal(store.ag_settings.keys.next, 'n', 'остальные клавиши на месте');
    w.close();
});

test('сохранение не откатывает настройки, изменённые в другом месте', async () => {
    const { w, doc, store } = await openPage({ voice_priority_list: ['A', 'B'], autoNext: true });
    store.ag_settings.autoNext = false;
    store.ag_settings.sites_enabled = { jutsu: false };

    doc.getElementById('autoVoice').checked = false;
    doc.getElementById('autoVoice').dispatchEvent(new w.Event('change'));
    await tick();

    assert.equal(store.ag_settings.auto_select_voice, false);
    assert.equal(store.ag_settings.autoNext, false, 'изменение из плеера не откатилось');
    assert.deepEqual({ ...store.ag_settings.sites_enabled }, { jutsu: false });
    w.close();
});

test('клавиши, сохранённые старым окном заглавными, снова работают', async () => {
    const { w } = await openPage({ keys: { skip: 'J' } });
    const settings = await w.getSettings();
    assert.equal(settings.keys.skip, 'j');
    assert.equal(settings.keys.next, 'n');
    w.close();
});

test('адрес почты поддержки на странице не показывается', async () => {
    const { w, doc } = await openPage({});
    assert.ok(!doc.body.innerHTML.includes('@gmail'));
    assert.equal(doc.querySelector('a[href^="mailto:"]'), null);
    w.close();
});

test('поддержка заметна сверху, настройки отмечают задание, экскурсия начинается заново', async () => {
    const { w, doc, store } = await openPage({});
    const page = doc.querySelector('.page');
    assert.equal(page.children[1].id, 'helpBanner', 'баннер сразу под заголовком');
    assert.ok(doc.getElementById('helpFox').querySelector('svg'));
    await tick();
    assert.equal(store.ag_guide.tasks.settings, true);

    store.ag_guide = { tourDone: true, questHidden: true, tipsDone: true, tasks: { play: true, settings: true } };
    doc.getElementById('guideRestart').click();
    await tick();
    assert.equal(store.ag_guide.tourDone, false);
    assert.equal(store.ag_guide.questHidden, false);
    assert.equal(store.ag_guide.tipsDone, false);
    assert.equal(store.ag_guide.tasks.play, undefined);
    assert.equal(store.ag_guide.tasks.settings, true, 'настройки сейчас открыты');
    w.close();
});

async function submitFeedback(respond) {
    const { w, doc } = await openPage({});
    const calls = [];
    w.fetch = async (url, options) => {
        calls.push({ url, body: JSON.parse(options.body) });
        return respond();
    };
    doc.getElementById('feedbackKind').value = 'idea';
    doc.getElementById('feedbackMessage').value = 'Хочу тёмную тему для расписания';
    doc.getElementById('feedbackContact').value = '@viewer';
    doc.getElementById('feedbackForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
    await tick();
    return { w, doc, calls };
}

const reply = (status, body) => () => ({ ok: status < 400, status, json: async () => body });

test('форма поддержки: отправляет сообщение, версию и очищается', async () => {
    const { w, doc, calls } = await submitFeedback(reply(200, { ok: true }));
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/v1\/feedback$/);
    assert.deepEqual(
        { kind: calls[0].body.kind, message: calls[0].body.message, contact: calls[0].body.contact, website: calls[0].body.website },
        { kind: 'idea', message: 'Хочу тёмную тему для расписания', contact: '@viewer', website: '' }
    );
    assert.match(calls[0].body.version, /^\d+\.\d+\.\d+$/);
    assert.equal(doc.getElementById('feedbackMessage').value, '');
    assert.match(doc.getElementById('feedbackResult').textContent, /отправлено/);
    assert.equal(doc.getElementById('feedbackSend').disabled, false);
    w.close();
});

test('форма поддержки: сведения о работе отправляются, только если отметка стоит', async () => {
    const send = async (checked) => {
        const { w, doc } = await openPage({});
        w.chrome.runtime.sendMessage = async () => ({ text: 'shell_off kodikplayer.com' });
        const calls = [];
        w.fetch = async (url, options) => { calls.push(JSON.parse(options.body)); return reply(200, { ok: true })(); };
        doc.getElementById('feedbackDiag').checked = checked;
        doc.getElementById('feedbackMessage').value = 'Хочу тёмную тему для расписания';
        doc.getElementById('feedbackForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
        await tick();
        w.close();
        return calls[0];
    };
    assert.match((await send(true)).diag, /shell_off kodikplayer\.com/);
    assert.equal((await send(false)).diag, '');
});

test('форма поддержки: при ошибке текст остаётся и причина понятна', async () => {
    const limit = await submitFeedback(reply(429, { error: 'limit' }));
    assert.equal(limit.doc.getElementById('feedbackMessage').value, 'Хочу тёмную тему для расписания');
    assert.match(limit.doc.getElementById('feedbackResult').textContent, /через час/);
    limit.w.close();

    const offline = await submitFeedback(() => { throw new Error('offline'); });
    assert.equal(offline.doc.getElementById('feedbackMessage').value, 'Хочу тёмную тему для расписания');
    assert.match(offline.doc.getElementById('feedbackResult').textContent, /ещё раз чуть позже/);
    assert.ok(offline.doc.getElementById('feedbackResult').classList.contains('error'));
    offline.w.close();
});

test('страница подключена в манифесте, старое меню из сборки убрано', () => {
    const m = JSON.parse(read('manifest.json'));
    assert.equal(m.options_ui.page, 'options/options.html');
    const scripts = m.content_scripts.flatMap(b => b.js || []);
    for (const gone of ['modules/animego/ag-settings.js', 'modules/jutsu/jt-settings.js', 'modules/jutsu/jt-covers.js', 'features/settings-entry.js']) {
        assert.ok(!scripts.includes(gone), gone);
    }
});
