// ESLint (flat config). Главное правило — no-undef: именно оно поймало бы
// необъявленные `cachedCover` (пустой Топ на Jut-Su) и `isValidOrigin` (падение обработчика на AnimeGO).
const globals = require('globals');

// Функции и константы, которые фоновые скрипты делят через importScripts (общая глобальная область service worker)
const backgroundShared = Object.fromEntries([
    'AgTitleMatch', 'AgSites', 'AgKodikMarks', 'SHIKI_CREDENTIALS',
    'SITE_URL_CACHE_TTL', 'stripTags', 'parseDleSearchCards', 'searchDleSite', 'searchYaniSite', 'resolveSiteUrl', 'resolveAllSites', 'resolveShikiIdFromRedirect',
    'CACHE_TTL_MS', 'SHIKI_API_BASE', 'SHIKI_API_DOMAINS', 'SHIKI_APP_USER_AGENT',
    'SHIKI_ID_CACHE_TTL', 'SHIKI_POSTER_MISS_TTL', 'SHIKI_POSTER_TTL', 'SHIKI_REDIRECT_URI',
    'absoluteShikiUrl', 'addToWatchHistory', 'bumpTodayCounter', 'cachedScheduleData', 'cachedScheduleTime',
    'shikiRateFetch', 'syncShikiProgress', 'noteDiag', 'diagSummary', 'cleanDiagText',
    'ensureRetryAlarm', 'exchangeShikiCode', 'fetchShikimoriApi', 'fillShikiPosters',
    'findAnimeGoDirectUrl', 'findJutsuDirectUrl', 'getCacheKey', 'getDirectUrlFromCache', 'getShikiPosters',
    'getShikiTokens', 'getShikiWatchingList', 'isChineseAnime', 'isMissingShikiPoster', 'localDateKey', 'logoutShiki',
    'postShikiOAuthToken', 'refreshShikiToken', 'resolveShikimoriId', 'searchShikimoriAnime', 'setDirectUrlInCache',
    'getAudioFingerprints', 'getRemoteConfig', 'getSharedTimings', 'reportAudioTiming', 'getEpisodePrints', 'saveEpisodePrint', 'pruneAudioCache',
    'SHIKI_CLIENT_ID', 'beginShikiAuth', 'completeShikiAuth', 'isShikiAuthExpected', 'isShikiCodeInProgress', 'shikiAuthCodeFromUrl',
    'getShikiStatus', 'resetTodayCount', 'getShikiRelated', 'getOngoingSchedule', 'resolveJutsuCover', 'getRandomShikimoriAnime',
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
        files: ['tests/**/*.js', 'tools/**/*.js', 'eslint.config.js'],
        languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } }
    },
    {
        files: ['server/**/*.js'],
        languageOptions: { sourceType: 'module', globals: { ...globals.serviceworker } }
    },
    {
        files: ['modules/audio/fingerprint.js', 'modules/audio/lookahead.js', 'modules/audio/repeat-finder.js', 'modules/player/shell.js', 'modules/player/shell-view.js', 'modules/player/adapters.js', 'modules/shared/kodik-marks.js', 'modules/shared/guide.js', 'modules/shared/guide-fox.js', 'modules/shared/player-choice.js'],
        languageOptions: { globals: { module: 'writable' } }
    }
];
