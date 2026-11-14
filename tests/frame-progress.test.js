// Ход просмотра из кадра плеера (modules/player/frame/progress.js): страница получает время серии, а не рекламы
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { read } = require('./helpers');

function mount() {
    const dom = new JSDOM('<!doctype html><html><body><video id="main"></video><video id="ad"></video></body></html>', { url: 'https://kodikplayer.com/serial/1/a/720p', runScripts: 'outside-only' });
    const w = dom.window;
    w.eval(read('modules/player/frame/progress.js'));
    const main = w.document.getElementById('main');
    const ad = w.document.getElementById('ad');
    const set = (v, currentTime, duration) => {
        Object.defineProperty(v, 'currentTime', { value: currentTime, configurable: true, writable: true });
        Object.defineProperty(v, 'duration', { value: duration, configurable: true });
    };
    set(main, 400, 1400);
    set(ad, 70, 75);
    const sent = [];
    w.AgFrameProgress.start({
        player: { video: () => main, videos: () => [main, ad] },
        isKodik: true,
        link: { toTop: (m) => sent.push(m), isParentSiteOrigin: () => true },
        sound: { keepSound() {} },
        getEpisode: () => ({ current: '3' }),
        takePendingSeek: () => null,
        audioSkip: null
    });
    const progress = () => sent.filter(m => m.type === 'AG_VIDEO_PROGRESS');
    return { w, main, ad, progress };
}

test('время серии уходит странице', () => {
    const { w, main, progress } = mount();
    main.dispatchEvent(new w.Event('timeupdate'));
    assert.deepEqual(progress().map(m => ({ episode: m.episode, t: m.currentTime, d: m.duration, end: m.isEnded })), [{ episode: '3', t: 400, d: 1400, end: false }]);
});

test('реклама длиннее минуты не сообщает ни своё время, ни свой конец', () => {
    const { w, ad, progress } = mount();
    ad.dispatchEvent(new w.Event('timeupdate'));
    ad.dispatchEvent(new w.Event('ended'));
    assert.deepEqual(progress(), []);
});
