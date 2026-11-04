// modules/player/audio-unlock.js
// Выполняется в самой странице плеера. Alloha и Aksor пропускают звук через свою обработку, а браузер усыпляет её, если она создана до нажатия зрителя.
// Видео тогда стоит на месте, как только получает звук, поэтому при нажатии зрителя будим обработку сами

(function () {
    'use strict';

    const made = [];
    for (const name of ['AudioContext', 'webkitAudioContext']) {
        const Original = window[name];
        if (!Original) continue;
        window[name] = new Proxy(Original, {
            construct(target, args, newTarget) {
                const context = Reflect.construct(target, args, newTarget);
                made.push(context);
                return context;
            }
        });
    }
    const wake = () => made.forEach((context) => {
        if (context.state === 'suspended') context.resume().catch(() => {});
    });
    for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) window.addEventListener(type, wake, true);
})();
