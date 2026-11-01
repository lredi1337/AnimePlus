// providers/yani.js
// Провайдер платформы YummyAnime (old.yummyani.me — серверная вёрстка, ru.yummyani.me — React SPA).
// Обе версии работают поверх одного JSON API:
//   GET /api/anime/{slug}?need_videos=true → remote_ids.shikimori_id, other_titles, year, type,
//       videos[{ number, iframe_url, skips: { opening: {time, length}, ending: {...} } }]
// Классы вёрстки обфусцированы (Y56k, pQCG…) и меняются при каждой сборке, поэтому:
//   - номер серии берём из параметра episode= в URL iframe Kodik (сайт меняет src при выборе серии);
//   - список серий ищем структурно: контейнер, все дочерние элементы которого — числа;
//   - ID Shikimori — из API (или из ссылки shikimori.*/animes/{id} на странице).

(function () {
    'use strict';

    const { BaseProvider } = window.AgProviders;

    const slugFromPath = () => (location.pathname.match(/^\/catalog\/item\/([^/?#]+)/) || [])[1] || null;

    const findKodikFrame = () => Array.from(document.querySelectorAll('iframe'))
        .find(f => /kodik/i.test(f.src || '')) || null;

    // Кнопки серий. ru.yummyani.me: [role="button"][data-selected] (обёртка div + кнопка «просмотрено»);
    // old.yummyani.me: контейнер, все дочерние элементы которого — числа
    const findEpisodeButtons = () => {
        const semantic = Array.from(document.querySelectorAll('[role="button"][data-selected]')).filter(b => /^\d+$/.test(b.textContent.trim()));
        if (semantic.length) return semantic;
        const list = Array.from(document.querySelectorAll('div, ul'))
            .find(el => el.children.length >= 2 && Array.from(el.children).every(c => c.children.length === 0 && /^\d+$/.test(c.textContent.trim())));
        return list ? Array.from(list.children) : [];
    };

    class YaniProvider extends BaseProvider {
        constructor(site, settings) {
            super(site, settings);
            this.apiPromise = null;
            this.apiSlug = null;
            this.msgEpisode = null;
        }

        isTitlePage() {
            return !!slugFromPath();
        }

        loadApi() {
            const slug = slugFromPath();
            if (!slug) return Promise.resolve(null);
            if (this.apiPromise && this.apiSlug === slug) return this.apiPromise;
            this.apiSlug = slug;
            this.apiPromise = fetch(`/api/anime/${encodeURIComponent(slug)}?need_videos=true`, { credentials: 'omit' })
                .then(r => r.ok ? r.json() : null)
                .then(j => (j && j.response) || null)
                .catch(() => null);
            return this.apiPromise;
        }

        async getTitleInfo() {
            const slug = slugFromPath();
            if (!slug) return null;
            const api = await this.loadApi();

            // Резерв без API: ссылка на Shikimori прямо на странице
            let shikimoriId = api?.remote_ids?.shikimori_id || null;
            if (!shikimoriId) {
                const link = Array.from(document.querySelectorAll('a[href*="shikimori."]')).find(a => /\/animes\/[a-z]?\d+/i.test(a.href) && !/oauth/.test(a.href));
                const m = link && link.href.match(/\/animes\/[a-z]?(\d+)/i);
                if (m) shikimoriId = parseInt(m[1], 10);
            }

            const h1 = (document.querySelector('h1')?.innerText || '').trim();
            const title = api?.title || h1;
            const titles = [...new Set([title, h1, ...(api?.other_titles || [])].filter(Boolean))];

            return {
                pageKey: `${this.site.id}:${slug}`,
                title: h1 || title,
                origTitle: (api?.other_titles || []).find(t => /^[\x20-\x7e]+$/.test(t)) || title,
                titles,
                year: api?.year ? String(api.year) : '',
                kind: api?.type?.alias || '',
                shikimoriId: shikimoriId ? parseInt(shikimoriId, 10) : null,
                totalEpisodes: api?.episodes?.count || 0
            };
        }

        getEpisode(msgEpisode) {
            // Активная серия в списке сайта — меняется сразу по клику, ещё до загрузки нового iframe
            const selected = document.querySelector('[role="button"][data-selected="1"]');
            if (selected && /^\d+$/.test(selected.textContent.trim())) return selected.textContent.trim();
            const frame = findKodikFrame();
            if (frame) {
                try {
                    const ep = new URL(frame.src).searchParams.get('episode');
                    if (ep) return ep;
                } catch (e) {}
            }
            if (msgEpisode && msgEpisode !== '0') this.msgEpisode = String(msgEpisode);
            return this.msgEpisode || '1';
        }

        getPlayerContainer() {
            const frame = findKodikFrame();
            return frame ? (frame.parentElement?.parentElement || frame.parentElement) : null;
        }

        getPlayerWindows() {
            const frame = findKodikFrame();
            return frame && frame.contentWindow ? [frame.contentWindow] : [];
        }

        // Плеер выбирает сам сайт (React-селект «Плеер Kodik»); вмешиваться не нужно
        selectPreferredPlayer() { return true; }

        navigate(dir) {
            const buttons = findEpisodeButtons();
            if (!buttons.length) return false;
            const current = parseInt(this.getEpisode(), 10) || 1;
            const target = dir === 'next' ? current + 1 : current - 1;
            const btn = buttons.find(c => c.textContent.trim() === String(target));
            if (!btn) return false;
            btn.click();
            return true;
        }

        // Таймкоды опенинга/эндинга есть прямо в API сайта — точнее, чем AniSkip
        async getSkipData(episode) {
            const api = await this.loadApi();
            const videos = (api?.videos || []).filter(v => String(v.number) === String(episode) && v.skips);
            const src = findKodikFrame()?.src || '';
            const video = videos.find(v => v.iframe_url && src.includes(v.iframe_url.replace(/^https?:/, '').split('?')[0])) || videos.find(v => v.skips.opening || v.skips.ending);
            if (!video) return null;
            const toRange = (s) => s ? { start: s.time, end: s.time + s.length } : { start: 0, end: 0 };
            return { op: toRange(video.skips.opening), ed: toRange(video.skips.ending) };
        }

        getTitleAnchor() {
            return document.querySelector('h1')?.parentElement || null;
        }

        getNavAnchor() {
            const top = document.querySelector('nav a[href="/catalog/top"], a[href="/catalog/top"]');
            return top ? (top.closest('li, [data-variant], nav > div, .fM') || top) : null;
        }

        getSettingsAnchor() {
            // ru.yummyani.me (React SPA): ссылка «Настройки» в выпадающем меню профиля .db
            const ru = document.querySelector('.db a[href="#settings"], a[data-hotkey-id="settings"], a[href="#settings"]');
            if (ru) return ru;

            // old.yummyani.me: навигационное меню <ul class="menu">
            const menu = document.querySelector('ul.menu');
            if (menu) {
                return menu.querySelector('li.sub-menu-link:last-of-type')
                    || Array.from(menu.querySelectorAll('li:not(.ag-settings-menu-wrapper)')).pop()
                    || null;
            }

            return null;
        }

        // ru.yummyani.me: пункты шапки сжимаются (flex-shrink:1, min-width:0), а подписи не переносятся —
        // лишний пункт наезжает на соседние. Поэтому «Топ Shikimori» живёт в выпадающем меню «АНИМЕ»
        getTopMenuSample() {
            return document.querySelector('header .db a[href="/catalog/schedule"]');
        }

        getProfileNavItem() {
            const link = document.querySelector('header nav [data-variant="top"] a[data-hotkey-id="profile"]');
            return link ? link.closest('[data-variant]') : null;
        }

        requiredSelectors() {
            return [['title', ['h1']]];
        }

        mount(scope) {
            this.msgEpisode = null;
        }
    }

    window.AgProviders.register('yani', YaniProvider);
})();
