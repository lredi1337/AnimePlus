// modules/player/frame/sound.js
// Звук серии в кадре плеера (content-player.js). Браузер может не разрешить звук без нажатия в этом кадре:
// тогда видео идёт без звука, а звук вернётся при первом действии зрителя.
// Выключенным звук остаётся, только если так решил зритель (настройка playerMuted).

(function (root) {
    'use strict';

    const SOUND_CHECK_MS = 400;

    /** getSettings() — текущие настройки, adState(video) — идёт ли реклама в этом видео */
    function create({ getSettings, adState }) {
        let waiting = false;
        // Громкость прежнего плеера при смене плеера: новый продолжает с ней
        let volume = 1;

        // Kodik глушит себя нулевой громкостью и запоминает её, поэтому одного снятия отметки «без звука» мало
        const isSilent = (v) => v.muted || v.volume === 0;
        const unmute = (v) => {
            v.muted = false;
            if (v.volume === 0) v.volume = volume;
        };

        const muteUntilAction = (v) => {
            waiting = true;
            v.muted = true;
            v.play().catch(() => {});
            // Нажатие по самому видео только возвращает звук: паузу зритель не просил. Кнопки и ползунок работают как обычно
            const keepPlaying = (e) => {
                if (e.composedPath().some(n => n.closest && n.closest('button, input, a, .slider, .panel'))) return;
                e.stopPropagation();
                e.preventDefault();
            };
            const restore = (e) => {
                waiting = false;
                document.removeEventListener('pointerdown', restore, true);
                document.removeEventListener('keydown', restore, true);
                if (!getSettings().playerMuted) unmute(v);
                if (e.type === 'pointerdown') document.addEventListener('click', keepPlaying, { capture: true, once: true });
            };
            document.addEventListener('pointerdown', restore, true);
            document.addEventListener('keydown', restore, true);
        };

        // Плеер мог выключить звук сам, например запустившись без нажатия
        const keepSound = (v) => {
            if (!isSilent(v) || waiting || getSettings().playerMuted || v.paused || adState(v) !== 'none') return;
            waiting = true;
            unmute(v);
            setTimeout(() => {
                waiting = false;
                // Браузер останавливает видео, которому звук не разрешён
                if (v.paused) muteUntilAction(v);
            }, SOUND_CHECK_MS);
        };

        return {
            isSilent, unmute, muteUntilAction, keepSound,
            volume: () => volume,
            setVolume: (value) => { if (value > 0) volume = value; }
        };
    }

    root.AgFrameSound = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
