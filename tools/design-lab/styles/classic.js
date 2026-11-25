// Стиль «Классический»: нынешний вид Anime+ (цвета modules/shared/tokens.css, системный шрифт).
// Своих страниц у него нет: все страницы — общие из pages.js, вид задают переменные в classic.css
window.LAB.variants.push({
    id: 'classic',
    name: 'Классический',
    tagline: 'Нынешний вид Anime+: спокойный тёмный интерфейс с красным акцентом. Теперь и в светлом варианте.',
    fonts: 'Системный (Segoe UI)',
    swatch: ['#0f1218', '#ef4444', '#1f242e'],
    native: 'dark'
});
