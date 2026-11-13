// modules/player/frame/takeover.js
// Смена плеера или озвучки в кадре плеера (content-player.js): новый плеер продолжает ту же серию с того же места
// и запускается сам, если видео шло. Плееры запускаются по-разному и могут сбросить время при старте,
// поэтому результат проверяется, пока не совпадёт, а не надеемся на одну попытку.

(function (root) {
    'use strict';

    const WAIT_MS = 45000;
    const CHECK_MS = 1500;
    const NEAR_SEC = 15;
    const EXACT_SEC = 2;
    const RESTART_MS = 6000;
    const SETTLE_MS = 3000;
    const settle = () => new Promise(r => setTimeout(r, SETTLE_MS));

    /**
     * player — адаптер плеера, link — связь со страницей, sound — frame/sound.js, getSettings() — настройки,
     * listsReady() — плеер показал свои списки, setPendingSeek(time) — место для видео, которое появится позже,
     * minEpisodeSec — короче этого идёт реклама
     */
    function create({ player, link, sound, getSettings, listsReady, setPendingSeek, minEpisodeSec }) {
        let handoff = null;
        let until = 0;

        const playOrMuted = (v) => v.play().catch((e) => {
            if (e.name !== 'NotAllowedError' || v.muted) return;
            sound.muteUntilAction(v);
        });

        const takeOver = async () => {
            if (!handoff) return;
            const { episode, time, play } = handoff;
            handoff = null;
            window.focus();
            const list = player.read('episodes');
            const target = episode === null ? null : list.find(o => o.label === String(episode));
            if (target && !target.selected) {
                player.choose('episodes', target.index);
                await settle();
            }
            setPendingSeek(time);
            // Плеер уже открывали раньше: его видео стоит на старом месте, и догонять надо сразу, даже если разница небольшая
            const opened = player.video();
            if (opened && opened.duration >= minEpisodeSec && Math.abs(opened.currentTime - time) > EXACT_SEC) {
                opened.currentTime = time;
                setPendingSeek(null);
            }
            const deadline = Date.now() + WAIT_MS;
            let startedAt = 0;
            let volumeSet = false;
            const check = setInterval(() => {
                const v = player.video();
                const finish = () => {
                    clearInterval(check);
                    until = 0;
                };
                if (Date.now() > deadline) return finish();
                // Повторное нажатие на кнопку запуска поставило бы только что запущенное на паузу: даём плееру время
                const startOnce = () => {
                    if (Date.now() - startedAt < RESTART_MS) return;
                    startedAt = Date.now();
                    player.start(v);
                };
                // У Kodik видео появляется только после запуска
                if (!v) {
                    if (play) startOnce();
                    return undefined;
                }
                if (player.adState(v) !== 'none') return undefined;
                // Громкость зрителя переходит с ним в новый плеер
                if (!getSettings().playerMuted && !volumeSet) {
                    volumeSet = true;
                    if (v.volume > 0) v.volume = sound.volume();
                }
                // Плеер ещё подключает видео: нажатие сейчас пропадёт
                if (!player.listsStable(v)) return undefined;
                // Вперёд видео уходит само, пока идёт, а отставать ему не от чего: плеер просто начал сначала
                const near = v.currentTime > time - EXACT_SEC && v.currentTime - time < NEAR_SEC;
                if (!near && v.duration >= minEpisodeSec && !v.seeking) {
                    v.currentTime = time;
                    setPendingSeek(null);
                }
                if (!play) return near ? finish() : undefined;
                if (!v.paused) return near && v.readyState >= 3 ? finish() : undefined;
                if (player.started(v)) playOrMuted(v);
                else startOnce();
                return undefined;
            }, CHECK_MS);
        };

        // Озвучка сменилась внутри плеера: кадр тот же, плеер перезагружает поток и может вернуться назад или встать.
        // Сначала даём ему подключить поток: нажатия и перемотка в этот момент его ломают
        const keepPlaceOnVoice = () => {
            const v = player.video();
            if (!v || !(v.duration >= minEpisodeSec)) return;
            handoff = { episode: null, time: v.currentTime, play: true };
            until = Date.now() + WAIT_MS;
            setTimeout(takeOver, SETTLE_MS);
        };

        window.addEventListener('message', (e) => {
            if (!link.isParentSiteOrigin(e.origin)) return;
            if (e.data?.type === 'AG_PAUSE') {
                const v = player.video();
                if (v && !v.paused) v.pause();
            }
            if (e.data?.type === 'AG_HANDOFF') {
                handoff = { episode: e.data.episode, time: Number(e.data.time) || 0, play: !!e.data.play };
                sound.setVolume(e.data.volume);
                if (handoff.play) until = Date.now() + WAIT_MS;
                if (listsReady()) takeOver();
            }
        });

        return {
            takeOver,
            keepPlaceOnVoice,
            // Плеер сменили, и он ещё не занял место прежнего
            pending: () => !!handoff,
            // Новый плеер запускается сам: оболочке не надо считать это паузой зрителя
            takingOver: () => Date.now() < until
        };
    }

    root.AgFrameTakeover = { create, SETTLE_MS, WAIT_MS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
