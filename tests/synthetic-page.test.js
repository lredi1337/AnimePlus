// Синтетическая страница AnimeGO (modules/animego/ag-synthetic.js): тайтла нет в каталоге сайта, и страница
// собирается из шаблона настоящей страницы тайтла и данных Shikimori. Тест фиксирует, что видит зритель
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

// Шаблон: настоящая страница чужого тайтла. Всё, что относится к нему, должно исчезнуть или замениться
const TEMPLATE = `<!doctype html><html><head></head><body><div class="wrapper"><div class="content-page"><div class="container-xxl">
  <main class="content_first content card"><div class="card-body"><div class="entity">
    <div class="entity__poster"><img src="/old.jpg" data-src="/old.jpg" srcset="/old.jpg 1x"></div>
    <div class="entity__sticky"><a class="btn-primary" href="#player">Смотреть</a></div>
    <div class="entity__title"><h1>Чужой тайтл</h1><div class="entity__title-synonyms">Old Name</div></div>
    <div class="entity__rating" data-controller="rating"><span class="entity-rating__value">9,9</span><span class="entity-rating__count">100 голосов</span><div class="entity-rating__user">Оценить</div></div>
    <div class="entity-field grid"><div>Тип</div><div>Старый тип</div></div>
    <div class="description">Чужое описание</div>
    <div class="mb-4"><h2>График выхода серий</h2><div class="schedule">1 серия — завтра</div></div>
    <div class="screenshots"><img src="/old-shot.jpg"></div>
    <div id="video-player">старый плеер</div>
    <div class="mb-4"><h2>Связанное</h2><a href="/anime/old">Старое связанное</a></div>
    <div class="comments">Комментарии к чужому тайтлу</div>
  </div></div></main></div></div></div></body></html>`;

const SHIKI = {
    id: 5114, name: 'Fullmetal Alchemist: Brotherhood', russian: 'Стальной алхимик: Братство', japanese: ['鋼の錬金術師'],
    kind: 'tv', score: '9.1', status: 'released', episodes: 64, aired_on: '2009-04-05',
    description_html: 'Братья <b>Элрики</b><script>alert(1)</script><img src=x onerror=alert(2)>',
    image: { original: '/system/animes/original/5114.jpg' },
    genres: [{ russian: 'Приключения' }, { russian: 'Драма' }], studios: [{ name: 'Bones' }]
};
const SHOTS = Array.from({ length: 6 }, (_, i) => ({ original: `/shots/${i}.jpg`, preview: `/shots/x/${i}.jpg` }));
const RELATED = [{ id: 121, russian: 'Стальной алхимик', relation: 'Альтернативная история', kind: 'TV', year: '2003', poster: 'https://shikimori.io/p/121.jpg' }];

async function render({ template = TEMPLATE, shiki = SHIKI } = {}) {
    const { window: w, sent } = makeContentWindow(
        '<!doctype html><html><head></head><body><div class="content-page"><main class="content"><div class="card-body">404</div></main></div></body></html>',
        'https://animego.me/anime/shiki-5114',
        {
            onMessage: (msg) => {
                if (msg.action === 'fetch_shikimori') return { status: 200, data: /screenshots/.test(msg.url) ? SHOTS : shiki };
                if (msg.action === 'get_native_page_template') return { html: template };
                if (msg.action === 'resolve_shiki_posters') return { posters: {} };
                if (msg.action === 'resolve_all_sites') return { results: [] };
                if (msg.action === 'get_shikimori_anime_related') return { related: RELATED };
                return null;
            }
        }
    );
    w.getSettings = async () => ({ sites_enabled: {} });
    // jsdom не умеет прокручивать: полоса кадров в просмотрщике прокручивается к текущему
    w.Element.prototype.scrollIntoView = () => {};
    w.eval(read('modules/animego/ag-synthetic.js'));
    await w.renderSyntheticAnimePage();
    await new Promise(r => setTimeout(r, 200));
    return { w, d: w.document, sent };
}

test('страница собрана из шаблона: название, рейтинг Shikimori и сведения о тайтле', async () => {
    const { d } = await render();
    const page = d.getElementById('ag-synthetic-page-container');
    assert.ok(page);
    assert.equal(d.title, 'Стальной алхимик: Братство / Fullmetal Alchemist: Brotherhood — смотреть онлайн на AnimeGO');
    assert.equal(page.querySelector('h1').textContent, 'Стальной алхимик: Братство');
    assert.match(page.querySelector('.entity__title-synonyms').textContent, /Fullmetal Alchemist: Brotherhood \/ 鋼の錬金術師/);
    // Оценка чужого тайтла из шаблона убирается, вместо неё кнопка с оценкой Shikimori
    assert.deepEqual([...page.querySelector('.entity__rating').children].map(el => el.id), ['ag-shiki-btn']);
    assert.equal(page.querySelector('#ag-shiki-btn').getAttribute('href'), 'https://shikimori.io/animes/5114');
    assert.equal(page.querySelector('#ag-shiki-btn').textContent, 'Shikimori ★ 9.1');
    const info = page.querySelector('.entity-field').textContent.replace(/\s+/g, ' ');
    for (const part of ['ТВ Сериал', '64', 'Приключения', 'Драма', 'Вышел', '2009', 'Bones', 'Fullmetal Alchemist: Brotherhood']) assert.ok(info.includes(part), part);
});

test('от чужого тайтла ничего не остаётся, описание очищено от скриптов', async () => {
    const { d } = await render();
    const page = d.getElementById('ag-synthetic-page-container');
    const text = page.textContent;
    for (const old of ['Чужой тайтл', 'Чужое описание', 'Старое связанное', 'Комментарии к чужому тайтлу', '1 серия — завтра', 'старый плеер']) assert.ok(!text.includes(old), old);
    const desc = page.querySelector('.description');
    assert.equal(desc.querySelector('b').textContent, 'Элрики');
    assert.equal(desc.querySelector('script, img'), null);
});

test('постер Shikimori открывается крупно', async () => {
    const { d } = await render();
    const poster = d.querySelector('.entity__poster img');
    assert.equal(poster.getAttribute('src'), 'https://shikimori.io/system/animes/original/5114.jpg');
    assert.equal(poster.getAttribute('srcset'), null);
    poster.click();
    const box = d.getElementById('ag-poster-lightbox');
    assert.equal(box.style.display, 'flex');
    assert.equal(box.querySelector('img').getAttribute('src'), poster.getAttribute('src'));
    box.querySelector('.ag-poster-close').click();
    assert.equal(box.style.opacity, '0');
});

test('кадры: в сетке четыре уменьшенных, просмотрщик листает все и закрывается', async () => {
    const { w, d } = await render();
    const thumbs = d.querySelectorAll('.ag-screenshot-thumb');
    assert.equal(thumbs.length, 4);
    assert.equal(thumbs[0].querySelector('img').getAttribute('src'), 'https://shikimori.io/shots/x/0.jpg');
    thumbs[2].click();
    const box = d.getElementById('ag-screenshot-lightbox');
    assert.equal(box.style.display, 'flex');
    assert.equal(d.getElementById('ag-lb-total').textContent, '6');
    assert.equal(d.getElementById('ag-lb-curr').textContent, '3');
    box.querySelector('.ag-lb-next').click();
    assert.equal(d.getElementById('ag-lb-curr').textContent, '4');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    assert.equal(d.getElementById('ag-lb-curr').textContent, '2');
    box.querySelectorAll('.ag-lb-dot')[5].click();
    assert.equal(d.getElementById('ag-lb-curr').textContent, '6');
    box.querySelector('.ag-lb-next').click();
    assert.equal(d.getElementById('ag-lb-curr').textContent, '1', 'после последнего кадра — первый');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(box.style.opacity, '0');
});

test('выбор сайта для просмотра сразу под сведениями, связанные тайтлы — с Shikimori', async () => {
    const { d, sent } = await render();
    const page = d.getElementById('ag-synthetic-page-container');
    const player = page.querySelector('#video-player');
    assert.equal(player.previousElementSibling, page.querySelector('.entity-field'));
    assert.match(player.querySelector('h2').textContent, /Смотреть аниме «Стальной алхимик: Братство» онлайн/);
    assert.ok(player.querySelector('#ag-watch-choice .ag-wc__list'));
    assert.ok(sent.some(m => m.action === 'resolve_all_sites' && m.shikimoriId === 5114));
    const related = page.querySelector('.ag-related-block a');
    assert.equal(related.getAttribute('href'), '/anime/shiki-121');
    assert.match(related.textContent, /Стальной алхимик/);
    assert.match(related.textContent, /TV \/ 2003/);
});

// Обработчики в разметке (onmouseover="…") выполняются в мире страницы и ломаются, если сайт включит строгий CSP
test('в разметке страницы нет встроенных обработчиков событий', async () => {
    const { d } = await render();
    d.querySelector('.entity__poster img').click();
    d.querySelectorAll('.ag-screenshot-thumb')[0].click();
    const inline = [...d.querySelectorAll('*')].flatMap(el => [...el.attributes].filter(a => /^on/i.test(a.name)).map(a => `${el.className || el.tagName}: ${a.name}`));
    assert.deepEqual(inline, []);
    const poster = d.querySelector('.entity__poster img');
    assert.equal(poster.onmouseover, null);
});

test('шаблон недоступен: запасная страница с теми же данными и выбором сайта', async () => {
    const { d } = await render({ template: '<html><body>нет</body></html>' });
    const page = d.getElementById('ag-synthetic-page-container');
    assert.equal(page.querySelector('h1').textContent, 'Стальной алхимик: Братство');
    assert.ok(d.querySelector('#ag-watch-choice'));
});

test('Shikimori не ответил: честное сообщение вместо пустой страницы', async () => {
    const { d } = await render({ shiki: null });
    assert.match(d.body.textContent, /Не удалось загрузить данные об аниме/);
});
