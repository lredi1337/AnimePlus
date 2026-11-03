// tests/kodik-navigation.test.js
// Тестирование логики переключения серий в Kodik плеере (content-player.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('Kodik navigation: определение shouldUseLocalNav для разных сайтов', () => {
    const isJutsu = (ref, href) => (ref || '').includes('jut-su.net') || href.includes('d=jut-su.net');
    const isDleNavSite = (refHost, embedDomain, embedRef) => {
        const checkHost = refHost || embedDomain || embedRef;
        return isJutsu(refHost, embedDomain) ||
            /yummyanime\.tv|animego\.online|yammyanime\.club|jut-su\.net/.test(checkHost);
    };
    const shouldUseLocalNav = (refHost, embedDomain, embedRef, hasControls) => {
        if (isDleNavSite(refHost, embedDomain, embedRef)) return true;
        const checkHost = refHost || embedDomain || embedRef;
        const isPageNavSite = /animego\.(me|org)|yummyani\.me/.test(checkHost);
        if (!isPageNavSite && hasControls) return true;
        return false;
    };

    // DLE сайты (Jut-Su, YummyAnime.TV, AnimeGO.online, YammyAnime.Club) должны использовать локальное переключение
    assert.equal(shouldUseLocalNav('yummyanime.tv', 'yummyanime.tv', '', true), true);
    assert.equal(shouldUseLocalNav('jut-su.net', '', '', true), true);
    assert.equal(shouldUseLocalNav('animego.online', 'animego.online', '', true), true);
    assert.equal(shouldUseLocalNav('yammyanime.club', 'yammyanime.club', '', true), true);

    // AnimeGO и Yani имеют собственные списки серий на странице тайтла — переключение через страницу
    assert.equal(shouldUseLocalNav('animego.me', '', '', true), false);
    assert.equal(shouldUseLocalNav('animego.org', '', '', true), false);
    assert.equal(shouldUseLocalNav('ru.yummyani.me', '', '', true), false);
    assert.equal(shouldUseLocalNav('old.yummyani.me', '', '', true), false);
});

test('Kodik navigation: переключение серии через кастомные элементы .dropdown-content .item', () => {
    const dom = new JSDOM(`
        <div class="serial-series-box">
            <div class="dropdown-content">
                <div class="item active selected">1 серия</div>
                <div class="item">2 серия</div>
                <div class="item">3 серия</div>
            </div>
        </div>
    `);
    const doc = dom.window.document;
    const items = Array.from(doc.querySelectorAll('.serial-series-box .dropdown-content .item'));
    const clicked = [];
    items.forEach((it, idx) => {
        it.addEventListener('click', () => clicked.push(idx));
    });

    // Функция переключения из content-player.js
    const switchEpisode = (dir) => {
        const currentIdx = items.findIndex(item => item.classList.contains('selected') || item.classList.contains('active'));
        let newIdx = currentIdx;
        if (dir === 'next' && currentIdx < items.length - 1) newIdx = currentIdx + 1;
        if (dir === 'prev' && currentIdx > 0) newIdx = currentIdx - 1;
        if (newIdx !== currentIdx && items[newIdx]) {
            items[currentIdx].classList.remove('active', 'selected');
            items[newIdx].classList.add('active', 'selected');
            items[newIdx].click();
            return true;
        }
        return false;
    };

    assert.equal(switchEpisode('next'), true);
    assert.deepEqual(clicked, [1], 'кликнут элемент 2-й серии');

    assert.equal(switchEpisode('next'), true);
    assert.deepEqual(clicked, [1, 2], 'кликнут элемент 3-й серии');

    assert.equal(switchEpisode('prev'), true);
    assert.deepEqual(clicked, [1, 2, 1], 'кликнут элемент 2-й серии назад');
});

test('Kodik navigation: переключение серии через нативный select[name="series"]', () => {
    const dom = new JSDOM(`
        <div class="serial-series-box">
            <select name="series">
                <option value="1" selected>1 серия</option>
                <option value="2">2 серия</option>
                <option value="3">3 серия</option>
            </select>
        </div>
    `);
    const doc = dom.window.document;
    const sel = doc.querySelector('select[name="series"]');
    const events = [];
    sel.addEventListener('change', (e) => events.push({ val: sel.value, bubbles: e.bubbles }));

    const switchEpisode = (dir) => {
        const curIdx = sel.selectedIndex;
        let newIdx = curIdx;
        if (dir === 'next' && curIdx < sel.options.length - 1) newIdx = curIdx + 1;
        if (dir === 'prev' && curIdx > 0) newIdx = curIdx - 1;
        if (newIdx !== curIdx) {
            sel.selectedIndex = newIdx;
            sel.options[newIdx].selected = true;
            sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
            return true;
        }
        return false;
    };

    assert.equal(switchEpisode('next'), true);
    assert.equal(sel.value, '2');
    assert.deepEqual(events, [{ val: '2', bubbles: true }]);

    assert.equal(switchEpisode('next'), true);
    assert.equal(sel.value, '3');
    assert.deepEqual(events, [{ val: '2', bubbles: true }, { val: '3', bubbles: true }]);

    assert.equal(switchEpisode('prev'), true);
    assert.equal(sel.value, '2');
});

test('Kodik navigation: переключение серии через fallback-кнопку «Дальше >»', () => {
    const dom = new JSDOM(`
        <div class="serial-series-box">
            <div class="text">1 серия</div>
        </div>
        <button class="serial-next">Дальше &gt;</button>
    `);
    const doc = dom.window.document;
    const nextBtn = doc.querySelector('.serial-next');
    let nextClicked = false;
    nextBtn.addEventListener('click', () => { nextClicked = true; });

    const switchEpisode = (dir) => {
        if (dir === 'next') {
            const btn = doc.querySelector('.serial-next');
            if (btn) { btn.click(); return true; }
        }
        return false;
    };

    assert.equal(switchEpisode('next'), true);
    assert.equal(nextClicked, true, 'кнопка Дальше нажата');
});

