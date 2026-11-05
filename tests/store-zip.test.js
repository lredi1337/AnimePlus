// ZIP для магазина: только файлы расширения, и ничего из нужного не потеряно
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { read } = require('./helpers');
const { isStoreFile, storeFiles, makeZip } = require('../tools/build-store-zip.js');

/** Минимальное чтение ZIP: центральный каталог → имя и содержимое */
function readZip(zip) {
    const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = zip.readUInt16LE(end + 10);
    let pos = zip.readUInt32LE(end + 16);
    const out = new Map();
    for (let i = 0; i < count; i++) {
        assert.equal(zip.readUInt32LE(pos), 0x02014b50);
        const packedSize = zip.readUInt32LE(pos + 20);
        const nameLen = zip.readUInt16LE(pos + 28);
        const localAt = zip.readUInt32LE(pos + 42);
        const name = zip.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
        const dataAt = localAt + 30 + zip.readUInt16LE(localAt + 26) + zip.readUInt16LE(localAt + 28);
        out.set(name, zlib.inflateRawSync(zip.subarray(dataAt, dataAt + packedSize)));
        pos += 46 + nameLen;
    }
    return out;
}

test('файлы разработки в архив не идут', () => {
    for (const file of ['.claude/skills/x/SKILL.md', 'CLAUDE.md', 'AI_OVERVIEW.md', 'assets/a.png', 'tests/a.test.js', 'tools/a.js', 'server/timings/src/index.js', '.github/workflows/a.yml', 'package.json', 'eslint.config.js', 'AnimePlus-1.0.0.zip']) {
        assert.equal(isStoreFile(file), false, file);
    }
    for (const file of ['manifest.json', 'background.js', 'credentials.js', 'modules/bg-audio.js', 'popup/popup.html', 'icons/icon16.png']) {
        assert.equal(isStoreFile(file), true, file);
    }
});

test('всё, на что ссылается манифест, попадает в архив', () => {
    const files = new Set(storeFiles());
    const manifest = JSON.parse(read('manifest.json'));
    const needed = [
        manifest.background.service_worker,
        manifest.action.default_popup,
        manifest.options_ui.page,
        ...Object.values(manifest.icons),
        ...manifest.content_scripts.flatMap(b => [...(b.js || []), ...(b.css || [])]),
        ...manifest.web_accessible_resources.flatMap(r => r.resources)
    ];
    for (const m of read('background.js').match(/importScripts\(([^)]*)\)/)[1].matchAll(/'\.\/([^']+)'/g)) needed.push(m[1]);
    for (const page of [manifest.action.default_popup, manifest.options_ui.page]) {
        const dir = page.split('/').slice(0, -1).join('/');
        for (const m of read(page).matchAll(/(?:src|href)="(\.\.\/[^"#?]+|[\w-]+\.(?:js|css))"/g)) {
            needed.push(m[1].startsWith('../') ? m[1].slice(3) : `${dir}/${m[1]}`);
        }
    }
    for (const file of needed) assert.ok(files.has(file), file);
});

test('архив читается и хранит файлы без искажений', () => {
    const entries = [
        { name: 'manifest.json', data: Buffer.from('{"a":1}') },
        { name: 'modules/файл.js', data: Buffer.from('x'.repeat(5000)) },
        { name: 'empty.txt', data: Buffer.alloc(0) }
    ];
    const unpacked = readZip(makeZip(entries));
    assert.equal(unpacked.size, 3);
    for (const { name, data } of entries) assert.deepEqual(unpacked.get(name), data);
});

test('одинаковый код даёт одинаковый архив', () => {
    const entries = [{ name: 'a.js', data: Buffer.from('1') }];
    assert.deepEqual(makeZip(entries), makeZip(entries));
});
