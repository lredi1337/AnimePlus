// modules/shared/guide-fox.js
// Лиса-экскурсовод: логотип Anime+ с телом, лапами и разными позами. Рисуется кодом, чтобы работать и внутри плеера,
// где файлы расширения недоступны. Анимация отключается при системной настройке «уменьшить движение»

(function (root) {
    'use strict';

    const INK = '#07080f';
    const FUR = '#fdfcfa';
    const RED = '#ee1c33';
    const mirror = 'transform="matrix(-1 0 0 1 1254 0)"';

    const pair = (d, attrs = '') => `<g fill="${RED}" ${attrs}><path d="${d}"/><path d="${d}" ${mirror}/></g>`;

    const HEAD = 'M627 335C600 333 575 337 549 343C480 210 370 58 283 53C215 50 110 300 98 540C96 590 102 630 115 655C80 695 58 770 72 860C82 968 165 1078 315 1132C415 1168 530 1182 627 1182C724 1182 839 1168 939 1132C1089 1078 1172 968 1182 860C1196 770 1174 695 1139 655C1152 630 1158 590 1156 540C1144 300 1039 50 971 53C884 58 774 210 705 343C679 337 654 333 627 335Z';
    const EAR = 'M293 145C240 215 190 400 195 595C240 545 300 470 366 443C350 438 330 438 316 438C345 405 390 388 442 380C420 300 355 195 293 145Z';
    const BROW_MARK = 'M598 476C550 495 510 530 512 575C515 625 580 690 612 752C615 650 610 560 598 476Z';
    const CHEEK = 'M157 847C215 890 290 905 385 902C340 930 290 955 245 955C205 955 170 905 157 847Z';
    const SMILE_EYE = 'M172 797C235 748 295 733 345 733C445 733 525 800 538 880C538 889 530 891 525 886C470 842 400 820 340 822C310 824 285 832 258 846Z';

    const smileEye = (side) => `<path fill="${INK}" d="${SMILE_EYE}" ${side === 'right' ? mirror : ''}/>`;

    // Открытый глаз: блик смещается туда, куда лиса смотрит
    const openEye = (cx, look, big) => {
        const rx = big ? 86 : 70;
        const ry = big ? 108 : 88;
        return `<g class="apc-eye" style="transform-origin:${cx}px 830px">`
            + `<ellipse cx="${cx}" cy="830" rx="${rx}" ry="${ry}" fill="${INK}"/>`
            + `<circle cx="${cx + 22 + look * 16}" cy="800" r="${big ? 30 : 24}" fill="#fff"/>`
            + `<circle cx="${cx - 18 + look * 10}" cy="858" r="${big ? 13 : 10}" fill="#fff"/>`
            + '</g>';
    };

    const NOSE = `<path d="M627 888C605 888 593 895 593 905C595 915 615 925 627 932C639 925 659 915 661 905C661 895 649 888 627 888Z" fill="${INK}"/>`;
    const SMILE_MOUTH = `<g fill="none" stroke="${INK}" stroke-width="17" stroke-linecap="round"><path d="M627 930C615 955 590 985 555 985C540 985 525 975 530 960"/><path d="M627 930C615 955 590 985 555 985C540 985 525 975 530 960" ${mirror}/></g>`;
    const MOUTHS = {
        smile: SMILE_MOUTH,
        open: `<path d="M560 950C590 972 664 972 694 950C692 1020 660 1052 627 1052C594 1052 562 1020 560 950Z" fill="${INK}"/><path d="M590 1010C605 990 649 990 664 1010C655 1038 640 1050 627 1050C614 1050 599 1038 590 1010Z" fill="${RED}"/>`,
        wow: `<ellipse cx="627" cy="990" rx="34" ry="44" fill="${INK}"/>`,
        hmm: `<path d="M585 985C610 970 640 1000 672 975" fill="none" stroke="${INK}" stroke-width="17" stroke-linecap="round"/>`
    };

    /** Лапа: контур и заливка одной линией, поэтому поза задаётся двумя-тремя точками */
    const limb = (d, width, cls = '') => `<g class="${cls}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke="${INK}" stroke-width="${width + 44}"/><path d="${d}" stroke="${FUR}" stroke-width="${width}"/></g>`;

    const REST_L = limb('M420 1270C360 1340 345 1430 385 1510', 112);
    const REST_R = limb('M834 1270C894 1340 909 1430 869 1510', 112);
    const ARMS = {
        down: REST_L + REST_R,
        wave: REST_L + `<g class="apc-wave">${limb('M850 1280C1000 1270 1140 1170 1215 1000', 112)}</g>`,
        right: REST_L + `<g class="apc-point">${limb('M860 1300C1000 1350 1130 1340 1270 1290', 112)}</g>`,
        left: REST_R + `<g class="apc-point">${limb('M394 1300C254 1350 124 1340 -16 1290', 112)}</g>`,
        up: REST_L + `<g class="apc-point">${limb('M870 1270C1040 1210 1180 1000 1225 760', 112)}</g>`,
        down2: REST_L + `<g class="apc-point">${limb('M860 1290C1000 1340 1110 1460 1150 1620', 112)}</g>`,
        chin: REST_R + limb('M410 1300C350 1330 400 1215 555 1180', 112),
        cheer: `<g class="apc-wave">${limb('M850 1280C1000 1270 1140 1170 1215 1000', 112)}</g><g class="apc-wave-2">${limb('M404 1280C254 1270 114 1170 39 1000', 112)}</g>`
    };

    const CONFETTI = `<g class="apc-confetti"><path d="M-90 500l60-34 16 64Z" fill="${RED}"/><circle cx="1370" cy="420" r="30" fill="${RED}"/><path d="M1320 700l70 12-30 58Z" fill="#fbbf24"/><circle cx="-80" cy="780" r="24" fill="#fbbf24"/><path d="M0 180l56 30-48 40Z" fill="#fbbf24"/><path d="M1270 140l60-20 6 64Z" fill="${RED}"/></g>`;

    /** Позы: yaw — поворот морды (-1 влево, 1 вправо), tilt — наклон головы в градусах */
    const POSES = {
        hello: { arms: 'wave', eyes: ['smile', 'smile'], mouth: 'open', yaw: 0, tilt: -5 },
        right: { arms: 'right', eyes: ['open', 'open'], mouth: 'smile', yaw: 1, tilt: 4 },
        left: { arms: 'left', eyes: ['open', 'open'], mouth: 'smile', yaw: -1, tilt: -4 },
        up: { arms: 'up', eyes: ['open', 'open'], mouth: 'open', yaw: 0.6, tilt: 7 },
        down: { arms: 'down2', eyes: ['open', 'open'], mouth: 'smile', yaw: 0.6, tilt: -6 },
        think: { arms: 'chin', eyes: ['open', 'open'], mouth: 'hmm', yaw: -0.5, tilt: -9, look: -1 },
        wink: { arms: 'wave', eyes: ['open', 'smile'], mouth: 'open', yaw: 0.35, tilt: 8 },
        wow: { arms: 'down', eyes: ['big', 'big'], mouth: 'wow', yaw: 0, tilt: 0 },
        party: { arms: 'cheer', eyes: ['smile', 'smile'], mouth: 'open', yaw: 0, tilt: 0, confetti: true },
        calm: { arms: 'down', eyes: ['smile', 'smile'], mouth: 'smile', yaw: 0, tilt: 0 }
    };

    const STYLE = `<style>
        .apc-breathe { transform-box: view-box; transform-origin: 627px 1700px; animation: apc-breathe 3.2s ease-in-out infinite; }
        .apc-head { transform-box: view-box; animation: apc-nod 4.6s ease-in-out infinite; }
        .apc-tail { transform-box: view-box; transform-origin: 900px 1560px; animation: apc-tail 2.6s ease-in-out infinite; }
        .apc-wave { transform-box: view-box; transform-origin: 850px 1280px; animation: apc-wave .9s ease-in-out infinite alternate; }
        .apc-wave-2 { transform-box: view-box; transform-origin: 404px 1280px; animation: apc-wave2 .9s ease-in-out infinite alternate; }
        .apc-point { animation: apc-point 1.1s ease-in-out infinite alternate; }
        .apc-eye { animation: apc-blink 4.2s linear infinite; }
        .apc-confetti { animation: apc-pop 1.4s ease-in-out infinite alternate; }
        @keyframes apc-breathe { 50% { transform: scale(1.012, .988); } }
        @keyframes apc-nod { 50% { translate: 0 10px; } }
        @keyframes apc-tail { 50% { transform: rotate(9deg); } }
        @keyframes apc-wave { from { transform: rotate(-9deg); } to { transform: rotate(12deg); } }
        @keyframes apc-wave2 { from { transform: rotate(9deg); } to { transform: rotate(-12deg); } }
        @keyframes apc-point { to { translate: 14px 0; } }
        @keyframes apc-blink { 0%, 93%, 100% { transform: scaleY(1); } 96.5% { transform: scaleY(.08); } }
        @keyframes apc-pop { from { opacity: .55; translate: 0 18px; } to { opacity: 1; translate: 0 -12px; } }
        @media (prefers-reduced-motion: reduce) { svg * { animation: none !important; } }
    </style>`;

    // Пушистый лисий хвост с красным кончиком
    const TAIL = `<g class="apc-tail"><path d="M870 1610C1050 1690 1310 1640 1385 1410C1420 1290 1375 1170 1275 1105C1262 1185 1205 1235 1140 1280C1040 1350 1000 1450 870 1500Z" fill="${FUR}" stroke="${INK}" stroke-width="44" stroke-linejoin="round"/><path d="M1275 1105C1375 1170 1420 1290 1385 1410C1350 1370 1320 1350 1275 1345C1290 1310 1265 1275 1215 1262C1240 1215 1268 1170 1275 1105Z" fill="${RED}" stroke="${INK}" stroke-width="30" stroke-linejoin="round"/></g>`;
    const BODY = `<path d="M430 1110C320 1230 262 1400 292 1525C315 1625 470 1665 627 1665C784 1665 939 1625 962 1525C992 1400 934 1230 824 1110Z" fill="${FUR}" stroke="${INK}" stroke-width="44" stroke-linejoin="round"/>`
        + `<path d="M627 1270C585 1330 585 1390 627 1445C669 1390 669 1330 627 1270Z" fill="${RED}"/>`;
    const FEET = `<ellipse cx="455" cy="1650" rx="150" ry="72" fill="${FUR}" stroke="${INK}" stroke-width="40"/><ellipse cx="799" cy="1650" rx="150" ry="72" fill="${FUR}" stroke="${INK}" stroke-width="40"/>`;

    const eye = (kind, side, look) => {
        if (kind === 'smile') return smileEye(side);
        return openEye(side === 'left' ? 345 : 909, look, kind === 'big');
    };

    /** Голова повёрнута не целиком: морда смещается, а дальнее ухо сужается, это и даёт ощущение ракурса */
    function head(pose) {
        const yaw = pose.yaw;
        const look = pose.look ?? yaw;
        const shift = Math.round(yaw * 62);
        const earNear = (x) => `translate(${x * Math.round(yaw * 26)} 0)`;
        return `<g class="apc-head"><g transform="rotate(${pose.tilt} 627 1120)">`
            + `<path d="${HEAD}" fill="${FUR}" stroke="${INK}" stroke-width="44" stroke-linejoin="round"/>`
            + `<g transform="${earNear(1)}">${pair(EAR)}</g>`
            + `<g transform="translate(${shift} 0)">`
            + `<g fill="${RED}"><path d="${BROW_MARK}"/><path d="${BROW_MARK}" ${mirror}/></g>`
            + eye(pose.eyes[0], 'left', look) + eye(pose.eyes[1], 'right', look)
            + `<g transform="translate(${Math.round(yaw * 14)} 0)">${pair(CHEEK)}</g>`
            + `<g transform="translate(${Math.round(yaw * 10)} 0)">${NOSE}${MOUTHS[pose.mouth]}</g>`
            + '</g></g></g>';
    }

    function svg(name = 'hello') {
        const pose = POSES[name] || POSES.hello;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-130 -20 1560 1770" aria-hidden="true">${STYLE}`
            + (pose.confetti ? CONFETTI : '')
            + `<g class="apc-breathe">${TAIL}${BODY}${FEET}${head(pose)}${ARMS[pose.arms]}</g>`
            + '</svg>';
    }

    const api = { svg, POSES: Object.keys(POSES) };
    root.AgGuideFox = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
