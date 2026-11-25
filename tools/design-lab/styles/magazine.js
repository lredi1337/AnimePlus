// Стиль 2. «Журнал»: светлая печатная вёрстка, крупный заголовок, колонки текста, контактный лист кадров
window.LAB.variants.push({
    id: 'magazine',
    name: 'Журнал',
    tagline: 'Светлая печатная вёрстка: крупные заголовки, текст в колонках, рейтинг как таблица в журнале.',
    fonts: 'Unbounded + Literata',
    swatch: ['#f3f3ef', '#e11d2a', '#111111'],
    native: 'light',

    // Шаблоны общие с расширением: modules/looks/magazine.js
    random: (ctx, h) => window.AgLookPages.styles.magazine.random(ctx, h),
    top: (ctx, h) => window.AgLookPages.styles.magazine.top(ctx, h)
});
