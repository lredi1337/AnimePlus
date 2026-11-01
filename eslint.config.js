// ESLint (flat config). Главное правило — no-undef: именно оно поймало бы
// необъявленные `cachedCover` (пустой Топ на Jut-Su) и `isValidOrigin` (падение обработчика на AnimeGO).
const globals = require('globals');

// Функции и константы, которые фоновые скрипты делят через importScripts (общая глобальная область service worker)
const backgroundShared = Object.fromEntries([
    'AgTitleMatch', 'AgSites', 'SHIKI_CREDENTIALS',
    'SITE_URL_CACHE_TTL', 'stripTags', 'parseDleSearchCards', 'searchDleSite', 'searchYaniSite', 'resolveSiteUrl', 'resolveAllSites', 'resolveShikiIdFromRedirect',
    'CACHE_TTL_MS', 'EPISODES_ALARM', 'SHIKI_API_BASE', 'SHIKI_API_DOMAINS', 'SHIKI_APP_USER_AGENT',
    'SHIKI_ID_CACHE_TTL', 'SHIKI_POSTER_MISS_TTL', 'SHIKI_POSTER_TTL', 'SHIKI_REDIRECT_URI',
    'absoluteShikiUrl', 'addToWatchHistory', 'bumpTodayCounter', 'cachedScheduleData', 'cachedScheduleTime',
    'checkEpisodeAvailabilityOnPortals', 'checkKodikEpisodeAvailability', 'checkNewEpisodeNotifications',
    'cleanupOldNotifications', 'ensureEpisodesAlarm', 'exchangeShikiCode', 'fetchShikimoriApi', 'fillShikiPosters',
    'findAnimeGoDirectUrl', 'findJutsuDirectUrl', 'getCacheKey', 'getDirectUrlFromCache', 'getShikiPosters',
    'getShikiTokens', 'getShikiWatchingList', 'isChineseAnime', 'isMissingShikiPoster', 'localDateKey', 'logoutShiki',
    'openNotificationTarget', 'postShikiOAuthToken', 'refreshShikiToken', 'resolveShikimoriId', 'setDirectUrlInCache',
    'shikiFetch', 'shikiPosterMemo', 'storageWriteQueues', 'toShikiApiUrl', 'updateShikiUserRate', 'updateStorageObject'
].map(name => [name, 'writable']));

module.exports = [
    {
        ignores: ['node_modules/**', 'assets/**', 'icons/**']
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'script',
            globals: { ...globals.browser, ...globals.webextensions }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
            'no-redeclare': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            'no-const-assign': 'error',
            'no-self-assign': 'error',
            'eqeqeq': ['warn', 'smart'],
            'no-empty': ['warn', { allowEmptyCatch: true }]
        }
    },
    {
        // Service worker и модули, подключаемые через importScripts
        files: ['background.js', 'credentials.js', 'modules/bg-*.js', 'modules/shared/*.js'],
        languageOptions: {
            globals: { ...globals.serviceworker, ...globals.webextensions, ...backgroundShared }
        },
        rules: {
            // Эти файлы объявляют общие функции друг для друга — «неиспользуемые» внутри одного файла ожидаемы
            'no-unused-vars': 'off',
            'no-redeclare': 'off'
        }
    },
    {
        files: ['tests/**/*.js', 'eslint.config.js'],
        languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }
    }
];
