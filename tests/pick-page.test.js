// Страница «Подбор аниме» (pick/pick.js): вопросы, подборка, «Не то», список Shikimori и продолжение прошлой подборки
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check) => {
    for (let i = 0; i < 150 && !check(); i++) await tick();
    return check();
};

// 60 тайтлов с разными жанрами: подбор не останавливается сразу
const FIELDS = ['id', 'ru', 'en', 'kind', 'eps', 'year', 'score', 'viewers', 'rating', 'ongoing', 'genres', 'studio', 'poster'];
const GENRE_SETS = [[4, 23], [8, 22], [1, 10], [7, 40], [36, 543], [30, 8], [130, 4], [29, 24], [14, 105], [19, 36]];
const ROWS = Array.from({ length: 60 }, (_, i) => [
    1000 + i, i === 0 ? 'Первый <img src=x id=injected>' : `Тайтл ${i}`, `Title ${i}`, i % 7 === 0 ? 'movie' : 'tv',
    i % 7 === 0 ? 1 : (i % 3 ? 12 : 26), 2005 + (i % 21), 7 + (i % 20) / 10, 10000 - i * 100, 'pg_13', 0,
    GENRE_SETS[i % GENRE_SETS.length], `Studio ${i % 5}`, `${1000 + i}/preview.webp`
]);
const CATALOG = { v: 1, built: '2026-11-23', fields: FIELDS, genres: { 4: 'Комедия' }, items: ROWS };

function openPage({ storage = {}, seen = null, franchise = null } = {}) {
    const { window: w, sent } = makeContentWindow('<div id="app"></div><div id="toast"></div>', 'https://ext.test/pick/pick.html', {
        onMessage: (msg) => {
            if (msg.action === 'pick_seen') return seen || { loggedIn: false, seen: [], planned: [] };
            if (msg.action === 'pick_add_planned') return { success: true };
            if (msg.action === 'shiki_get_status') return { isLoggedIn: false, clientId: 'own-client' };
            if (msg.action === 'shiki_auth_begin') return { success: true };
            if (msg.action === 'get_anime_card') return { anime: { id: msg.id, franchise: franchise ? franchise(msg.id) : null, description: `Описание ${msg.id}`, genres: ['Спорт', 'Драма'], screenshots: [1, 2, 3].map(n => ({ full: `https://shikimori.io/s/${n}.jpg`, thumb: `https://shikimori.io/s/t${n}.jpg` })) } };
            if (msg.action === 'resolve_site_url') return { url: msg.siteId === 'jutsu' ? 'https://jut-su.net/title/' : null };
            return null;
        },
        fetch: async (url) => ({ ok: String(url).endsWith('pick/catalog.json'), status: 200, json: async () => CATALOG })
    });
    const store = { ...storage };
    w.chrome.storage.local.get = async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, JSON.parse(JSON.stringify(store[k]))]));
    w.chrome.storage.local.set = async (values) => { Object.assign(store, JSON.parse(JSON.stringify(values))); };
    w.scrollTo = () => {};
    w.AG_PICK_NO_AUTOSTART = true;
    for (const f of ['modules/shared/guide-fox.js', 'modules/shared/shot-viewer.js', 'modules/shared/franchise-core.js', 'modules/shared/franchise-view.js', 'modules/shared/ext-page.js', 'modules/shared/pick-core.js', 'pick/pick.js']) w.eval(read(f));
    const page = w.AgPickPage.start();
    return { w, doc: w.document, sent, store, page };
}

const clickText = (doc, text) => {
    const b = [...doc.querySelectorAll('button, a')].find(x => x.textContent.trim() === text);
    assert.ok(b, `кнопка «${text}»`);
    b.click();
};
const question = (doc) => doc.querySelector('.pk__bubble h2') && doc.querySelector('.pk__bubble h2').textContent;
// Главный тайтл крупно, остальные постерами: вместе — подборка по порядку
const cards = (doc) => [...doc.querySelectorAll('.pk__hero, .pk__card')].map(c => Number(c.dataset.id));

test('окно расширения: значок подбора рядом со случайным аниме открывает страницу подбора', () => {
    const html = read('popup/popup.html');
    assert.match(html, /id="btnRandom"[\s\S]*?<\/button>\s*<button class="bottom-tab" id="btnPick"/);
    assert.match(read('popup/popup.js'), /btnPick[\s\S]*AgSites\.pickPageUrl\(\)/);
    assert.match(read('modules/shared/sites.js'), /pickPageUrl\(\)\s*\{\s*return chrome\.runtime\.getURL\('pick\/pick\.html'\)/);
});

test('начало: первый вопрос — темы кнопками, выбор меняет «Ничего конкретного» на «Дальше»', async () => {
    const { doc } = openPage();
    assert.ok(await until(() => doc.querySelector('.pk__start')));
    assert.equal(doc.querySelectorAll('.pk__start .pk__chip').length, 4);
    clickText(doc, 'Начать подбор');
    assert.equal(question(doc), 'Что-то из этого хочется?');
    assert.ok(doc.querySelector('[data-option="sport"]'), 'спорт среди тем');
    assert.equal(doc.querySelector('.pk__next').textContent, 'Ничего конкретного');
    doc.querySelector('[data-option="sport"]').click();
    assert.equal(doc.querySelector('[data-option="sport"]').getAttribute('aria-pressed'), 'true');
    assert.equal(doc.querySelector('.pk__next').textContent, 'Дальше');
    doc.querySelector('[data-option="sport"]').click();
    assert.equal(doc.querySelector('.pk__next').textContent, 'Ничего конкретного', 'выбор снимается');
    assert.match(doc.querySelector('.pk__qmeta').textContent, /Подходит 60 из 60/);
    assert.equal(doc.querySelectorAll('.pk__leader').length, 4, 'лидеры видны сразу');
});

test('выбранная тема: спортивных мало — подборка сразу, спорт первым и в «Почему вам»', async () => {
    const { doc, page: pageP } = openPage({ storage: { ag_pick_stable: { veteran: 'mid' } } });
    const page = await pageP;
    clickText(doc, 'Начать подбор');
    doc.querySelector('[data-option="sport"]').click();
    clickText(doc, 'Дальше');
    assert.ok(doc.querySelector('.pk__grid'), 'из 60 тайтлов спортивных шесть: спрашивать дальше незачем');
    assert.match(doc.querySelector('.pk__hero-why').textContent, /спорт/);
    const top = cards(doc).slice(0, 3).map(id => page.cat.byId.get(id));
    assert.ok(top.every(t => t.genres.has(30)), top.map(t => t.ru).join(', '));
});

test('клавиши: Enter — дальше в выборе, 1–5 — ответы по порядку кнопок, Backspace — назад', async () => {
    const opened = openPage({ storage: { ag_pick_stable: { veteran: 'mid' } } });
    const { w, doc } = opened;
    const page = await opened.page;
    clickText(doc, 'Начать подбор');
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(page.state.answers.length, 1, 'темы пропущены');
    const second = question(doc);
    assert.equal(doc.querySelectorAll('.pk__answers .pk__btn').length, 5);
    // «Скорее да» никого не выбрасывает: подбор не закончится и останется на вопросах
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: '2', bubbles: true }));
    assert.equal(page.state.answers.length, 2);
    assert.equal(page.state.answers[1].a, 'prob');
    assert.equal(doc.querySelectorAll('.pk__trail span').length, 1);
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    assert.equal(page.state.answers.length, 1);
    assert.equal(question(doc), second);
});

test('«Хватит, покажите»: лучший тайтл крупно с описанием и сайтами, ещё семь постерами', async () => {
    const { doc } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const ids = cards(doc);
    assert.equal(ids.length, 8);
    assert.equal(new Set(ids).size, 8);
    const hero = doc.querySelector('.pk__hero');
    assert.equal(Number(hero.dataset.id), ids[0]);
    assert.equal(hero.querySelector('.pk__role').textContent, 'Лучше всего подходит');
    assert.ok(await until(() => hero.querySelector('.pk__hero-desc').textContent === `Описание ${ids[0]}`), 'описание подгрузилось');
    assert.ok(await until(() => hero.querySelector('.pk__site[data-site="jutsu"]')), 'кнопка сайта, где тайтл нашёлся');
    assert.equal(hero.querySelector('.pk__site').getAttribute('target'), '_blank');
    assert.equal(doc.querySelectorAll('.pk__grid .pk__card').length, 7);
    const card = doc.querySelector('.pk__card');
    assert.ok(card.querySelector('.pk__cover .pk__role'), 'роль на постере');
    assert.match(card.querySelector('.pk__cover .pk__score').textContent, /^★ \d/, 'оценка на постере');
    assert.ok(card.querySelector('.pk__overlay [data-open]') && card.querySelector('.pk__overlay [data-seen]') && card.querySelector('.pk__overlay [data-reject]'), 'кнопки на постере');
    assert.ok(!doc.querySelector('a[href*="random.html"]'), 'на «Случайное аниме» не уводит');
    assert.equal(doc.getElementById('injected'), null, 'название — текст, а не разметка');
    assert.ok(!/null|undefined/.test(doc.getElementById('app').textContent), 'на странице нет «null»');
});

test('«Открыть» показывает тайтл панелью поверх подборки: описание, кадры, сайты; Esc закрывает', async () => {
    const { w, doc, sent } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const id = cards(doc)[2];
    doc.querySelector(`[data-open="${id}"]`).click();
    const panel = doc.querySelector('.pk__panel');
    assert.ok(panel, 'панель открылась');
    assert.equal(Number(panel.dataset.id), id);
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.ok(sent.some(m => m.action === 'get_anime_card' && m.id === id));
    assert.ok(await until(() => panel.querySelector('.pk__panel-desc').textContent === `Описание ${id}`));
    assert.equal(panel.querySelector('.pk__panel-genres').textContent, 'Спорт · Драма');
    assert.equal(panel.querySelectorAll('.pk__shot').length, 3);
    assert.ok(await until(() => panel.querySelector('.pk__site[data-site="jutsu"]')));
    assert.ok(doc.querySelector('.pk__grid'), 'подборка осталась под панелью');
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('.pk__panel'), null, 'Esc закрыл');
    assert.ok(doc.querySelector(`[data-open="${id}"]`), 'подборка та же');
});

test('«Видел» в панели закрывает её и заменяет тайтл в подборке', async () => {
    const { doc } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const id = cards(doc)[3];
    doc.querySelector(`[data-open="${id}"]`).click();
    doc.querySelector('.pk__panel [data-seen]').click();
    assert.equal(doc.querySelector('.pk__panel'), null);
    assert.ok(await until(() => !cards(doc).includes(id)));
    assert.equal(cards(doc).length, 8);
});

test('«Не то» → «Уже смотрел»: карточку заменяет другая, тайтл больше не возвращается', async () => {
    const { doc, store } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const before = cards(doc);
    doc.querySelector(`[data-reject="${before[1]}"]`).click();
    assert.equal(doc.querySelectorAll('.pk__reasons .pk__chip').length, 6);
    assert.ok(doc.querySelector(`[data-id="${before[1]}"] .pk__cover .pk__reasons`), 'причины поверх постера');
    doc.querySelector('[data-reason="seen"]').click();
    assert.ok(await until(() => !cards(doc).includes(before[1])));
    const after = cards(doc);
    assert.equal(after.length, 8);
    assert.equal(after[0], before[0], 'остальные карточки на месте');
    assert.match(doc.getElementById('toast').textContent, /Больше не предложу/);
    assert.ok(store.ag_pick_state.excluded.includes(before[1]), 'отказ сохранён');
});

test('поправка «Короче» перестраивает подборку и включается кнопкой', async () => {
    const opened = openPage();
    const { doc } = opened;
    const page = await opened.page;
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    clickText(doc, 'Короче');
    const chip = [...doc.querySelectorAll('.pk__tweaks .pk__chip')].find(c => c.textContent === 'Короче');
    assert.equal(chip.getAttribute('aria-pressed'), 'true');
    const first = page.cat.byId.get(cards(doc)[0]);
    assert.ok(first.kind === 'movie' || first.eps <= 13);
});

test('вошедший в Shikimori: увиденное скрыто, «Отложить» кладёт тайтл в «Запланировано»', async () => {
    const seenIds = ROWS.slice(0, 10).map(r => r[0]);
    const { doc, sent } = openPage({ seen: { loggedIn: true, seen: seenIds, planned: [] } });
    assert.ok(await until(() => /Скрыто из вашего списка Shikimori: 10/.test(doc.querySelector('.pk__note').textContent)));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    assert.ok(cards(doc).every(id => !seenIds.includes(id)));
    clickText(doc, 'Отложить');
    assert.ok(await until(() => doc.querySelector('.pk__btn.is-on')));
    const call = sent.find(m => m.action === 'pick_add_planned');
    assert.equal(call.id, cards(doc)[0]);
});

test('без входа в Shikimori кнопки «Отложить» нет', async () => {
    const { doc } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    assert.ok(![...doc.querySelectorAll('button')].some(b => b.textContent === 'Отложить'));
});

test('прошлая подборка открывается кнопкой «Продолжить» с теми же тайтлами', async () => {
    const first = openPage();
    await until(() => first.doc.querySelector('.pk__start'));
    clickText(first.doc, 'Начать подбор');
    clickText(first.doc, 'Хватит, покажите');
    const ids = cards(first.doc);
    await tick();

    const { doc } = openPage({ storage: first.store });
    assert.ok(await until(() => doc.querySelector('.pk__resume')));
    clickText(doc, 'Продолжить');
    assert.deepEqual(cards(doc), ids);
});

test('вопрос про опыт задаётся один раз и запоминается', async () => {
    const { doc, store } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Ничего конкретного');
    assert.equal(question(doc), 'Вы уже много аниме посмотрели?');
    clickText(doc, 'Да, много');
    await tick();
    assert.deepEqual(store.ag_pick_stable, { veteran: 'yes' });
    assert.notEqual(question(doc), 'Вы уже много аниме посмотрели?');
});

test('вопросы прошлого подбора запоминаются, чтобы в следующий раз идти реже', async () => {
    const { doc, store } = openPage({ storage: { ag_pick_stable: { veteran: 'mid' } } });
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Ничего конкретного');
    doc.querySelector('[data-answer="skip"]').click();
    clickText(doc, 'Хватит, покажите');
    assert.ok(await until(() => Array.isArray(store.ag_pick_recent)));
    assert.deepEqual(store.ag_pick_recent[0].length, 2);
});

test('«Видел» убирает тайтл одним нажатием и запоминает: в следующих подборах его нет', async () => {
    const first = openPage();
    await until(() => first.doc.querySelector('.pk__start'));
    clickText(first.doc, 'Начать подбор');
    clickText(first.doc, 'Хватит, покажите');
    const top = cards(first.doc)[0];
    first.doc.querySelector(`[data-seen="${top}"]`).click();
    assert.ok(await until(() => !cards(first.doc).includes(top)));
    assert.equal(cards(first.doc).length, 8);
    assert.deepEqual(first.store.ag_pick_seen_local, [top]);

    const { doc } = openPage({ storage: { ag_pick_seen_local: first.store.ag_pick_seen_local } });
    assert.ok(await until(() => /отметили увиденным: 1/.test((doc.querySelector('.pk__memo') || {}).textContent || '')));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    assert.ok(!cards(doc).includes(top));
});

test('«Что из этого понравилось?»: постеры отмечаются, отмеченное больше не предлагается', async () => {
    const opened = openPage({ storage: { ag_pick_stable: { veteran: 'mid' } } });
    const { doc, store } = opened;
    const page = await opened.page;
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Ничего конкретного');
    for (let i = 0; i < 10 && !doc.querySelector('.pk__liked') && !doc.querySelector('.pk__grid'); i++) {
        if (doc.querySelector('.pk__next')) doc.querySelector('.pk__next').click();
        else doc.querySelector('[data-answer="prob"]').click();
    }
    const items = [...doc.querySelectorAll('.pk__liked-item')];
    assert.ok(items.length >= 3, 'четыре постера');
    items[0].click();
    assert.ok(items[0].classList.contains('is-on'));
    const liked = Number(items[0].dataset.option);
    clickText(doc, 'Дальше');
    // Ответ мог сузить выбор так, что подборка открылась сама
    if (!doc.querySelector('.pk__grid')) clickText(doc, 'Хватит, покажите');
    assert.ok(!cards(doc).includes(liked));
    assert.ok(page.state.excluded.includes(liked));
    assert.ok(await until(() => (store.ag_pick_seen_local || []).includes(liked)), 'запомнено как увиденное');
});

test('два подбора подряд с теми же ответами: подборка другая, память о показанном сохраняется', async () => {
    const opened = openPage({ storage: { ag_pick_stable: { veteran: 'mid' } } });
    const { doc, store } = opened;
    await opened.page;
    const run = () => {
        clickText(doc, 'Начать подбор');
        clickText(doc, 'Ничего конкретного');
        clickText(doc, 'Хватит, покажите');
        return cards(doc);
    };
    const first = run();
    assert.ok(await until(() => Array.isArray(store.ag_pick_recent_shown)));
    assert.deepEqual(store.ag_pick_recent_shown[0], first);
    doc.querySelector('.pk__head .pk__link').click(); // «Начать заново»
    const second = run();
    assert.notEqual(second[0], first[0], 'главный тайтл другой');
    assert.ok(second.filter(id => first.includes(id)).length < 8, 'подборка не повторилась целиком');
    assert.ok(Array.isArray(store.ag_pick_recent_liked));
});

test('нажатие на сам постер открывает панель тайтла, а «Видел» на постере — нет', async () => {
    const { doc } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const id = cards(doc)[1];
    doc.querySelector(`.pk__card[data-id="${id}"] .pk__poster`).click();
    assert.equal(Number(doc.querySelector('.pk__panel').dataset.id), id);
    doc.querySelector('.pk__panel-close').click();
    doc.querySelector(`.pk__card[data-id="${id}"] [data-reject]`).click();
    assert.equal(doc.querySelector('.pk__panel'), null, '«Не то» не открывает панель');
});

test('смотрит много, но не вошёл в Shikimori: подсказка войти; «Не сейчас» прячет её', async () => {
    const opened = openPage({ storage: { ag_pick_stable: { veteran: 'yes' } } });
    const { doc, sent, store } = opened;
    await opened.page;
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    assert.ok(await until(() => doc.querySelector('.pk__login')));
    clickText(doc, 'Войти в Shikimori');
    assert.ok(await until(() => sent.some(m => m.action === 'shiki_auth_begin')));
    assert.equal(sent.find(m => m.action === 'shiki_auth_begin').clientId, 'own-client', 'вход с ключом зрителя');
    clickText(doc, 'Не сейчас');
    assert.equal(doc.querySelector('.pk__login'), null);
    assert.ok(await until(() => store.ag_pick_login_hint > 0));
    doc.querySelector('.pk__head .pk__link').click();
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    assert.equal(doc.querySelector('.pk__login'), null, 'неделю не показываем');
});

test('подсказки войти нет у вошедших и у тех, кто смотрит немного', async () => {
    for (const opts of [{ storage: { ag_pick_stable: { veteran: 'yes' } }, seen: { loggedIn: true, seen: [], planned: [] } }, { storage: { ag_pick_stable: { veteran: 'mid' } } }]) {
        const opened = openPage(opts);
        const { doc } = opened;
        await opened.page;
        await tick(60);
        clickText(doc, 'Начать подбор');
        clickText(doc, 'Хватит, покажите');
        await tick(60);
        assert.equal(doc.querySelector('.pk__login'), null);
    }
});

test('на постерах «почему вам» без того, что общее у всей подборки', async () => {
    const opened = openPage({ storage: { ag_pick_stable: { veteran: 'mid' } } });
    const { doc } = opened;
    await opened.page;
    clickText(doc, 'Начать подбор');
    doc.querySelector('[data-option="comedy"]').click();
    clickText(doc, 'Дальше');
    if (!doc.querySelector('.pk__grid')) clickText(doc, 'Хватит, покажите');
    const whys = [...doc.querySelectorAll('.pk__card .pk__why')].map(x => x.textContent);
    assert.ok(whys.length > 0);
    assert.ok(whys.every(w => !/смешное/.test(w)), whys.join(' | '));
    assert.match(doc.querySelector('.pk__hero-why').textContent, /смешное/, 'у главного тайтла — полный список');
});

test('«Показать ещё» дописывает новые тайтлы в конец: показанные карточки остаются на месте и не грузятся заново', async () => {
    const { doc } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const before = [...doc.querySelectorAll('.pk__hero, .pk__card')];
    const posters = [...doc.querySelectorAll('.pk__grid img')];
    clickText(doc, 'Показать ещё');
    const after = [...doc.querySelectorAll('.pk__hero, .pk__card')];
    assert.ok(after.length > before.length, 'добавились новые');
    before.forEach((node, i) => assert.equal(after[i], node, `карточка ${i + 1} та же, а не нарисована заново`));
    posters.forEach(img => assert.ok(img.isConnected, 'постер не пересоздан'));
    assert.equal(new Set(after.map(c => c.dataset.id)).size, after.length, 'без повторов');
    // Новые карточки работают как старые
    const fresh = after[after.length - 1];
    fresh.querySelector('[data-open]').click();
    assert.equal(doc.querySelector('.pk__panel').dataset.id, fresh.dataset.id);
});

test('кадры в панели открываются своим просмотром: листаются стрелками, Esc закрывает просмотр, панель остаётся', async () => {
    const { w, doc } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    doc.querySelector(`[data-open="${cards(doc)[1]}"]`).click();
    const panel = doc.querySelector('.pk__panel');
    assert.ok(await until(() => panel.querySelectorAll('.pk__shot').length === 3));
    const shot = panel.querySelectorAll('.pk__shot')[1];
    assert.equal(shot.tagName, 'BUTTON', 'кадр — кнопка просмотра, а не ссылка на Shikimori');
    shot.click();
    const viewer = doc.querySelector('.pk__viewer');
    assert.ok(viewer && !viewer.hidden, 'просмотр открылся');
    assert.equal(doc.querySelector('.pk__viewer-count').textContent, '2 / 3');
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(doc.querySelector('.pk__viewer-count').textContent, '3 / 3');
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(doc.querySelector('.pk__viewer-count').textContent, '1 / 3', 'по кругу');
    doc.querySelector('.pk__viewer-nav.is-prev').click();
    assert.equal(doc.querySelector('.pk__viewer-count').textContent, '3 / 3');
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(viewer.hidden, 'Esc закрыл просмотр');
    assert.ok(doc.querySelector('.pk__panel'), 'панель тайтла осталась');
    doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(doc.querySelector('.pk__panel'), null, 'второй Esc закрыл панель');
});

// Карточка скакала: кнопки сайтов добавлялись по одной по мере поиска
test('сайты в главной карточке и панели: место под каждый включённый сайт сразу, число мест не меняется', async () => {
    const { w, doc } = openPage();
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const enabled = w.AgSites.searchable().length;
    const hero = doc.querySelector('.pk__hero');
    assert.ok(await until(() => hero.querySelectorAll('.pk__site').length === enabled), 'места под все сайты');
    const seen = new Set();
    for (let i = 0; i < 60 && hero.querySelector('.pk__site.is-pending'); i++) {
        seen.add(hero.querySelectorAll('.pk__site').length);
        await new Promise(r => setTimeout(r, 5));
    }
    seen.add(hero.querySelectorAll('.pk__site').length);
    assert.deepEqual([...seen], [enabled], 'пока ищем и после — столько же мест');
    assert.ok(hero.querySelector('a.pk__site[data-site="jutsu"]'), 'нашёлся — ссылка');
    assert.ok(hero.querySelector('.pk__site.is-missing'), 'не нашёлся — приглушённая плашка');
    assert.equal(hero.querySelector('.pk__sites-note').textContent, '', 'строки «Ищем на сайтах» нет');
    // Панель того же тайтла: сайты из памяти, сразу в итоговом виде
    hero.querySelector('.pk__hero-poster').click();
    const panel = doc.querySelector('.pk__panel');
    assert.equal(panel.querySelectorAll('.pk__site').length, enabled);
    assert.equal(panel.querySelector('.pk__site.is-pending'), null);
});

// «Порядок просмотра»: текущий → тайтл из каталога → тайтл не из каталога
const FRANCHISE = (current) => {
    const inCatalog = current === 1005 ? 1006 : 1005;
    return {
        data: {
            current_id: current,
            nodes: [
                { id: current, name: 'Текущий', kind: 'TV Сериал', year: 2010, date: 100 },
                { id: inCatalog, name: 'Из каталога', kind: 'TV Сериал', year: 2012, date: 200 },
                { id: 777777, name: 'Вне каталога <b id=bad>', kind: 'Фильм', year: 2014, date: 300 }
            ],
            links: [
                { source_id: current, target_id: inCatalog, relation: 'sequel' },
                { source_id: inCatalog, target_id: 777777, relation: 'sequel' }
            ]
        },
        posters: { 777777: 'https://shikimori.io/p/777777.jpg' }
    };
};

test('порядок просмотра в главной карточке: свой тайтл отмечен, переход открывает панель — и для тайтла не из каталога', async () => {
    const { doc, sent } = openPage({ franchise: FRANCHISE });
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const hero = doc.querySelector('.pk__hero');
    assert.ok(await until(() => hero.querySelector('.pk__franchise .fr')), 'блок в главной карточке');
    const items = [...hero.querySelectorAll('.fr__item[data-fr-id]')];
    assert.equal(items.length, 3);
    assert.equal(Number(hero.querySelector('.fr__item.is-here').dataset.frId), Number(hero.dataset.id));
    assert.equal(doc.getElementById('bad'), null, 'название — текст');

    // Тайтл из каталога — обычная панель с «Почему вам»
    items[1].querySelector('button').click();
    let panel = doc.querySelector('.pk__panel');
    assert.equal(panel.dataset.id, items[1].dataset.frId, 'открыт тайтл из каталога — с его названием и данными каталога');
    assert.ok(panel.querySelector('.pk__hero-why'));

    // Тайтл не из каталога — облегчённая панель: без «Почему вам» и «Похожее», постер из франшизы, подробности из Shikimori
    assert.ok(await until(() => panel.querySelector('.pk__franchise .fr')), 'в панели тоже порядок просмотра');
    panel.querySelector('.fr__item[data-fr-id="777777"] button').click();
    panel = doc.querySelector('.pk__panel');
    assert.equal(panel.dataset.id, '777777');
    assert.equal(panel.querySelector('h2').textContent, 'Вне каталога <b id=bad>');
    assert.equal(panel.querySelector('.pk__hero-why'), null);
    assert.ok(![...panel.querySelectorAll('button')].some(b => b.textContent === 'Похожее'));
    assert.equal(panel.querySelector('.pk__panel-poster').getAttribute('src'), 'https://shikimori.io/p/777777.jpg');
    assert.ok(await until(() => panel.querySelector('.pk__panel-desc').textContent === 'Описание 777777'));
    assert.ok(sent.some(m => m.action === 'get_anime_card' && m.id === 777777));
    assert.equal(panel.querySelector('.pk__franchise .fr__item.is-here').dataset.frId, '777777', '«вы здесь» — открытый тайтл');
});

test('порядок просмотра в подборе: «По выходу» меняет и главную карточку, и открытую панель', async () => {
    const { doc } = openPage({ franchise: FRANCHISE });
    await until(() => doc.querySelector('.pk__start'));
    clickText(doc, 'Начать подбор');
    clickText(doc, 'Хватит, покажите');
    const hero = doc.querySelector('.pk__hero');
    assert.ok(await until(() => hero.querySelector('.pk__franchise .fr')));
    hero.querySelector('.pk__hero-poster').click();
    const panel = doc.querySelector('.pk__panel');
    assert.ok(await until(() => panel.querySelector('.pk__franchise .fr')));
    panel.querySelector('[data-act="fr-mode"][data-v="release"]').click();
    for (const box of [hero, panel]) assert.equal(box.querySelector('[data-act="fr-mode"][data-v="release"]').getAttribute('aria-pressed'), 'true');
    panel.querySelector('[data-act="fr-mode"][data-v="story"]').click();
});
