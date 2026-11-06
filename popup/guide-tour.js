// popup/guide-tour.js
// Экскурсия по окну расширения при первом открытии, задания лисы, которые отмечаются сами, и просьба об оценке

(async function () {
    'use strict';

    const { AgGuide, AgGuideFox } = window;
    const $ = (id) => document.getElementById(id);
    const HOLE_PAD = 4;
    const GAP = 12;
    const EDGE = 8;

    const STEPS = [
        { pose: 'hello', text: 'Привет! Я лиса Anime+. За минуту покажу, что тут к чему.' },
        { target: '#sitesToggle', pose: 'down', text: 'Нажмите сюда, чтобы увидеть все сайты с аниме. Нажатие на сайт открывает его, а переключатель выключает Anime+ на нём.' },
        { target: '#shiki-auth-box', pose: 'up', text: 'Подключите Shikimori, и просмотренные серии будут отмечаться сами. Если вход уже выполнен, здесь ваш список.' },
        { target: '.bottom-tabs', pose: 'down', text: '«Музыка» найдёт опенинги и эндинги, а «Плеер» запустит кнопки вручную, если они не появились.' },
        { target: '#btnSettings', pose: 'up', text: 'За шестерёнкой озвучка, горячие клавиши и случайное аниме.' },
        { target: '#btn-support', pose: 'wink', text: 'Что-то не работает или есть идея? Напишите сюда, это прямо в расширении. Я всё передам.' },
        { pose: 'party', text: 'Вот и всё! Дальше пять заданий: выполняйте их как удобно, а отмечаться они будут сами.', last: true }
    ];

    $('supportFox').innerHTML = AgGuideFox.svg('wink');

    let state = await AgGuide.read();

    // ---------- Задания ----------
    const questCard = $('questCard');
    let questOpen = false;

    function renderQuest() {
        const { done, total, finished } = AgGuide.progress(state);
        questCard.hidden = state.questHidden || !state.tourDone;
        if (questCard.hidden) return;
        questCard.classList.toggle('open', questOpen);
        questCard.classList.toggle('finished', finished);
        $('questFox').innerHTML = AgGuideFox.svg(finished ? 'party' : 'calm');
        $('questTitle').textContent = finished ? 'Все задания выполнены!' : 'Задания лисы';
        $('questCount').textContent = `${done} из ${total}`;
        $('questToggle').setAttribute('aria-expanded', String(questOpen));
        $('questBar').style.width = `${Math.round(done / total * 100)}%`;
        $('questList').replaceChildren(...AgGuide.TASKS.map((task) => {
            const li = document.createElement('li');
            const isDone = state.tasks[task.id] === true;
            li.classList.toggle('done', isDone);
            const mark = document.createElement('span');
            mark.className = 'quest-mark';
            if (isDone) mark.innerHTML = window.AgUI.icon('check', 11);
            const text = document.createElement('span');
            const title = document.createElement('b');
            title.textContent = task.title;
            const hint = document.createElement('small');
            hint.textContent = task.hint;
            text.append(title, hint);
            li.append(mark, text);
            return li;
        }));
    }

    $('questToggle').addEventListener('click', () => {
        questOpen = !questOpen;
        renderQuest();
    });
    // ---------- Оценка ----------
    function renderRate() {
        $('rateCard').hidden = !AgGuide.ratingDue(state);
    }

    const openReviews = async () => {
        chrome.tabs.create({ url: AgGuide.REVIEW_URL });
        state = await AgGuide.patch({ rated: true });
        renderRate();
    };
    $('rateFox').innerHTML = AgGuideFox.svg('hello');
    $('rateGo').addEventListener('click', openReviews);
    $('btnRate').addEventListener('click', openReviews);
    $('rateLater').addEventListener('click', async () => {
        state = await AgGuide.patch(AgGuide.ratingLater(state));
        renderRate();
    });

    $('questClose').addEventListener('click', async () => {
        state = await AgGuide.patch({ questHidden: true });
        renderQuest();
    });

    // Задания из плеера и со страницы настроек выполняются вне этого окна
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[AgGuide.KEY]) return;
        state = AgGuide.normalize(changes[AgGuide.KEY].newValue);
        renderQuest();
        renderRate();
    });

    const { shiki_access_token: token } = await chrome.storage.local.get(['shiki_access_token']);
    if (token) await AgGuide.mark('shiki');
    // Отсчёт дней до просьбы об оценке начинается с первого открытия окна или первой серии
    state = await AgGuide.patch({});
    renderQuest();
    renderRate();

    // ---------- Экскурсия ----------
    const tour = $('tour');
    const hole = $('tourHole');
    const bubble = $('tourBubble');
    let index = 0;
    let steps = [];

    const visible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0;

    function place(step) {
        const target = step.target ? document.querySelector(step.target) : null;
        const page = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
        hole.hidden = !target;
        const size = bubble.getBoundingClientRect();
        if (!target) {
            bubble.style.left = `${Math.round((page.w - size.width) / 2)}px`;
            bubble.style.top = `${Math.max(EDGE, Math.round((page.h - size.height) / 2))}px`;
            return;
        }
        target.scrollIntoView({ block: 'nearest' });
        const r = target.getBoundingClientRect();
        hole.style.left = `${r.left - HOLE_PAD}px`;
        hole.style.top = `${r.top - HOLE_PAD}px`;
        hole.style.width = `${r.width + HOLE_PAD * 2}px`;
        hole.style.height = `${r.height + HOLE_PAD * 2}px`;
        const below = r.bottom + GAP;
        const fitsBelow = below + size.height <= page.h - EDGE;
        const top = fitsBelow ? below : r.top - GAP - size.height;
        bubble.style.left = `${Math.round((page.w - size.width) / 2)}px`;
        bubble.style.top = `${Math.max(EDGE, Math.round(top))}px`;
    }

    function show() {
        const step = steps[index];
        $('tourFox').innerHTML = AgGuideFox.svg(step.pose);
        $('tourText').textContent = step.text;
        $('tourCount').textContent = `${index + 1} из ${steps.length}`;
        $('tourBack').hidden = index === 0;
        $('tourNext').textContent = step.last ? 'Показать задания' : 'Дальше';
        $('tourSkip').hidden = !!step.last;
        place(step);
        $('tourNext').focus({ preventScroll: true });
    }

    async function finish() {
        tour.hidden = true;
        document.documentElement.classList.remove('tour-open');
        state = await AgGuide.patch({ tourDone: true });
        questOpen = true;
        renderQuest();
        renderRate();
    }

    $('tourNext').addEventListener('click', () => {
        if (steps[index].last) return finish();
        index++;
        show();
    });
    $('tourBack').addEventListener('click', () => {
        index--;
        show();
    });
    $('tourSkip').addEventListener('click', finish);
    tour.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            finish();
        }
    });

    function start() {
        // Шаги с тем, чего сейчас нет в окне (например, расширение выключено), не показываем
        if ($('popupApp').classList.contains('ext-off')) return;
        document.documentElement.classList.add('tour-open');
        tour.hidden = false;
        steps = STEPS.filter(s => !s.target || visible(document.querySelector(s.target)));
        index = 0;
        show();
    }

    // Окно достраивается после загрузки списка из Shikimori: ждём, чтобы подсветка попала в нужное место
    if (!state.tourDone) setTimeout(start, 500);
})();
