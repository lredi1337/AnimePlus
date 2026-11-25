// Стиль 1. «Кинозал»: кадр тайтла на весь экран, крупная типографика, всё внимание — изображению
window.LAB.variants.push({
    id: 'cinema',
    name: 'Кинозал',
    tagline: 'Кадр тайтла на весь экран, крупное название, плёнка кадров. Ощущение стримингового сервиса.',
    fonts: 'Geologica + Golos Text',
    swatch: ['#06070a', '#ef4444', '#f5c86a'],
    native: 'dark',

    // Шаблоны общие с расширением: modules/looks/cinema.js
    random: (ctx, h) => window.AgLookPages.styles.cinema.random(ctx, h),
    top: (ctx, h) => window.AgLookPages.styles.cinema.top(ctx, h)
});
