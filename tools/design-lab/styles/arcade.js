// Стиль 4. «Аркада»: игровой автомат — барабан постеров, неон, таблица рекордов вместо Топа
window.LAB.variants.push({
    id: 'arcade',
    name: 'Аркада',
    tagline: 'Игровой автомат: «Случайное» крутит барабан, Топ — таблица рекордов. Неон, пиксельные цифры, игровая подача.',
    fonts: 'Press Start 2P (цифры и метки) + Exo 2',
    swatch: ['#0b0720', '#22d3ee', '#f472b6'],
    native: 'dark',

    // Шаблоны общие с расширением: modules/looks/arcade.js
    random: (ctx, h) => window.AgLookPages.styles.arcade.random(ctx, h),
    top: (ctx, h) => window.AgLookPages.styles.arcade.top(ctx, h)
});
