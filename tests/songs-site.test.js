// Сайт базы песен для Cloudflare Pages: что в него входит и почему без лишнего
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSongsSite } = require('../tools/build-songs-site');

function makeBase() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'songs-'));
    const source = path.join(dir, 'v1');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, '21.json'), '{"songs":[1]}');
    fs.writeFileSync(path.join(source, '5114.json'), '{"songs":[]}');
    fs.writeFileSync(path.join(source, 'config.json'), '{"audioSkip":true}');
    fs.writeFileSync(path.join(source, 'README.md'), 'нет');
    return { dir, source, target: path.join(dir, 'site') };
}

test('на сайте только файлы песен: аварийный выключатель остаётся на GitHub', () => {
    const { source, target } = makeBase();
    assert.equal(buildSongsSite(source, target), 2);
    assert.deepEqual(fs.readdirSync(path.join(target, 'v1')).sort(), ['21.json', '5114.json']);
    assert.equal(fs.readFileSync(path.join(target, 'v1', '21.json'), 'utf8'), '{"songs":[1]}');
});

test('есть 404.html: иначе Pages отвечал бы страницей вместо ошибки', () => {
    const { source, target } = makeBase();
    buildSongsSite(source, target);
    assert.ok(fs.existsSync(path.join(target, '404.html')));
});

test('файлы разрешено читать из расширения', () => {
    const { source, target } = makeBase();
    buildSongsSite(source, target);
    assert.match(fs.readFileSync(path.join(target, '_headers'), 'utf8'), /Access-Control-Allow-Origin: \*/);
});

test('старые файлы сайта не остаются после новой сборки', () => {
    const { source, target } = makeBase();
    buildSongsSite(source, target);
    fs.rmSync(path.join(source, '21.json'));
    buildSongsSite(source, target);
    assert.deepEqual(fs.readdirSync(path.join(target, 'v1')), ['5114.json']);
});
