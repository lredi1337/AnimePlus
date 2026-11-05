// Уведомления о сериях убраны: не должно остаться ни разрешения, ни файлов, ни кнопок
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, read } = require('./helpers');

test('разрешения на уведомления нет', () => {
    assert.equal(JSON.parse(read('manifest.json')).permissions.includes('notifications'), false);
});

test('файлов окна уведомления нет', () => {
    for (const file of ['notification.html', 'notification.js', 'notification.css']) assert.equal(fs.existsSync(path.join(ROOT, file)), false, file);
});

test('в окне расширения и настройках нет следов уведомлений', () => {
    for (const file of ['popup/popup.html', 'popup/popup.js', 'popup/popup.css', 'config.js', 'background.js']) assert.equal(/notif|force_check_episodes/i.test(read(file)), false, file);
});

test('в коде нет обращений к chrome.notifications', () => {
    for (const file of ['background.js', 'modules/bg-shiki.js', 'modules/ui-utils.js']) assert.equal(read(file).includes('chrome.notifications'), false, file);
});
