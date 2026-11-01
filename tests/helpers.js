// Загрузка исходников расширения в песочницу vm без сборки и без браузера
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Создаёт контекст с указанными глобалами и выполняет в нём файлы по порядку */
function loadInContext(files, globals = {}) {
    const ctx = vm.createContext({ console, URL, setTimeout, clearTimeout, ...globals });
    if (!ctx.globalThis) ctx.globalThis = ctx;
    for (const file of files) {
        vm.runInContext(typeof file === 'string' ? read(file) : file.code, ctx, { filename: typeof file === 'string' ? file : file.name });
    }
    return ctx;
}

/** Фрагмент config.js с isValidOrigin (сам config.js завязан на chrome.storage) */
function isValidOriginSource() {
    const src = read('config.js');
    return { name: 'config.js#isValidOrigin', code: src.slice(src.indexOf('const TRUSTED_ORIGIN_SUFFIXES'), src.indexOf('window.AG_CONSTANTS')) };
}

const flush = () => new Promise(r => setTimeout(r, 20));

module.exports = { ROOT, read, loadInContext, isValidOriginSource, flush };
