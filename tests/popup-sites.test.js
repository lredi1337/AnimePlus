// Окно расширения: сайты видны плитками сразу, нажатие на плитку открывает сайт, текущий сайт отдельной карточкой
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const tick = (ms = 40) => new Promise(r => setTimeout(r, ms));

async function openPopup({ url, store = {}, pageSite = null, grant = true }) {
    const body = read('popup/popup.html').match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*><\/script>/g, '');
    const dom = new JSDOM(`<!doctype html><body>${body}</body>`, { url: 'https://example.test/popup.html', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const opened = [];
    const sent = [];
    const reloaded = [];
    const requested = [];
    // Окно ждёт ответа о вкладке: под нагрузкой полного прогона он приходит позже первого тика
    let answered;
    const tabKnown = new Promise(r => { answered = r; });
    w.chrome = {
        runtime: {
            id: 'test', lastError: null, getURL: (p) => p, getManifest: () => JSON.parse(read('manifest.json')),
            onMessage: { addListener() {} },
            sendMessage(msg, cb) {
                sent.push(msg);
                const replies = { shiki_get_status: { isLoggedIn: false, clientId: 'c' }, site_mirror_add: { success: true } };
                if (cb) setTimeout(() => cb(replies[msg.action] || null), 0);
            }
        },
        tabs: {
            query: (q, cb) => setTimeout(() => { cb([{ id: 1, url }]); answered(); }, 0),
            sendMessage: (id, msg, cb) => setTimeout(() => cb(null), 0),
            reload: (id) => reloaded.push(id), create: (o) => opened.push(o.url)
        },
        // Страница вкладки: признаки сайта проверяет executeScript по activeTab
        scripting: { executeScript: async ({ args }) => [{ result: pageSite && args[0].some(([id]) => id === pageSite) ? pageSite : null }] },
        permissions: { request: (o, cb) => { requested.push(o.origins); setTimeout(() => cb(grant), 0); } },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in store).map(k => [k, store[k]])),
                set: async (o) => { Object.assign(store, o); },
                remove: async () => {}
            },
            onChanged: { addListener() {} }
        }
    };
    w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' });
    for (const f of ['credentials.js', 'config.js', 'modules/shared/sites.js', 'modules/shared/ui-kit.js', 'modules/shared/guide.js', 'modules/shared/guide-fox.js', 'popup/popup.js']) w.eval(read(f));
    // DOMContentLoaded jsdom шлёт сам: второй вызов запустил бы окно дважды
    await tabKnown;
    await tick();
    return { w, d: w.document, opened, store, sent, reloaded, requested };
}

const tiles = (d) => [...d.querySelectorAll('#sitesList .site-tile')];
const visible = (el) => !!el && !el.hidden && !el.closest('[hidden]');

test('список сайтов свёрнут, кнопка «Выбрать сайт» подсвечена, пока её не открывали', async () => {
    const { w, d } = await openPopup({ url: 'chrome://newtab/' });
    const toggle = d.getElementById('sitesToggle');
    assert.equal(d.getElementById('siteCurrentName').textContent, 'Выбрать сайт');
    assert.ok(toggle.classList.contains('is-hint'));
    assert.ok(!visible(d.getElementById('sitesPanel')));
    toggle.click();
    assert.ok(visible(d.getElementById('sitesPanel')));
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(!toggle.classList.contains('is-hint'));
    assert.equal(w.localStorage.getItem('ag_sites_seen'), '1');
    const names = tiles(d).map(t => t.querySelector('.site-tile-name').textContent);
    assert.deepEqual(names, [...w.AgSites.list.map(s => s.name)]);
    w.close();
});

test('нажатие на плитку открывает сайт, переключатель на плитке сайт не открывает', async () => {
    const { w, d, opened, store } = await openPopup({ url: 'chrome://newtab/' });
    const jut = tiles(d).find(t => t.dataset.site === 'jutsu');
    jut.querySelector('.site-tile-open').click();
    assert.deepEqual(opened, [w.AgSites.byId('jutsu').home]);
    const input = jut.querySelector('.site-switch input');
    input.checked = false;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick();
    assert.equal(opened.length, 1);
    assert.equal(JSON.stringify(store).includes('"jutsu":false'), true);
    assert.ok(d.querySelector('.site-tile[data-site="jutsu"]').classList.contains('is-off'));
    w.close();
});

test('на Jut-Su: кнопка с названием сайта, в списке он первый и отмечен', async () => {
    const { d } = await openPopup({ url: 'https://jut-su.net/3325-x.html' });
    assert.equal(d.getElementById('siteCurrentName').textContent, 'Jut-Su');
    assert.ok(!visible(d.getElementById('sitesPanel')));
    const first = tiles(d)[0];
    assert.equal(first.dataset.site, 'jutsu');
    assert.ok(first.classList.contains('is-current'));
    assert.equal(first.querySelector('.site-tile-host').textContent, 'открыт сейчас');
    d.defaultView.close();
});

test('выключение текущего сайта меняет его состояние', async () => {
    const { w, d } = await openPopup({ url: 'https://jut-su.net/3325-x.html' });
    assert.ok(d.getElementById('status-box').classList.contains('active'));
    const input = tiles(d)[0].querySelector('.site-switch input');
    input.checked = false;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await tick();
    assert.match(d.getElementById('status-text').textContent, /выключен/);
    assert.ok(!d.getElementById('status-box').classList.contains('active'));
    w.close();
});

test('AnimeVost на новом адресе: окно предлагает включить Anime+ и просит разрешение только на этот адрес', async () => {
    const { w, d, sent, reloaded, requested } = await openPopup({ url: 'https://www.animevost.xyz/tip/tv/4008-x.html', pageSite: 'animevost' });
    await tick();
    const card = d.getElementById('mirrorCard');
    assert.ok(visible(card));
    assert.match(d.getElementById('mirrorTitle').textContent, /AnimeVost на новом адресе animevost.xyz/);
    w.close = () => {};
    d.getElementById('mirrorAdd').click();
    await tick();
    assert.deepEqual(JSON.parse(JSON.stringify(requested)), [['https://animevost.xyz/*', 'https://*.animevost.xyz/*']]);
    assert.deepEqual({ ...sent.find(m => m.action === 'site_mirror_add') }, { action: 'site_mirror_add', host: 'animevost.xyz', siteId: 'animevost' });
    assert.deepEqual(reloaded, [1]);
});

test('обычный незнакомый сайт: предложения нет; без разрешения адрес не добавляется', async () => {
    const plain = await openPopup({ url: 'https://example.com/' });
    await tick();
    assert.ok(!visible(plain.d.getElementById('mirrorCard')));
    const refused = await openPopup({ url: 'https://animevost.xyz/', pageSite: 'animevost', grant: false });
    await tick();
    refused.d.getElementById('mirrorAdd').click();
    await tick();
    assert.ok(!refused.sent.some(m => m.action === 'site_mirror_add'));
    assert.deepEqual(refused.reloaded, []);
});

test('плитка переезжающего сайта ведёт на последний рабочий адрес', async () => {
    const { d, opened } = await openPopup({ url: 'chrome://newtab/', store: { ag_site_home: { animevost: 'https://v14.vost.pw' } } });
    tiles(d).find(t => t.dataset.site === 'animevost').querySelector('.site-tile-open').click();
    assert.deepEqual(opened, ['https://v14.vost.pw']);
});
