// Настоящий Chrome под управлением по CDP: отдельный профиль, расширение из файлов будущего ZIP, настоящие нажатия мышью.
// Обычный Chrome не принимает --load-extension, поэтому расширение загружается командой Extensions.loadUnpacked через pipe
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { storeFiles } = require('../build-store-zip');

const ROOT = path.join(__dirname, '..', '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Копия ровно тех файлов, что уйдут в магазин: так проверка не пропустит забытый в архиве файл */
function prepareExtension() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-plus-ext-'));
    for (const file of storeFiles(ROOT)) {
        const to = path.join(dir, file);
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), to);
    }
    return dir;
}

function launch({ proxy = null, windowSize = '1280,800' } = {}) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anime-plus-profile-'));
    const args = ['--headless=new', `--window-size=${windowSize}`, '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
    if (proxy) args.unshift(`--proxy-server=${proxy}`);
    const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
    const out = proc.stdio[3];
    const inp = proc.stdio[4];
    let id = 0;
    let buf = '';
    const pending = new Map();
    inp.on('data', (d) => {
        buf += d.toString('utf8');
        let i;
        while ((i = buf.indexOf('\0')) >= 0) {
            const m = JSON.parse(buf.slice(0, i));
            buf = buf.slice(i + 1);
            if (!m.id || !pending.has(m.id)) continue;
            const p = pending.get(m.id);
            pending.delete(m.id);
            if (m.error) p.reject(new Error(JSON.stringify(m.error)));
            else p.resolve(m.result);
        }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const mid = ++id;
        pending.set(mid, { resolve, reject });
        out.write(`${JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });

    const ev = async (session, expression) => {
        const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
        return r.result.value;
    };
    const attach = async (targetId) => {
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        await send('Runtime.enable', {}, sessionId);
        return sessionId;
    };
    const targets = async (type) => (await send('Target.getTargets')).targetInfos.filter(t => !type || t.type === type);
    const openPage = async (url) => {
        const { targetId } = await send('Target.createTarget', { url });
        return { targetId, session: await attach(targetId) };
    };
    const closePage = (page) => send('Target.closeTarget', { targetId: page.targetId });

    const mouse = (session, type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra }, session);
    /** Настоящий щелчок: браузер считает его действием зрителя */
    const clickAt = async (session, { x, y }) => {
        await mouse(session, 'mouseMoved', x, y);
        await mouse(session, 'mousePressed', x, y, { button: 'left', clickCount: 1 });
        await mouse(session, 'mouseReleased', x, y, { button: 'left', clickCount: 1 });
    };

    const loadExtension = async (dir) => (await send('Extensions.loadUnpacked', { path: dir })).id;
    const serviceWorker = async (extId) => {
        for (let i = 0; i < 20; i++) {
            const sw = (await targets('service_worker')).find(t => t.url.includes(extId));
            if (sw) return attach(sw.targetId);
            await wait(500);
        }
        throw new Error('service worker расширения не запустился');
    };

    const close = async () => {
        proc.kill();
        await wait(800);
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* Chrome ещё держит файлы: временная папка */ }
    };
    return { send, ev, attach, targets, openPage, closePage, mouse, clickAt, loadExtension, serviceWorker, close };
}

/** Сводка проверок: каждая строка видна сразу, в конце общий итог */
function reporter(prefix = '') {
    const failed = [];
    const pass = (name, detail) => console.log(`  ok  ${prefix}${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    const fail = (name, detail) => {
        failed.push(`${prefix}${name}`);
        console.log(`  СБОЙ ${prefix}${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    };
    return {
        info: (name, detail) => console.log(`  ..  ${prefix}${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`),
        check: (name, good, detail) => (good ? pass(name, detail) : fail(name, detail)),
        failed
    };
}

module.exports = { ROOT, wait, prepareExtension, launch, reporter };
