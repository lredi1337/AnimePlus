// providers/vost.js
// AnimeVost: DLE, но плеер свой. Серии выбираются кнопками сайта (#items .epizode), сайт подгружает
// в #player2 кадр /frame5.php?play={id}. Сайт часто переезжает (animevost.org, v14.vost.pw …), поэтому
// ключ тайтла строится по номеру из адреса, а не по домену: после переезда прогресс остаётся тем же.

(function () {
    'use strict';

    const { BaseProvider } = window.AgProviders;

    const SEL = {
        title: ['.shortstoryHead h1', 'h1'],
        info: ['.shortstoryContent']
    };
    // Обычный режим и «Режим кинотеатра»: у каждого свой кадр плеера и свой список серий, виден один
    const MODES = [
        { box: '#playerbox', player: '#player2', episodes: '#items .epizode', active: 'active' },
        { box: '#kinoplayer', player: '#player', episodes: '#list .series', active: 'kactive' }
    ];
    const hidden = (el) => {
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) if (getComputedStyle(e).display === 'none') return true;
        return false;
    };
    const TITLE_PATH = /^\/tip\/[^/]+\/(\d+)-[^/]+\.html$/;
    const YEAR_RE = /Год выхода:\s*(19[6-9]\d|20[0-4]\d)/i;
    const HOME_KEY = 'ag_site_home';

    // «Ледяная стена (второй сезон) / Koori no Jouheki 2nd Season [1-6 из 12+]»
    function splitTitle(text) {
        const clean = String(text || '').replace(/\s+/g, ' ').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
        const [ru, ...rest] = clean.split(' / ');
        return { title: ru.trim(), origTitle: rest.join(' / ').trim() };
    }

    const episodeNumber = (el) => ((el && el.textContent.match(/\d+/)) || [])[0] || null;

    class VostProvider extends BaseProvider {
        mode() {
            return MODES.find(m => { const box = document.querySelector(m.box); return box && !hidden(box); }) || MODES[0];
        }

        episodeEls() {
            return Array.from(document.querySelectorAll(this.mode().episodes));
        }

        currentEpisodeEl() {
            const { active } = this.mode();
            return this.episodeEls().find(el => el.classList.contains(active)) || null;
        }

        isTitlePage() {
            return TITLE_PATH.test(location.pathname) && !!window.agQueryFirst(SEL.title);
        }

        async getTitleInfo() {
            if (!this.isTitlePage()) return null;
            const { title, origTitle } = splitTitle(window.agQueryFirst(SEL.title).textContent);
            const infoText = SEL.info.flatMap(s => Array.from(document.querySelectorAll(s))).map(e => e.textContent).join('\n');
            const year = (infoText.match(YEAR_RE) || [])[1] || '';
            const type = (infoText.match(/Тип:\s*([^\n]+)/i) || [])[1] || '';
            const kind = /фильм/i.test(type) ? 'movie' : /\bOVA\b/i.test(type) ? 'ova' : /\bONA\b/i.test(type) ? 'ona' : '';
            return {
                pageKey: `${this.site.id}:${location.pathname.match(TITLE_PATH)[1]}`,
                title,
                origTitle: origTitle || title,
                titles: [...new Set([origTitle, title].filter(Boolean))],
                year,
                kind,
                shikimoriId: null
            };
        }

        // Номер серии знает только сайт: плеер играет один файл
        getEpisode() {
            return episodeNumber(this.currentEpisodeEl()) || '1';
        }

        getPlayerContainer() {
            return document.querySelector(this.mode().player);
        }

        getPlayerWindows() {
            const box = this.getPlayerContainer();
            return box ? Array.from(box.querySelectorAll('iframe')).map(f => f.contentWindow).filter(Boolean) : [];
        }

        navigate(dir) {
            const list = this.episodeEls();
            const i = list.indexOf(this.currentEpisodeEl());
            const next = list[i + (dir === 'prev' ? -1 : 1)];
            if (i === -1 || !next) return false;
            next.click();
            return true;
        }

        async getShellSite() {
            return {
                title: splitTitle(window.agQueryFirst(SEL.title)?.textContent).title,
                episodes: this.episodeEls().map((el, index) => ({
                    index,
                    label: episodeNumber(el) || String(index + 1),
                    title: el.textContent.trim(),
                    selected: el.classList.contains(this.mode().active)
                })),
                voices: [],
                players: []
            };
        }

        async shellPick(kind, index) {
            if (kind !== 'episodes') return;
            const el = this.episodeEls()[index];
            if (el && !el.classList.contains(this.mode().active)) el.click();
        }

        getTitleAnchor() {
            return window.agQueryFirst(SEL.title)?.parentElement || null;
        }

        isSearchPage() {
            return new URLSearchParams(location.search).has('story');
        }

        collectSearchCards() {
            const cards = new Map();
            document.querySelectorAll('.shortstoryHead a[href]').forEach(a => {
                let url;
                try { url = new URL(a.getAttribute('href'), location.origin); } catch (e) { return; }
                if (!TITLE_PATH.test(url.pathname) || cards.has(url.href)) return;
                const { title } = splitTitle(a.textContent);
                if (title) cards.set(url.href, { href: url.href, title, year: '' });
            });
            return [...cards.values()];
        }

        requiredSelectors() {
            return [['title', SEL.title], ['player', MODES.map(m => m.player)], ['episodes', MODES.map(m => m.episodes)]];
        }

        // Текущий рабочий адрес сайта: плитка в окне расширения ведёт туда, а не на заблокированный домен
        mount() {
            if (!window.chrome || !chrome.storage) return;
            chrome.storage.local.get([HOME_KEY]).then((res) => {
                const homes = (res && res[HOME_KEY]) || {};
                if (homes[this.site.id] === location.origin) return;
                chrome.storage.local.set({ [HOME_KEY]: { ...homes, [this.site.id]: location.origin } });
            }).catch(() => {});
        }
    }

    window.AgProviders.register('vost', VostProvider);
})();
