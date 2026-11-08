// Конструктор своих тем оболочки: каждая часть настраивается отдельно (modules/player/shell-view.js)
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const view = require('../modules/player/shell-view.js');

test('проверка значений: битое и чужое заменяется значением по умолчанию, числа в пределах', () => {
    const v = view.cleanValues({
        accent: 'red; background:url(x)', text: '#ABCDEF', bar: 'sideways', radius: -5, rail: 99, barAlpha: 3,
        order: ['skip', 'clock'], hide: ['settings'], labels: 'yes', extra: 1
    });
    assert.equal(v.accent, view.DEFAULTS.accent);
    assert.equal(v.text, '#abcdef');
    assert.equal(v.bar, 'full');
    assert.equal(v.radius, 0);
    assert.equal(v.rail, 8);
    assert.equal(v.barAlpha, 1);
    assert.deepEqual(v.order, view.BAR_ITEMS.map(x => x.id), 'порядок должен содержать все кнопки ровно по разу');
    assert.deepEqual(v.hide, [], '«Настройки» спрятать нельзя');
    assert.equal(v.labels, true);
    assert.equal('extra' in v, false);
    assert.equal(view.cleanCustom(null), null);
    assert.equal(view.cleanCustom({ name: '  ' }).name, 'Моя тема');
    assert.equal(view.cleanCustom({ name: 'x'.repeat(80) }).name.length, 30);
});

test('каждая часть настраивается независимо: любое сочетание раскладки', () => {
    const layout = view.layoutOf({ values: { bar: 'capsule', title: 'card', center: 'plate', panel: 'floating', size: 'large', labels: false, thumb: 'always', hide: ['pip', 'clock'] } });
    assert.deepEqual(layout, { bar: 'capsule', title: 'card', center: 'plate', panel: 'floating', size: 'large', labels: 'off', thumb: 'always', hide: 'pip clock' });
});

test('акцент красит шкалу, текущую серию, кнопку пропуска и подсказки, текст на нём читается', () => {
    const dark = view.customVars({ values: { accent: '#1d4ed8' } });
    for (const name of ['--rail-done', '--ep-now-bg', '--skip-bg', '--go-bg', '--spot', '--vol-fill', '--sw-on']) assert.equal(dark[name], '#1d4ed8', name);
    assert.equal(dark['--ep-now-fg'], '#ffffff');
    assert.equal(view.customVars({ values: { accent: '#fde047' } })['--skip-fg'], '#111111');
});

test('цвета панелей, размытие, форма, шрифт и порядок кнопок', () => {
    const v = view.customVars({ values: { panelColor: '#203040', panelAlpha: 0.5, barColor: '#000000', barAlpha: 0.4, blur: true, radius: 0, rail: 8, big: 'ring', font: 'mono', order: ['full', 'settings', 'players', 'voices', 'episodes', 'vol', 'gap', 'clock', 'skip'] } });
    assert.equal(v['--panel-bg'], 'rgba(32,48,64,0.5)');
    assert.equal(v['--bar-bg'], 'rgba(0,0,0,0.4)');
    assert.match(v['--panel-blur'], /^blur\(/);
    assert.equal(v['--ep-radius'], '0px');
    assert.equal(v['--rail-h'], '8px');
    assert.equal(v['--big-bg'], 'transparent');
    assert.match(v['--font'], /Consolas/);
    assert.equal(v['--ord-full'], '0');
    assert.equal(v['--ord-skip'], '8');
});

test('размытие за кнопками центра только у кружков: прозрачные кнопки не размывают видео квадратом', () => {
    for (const center of ['plain', 'plate', 'big']) {
        const v = view.customVars({ values: { blur: true, center } });
        assert.equal(v['--ctrl-blur'], 'none', center);
    }
    assert.match(view.customVars({ values: { blur: true, center: 'circles' } })['--ctrl-blur'], /^blur\(/);
    assert.equal(view.customVars({ values: { blur: false, center: 'circles' } })['--ctrl-blur'], 'none');
});

test('цвет подложки нужен только там, где подложка есть', () => {
    assert.equal(view.barColorUsed({ bar: 'full', title: 'top', center: 'plain' }), false, 'без подложки цвету нечего красить');
    for (const bar of ['edge', 'floating', 'capsule', 'plates']) assert.equal(view.barColorUsed({ bar, title: 'top', center: 'plain' }), true, bar);
    assert.equal(view.barColorUsed({ bar: 'full', title: 'card', center: 'plain' }), true, 'плашка названия');
    assert.equal(view.barColorUsed({ bar: 'full', title: 'top', center: 'plate' }), true, 'плашка центра');
});

test('копия встроенной темы собирается из тех же блоков', () => {
    assert.deepEqual(view.presetOf('compact'), view.cleanValues(view.DEFAULTS), '«С нуля» и копия «Классики» совпадают');
    assert.equal(view.presetOf('glass').bar, 'floating');
    assert.equal(view.presetOf('cinema').title, 'bottom');
    assert.equal(view.presetOf('islands').bar, 'plates');
});

test('стили есть у каждого варианта каждого блока', () => {
    for (const key of ['bar', 'title', 'center', 'panel', 'size']) {
        for (const option of view.KNOBS[key].options.filter(o => o !== view.DEFAULTS[key])) {
            assert.ok(view.STYLE.includes(`.root[data-${key}="${option}"]`), `${key}=${option}`);
        }
    }
    for (const item of view.BAR_ITEMS) assert.ok(view.STYLE.includes(`var(--ord-${item.id}`), `порядок ${item.id}`);
    for (const id of view.HIDEABLE) assert.ok(view.STYLE.includes(`[data-hide~="${id}"]`), `спрятать ${id}`);
});

test('тема ставится на оболочку: своя, встроенная без следов своей, удалённая своя даёт нынешний вид', () => {
    const dom = new JSDOM('<div class="root" style="container-type: inline-size"></div>');
    const root = dom.window.document.querySelector('.root');
    const custom = { id: 'custom-1', name: 'Синяя', values: { bar: 'floating', accent: '#3b82f6', hide: ['pip'] } };
    view.paintSkin(root, { playerSkin: 'custom-1', custom_skins: [custom] });
    assert.equal(root.dataset.skin, 'custom');
    assert.equal(root.dataset.bar, 'floating');
    assert.equal(root.dataset.hide, 'pip');
    assert.equal(root.style.getPropertyValue('--rail-done'), '#3b82f6');
    view.paintSkin(root, { playerSkin: 'cinema', custom_skins: [custom] });
    assert.equal(root.dataset.skin, 'cinema');
    assert.equal(root.dataset.bar, undefined);
    assert.equal(root.style.getPropertyValue('--rail-done'), '');
    assert.equal(root.style.getPropertyValue('container-type'), 'inline-size', 'свои стили оболочки не стираются');
    view.paintSkin(root, { playerSkin: 'custom-404', custom_skins: [custom] });
    assert.equal(root.dataset.skin, 'compact');
});
