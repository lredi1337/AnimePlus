// providers/dle.js
// Провайдер семейства DLE-сайтов с плеерами в обёртке xfp (yummyanime.tv, animego.online, yammyanime.club).
// Это тот же шаблон, что у Jut-Su: классы отличаются только префиксом
// (jutsu-page__original / animego-online-page__original / inner-page__subtitle …),
// поэтому селекторы ищут по суффиксу класса, а не по точному имени.
//
// Плеер: <div data-player-anime-id> → вкладки .tabs-block__select > (button|span)
//        и слоты [data-player-slot][data-player-title="Плеер Kodik"] — индекс вкладки = индекс слота.
// Kodik вложен в same-origin iframe /engine/ajax/controller.php?mod=xfp, номер серии знает только сам Kodik
// (сообщения content-player.js → AG_EPISODE_CHANGED / AG_VIDEO_PROGRESS).

(function () {
    'use strict';

    const { BaseProvider } = window.AgProviders;

    const SEL = {
        player: ['[data-player-anime-id]'],
        title: ['[class*="page__title"] h1', '[class*="page__header"] h1', 'main h1', 'h1'],
        original: ['[class*="page__original"]', '[itemprop="alternativeHeadline"]', '[class*="inner-page__subtitle"]', 'ul[data-altnames] li'],
        info: ['[class*="page__info"]', '[class*="page__details"]', '[class*="page__list"]', '[class*="inner-page__list"]'],
        shikiLink: ['a[href*="/go/shikimori/"]', 'a[href*="shikimori."][href*="/animes/"]'],
        // animego.online: меню лежит не в <header>, а в соседнем блоке .animego-online-header__menu--bothead
        navTop: ['header a[href*="top"]', 'nav a[href*="top"]', '[class*="header__menu"] > li > a[href*="/top"]'],
        nav: ['header ul', 'header nav']
    };

    // Метка и год могут стоять в разных элементах («<span>Год:</span>\n<a>2026</a>») — допускаем переносы
    const TAB_SWITCH_MS = 300;
    const TAB_SWITCH_TRIES = 20;
    const YEAR_RE = /(?:Год(?:\s+выхода)?|Сезон|Статус|Выпуск|Дата выхода)[^\d]{0,40}?(19[6-9]\d|20[0-4]\d)/i;

    class DleProvider extends BaseProvider {
        constructor(site, settings) {
            super(site, settings);
            this.episode = null;
            this.infoPromise = null;
        }

        isTitlePage() {
            return !!window.agQueryFirst(SEL.player) && this.site.dle.titlePath.test(location.pathname);
        }

        async getTitleInfo() {
            if (!this.isTitlePage()) return null;
            if (this.infoPromise) return this.infoPromise;

            this.infoPromise = (async () => {
                const title = (window.agQueryFirst(SEL.title)?.innerText || '').trim();
                const origEl = window.agQueryFirst(SEL.original);
                const origTitle = (origEl?.innerText || '').trim();
                const altNames = Array.from(document.querySelectorAll('ul[data-altnames] li')).map(li => li.innerText.trim()).filter(Boolean);
                const infoText = SEL.info.flatMap(s => Array.from(document.querySelectorAll(s))).map(e => e.innerText).join('\n');
                const year = (infoText.match(YEAR_RE) || [])[1] || '';
                const kind = /фильм/i.test(infoText) ? 'movie' : /\bOVA\b/i.test(infoText) ? 'ova' : /\bONA\b/i.test(infoText) ? 'ona' : '';

                // ID Shikimori: прямая ссылка или редирект сайта (/go/shikimori/{newsId}) — разрешает background
                let shikimoriId = null;
                const shikiLink = window.agQueryFirst(SEL.shikiLink);
                if (shikiLink) {
                    const direct = shikiLink.href.match(/shikimori\.[a-z]+\/animes\/[a-z]?(\d+)/i);
                    if (direct) {
                        shikimoriId = parseInt(direct[1], 10);
                    } else {
                        const res = await window.agSendMessage({ action: 'resolve_shiki_id_redirect', url: shikiLink.href });
                        shikimoriId = res && res.id ? res.id : null;
                    }
                }

                const playerEl = window.agQueryFirst(SEL.player);
                return {
                    pageKey: `${this.site.id}:${playerEl?.dataset.playerAnimeId || location.pathname}`,
                    title,
                    origTitle: origTitle || title,
                    titles: [...new Set([origTitle, title, ...altNames].filter(Boolean))],
                    year,
                    kind,
                    shikimoriId
                };
            })();
            return this.infoPromise;
        }

        getEpisode(msgEpisode) {
            if (msgEpisode && msgEpisode !== '0') this.episode = String(msgEpisode);
            return this.episode || '1';
        }

        getPlayerContainer() {
            const player = window.agQueryFirst(SEL.player);
            if (!player) return null;

            // 1. Ищем слот с активным/видимым iframe плеера (Kodik/Alloha)
            const iframes = Array.from(player.querySelectorAll('iframe'));
            for (const ifr of iframes) {
                const slot = ifr.closest('.video-inside, [data-player-slot], .tabs-block__content');
                if (slot && slot.style.display !== 'none' && !slot.classList.contains('hidden')) {
                    return slot;
                }
            }

            // 2. Ищем слот по активной вкладке (.is-active / .active в tabs-block__select)
            const activeTab = player.querySelector('.tabs-block__select > .is-active, .tabs-block__select > .active');
            const slots = Array.from(player.querySelectorAll('.tabs-block__content, [data-player-slot], .video-inside'));
            if (activeTab && slots.length) {
                const allTabs = Array.from(activeTab.parentElement.children);
                const idx = allTabs.indexOf(activeTab);
                if (idx !== -1 && slots[idx]) return slots[idx];
            }

            // 3. Ищем слот, который фактически отображается (display !== 'none' и не hidden)
            const visible = slots.find(s => s.style.display !== 'none' && !s.classList.contains('hidden'));
            if (visible) return visible;

            // 4. Любой слот, содержащий iframe
            const anyIfr = iframes[0]?.closest('.video-inside, [data-player-slot], .tabs-block__content');
            if (anyIfr) return anyIfr;

            return player.querySelector('.video-inside') || player;
        }

        // Вкладки плееров лежат в разных блоках: полный экран держим на их общем родителе, иначе смена вкладки его закроет
        getFullscreenContainer() {
            return window.agQueryFirst(SEL.player);
        }

        // Адрес Kodik лежит в кадре-обёртке его вкладки. У других плееров берём метки с его страниц
        getKodikUrl() {
            const player = window.agQueryFirst(SEL.player);
            if (!player) return null;
            for (const frame of player.querySelectorAll('iframe')) {
                if (/kodik/i.test(frame.src || '')) return frame.src;
                try {
                    const inner = frame.contentDocument && frame.contentDocument.querySelector('iframe[src*="kodik"]');
                    if (inner) return inner.src;
                } catch (e) {}
            }
            return null;
        }

        getPlayerWindows() {
            const player = window.agQueryFirst(SEL.player);
            if (!player) return [];
            const wins = [];
            const iframes = Array.from(player.querySelectorAll('iframe'));
            for (const f of iframes) {
                if (f.contentWindow) {
                    wins.push(f.contentWindow);
                    try {
                        const innerIframes = f.contentDocument?.querySelectorAll('iframe') || [];
                        for (const inf of innerIframes) {
                            if (inf.contentWindow) wins.push(inf.contentWindow);
                        }
                    } catch (e) {}
                }
            }
            return wins;
        }

        navigate(dir) {
            const wins = this.getPlayerWindows();
            if (!wins.length) return false;
            wins.forEach(w => {
                try { w.postMessage({ type: 'AG_SWITCH_KODIK_EPISODE', dir: dir === 'prev' ? 'prev' : 'next' }, '*'); } catch (e) {}
            });
            return true;
        }

        // Вкладки плееров без трейлера. Подписи у сайтов разные («Смотреть онлайн», «Все озвучки»), а data-player-title
        // стабилен. Слоты идут первыми, вкладка трейлера может быть без слота (yummyanime.tv: 3 вкладки, 2 слота)
        allPlayerTabs() {
            const player = window.agQueryFirst(SEL.player);
            if (!player) return [];
            const slots = Array.from(player.querySelectorAll('[data-player-slot]'));
            const tabs = Array.from(player.querySelectorAll('.tabs-block__select > *'));
            const bySlot = tabs.length >= slots.length;
            return tabs
                .map((el, i) => {
                    const fromSlot = bySlot ? (slots[i]?.dataset.playerTitle || '').replace(/^Плеер\s*/i, '').trim() : '';
                    return { el, title: fromSlot || el.textContent.trim() };
                })
                .filter(t => !/трейлер|trailer/i.test(t.title));
        }

        // Собственный плеер сайта не показываем: modules/player/agp-to-kodik.js сразу заменяет его на Kodik.
        // Если своей вкладки Kodik у тайтла нет, Kodik окажется в этой вкладке, поэтому так её и называем
        playerTabs() {
            const tabs = this.allPlayerTabs();
            const known = (t) => window.AgPlayerChoice.isKodik(t.title) || /^cvh$/i.test(t.title) || /aksor|alloha|aniboom|parlorate/i.test(t.title);
            const hasKodik = tabs.some(t => window.AgPlayerChoice.isKodik(t.title));
            return tabs.flatMap((t) => {
                if (known(t)) return [t];
                return hasKodik ? [] : [{ ...t, title: 'Kodik' }];
            });
        }

        // Плеер, выбранный зрителем, а без выбора Kodik: на нём есть всё аниме и работают все функции
        selectPreferredPlayer() {
            const player = window.agQueryFirst(SEL.player);
            if (!player) return false;
            if (this.playerChoice === undefined) {
                if (!this.playerChoiceLoading) {
                    this.playerChoiceLoading = true;
                    window.AgPlayerChoice.get(this.site.id).then((name) => {
                        this.playerChoice = name;
                        this.playerChoiceLoading = false;
                        this.selectPreferredPlayer();
                    });
                }
                return false;
            }
            const tabs = this.playerTabs();
            const own = this.playerChoice ? tabs.find(t => window.AgPlayerChoice.same(t.title, this.playerChoice)) : null;
            const target = own || tabs.find(t => window.AgPlayerChoice.isKodik(t.title) || /kodik/i.test(t.el.textContent));
            if (!target) return true; // Kodik на этом тайтле нет
            const tab = target.el;
            if (tab.classList.contains('is-active')) return true;

            const now = Date.now();
            if (tab.dataset.agClickTs && now - parseInt(tab.dataset.agClickTs, 10) < 1500) return false;
            tab.dataset.agClickTs = String(now);
            tab.click();
            return tab.classList.contains('is-active');
        }

        // Выбор плеера в меню оболочки: серии и озвучка здесь и так внутри плеера
        async getShellSite() {
            const tabs = this.playerTabs();
            return {
                title: (window.agQueryFirst(SEL.title)?.innerText || '').trim(),
                episodes: [],
                voices: [],
                players: tabs.map((t, index) => ({ index, title: t.title, selected: t.el.classList.contains('is-active') }))
            };
        }

        async shellPick(kind, index) {
            if (kind !== 'players') return;
            const tab = this.playerTabs()[index];
            if (!tab) return;
            window.AgPlayerChoice.set(this.site.id, tab.title);
            this.playerChoice = tab.title;
            tab.el.click();
            window.AgNativeFs.retidy();
            // Пока страница занята, сайт может пропустить нажатие, а старый плеер уже стоит на паузе
            let tries = 0;
            const retry = () => {
                if (!tab.el.classList.contains('is-active')) tab.el.click();
                window.AgNativeFs.retidy();
                if (!tab.el.classList.contains('is-active') && ++tries < TAB_SWITCH_TRIES) setTimeout(retry, TAB_SWITCH_MS);
            };
            setTimeout(retry, TAB_SWITCH_MS);
        }

        getTitleAnchor() {
            return window.agQueryFirst(SEL.title)?.parentElement || null;
        }

        getNavAnchor() {
            const top = window.agQueryFirst(SEL.navTop);
            return top ? (top.closest('li') || top) : null;
        }

        getExtraNavAnchors() {
            // Сайт копирует меню в мобильную панель (.js-this-in-mobile-menu)
            const main = this.getNavAnchor();
            return Array.from(document.querySelectorAll('[class*="header__menu"] > li > a[href*="/top"]'))
                .map(a => a.closest('li'))
                .filter(li => li && li !== main);
        }

        isSearchPage() {
            return new URLSearchParams(location.search).has('story');
        }

        collectSearchCards() {
            const cards = new Map();
            document.querySelectorAll('a[href]').forEach(a => {
                let url;
                try { url = new URL(a.getAttribute('href'), location.origin); } catch (e) { return; }
                if (url.origin !== location.origin || !this.site.dle.titlePath.test(url.pathname)) return;
                const card = a.closest('[class*="item"], [class*="card"]') || a;
                const title = (card.querySelector('[class*="title"]')?.textContent
                    || (card.querySelector('img[alt]')?.alt || '').replace(/^Постер к аниме\s+/i, '')
                    || a.textContent).trim();
                const year = ((card.querySelector('[class*="meta"], [class*="subtitle"]')?.textContent || '').match(/\b(19[6-9]\d|20[0-4]\d)\b/) || [])[1] || '';
                const prev = cards.get(url.href);
                if (!prev || title.length > prev.title.length) cards.set(url.href, { href: url.href, title, year: year || prev?.year || '' });
            });
            return [...cards.values()].filter(c => c.title);
        }

        requiredSelectors() {
            return [['title', SEL.title], ['player', SEL.player], ['playerTabs', ['[data-player-anime-id] .tabs-block__select']], ['playerSlots', ['[data-player-slot]']]];
        }

        mount(scope) {
            if (this.site.dle.navCss) {
                const style = document.createElement('style');
                style.textContent = this.site.dle.navCss;
                (document.head || document.documentElement).appendChild(style);
                scope.own(style);
            }
            this.episode = null;
            this.infoPromise = null;
            this.playerChoice = undefined;
            scope.listen(document, 'click', (e) => this.onTabClick(e), true);
        }

        // Настоящее нажатие зрителя на вкладку плеера. Свои нажатия расширения сюда не попадают
        onTabClick(e) {
            if (!e.isTrusted || !e.target.closest) return;
            const raw = this.allPlayerTabs().find(t => t.el.contains(e.target));
            if (!raw) return;
            const tab = this.playerTabs().find(t => t.el === raw.el);
            // Вкладка плеера сайта при своей вкладке Kodik: открываем Kodik, когда сайт обработает нажатие
            const target = tab || this.playerTabs().find(t => window.AgPlayerChoice.isKodik(t.title));
            if (!target) return;
            if (!target.el.classList.contains('is-active')) document.dispatchEvent(new CustomEvent('ag-player-switch'));
            window.AgPlayerChoice.set(this.site.id, target.title);
            this.playerChoice = target.title;
            if (!tab) setTimeout(() => target.el.click(), 0);
        }
    }

    window.AgProviders.register('dle', DleProvider);
})();
