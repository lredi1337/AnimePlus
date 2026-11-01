// providers/dle.js
// Провайдер семейства DLE-сайтов с плеерами в обёртке xfp (yummyanime.tv, animego.online, yammyanime.club).
// Это тот же шаблон, что у Jut-Su: классы отличаются только префиксом
// (jutsu-page__original / animego-online-page__original / inner-page__subtitle …),
// поэтому селекторы ищут по суффиксу класса, а не по точному имени.
//
// Плеер: <div data-player-anime-id> → вкладки .tabs-block__select > (button|span)
//        и слоты [data-player-slot][data-player-title="Плеер Kodik"] — индекс вкладки = индекс слота.
// Kodik вложен в same-origin iframe /engine/ajax/controller.php?mod=xfp, номер серии знает только сам Kodik
// (сообщения content-kodik.js → AG_EPISODE_CHANGED / AG_VIDEO_PROGRESS).

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

        // Kodik: слот с data-player-title*="Kodik" и вкладка с тем же индексом.
        // Подписи вкладок у сайтов разные («Kodik», «Все озвучки»), а data-player-title стабилен
        selectPreferredPlayer() {
            const player = window.agQueryFirst(SEL.player);
            if (!player) return false;
            const slots = Array.from(player.querySelectorAll('[data-player-slot]'));
            const kodikIdx = slots.findIndex(s => /kodik/i.test(s.dataset.playerTitle || ''));
            if (kodikIdx === -1) return true; // Kodik на этом тайтле нет

            // 1) вкладка с подписью «Kodik»; 2) вкладка с тем же индексом, что и слот —
            // слоты идут первыми, вкладка трейлера может быть без слота (yummyanime.tv: 3 вкладки, 2 слота)
            const tabs = Array.from(player.querySelectorAll('.tabs-block__select > *'));
            const tab = tabs.find(t => /kodik/i.test(t.textContent))
                || (tabs.length >= slots.length ? tabs[kodikIdx] : null);
            if (!tab) return true;
            if (tab.classList.contains('is-active')) return true;

            const now = Date.now();
            if (tab.dataset.agClickTs && now - parseInt(tab.dataset.agClickTs, 10) < 1500) return false;
            tab.dataset.agClickTs = String(now);
            tab.click();
            return tab.classList.contains('is-active');
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

        getSettingsAnchor() {
            // На DLE-сайтах настройки встраиваются отдельной кнопкой-шестерёнкой в шапку (getHeaderGearAnchor),
            // текстовая надпись в меню навигации не нужна, чтобы не дублировать кнопки.
            if (this.getHeaderGearAnchor && this.getHeaderGearAnchor()) return null;
            const menu = document.querySelector('.header__menu, [class*="header__menu"], ul.menu, header ul');
            if (menu) {
                return Array.from(menu.querySelectorAll('li:not(.ag-settings-menu-wrapper)')).pop() || null;
            }
            return null;
        }

        getHeaderGearAnchor() {
            const right = document.querySelector('.header__right, [class*="header__right"]');
            if (right) {
                return right.querySelector('[class*="sign-in"], a[href*="login"], .btn') || right.firstElementChild || right;
            }
            return document.querySelector('.change-color, [class*="change-color"]') || null;
        }

        isSettingsIconOnly() {
            return !!this.site.dle?.settingsIconOnly;
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
        }
    }

    window.AgProviders.register('dle', DleProvider);
})();
