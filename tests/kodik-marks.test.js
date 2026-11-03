// Метки Kodik для других плееров: разбор страницы и выбор нужной серии и озвучки
const { test } = require('node:test');
const assert = require('node:assert');
const marks = require('../modules/shared/kodik-marks.js');

const SERIAL = (selected) => `
<style>.serial-seasons-box select, .serial-series-box select, .serial-translations-box select { color: red; }</style>
<div class="serial-seasons-box"><select><option value="1" data-title="1 сезон" selected="selected">1</option></select></div>
<div class="serial-translations-box"><select>
    <option value="1" data-title="AniLibria.TV" data-media-type="serial" data-media-id="10" data-media-hash="aa" ${selected === 'lib' ? 'selected="selected"' : ''}>AniLibria.TV (12 эп.)</option>
    <option value="2" data-title="AniStar &amp; DEEP" data-media-type="serial" data-media-id="20" data-media-hash="bb" ${selected === 'deep' ? 'selected="selected"' : ''}>x</option>
</select></div>
<div class="serial-series-box"><select>
    <option value="1" data-id="101" data-hash="s1" data-title="1 серия" selected="selected">1</option>
    <option value="2" data-id="102" data-hash="s2" data-title="2 серия">2</option>
</select></div>`;

test('метки разбираются из страницы плеера, короткие отбрасываются', () => {
    assert.deepStrictEqual(marks.parseMarks('parseSkipButton("00:13-01:43,22:53-24:23", "anime")'), [{ start: 13, end: 103 }, { start: 1373, end: 1463 }]);
    assert.deepStrictEqual(marks.parseMarks('parseSkipButton("00-01:30,24:20-24:30", "anime")'), [{ start: 0, end: 90 }]);
    assert.deepStrictEqual(marks.parseMarks('parseSkipButton("[opening]0-89,[ending]1453-1552", "anime")'), [{ start: 0, end: 89 }, { start: 1453, end: 1552 }]);
    assert.deepStrictEqual(marks.parseMarks('<html></html>'), []);
});

test('одна и та же озвучка в разных плеерах пишется по-разному, а разные озвучки не смешиваются', () => {
    assert.strictEqual(marks.voiceKey('AniLibria.TV'), marks.voiceKey('Anilibria'));
    assert.strictEqual(marks.voiceKey('(Russian) Anilibriatv'), marks.voiceKey('AniLibria'));
    assert.strictEqual(marks.voiceKey('Дубляж Flarrow Films'), marks.voiceKey('Flarrow Films'));
    assert.notStrictEqual(marks.voiceKey('AniStar'), marks.voiceKey('AniStar & DEEP'));
});

test('метки берутся у той серии и той озвучки, которую смотрят', async () => {
    const asked = [];
    const pages = {
        'https://kodikplayer.com/serial/1/x/720p': SERIAL('deep'),
        'https://kodikplayer.com/serial/10/aa/720p': SERIAL('lib'),
        'https://kodikplayer.com/seria/102/s2/720p': 'parseSkipButton("01:00-02:30,20:00-21:30", "anime")'
    };
    const fetchPage = async (u) => { asked.push(u); return pages[u] || ''; };
    const found = await marks.find({ url: 'https://kodikplayer.com/serial/1/x/720p', episode: '2', voice: 'Anilibria' }, fetchPage);
    assert.deepStrictEqual(found, [{ start: 60, end: 150 }, { start: 1200, end: 1290 }]);
    assert.deepStrictEqual(asked, Object.keys(pages));
    // Второй раз сеть не нужна
    await marks.find({ url: 'https://kodikplayer.com/serial/1/x/720p', episode: '2', voice: 'Anilibria' }, fetchPage);
    assert.strictEqual(asked.length, 3);
});

test('такой озвучки у Kodik нет: чужие метки не подставляются', async () => {
    const found = await marks.find({ url: 'https://kodikplayer.com/serial/2/x/720p', episode: '1', voice: 'LostFilm' }, async () => SERIAL('lib'));
    assert.deepStrictEqual(found, []);
});

test('плеер на одну серию: метки на самой странице', async () => {
    const found = await marks.find({ url: '//kodikplayer.com/seria/5/h/720p', episode: '1', voice: 'AniDUB' }, async () => 'parseSkipButton("00:10-01:40", "anime")');
    assert.deepStrictEqual(found, [{ start: 10, end: 100 }]);
});

test('загружаются только страницы Kodik', async () => {
    let asked = 0;
    const found = await marks.find({ url: 'https://evil.example/serial/1/x/720p', episode: '1', voice: 'a' }, async () => { asked++; return ''; });
    assert.deepStrictEqual(found, []);
    assert.strictEqual(asked, 0);
});

test('до середины серии опенинг, после эндинг', () => {
    assert.deepStrictEqual(marks.splitMarks([{ start: 1373, end: 1463 }, { start: 13, end: 103 }], 1500), { op: { start: 13, end: 103 }, ed: { start: 1373, end: 1463 } });
});
