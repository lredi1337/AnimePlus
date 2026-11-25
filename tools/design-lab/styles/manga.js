// Стиль 3. «Манга»: страница из панелей, растр, облачко реплики, оценка красной печатью
window.LAB.variants.push({
    id: 'manga',
    name: 'Манга',
    tagline: 'Страница манги: панели с чёрной обводкой, растр, облачко с названием и красная печать с оценкой.',
    fonts: 'Rubik (900 для заголовков)',
    swatch: ['#ffffff', '#d7262e', '#151515'],
    native: 'light',

    // Шаблоны общие с расширением: modules/looks/manga.js
    random: (ctx, h) => window.AgLookPages.styles.manga.random(ctx, h),
    top: (ctx, h) => window.AgLookPages.styles.manga.top(ctx, h)
});
