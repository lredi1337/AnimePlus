// modules/kodik/skip-memory.js
// Память автопропуска: если зритель сам вернулся к пропущенному опенингу или эндингу, значит, хочет его посмотреть.
// Правило одно для всех пропусков: по метке Kodik, по узнанной песне и по найденным таймингам.

(function (root) {
    'use strict';

    // Возврат чуть раньше начала песни — это тоже возврат к ней
    const LEAD_SEC = 10;
    // Перемотка в эти мгновения после пропуска — это сам пропуск: зритель не успел бы среагировать
    const OWN_SEEK_MS = 500;
    const PARTS = ['op', 'ed'];

    function create() {
        const skipped = { op: null, ed: null };
        const keep = { op: false, ed: false };
        let ownSeekUntil = 0;

        return {
            /** Расширение пропустило часть с этим диапазоном */
            markSkipped(part, range, now = Date.now()) {
                // Повторный пропуск той же части не продлевает окно: иначе в него попадёт возврат зрителя
                if (!skipped[part]) ownSeekUntil = now + OWN_SEEK_MS;
                skipped[part] = { start: range.start, end: range.end };
            },
            /** Началась перемотка: сюда приходят и шкала, и клавиши, и кнопки плеера */
            onSeek(time, now = Date.now()) {
                if (now < ownSeekUntil) return;
                for (const part of PARTS) {
                    const range = skipped[part];
                    if (range && time >= range.start - LEAD_SEC && time < range.end - 1) keep[part] = true;
                }
            },
            /** Зритель нажал «Вернуться» */
            keepWatching(part) {
                keep[part] = true;
            },
            isKept(part) {
                return keep[part];
            },
            /** Новое видео */
            reset() {
                for (const part of PARTS) {
                    skipped[part] = null;
                    keep[part] = false;
                }
                ownSeekUntil = 0;
            }
        };
    }

    /** Сэкономленное время копится за текущий месяц: новый месяц начинает счёт заново */
    function addSaved(stat, seconds, now = new Date()) {
        const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
        const base = stat && stat.month === month ? stat.seconds : 0;
        return { month, seconds: base + Math.max(0, Math.round(seconds)) };
    }

    root.AgSkipMemory = { create, addSaved };
})(typeof globalThis !== 'undefined' ? globalThis : this);
