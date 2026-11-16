// Фоновый маршрутизатор: настоящий background.js со всеми importScripts, снаружи только API браузера и сеть
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, read } = require('./helpers');

const CODE = 'abcdefghij0123456789ABCDEF';
const EXT_ID = 'test-extension';
const EXT_PAGE = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup/popup.html` };
const fromTab = (tabId = 5, windowId = 9, url = 'https://animego.me/anime/x') => ({ id: EXT_ID, url, tab: { id: tabId, windowId } });

function loadBackground({ routes = {}, store = {}, failStorage = false } = {}) {
    const local = { ...store };
    const session = {};
    const area = (data) => ({
        get: async (keys) => {
            if (failStorage) throw new Error('storage down');
            const list = keys == null ? Object.keys(data) : (Array.isArray(keys) ? keys : [keys]);
            return Object.fromEntries(list.filter(k => k in data).map(k => [k, data[k]]));
        },
        set: async (obj) => { Object.assign(data, obj); },
        remove: async (keys) => { (Array.isArray(keys) ? keys : [keys]).forEach(k => delete data[k]); }
    });
    const seen = { fetched: [], created: [], removed: [], windows: [], options: 0 };
    const listeners = {};
    const event = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
    const fetchMock = async (url, options = {}) => {
        seen.fetched.push({ url: String(url), options });
        for (const [pattern, reply] of Object.entries(routes)) {
            if (String(url).includes(pattern)) {
                const r = typeof reply === 'function' ? reply(String(url), options) : reply;
                return new Response(typeof r === 'string' ? r : JSON.stringify(r), { status: 200 });
            }
        }
        return new Response('{}', { status: 404 });
    };
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        URL, URLSearchParams, AbortController, AbortSignal, Response, setTimeout, clearTimeout, fetch: fetchMock,
        chrome: {
            storage: { local: area(local), session: area(session), onChanged: event('storage') },
            alarms: { create: async () => {}, get: async () => null, onAlarm: event('alarm') },
            tabs: {
                create: async ({ url }) => { seen.created.push(url); return { id: 77 }; },
                remove: async (id) => { seen.removed.push(id); },
                query: async () => [],
                onUpdated: event('tabUpdated')
            },
            windows: {
                get: async () => ({ state: 'normal' }),
                update: async (id, patch) => { seen.windows.push({ id, ...patch }); },
                getLastFocused: async () => ({ id: 1 })
            },
            runtime: {
                id: EXT_ID,
                getManifest: () => JSON.parse(read('manifest.json')),
                getURL: (p) => `chrome-extension://${EXT_ID}/${p}`,
                openOptionsPage: () => { seen.options++; },
                onMessage: event('message'),
                onInstalled: event('installed'),
                onStartup: event('startup')
            }
        }
    });
    context.globalThis = context;
    context.self = context;
    context.importScripts = (...files) => {
        for (const file of files) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
    };
    vm.runInContext(read('background.js'), context, { filename: 'background.js' });

    const send = (message, sender = fromTab()) => new Promise((resolve) => {
        let kept = null;
        kept = listeners.message(message, sender, (response) => setTimeout(() => resolve({ kept, response }), 0));
        if (kept !== true) setTimeout(() => resolve({ kept, response: undefined }), 5);
    });
    return { context, send, seen, local, session, listeners };
}

const plain = (value) => JSON.parse(JSON.stringify(value));

test('чужой отправитель и неизвестное действие не держат канал открытым', async () => {
    const { send } = loadBackground();
    assert.equal((await send({ action: 'shiki_logout' }, { id: 'other' })).kept, false);
    assert.equal((await send({ action: 'no_such_action' })).kept, false);
    assert.equal((await send({ action: 'constructor' })).kept, false);
    assert.equal((await send({})).kept, false);
});

test('каждое действие, которое шлёт расширение, кто-то обрабатывает', async () => {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = path.posix.join(dir, entry.name);
            if (entry.isDirectory()) walk(rel);
            else if (entry.name.endsWith('.js')) files.push(rel);
        }
    };
    ['modules', 'providers', 'features', 'popup', 'options'].forEach(walk);
    fs.readdirSync(ROOT).filter(f => /^content-.*\.js$/.test(f)).forEach(f => files.push(f));

    const actions = new Set();
    for (const file of files) {
        for (const m of read(file).matchAll(/sendMessage\(\s*\{\s*action:\s*['"]([a-z_]+)['"]/g)) actions.add(m[1]);
        for (const m of read(file).matchAll(/agSendMessage\(\s*\{\s*action:\s*['"]([a-z_]+)['"]/g)) actions.add(m[1]);
    }
    assert.ok(actions.size > 15);
    const handled = read('background.js');
    for (const action of actions) assert.ok(handled.includes(action), `нет обработчика ${action}`);
});

test('fetch_shikimori не становится открытым прокси', async () => {
    const { send, seen } = loadBackground({ routes: { 'shikimori.io/api': { ok: 1 } } });
    const blocked = (await send({ action: 'fetch_shikimori', url: 'https://evil.example/x' })).response;
    assert.equal(blocked.status, 403);
    assert.equal(seen.fetched.length, 0);
    const allowed = (await send({ action: 'fetch_shikimori', url: 'https://shikimori.one/api/x' })).response;
    assert.equal(allowed.status, 200);
    assert.equal(seen.fetched[0].url, 'https://shikimori.io/api/x');
    assert.equal((await send({ action: 'fetch_shikimori' })).response.status, 400);
});

test('неделя расписания: серии со сведениями о тайтлах, вышедшая серия остаётся после переключения календаря', async () => {
    const now = Date.now();
    const d = new Date(now);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    // Середина сегодняшнего дня: серия точно на этой неделе, в какой бы день ни шёл тест
    const today = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
    const entry = (id, ep, at, extra = {}) => ({ next_episode: ep, next_episode_at: new Date(at).toISOString(), anime: { id, name: `Name ${id}`, russian: `Рус ${id}`, kind: 'tv', score: '7.5', episodes: 12, aired_on: '2026-10-01', image: { preview: `/p/${id}.jpg` }, ...extra } });
    let calendar = [entry(1, 6, today), entry(2, 3, today + 30 * 864e5)];
    const gql = { data: { animes: [
        { id: '1', japanese: '薬屋のひとりごと', rating: 'pg_13', score: 8.6, episodes: 12, episodesAired: 5, duration: 23, airedOn: { date: '2026-10-03' }, poster: { mainUrl: 'https://shikimori.io/m/1.webp' }, genres: [{ russian: 'Драма' }] },
        { id: '2', japanese: '武动乾坤 第七季', rating: 'pg_13', score: 0, episodes: 24, episodesAired: 0, duration: 0, airedOn: { date: '2026-11-29' }, poster: null, genres: [] }
    ] } };
    const { send, seen, local } = loadBackground({ routes: { '/api/calendar': () => calendar, '/api/graphql': gql } });
    const first = plain((await send({ action: 'get_week_schedule' })).response);
    assert.equal(first.loaded, true);
    assert.equal(first.weekStart, monday);
    assert.equal(first.watching, null, 'без входа в Shikimori списка нет');
    assert.deepEqual(first.entries.map(e => [e.id, e.ep]), [[1, 6]], 'серия через месяц в эту неделю не попадает');
    const one = first.entries[0];
    assert.equal(one.poster, 'https://shikimori.io/m/1.webp');
    assert.deepEqual(one.genres, ['Драма']);
    assert.equal(one.duration, 23);
    assert.equal(one.kind, 'TV');
    assert.equal(one.cn, false);
    assert.equal(local.ag_schedule_details[2].cn, true, 'китайское узнаётся по оригинальному названию');

    // Серия вышла: календарь отдаёт уже следующую, через неделю
    calendar = [entry(1, 7, today + 7 * 864e5)];
    const graphqlCalls = seen.fetched.filter(f => f.url.includes('/api/graphql')).length;
    const { getWeekSchedule } = loadBackground({ routes: { '/api/calendar': () => calendar, '/api/graphql': gql }, store: local }).context;
    const second = plain(await getWeekSchedule());
    assert.deepEqual(second.entries.map(e => [e.id, e.ep]), [[1, 6]], '6-я серия осталась в своём дне');
    assert.equal(graphqlCalls, 1, 'сведения о тайтлах запрашиваются одним запросом на всю неделю');
});

test('неделя расписания: сеть не ответила — серии из памяти, без памяти честное «не загружено»', async () => {
    const empty = plain((await loadBackground().send({ action: 'get_week_schedule' })).response);
    assert.deepEqual(empty.entries, []);
    assert.equal(empty.loaded, false);
    const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 12).getTime();
    const store = {
        ag_schedule_seen: { 7: [{ ep: 4, at: today }] },
        ag_schedule_details: { 7: { id: 7, russian: 'Из памяти', name: 'Kept', kind: 'TV', score: 7, genres: [], ts: 1 } }
    };
    const kept = plain((await loadBackground({ store }).send({ action: 'get_week_schedule' })).response);
    assert.equal(kept.loaded, false);
    assert.deepEqual(kept.entries.map(e => [e.id, e.ep, e.russian]), [[7, 4, 'Из памяти']]);
});

test('случайное аниме: нет подходящих — честный ответ, есть — ссылка', async () => {
    const empty = loadBackground({ routes: { '/api/animes': [] } });
    const none = (await empty.send({ action: 'get_random_shikimori_anime' })).response;
    assert.equal(none.url, null);
    assert.equal(none.reason, 'no_match');

    const item = { id: 11, name: 'Foo Bar', russian: 'Фу', kind: 'tv', score: '8', aired_on: '2020-01-01' };
    const full = loadBackground({ routes: { '/api/animes': [item] } });
    const got = (await full.send({ action: 'get_random_shikimori_anime' })).response;
    assert.equal(got.id, 11);
    assert.equal(got.url, 'https://animego.me/anime/shiki-11');
    assert.equal(got.foundOnAnimeGO, false);
});

test('обложка берётся из кэша, иначе из GraphQL, и запоминается', async () => {
    const cached = loadBackground({ store: { ag_schedule_covers_cache: { 'рус': 'https://x/p.jpg' } } });
    assert.deepEqual(plain((await cached.send({ action: 'resolve_jutsu_cover', russian: 'Рус' })).response), { poster: 'https://x/p.jpg', url: 'https://x/p.jpg' });
    assert.equal(cached.seen.fetched.length, 0);

    const fresh = loadBackground({ routes: { '/api/graphql': { data: { animes: [{ id: '5', poster: { mainUrl: '/m/5.jpg' } }] } } } });
    const res = (await fresh.send({ action: 'resolve_jutsu_cover', id: 5, russian: 'Новый' })).response;
    assert.equal(res.poster, 'https://shikimori.io/m/5.jpg');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(fresh.local.ag_schedule_covers_cache['новый'], 'https://shikimori.io/m/5.jpg');

    const nothing = loadBackground();
    assert.deepEqual(plain((await nothing.send({ action: 'resolve_jutsu_cover' })).response), { poster: null, url: null });
});

test('связанные тайтлы и ответ при сбое', async () => {
    const rel = [{ relation_russian: 'Сиквел', anime: { id: 2, name: 'B', russian: 'Б', kind: 'tv', aired_on: '2021-02-03', image: { original: '/o/2.jpg' } } }, { relation: 'x' }];
    const { send } = loadBackground({ routes: { '/related': rel } });
    const out = plain((await send({ action: 'get_shikimori_anime_related', id: 1 })).response);
    assert.equal(out.related.length, 1);
    assert.equal(out.related[0].relation, 'Сиквел');
    assert.equal(out.related[0].kind, 'TV');
    assert.equal(out.related[0].year, '2021');

    // Номер и год вставляются в разметку страницы: разметка в них не проходит
    const bad = [{ anime: { id: '3"><img src=x onerror=alert(1)>', name: 'C', aired_on: '<b>2020' } }, { anime: { id: '4', name: 'D', aired_on: '2019<i>' } }];
    const dirty = loadBackground({ routes: { '/related': bad } });
    const cleaned = plain((await dirty.send({ action: 'get_shikimori_anime_related', id: 1 })).response).related;
    assert.deepEqual(cleaned.map(r => [r.id, r.year]), [[3, ''], [4, '2019']]);

    const failed = loadBackground();
    assert.deepEqual(plain((await failed.send({ action: 'get_shikimori_anime_related', id: 1 })).response), { related: [] });
});

test('фуллскрин: окно вкладки-отправителя и возврат прежнего состояния', async () => {
    const { send, seen, local } = loadBackground();
    assert.equal((await send({ action: 'fullscreen_on' }, fromTab(5, 9))).response.success, true);
    assert.deepEqual(plain(seen.windows[0]), { id: 9, state: 'fullscreen' });
    assert.equal(local.ag_window_state_9, 'normal');
    await send({ action: 'fullscreen_off' }, fromTab(5, 9));
    assert.deepEqual(plain(seen.windows[1]), { id: 9, state: 'normal' });
});

test('простые действия: настройки и закрытие вкладки', async () => {
    const { send, seen } = loadBackground();
    await send({ action: 'open_settings' });
    assert.equal(seen.options, 1);
    await send({ action: 'close_current_tab' }, fromTab(42));
    assert.deepEqual([...seen.removed], [42]);
});

test('сбой хранилища не оставляет отправителя без ответа', async () => {
    const { send } = loadBackground({ failStorage: true });
    const reply = async (action) => {
        const race = await Promise.race([send({ action }), new Promise(r => setTimeout(() => r('hang'), 200))]);
        assert.notEqual(race, 'hang', `${action} завис`);
        return race.response;
    };
    assert.equal((await reply('shiki_get_status')).isLoggedIn, false);
    assert.equal((await reply('reset_today_count')).success, true);
});

test('«Войти» принимается только со страницы расширения', async () => {
    const { send, seen, session } = loadBackground();
    const denied = (await send({ action: 'shiki_auth_begin' }, fromTab())).response;
    assert.equal(denied.success, false);
    assert.equal(seen.created.length, 0);

    assert.equal((await send({ action: 'shiki_auth_begin', clientId: 'cid' }, EXT_PAGE)).response.success, true);
    assert.match(seen.created[0], /^https:\/\/shikimori\.io\/oauth\/authorize\?client_id=cid&/);
    assert.equal(session.shiki_auth_pending.tabId, 77);
});

const tokenRoutes = { 'workers.dev': { access_token: 'a1', refresh_token: 'r1', expires_in: 100 }, 'whoami': { id: 1 } };

test('код из чужой вкладки не меняет аккаунт, а за вкладками фон не следит', async () => {
    const { listeners, seen, context, send } = loadBackground({ routes: tokenRoutes, store: { shiki_access_token: 'mine' } });
    assert.equal(listeners.tabUpdated, undefined);
    const res = (await send({ action: 'shiki_auto_auth', code: CODE }, fromTab(5))).response;
    await new Promise(r => setTimeout(r, 20));
    assert.equal(res.reason, 'not_expected');
    assert.equal(seen.fetched.some(f => f.url.includes('workers.dev')), false);
    assert.equal((await context.readShikiSecrets()).shiki_access_token, 'mine');
});

test('своя вкладка: код со страницы входа привязывает аккаунт, повторная проверка страницы его не теряет и при опоздании', async () => {
    const { send, local, context } = loadBackground({ routes: tokenRoutes });
    await send({ action: 'shiki_auth_begin' }, EXT_PAGE);
    const url = `https://shikimori.io/oauth/authorize/${CODE}`;
    assert.equal((await send({ action: 'shiki_auth_expected' }, fromTab(77, 9, url))).response.expected, true);
    assert.equal((await send({ action: 'shiki_auth_expected' }, fromTab(78, 9, url))).response.expected, false);

    assert.equal((await send({ action: 'shiki_auto_auth', code: CODE }, fromTab(77, 9, url))).response.success, true);
    assert.equal((await context.readShikiSecrets()).shiki_access_token, 'a1');
    assert.equal('shiki_access_token' in local, false);
    // Разрешение уже потрачено, но это тот же код: страница не должна показать родной вид или ошибку
    assert.equal((await send({ action: 'shiki_auth_expected' }, fromTab(77, 9, url))).response.expected, true);
    assert.equal((await send({ action: 'shiki_auto_auth', code: CODE }, fromTab(77, 9, url))).response.success, true);
});

test('код, вставленный в окне расширения вручную, работает без открытой вкладки', async () => {
    const { send, context } = loadBackground({ routes: tokenRoutes });
    assert.equal((await send({ action: 'shiki_oauth_exchange', code: CODE }, EXT_PAGE)).response.success, true);
    assert.equal((await context.readShikiSecrets()).shiki_access_token, 'a1');
});

test('шаблон страницы AnimeGO отбирает настоящую страницу тайтла', async () => {
    const detail = '<header></header><div class="entity__poster"></div><h1 class="entity__title"></h1>';
    const { send } = loadBackground({ routes: {
        'animego.me/anime/foo-123': detail,
        'animego.me/anime': '<a href="/anime/top-250"></a><a href="/anime/foo-123"></a>'
    } });
    assert.equal((await send({ action: 'get_native_page_template', origin: 'https://animego.me' })).response.html, detail);
});
