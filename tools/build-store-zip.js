// Сборка ZIP для Chrome Web Store: node tools/build-store-zip.js
// В архив идут файлы из git и новые, ещё не добавленные. Новые сборка перечисляет, а игнорируемые не берёт.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');

// Папки и файлы разработки. Всё остальное из git уходит пользователям
const EXCLUDED_DIRS = ['.claude', '.github', 'assets', 'node_modules', 'pages', 'server', 'tests', 'tools'];
const EXCLUDED_FILES = new Set([
    '.gitignore', 'AI_OVERVIEW.md', 'CLAUDE.md', 'LICENSE', 'PRIVACY_POLICY.md', 'README.md',
    'eslint.config.js', 'package-lock.json', 'package.json'
]);

const isStoreFile = (file) => !EXCLUDED_FILES.has(file) && !EXCLUDED_DIRS.some(dir => file.startsWith(`${dir}/`)) && !file.endsWith('.zip');

const gitFiles = (root, ...args) => execFileSync('git', ['ls-files', '-z', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 })
    .split('\0').filter(Boolean).filter(isStoreFile).filter(file => fs.existsSync(path.join(root, file)));

function storeFiles(root = ROOT) {
    return [...gitFiles(root), ...untrackedStoreFiles(root)].sort();
}

function untrackedStoreFiles(root = ROOT) {
    return gitFiles(root, '--others', '--exclude-standard');
}

/** ZIP с одной фиксированной датой: один и тот же код даёт один и тот же архив */
function makeZip(entries) {
    const DOS_TIME = 0;
    const DOS_DATE = (1 << 5) | 1 | ((2020 - 1980) << 9);
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const { name, data } of entries) {
        const fileName = Buffer.from(name, 'utf8');
        const packed = zlib.deflateRawSync(data, { level: 9 });
        const crc = zlib.crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(8, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(packed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(fileName.length, 26);
        locals.push(local, fileName, packed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(8, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(packed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(fileName.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, fileName);

        offset += local.length + fileName.length + packed.length;
    }

    const centralDir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDir, end]);
}

function build(root = ROOT) {
    const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const files = storeFiles(root);
    const zip = makeZip(files.map(name => ({ name, data: fs.readFileSync(path.join(root, name)) })));
    const target = path.join(root, `AnimePlus-${version}.zip`);
    fs.writeFileSync(target, zip);
    return { target, count: files.length, size: zip.length, untracked: untrackedStoreFiles(root) };
}

if (require.main === module) {
    const { target, count, size, untracked } = build();
    console.log(`${path.basename(target)}: ${count} файлов, ${(size / 1024 / 1024).toFixed(2)} МБ`);
    if (untracked.length) console.log(`Ещё не в git, но в архиве: ${untracked.join(', ')}`);
}

module.exports = { isStoreFile, storeFiles, makeZip };
