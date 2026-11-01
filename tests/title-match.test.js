// Общая логика сравнения названий (modules/shared/title-match.js).
// Кейсы взяты из реальной выдачи Jut-Su и данных Shikimori (проверено 01.11.2026)
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadInContext } = require('./helpers');

const { AgTitleMatch: M } = loadInContext(['modules/shared/title-match.js']);

test('normalize: регистр, пунктуация, ё', () => {
    assert.equal(M.normalize('Re:Zero. Жизнь с нуля — Ёж!'), 're zero жизнь с нуля еж');
    assert.equal(M.normalize(null), '');
});

test('extractSeason: разные форматы', () => {
    const cases = {
        'Магическая битва 2': 2,
        'Jujutsu Kaisen 2nd Season': 2,
        'Тетрадь смерти': null,
        'Наруто ТВ-2': 2,
        'Overlord III': 3,
        'Shingeki no Kyojin Season 3 Part 2': 3,
        'https://jut-su.net/2628-magicheskaja-bitva-2-b2.html': null,
        'Ван-Пис': null
    };
    for (const [input, expected] of Object.entries(cases)) {
        assert.equal(M.extractSeason(input), expected, input);
    }
});

const jjkCards = [
    { href: 'https://jut-su.net/67-magicheskaja-bitva-r1.html', title: 'Магическая битва', year: '2020' },
    { href: 'https://jut-su.net/2628-magicheskaja-bitva-2-b2.html', title: 'Магическая битва 2', year: '2023' },
    { href: 'https://jut-su.net/100-magicheskaja-bitva-0.html', title: 'Магическая битва 0. Фильм', year: '2021' }
];

test('pickBest: первый сезон по русскому названию и году', () => {
    const best = M.pickBest(jjkCards, { titles: ['Магическая битва', 'Jujutsu Kaisen'], year: '2020' });
    assert.equal(best.href, jjkCards[0].href);
});

test('pickBest: второй сезон по номеру и году', () => {
    const best = M.pickBest(jjkCards, { titles: ['Магическая битва 2', 'Jujutsu Kaisen 2nd Season'], year: '2023' });
    assert.equal(best.href, jjkCards[1].href);
});

test('pickBest: единственный результат по английскому названию принимается', () => {
    const cards = [{ href: 'https://jut-su.net/6030-van-pis-pismo-ot-poklonnika.html', title: 'Ван-Пис: Письмо от поклонника', year: '2024' }];
    const best = M.pickBest(cards, { titles: ['One Piece Fan Letter'], year: '2024' });
    assert.equal(best && best.href, cards[0].href);
});

test('pickBest: единственный результат с другим годом отклоняется', () => {
    const cards = [{ href: 'https://jut-su.net/1-x.html', title: 'Совсем другое аниме', year: '2010' }];
    assert.equal(M.pickBest(cards, { titles: ['One Piece Fan Letter'], year: '2024' }), null);
});

test('pickBest: несколько несовпадающих результатов → null', () => {
    const cards = [
        { href: 'https://jut-su.net/1-a.html', title: 'Аниме А', year: '' },
        { href: 'https://jut-su.net/2-b.html', title: 'Аниме Б', year: '' }
    ];
    assert.equal(M.pickBest(cards, { titles: ['Несуществующее'] }), null);
});

test('pickBest: minScore для автоперехода со страницы поиска', () => {
    const cards = jjkCards.slice(0, 2);
    // Частичное совпадение без года не дотягивает до 250 → автоперехода нет
    assert.equal(M.pickBest(cards, { titles: ['битва'] }, { minScore: 250 }), null);
});

test('pickBest: основной тайтл важнее спецвыпусков с тем же началом названия', () => {
    const cards = [
        { title: 'Стальной алхимик: Братство — Спецвыпуски', href: '/2327-specvypuski.html' },
        { title: 'Стальной алхимик: Братство (Ремейк, 2009)', href: '/52-bratstvo.html' }
    ];
    assert.equal(M.pickBest(cards, { titles: ['Стальной алхимик: Братство'] }).href, '/52-bratstvo.html');
    assert.equal(M.pickBest(cards, { titles: ['Стальной алхимик: Братство — Спецвыпуски'] }).href, '/2327-specvypuski.html');
});

test('isSameTitle: общее начало — не совпадение, запись сезона может отличаться', () => {
    assert.equal(M.isSameTitle('Монолог фармацевта', 'Монолог фармацевта: Сокровище покойной наложницы'), false);
    assert.equal(M.isSameTitle('Монолог фармацевта', 'Монолог фармацевта 2'), false);
    assert.equal(M.isSameTitle('Bakuman. 3rd Season', 'Bakuman Season 3'), true);
    assert.equal(M.isSameTitle('Гинтама 2', 'Гинтама 2'), true);
});

test('isSameTitle: пометки сайта не мешают, фильм не подменяет сериал', () => {
    assert.equal(M.isSameTitle('Стальной алхимик: Братство (Ремейк, 2009)', 'Стальной алхимик: Братство'), true);
    assert.equal(M.isSameTitle('Гинтама (4 сезон)', 'Гинтама 4'), true);
    assert.equal(M.isSameTitle('Клинок: Бесконечный поезд', 'Клинок: Бесконечный поезд. Фильм'), true);
    assert.equal(M.isSameTitle('Монолог фармацевта. Фильм', 'Монолог фармацевта'), false);
    assert.equal(M.isSameTitle('Тетрадь смерти', 'Тетрадь смерти: Перезапись'), false);
});

test('findSameTitle: другой год отсеивается, совпавший год идёт первым', () => {
    const cards = [{ title: 'Ван-Пис', year: '2027', href: '/remake' }, { title: 'Ван-Пис', year: '1999', href: '/old' }];
    assert.deepEqual(M.findSameTitle(cards, { titles: ['Ван-Пис'], year: '1999' }).map(c => c.href), ['/old']);
    assert.equal(M.findSameTitle(cards, { titles: ['Ван-Пис: Героини'], year: '1999' }).length, 0);
});
