// modules/bg-diag.js
// Журнал сбоев в браузере зрителя. Разработчик видит его, только если зритель сам отправил сообщение в поддержку с этими сведениями.
// Хранится только место сбоя, сайт и короткий текст ошибки: без названий тайтлов, адресов страниц и токенов.

const DIAG_KEY = 'ag_diag_log';
const DIAG_MAX_ENTRIES = 30;
const DIAG_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const DIAG_TEXT_MAX = 200;
let diagQueue = Promise.resolve();

/** От адреса остаётся только сайт: в пути и параметрах бывают названия, коды и токены */
function cleanDiagText(value) {
    return String(value == null ? '' : value)
        .replace(/https?:\/\/([^/\s?#]+)[^\s]*/gi, '$1')
        .replace(/\bBearer\s+\S+/gi, 'Bearer …')
        .replace(/\b(access_token|refresh_token|code|client_secret)=\S+/gi, '$1=…')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, DIAG_TEXT_MAX);
}

function noteDiag(where, detail, host) {
    diagQueue = diagQueue.then(async () => {
        const { [DIAG_KEY]: stored } = await chrome.storage.local.get([DIAG_KEY]);
        const log = Array.isArray(stored) ? stored : [];
        const entry = { where: cleanDiagText(where), detail: cleanDiagText(detail), host: cleanDiagText(host), count: 1, at: Date.now() };
        const known = log.find(e => e.where === entry.where && e.detail === entry.detail && e.host === entry.host);
        if (known) {
            known.count += 1;
            known.at = entry.at;
        } else {
            log.push(entry);
        }
        log.sort((a, b) => a.at - b.at);
        await chrome.storage.local.set({ [DIAG_KEY]: log.slice(-DIAG_MAX_ENTRIES) });
    }).catch(() => {});
    return diagQueue;
}

/** Текст для письма: новые записи сверху, старше двух недель не показываются */
async function diagSummary() {
    const { [DIAG_KEY]: stored } = await chrome.storage.local.get([DIAG_KEY]);
    const cutoff = Date.now() - DIAG_KEEP_MS;
    return (Array.isArray(stored) ? stored : [])
        .filter(e => e.at > cutoff)
        .sort((a, b) => b.at - a.at)
        .map(e => [new Date(e.at).toISOString().slice(0, 16), e.where, e.host, `×${e.count}`, e.detail].filter(Boolean).join(' '))
        .join('\n');
}
