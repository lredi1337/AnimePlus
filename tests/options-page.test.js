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
    for (const f of ['config.js', 'modules/player/shell-view.js', 'modules/shared/ui-kit.js', 'modules/shared/guide.js', 'modules/shared/guide-fox.js', 'options/options.js']) w.eval(read(f));
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

// В jsdom нет стилей, поэтому проверяем сам CSS: правило вида `.hint { display: block }` перебивало атрибут hidden,
// и надпись «Своих тем уже 12» была видна всегда
test('атрибут hidden прячет элемент при любых стилях страницы', async () => {
    const css = read('options/options.css');
    assert.match(css, /(^|\n)\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
    const { w, doc } = await openPage({});
    assert.ok(doc.getElementById('skinLimit').hidden, 'своих тем нет, надпись о лимите скрыта');
    w.close();
});

test('разделы: открыт один, выбор записан в адресе, старые ссылки на поддержку работают', async () => {
    const { w, doc } = await openPage({});
    const shown = () => [...doc.querySelectorAll('.pane')].filter(p => !p.hidden).map(p => p.dataset.pane);
    const current = () => doc.querySelector('.nav-item[aria-current="page"]').dataset.pane;
    assert.deepEqual(shown(), ['player'], 'по умолчанию вид плеера');
    assert.equal(current(), 'player');
    for (const [hash, pane] of [['#voice', 'voice'], ['#keys', 'keys'], ['#random', 'random'], ['#help', 'help'], ['#guide', 'help'], ['#нет-такого', 'player']]) {
        w.location.hash = hash;
        w.dispatchEvent(new w.HashChangeEvent('hashchange'));
        assert.deepEqual(shown(), [pane], hash);
        assert.equal(current(), pane, hash);
    }
    // Ссылка из окна расширения ведёт на форму и ставит курсор в сообщение
    w.location.hash = '#support';
    w.dispatchEvent(new w.HashChangeEvent('hashchange'));
    assert.deepEqual(shown(), ['help']);
    assert.equal(doc.activeElement.id, 'feedbackMessage');
    // Каждый раздел есть в меню
    assert.deepEqual([...doc.querySelectorAll('.nav-item')].map(a => a.dataset.pane), [...doc.querySelectorAll('.pane')].map(p => p.dataset.pane));
    w.close();
});

test('редактор темы: части на вкладках, видна одна, при открытии первая', async () => {
    const { w, doc } = await openPage({});
    doc.getElementById('skinCreate').click();
    assert.ok(doc.querySelector('.skin-card').classList.contains('editing'));
    const tabs = [...doc.querySelectorAll('#edTabs [role="tab"]')];
    assert.deepEqual(tabs.map(t => t.textContent), ['Панель', 'Центр', 'Боковые', 'Кнопки', 'Цвета']);
    const visible = () => [...doc.querySelectorAll('.ed-group')].filter(g => !g.hidden).map(g => g.dataset.tab);
    assert.deepEqual(visible(), ['Панель']);
    tabs[4].click();
    assert.deepEqual(visible(), ['Цвета']);
    assert.equal(tabs[4].getAttribute('aria-selected'), 'true');
    doc.getElementById('edCancel').click();
    doc.getElementById('skinCreate').click();
    assert.deepEqual(visible(), ['Панель'], 'новая правка начинается с первой вкладки');
    w.close();
});

test('адрес почты поддержки на странице не показывается', async () => {
    const { w, doc } = await openPage({});
    assert.ok(!doc.body.innerHTML.includes('@gmail'));
    assert.equal(doc.querySelector('a[href^="mailto:"]'), null);
    w.close();
});

test('поддержка заметна в меню, настройки отмечают задание, экскурсия начинается заново', async () => {
    const { w, doc, store } = await openPage({});
    const help = doc.getElementById('helpBanner');
    assert.ok(help.closest('.side'), 'ссылка «Написать» в меню, видна из любого раздела');
    assert.equal(help.getAttribute('href'), '#support');
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

test('оформление плеера: пять тем, выбранная отмечена, выбор сохраняется сразу', async () => {
    const { w, doc, store } = await openPage({ playerSkin: 'glass' });
    const cards = [...doc.querySelectorAll('#skinList [role="radio"]')];
    assert.deepEqual(cards.map(c => c.dataset.skin), ['compact', 'minimal', 'glass', 'cinema', 'islands']);
    assert.deepEqual(cards.filter(c => c.getAttribute('aria-checked') === 'true').map(c => c.dataset.skin), ['glass']);
    cards[3].click();
    await tick();
    assert.equal(store.ag_settings.playerSkin, 'cinema');
    assert.deepEqual([...doc.querySelectorAll('#skinList [aria-checked="true"]')].map(c => c.dataset.skin), ['cinema']);
    w.close();
});

test('оформление плеера: без сохранённой темы отмечен нынешний вид', async () => {
    const { w, doc } = await openPage({});
    assert.equal(doc.querySelector('#skinList [aria-checked="true"]').dataset.skin, 'compact');
    w.close();
});

test('оформление плеера: сверху крупно выбранная тема, это настоящая оболочка плеера', async () => {
    const { w, doc } = await openPage({ playerSkin: 'glass' });
    const big = () => doc.querySelector('#skinPreview > div').shadowRoot.querySelector('.root');
    assert.equal(big().dataset.skin, 'glass');
    assert.ok(big().querySelector('[data-act="skip"]'), 'в превью те же кнопки, что в плеере');
    assert.equal(doc.getElementById('skinName').textContent, 'Стекло');
    // У каждой миниатюры своя тема
    assert.deepEqual([...doc.querySelectorAll('#skinList .preview > div')].map(h => h.shadowRoot.querySelector('.root').dataset.skin), ['compact', 'minimal', 'glass', 'cinema', 'islands']);
    doc.querySelector('#skinList [data-skin="cinema"]').click();
    await tick();
    assert.equal(big().dataset.skin, 'cinema');
    assert.equal(doc.getElementById('skinName').textContent, 'Кино');
    w.close();
});

test('превью темы кликабельное: панели открываются как в плеере, настройки при этом не меняются', async () => {
    const { w, doc, store } = await openPage({ playerSkin: 'glass', autoNext: true });
    const sh = doc.querySelector('#skinPreview > div').shadowRoot;
    const root = sh.querySelector('.root');
    const press = (sel) => sh.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true, composed: true }));

    press('[data-act="episodes"]');
    assert.ok(root.classList.contains('with-panel'));
    assert.equal(sh.querySelector('.panel h3').firstChild.textContent, 'Серии');
    assert.ok(sh.querySelectorAll('.panel .ep').length > 10);
    assert.equal(sh.querySelector('[data-act="episodes"]').getAttribute('aria-expanded'), 'true');
    press('.panel .ep:not(.now)');
    assert.equal(sh.querySelectorAll('.panel .ep.now').length, 1);

    press('[data-act="voices"]');
    assert.equal(sh.querySelector('.panel h3').firstChild.textContent, 'Озвучка');
    assert.ok(sh.querySelector('.panel .row.on'));
    press('[data-act="players"]');
    assert.equal(sh.querySelector('.panel h3').firstChild.textContent, 'Плеер');

    press('[data-act="settings"]');
    const before = JSON.stringify(store.ag_settings);
    press('.panel [role="switch"]');
    assert.equal(JSON.stringify(store.ag_settings), before, 'переключатели в превью только показывают вид');

    press('.panel h3 button');
    assert.ok(!root.classList.contains('with-panel'));
    // Смена темы не закрывает открытую панель: темы удобно сравнивать
    press('[data-act="settings"]');
    doc.querySelector('#skinList [data-skin="islands"]').click();
    await tick();
    assert.equal(doc.querySelector('#skinPreview > div').shadowRoot.querySelector('.root').dataset.skin, 'islands');
    assert.ok(doc.querySelector('#skinPreview > div').shadowRoot.querySelector('.root').classList.contains('with-panel'));
    w.close();
});

const fire = (w, el, type = 'input') => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const stageRoot = (doc) => doc.querySelector('#skinPreview > div').shadowRoot.querySelector('.root');

test('редактор: своя тема с нуля, изменения видны в превью сразу, сохраняется отдельно и выбирается', async () => {
    const { w, doc, store } = await openPage({});
    assert.ok(doc.getElementById('skinEditor').hidden);
    doc.getElementById('skinCreate').click();
    assert.ok(!doc.getElementById('skinEditor').hidden);
    assert.equal(doc.getElementById('edBar').value, 'full', 'с нуля значит от нынешнего вида');
    assert.equal(doc.getElementById('edAccent').value, '#ef4444');
    doc.getElementById('edName').value = 'Синяя';
    doc.getElementById('edAccent').value = '#3b82f6';
    fire(w, doc.getElementById('edAccent'));
    assert.equal(stageRoot(doc).style.getPropertyValue('--rail-done'), '#3b82f6', 'превью меняется до сохранения');
    assert.equal(store.ag_settings.custom_skins, undefined, 'пока не сохранено, настройки не тронуты');
    doc.getElementById('edSave').click();
    await tick();
    const saved = store.ag_settings.custom_skins;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'Синяя');
    assert.equal(saved[0].values.bar, 'full');
    assert.equal(saved[0].values.accent, '#3b82f6');
    assert.equal(store.ag_settings.playerSkin, saved[0].id);
    assert.ok(doc.getElementById('skinEditor').hidden);
    const checked = [...doc.querySelectorAll('#skinList [aria-checked="true"]')];
    assert.deepEqual(checked.map(b => b.dataset.skin), [saved[0].id]);
    assert.equal(doc.querySelectorAll('#skinList [role="radio"]').length, 6);
    w.close();
});

test('редактор: копия встроенной темы берёт её раскладку и вид, встроенная не меняется', async () => {
    const { w, doc, store } = await openPage({ playerSkin: 'glass' });
    doc.getElementById('skinCopy').click();
    assert.equal(doc.getElementById('edBar').value, 'floating', 'копия собирается из тех же блоков');
    assert.equal(doc.getElementById('edCenter').value, 'circles');
    assert.equal(doc.getElementById('edName').value, 'Стекло, копия');
    assert.equal(doc.getElementById('edAccent').value, '#ff7d8e', 'ручки стоят как у основы');
    doc.getElementById('edRadius').value = '0';
    fire(w, doc.getElementById('edRadius'));
    doc.getElementById('edSave').click();
    await tick();
    const [c] = store.ag_settings.custom_skins;
    assert.equal(c.values.bar, 'floating');
    assert.equal(c.values.radius, 0);
    assert.equal(doc.querySelectorAll('#skinList [data-skin="glass"]').length, 1, 'встроенное «Стекло» осталось');
    w.close();
});

test('редактор: отмена ничего не сохраняет и возвращает превью', async () => {
    const { w, doc, store } = await openPage({ playerSkin: 'cinema' });
    doc.getElementById('skinCreate').click();
    doc.getElementById('edAccent').value = '#00ff00';
    fire(w, doc.getElementById('edAccent'));
    doc.getElementById('edCancel').click();
    await tick();
    assert.equal(store.ag_settings.custom_skins, undefined);
    assert.equal(stageRoot(doc).dataset.skin, 'cinema');
    assert.equal(stageRoot(doc).style.getPropertyValue('--rail-done'), '');
    w.close();
});

test('своя тема: правка сохраняется в неё же, удаление с подтверждением возвращает нынешний вид', async () => {
    const mine = { id: 'custom-7', name: 'Моя', values: { bar: 'plates', accent: '#3b82f6' } };
    const { w, doc, store } = await openPage({ playerSkin: 'custom-7', custom_skins: [mine] });
    assert.equal(stageRoot(doc).dataset.skin, 'custom');
    assert.equal(stageRoot(doc).dataset.bar, 'plates');
    assert.equal(doc.getElementById('skinName').textContent, 'Моя');
    assert.ok(doc.getElementById('skinCopy').hidden, 'у своей темы «Изменить», а не копия');
    doc.getElementById('skinEdit').click();
    assert.equal(doc.getElementById('edAccent').value, '#3b82f6');
    doc.getElementById('edAccent').value = '#22c55e';
    fire(w, doc.getElementById('edAccent'));
    doc.getElementById('edSave').click();
    await tick();
    assert.equal(store.ag_settings.custom_skins.length, 1);
    assert.equal(store.ag_settings.custom_skins[0].values.accent, '#22c55e');

    doc.getElementById('skinDelete').click();
    await tick();
    assert.equal(store.ag_settings.custom_skins.length, 1, 'первое нажатие только спрашивает');
    assert.equal(doc.getElementById('skinDelete').textContent, 'Точно удалить?');
    doc.getElementById('skinDelete').click();
    await tick();
    assert.deepEqual(store.ag_settings.custom_skins, []);
    assert.equal(store.ag_settings.playerSkin, 'compact');
    assert.equal(doc.querySelectorAll('#skinList [role="radio"]').length, 5);
    w.close();
});

test('конструктор: части сочетаются свободно, порядок кнопок меняется, лишние прячутся', async () => {
    const { w, doc, store } = await openPage({});
    doc.getElementById('skinCreate').click();
    for (const [id, value] of [['edBar', 'capsule'], ['edTitlePos', 'card'], ['edCenter', 'plate'], ['edPanel', 'floating'], ['edSize', 'large']]) {
        doc.getElementById(id).value = value;
        fire(w, doc.getElementById(id));
    }
    const root = stageRoot(doc);
    assert.deepEqual([root.dataset.bar, root.dataset.title, root.dataset.center, root.dataset.panel, root.dataset.size], ['capsule', 'card', 'plate', 'floating', 'large']);
    // Полоса под превью повторяет нижнюю панель: кнопки слева, промежуток, кнопки справа
    const strip = doc.getElementById('edOrder');
    assert.ok(!strip.closest('form'), 'полоса стоит под превью, а не в столбце ручек');
    assert.ok(!doc.getElementById('edStrip').hidden, 'во время правки полоса видна');
    assert.deepEqual(chipIds(doc), ['skip', 'clock', 'gap', 'vol', 'episodes', 'voices', 'players', 'settings', 'full']);
    // «Весь экран» в начало с клавиатуры: стрелка влево, пока не станет первой
    for (let i = 0; i < 8; i++) chip(doc, 'full').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(chipIds(doc)[0], 'full');
    assert.equal(doc.activeElement.dataset.id, 'full', 'фокус остаётся на передвинутой кнопке');
    assert.equal(root.style.getPropertyValue('--ord-full'), '0');
    // Нажатие прячет кнопку и показывает обратно
    chip(doc, 'clock').click();
    assert.equal(root.dataset.hide, 'clock');
    assert.ok(chip(doc, 'clock').classList.contains('off'));
    assert.equal(chip(doc, 'clock').getAttribute('aria-pressed'), 'false');
    chip(doc, 'settings').click();
    chip(doc, 'gap').click();
    assert.equal(root.dataset.hide, 'clock', '«Настройки» и промежуток не прячутся');
    doc.getElementById('edPip').checked = false;
    fire(w, doc.getElementById('edPip'));
    assert.equal(root.dataset.hide, 'clock pip');
    doc.getElementById('edSave').click();
    await tick();
    const v = store.ag_settings.custom_skins[0].values;
    assert.equal(v.bar, 'capsule');
    assert.equal(v.order[0], 'full');
    assert.deepEqual([...v.hide], ['clock', 'pip']);
    assert.ok(doc.getElementById('edStrip').hidden, 'после сохранения полоса убрана');
    w.close();
});

// В jsdom нет раскладки: кнопки полосы стоят в ряд по 50 px, место кнопки — её место в полосе
function layoutChips(doc) {
    for (const el of doc.querySelectorAll('#edOrder .chip')) {
        el.getBoundingClientRect = () => {
            const left = [...el.parentNode.children].indexOf(el) * 50;
            return { left, right: left + 46, width: 46, top: 0, bottom: 30, height: 30, x: left, y: 0 };
        };
    }
}
const chipIds = (doc) => [...doc.querySelectorAll('#edOrder .chip')].map(c => c.dataset.id);
const chip = (doc, id) => doc.querySelector(`#edOrder .chip[data-id="${id}"]`);
const pointerX = (w, el, type, x) => el.dispatchEvent(new w.PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 10, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1 }));

test('порядок кнопок: кнопку перетаскивают мышью, превью меняется на лету, нажатие после перетаскивания не прячет', async () => {
    const { w, doc, store } = await openPage({});
    doc.getElementById('skinCreate').click();
    layoutChips(doc);
    // «Звук» (место 3, x 150–196) тащим влево, в начало
    pointerX(w, chip(doc, 'vol'), 'pointerdown', 170);
    for (const x of [160, 120, 60, 5]) pointerX(w, doc, 'pointermove', x);
    assert.deepEqual(chipIds(doc).slice(0, 3), ['vol', 'skip', 'clock'], 'кнопка уже стоит на новом месте');
    assert.ok(chip(doc, 'vol').classList.contains('dragging'));
    assert.equal(stageRoot(doc).style.getPropertyValue('--ord-vol'), '0', 'превью показывает новый порядок до отпускания');
    pointerX(w, doc, 'pointerup', 5);
    chip(doc, 'vol').click();
    assert.equal(stageRoot(doc).dataset.hide || '', '', 'щелчок, которым закончилось перетаскивание, кнопку не прячет');
    assert.ok(!chip(doc, 'vol').classList.contains('dragging'));
    // Промежуток тоже двигается: «Время» уходит вправо
    layoutChips(doc);
    pointerX(w, chip(doc, 'gap'), 'pointerdown', 120);
    for (const x of [110, 80, 55]) pointerX(w, doc, 'pointermove', x);
    pointerX(w, doc, 'pointerup', 55);
    assert.deepEqual(chipIds(doc).slice(0, 4), ['vol', 'gap', 'skip', 'clock']);
    // Короткое нажатие без движения ничего не двигает
    layoutChips(doc);
    pointerX(w, chip(doc, 'full'), 'pointerdown', 420);
    pointerX(w, doc, 'pointermove', 422);
    pointerX(w, doc, 'pointerup', 422);
    assert.equal(chipIds(doc).at(-1), 'full');
    doc.getElementById('edSave').click();
    await tick();
    assert.deepEqual([...store.ag_settings.custom_skins[0].values.order].slice(0, 4), ['vol', 'gap', 'skip', 'clock']);
    w.close();
});
