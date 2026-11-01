// Поиск тайтла на AnimeGO: выдача всегда что-то содержит, поэтому похожее название не считается найденным
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read } = require('./helpers');

const card = (slug, title, orig, kind, year) => `
<div class="ani-grid__item g-col-6 position-relative">
    <a class="d-block ani-grid__item-picture" href="/anime/${slug}" data-turbo="true"><img alt="${title}"></a>
    <div class="ani-grid__item-body pt-2">
        <div class="fw-lighter small mb-1 text-line-clamp" style="--lines-to-show: 1;"> ${orig} </div>
        <div class="ani-grid__item-title h5 fw-normal mb-2 text-line-clamp" style="--lines-to-show: 2;">
            <a title="${title}" href="/anime/${slug}" data-turbo="true">${title}</a>
        </div>
        <div class="ani-grid__item-genres d-inline-flex gap-2">
            <span><span class="ani-grid__item-genres__link">${kind}</span></span>
            <span class="fw-lighter" aria-hidden="true">/</span>
            <span><span class="ani-grid__item-genres__link">${year}</span></span>
        </div>
    </div>
</div>`;

const PAGE = (...cards) => `<a href="/anime/top-250">ТОП-250</a><div class="grid ani-list py-3">${cards.join('')}</div>`;

const HEROINES = card('van-pis-geroini-3627', 'Ван-Пис: Героини', 'One Piece: Heroines', 'Спешл', 2026);
const ONE_PIECE = card('van-pis-s1-65', 'Ван-Пис', 'One Piece', 'Сериал', 1999);
const MOVIE = card('monolog-farmatsevta-sokrovishche-3909', 'Монолог фармацевта: Сокровище покойной наложницы', 'Kusuriya no Hitorigoto Movie: Bouhi no Hihou', 'Фильм', 2026);
const SEASON_2 = card('monolog-2-3000', 'Монолог фармацевта 2', 'Kusuriya no Hitorigoto 2nd Season', 'Сериал', 2025);
const OTHER_NAME = card('re-zhizn-3279', 'Re: Жизнь в альтернативном мире с нуля 4', 'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season', 'Сериал', 2026);

function load(html) {
    const ctx = {
        console: { error() {}, warn() {}, log() {} }, URL, encodeURIComponent,
        fetch: async () => ({ ok: true, text: async () => html }),
        chrome: { storage: { session: { get: async () => ({}), set: async () => {} } } }
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('modules/shared/title-match.js'), ctx);
    vm.runInContext(`${read('modules/bg-cache.js')};globalThis.find = findAnimeGoDirectUrl;`, ctx);
    return ctx.find;
}

test('тайтла нет на сайте: тайтл с похожим названием не подставляется', async () => {
    const find = load(PAGE(HEROINES, ONE_PIECE));
    assert.equal(await find('Ван-Пис: Письмо от поклонника', 'One Piece Fan Letter', '2024'), null);
});

test('сериал не подменяется фильмом с тем же началом названия', async () => {
    const find = load(PAGE(MOVIE));
    assert.equal(await find('Монолог фармацевта', 'Kusuriya no Hitorigoto', '2023'), null);
});

test('другой сезон не считается совпадением', async () => {
    const find = load(PAGE(SEASON_2));
    assert.equal(await find('Монолог фармацевта', 'Kusuriya no Hitorigoto', '2023'), null);
});

test('совпадение по русскому названию находит тайтл', async () => {
    const find = load(PAGE(HEROINES, ONE_PIECE));
    assert.equal(await find('Ван-Пис', 'One Piece TV', '1999'), 'https://animego.me/anime/van-pis-s1-65');
});

test('совпадение по оригинальному названию, если русские названия на сайтах разные', async () => {
    const find = load(PAGE(MOVIE, OTHER_NAME));
    assert.equal(
        await find('Re:Zero. Жизнь с нуля в альтернативном мире 4', 'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season', '2026'),
        'https://animego.me/anime/re-zhizn-3279'
    );
    assert.equal(
        await find('Монолог фармацевта: Сокровище', 'Kusuriya no Hitorigoto Movie: Bouhi no Hihou', '2026'),
        'https://animego.me/anime/monolog-farmatsevta-sokrovishche-3909'
    );
});

test('то же название с другим годом — другой тайтл', async () => {
    const find = load(PAGE(ONE_PIECE));
    assert.equal(await find('Ван-Пис', 'One Piece', '2023'), null);
});
