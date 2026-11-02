// modules/animego/ag-shell-bridge.js
// На AnimeGO серии, озвучка и выбор плеера находятся на странице, а не в Kodik. Мост передаёт их в оболочку плеера
// и нажимает кнопки самого сайта, поэтому всё переключается как обычно, без выхода из полного экрана.

(function () {
    'use strict';

    const fromPlayer = (e) => Array.from(document.querySelectorAll('iframe')).some(f => f.contentWindow === e.source) || (window.isValidOrigin && window.isValidOrigin(e.origin));
    const items = (selector) => Array.from(document.querySelectorAll(selector));
    const EPISODES = '[data-anime-player-episodes-target="episode"][data-episode-number]';
    const VOICES = '[data-anime-player-target="translation"][data-translation]';
    const PLAYERS = '[data-anime-player-target="provider"][data-ptranslation]';
    const text = (el) => (el.querySelector('.text-truncate') || el).textContent.trim().split('\n')[0].trim();
    const isActive = (el) => el.classList.contains('active');
    const activeVoice = () => items(VOICES).find(isActive);

    /** Списки в простом виде для оболочки */
    function readSite() {
        const voice = activeVoice();
        const key = voice ? voice.dataset.translation : null;
        const heading = document.querySelector('.player__title, h1');
        return {
            title: heading ? heading.textContent.trim() : '',
            episodes: items(EPISODES).map((el, index) => ({
                index,
                selected: isActive(el),
                label: el.dataset.episodeNumber,
                seen: el.dataset.episodeWatched === 'true',
                title: el.dataset.episodeNumber
            })),
            voices: items(VOICES).filter(el => !el.classList.contains('player-error')).map(el => ({
                index: items(VOICES).indexOf(el),
                selected: isActive(el),
                title: text(el),
                type: /субтитр|subtitles/i.test(el.textContent) ? 'subtitles' : 'voice',
                count: ''
            })),
            players: items(PLAYERS).filter(el => !key || el.dataset.ptranslation === key).map(el => ({
                index: items(PLAYERS).indexOf(el),
                selected: isActive(el),
                title: text(el),
                slug: el.dataset.providerSlug || ''
            }))
        };
    }

    function send(target) {
        try { target.postMessage({ type: 'AG_SHELL_SITE', site: readSite() }, '*'); } catch (e) {}
    }

    function pick(kind, index) {
        if (kind === 'episodes') {
            const el = items(EPISODES)[index];
            if (!el) return;
            (el.querySelector('button') || el).click();
        } else if (kind === 'voices') {
            const el = items(VOICES)[index];
            if (!el) return;
            if (window.agRememberVoice) window.agRememberVoice(text(el));
            el.click();
            // Оболочка работает только в Kodik: сайт мог выбрать для этой озвучки другой плеер
            setTimeout(() => {
                const kodik = items(PLAYERS).find(p => p.dataset.providerSlug === 'kodik' && p.dataset.ptranslation === el.dataset.translation);
                if (kodik && !isActive(kodik)) kodik.click();
            }, 300);
        } else if (kind === 'players') {
            const el = items(PLAYERS)[index];
            if (el) el.click();
        }
    }

    window.addEventListener('message', (e) => {
        const data = e.data;
        if (!data || !fromPlayer(e)) return;
        if (data.type === 'AG_SHELL_GET') {
            send(e.source);
        } else if (data.type === 'AG_SHELL_PICK') {
            pick(data.kind, Number(data.index));
            setTimeout(() => send(e.source), 500);
        }
    });
})();
