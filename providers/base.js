// providers/base.js
// Абстракция «провайдер сайта» для сайтов, подключённых через единый runtime (providers/runtime.js).
// AnimeGO.me и Jut-Su пока работают на собственных модулях (modules/animego, modules/jutsu) — см. AI_OVERVIEW.md.
//
// Жизненный цикл страницы:
//   runtime создаёт Scope → provider.mount(scope) → фичи (трекер, мост плеера, виджеты, Топ) работают через
//   методы провайдера → при SPA-переходе scope.dispose() снимает ВСЕ наблюдатели/слушатели/таймеры
//   и удаляет вставленные элементы → для нового URL создаётся новый Scope.

(function () {
    'use strict';

    /**
     * Контейнер ресурсов одной страницы. Всё, что регистрируется через scope, гарантированно
     * освобождается в dispose() — утечки наблюдателей при SPA-навигации исключены по построению.
     */
    class Scope {
        constructor() {
            this.disposers = [];
            this.disposed = false;
        }

        add(fn) {
            if (this.disposed) { try { fn(); } catch (e) {} return; }
            this.disposers.push(fn);
        }

        listen(target, type, handler, options) {
            target.addEventListener(type, handler, options);
            this.add(() => target.removeEventListener(type, handler, options));
        }

        observe(callback, options) {
            this.add(window.agObserveDom(callback, options));
        }

        timeout(fn, ms) {
            const id = setTimeout(() => { if (!this.disposed) fn(); }, ms);
            this.add(() => clearTimeout(id));
            return id;
        }

        interval(fn, ms) {
            const id = setInterval(() => { if (!this.disposed) fn(); }, ms);
            this.add(() => clearInterval(id));
            return id;
        }

        /** Вставленный расширением элемент — удаляется при уходе со страницы */
        own(el) {
            this.add(() => el.remove());
            return el;
        }

        dispose() {
            if (this.disposed) return;
            this.disposed = true;
            for (const fn of this.disposers.splice(0).reverse()) {
                try { fn(); } catch (e) { console.warn('[Anime+] scope dispose error:', e); }
            }
        }
    }

    /**
     * Базовый провайдер. Наследники переопределяют нужные методы; значения по умолчанию безопасны.
     */
    class BaseProvider {
        constructor(site, settings) {
            this.site = site;         // запись из AgSites
            this.settings = settings; // ag_settings с дефолтами
        }

        /** Это страница конкретного тайтла (есть плеер / метаданные)? */
        isTitlePage() { return false; }

        /**
         * Сведения о тайтле для учёта серий и поиска на других сайтах.
         * @returns {Promise<{pageKey: string, title: string, origTitle: string, titles: string[],
         *           year?: string, kind?: string, shikimoriId?: number, totalEpisodes?: number}|null>}
         */
        async getTitleInfo() { return null; }

        /** Номер текущей серии. msgEpisode — номер из сообщения плеера (Kodik), если он есть */
        getEpisode(msgEpisode) { return msgEpisode || '1'; }

        /** Контейнер плеера (для псевдо-фуллскрина) */
        getPlayerContainer() { return null; }

        /** Окна iframe плееров, которым отправляем AniSkip/настройки */
        getPlayerWindows() {
            return Array.from(document.querySelectorAll('iframe'))
                .filter(f => /kodik|xfp|aniboom|alloha/i.test(f.src || f.name || ''))
                .map(f => f.contentWindow)
                .filter(Boolean);
        }

        /** Выбрать предпочтительный плеер (Kodik). true — выбор сделан или невозможен, больше не пытаться */
        selectPreferredPlayer() { return true; }

        /** Переключить серию (стрелки в плеере). true — получилось */
        navigate(dir) { return false; }

        /** Таймкоды опенинга/эндинга с самого сайта (если сайт их отдаёт) */
        async getSkipData(episode) { return null; }

        /** Куда вставлять кнопки «Shikimori ★» / «Смотреть на…» */
        getTitleAnchor() { return null; }

        /** Пункт меню сайта, рядом с которым добавить «Топ Shikimori» */
        getNavAnchor() { return null; }

        /** Пункт меню сайта, рядом с которым добавить «Настройки Anime+» */
        getSettingsAnchor() { return null; }

        /** Пункты «Топ 100» в остальных копиях меню сайта (например, мобильной) */
        getExtraNavAnchors() { return []; }

        /** Ссылка выпадающего меню — образец для «Топ Shikimori», когда в шапке нет места под новый пункт */
        getTopMenuSample() { return null; }

        /** Кнопка профиля в шапке: перед ней встаёт шестерёнка настроек в родном стиле сайта */
        getProfileNavItem() { return null; }

        /** Ссылки поиска, открытые расширением (ag_from), — автопереход на тайтл */
        isSearchPage() { return false; }
        collectSearchCards() { return []; }

        /** Ключи реестра селекторов, обязательные на странице тайтла (проверка вёрстки) */
        requiredSelectors() { return []; }

        /** Дополнительная логика сайта. Все ресурсы регистрировать через scope */
        mount(scope) {}
    }

    window.AgProviders = window.AgProviders || { registry: {} };
    window.AgProviders.Scope = Scope;
    window.AgProviders.BaseProvider = BaseProvider;

    /** Регистрация реализации провайдера для платформы ('dle', 'yani', ...) */
    window.AgProviders.register = function (platform, ProviderClass) {
        window.AgProviders.registry[platform] = ProviderClass;
    };
})();
