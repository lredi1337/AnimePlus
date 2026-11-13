// ESLint (flat config). Главное правило — no-undef: именно оно поймало бы
// необъявленные `cachedCover` (пустой Топ на Jut-Su) и `isValidOrigin` (падение обработчика на AnimeGO).
const globals = require('globals');
const fs = require('node:fs');
const path = require('node:path');

// Фоновые скрипты делят одну глобальную область service worker: всё, что объявлено на верхнем уровне файлов
// из importScripts, видно в остальных. Список собирается из самих файлов, поэтому не отстаёт от кода:
// раньше его вели вручную, и забытое имя давало ложную ошибку, а лишнее прятало настоящую
function backgroundSharedNames() {
    const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
    const files = [...read('background.js').match(/importScripts\(([^)]*)\)/)[1].matchAll(/'(?:\.\/)?([^']+)'/g)].map(m => m[1]);
    const names = new Set();
    for (const file of ['background.js', ...files]) {
        const source = read(file);
        // Объявления в начале строки — верхний уровень файла: вложенный код в проекте всегда с отступом
        for (const m of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1] || m[2]);
        // Общие модули из modules/shared и credentials.js выставляют себя присваиванием: root.AgSites = …
        for (const m of source.matchAll(/^\s*(?:root|globalThis|_globalScope)\.([A-Z][\w$]*)\s*=/gm)) names.add(m[1]);
    }
    return names;
}
const backgroundShared = Object.fromEntries([...backgroundSharedNames()].map(name => [name, 'writable']));

module.exports = [
    {
        ignores: ['node_modules/**', 'assets/**', 'icons/**', 'store-screenshots/**']
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
