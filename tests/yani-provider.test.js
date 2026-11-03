// Провайдер YummyAnime (yani): API-ответы — снимки реального /api/anime и /api/search.
// Вёрстка плеера синтетическая (на сайте её строит React, классы обфусцированы — провайдер на них не опирается).
const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./helpers');
const { makeContentWindow } = require('./dom-helpers');

const API_ANIME = read('tests/fixtures/yani-api-anime.json');

// Разметка как на old.yummyani.me: список серий из числовых div и Kodik с episode= в адресе
const PAGE = `
    <h1>Монолог фармацевта 3</h1>
    <div id="video">
        <div class="Yqy0"><div class="Y56k a">1</div><div class="Y56k b">2</div><div class="Y56k b">3</div></div>
        <div class="wKBD"><div><iframe src="https://kodikplayer.com/season/123088/8bf6fe95eeb635b6652c41e3f3a27d19/720p?translations=false&only_episode=true&episode=1"></iframe></div></div>
    </div>`;

function makeYani(html = PAGE, url = 'https://old.yummyani.me/catalog/item/monolog-farmacevta-3') {
    const fetched = [];
    const { window: w } = makeContentWindow(html, url, {
        fetch: async (u) => {
            fetched.push(String(u));
            return { ok: true, json: async () => JSON.parse(API_ANIME) };
        }
    });
    const site = w.AgSites.byUrl(url);
    const provider = new w.AgProviders.registry[site.platform](site, {});
    return { provider, w, fetched, site };
}

test('yani: оба домена — одна платформа, ru-версия помечена как SPA', () => {
    const { w } = makeYani();
    assert.equal(w.AgSites.byHost('old.yummyani.me').platform, 'yani');
    assert.equal(w.AgSites.byHost('ru.yummyani.me').platform, 'yani');
    assert.equal(w.AgSites.byHost('ru.yummyani.me').spa, true);
});

test('yani: ID Shikimori, год и тип берутся из API сайта', async () => {
    const { provider, fetched } = makeYani();
    const info = await provider.getTitleInfo();
    assert.equal(info.shikimoriId, 61987);
    assert.equal(info.year, '2026');
    assert.equal(info.kind, 'tv');
    assert.equal(info.pageKey, 'yummy_old:monolog-farmacevta-3');
    assert.ok(info.titles.includes('Монолог фармацевта 3'));
    assert.match(fetched[0], /\/api\/anime\/monolog-farmacevta-3\?need_videos=true$/);
});

test('yani: номер серии из episode= в адресе Kodik, а не из сообщения плеера', () => {
    const { provider } = makeYani();
    // Kodik в режиме only_episode не знает номер и шлёт «1» — источник истины адрес iframe
    assert.equal(provider.getEpisode('7'), '1');
});

test('yani: переключение серии кликает следующую кнопку из числового списка', () => {
    const { provider, w } = makeYani();
    const iframe = w.document.querySelector('iframe');
    w.document.querySelectorAll('.Yqy0 > div').forEach(btn => btn.addEventListener('click', () => {
        iframe.src = iframe.src.replace(/episode=\d+/, `episode=${btn.textContent}`);
    }));
    assert.equal(provider.navigate('next'), true);
    assert.equal(provider.getEpisode(), '2');
    assert.equal(provider.navigate('prev'), true);
    assert.equal(provider.getEpisode(), '1');
    assert.equal(provider.navigate('prev'), false, 'серии 0 нет');
});

test('yani: таймкоды опенинга/эндинга с сайта для текущей озвучки', async () => {
    const { provider } = makeYani();
    const skip = await provider.getSkipData('2');
    // Опенинг песни надёжен, а 19 секунд в конце файла — это титры озвучки, а не эндинг
    const plain = JSON.parse(JSON.stringify(skip));
    assert.equal(plain.op.start, 0);
    assert.equal(plain.op.end, 89);
    assert.deepEqual(plain.ed, { start: 0, end: 0 });
});

test('yani: страница не тайтла', () => {
    const { provider } = makeYani('<h1>Каталог</h1>', 'https://ru.yummyani.me/catalog');
    assert.equal(provider.isTitlePage(), false);
});

test('yani: getNavAnchor находит div меню на ru.yummyani.me и li на old.yummyani.me', () => {
    const htmlSpa = `
        <nav class="bo">
            <div data-variant="top" class="fM dm">
                <a href="/catalog/top" class="fO"><span class="fP">ТОП 100</span></a>
            </div>
        </nav>`;
    const { provider: pSpa } = makeYani(htmlSpa, 'https://ru.yummyani.me/catalog');
    const anchorSpa = pSpa.getNavAnchor();
    assert.ok(anchorSpa);
    assert.equal(anchorSpa.tagName, 'DIV');
    assert.equal(anchorSpa.getAttribute('data-variant'), 'top');

    const htmlOld = '<ul><li><a href="/catalog/top">Топ 100</a></li></ul>';
    const { provider: pOld } = makeYani(htmlOld, 'https://old.yummyani.me/catalog');
    const anchorOld = pOld.getNavAnchor();
    assert.ok(anchorOld);
    assert.equal(anchorOld.tagName, 'LI');
});


// Меню сайта (react-select): пункты появляются, только пока оно открыто
function playerMenu(w, names, current) {
    const box = w.document.createElement('div');
    box.innerHTML = `<div class="sel-control"><div class="sel-singleValue">Плеер ${current}</div><div class="sel-indicatorContainer"></div></div>`;
    w.document.body.appendChild(box);
    const picked = [];
    box.querySelector('[class*="indicatorContainer"]').addEventListener('mousedown', () => {
        const open = box.querySelectorAll('[class*="-option"]');
        if (open.length) { open.forEach(o => o.remove()); return; }
        names.forEach(name => {
            const option = w.document.createElement('div');
            option.className = 'sel-option';
            option.textContent = `Плеер ${name} (28 эп.)`;
            option.addEventListener('click', () => { picked.push(name); box.querySelectorAll('[class*="-option"]').forEach(o => o.remove()); });
            box.appendChild(option);
        });
    });
    return picked;
}

const NO_KODIK_PAGE = '<h1>Тайтл</h1><iframe src="https://aksor.example/embed/1"></iframe>';

async function untilPicked(provider) {
    for (let i = 0; i < 40; i++) {
        if (provider.selectPreferredPlayer()) return true;
        await new Promise(r => setTimeout(r, 25));
    }
    return false;
}

test('yani: сайт открыл другой плеер — выбирается Kodik, причём один раз', async () => {
    const { provider, w } = makeYani(NO_KODIK_PAGE);
    const picked = playerMenu(w, ['Aksor', 'Alloha', 'Kodik', 'CVH'], 'Aksor');
    assert.equal(await untilPicked(provider), true);
    assert.deepEqual(picked, ['Kodik']);
    assert.equal(provider.selectPreferredPlayer(), true);
    assert.deepEqual(picked, ['Kodik']);
});

test('yani: Kodik уже открыт — меню не трогаем, Kodik нет у тайтла — не зацикливаемся', async () => {
    const open = makeYani();
    const untouched = playerMenu(open.w, ['Aksor', 'Kodik'], 'Kodik');
    assert.equal(await untilPicked(open.provider), true);
    assert.deepEqual(untouched, []);

    const none = makeYani(NO_KODIK_PAGE);
    const picked = playerMenu(none.w, ['Aksor', 'Alloha'], 'Aksor');
    assert.equal(await untilPicked(none.provider), true);
    assert.deepEqual(picked, []);
});

test('yani: меню ещё не появилось — ждём, а не считаем выбор сделанным', () => {
    const { provider } = makeYani(NO_KODIK_PAGE);
    assert.equal(provider.selectPreferredPlayer(), false);
});

test('yani: выбранный зрителем плеер важнее Kodik, а если его нет у тайтла — Kodik', async () => {
    const own = makeYani(NO_KODIK_PAGE);
    own.w.AgPlayerChoice.get = async () => 'Alloha';
    const picked = playerMenu(own.w, ['Aksor', 'Alloha', 'Kodik'], 'Aksor');
    assert.equal(await untilPicked(own.provider), true);
    assert.deepEqual(picked, ['Alloha']);

    const kodikOpen = makeYani();
    kodikOpen.w.AgPlayerChoice.get = async () => 'Aksor';
    const replaced = playerMenu(kodikOpen.w, ['Aksor', 'Kodik'], 'Kodik');
    assert.equal(await untilPicked(kodikOpen.provider), true);
    assert.deepEqual(replaced, ['Aksor'], 'открытый сайтом Kodik уступает выбору зрителя');

    const gone = makeYani(NO_KODIK_PAGE);
    gone.w.AgPlayerChoice.get = async () => 'CVH';
    const fallback = playerMenu(gone.w, ['Aksor', 'Kodik'], 'Aksor');
    assert.equal(await untilPicked(gone.provider), true);
    assert.deepEqual(fallback, ['Kodik']);
});

test('yani: выбор в панели плеера запоминается', async () => {
    const { provider, w } = makeYani(NO_KODIK_PAGE);
    const saved = [];
    w.AgPlayerChoice.set = (site, name) => { saved.push([site, name]); return Promise.resolve(); };
    const picked = playerMenu(w, ['Aksor', 'Kodik'], 'Kodik');
    await provider.shellPick('players', 0);
    assert.deepEqual(picked, ['Aksor']);
    assert.deepEqual(saved, [['yummy_old', 'Aksor']]);
});

test('yani: адрес плеера без номера серии — активная кнопка узнаётся по цвету, а метка просмотренных не мешает', () => {
    const { window: w } = makeContentWindow(`<h1>Тайтл</h1><iframe src="https://player.aksor.tv/video/abc"></iframe>
        <div id="eps"><div class="a seen" style="background-color: rgb(75, 75, 75)">1</div><div class="a seen" style="background-color: rgb(34, 34, 34)">2</div><div class="a" style="background-color: rgb(60, 206, 123)">3</div><div class="a">4</div></div>`, 'https://old.yummyani.me/catalog/item/x');
    const site = w.AgSites.byId('yummy_old');
    const provider = new w.AgProviders.registry[site.provider || site.platform](site, {});
    assert.strictEqual(provider.getEpisode(), '3');
    w.close();
});
