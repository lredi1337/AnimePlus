// Окружение content-скрипта в jsdom: реальные файлы расширения + заглушка chrome.*
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

const CONTENT_FILES = [
    'modules/shared/sites.js',
    'modules/shared/title-match.js',
    'modules/ui-utils.js',
    'providers/base.js',
    'providers/dle.js',
    'providers/yani.js'
];

/**
 * @param {string} html — снимок страницы (tests/fixtures) или синтетическая разметка
 * @param {string} url — адрес страницы (от него зависят location и выбор сайта)
 * @param {{ onMessage?: (msg) => any, fetch?: (url) => Promise<any> }} [opts]
 */
function makeContentWindow(html, url, opts = {}) {
    const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    const sent = [];

    // jsdom не реализует innerText — для тестов достаточно textContent
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, configurable: true });

    w.chrome = {
        runtime: {
            id: 'test-extension',
            lastError: undefined,
            getURL: (p) => `chrome-extension://test-extension/${p}`,
            onMessage: { addListener() {} },
            sendMessage: (msg, cb) => {
                sent.push(msg);
                Promise.resolve(opts.onMessage ? opts.onMessage(msg) : null).then(res => cb && cb(res));
            }
        },
        storage: {
            local: { get: async () => ({}), set: async () => {} },
            onChanged: { addListener() {} }
        }
    };
    if (opts.fetch) w.fetch = opts.fetch;

    for (const file of CONTENT_FILES) w.eval(read(file));
    return { window: w, sent };
}

module.exports = { makeContentWindow };
