// Живые проверки расширения в настоящем Chrome. Запуск и условия: tools/stand/README.md
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, wait, prepareExtension, launch, reporter } = require('./lib');

const CVH_TITLES = {
    jutsu: 'https://jut-su.net/9173-kiberpank-beguschie-po-kraju-2-sezon.html',
    club: 'https://yammyanime.club/catalog/item/kiberpank-beguschie-po-krayu-2',
    online: 'https://animego.online/9230-kiberpank-beguschie-po-krayu-2.html',
    tv: 'https://yummyanime.tv/1231-kiberpank-beguschie-po-kraju-p1.html'
};
const KODIK_TAB_TITLES = {
    jutsu: 'https://jut-su.net/3552-monolog-farmacevta-h2.html',
    club: 'https://yammyanime.club/catalog/item/monolog-farmacevta-3-sezon-e1',
    online: 'https://animego.online/6003-monolog-farmacevta-3-sezon-r1.html',
    tv: 'https://yummyanime.tv/8522-monolog-farmacevta-3-sezon-u1.html'
};
const SHELL = "document.getElementById('ag-shell').shadowRoot";
const CVH = "document.querySelector('.shadow-root-container').shadowRoot";
const GUIDE_DONE = "chrome.storage.local.set({ ag_guide: { tourDone: true, tipsDone: true, switchTipDone: true, dockTipDone: true, questHidden: true } })";

function parseArgs(argv) {
    const [scenario, ...rest] = argv;
    const opts = { scenario, sites: Object.keys(CVH_TITLES) };
    for (let i = 0; i < rest.length; i += 2) {
        const value = rest[i + 1];
        if (rest[i] === '--proxy') opts.proxy = value;
        else if (rest[i] === '--adblock') opts.adblock = value;
        else if (rest[i] === '--sites') opts.sites = value.split(',');
        else if (rest[i] === '--url') opts.url = value;
        else if (rest[i] === '--count') opts.count = Number(value);
        else if (rest[i] === '--out') opts.out = value;
        else if (rest[i] === '--no-extension') { opts.noExtension = true; i -= 1; }
        else throw new Error(`неизвестный параметр ${rest[i]}`);
    }
    return opts;
}

/** Расширение с настройками обычного зрителя, по желанию рядом с блокировщиком */
async function startBrowser(opts) {
    const b = launch({ proxy: opts.proxy });
    const extId = await b.loadExtension(prepareExtension());
    if (opts.adblock) {
        const blockId = await b.loadExtension(opts.adblock);
        await wait(4000);
        const sw = await b.serviceWorker(blockId);
        // Русский набор правил в копии AdGuard выключен: без него реклама Яндекса не режется
        await b.ev(sw, "chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: ['ruleset_1', 'ruleset_2'] })");
    }
    const worker = await b.serviceWorker(extId);
    await b.ev(worker, GUIDE_DONE);
    return { b, extId, worker };
}

const country = (b, worker) => b.ev(worker, "fetch('https://ipinfo.io/json').then(r => r.json()).then(j => j.country).catch(() => null)");

/** Открывает тайтл и листает до плеера: сайт грузит его, только когда до него долистали */
async function openTitle(b, url) {
    const page = await b.openPage(url);
    await wait(14000);
    await b.ev(page.session, "(() => { const box = document.querySelector('[data-player-anime-id]'); if (box) box.scrollIntoView({ block: 'center' }); })()");
    await wait(14000);
    return page;
}

const frameOf = async (b, pattern) => (await b.targets('iframe')).find(t => pattern.test(t.url));
const rectOf = (b, session, selector) => b.ev(session, `(() => { const el = ${SHELL}.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
const wake = async (b, session) => {
    await b.mouse(session, 'mouseMoved', 300, 300);
    await b.mouse(session, 'mouseMoved', 320, 320);
    await wait(400);
};
const pressShell = async (b, session, selector) => {
    await wake(b, session);
    const at = await rectOf(b, session, selector);
    if (at) await b.clickAt(session, at);
    return !!at;
};
const cvhVideo = (b, session) => b.ev(session, `(() => { const v = ${CVH}.querySelector('video.player-media'); return v ? { t: Math.round(v.currentTime), d: Math.round(v.duration || 0), h: v.videoHeight, paused: v.paused } : null; })()`);

/** Кадр CVH с оболочкой и запущенной серией (реклама может идти до полутора минут) */
async function startCvh(b, url, r) {
    const page = await openTitle(b, url);
    // Расширение открывает Kodik по умолчанию: CVH выбираем его вкладкой на странице
    await b.ev(page.session, "(() => { const slots = [...document.querySelectorAll('[data-player-slot]')]; const i = slots.findIndex(s => /cvh/i.test(s.dataset.playerTitle || '')); const tab = document.querySelectorAll('.tabs-block__select > *')[i]; if (tab) tab.click(); })()");
    await wait(4000);
    const target = await frameOf(b, /cdnvideohub\.com/);
    if (!target) {
        r.check('кадр CVH есть', false);
        return { page };
    }
    const frame = await b.attach(target.targetId);
    let up = false;
    for (let i = 0; i < 25 && !up; i++) {
        await wait(1000);
        up = await b.ev(frame, "!!document.getElementById('ag-shell')");
    }
    r.check('оболочка в кадре', up);
    if (!up) return { page };
    await pressShell(b, frame, '.big');
    let v = null;
    for (let i = 0; i < 45; i++) {
        await wait(2000);
        v = await cvhVideo(b, frame);
        if (v && !v.paused && v.t > 2 && v.d > 120) break;
        if (i === 12 || i === 25) await pressShell(b, frame, '.big');
    }
    r.check('серия запущена', !!v && !v.paused && v.t > 0, v);
    return { page, frame, started: !!v && !v.paused };
}

// ---------- Сценарии ----------

/** Без VPN: разрешения, защита входа, окно расширения, сайт и оболочка */
async function smoke(opts) {
    const r = reporter();
    const { b, extId, worker } = await startBrowser(opts);
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
        r.check('разрешения как в манифесте', JSON.stringify(await b.ev(worker, 'chrome.runtime.getManifest().permissions')) === JSON.stringify(manifest.permissions), manifest.permissions);
        r.check('chrome.windows работает', (await b.ev(worker, 'chrome.windows.getLastFocused().then(w => typeof w.id)')) === 'number');
        const code = await b.openPage('https://shikimori.io/oauth/authorize/AAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        await wait(5000);
        r.check('чужой код не принят', await b.ev(worker, "chrome.storage.local.get(['shiki_access_token']).then(s => s.shiki_access_token === undefined)"));
        await b.closePage(code);

        const popup = await b.openPage(`chrome-extension://${extId}/popup/popup.html`);
        await wait(2500);
        r.check('окно расширения показывает сайты', (await b.ev(popup.session, "document.querySelectorAll('.site-tile').length")) > 0);
        const clientId = fs.readFileSync(path.join(ROOT, 'credentials.js'), 'utf8').match(/client_id: "([^"]+)"/)[1];
        r.check('кнопка входа разрешена окну расширения', (await b.ev(popup.session, `chrome.runtime.sendMessage({ action: 'shiki_auth_begin', clientId: ${JSON.stringify(clientId)} })`)).success === true);
        await wait(4000);
        r.check('вкладка входа открылась', (await b.targets('page')).some(t => /shikimori\.io/.test(t.url)));
        await b.closePage(popup);

        r.check('Shikimori отвечает через очередь', (await b.ev(worker, "fetchShikimoriApi('/api/animes/5114').then(a => a && a.id)")) === 5114);

        // База песен и журнал сбоев. Письмо не отправляется: форма проверяется только до кнопки
        r.check('база песен отвечает', !!(await b.ev(worker, 'getAudioFingerprints(5114)')));
        r.check('сайт базы песен читается из расширения', (await b.ev(worker, "fetch('https://anime-plus-db.ruscadred.workers.dev/v1/5114.json').then(x => x.ok && x.json()).then(j => !!j).catch(() => false)")) === true);
        const page = await b.openPage(`chrome-extension://${extId}/options/options.html`);
        await wait(1500);
        await b.ev(page.session, "chrome.runtime.sendMessage({ action: 'diag_note', where: 'stand_probe', detail: 'проверка https://example.test/secret?access_token=SECRET' })");
        await wait(500);
        const shown = await b.ev(page.session, "chrome.runtime.sendMessage({ action: 'diag_summary' }).then(x => x.text)");
        r.check('сбой попал в журнал без адреса и токена', shown.includes('stand_probe') && shown.includes('example.test') && !shown.includes('SECRET') && !shown.includes('/secret'), shown);
        await b.ev(page.session, "document.querySelector('.feedback-diag-text').open = true");
        await wait(500);
        const preview = await b.ev(page.session, "document.getElementById('feedbackDiagText').textContent");
        r.check('форма показывает, что будет отправлено', preview.includes('stand_probe') && /Chrome \d+/.test(preview), preview.split('\n')[0]);
        r.check('отметка стоит по умолчанию', await b.ev(page.session, "document.getElementById('feedbackDiag').checked"));
        await b.closePage(page);

        const site = await b.openPage('https://animego.me/');
        await wait(7000);
        r.check('на сайте есть значок Anime+', await b.ev(site.session, "!!document.querySelector('ag-fox-dock')"));
        await b.closePage(site);

        const title = await openTitle(b, 'https://jut-su.net/47-ataka-titanov-p7.html');
        const frame = await frameOf(b, /kodik|thealloha|aksor|cdnvideohub|ceramet|aniboom/);
        if (frame) {
            const session = await b.attach(frame.targetId);
            let shell = false;
            for (let i = 0; i < 15 && !shell; i++) {
                await wait(1000);
                shell = await b.ev(session, "!!document.getElementById('ag-shell')");
            }
            r.check('оболочка плеера появилась', shell, new URL(frame.url).hostname);
        } else {
            r.check('кадр плеера есть', false);
        }
        await b.closePage(title);
    } finally {
        await b.close();
    }
    return r.failed;
}

/** С VPN: плеер сайта уходит на Kodik, в оболочке его нет */
async function kodik(opts) {
    const r = reporter();
    const { b, worker } = await startBrowser(opts);
    try {
        r.info('страна', await country(b, worker));
        for (const site of opts.sites) {
            for (const [kind, url] of [['нет вкладки Kodik', CVH_TITLES[site]], ['есть вкладка Kodik', KODIK_TAB_TITLES[site]]]) {
                const name = `${site}, ${kind}`;
                const page = await openTitle(b, url);
                const shown = await b.ev(page.session, "(() => { const s = [...document.querySelectorAll('[data-player-slot]')].find(x => getComputedStyle(x).display !== 'none'); if (!s) return null; try { const f = s.querySelector('iframe'); const inner = f && f.contentDocument && f.contentDocument.querySelector('#root iframe'); return inner ? new URL(inner.src).hostname : null; } catch (e) { return null; } })()");
                r.check(`${name}: на экране Kodik`, /kodik/.test(shown || ''), shown);
                const target = (await b.targets('iframe')).find(t => /kodik/.test(t.url) && !/kodikres/.test(t.url));
                if (target) {
                    const frame = await b.attach(target.targetId);
                    await wait(1500);
                    const list = await b.ev(frame, `(() => { const h = document.getElementById('ag-shell'); if (!h) return null; const s = h.shadowRoot; s.querySelector('[data-act="players"]').click(); const rows = [...s.querySelectorAll('.panel .row')].map(x => x.textContent.trim()); s.querySelector('[data-act="players"]').click(); return rows; })()`);
                    r.check(`${name}: плеера сайта нет в списке`, !!list && list.every(t => /^(cvh|kodik)$/i.test(t)), list);
                }
                await b.closePage(page);
            }
        }
    } finally {
        await b.close();
    }
    return r.failed;
}

/** С VPN: смена серии в CVH настоящими нажатиями. Выбранная зрителем серия ждёт его запуска */
async function episodes(opts) {
    const r = reporter();
    const { b, worker } = await startBrowser(opts);
    try {
        r.info('страна', await country(b, worker));
        for (const site of opts.sites) {
            const local = reporter(`${site}: `);
            const { page, frame, started } = await startCvh(b, CVH_TITLES[site], local);
            if (started) {
                await pressShell(b, frame, '[data-act="episodes"]');
                await wait(700);
                const list = await b.ev(frame, `(() => { const s = ${SHELL}; const eps = [...s.querySelectorAll('.panel .ep')]; return { count: eps.length, now: (s.querySelector('.panel .ep.now') || {}).textContent, labels: eps.map(e => e.textContent) }; })()`);
                local.check('список серий', list.count > 1, list.count);
                const target = list.labels[list.labels.indexOf(list.now) + 1] || list.labels[0];
                const at = await b.ev(frame, `(() => { const e = [...${SHELL}.querySelectorAll('.panel .ep')].find(x => x.textContent === ${JSON.stringify(target)}); const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
                await b.clickAt(frame, at);
                await wait(15000);
                const v = await cvhVideo(b, frame);
                const now = await b.ev(frame, `(${SHELL}.querySelector('.panel .ep.now') || {}).textContent || null`);
                local.check('серия сменилась', now === target, { target, now });
                local.check('новая серия на паузе', !!v && v.paused && v.t === 0, v);
            }
            r.failed.push(...local.failed);
            if (page) await b.closePage(page);
        }
    } finally {
        await b.close();
    }
    return r.failed;
}

/** С VPN: качество CVH готово при открытии настроек, не мигает и применяется */
async function quality(opts) {
    const r = reporter();
    const { b, worker } = await startBrowser(opts);
    try {
        r.info('страна', await country(b, worker));
        for (const site of opts.sites) {
            const local = reporter(`${site}: `);
            const { page, frame, started } = await startCvh(b, CVH_TITLES[site], local);
            if (started) {
                const rows = `[...${SHELL}.querySelectorAll('.panel .row')].map(x => ({ t: x.textContent.trim(), on: x.classList.contains('on') })).filter(x => /^(Авто|\\d+p)$/.test(x.t))`;
                const open = `${CVH}.querySelectorAll('[data-testid="settings-menu"], .sub-menu').length`;
                await wait(3000);
                // Строки считаются на каждом кадре: мигание не спрячется между опросами
                await b.ev(frame, `(() => { window.__rows = []; const tick = () => { if (${SHELL}.querySelector('.panel.on')) window.__rows.push(${rows}.length); requestAnimationFrame(tick); }; tick(); })()`);
                await pressShell(b, frame, '[data-act="settings"]');
                await wait(1000);
                const least = await b.ev(frame, 'Math.min(...window.__rows)');
                local.check('список есть в момент открытия', least > 1, least);
                local.check('родное меню закрыто', (await b.ev(frame, open)) === 0);
                await b.ev(frame, 'window.__rows.length = 0');
                const at = await b.ev(frame, `(() => { const x = [...${SHELL}.querySelectorAll('.panel .row')].find(e => e.textContent.trim() === '480p'); if (!x) return null; x.scrollIntoView({ block: 'center' }); const q = x.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
                if (!at) {
                    local.check('есть пункт 480p', false);
                } else {
                    await b.clickAt(frame, at);
                    await wait(3000);
                    local.check('список не мигнул после выбора', (await b.ev(frame, 'Math.min(...window.__rows)')) === least);
                    local.check('галочка на 480p', JSON.stringify(await b.ev(frame, `${rows}.filter(x => x.on).map(x => x.t)`)) === '["480p"]');
                    await b.ev(frame, `${CVH}.querySelector('[data-testid="settings-btn"]').click()`);
                    await wait(700);
                    const label = await b.ev(frame, `(${CVH}.querySelector('[data-testid="quality-settings"]') || { getAttribute() { return null; } }).getAttribute('aria-label')`);
                    local.check('плеер принял 480p', /480p/.test(label || ''), label);
                }
            }
            r.failed.push(...local.failed);
            if (page) await b.closePage(page);
        }
    } finally {
        await b.close();
    }
    return r.failed;
}

/** Сколько времени код страницы и кадра плеера занимает процессор при просмотре и на паузе. Сравните с --no-extension */
async function perf(opts) {
    const r = reporter();
    const b = launch({ proxy: opts.proxy });
    try {
        if (!opts.noExtension) {
            const extId = await b.loadExtension(prepareExtension());
            if (opts.adblock) await b.loadExtension(opts.adblock);
            await b.ev(await b.serviceWorker(extId), GUIDE_DONE);
        } else if (opts.adblock) {
            await b.loadExtension(opts.adblock);
        }
        const page = await openTitle(b, opts.url || 'https://jut-su.net/47-ataka-titanov-p7.html');
        // Плеер на экране: у скрытых вкладок свои кадры, и видео в них не идёт
        let target = null;
        let frame = null;
        for (const candidate of (await b.targets('iframe')).filter(t => /kodikplayer|kodik\.|thealloha|cdnvideohub|aksor|ceramet|aniboom/.test(t.url) && !/kodikres/.test(t.url))) {
            const session = await b.attach(candidate.targetId);
            if (await b.ev(session, 'innerWidth > 0')) {
                target = candidate;
                frame = session;
                break;
            }
        }
        if (!target) {
            r.check('кадр плеера на экране есть', false);
            return r.failed;
        }
        r.info('плеер', new URL(target.url).hostname);
        await b.send('Performance.enable', {}, frame);
        await b.send('Performance.enable', {}, page.session);
        const VIDEO = "(() => { const list = [...document.querySelectorAll('video')]; const h = document.querySelector('.shadow-root-container'); if (h && h.shadowRoot) list.push(...h.shadowRoot.querySelectorAll('video')); return list.sort((a, c) => (c.duration || 0) - (a.duration || 0))[0] || null; })()";
        // Запуск настоящим нажатием по центру: кнопка оболочки или родная кнопка плеера
        const size = await b.ev(frame, '[innerWidth, innerHeight]');
        for (let i = 0; i < 30; i++) {
            const v = await b.ev(frame, `(() => { const v = ${VIDEO}; return v ? { t: v.currentTime, d: v.duration || 0, paused: v.paused } : null; })()`);
            if (v && !v.paused && v.d > 120 && v.t > 2) break;
            if (i % 8 === 0) {
                const shell = await b.ev(frame, "!!document.getElementById('ag-shell')");
                const native = shell ? null : await b.ev(frame, "(() => { const e = document.querySelector('.play_button, .allplay__control--overlaid, .playButton'); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()");
                if (shell) await pressShell(b, frame, '.big');
                else await b.clickAt(frame, native || { x: size[0] / 2, y: size[1] / 2 });
            }
            await wait(2500);
        }
        const metrics = async (session) => Object.fromEntries((await b.send('Performance.getMetrics', {}, session)).metrics.map(m => [m.name, m.value]));
        const measure = async (name, ms) => {
            const [f0, p0] = [await metrics(frame), await metrics(page.session)];
            const started = Date.now();
            await wait(ms);
            const seconds = (Date.now() - started) / 1000;
            const [f1, p1] = [await metrics(frame), await metrics(page.session)];
            const share = (a, c, key) => +((100 * (c[key] - a[key])) / seconds).toFixed(2);
            r.info(name, { кадр: { скрипты: share(f0, f1, 'ScriptDuration'), задачи: share(f0, f1, 'TaskDuration'), стили: share(f0, f1, 'RecalcStyleDuration'), узлы: f1.Nodes, слушатели: f1.JSEventListeners, память_МБ: Math.round(f1.JSHeapUsedSize / 1048576) }, страница: { скрипты: share(p0, p1, 'ScriptDuration'), задачи: share(p0, p1, 'TaskDuration'), память_МБ: Math.round(p1.JSHeapUsedSize / 1048576) } });
        };
        const state = await b.ev(frame, `(() => { const v = ${VIDEO}; return v ? { t: Math.round(v.currentTime), d: Math.round(v.duration || 0), paused: v.paused, h: v.videoHeight } : null; })()`);
        r.check('видео идёт', !!state && !state.paused, state);
        await measure('просмотр, % времени за 30 с', 30000);
        await b.ev(frame, `(() => { const v = ${VIDEO}; if (v) v.pause(); })()`);
        await wait(1000);
        await measure('пауза, % времени за 20 с', 20000);
    } finally {
        await b.close();
    }
    return r.failed;
}

/**
 * Точность сравнения серий на настоящем звуке: подряд идут серии одного тайтла, эталон это метки Kodik.
 * Работает в копии расширения: анализ заранее не останавливается на готовых метках, иначе при метках Kodik его бы не было.
 * Отчёты в общую базу копия не отправит: сервер принимает их только от расширения из магазина.
 */
async function accuracy(opts) {
    const r = reporter();
    const dir = prepareExtension();
    const skipFile = path.join(dir, 'modules/audio/audio-skip.js');
    const code = fs.readFileSync(skipFile, 'utf8');
    const WANTED = 'wanted: (part) => !found[part] && !repeat[part] && !resolved(part, video),';
    const PATCHES = [
        [WANTED, 'wanted: (part) => !repeat[part],'],
        // Метки Kodik остаются эталоном, но выбор времени их не видит: замер того, что видит зритель там, где их нет
        ['        const nativeFor = (part, video) => {\n', '        const nativeFor = (part, video) => {\n            if (part) return null;\n'],
        // Варианты для замера: без метки сайта, без сравнения серий, без песни из базы (новый тайтл)
        ['        const timingsFor = (part, video) => {', '        const timingsFor = (part, video, off = {}) => {'],
        ['            const site = siteFor(part, video);', '            const site = off.site ? null : siteFor(part, video);'],
        ['                hit: found[part],', '                hit: off.song ? null : found[part],'],
        ['                repeat: repeat[part]\n', '                repeat: off.repeat ? null : repeat[part]\n'],
        ['                    timings\n                });', '                    timings,\n                    variants: Object.fromEntries(Object.entries(VARIANTS).map(([k, off]) => [k, { op: timingsFor(\'op\', video, off), ed: timingsFor(\'ed\', video, off) }]))\n                });'],
        ['    function create(options) {', 'const VARIANTS = { полный: {}, без_повтора: { repeat: true }, песня: { site: true, repeat: true }, новый: { site: true, song: true } };\n    function create(options) {']
    ];
    let patched = code.replace(/\r\n/g, '\n');
    for (const [from, to] of PATCHES) {
        if (!patched.includes(from)) throw new Error(`в audio-skip.js изменилось: ${from.trim().slice(0, 50)}`);
        patched = patched.replace(from, to);
    }
    fs.writeFileSync(skipFile, patched);
    const b = launch({ proxy: opts.proxy });
    const summary = [];
    try {
        const extId = await b.loadExtension(dir);
        const worker = await b.serviceWorker(extId);
        await b.ev(worker, "chrome.storage.local.set({ ag_guide: { tourDone: true, tipsDone: true, switchTipDone: true, questHidden: true }, ag_settings: { audioDebug: true, autoSkip: false, autoPlay: false } })");
        const titles = opts.url ? opts.url.split(',') : ['https://jut-su.net/3552-monolog-farmacevta-h2.html'];
        for (const url of titles) {
            r.info('тайтл', url);
            const page = await openTitle(b, url);
            let target = null;
            let frame = null;
            for (const t of (await b.targets('iframe')).filter(x => /kodikplayer|kodik\./.test(x.url))) {
                const session = await b.attach(t.targetId);
                if (await b.ev(session, 'innerWidth > 0')) {
                    target = t;
                    frame = session;
                    break;
                }
            }
            if (!target) {
                r.check('кадр Kodik на экране', false);
                continue;
            }
            const STATE = "(() => { const v = [...document.querySelectorAll('video')].sort((a, c) => (c.duration || 0) - (a.duration || 0))[0]; if (!v) return null; let audio = null; try { audio = JSON.parse(v.dataset.agAudio || 'null'); } catch (e) {} return { t: v.currentTime, d: v.duration || 0, paused: v.paused, audio }; })()";
            const waitFor = async (test, tries, ms = 2000) => {
                for (let i = 0; i < tries; i++) {
                    const s = await b.ev(frame, STATE);
                    if (s && test(s)) return s;
                    await wait(ms);
                }
                return b.ev(frame, STATE);
            };
            for (let episode = 0; episode < (opts.count || 3); episode++) {
                await wake(b, frame);
                await pressShell(b, frame, '.big');
                let s = await waitFor(x => x.d > 120 && !x.paused && x.t > 1, 45);
                if (!s || s.paused || !(s.d > 120)) {
                    r.check(`серия ${episode + 1} запустилась`, false, s && { t: s.t, d: s.d });
                    break;
                }
                s = await waitFor(x => x.audio && (/^op: готово|^op: ждёт|^ed|^сбой|^поток не найден/.test((x.audio.ahead && x.audio.ahead.status) || '') || (x.audio.repeat && x.audio.repeat.op)), 75);
                const head = s && s.audio && s.audio.ahead ? s.audio.ahead.status : null;
                await b.ev(frame, "(() => { const v = [...document.querySelectorAll('video')].sort((a, c) => (c.duration || 0) - (a.duration || 0))[0]; v.currentTime = v.duration - 410; })()");
                s = await waitFor(x => x.audio && (/^ed: готово|^сбой|^лимит/.test((x.audio.ahead && x.audio.ahead.status) || '') || (x.audio.repeat && x.audio.repeat.ed)), 75);
                await wait(1500);
                const a = (s && s.audio) || {};
                const line = { серия: episode + 1, длина: Math.round(s ? s.d : 0), анализ: [head, a.ahead && a.ahead.status], мб: a.ahead ? Math.round(a.ahead.bytes / 1048576) : 0 };
                // Метки Kodik той же серии: фон сам читает их со страницы плеера, как для других плееров
                const pageUrl = await b.ev(frame, 'location.href');
                const label = await b.ev(frame, `(${SHELL}.querySelector('.sub') || {}).textContent || ''`);
                const number = (label.match(/Серия (\d+)/) || [])[1] || String(episode + 1);
                const marks = await b.ev(worker, `AgKodikMarks.find({ url: ${JSON.stringify(pageUrl)}, episode: ${JSON.stringify(number)}, voice: '', season: null }, (u) => fetch(u, { credentials: 'omit' }).then(r => (r.ok ? r.text() : ''))).then(x => AgKodikMarks.splitMarks(x, ${Math.round(s ? s.d : 0)})).catch(() => null)`).catch(() => null);
                line.метки = marks;
                for (const part of ['op', 'ed']) {
                    const mark = marks && marks[part] && marks[part].end > 0 ? marks[part] : null;
                    const truth = mark;
                    const found = a.repeat && a.repeat[part];
                    const judge = (t) => {
                        if (!t || !(t.end > 0)) return 'нет';
                        const out = { источник: t.source, время: [Math.round(t.start), Math.round(t.end)], кнопка: !!t.manual };
                        if (!truth) return `${t.source}${t.manual ? ' кнопка' : ''} ${out.время.join('-')}`;
                        out.ошибка = [+(t.start - truth.start).toFixed(1), +(t.end - truth.end).toFixed(1)];
                        // Эндинг у самого конца серии тянется до конца: так задумано, хвост после него не нужен
                        const toEnd = part === 'ed' && t.end >= line.длина - 1 && line.длина - truth.end <= 20;
                        const close = Math.abs(out.ошибка[0]) <= 3 && (Math.abs(out.ошибка[1]) <= 5 || toEnd);
                        return `${!close ? 'неверно' : t.manual ? 'кнопка' : 'сам'} ${t.source} ${out.ошибка.join('/')}`;
                    };
                    line[part] = {
                        эталон: truth ? [Math.round(truth.start), Math.round(truth.end)] : null,
                        найдено: found ? [Math.round(found.start), Math.round(found.end), found.manual ? 'кнопка' : 'авто'] : null,
                        ошибка: truth && found ? [+(found.start - truth.start).toFixed(1), +(found.end - truth.end).toFixed(1)] : null,
                        ...Object.fromEntries(Object.entries(a.variants || {}).map(([k, v]) => [k, judge(v[part])]))
                    };
                }
                summary.push(line);
                r.info('итог серии', line);
                if (episode + 1 >= (opts.count || 3)) break;
                // Следующая серия настоящим нажатием в панели
                if (!await b.ev(frame, `!!${SHELL}.querySelector('.panel.on')`)) await pressShell(b, frame, '[data-act="episodes"]');
                await wait(700);
                const next = await b.ev(frame, `(() => { const eps = [...${SHELL}.querySelectorAll('.panel .ep')]; const i = eps.findIndex(e => e.classList.contains('now')); const e = eps[i + 1]; if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2, label: e.textContent }; })()`);
                if (!next) break;
                await b.clickAt(frame, next);
                await wait(5000);
                if (await b.ev(frame, `!!${SHELL}.querySelector('.panel.on')`)) await pressShell(b, frame, '[data-act="episodes"]');
                await wait(1000);
            }
            await b.closePage(page);
        }
        const compared = summary.filter(x => x.серия > 1).flatMap(x => [x.op, x.ed]).filter(p => p.эталон);
        const hits = compared.filter(p => p.найдено);
        r.info('сводка', { 'со второй серии с эталоном': compared.length, найдено: hits.length, 'ошибка начала': hits.map(p => p.ошибка[0]), 'ошибка конца': hits.map(p => p.ошибка[1]) });
        const tally = {};
        for (const p of summary.flatMap(x => [x.op, x.ed]).filter(p => p.эталон)) {
            for (const k of Object.keys(p).filter(k => k.includes('_'))) {
                const t = tally[k] || (tally[k] = { сам: 0, кнопка: 0, неверно: 0, нет: 0 });
                t[String(p[k]).split(' ')[0]]++;
            }
        }
        r.info('варианты', tally);
        r.check('в первой серии сравнивать не с чем', summary.length > 0 && summary.filter(x => x.серия === 1).every(x => !x.op.найдено && !x.ed.найдено));
    } finally {
        await b.close();
    }
    return r.failed;
}

/**
 * Опенинг позже первых 5 минут: анализ заранее ищет его впереди просмотра. Обычный просмотр с автопропуском, без звука.
 * Метки Kodik выбор не видит, иначе прыгала бы метка. По умолчанию 2 серия «Магической битвы», опенинг на 345 с
 */
async function follow(opts) {
    const r = reporter();
    const dir = prepareExtension();
    const skipFile = path.join(dir, 'modules/audio/audio-skip.js');
    const from = '        const nativeFor = (part, video) => {\n';
    const code = fs.readFileSync(skipFile, 'utf8').replace(/\r\n/g, '\n');
    if (!code.includes(from)) throw new Error('в audio-skip.js изменилось: nativeFor');
    fs.writeFileSync(skipFile, code.replace(from, from + '            if (part) return null;\n'));
    const b = launch({ proxy: opts.proxy });
    try {
        const extId = await b.loadExtension(dir);
        const worker = await b.serviceWorker(extId);
        await b.ev(worker, "chrome.storage.local.set({ ag_guide: { tourDone: true, tipsDone: true, switchTipDone: true, questHidden: true }, ag_settings: { audioDebug: true } })");
        const page = await openTitle(b, opts.url || 'https://jut-su.net/67-magicheskaja-bitva-r1.html');
        let frame = null;
        for (const t of (await b.targets('iframe')).filter(x => /kodikplayer|kodik./.test(x.url))) {
            const session = await b.attach(t.targetId);
            if (await b.ev(session, 'innerWidth > 0')) { frame = session; break; }
        }
        r.check('кадр Kodik на экране', !!frame);
        if (!frame) return r.failed;
        const STATE = "(() => { const v = [...document.querySelectorAll('video')].sort((a, c) => (c.duration || 0) - (a.duration || 0))[0]; if (!v) return null; let a = null; try { a = JSON.parse(v.dataset.agAudio || 'null'); } catch (e) {} return { t: v.currentTime, d: v.duration || 0, paused: v.paused, a }; })()";
        const waitFor = async (test, tries, ms = 2000) => {
            for (let i = 0; i < tries; i++) {
                const st = await b.ev(frame, STATE);
                if (st && test(st)) return st;
                await wait(ms);
            }
            return b.ev(frame, STATE);
        };
        // Нужная серия настоящими нажатиями в панели
        for (let i = 1; i < (opts.count || 2); i++) {
            await pressShell(b, frame, '[data-act="episodes"]');
            await wait(700);
            const next = await b.ev(frame, `(() => { const eps = [...${SHELL}.querySelectorAll('.panel .ep')]; const k = eps.findIndex(e => e.classList.contains('now')); const e = eps[k + 1]; if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
            if (next) await b.clickAt(frame, next);
            await wait(5000);
            if (await b.ev(frame, `!!${SHELL}.querySelector('.panel.on')`)) await pressShell(b, frame, '[data-act="episodes"]');
            await wait(1000);
        }
        await pressShell(b, frame, '.big');
        let st = await waitFor(x => x.d > 120 && !x.paused && x.t > 1, 45);
        const started = !!st && !st.paused && st.d > 120;
        r.check('серия запустилась', started, st && { t: st.t, d: st.d });
        if (!started) return r.failed;
        // Зритель начинает с 4-й минуты: первые 5 минут проверены сразу, дальше поиск идёт впереди просмотра
        await b.ev(frame, "(() => { const v = [...document.querySelectorAll('video')].sort((a, c) => (c.duration || 0) - (a.duration || 0))[0]; v.currentTime = 240; })()");
        const log = [];
        let prev = null;
        let jump = null;
        for (let i = 0; i < 400 && !jump; i++) {
            st = await b.ev(frame, STATE);
            if (!st) { await wait(500); continue; }
            const a = st.a || {};
            const line = { t: +st.t.toFixed(1), анализ: a.ahead && a.ahead.status, найдено: a.found && a.found.op, когда: a.foundAt && a.foundAt.op, источник: a.timings && a.timings.op && a.timings.op.source };
            if (!prev || line.анализ !== prev.анализ || line.найдено !== prev.найдено) log.push(line);
            if (prev && st.t - prev.t > 20) jump = { из: prev.t, в: line.t, источник: prev.источник, найдено: prev.найдено, когда: prev.когда };
            prev = line;
            if (st.t > 600) break;
            await wait(500);
        }
        r.info('ход анализа', log);
        r.info('прыжок', jump);
        r.check('песню нашёл анализ заранее до её начала', !!jump && jump.найдено > 0 && jump.когда < jump.найдено, jump);
        r.check('прыжок по узнанной песне в первые 2 с', !!jump && /^audio/.test(jump.источник || '') && jump.из - jump.найдено < 2, jump);
        await b.closePage(page);
    } finally {
        await b.close();
    }
    return r.failed;
}

// ---------- Значок Anime+ и вкладка Топа ----------
const DOCK = "document.querySelector('ag-fox-dock')";
const HOMES = {
    animego: 'https://animego.me/',
    jutsu: 'https://jut-su.net/',
    yummy_ru: 'https://ru.yummyani.me/',
    yummy_old: 'https://old.yummyani.me/',
    yummyanime_tv: 'https://yummyanime.tv/',
    animego_online: 'https://animego.online/',
    yammy_club: 'https://yammyanime.club/',
    animevost: 'https://v14.vost.pw/'
};
const DOCK_TITLE = 'https://jut-su.net/3325-provozhajuschaja-v-poslednij-put-friren-p1.html';

const dockRect = (b, session, selector) => b.ev(session, `(() => { const d = ${DOCK}; const el = d && d.shadowRoot.querySelector(${JSON.stringify(selector)}); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
const dockItem = (b, session, re) => b.ev(session, `(() => { const d = ${DOCK}; const el = d && [...d.shadowRoot.querySelectorAll('.item')].find(i => !i.hidden && ${re}.test(i.textContent)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.textContent.trim() }; })()`);
const pressDock = async (b, session) => {
    const at = await dockRect(b, session, '.fab');
    if (at) await b.clickAt(session, at);
    await wait(600);
    return !!at;
};
const hrefOf = (b, session) => b.ev(session, 'location.href');

/** Без VPN: значок на всех сайтах, вёрстка сайта не тронута, Топ и случайный тайтл настоящими нажатиями */
async function dock(opts) {
    const r = reporter();
    const { b, extId } = await startBrowser(opts);
    try {
        for (const [id, url] of Object.entries(HOMES)) {
            const page = await b.openPage(url);
            await wait(9000);
            const state = await b.ev(page.session, `(() => { const d = ${DOCK}; if (!d) return { dock: false, title: document.title }; const r = d.shadowRoot.querySelector('.fab').getBoundingClientRect(); return { dock: true, visible: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight, injected: document.querySelectorAll('.ag-top-nav-link, .ag-top-nav-wrapper, .ag-tw').length }; })()`);
            r.check(`${id}: значок на месте, в вёрстке сайта ничего нашего`, state.dock && state.visible && state.injected === 0, state);
            await b.closePage(page);
        }

        const page = await b.openPage(DOCK_TITLE);
        await wait(12000);
        r.check('нажатие открывает меню', await pressDock(b, page.session) && !!(await dockRect(b, page.session, '.menu')));
        let rating = null;
        for (let i = 0; i < 10 && !(rating && /Shikimori \d/.test(rating.text)); i++) {
            await wait(1000);
            rating = await dockItem(b, page.session, '/Shikimori/');
        }
        r.check('оценка Shikimori в меню', !!rating && /Shikimori \d/.test(rating.text), rating && rating.text);

        const top = await dockItem(b, page.session, '/Топ Shikimori/');
        if (top) await b.clickAt(page.session, top);
        await wait(6000);
        r.check('Топ открылся поверх сайта, страница та же', (await hrefOf(b, page.session)) === DOCK_TITLE && !!(await b.ev(page.session, `!!${DOCK}.shadowRoot.querySelector('.top-frame')`)));
        const frameTarget = (await b.targets('iframe')).find(t => t.url.includes('/top/frame.html'));
        const topFrame = frameTarget ? await b.attach(frameTarget.targetId) : null;
        r.check('Топ помнит сайт', !!frameTarget && frameTarget.url.includes('site=jutsu') && frameTarget.url.includes('embed=1'), frameTarget && frameTarget.url);
        const cards = topFrame ? await b.ev(topFrame, "document.querySelectorAll('.top__card').length") : 0;
        r.check('рейтинг загрузился', cards >= 50, cards);
        // Кадр на весь экран: координаты в нём совпадают с координатами страницы
        if (topFrame) {
            await b.ev(topFrame, "document.querySelector('.top__close').click()");
            await wait(800);
            r.check('крестик закрывает Топ', !(await b.ev(page.session, `!!${DOCK}.shadowRoot.querySelector('.top-frame')`)));
            await pressDock(b, page.session);
            await b.clickAt(page.session, await dockItem(b, page.session, '/Топ Shikimori/'));
            await wait(6000);
        }
        const again = (await b.targets('iframe')).find(t => t.url.includes('/top/frame.html'));
        const againSession = again ? await b.attach(again.targetId) : null;
        const card = againSession ? await b.ev(againSession, "(() => { const r = document.querySelectorAll('.top__card')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 3 }; })()") : null;
        if (card) await b.clickAt(page.session, card);
        let opened = DOCK_TITLE;
        for (let i = 0; i < 20 && opened === DOCK_TITLE; i++) {
            await wait(1000);
            opened = await hrefOf(b, page.session).catch(() => DOCK_TITLE);
        }
        r.check('тайтл из Топа открылся на Jut-Su', /^https:\/\/jut-su\.net\/.+\.html/.test(opened) && opened !== DOCK_TITLE, opened);

        await wait(6000);
        await pressDock(b, page.session);
        const random = await dockItem(b, page.session, '/Случайное аниме/');
        const before = await hrefOf(b, page.session);
        if (random) await b.clickAt(page.session, random);
        let after = before;
        for (let i = 0; i < 25 && after === before; i++) {
            await wait(1000);
            after = await hrefOf(b, page.session).catch(() => before);
        }
        r.check('«Случайное аниме» открыло другой тайтл на Jut-Su', after !== before && /^https:\/\/jut-su\.net\//.test(after), after);

        // Перетаскивание в левый верхний угол настоящей мышью
        await wait(6000);
        const fab = await dockRect(b, page.session, '.fab');
        if (fab) {
            await b.mouse(page.session, 'mouseMoved', fab.x, fab.y);
            await b.mouse(page.session, 'mousePressed', fab.x, fab.y, { button: 'left', clickCount: 1 });
            for (const k of [0.3, 0.6, 1]) await b.mouse(page.session, 'mouseMoved', fab.x - (fab.x - 60) * k, fab.y - (fab.y - 60) * k, { button: 'left', buttons: 1 });
            await b.mouse(page.session, 'mouseReleased', 60, 60, { button: 'left', clickCount: 1 });
            await wait(800);
        }
        const corner = await b.ev(page.session, `${DOCK}.dataset.corner`);
        r.check('значок перетаскивается в угол', corner === 'tl', corner);
        r.check('меню при перетаскивании не открылось', !(await dockRect(b, page.session, '.menu')));
        await b.closePage(page);

        // AnimeVost: «Случайное аниме» через API приложений сайта
        const vost = await b.openPage(HOMES.animevost);
        await wait(9000);
        await pressDock(b, vost.session);
        const vostRandom = await dockItem(b, vost.session, '/Случайное аниме/');
        if (vostRandom) await b.clickAt(vost.session, vostRandom);
        let vostUrl = HOMES.animevost;
        for (let i = 0; i < 40 && !/\/tip\//.test(vostUrl); i++) {
            await wait(1000);
            vostUrl = await hrefOf(b, vost.session).catch(() => vostUrl);
        }
        r.check('«Случайное аниме» работает на AnimeVost', /^https:\/\/v14\.vost\.pw\/tip\//.test(vostUrl), vostUrl);
        await b.closePage(vost);

        // Окно расширения: Топ в новой вкладке с выбором сайта, выбор запоминается
        const popup = await b.openPage(`chrome-extension://${extId}/popup/popup.html`);
        await wait(2500);
        const btn = await b.ev(popup.session, "(() => { const r = document.getElementById('btnTop').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
        await b.clickAt(popup.session, btn);
        await wait(4000);
        const tabTarget = (await b.targets('page')).find(t => t.url.includes('/top/top.html'));
        r.check('кнопка «Топ» в окне расширения открывает вкладку с выбором сайта', !!tabTarget && tabTarget.url.includes('pick=1'), tabTarget && tabTarget.url);
        if (tabTarget) {
            const tab = await b.attach(tabTarget.targetId);
            for (let i = 0; i < 15 && !(await b.ev(tab, "!!document.querySelector('.top__site')")); i++) await wait(1000);
            // Список сайтов раскрывается настоящим нажатием на кнопку выбора
            const opener = await b.ev(tab, "(() => { const r = document.querySelector('.top__picker-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
            await b.clickAt(tab, opener);
            await wait(400);
            const choose = await b.ev(tab, "(() => { const el = document.querySelector('.top__site[aria-selected=\"false\"]'); const r = el.getBoundingClientRect(); return { id: el.dataset.site, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()");
            await b.clickAt(tab, choose);
            await wait(800);
            const saved = await b.ev(tab, "chrome.storage.local.get(['ag_top_site']).then(s => s.ag_top_site)");
            await b.send('Page.reload', {}, tab);
            await wait(1500);
            for (let i = 0; i < 15 && !(await b.ev(tab, "!!document.querySelector('.top__site')").catch(() => false)); i++) await wait(1000);
            const pressedAfter = await b.ev(tab, "document.querySelector('.top__site[aria-selected=\"true\"]').dataset.site");
            r.check('выбор сайта запоминается', saved === choose.id && pressedAfter === choose.id, { chosen: choose.id, saved, pressedAfter });
        }
    } finally {
        await b.close();
    }
    return r.failed;
}

/**
 * Темы оформления: тема выбирается нажатием на странице настроек, открытый плеер перекрашивается без перезагрузки.
 * Для каждой темы снимок с закрытой и открытой панелью, кнопки панели управления не уходят под панель
 */
async function skins(opts) {
    const r = reporter();
    const { b, extId } = await startBrowser(opts);
    const out = opts.out || fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'anime-plus-skins-'));
    fs.mkdirSync(out, { recursive: true });
    try {
        const settingsPage = await b.openPage(`chrome-extension://${extId}/options/options.html`);
        await wait(1500);
        const ids = await b.ev(settingsPage.session, "[...document.querySelectorAll('#skinList [data-skin]')].map(x => x.dataset.skin)");
        r.check('на странице настроек пять тем', ids.length === 5, ids);

        const title = await openTitle(b, opts.url || 'https://jut-su.net/47-ataka-titanov-p7.html');
        let frame = null;
        for (const candidate of (await b.targets('iframe')).filter(t => /kodikplayer|kodik\.|thealloha|cdnvideohub|aksor|ceramet|aniboom/.test(t.url) && !/kodikres/.test(t.url))) {
            const session = await b.attach(candidate.targetId);
            if (await b.ev(session, "innerWidth > 0 && !!document.getElementById('ag-shell')")) {
                frame = session;
                r.info('плеер', new URL(candidate.url).hostname);
                break;
            }
        }
        if (!frame) {
            r.check('оболочка плеера на экране', false);
            return r.failed;
        }
        // Запуск серии: реклама может идти до полутора минут, оболочка в это время скрыта
        for (let i = 0; i < 40; i++) {
            const mode = await b.ev(frame, `(() => { const v = document.querySelector('video.fp-engine') || document.querySelector('video'); return { playing: !!v && !v.paused && v.currentTime > 2, shown: getComputedStyle(document.getElementById('ag-shell')).display !== 'none' }; })()`);
            if (mode.playing && mode.shown) break;
            if (i % 8 === 0) await pressShell(b, frame, '.big');
            await wait(2500);
        }

        // Песня, которую видит расширение: её отметка на шкале оболочки. Тайминги приходят не сразу
        // и потом уточняются (распознавание по звуку), поэтому границы читаются заново перед каждой перемоткой
        const songNow = () => b.ev(frame, `(() => { const z = ${SHELL}.querySelector('.zones .zone'); const v = document.querySelector('video.fp-engine') || document.querySelector('video'); if (!z || !v || !v.duration) return null; return { start: Math.round(parseFloat(z.style.left) / 100 * v.duration), end: Math.round((parseFloat(z.style.left) + parseFloat(z.style.width)) / 100 * v.duration) }; })()`);
        let song = null;
        for (let i = 0; i < 20 && !song; i++) {
            song = await songNow();
            if (!song) await wait(1000);
        }
        r.info('песня на шкале оболочки', song);
        const seekInto = (sec) => b.ev(frame, `(() => { const v = document.querySelector('video.fp-engine') || document.querySelector('video'); v.currentTime = ${sec}; if (v.paused) v.play(); })()`);
        const shot = async (name) => {
            const { data } = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 }, title.session);
            fs.writeFileSync(path.join(out, `${name}.jpg`), Buffer.from(data, 'base64'));
        };
        const BAR_VS_PANEL = `(() => { const s = ${SHELL}; const p = s.querySelector('.panel').getBoundingClientRect(); return [...s.querySelectorAll('.bar > button, .bar .vol')].filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none').filter(e => e.getBoundingClientRect().right > p.left + 1).map(e => e.dataset.act || e.className); })()`;
        for (const id of ids) {
            await b.send('Target.activateTarget', { targetId: settingsPage.targetId });
            const at = await b.ev(settingsPage.session, `(() => { const e = document.querySelector('#skinList [data-skin="${id}"]'); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
            await b.clickAt(settingsPage.session, at);
            await wait(600);
            const saved = await b.ev(settingsPage.session, "chrome.storage.local.get(['ag_settings']).then(s => s.ag_settings && s.ag_settings.playerSkin)");
            const marked = await b.ev(settingsPage.session, "document.querySelector('#skinList [aria-checked=\"true\"]').dataset.skin");
            // Нынешний вид отмечен и без сохранённой настройки: повторное нажатие ничего не пишет
            r.check(`${id}: выбрана на странице настроек`, (saved === id || (!saved && id === ids[0])) && marked === id, { saved, marked });
            await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 }, settingsPage.session)
                .then(({ data }) => fs.writeFileSync(path.join(out, `${id}-0-settings.jpg`), Buffer.from(data, 'base64')));
            await b.send('Target.activateTarget', { targetId: title.targetId });
            let applied = null;
            for (let i = 0; i < 10 && applied !== id; i++) {
                await wait(300);
                applied = await b.ev(frame, `${SHELL}.querySelector('.root').dataset.skin`);
            }
            r.check(`${id}: плеер перекрасился без перезагрузки`, applied === id, applied);
            // Перемотка в опенинг: «Пропустить» или «Вернуться» появляется внутри оболочки, на странице плеера кнопок нет
            if (song) {
                // Границы песни могут уточниться прямо во время ожидания: тогда перематываем ещё раз по новым
                let shown = null;
                for (let attempt = 0; attempt < 2 && !shown; attempt++) {
                    song = (await songNow()) || song;
                    await seekInto(song.start + 2);
                    for (let i = 0; i < 20 && !shown; i++) {
                        await wait(500);
                        shown = await b.ev(frame, `(() => { const s = ${SHELL}; const e = [s.getElementById('ag-smart-skip'), s.getElementById('ag-skip-undo')].find(x => x && x.style.display === 'block'); if (!e) return null; const q = e.getBoundingClientRect(); return q.width ? { text: e.textContent, bg: getComputedStyle(e).backgroundColor } : null; })()`);
                    }
                }
                const why = shown ? null : await b.ev(frame, `(() => { const s = ${SHELL}; const v = document.querySelector('video.fp-engine') || document.querySelector('video'); return { t: Math.round(v.currentTime), paused: v.paused, host: getComputedStyle(document.getElementById('ag-shell')).display, root: s.querySelector('.root').className, skip: s.getElementById('ag-smart-skip').style.display, undo: s.getElementById('ag-skip-undo').style.display, zones: [...s.querySelectorAll('.zones .zone')].map(z => [Math.round(parseFloat(z.style.left) / 100 * v.duration), Math.round((parseFloat(z.style.left) + parseFloat(z.style.width)) / 100 * v.duration)]) }; })()`);
                r.check(`${id}: кнопка пропуска в оболочке по теме`, !!shown, shown || why);
                r.check(`${id}: на странице плеера кнопок пропуска нет`, !(await b.ev(frame, "!!document.getElementById('ag-smart-skip') || !!document.getElementById('ag-skip-undo')")));
                await shot(`${id}-0-skip`);
            }
            await wake(b, frame);
            await shot(`${id}-1-panel-closed`);
            await pressShell(b, frame, '[data-act="settings"]');
            await wait(500);
            r.check(`${id}: кнопки не уходят под открытую панель`, (await b.ev(frame, BAR_VS_PANEL)).length === 0, await b.ev(frame, BAR_VS_PANEL));
            // Затемнение кадра не обрывается у панели: иначе в зазоре и скруглённых углах виден шов
            const scrims = await b.ev(frame, `(() => { const s = ${SHELL}; const w = s.querySelector('.root').getBoundingClientRect().right; return [...s.querySelectorAll('.scrim-top, .scrim-bottom')].filter(e => getComputedStyle(e).display !== 'none').map(e => Math.round(w - e.getBoundingClientRect().right)); })()`);
            r.check(`${id}: затемнение кадра до правого края под панелью`, scrims.every(gap => gap <= 0), scrims);
            await wake(b, frame);
            await shot(`${id}-2-panel-open`);
            await pressShell(b, frame, '[data-act="settings"]');
            await wait(400);
        }
        // Нажатие на «Пропустить» внутри оболочки перематывает за песню.
        // Автопропуск опенинга на время проверки выключен: иначе вместо кнопки сработает он сам
        if (song) {
            await b.ev(settingsPage.session, "chrome.storage.local.get(['ag_settings']).then(s => chrome.storage.local.set({ ag_settings: { ...s.ag_settings, autoSkipOp: false } }))");
            await b.send('Target.activateTarget', { targetId: title.targetId });
            await wait(800);
            let at = null;
            for (let attempt = 0; attempt < 2 && !at; attempt++) {
                song = (await songNow()) || song;
                await seekInto(song.start + 2);
                for (let i = 0; i < 20 && !at; i++) {
                    await wait(500);
                    at = await b.ev(frame, `(() => { const e = ${SHELL}.getElementById('ag-smart-skip'); if (e.style.display !== 'block') return null; const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
                }
            }
            const hit = at ? await b.ev(frame, `(() => { const e = ${SHELL}.elementFromPoint(${at.x}, ${at.y}); return e ? (e.id || e.className || e.tagName) : null; })()`) : null;
            if (at) await b.clickAt(frame, at);
            await wait(800);
            const t = await b.ev(frame, "Math.round((document.querySelector('video.fp-engine') || document.querySelector('video')).currentTime)");
            const state = await b.ev(frame, `(() => { const v = document.querySelector('video.fp-engine') || document.querySelector('video'); return { paused: v.paused, readyState: v.readyState, host: getComputedStyle(document.getElementById('ag-shell')).display, skip: ${SHELL}.getElementById('ag-smart-skip').style.display }; })()`);
            r.check('нажатие на «Пропустить» в оболочке перематывает за песню', !!at && t >= song.end - 2, { t, end: song.end, found: !!at, hit, ...state });
            await b.ev(settingsPage.session, "chrome.storage.local.get(['ag_settings']).then(s => { const { autoSkipOp, ...rest } = s.ag_settings; return chrome.storage.local.set({ ag_settings: rest }); })");
        }

        // Превью на странице настроек нажимается мышью и открывает те же панели, что в плеере
        await b.send('Target.activateTarget', { targetId: settingsPage.targetId });
        const PREVIEW = "document.querySelector('#skinPreview > div').shadowRoot";
        await b.ev(settingsPage.session, "document.getElementById('skinPreview').scrollIntoView({ block: 'center' })");
        await wait(300);
        for (const act of ['episodes', 'voices', 'players', 'settings']) {
            const at = await b.ev(settingsPage.session, `(() => { const q = ${PREVIEW}.querySelector('[data-act="${act}"]').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
            await b.clickAt(settingsPage.session, at);
            await wait(300);
            const shown = await b.ev(settingsPage.session, `(() => { const s = ${PREVIEW}; return s.querySelector('.panel.on h3') ? s.querySelector('.panel h3').firstChild.textContent : null; })()`);
            r.check(`превью: нажатие открывает панель ${act}`, !!shown, shown);
            await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, settingsPage.session)
                .then(({ data }) => fs.writeFileSync(path.join(out, `preview-${act}.jpg`), Buffer.from(data, 'base64')));
        }
        // Редактор: своя тема создаётся нажатиями, сохраняется отдельно, открытый плеер перекрашивается без перезагрузки.
        // Окно выбора цвета системное, поэтому цвет и ползунок стенд ставит скриптом с тем же событием input
        const press = async (sel) => {
            const at = await b.ev(settingsPage.session, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.scrollIntoView({ block: 'center' }); const q = e.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
            await b.clickAt(settingsPage.session, at);
            await wait(400);
        };
        const setField = (sel, value) => b.ev(settingsPage.session, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await press('#skinCreate');
        r.check('редактор открылся', await b.ev(settingsPage.session, "!document.getElementById('skinEditor').hidden"));
        await setField('#edName', 'Стенд');
        await setField('#edAccent', '#3b82f6');
        await setField('#edRadius', '0');
        const draftVar = await b.ev(settingsPage.session, "document.querySelector('#skinPreview > div').shadowRoot.querySelector('.root').style.getPropertyValue('--rail-done')");
        r.check('превью показывает правку до сохранения', draftVar === '#3b82f6', draftVar);
        await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }, settingsPage.session).then(({ data }) => fs.writeFileSync(path.join(out, 'editor-open.jpg'), Buffer.from(data, 'base64')));
        await press('#edSave');
        const mine = await b.ev(settingsPage.session, "chrome.storage.local.get(['ag_settings']).then(s => ({ list: s.ag_settings.custom_skins, now: s.ag_settings.playerSkin }))");
        r.check('своя тема сохранена отдельно и выбрана', mine.list.length === 1 && mine.list[0].name === 'Стенд' && mine.now === mine.list[0].id, mine);
        await b.send('Target.activateTarget', { targetId: title.targetId });
        let painted = null;
        for (let i = 0; i < 10 && painted !== '#3b82f6'; i++) {
            await wait(300);
            painted = await b.ev(frame, `${SHELL}.querySelector('.root').style.getPropertyValue('--rail-done')`);
        }
        r.check('плеер перекрасился в свою тему без перезагрузки', painted === '#3b82f6', painted);
        await wake(b, frame);
        await shot('custom-1-player');
        await b.send('Target.activateTarget', { targetId: settingsPage.targetId });
        await press('#skinDelete');
        await press('#skinDelete');
        const left = await b.ev(settingsPage.session, "chrome.storage.local.get(['ag_settings']).then(s => ({ n: s.ag_settings.custom_skins.length, now: s.ag_settings.playerSkin }))");
        r.check('удаление в два нажатия возвращает нынешний вид', left.n === 0 && left.now === 'compact', left);
        r.info('снимки', out);
    } finally {
        await b.close();
    }
    return r.failed;
}

const SCENARIOS = { smoke, dock, kodik, episodes, quality, perf, accuracy, follow, skins };
const LIMIT_MS = 25 * 60 * 1000;

(async () => {
    const opts = parseArgs(process.argv.slice(2));
    if (!SCENARIOS[opts.scenario]) {
        console.log(`Сценарии: ${Object.keys(SCENARIOS).join(', ')}. Подробности: tools/stand/README.md`);
        process.exit(2);
    }
    const limit = setTimeout(() => {
        console.error('ПРЕВЫШЕНО ВРЕМЯ СЦЕНАРИЯ');
        process.exit(3);
    }, LIMIT_MS);
    console.log(`Сценарий ${opts.scenario}${opts.proxy ? `, прокси ${opts.proxy}` : ''}${opts.adblock ? ', с блокировщиком' : ''}`);
    const failed = await SCENARIOS[opts.scenario](opts);
    clearTimeout(limit);
    console.log(failed.length ? `ИТОГ: сбоев ${failed.length}\n  - ${failed.join('\n  - ')}` : 'ИТОГ: всё прошло');
    process.exit(failed.length ? 1 : 0);
})().catch((e) => {
    console.error('СБОЙ СТЕНДА:', e.message);
    process.exit(3);
});
