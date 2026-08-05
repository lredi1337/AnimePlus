// Пример файла конфигурации credentials
// Скопируйте этот файл в credentials.js и укажите ваши данные
const _globalScope = typeof window !== 'undefined' ? window : globalThis;
_globalScope.SHIKI_CREDENTIALS = {
    client_id: "YOUR_SHIKIMORI_CLIENT_ID",
    worker_url: "" // Если развернут Cloudflare Worker, укажите URL здесь
};
