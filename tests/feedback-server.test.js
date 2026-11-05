// Сообщения зрителей на сервере: проверка, ограничения от спама и письмо на почту поддержки
const test = require('node:test');
const assert = require('node:assert');

const load = () => import('../server/timings/src/feedback.js');
const good = { kind: 'bug', message: 'Не работает пропуск на второй серии', contact: 'a@b.ru', version: '10.1.3' };

function makeEnv(rows = [], extra = {}) {
    const log = rows.map(r => ({ ...r }));
    const prepare = (sql) => ({
        bind: (...args) => ({
            all: async () => ({ results: log.filter(r => r.ts > args[0]) }),
            run: () => {
                if (/^INSERT/.test(sql)) log.push({ reporter: args[0], digest: args[1], ts: args[2] });
                if (/^DELETE/.test(sql)) log.splice(0, log.length, ...log.filter(r => r.ts >= args[0]));
            }
        })
    });
    return {
        log,
        env: {
            RESEND_API_KEY: 'key', REPORT_SALT: 'salt', FEEDBACK_TO: 'support@example.test',
            DB: { prepare, batch: async (list) => list.forEach(s => s.run()) },
            ...extra
        }
    };
}

const post = (body, ip = '1.1.1.1') => new Request('https://x.test/v1/feedback', {
    method: 'POST',
    headers: { 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body)
});

async function withMail(status, run) {
    const real = globalThis.fetch;
    const mails = [];
    globalThis.fetch = async (url, options) => {
        mails.push({ url, auth: options.headers.Authorization, mail: JSON.parse(options.body) });
        return new Response('{}', { status });
    };
    try {
        return await run(mails);
    } finally {
        globalThis.fetch = real;
    }
}

test('проверка отбрасывает пустое, короткое, длинное и неизвестный тип', async () => {
    const { validateFeedback } = await load();
    assert.ok(validateFeedback(good));
    assert.strictEqual(validateFeedback(null), null);
    assert.strictEqual(validateFeedback({ ...good, kind: 'x' }), null);
    assert.strictEqual(validateFeedback({ ...good, kind: 'constructor' }), null);
    assert.strictEqual(validateFeedback({ ...good, message: 'мало' }), null);
    assert.strictEqual(validateFeedback({ ...good, message: 'я'.repeat(2001) }), null);
    assert.strictEqual(validateFeedback({ ...good, message: 42 }), null);
    assert.strictEqual(validateFeedback({ ...good, contact: 'к'.repeat(121) }), null);
    assert.strictEqual(validateFeedback({ ...good, version: '<b>' }).version, '');
});

test('письмо: только текст, контакт-почта становится адресом ответа', async () => {
    const { validateFeedback, buildEmail } = await load();
    const mail = buildEmail(validateFeedback(good), 'support@example.test');
    assert.deepStrictEqual(mail.to, ['support@example.test']);
    assert.strictEqual(mail.reply_to, 'a@b.ru');
    assert.strictEqual(mail.html, undefined);
    assert.match(mail.subject, /ошибка: Не работает/);
    assert.match(mail.text, /Версия Anime\+: 10\.1\.3/);
    assert.strictEqual(buildEmail(validateFeedback({ ...good, contact: '@viewer' })).reply_to, undefined);
});

test('контакт и текст не могут подставить заголовки письма', async () => {
    const { validateFeedback, buildEmail } = await load();
    const mail = buildEmail(validateFeedback({ ...good, message: 'Строка один длинная\nBcc: evil@x.ru', contact: 'a@b.ru\nBcc: evil@x.ru' }));
    assert.ok(!mail.subject.includes('\n'));
    assert.ok(!mail.subject.includes('Bcc'));
    assert.strictEqual(mail.reply_to, undefined);
});

test('лимиты: повтор, час, день и общий предел', async () => {
    const { checkLimits, HOUR_LIMIT, DAY_LIMIT, TOTAL_DAY_LIMIT } = await load();
    const now = 1e12;
    const own = (n, ago) => Array.from({ length: n }, (_, i) => ({ reporter: 'me', digest: `d${i}`, ts: now - ago }));
    assert.strictEqual(checkLimits([], 'me', 'x', now), null);
    assert.strictEqual(checkLimits(own(1, 1000), 'me', 'd0', now), 'same');
    assert.strictEqual(checkLimits(own(HOUR_LIMIT, 1000), 'me', 'x', now), 'limit');
    assert.strictEqual(checkLimits(own(HOUR_LIMIT, 2 * 3600e3), 'me', 'x', now), null);
    assert.strictEqual(checkLimits(own(DAY_LIMIT, 2 * 3600e3), 'me', 'x', now), 'limit');
    const others = Array.from({ length: TOTAL_DAY_LIMIT }, (_, i) => ({ reporter: `u${i}`, digest: 'd', ts: now - 1000 }));
    assert.strictEqual(checkLimits(others, 'me', 'x', now), 'busy');
    assert.ok(TOTAL_DAY_LIMIT < 100, 'меньше дневного лимита почтового сервиса');
});

test('сообщение уходит на почту, в базе остаются только хэши', async () => {
    const { handleFeedback } = await load();
    const { env, log } = makeEnv();
    await withMail(200, async (mails) => {
        const res = await handleFeedback(post(good), env);
        assert.deepStrictEqual(res, { status: 200, body: { ok: true } });
        assert.strictEqual(mails.length, 1);
        assert.strictEqual(mails[0].auth, 'Bearer key');
    });
    assert.strictEqual(log.length, 1);
    assert.ok(!JSON.stringify(log).includes('пропуск'));
    assert.ok(!JSON.stringify(log).includes('1.1.1.1'));
    assert.ok(!JSON.stringify(log).includes('a@b.ru'));
});

test('четвёртое сообщение за час отклоняется, другой адрес проходит', async () => {
    const { handleFeedback } = await load();
    const { env } = makeEnv();
    await withMail(200, async (mails) => {
        for (let i = 0; i < 3; i++) {
            assert.strictEqual((await handleFeedback(post({ ...good, message: `Сообщение номер ${i} про ошибку` }), env)).status, 200);
        }
        const blocked = await handleFeedback(post({ ...good, message: 'Сообщение номер 4 про ошибку' }), env);
        assert.deepStrictEqual(blocked, { status: 429, body: { error: 'limit' } });
        assert.strictEqual(mails.length, 3);
        const other = await handleFeedback(post({ ...good, message: 'Сообщение другого человека' }, '2.2.2.2'), env);
        assert.strictEqual(other.status, 200);
        assert.strictEqual(mails.length, 4);
    });
});

test('повтор и ловушка получают обычный ответ, но письма нет', async () => {
    const { handleFeedback } = await load();
    const { env } = makeEnv();
    await withMail(200, async (mails) => {
        await handleFeedback(post(good), env);
        assert.deepStrictEqual(await handleFeedback(post(good), env), { status: 200, body: { ok: true } });
        assert.deepStrictEqual(await handleFeedback(post({ ...good, message: 'Купите рекламу прямо сейчас', website: 'spam.ru' }), env), { status: 200, body: { ok: true } });
        assert.strictEqual(mails.length, 1);
    });
});

test('сбой почты не расходует лимит, выключатель и мусор не доходят до отправки', async () => {
    const { handleFeedback } = await load();
    const { env, log } = makeEnv();
    await withMail(500, async () => {
        assert.deepStrictEqual(await handleFeedback(post(good), env), { status: 502, body: { error: 'mail' } });
    });
    assert.strictEqual(log.length, 0);
    await withMail(200, async (mails) => {
        assert.strictEqual((await handleFeedback(post(good), makeEnv([], { FEEDBACK_OFF: '1' }).env)).status, 503);
        assert.strictEqual((await handleFeedback(post(good), makeEnv([], { RESEND_API_KEY: '' }).env)).status, 503);
        assert.strictEqual((await handleFeedback(post(good), makeEnv([], { FEEDBACK_TO: '' }).env)).status, 503);
        assert.strictEqual((await handleFeedback(post('не json'), env)).status, 400);
        assert.strictEqual((await handleFeedback(post('x'.repeat(10001)), env)).status, 400);
        assert.strictEqual(mails.length, 0);
    });
});

test('сервер принимает сообщения по адресу /v1/feedback', async () => {
    const worker = (await import('../server/timings/src/index.js')).default;
    const { env } = makeEnv();
    await withMail(200, async (mails) => {
        const res = await worker.fetch(new Request('https://x.test/v1/feedback', { method: 'POST', headers: { Origin: 'chrome-extension://mgcaideibpbdddnbedoefmabladoaajg' }, body: JSON.stringify(good) }), env, {});
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), 'chrome-extension://mgcaideibpbdddnbedoefmabladoaajg');
        assert.strictEqual(mails.length, 1);
    });
});
