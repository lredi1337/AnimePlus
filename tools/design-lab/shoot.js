#!/usr/bin/env node
// Проверка презентации стилей в настоящем Chrome: каждый стиль, обе страницы, «Другое аниме», кадры, фильтры, выбор сайта.
// Снимки — в папку из --out (по умолчанию рядом, в shots/).
//
//   node tools/design-lab/shoot.js [--out <папка>] [--only cinema,manga]

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, wait } = require('../stand/lib');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', path.join(__dirname, 'shots')));
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const PAGE = pathToFileURL(path.join(__dirname, 'index.html')).href;

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const b = launch({ windowSize: '1440,900' });
    const failed = [];
    const check = (name, ok, detail) => { console.log(`  ${ok ? 'ok ' : 'СБОЙ'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`); if (!ok) failed.push(name); };
    try {
        const page = await b.openPage(PAGE);
        await b.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, page.session);
        // Шрифты Google могут грузиться долго, а скрипты ждут стилей: ждём саму презентацию, а не фиксированное время
        for (let i = 0; i < 60 && !(await b.ev(page.session, "!!(window.LAB && window.LAB.variants && window.LAB.variants.length)")); i++) await wait(500);
        await wait(800);
        const shot = async (name) => {
            const { data } = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }, page.session);
            fs.writeFileSync(path.join(OUT, `${name}.jpg`), Buffer.from(data, 'base64'));
        };
        const ev = (js) => b.ev(page.session, js);
        const click = async (sel) => {
            const at = await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
            if (!at) return false;
            await wait(150);
            await b.clickAt(page.session, at);
            await wait(500);
            return true;
        };
        const imagesOk = () => ev(`(async () => { await new Promise(r => setTimeout(r, 1500)); const imgs = [...document.querySelectorAll('#stage img')].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }); return { total: imgs.length, broken: imgs.filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.slice(-50)) }; })()`);

        // Снимок для обложки и раздела «Визуал»: верх «Случайного аниме», уменьшенный; по одному на стиль и тему
        const preview = async (id) => {
            await ev(`LAB.go('${id}', 'random')`);
            await wait(1800);
            const theme = await ev(`LAB.themeOf('${id}')`);
            const { data: pv } = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, clip: { x: 0, y: 70, width: 1440, height: 830, scale: 0.42 } }, page.session);
            fs.mkdirSync(path.join(__dirname, 'previews'), { recursive: true });
            fs.writeFileSync(path.join(__dirname, 'previews', `${id}-${theme}.jpg`), Buffer.from(pv, 'base64'));
        };
        await ev("localStorage.clear(); LAB.setTheme('auto'); LAB.go(null)");
        await shot('0-intro');
        const variants = await ev('LAB.variants.map(v => v.id)');
        check('шесть стилей, первый — «Классический»', variants.length === 6 && variants[0] === 'classic', variants);
        for (const id of variants) {
            if (ONLY.length && !ONLY.includes(id)) continue;
            console.log(`— ${id}`);
            await ev(`LAB.go('${id}', 'random')`);
            await wait(800);
            const imgs = await imagesOk();
            check(`${id}: постеры и кадры загрузились`, imgs.total > 0 && imgs.broken.length === 0, imgs);
            await shot(`${id}-1-random`);
            await preview(id);
            // Текущий тайтл: счётчик «Другое аниме» и постер
            const currentTitle = () => ev("(() => { const box = document.querySelector('#stage [data-spin]'); const img = box && box.querySelector('img'); return box ? `${box.dataset.spin} ${img ? img.src : ''}` : null; })()");
            const before = await currentTitle();
            check(`${id}: «Другое аниме» есть`, await click('#stage [data-act="next"]'));
            const after = await currentTitle();
            check(`${id}: тайтл сменился`, !!after && after !== before, [before, after]);
            check(`${id}: история появилась`, await ev("!!document.querySelector('#stage [data-act=\"history\"]')"));
            check(`${id}: ссылки на сайты`, await ev("[...document.querySelectorAll('#stage a[href^=\"http\"]')].some(a => !/shikimori/.test(a.href))"));
            check(`${id}: кадры открываются`, await click('#stage [data-act="shot"]') && await ev('!document.getElementById("lightbox").hidden'));
            await wait(800);
            await shot(`${id}-2-shot`);
            await ev('document.querySelector(".lb__close").click()');
            await ev(`LAB.go('${id}', 'top')`);
            await wait(800);
            const timgs = await imagesOk();
            check(`${id}: постеры Топа загрузились`, timgs.total > 0 && timgs.broken.length === 0, timgs);
            await shot(`${id}-3-top`);
            const count = () => ev("document.querySelectorAll('#stage [data-act=\"open-top\"]').length");
            const all = await count();
            await click('#stage [data-act="kind"][data-v="movie"]');
            const movies = await count();
            check(`${id}: фильтр «Фильмы»`, movies > 0 && movies <= all, [all, movies]);
            await click('#stage [data-act="band"][data-v="9"]');
            check(`${id}: оценка 9+`, (await count()) > 0 && (await count()) < movies);
            await click('#stage [data-act="kind"][data-v=""]');
            await click('#stage [data-act="band"][data-v=""]');
            check(`${id}: выбор сайта открывается`, await click('#stage [data-act="site-menu"]') && await ev("document.querySelectorAll('#stage [data-act=\"site\"]').length === 8"));
            await shot(`${id}-4-site-menu`);
            await click('#stage [data-act="site"][data-v="jutsu"]');
            check(`${id}: сайт выбран`, await ev("/Jut-Su/.test(document.querySelector('#stage [data-act=\"site-menu\"]').textContent)"));
            const n0 = await count();
            await click('#stage [data-act="more"]');
            check(`${id}: «Показать ещё»`, (await count()) > n0, [n0, await count()]);

            // Окно расширения — как настоящее: сначала вход через Shikimori, «Выбрать сайт», значки внизу
            await ev(`LAB.go('${id}', 'popup')`);
            await wait(600);
            if (await ev("!!document.querySelector('#stage [data-act=\"popup-logout\"]')")) await click('#stage [data-act="popup-logout"]');
            check(`${id}: окно — вход через Shikimori`, await ev("!!document.querySelector('#stage [data-act=\"popup-login\"]')"));
            check(`${id}: окно — «Выбрать сайт» открывает плитки`, await click('#stage [data-act="popup-sites"]') && await ev("document.querySelectorAll('#stage .kp__tile').length === 8"));
            await click('#stage [data-act="popup-site"][data-v="jutsu"]');
            check(`${id}: окно — сайт выключается переключателем`, await ev("document.querySelector('#stage [data-v=\"jutsu\"]').closest('.kp__tile').classList.contains('is-off')"));
            await click('#stage [data-act="popup-site"][data-v="jutsu"]');
            await shot(`${id}-5-popup-sites`);
            await click('#stage [data-act="popup-sites"]');
            await click('#stage [data-act="popup-login"]');
            check(`${id}: окно — после входа «Продолжить» и список`, await ev("!!document.querySelector('#stage .kp__continue') && document.querySelectorAll('#stage .kp__card').length > 3"));
            const pimgs = await imagesOk();
            check(`${id}: окно — постеры загрузились`, pimgs.total > 0 && pimgs.broken.length === 0, pimgs);
            await shot(`${id}-5-popup`);
            check(`${id}: окно — «Музыка» с опенингами`, await click('#stage [data-act="popup-music"]') && await ev("document.querySelectorAll('#stage .kp__track').length > 0"));
            await shot(`${id}-5b-popup-music`);
            await click('#stage [data-act="popup-music"]');

            // Настройки: тема плеера, озвучки, клавиши настоящим нажатием
            check(`${id}: окно — шестерёнка ведёт в настройки`, await click('#stage .kp__head [data-v="settings"]') && await ev("document.querySelector('#stage').classList.contains('p-settings')"));
            await wait(500);
            await click('#stage [data-act="set-pane"][data-v="player"]');
            await click('#stage [data-act="set-skin"][data-v="glass"]');
            check(`${id}: настройки — тема «Стекло» в образце`, await ev("!!document.querySelector('#stage .k-pv.sk-glass')"));
            await click('#stage [data-act="set-accent"][data-v="#3b82f6"]');
            await shot(`${id}-11-settings-player`);
            await click('#stage [data-act="set-pane"][data-v="voice"]');
            const firstVoice = await ev("document.querySelector('#stage .k-voices b').textContent");
            await click('#stage [data-act="voice-down"][data-v="0"]');
            check(`${id}: настройки — озвучка опустилась`, (await ev("document.querySelectorAll('#stage .k-voices b')[1].textContent")) === firstVoice);
            await click('#stage [data-act="set-pane"][data-v="keys"]');
            await click('#stage [data-act="key-wait"][data-v="fs"]');
            await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'g', code: 'KeyG', text: 'g', windowsVirtualKeyCode: 71 }, page.session);
            await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'g', code: 'KeyG', windowsVirtualKeyCode: 71 }, page.session);
            await wait(300);
            check(`${id}: настройки — клавиша переназначена`, (await ev("document.querySelector('#stage [data-v=\"fs\"]').textContent")) === 'G');
            await shot(`${id}-12-settings-keys`);
            await ev(`LAB.go('${id}', 'popup')`);
            await wait(300);
            check(`${id}: окно — значок «Расписание» ведёт на расписание`, await click('#stage .kp__tabs [data-v="schedule"]') && await ev("document.querySelector('#stage').classList.contains('p-schedule')"));

            // Расписание — как настоящее: вкладки дней, фильтры, разделы по дням с постерами
            await wait(600);
            check(`${id}: расписание — семь дней и серии`, await ev("document.querySelectorAll('#stage .ks__day').length === 7 && document.querySelectorAll('#stage .ks__section').length === 7 && document.querySelectorAll('#stage .ks__card').length > 20"));
            const simgs = await imagesOk();
            check(`${id}: расписание — постеры загрузились`, simgs.total > 0 && simgs.broken.length === 0, simgs);
            await shot(`${id}-6-schedule`);
            const eps = () => ev("document.querySelectorAll('#stage .ks__card').length");
            const allEps = await eps();
            await click('#stage [data-act="sched-type"][data-v="ona"]');
            check(`${id}: расписание — фильтр ONA`, (await eps()) > 0 && (await eps()) < allEps, [allEps, await eps()]);
            await click('#stage [data-act="sched-type"][data-v="ona"]');
            await click('#stage [data-act="sched-panel"]');
            await click('#stage [data-act="sched-flag"][data-v="hideShort"]');
            check(`${id}: расписание — «Короткие серии» показываются`, (await eps()) > allEps, [allEps, await eps()]);
            await shot(`${id}-6b-schedule-filters`);
            await click('#stage [data-act="sched-flag"][data-v="hideShort"]');
            await click('#stage [data-act="sched-panel"]');
            await ev("(() => { const i = document.querySelector('#stage [data-input=\"sched-q\"]'); i.value = 'ведьм'; i.dispatchEvent(new Event('input', { bubbles: true })); })()");
            check(`${id}: расписание — поиск`, (await eps()) > 0 && (await eps()) < allEps);
            await ev("(() => { const i = document.querySelector('#stage [data-input=\"sched-q\"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); })()");

            // Значок лисы и Топ поверх сайта
            await ev(`LAB.go('${id}', 'onsite')`);
            await wait(800);
            check(`${id}: на сайте — Топ поверх сайта`, await ev("document.querySelectorAll('#stage .k-panel .k-tile').length > 10"));
            await shot(`${id}-7-onsite-top`);
            await click('#stage .k-panel__close');
            check(`${id}: на сайте — лиса открывает меню`, await click('#stage .k-fox') && await ev("document.querySelectorAll('#stage .k-dock-menu button').length === 4"));
            await shot(`${id}-8-onsite-menu`);
            check(`${id}: на сайте — расписание из меню`, await click('#stage .k-dock-menu [data-v="schedule"]') && await ev("document.querySelectorAll('#stage .k-panel__list li').length > 0"));
            await click('#stage .k-panel__close');
            await click('#stage .k-fox');
            await click('#stage .k-dock-menu [data-v="top"]');

            // Подбор: настоящая логика
            await ev(`LAB.go('${id}', 'pick')`);
            await wait(500);
            if (await ev("!!document.querySelector('#stage [data-act=\"pk-restart\"]')")) await click('#stage [data-act="pk-restart"]');
            await click('#stage [data-act="pk-start"][data-v=""]');
            check(`${id}: подбор — первый вопрос темы`, await ev("document.querySelectorAll('#stage [data-act=\"pk-opt\"]').length > 20"));
            await click('#stage [data-act="pk-opt"][data-v="fantasy"]');
            await shot(`${id}-9-pick-ask`);
            await click('#stage [data-act="pk-next"]');
            for (let i = 0; i < 8 && await ev("!!document.querySelector('#stage [data-act=\"pk-show\"]')"); i++) {
                if (await ev("!!document.querySelector('#stage [data-act=\"pk-ans\"]')")) await click('#stage [data-act="pk-ans"][data-v="prob"]');
                else await click('#stage [data-act="pk-next"]');
            }
            if (await ev("!!document.querySelector('#stage [data-act=\"pk-show\"]')")) await click('#stage [data-act="pk-show"]');
            check(`${id}: подбор — главный тайтл и семь вариантов`, await ev("!!document.querySelector('#stage .k-pick-hero') && document.querySelectorAll('#stage .k-pick-grid .k-tile').length === 7"));
            const kimgs = await imagesOk();
            check(`${id}: подбор — постеры загрузились`, kimgs.total > 0 && kimgs.broken.length === 0, kimgs);
            await shot(`${id}-10-pick-results`);
        }

        // Противоположная тема каждого стиля
        for (const id of variants) {
            if (ONLY.length && !ONLY.includes(id)) continue;
            const native = await ev(`LAB.variants.find(v => v.id === '${id}').native`);
            const other = native === 'dark' ? 'light' : 'dark';
            console.log(`— ${id}, тема ${other}`);
            await ev(`LAB.setTheme('${other}')`);
            await preview(id);
            for (const pg of ['popup', 'random', 'top', 'onsite', 'schedule', 'pick', 'settings']) {
                await ev(`LAB.go('${id}', '${pg}')`);
                await wait(700);
                check(`${id} ${other}: ${pg} — тема включилась`, await ev(`document.querySelector('#stage').classList.contains('t-${other}')`));
                const im = await imagesOk();
                check(`${id} ${other}: ${pg} — картинки`, im.broken.length === 0, im);
                check(`${id} ${other}: ${pg} — без сдвига вбок`, await ev('document.documentElement.scrollWidth <= innerWidth + 1'));
                await shot(`${id}-${other}-${pg}`);
            }
        }
        // Раздел «Визуал расширения»: выбор стиля и темы меняет всю презентацию и запоминается
        await ev("LAB.setTheme('auto'); LAB.go('classic', 'settings')");
        await wait(500);
        await click('#stage [data-act="set-pane"][data-v="look"]');
        check('визуал: шесть стилей на выбор', await ev("document.querySelectorAll('#stage .k-look__card').length === 6"));
        const lookImgs = await imagesOk();
        check('визуал: снимки стилей загрузились', lookImgs.broken.length === 0, lookImgs);
        await click('#stage [data-act="look"][data-v="bento"]');
        check('визуал: выбран «Плитки»', await ev("document.querySelector('#stage').classList.contains('v-bento')"));
        await click('#stage [data-act="theme"][data-v="dark"]');
        check('визуал: тёмная тема', await ev("document.querySelector('#stage').classList.contains('t-dark')"));
        await shot('look-bento-dark');
        check('визуал: выбор запомнен', await ev("JSON.parse(localStorage.getItem('anime-plus-lab-look')).variant === 'bento'"));
        await ev("localStorage.clear()");
    } finally {
        await b.close();
    }
    console.log(failed.length ? `ИТОГ: сбоев ${failed.length}` : 'ИТОГ: всё прошло');
    process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('СБОЙ:', e.message); process.exit(3); });
