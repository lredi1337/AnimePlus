// Сообщения зрителей из расширения и со страницы поддержки: сервер проверяет их и пересылает на почту поддержки.
// Текст и контакт в базе не хранятся. Для ограничений остаются только необратимые хэши и время отправки.
// Адрес получателя в секрете FEEDBACK_TO: репозиторий открытый, а адрес незачем показывать спамерам.

const MAIL_FROM = 'Anime+ <onboarding@resend.dev>';
const MIN_LEN = 10;
const MAX_LEN = 2000;
const MAX_CONTACT = 120;
const MAX_DIAG = 4000;
const MAX_BODY = 10000;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
const KEEP_MS = 2 * DAY_MS;

export const HOUR_LIMIT = 3;
export const DAY_LIMIT = 5;
// Меньше дневного лимита почтового сервиса: даже атака с множества адресов его не исчерпает
export const TOTAL_DAY_LIMIT = 50;

const KIND_TITLES = { bug: 'ошибка', idea: 'идея' };
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const EMAIL = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/;

/** Проверка сообщения: возвращает чистые данные или null */
export function validateFeedback(body) {
    if (!body || typeof body !== 'object') return null;
    const kind = Object.hasOwn(KIND_TITLES, body.kind) ? body.kind : null;
    if (!kind || typeof body.message !== 'string') return null;
    const message = body.message.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim();
    if (message.length < MIN_LEN || message.length > MAX_LEN) return null;
    const contact = typeof body.contact === 'string' ? body.contact.replace(/\s+/g, ' ').replace(CONTROL_CHARS, '').trim() : '';
    if (contact.length > MAX_CONTACT) return null;
    const version = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(body.version) ? body.version : '';
    const diag = typeof body.diag === 'string' ? body.diag.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim().slice(0, MAX_DIAG) : '';
    return { kind, message, contact, version, diag };
}

/** Что мешает отправке: same — повтор, limit — лимит человека, busy — общий лимит, null — можно */
export function checkLimits(rows, reporter, digest, now = Date.now()) {
    const own = rows.filter(r => r.reporter === reporter);
    if (own.some(r => r.digest === digest)) return 'same';
    if (own.length >= DAY_LIMIT || own.filter(r => now - r.ts < HOUR_MS).length >= HOUR_LIMIT) return 'limit';
    if (rows.length >= TOTAL_DAY_LIMIT) return 'busy';
    return null;
}

/** Письмо только обычным текстом: присланное не может стать разметкой или ссылкой-ловушкой */
export function buildEmail({ kind, message, contact, version, diag }, to, { fromSite = false } = {}) {
    const firstLine = message.split('\n')[0].slice(0, 60);
    // Со страницы поддержки версии и сведений о работе нет: сайт их не знает
    const source = fromSite ? 'Отправлено со страницы поддержки' : `Версия Anime+: ${version || 'неизвестна'}`;
    const mail = {
        from: MAIL_FROM,
        to: [to],
        subject: `Anime+, ${KIND_TITLES[kind]}: ${firstLine}`,
        text: `${message}\n\n---\n${source}\nКонтакт: ${contact || 'не указан'}\n${diag ? `\nСведения о работе:\n${diag}\n` : ''}`
    };
    if (EMAIL.test(contact)) mail.reply_to = contact;
    return mail;
}

const sha256 = async (text) => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
};

/** Возвращает { status, body } для ответа расширению или странице поддержки */
export async function handleFeedback(request, env, { fromSite = false } = {}) {
    if (env.FEEDBACK_OFF === '1' || !env.RESEND_API_KEY || !env.FEEDBACK_TO) return { status: 503, body: { error: 'off' } };

    const raw = await request.text();
    if (raw.length > MAX_BODY) return { status: 400, body: { error: 'bad message' } };
    let body = null;
    try { body = JSON.parse(raw); } catch (e) {}
    // Поле-ловушка: человек его не видит. Боту отвечаем как обычно, чтобы он не искал обход
    if (body && body.website) return { status: 200, body: { ok: true } };
    const feedback = validateFeedback(body);
    if (!feedback) return { status: 400, body: { error: 'bad message' } };

    const now = Date.now();
    const reporter = await sha256(`${env.REPORT_SALT}|feedback|${request.headers.get('CF-Connecting-IP') || ''}`);
    const digest = await sha256(`${reporter}|${feedback.message}`);
    const { results } = await env.DB.prepare('SELECT reporter, digest, ts FROM feedback_log WHERE ts > ?').bind(now - DAY_MS).all();
    const blocked = checkLimits(results, reporter, digest, now);
    if (blocked === 'same') return { status: 200, body: { ok: true } };
    if (blocked) return { status: 429, body: { error: blocked } };

    const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEmail(fromSite ? { ...feedback, diag: '' } : feedback, env.FEEDBACK_TO, { fromSite })),
        signal: AbortSignal.timeout(8000)
    });
    if (!sent.ok) return { status: 502, body: { error: 'mail' } };

    await env.DB.batch([
        env.DB.prepare('INSERT INTO feedback_log (reporter, digest, ts) VALUES (?, ?, ?)').bind(reporter, digest, now),
        env.DB.prepare('DELETE FROM feedback_log WHERE ts < ?').bind(now - KEEP_MS)
    ]);
    return { status: 200, body: { ok: true } };
}
