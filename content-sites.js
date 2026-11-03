// content-sites.js
// Точка входа для сайтов, подключённых через провайдеры (providers/*.js):
// Все сайты подключены через провайдеры (modules/shared/sites.js, providers/*.js).
window.AgProviders.start().catch(e => console.error('[Anime+] provider runtime:', e));
