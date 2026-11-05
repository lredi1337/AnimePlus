// Списки хостов повторяются в манифесте и config.js, а сборки нет: расхождение ловит только этот тест
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('./helpers');

const manifest = JSON.parse(read('manifest.json'));
const hostOf = (pattern) => pattern.replace(/^https:\/\/(\*\.)?/, '').replace(/\/.*$/, '');
const playerBlock = manifest.content_scripts.find(b => (b.js || []).includes('content-player.js'));
const bootBlock = manifest.content_scripts.find(b => (b.js || []).includes('modules/player/boot.js'));

test('каждый файл из манифеста существует', () => {
    const files = [
        manifest.background.service_worker,
        manifest.action.default_popup,
        manifest.options_ui.page,
        ...manifest.content_scripts.flatMap(b => [...(b.js || []), ...(b.css || [])]),
        ...manifest.web_accessible_resources.flatMap(r => r.resources)
    ];
    for (const file of files) assert.ok(fs.existsSync(path.join(ROOT, file)), file);
});

test('файлы из importScripts существуют', () => {
    const line = read('background.js').match(/importScripts\(([^)]*)\)/)[1];
    for (const m of line.matchAll(/'([^']+)'/g)) assert.ok(fs.existsSync(path.join(ROOT, m[1])), m[1]);
});

test('каждый сайт из content_scripts есть в host_permissions', () => {
    const allowed = new Set(manifest.host_permissions.map(hostOf));
    for (const block of manifest.content_scripts) {
        for (const pattern of block.matches) assert.ok(allowed.has(hostOf(pattern)), pattern);
    }
});

test('загрузчик плеера и сам плеер работают на одних и тех же адресах', () => {
    assert.deepEqual([...bootBlock.matches].sort(), [...playerBlock.matches].sort());
});

test('сообщения от каждого плеера считаются доверенными', () => {
    const list = read('config.js').match(/TRUSTED_ORIGIN_SUFFIXES = \[([\s\S]*?)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1));
    for (const pattern of playerBlock.matches) {
        const host = hostOf(pattern);
        assert.ok(list.some(d => host === d || host.endsWith(`.${d}`)), host);
    }
});

test('страницы Shikimori покрыты на всех зеркалах одинаково', () => {
    const block = manifest.content_scripts.find(b => (b.js || []).includes('content-external.js'));
    const mirrors = new Set(block.matches.map(hostOf));
    for (const mirror of mirrors) {
        assert.ok(block.matches.includes(`https://${mirror}/animes/*`), `${mirror}/animes`);
        assert.ok(block.matches.includes(`https://${mirror}/anime/*`), `${mirror}/anime`);
    }
});

test('Client ID Shikimori записан в одном месте', () => {
    const id = read('credentials.js').match(/client_id: "([^"]+)"/)[1];
    for (const file of ['background.js', 'config.js', 'modules/bg-shiki.js', 'popup/popup.js', 'content-shiki-auth.js']) {
        assert.equal(read(file).includes(id), false, file);
    }
});

test('экранирование HTML не копируется по файлам', () => {
    for (const file of ['popup/popup.js', 'modules/ui-utils.js', 'modules/animego/ag-jutsu-search.js', 'modules/animego/ag-schedule.js', 'modules/animego/ag-synthetic.js']) {
        assert.equal(/\.replace\(\/&\/g|\[&<>"'\]/.test(read(file)), false, file);
    }
});
