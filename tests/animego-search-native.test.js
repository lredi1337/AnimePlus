// AnimeGO: тайтлы Shikimori в выдаче поиска сайта (modules/animego/ag-jutsu-search.js).
// Разметка карточки снята с живой выдачи animego.me: наша карточка должна выглядеть так же и вести на синтетическую страницу
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const NATIVE = `<div id="site-search-results"><div class="mw-0"><h4>Аниме <span class="badge text-bg-secondary small">1</span></h4></div><div class="navbar_search-list list-group">
    <a href="/anime/razmerennaya-zhizn-1801" data-turbo="true" class="ajax-search__item d-flex list-group-item list-group-item-action" aria-selected="false" role="button">
        <div class="me-3 position-relative"><div class="rating-badge neutral"> 5.9 </div>
            <span class="d-block ajax-search__item-picture image__picture aspect-ratio-5-7"><img class="img-fluid rounded" src="https://img.example/x" alt="Размеренная жизнь"></span></div>
        <div class="ajax-search__item-body mw-0"><div class="ajax-search__item-title h5 fw-normal mb-1 text-line-clamp">Размеренная жизнь чит-фармацевта</div>
            <div class="fw-lighter small mb-2 text-line-clamp" style="--lines-to-show: 1;"> Cheat Kusushi no Slow Life </div></div>
    </a>
</div></div>`;

function mount() {
    const dom = new JSDOM(NATIVE, { url: 'https://animego.me/', runScripts: 'outside-only' });
    const w = dom.window;
    const bound = [];
    w.agBindPostersIn = (root) => bound.push(root);
    w.chrome = { runtime: { sendMessage() {} } };
    w.eval(read('modules/animego/ag-jutsu-search.js'));
    const api = w.agInitJutsuSearchEnhancer();
    return { w, doc: w.document, api, bound };
}

const MONOLOG = { id: 61987, russian: 'Монолог фармацевта 3', name: 'Kusuriya no Hitorigoto 3rd Season', year: '2026', kind: 'tv', score: '8.6', poster: '', genres: ['Драма', 'Тайна', 'Медицина'] };

test('поиск AnimeGO: карточка в разметке сайта и ведёт на синтетическую страницу, а не на Jut-Su', () => {
    const { doc, api, bound } = mount();
    api.renderNativeJutsuItems([MONOLOG], 'монолог фармацевта 3');
    const ours = doc.querySelector('.ag-shiki-item');
    assert.ok(ours);
    assert.equal(ours.getAttribute('href'), '/anime/shiki-61987');
    assert.equal(ours.getAttribute('target'), null, 'открывается в этой вкладке, как карточки сайта');
    assert.equal(ours.dataset.turbo, 'false', 'обычная загрузка: синтетическую страницу строит расширение');
    assert.doesNotMatch(ours.outerHTML, /jut-?su/i, 'никаких пометок Jut-Su');

    // Те же элементы, что у карточки сайта
    for (const sel of ['.ajax-search__item-picture.image__picture.aspect-ratio-5-7 img.img-fluid.rounded', '.ajax-search__item-body .ajax-search__item-title.h5', '.fw-lighter.small', '.ajax-search__item-genres']) {
        assert.ok(ours.querySelector(sel), sel);
    }
    assert.equal(ours.querySelector('.rating-badge').className, 'rating-badge positive');
    assert.equal(ours.querySelector('.rating-badge').textContent, '8.6');
    assert.equal(ours.querySelector('.ajax-search__item-title').textContent, 'Монолог фармацевта 3');
    assert.deepEqual([...ours.querySelectorAll('.ajax-search__item-genres .ajax-search__item-genres__link')].map(x => x.textContent), ['Сериал', '2026']);
    assert.match(ours.querySelector('.d-sm-block').textContent, /Драма, Тайна, Медицина/);
    assert.equal(ours.querySelector('img').dataset.agPosterId, '61987', 'постер без картинки подставит общий механизм');
    assert.ok(bound.includes(ours));
    assert.equal(doc.querySelector('h4 .badge').textContent, '2', 'счётчик над выдачей учитывает нашу карточку');
    api.renderNativeJutsuItems([MONOLOG], 'монолог фармацевта');
    assert.equal(doc.querySelector('h4 .badge').textContent, '2', 'при новом запросе не накапливается');
});

test('поиск AnimeGO: точное совпадение стоит выше карточки сайта, тайтл, который на сайте есть, не дублируется', () => {
    const { doc, api } = mount();
    const dup = { ...MONOLOG, id: 1, russian: 'Размеренная жизнь чит-фармацевта', name: 'Cheat Kusushi no Slow Life' };
    api.renderNativeJutsuItems([MONOLOG, dup], 'монолог фармацевта 3');
    const items = [...doc.querySelectorAll('.ajax-search__item')];
    assert.equal(items.length, 2);
    assert.ok(items[0].classList.contains('ag-shiki-item'));
});

test('поиск AnimeGO: оценка по шкале сайта, без оценки значка нет, без id карточки нет', () => {
    const { doc, api } = mount();
    api.renderNativeJutsuItems([{ ...MONOLOG, score: '5.9' }], 'монолог');
    assert.equal(doc.querySelector('.ag-shiki-item .rating-badge').className, 'rating-badge neutral');
    api.renderNativeJutsuItems([{ ...MONOLOG, score: '0.0' }], 'монолог 2');
    assert.equal(doc.querySelector('.ag-shiki-item .rating-badge'), null);
    api.renderNativeJutsuItems([{ ...MONOLOG, id: null }], 'монолог 3');
    assert.equal(doc.querySelector('.ag-shiki-item'), null);
});
