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
const GUIDE_DONE = "chrome.storage.local.set({ ag_guide: { tourDone: true, tipsDone: true, switchTipDone: true, questHidden: true } })";

function parseArgs(argv) {
    const [scenario, ...rest] = argv;
    const opts = { scenario, sites: Object.keys(CVH_TITLES) };
    for (let i = 0; i < rest.length; i += 2) {
        const value = rest[i + 1];
        if (rest[i] === '--proxy') opts.proxy = value;
        else if (rest[i] === '--adblock') opts.adblock = value;
        else if (rest[i] === '--sites') opts.sites = value.split(',');
        else if (rest[i] === '--url') opts.url = value;
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
        r.check('окно расширения показывает сайты', (await b.ev(popup.session, "document.querySelectorAll('[class*=site-item]').length")) > 0);
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
        r.check('на сайте есть пункт Топа', await b.ev(site.session, "[...document.querySelectorAll('a,button,li,div')].some(e => e.children.length < 3 && /Топ Shikimori/i.test(e.textContent || ''))"));
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

const SCENARIOS = { smoke, kodik, episodes, quality, perf };
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
