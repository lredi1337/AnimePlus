// content-sites.js
// Точка входа для сайтов, подключённых через провайдеры (providers/*.js):
// YummyAnime (old/ru), YummyAnime.TV, AnimeGO.online, YummyAnime.Club.
// AnimeGO.me и Jut-Su запускаются своими точками входа (content-animego.js, content-jutsu.js).
window.AgProviders.start().catch(e => console.error('[Anime+] provider runtime:', e));
