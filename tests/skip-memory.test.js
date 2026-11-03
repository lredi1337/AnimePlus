const test = require('node:test');
const assert = require('node:assert');
require('../modules/kodik/skip-memory.js');

const OP = { start: 195, end: 286 };
const skippedAt = (now = 1000) => {
    const memory = globalThis.AgSkipMemory.create();
    memory.markSkipped('op', OP, now);
    return memory;
};
const LATER = 60000;

test('сам пропуск не считается возвратом зрителя', () => {
    const memory = skippedAt();
    memory.onSeek(OP.end, 1100);
    memory.onSeek(OP.start + 40, 1400);
    assert.equal(memory.isKept('op'), false);
});

test('возврат внутрь пропущенной песни отменяет автопропуск', () => {
    const memory = skippedAt();
    memory.onSeek(230, LATER);
    assert.equal(memory.isKept('op'), true);
});

test('быстрый возврат через секунду после пропуска тоже считается', () => {
    const memory = skippedAt();
    memory.onSeek(230, 2000);
    assert.equal(memory.isKept('op'), true);
});

test('повторный пропуск той же части не мешает заметить возврат', () => {
    const memory = skippedAt();
    memory.markSkipped('op', OP, 5000);
    memory.onSeek(230, 5100);
    assert.equal(memory.isKept('op'), true);
});

test('возврат чуть раньше начала песни тоже считается', () => {
    const memory = skippedAt();
    memory.onSeek(OP.start - 5, LATER);
    assert.equal(memory.isKept('op'), true);
});

test('перемотка далеко от песни автопропуск не отменяет', () => {
    const memory = skippedAt();
    memory.onSeek(30, LATER);
    memory.onSeek(600, LATER);
    assert.equal(memory.isKept('op'), false);
});

test('перемотка в ещё не пропущенную песню ничего не меняет', () => {
    const memory = globalThis.AgSkipMemory.create();
    memory.onSeek(230, LATER);
    assert.equal(memory.isKept('op'), false);
});

test('опенинг и эндинг запоминаются отдельно', () => {
    const memory = skippedAt();
    memory.markSkipped('ed', { start: 1300, end: 1390 }, 2000);
    memory.onSeek(1320, LATER);
    assert.equal(memory.isKept('ed'), true);
    assert.equal(memory.isKept('op'), false);
});

test('новое видео сбрасывает память', () => {
    const memory = skippedAt();
    memory.onSeek(230, LATER);
    memory.reset();
    assert.equal(memory.isKept('op'), false);
    memory.onSeek(230, LATER * 2);
    assert.equal(memory.isKept('op'), false);
});

test('кнопка «Вернуться» отменяет автопропуск сразу', () => {
    const memory = skippedAt();
    memory.keepWatching('op');
    assert.equal(memory.isKept('op'), true);
});
