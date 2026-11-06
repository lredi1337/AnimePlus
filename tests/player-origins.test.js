// Страница сайта принимает команды плеера (AG_*) только от адресов из списка (isValidOrigin в config.js).
// Если манифест запустит плеер на адресе, которого нет в списке, страница перестанет ему отвечать
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

test('каждый адрес, где манифест запускает отправителей AG_*, страница сайта принимает как свой', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://jut-su.net/', runScripts: 'outside-only' });
    const w = dom.window;
    w.chrome = { runtime: { id: 'test', getURL: (p) => p, onMessage: { addListener() {} } }, storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } } };
    for (const f of ['config.js', 'modules/shared/sites.js']) w.eval(read(f));
    const hosts = manifest.content_scripts
        // Блоки в кадрах, чьи файлы шлют сообщения AG_* странице сайта
        .filter(b => (b.all_frames || b.world === 'MAIN') && (b.js || []).some(f => /'AG_[A-Z_]+'/.test(read(f))))
        .flatMap(b => b.matches)
        .map(m => m.match(/^https:\/\/(?:\*\.)?([^/]+)\//)[1]);
    assert.ok(hosts.includes('kodikplayer.com'), 'блок плеера найден');
    const rejected = [...new Set(hosts)].filter(h => !w.isValidOrigin(`https://${h}`));
    assert.deepEqual(rejected, []);
    w.close();
});
