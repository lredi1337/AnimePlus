// Сайт для Cloudflare Pages из базы песен: node tools/build-songs-site.js <папка v1> <папка сайта>
// Только файлы песен. config.json с аварийным выключателем остаётся на GitHub: он должен срабатывать сразу, а не после выкладки
const fs = require('node:fs');
const path = require('node:path');

const SONG_FILE = /^\d+\.json$/;
// Файлы читает расширение с чужого адреса. Обновляются раз в сутки, а у расширения свой кэш на месяц
const HEADERS = `/*
  Access-Control-Allow-Origin: *
  Cache-Control: public, max-age=3600
`;
// Без этого файла Pages считает сайт одностраничным приложением и вместо ошибки 404 отвечает страницей:
// расширение приняло бы её за файл песни, а отсутствие файла перестало бы быть видно
const NOT_FOUND = '<!doctype html><title>404</title>\n';

function buildSongsSite(source, target) {
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(path.join(target, 'v1'), { recursive: true });
    let songs = 0;
    for (const name of fs.readdirSync(source)) {
        if (!SONG_FILE.test(name)) continue;
        fs.copyFileSync(path.join(source, name), path.join(target, 'v1', name));
        songs += 1;
    }
    fs.writeFileSync(path.join(target, '_headers'), HEADERS);
    fs.writeFileSync(path.join(target, '404.html'), NOT_FOUND);
    return songs;
}

if (require.main === module) {
    const [source, target] = process.argv.slice(2);
    if (!source || !target) {
        console.error('Запуск: node tools/build-songs-site.js <папка v1> <папка сайта>');
        process.exit(2);
    }
    const songs = buildSongsSite(source, target);
    if (songs === 0) {
        // Пустая выкладка заменила бы рабочий сайт пустым
        console.error('Файлов песен не найдено');
        process.exit(1);
    }
    console.log(`Файлов песен: ${songs}`);
}

module.exports = { buildSongsSite };
