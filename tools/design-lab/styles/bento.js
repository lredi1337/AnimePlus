// Стиль 5. «Плитки»: светлый, мягкий, информация разложена по плиткам; у каждого тайтла свой цвет акцента
window.LAB.variants.push({
    id: 'bento',
    name: 'Плитки',
    tagline: 'Светлый и спокойный: всё о тайтле разложено по плиткам, у каждого тайтла свой цвет. Похоже на современное приложение.',
    fonts: 'Onest',
    swatch: ['#eef0f5', '#6d5cf6', '#ffffff'],
    native: 'light',

    // Шаблоны общие с расширением: modules/looks/bento.js
    random: (ctx, h) => window.AgLookPages.styles.bento.random(ctx, h),
    top: (ctx, h) => window.AgLookPages.styles.bento.top(ctx, h)
});
