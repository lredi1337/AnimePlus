// Раскладки стилей «Случайного аниме» и «Топа Shikimori» (modules/looks): те же данные и действия, что у обычной страницы
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
const until = async (check) => {
    for (let i = 0; i < 150 && !check(); i++) await tick(20);
    return check();
};

const STYLES = ['cinema', 'magazine', 'manga', 'arcade', 'bento'];
// Корневые классы раскладок в шаблонах стилей
const ROOT = { cinema: '.cn', magazine: '.mg', manga: '.mn', arcade: '.ar', bento: '.bt' };
const LOOK_FILES = ['modules/looks/look-pages.js', ...STYLES.map(s => `modules/looks/${s}.js`)];

const anime = (id, extra = {}) => ({
    id, name: `Title ${id}`, russian: `Тайтл ${id} <img src=x id=injected>`, kind: 'tv', kindLabel: 'Сериал', score: '8.1', year: '2019',
    episodes: 24, status: 'ongoing', genres: ['Экшен', 'Драма'], description: 'Описание <b id=bold>тайтла</b>.', poster: 'https://shikimori.io/p.jpg', studio: 'Studio <i>',
    screenshots: Array.from({ length: 8 }, (_, i) => ({ full: `https://shikimori.io/s/o${i}.jpg`, thumb: `https://shikimori.io/s/t${i}.jpg` })),
    ...extra
});

function openRandom(style, { cards = [{ anime: anime(7) }, { anime: anime(8) }], siteUrls = { jutsu: 'https://jut-su.net/seven/' }, siteDelay = 0 } = {}) {
    let answered = 0;
    let i = 0;
    const { window: w, sent } = makeContentWindow('<div id="app"></div>', 'https://ext.test/random/random.html', {
        onMessage: (msg) => {
            if (msg.action === 'get_random_anime_card') return cards[Math.min(i++, cards.length - 1)];
            // Сайты отвечают по одному, как в жизни: с siteDelay каждый следующий позже предыдущего
            if (msg.action === 'resolve_site_url') {
                const reply = { url: siteUrls[msg.siteId] || null };
                return siteDelay ? new Promise(r => setTimeout(() => r(reply), siteDelay * ++answered)) : reply;
            }
            return null;
        }
    });
    w.document.documentElement.dataset.look = style;
    w.chrome.storage.local.get = async () => ({ ag_settings: { random_min_score: 7.5, random_kinds: ['tv', 'movie'] } });
    const created = [];
    w.chrome.tabs = { create: (o) => { created.push(o.url); return Promise.resolve(); } };
    w.scrollTo = () => {};
    w.eval(read('modules/shared/ext-page.js'));
    w.eval(read('modules/shared/shot-viewer.js'));
    for (const f of LOOK_FILES) w.eval(read(f));
    w.eval(read('random/random.js'));
    return { w, doc: w.document, sent, created };
}

for (const style of STYLES) {
    test(`«Случайное», ${style}: раскладка стиля вместо обычной страницы, данные экранированы, кнопки работают`, async () => {
        const { doc, sent, created } = openRandom(style);
        assert.ok(await until(() => doc.querySelector(`.lk ${ROOT[style]}`)), 'раскладка стиля нарисована');
        assert.ok(doc.body.classList.contains('is-look'));
        assert.equal(doc.getElementById('injected'), null, 'название не вставлено как разметка');
        assert.equal(doc.getElementById('bold'), null, 'описание не вставлено как разметка');
        assert.match(doc.querySelector('.lk').textContent, /Тайтл 7/);
        assert.match(doc.querySelector('.lk').textContent, /Оценка от 7\.5 · Сериалы, Фильмы/, 'фильтры зрителя в шапке');
        // Сайт, где тайтл нашёлся, появляется в раскладке настоящей ссылкой
        assert.ok(await until(() => doc.querySelector('.lk a[data-site="jutsu"]')));
        assert.equal(doc.querySelector('.lk a[data-site="jutsu"]').getAttribute('href'), 'https://jut-su.net/seven/');
        // Кадр открывает просмотр
        doc.querySelector('.lk [data-act="shot"][data-v="2"]').click();
        assert.equal(doc.querySelector('.rnd__viewer').hidden, false);
        assert.equal(doc.querySelector('.rnd__viewer-count').textContent, '3 / 8');
        doc.querySelector('.rnd__viewer-close').click();
        // «Изменить» ведёт в настройки случайного аниме
        doc.querySelector('.lk [data-act="settings"]').click();
        assert.match(created[0], /options\/options\.html#random$/);
        // «Ещё»: новый тайтл без показанного, прошлый в истории и открывается из неё
        doc.querySelector('.lk [data-act="next"]').click();
        assert.ok(await until(() => /Тайтл 8/.test(doc.querySelector('.lk').textContent) && !doc.querySelector('.lk.is-busy')));
        assert.deepEqual([...sent.filter(m => m.action === 'get_random_anime_card').pop().exclude], [7]);
        const past = doc.querySelector('.lk [data-act="history"][data-v="7"]');
        assert.ok(past, 'прошлый тайтл в истории');
        past.click();
        assert.ok(await until(() => /Тайтл 7/.test(doc.querySelector('.lk').textContent)));
    });
}

test('«Случайное»: описание раскрывается, стиль меняется на лету, «Классический» — обычная страница', async () => {
    const { w, doc } = openRandom('manga');
    assert.ok(await until(() => doc.querySelector('.lk .mn')));
    doc.querySelector('.lk [data-act="desc"]').click();
    assert.match(doc.querySelector('.lk [data-act="desc"]').textContent, /Свернуть/);
    // Стиль сменили в настройках: look.js шлёт событие ag-look
    doc.documentElement.dataset.look = 'cinema';
    doc.dispatchEvent(new w.CustomEvent('ag-look'));
    assert.ok(doc.querySelector('.lk .cn'));
    doc.documentElement.dataset.look = 'classic';
    doc.dispatchEvent(new w.CustomEvent('ag-look'));
    assert.equal(doc.body.classList.contains('is-look'), false);
    assert.equal(doc.querySelector('.lk').children.length, 0);
    assert.ok(doc.querySelector('.rnd__card'), 'обычная карточка на месте');
});

test('«Случайное»: при ошибке и до первого тайтла видна обычная страница', async () => {
    const { doc } = openRandom('manga', { cards: [{ anime: null, reason: 'no_match' }] });
    assert.ok(await until(() => doc.querySelector('.rnd__empty')));
    assert.equal(doc.body.classList.contains('is-look'), false, 'объяснение и путь в настройки видны');
});

// ---------- Топ ----------
const TOP = Array.from({ length: 50 }, (_, i) => ({ id: 100 + i, name: `Top ${i}`, russian: `Топ ${i} <img src=x id=injected>`, score: String(9.1 - i / 100), kind: i % 5 ? 'tv' : 'movie', episodes: 12, aired_on: '2010-01-01', image: { original: `/p/${i}.jpg` } }));

function openTop(style, query, { found = null, store = {} } = {}) {
    const { window: w, sent } = makeContentWindow('<div id="app"></div>', `https://ext.test/top/top.html?${new URLSearchParams(query)}`, {
        onMessage: (msg) => {
            if (msg.action === 'fetch_shikimori') return { data: TOP, status: 200 };
            if (msg.action === 'resolve_site_url') return { url: found };
            return null;
        }
    });
    w.document.documentElement.dataset.look = style;
    w.chrome.storage.local.get = async (keys) => Object.fromEntries(keys.filter(k => k in store).map(k => [k, store[k]]));
    w.chrome.storage.local.set = async (obj) => { Object.assign(store, obj); };
    w.agBindPostersIn = () => {};
    // В jsdom высота страницы нулевая, и Топ подгружал бы весь рейтинг сам: страница высокая, как с полным рядом постеров
    Object.defineProperty(w.document.documentElement, 'scrollHeight', { get: () => 100000 });
    w.scrollTo = () => {};
    w.parent.postMessage = () => {};
    w.eval(read('modules/shared/ext-page.js'));
    w.eval(read('modules/shared/shot-viewer.js'));
    for (const f of LOOK_FILES) w.eval(read(f));
    w.eval(read('top/top.js'));
    const visited = [];
    w.AgTopPage.navigate = (url) => visited.push(url);
    return { w, doc: w.document, sent, visited, store };
}

for (const style of STYLES) {
    test(`Топ, ${style}: раскладка стиля во вкладке, фильтры и выбор сайта работают`, async () => {
        const { doc, sent, store } = openTop(style, { pick: '1' });
        assert.ok(await until(() => doc.querySelectorAll('.lk [data-act="open-top"]').length === 50), 'пятьдесят тайтлов в раскладке');
        assert.ok(doc.body.classList.contains('is-look'));
        assert.equal(doc.getElementById('injected'), null);
        // Тип: тот же запрос, что у обычной страницы
        doc.querySelector('.lk [data-act="kind"][data-v="movie"]').click();
        assert.ok(await until(() => sent.some(m => m.action === 'fetch_shikimori' && /kind=movie/.test(m.url))));
        assert.ok(await until(() => doc.querySelector('.lk [data-act="kind"][data-v="movie"]').getAttribute('aria-pressed') === 'true'));
        // Выбор сайта: список, выбор запоминается
        doc.querySelector('.lk [data-act="site-menu"]').click();
        doc.querySelector('.lk [data-act="site"][data-v="jutsu"]').click();
        assert.ok(await until(() => store.ag_top_site === 'jutsu'));
        assert.ok(await until(() => /Jut-Su/.test(doc.querySelector('.lk .site-menu').textContent)));
    });
}

test('Топ: тайтл открывается на выбранном сайте, а если его там нет — сообщение со ссылкой на Shikimori', async () => {
    const page = openTop('manga', { pick: '1' }, { found: 'https://animego.me/anime/x' });
    assert.ok(await until(() => page.doc.querySelector('.lk [data-act="open-top"]')));
    page.doc.querySelector('.lk [data-act="open-top"]').click();
    assert.ok(await until(() => page.visited.length === 1));
    assert.equal(page.visited[0], 'https://animego.me/anime/x');

    // У AnimeGO тайтл открывается всегда (страница из данных Shikimori), поэтому сайт — Jut-Su
    const none = openTop('manga', { pick: '1' }, { found: null, store: { ag_top_site: 'jutsu' } });
    await until(() => none.doc.querySelector('.lk [data-act="open-top"]'));
    none.doc.querySelector('.lk [data-act="open-top"]').click();
    assert.ok(await until(() => /Нет на/.test(none.doc.querySelector('.lk-toast').textContent)));
    assert.equal(none.doc.querySelector('.lk-toast a').getAttribute('href'), 'https://shikimori.io/animes/100');
    assert.equal(none.visited.length, 0);
});

test('Топ: «Ещё» подгружает следующую страницу рейтинга', async () => {
    const { doc, sent } = openTop('magazine', { pick: '1' });
    assert.ok(await until(() => doc.querySelector('.lk [data-act="more"]')));
    const before = sent.filter(m => m.action === 'fetch_shikimori').length;
    doc.querySelector('.lk [data-act="more"]').click();
    assert.ok(await until(() => sent.filter(m => m.action === 'fetch_shikimori').length > before));
    assert.match(sent.filter(m => m.action === 'fetch_shikimori').pop().url, /page=2/);
});

test('Топ поверх сайта остаётся обычным в любом стиле', async () => {
    const { doc } = openTop('manga', { embed: '1', site: 'jutsu' });
    assert.ok(await until(() => doc.querySelector('.top__card')));
    assert.equal(doc.body.classList.contains('is-look'), false);
    assert.equal(doc.querySelector('.lk').children.length, 0);
});

test('страницы подключают раскладки, шрифты и их лицензию', () => {
    for (const page of ['random/random.html', 'top/top.html']) {
        const html = read(page);
        for (const s of STYLES) {
            assert.ok(html.includes(`../modules/looks/${s}.css`), `${page}: ${s}.css`);
            assert.ok(html.includes(`../modules/looks/${s}.js`), `${page}: ${s}.js`);
        }
        assert.ok(html.includes('../modules/looks/look-pages.js') && html.includes('../modules/looks/base.css'), page);
    }
    const own = { 'popup/popup.html': 'popup.css', 'options/options.html': 'options.css', 'random/random.html': 'random.css', 'top/top.html': 'top.css', 'top/frame.html': 'top.css', 'schedule/schedule.html': 'schedule.css', 'schedule/frame.html': 'schedule.css', 'pick/pick.html': 'pick.css' };
    for (const [page, css] of Object.entries(own)) {
        const html = read(page);
        assert.ok(html.includes('../modules/looks/fonts.css'), `${page}: шрифты`);
        // Украшения стилей перекрывают CSS страницы, поэтому идут после него
        assert.ok(html.indexOf('../modules/looks/decor.css') > html.indexOf(`href="${css}"`), `${page}: decor.css после ${css}`);
    }
    // Каждый шрифт из fonts.css лежит в fonts/, лицензия рядом
    const fs = require('node:fs');
    const path = require('node:path');
    const files = [...read('modules/looks/fonts.css').matchAll(/url\("\.\.\/\.\.\/fonts\/([^"]+)"\)/g)].map(m => m[1]);
    assert.ok(files.length >= 16);
    for (const f of files) assert.ok(fs.existsSync(path.join(__dirname, '..', 'fonts', f)), f);
    assert.match(read('fonts/OFL.txt'), /SIL OPEN FONT LICENSE/);
});

// Мигание: раскладка перерисовывалась целиком на каждый найденный сайт и каждую подгрузку Топа,
// анимации появления запускались заново, картинки пересоздавались
test('«Случайное»: пока ищутся сайты, страница не перерисовывается заново — постер и раскладка те же', async () => {
    const { doc } = openRandom('cinema', { siteUrls: { jutsu: 'https://jut-su.net/7/', animego: 'https://animego.me/anime/7', animevost: 'https://animevost.org/7' }, siteDelay: 40 });
    assert.ok(await until(() => doc.querySelector('.lk .cn')));
    const root = doc.querySelector('.lk .cn');
    const poster = doc.querySelector('.lk img');
    assert.ok(await until(() => doc.querySelectorAll('.lk a[data-site]').length >= 2), 'сайты нашлись');
    assert.equal(doc.querySelector('.lk .cn'), root, 'корень раскладки тот же: анимация появления не запускается снова');
    assert.equal(doc.querySelector('.lk img'), poster, 'постер тот же элемент: не мигает');
});

test('«Случайное»: новый тайтл рисуется заново — его анимация появления видна', async () => {
    const { doc } = openRandom('cinema');
    assert.ok(await until(() => doc.querySelector('.lk .cn')));
    const root = doc.querySelector('.lk .cn');
    doc.querySelector('.lk [data-act="next"]').click();
    assert.ok(await until(() => /Тайтл 8/.test(doc.querySelector('.lk').textContent)));
    assert.notEqual(doc.querySelector('.lk .cn'), root);
});

test('Топ: подгрузка и жанры не перерисовывают уже показанные карточки', async () => {
    const { w, doc } = openTop('bento', { pick: '1' });
    assert.ok(await until(() => doc.querySelectorAll('.lk [data-act="open-top"]').length === 50));
    const first = doc.querySelector('.lk [data-act="open-top"]');
    // Строка состояния меняется — раскладка обновляется, но карточки остаются на месте
    doc.querySelector('.top__note').textContent = 'Загрузка…';
    await tick(60);
    assert.equal(doc.querySelector('.lk [data-act="open-top"]'), first);
    assert.ok(w);
});

// Раскладка росла по мере поиска сайтов: в «Манге» постер вытягивался вместе с панелью «Смотреть на»
for (const style of STYLES) {
    test(`«Случайное», ${style}: место под сайты отведено сразу и не меняется, пока идёт поиск и после него`, async () => {
        const { w, doc } = openRandom(style, { siteUrls: { jutsu: 'https://jut-su.net/7/', animevost: 'https://animevost.org/7' }, siteDelay: 30 });
        const enabled = w.AgSites.searchable().length;
        assert.ok(await until(() => doc.querySelector('.lk [data-site]')));
        const slots = () => doc.querySelectorAll('.lk [data-site]').length;
        assert.equal(slots(), enabled, 'с самого начала место под каждый включённый сайт');
        assert.ok(doc.querySelector('.lk [data-site].is-pending'), 'пока ищем — заготовки');
        assert.ok(await until(() => !doc.querySelector('.lk [data-site].is-pending')), 'поиск закончился');
        assert.equal(slots(), enabled, 'после поиска мест столько же');
        assert.equal(doc.querySelectorAll('.lk a[data-site]').length, 3, 'кнопками стали найденные: Jut-Su, AnimeVost и AnimeGO (у него страница из данных Shikimori)');
        assert.equal(doc.querySelectorAll('.lk [data-site].is-missing').length, enabled - 3, 'ненайденные приглушены');
        assert.equal(doc.querySelector('.lk .lk-note'), null, 'строка «Ищем на сайтах» не добавляет высоты');
        if (style === 'bento') assert.match(doc.querySelector('.lk').textContent, /3 сайтов/, '«N сайтов» — только найденные');
    });
}
