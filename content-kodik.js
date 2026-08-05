(async function () {
    'use strict';

    let settings = await window.getSettings();
    if (settings.global_enabled === false) return;

    // Защита: запускаем только внутри iframe и только если родитель - AnimeGo
    // (позволяет безопасно использовать широкие разрешения в manifest.json)
    if (window === window.top) return;
    try {
        const ref = document.referrer || '';
        const url = window.location.href || '';

        const urlParams = new URLSearchParams(window.location.search);
        const embedDomain = urlParams.get('d') || '';
        const embedRef = urlParams.get('ref') || '';

        const isAllowed = 
            !ref ||
            ref.includes('animego.me') || ref.includes('animego.org') || ref.includes('jut-su.net') ||
            embedDomain.includes('animego.me') || embedDomain.includes('animego.org') || embedDomain.includes('jut-su.net') ||
            embedRef.includes('animego.me') || embedRef.includes('animego.org') || embedRef.includes('jut-su.net') ||
            ref.includes('kodik') || ref.includes('anivod') || ref.includes('aniboom') || ref.includes('dbcode') || ref.includes('kombik') || ref.includes('tube-storage') || ref.includes('aniqizm');

        if (!isAllowed) {
            return;
        }
    } catch (e) {
        return;
    }

    window.top.postMessage({ type: 'AG_GET_DATA' }, '*');

    // ==========================================
    // --- ЛОГИКА ВНУТРИ ПЛЕЕРА (IFRAME) ---
    // ==========================================
    let hideTimeout, rewindSum = 0, rewindTimer = null, clickCount = 0, clickTimer = null;
    let canAutoPlay = false;
    let skipData = { op: { start: 0, end: 0 }, ed: { start: 0, end: 0 } };
    let currentSkipTarget = null;

    const triggerKodikPlay = (btn) => {
        if (!btn || btn.dataset.agAutoclicked === '1') return;
        btn.dataset.agAutoclicked = '1';
        setTimeout(() => {
            const opts = { bubbles: true, cancelable: true, view: window };
            btn.dispatchEvent(new MouseEvent('mousedown', opts));
            btn.dispatchEvent(new MouseEvent('mouseup', opts));
            btn.click();
            
            const childBtn = btn.querySelector('.play_button') || btn.querySelector('a') || btn.querySelector('svg');
            if (childBtn) {
                childBtn.dispatchEvent(new MouseEvent('mousedown', opts));
                childBtn.dispatchEvent(new MouseEvent('mouseup', opts));
                childBtn.dispatchEvent(new MouseEvent('click', opts));
            }
            
            if (btn.parentElement) {
                btn.parentElement.dispatchEvent(new MouseEvent('mousedown', opts));
                btn.parentElement.dispatchEvent(new MouseEvent('mouseup', opts));
                btn.parentElement.click();
            }
        }, 150);
    };

    const checkAndClickPlayButton = () => {
        if (!settings.autoPlay || !canAutoPlay) return false;
        
        const allElements = document.querySelectorAll('button, a, div, span');
        for (const el of allElements) {
            if (el.childNodes.length === 1 && el.textContent.trim().toLowerCase().includes('продолжить просмотр')) {
                if (!el.dataset.agAutoclicked) {
                    triggerKodikPlay(el);
                    return true;
                }
            }
        }

        const playBtn = document.querySelector('.play_button') || 
                        document.querySelector('.play_background') || 
                        document.querySelector('.play_background a') || 
                        document.querySelector('.play_background svg') ||
                        document.querySelector('a.play_button') ||
                        document.querySelector('.triangle');
        if (playBtn && !playBtn.dataset.agAutoclicked) {
            triggerKodikPlay(playBtn);
            return true;
        }
        return false;
    };

    let autoplayCheck = setInterval(() => {
        if (checkAndClickPlayButton()) {
            clearInterval(autoplayCheck);
        }
    }, 100);
    setTimeout(() => clearInterval(autoplayCheck), 15000);

    const isJutsu = (document.referrer || '').includes('jut-su.net') || window.location.href.includes('d=jut-su.net');

    let lastSwitchTime = 0;
    let startEpisodeIdx = -1;

    const getActiveEpisodeIndex = () => {
        const items = Array.from(document.querySelectorAll('.serial-series-box .dropdown-content .item, .serial-series .dropdown-content .item, .series-select .dropdown-content .item'));
        if (items.length > 0) {
            return items.findIndex(item => item.classList.contains('selected') || item.classList.contains('active'));
        }
        const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
        if (sel && sel.tagName === 'SELECT') {
            return sel.selectedIndex;
        }
        return -1;
    };

    /**
     * Переключает текущую серию в Kodik плеере (вперед/назад)
     * @param {'next'|'prev'} dir - Направление переключения
     * @param {boolean} [force=false] - Игнорировать защитный дебаунс по времени
     */
    const switchKodikEpisode = (dir, force = false) => {
        const debounceMs = (window.AG_CONSTANTS && window.AG_CONSTANTS.EPISODE_SWITCH_DEBOUNCE_MS) || 800;
        const now = Date.now();
        if (!force && (now - lastSwitchTime < debounceMs)) return;
        lastSwitchTime = now;

        // 1. Попробуем найти элементы кастомного выпадающего списка
        const items = Array.from(document.querySelectorAll('.serial-series-box .dropdown-content .item, .serial-series .dropdown-content .item, .series-select .dropdown-content .item'));
        if (items.length > 0) {
            const activeIdx = items.findIndex(item => item.classList.contains('selected') || item.classList.contains('active'));
            if (activeIdx !== -1) {
                let newIdx = activeIdx;
                if (dir === 'next' && activeIdx < items.length - 1) {
                    newIdx = activeIdx + 1;
                } else if (dir === 'prev' && activeIdx > 0) {
                    newIdx = activeIdx - 1;
                }
                if (newIdx !== activeIdx && items[newIdx]) {
                    startEpisodeIdx = newIdx;
                    items[newIdx].click();
                    return;
                }
            }
        }

        // 2. Если кастомных элементов нет, используем стандартный select
        const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
        if (!sel) return;

        if (sel.tagName === 'SELECT') {
            const curIdx = sel.selectedIndex;
            let newIdx = curIdx;
            if (dir === 'next' && curIdx < sel.options.length - 1) {
                newIdx = curIdx + 1;
            } else if (dir === 'prev' && curIdx > 0) {
                newIdx = curIdx - 1;
            }
            if (newIdx !== curIdx) {
                sel.selectedIndex = newIdx;
                startEpisodeIdx = newIdx;
                sel.dispatchEvent(new Event('change'));
            }
        }
    };

    const getLocalEpisodeData = () => {
        const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
        if (sel && sel.tagName === 'SELECT' && sel.options && sel.options.length > 0) {
            const curIdx = sel.selectedIndex;
            const prevOpt = sel.options[curIdx - 1];
            const nextOpt = sel.options[curIdx + 1];
            const curOpt = sel.options[curIdx];

            return {
                current: curOpt ? (curOpt.text || curOpt.value).match(/\d+/)?.[0] : "1",
                prev: prevOpt ? (prevOpt.text || prevOpt.value).match(/\d+/)?.[0] : "",
                next: nextOpt ? (nextOpt.text || nextOpt.value).match(/\d+/)?.[0] : ""
            };
        }

        const items = Array.from(document.querySelectorAll('.serial-series-box .dropdown-content .item, .serial-series .dropdown-content .item, .series-select .dropdown-content .item, .dropdown-item, .item'));
        if (items.length > 0) {
            const activeIdx = items.findIndex(item => item.classList.contains('selected') || item.classList.contains('active'));
            if (activeIdx !== -1) {
                const curItem = items[activeIdx];
                const prevItem = items[activeIdx - 1];
                const nextItem = items[activeIdx + 1];

                return {
                    current: curItem ? curItem.textContent.match(/\d+/)?.[0] : "1",
                    prev: prevItem ? prevItem.textContent.match(/\d+/)?.[0] : "",
                    next: nextItem ? nextItem.textContent.match(/\d+/)?.[0] : ""
                };
            }
        }

        // Fallback: Check any element in iframe DOM displaying "39 серия"
        const allNodes = document.querySelectorAll('button, div, span, a, p, select option:checked');
        for (const el of allNodes) {
            if (el.children.length > 3) continue;
            const txt = (el.innerText || el.textContent || '').trim();
            const epMatch = txt.match(/^(\d+)\s*сери[яи]/i) || txt.match(/\b(\d+)\s*сери[яи]/i);
            if (epMatch) {
                const num = parseInt(epMatch[1]);
                if (num > 0) {
                    return { current: num.toString(), prev: (num > 1 ? (num - 1).toString() : ""), next: (num + 1).toString() };
                }
            }
        }

        // Check side navigation arrows in iframe
        const nextArrow = document.querySelector('[class*="next"], .ag-next-ep');
        const prevArrow = document.querySelector('[class*="prev"], .ag-prev-ep');
        if (nextArrow) {
            const nMatch = nextArrow.textContent.match(/\d+/);
            if (nMatch && parseInt(nMatch[0]) > 1) {
                const ep = parseInt(nMatch[0]) - 1;
                return { current: ep.toString(), prev: (ep > 1 ? (ep - 1).toString() : ""), next: nMatch[0] };
            }
        }
        if (prevArrow) {
            const pMatch = prevArrow.textContent.match(/\d+/);
            if (pMatch && parseInt(pMatch[0]) >= 1) {
                const ep = parseInt(pMatch[0]) + 1;
                return { current: ep.toString(), prev: pMatch[0], next: (ep + 1).toString() };
            }
        }

        return { current: "1", prev: "", next: "" };
    };

    const updateLocalEpisodeNumbers = () => {
        const data = getLocalEpisodeData();
        if (document.getElementById('ag-pn')) document.getElementById('ag-pn').textContent = data.prev || "";
        if (document.getElementById('ag-nn')) document.getElementById('ag-nn').textContent = data.next || "";
    };

    const reportActiveEpisode = () => {
        const data = getLocalEpisodeData();
        window.top.postMessage({ type: 'AG_EPISODE_CHANGED', episode: data.current }, '*');
    };
    let flashTimeout = null; // Оптимизация: вынесли из window

    function applyVisualSettings() {
        const navs = document.querySelectorAll('.ag-nav');
        navs.forEach(el => el.style.display = settings.showNav ? 'flex' : 'none');

        const skipBtn = document.getElementById('ag-skip');
        if (skipBtn) skipBtn.style.display = settings.showSkipBtn ? 'flex' : 'none';

        const centerBtns = document.querySelectorAll('.ag-center-btn');
        centerBtns.forEach(el => el.style.display = settings.showCenterBtn ? 'flex' : 'none');

        const pipBtn = document.getElementById('ag-pip');
        if (pipBtn) pipBtn.style.display = (settings.showPiP !== false) ? 'flex' : 'none';
    }

    document.addEventListener('keydown', (e) => {
        if (e.repeat) return;

        const pressed = [];
        if (e.ctrlKey) pressed.push('ctrl');
        if (e.altKey) pressed.push('alt');
        if (e.shiftKey) pressed.push('shift');
        if (!['control', 'alt', 'shift', 'meta'].includes(e.key.toLowerCase())) {
            pressed.push(e.key.toLowerCase());
        }
        const combo = pressed.join('+');

        const v = document.querySelector('video');
        if (!v) return;

        if (combo === settings.keys.fs) {
            e.preventDefault(); e.stopPropagation();
            window.top.postMessage({ type: 'AG_PSEUDO_FS', action: 'toggle' }, '*');
        }
        else if (combo === settings.keys.forward) {
            e.preventDefault(); e.stopPropagation();
            doRewind(5, v);
        }
        else if (combo === settings.keys.rewind) {
            e.preventDefault(); e.stopPropagation();
            doRewind(-5, v);
        }
        else if (combo === settings.keys.next) {
            e.preventDefault(); e.stopPropagation();
            if (isJutsu) { switchKodikEpisode('next'); updateLocalEpisodeNumbers(); }
            else window.top.postMessage({ type: 'AG_NAV', dir: 'next' }, '*');
        }
        else if (combo === settings.keys.prev) {
            e.preventDefault(); e.stopPropagation();
            if (isJutsu) { switchKodikEpisode('prev'); updateLocalEpisodeNumbers(); }
            else window.top.postMessage({ type: 'AG_NAV', dir: 'prev' }, '*');
        }
        else if (combo === settings.keys.skip) {
            e.preventDefault(); e.stopPropagation();
            if (currentSkipTarget) {
                v.currentTime = currentSkipTarget;
                showFlash("Skipped!");
            } else {
                v.currentTime += 85;
                showFlash("Skip +85s");
            }
        }
        else if (e.key === 'Escape') {
            window.top.postMessage({ type: 'AG_PSEUDO_FS', action: 'disable' }, '*');
        }
    });

    window.addEventListener('message', (e) => {
        if (!e.origin.includes('animego.me') && !e.origin.includes('animego.org') && !e.origin.includes('jut-su.net')) return;

        if (e.data?.type === 'AG_MARATHON_CONFIRM') {
            canAutoPlay = true;
            checkAndClickPlayButton();
        }
        if (e.data?.type === 'AG_FS_STATE') {
            if (e.data.active) {
                document.body.classList.add('ag-fs-active');
            } else {
                document.body.classList.remove('ag-fs-active');
            }
            document.body.dataset.agFsState = e.data.active;
        }

        if (e.data?.type === 'AS_DATA_UPDATE') {
            skipData = e.data.data;
            const v = document.querySelector('video');
            if (v) updateTimelineZones(v);
        }

        if (e.data?.type === 'AG_SETTINGS_UPDATE') {
            settings = e.data.settings;
            applyVisualSettings();
            const ui = document.getElementById('ag-ui');
            if (ui) { ui.style.opacity = '1'; clearTimeout(hideTimeout); hideTimeout = setTimeout(() => ui.style.opacity = '0', settings.hideTime); }
        }
    });

    const syncFsState = () => {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        document.body.dataset.agFsState = isFS ? "true" : "false";
        if (isFS) {
            document.body.classList.add('ag-fs-active');
        } else {
            document.body.classList.remove('ag-fs-active');
        }
    };
    document.addEventListener('fullscreenchange', syncFsState);
    document.addEventListener('webkitfullscreenchange', syncFsState);

    const getKodikEpisode = () => {
        const sel = document.querySelector('.serial-series, select[name="series"], .series-select, .serial-series select');
        if (sel) {
            if (sel.tagName === 'SELECT') {
                return sel.value || (sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text.match(/\d+/)?.[0] : "1");
            } else {
                const active = sel.querySelector('.active, .current');
                if (active) return active.textContent.match(/\d+/)?.[0] || "1";
            }
        }
        return "1";
    };
    window.top.postMessage({ type: 'AG_PLAYER_READY', episode: getKodikEpisode() }, '*');

    document.addEventListener('change', (e) => {
        if (e.target.matches('.serial-series, select[name="series"], .series-select, .serial-series select')) {
            const ep = e.target.value || (e.target.options[e.target.selectedIndex] ? e.target.options[e.target.selectedIndex].text.match(/\d+/)?.[0] : "1");
            window.top.postMessage({ type: 'AG_PLAYER_READY', episode: ep }, '*');
        }
    });

    function sendFs(action) { window.top.postMessage({ type: 'AG_PSEUDO_FS', action: action }, '*'); }
    function doRewind(s, v) {
        rewindSum += s; showFlash(`${rewindSum > 0 ? '+' : ''}${rewindSum}с`);
        clearTimeout(rewindTimer);
        rewindTimer = setTimeout(() => { v.currentTime += rewindSum; rewindSum = 0; if (v.paused) v.play(); }, 450);
    }
    function showFlash(t) {
        const f = document.getElementById('ag-flash'); if (!f) return;
        f.textContent = t; f.style.opacity = '1';
        clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => f.style.opacity = '0', 800);
    }

    function updateTimelineZones(v) {
        if (!v || !v.duration) return;

        if (document.querySelector('.fp-skip-button')) {
            const container = document.getElementById('ag-timeline-zones');
            if (container) container.replaceChildren();
            return;
        }

        const timeline = document.querySelector('.fp-timeline');
        if (!timeline) return;

        let tooltip = document.getElementById('ag-timeline-tooltip');
        let tooltipText = document.getElementById('ag-timeline-tooltip-text');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'ag-timeline-tooltip';
            tooltip.style = `
                position: fixed; padding: 5px 10px; background: white; 
                color: black; border-radius: 4px; font-size: 13px; z-index: 1000000; 
                pointer-events: none; display: none; transform: translate(-50%, -135%);
                font-family: sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                font-weight: 500;
            `;
            tooltipText = document.createElement('span');
            tooltipText.id = 'ag-timeline-tooltip-text';
            tooltip.appendChild(tooltipText);

            const arrow = document.createElement('div');
            arrow.style = `
                position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
                width: 0; height: 0; border-left: 6px solid transparent;
                border-right: 6px solid transparent; border-top: 6px solid white;
            `;
            tooltip.appendChild(arrow);
            document.body.appendChild(tooltip);
        }

        let container = document.getElementById('ag-timeline-zones');
        if (!container) {
            container = document.createElement('div');
            container.id = 'ag-timeline-zones';
            container.style = "position:absolute; inset:0; pointer-events:none; z-index:0;";
            timeline.appendChild(container);
        } else {
            container.replaceChildren();
        }

        const formatTime = (s) => {
            const m = Math.floor(s / 60);
            const sec = Math.floor(s % 60);
            return `${m}:${sec < 10 ? '0' : ''}${sec}`;
        }

        const createZone = (start, end, label) => {
            if (start < 0 || end <= 0) return;

            const left = (start / v.duration) * 100;
            const width = ((end - start) / v.duration) * 100;
            const zone = document.createElement('div');
            zone.style = `
                position:absolute; top:0; bottom:0;
                left:${left}%; width:${width}%;
                background: rgba(255, 255, 255, 0.25);
                border-left: 1px solid rgba(255,255,255,0.1);
                border-right: 1px solid rgba(255,255,255,0.1);
                pointer-events: auto; cursor: pointer;
            `;
            zone.onmouseenter = () => { tooltip.style.display = 'block'; };
            zone.onmousemove = (e) => {
                const rect = timeline.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                const currentTime = v.duration * percent;
                const textSpan = document.getElementById('ag-timeline-tooltip-text');
                if (textSpan) textSpan.textContent = `${formatTime(currentTime)}: ${label}`;
                tooltip.style.left = e.clientX + 'px';
                tooltip.style.top = (rect.top + window.scrollY) + 'px';
            };
            zone.onmouseleave = () => { tooltip.style.display = 'none'; };
            container.appendChild(zone);
        };

        if (skipData.op.end > 0) createZone(skipData.op.start, skipData.op.end, "Опенинг");
        if (skipData.ed.end > 0) createZone(skipData.ed.start, skipData.ed.end, "Эндинг");
    }

    function setupSmartSkip(v) {
        if (document.getElementById('ag-smart-skip')) return;
        const btn = document.createElement('div');
        btn.id = 'ag-smart-skip';
        document.body.appendChild(btn);

        let lastTimeUpdate = 0;
        v.addEventListener('timeupdate', () => {
            const now = Date.now();
            if (now - lastTimeUpdate < 500) return;
            lastTimeUpdate = now;

            if (document.querySelector('.fp-skip-button')) {
                btn.style.display = "none";
                currentSkipTarget = null;
                const container = document.getElementById('ag-timeline-zones');
                if (container && container.childNodes.length > 0) container.replaceChildren();
                return;
            }

            const cur = v.currentTime;

            const isOpTarget = skipData.op.end > 0 && cur >= skipData.op.start && cur <= skipData.op.end;
            const isEdTarget = skipData.ed.end > 0 && cur >= skipData.ed.start && cur <= skipData.ed.end;

            let skipTarget = null;
            let nativeSkip = null;

            if (isOpTarget || isEdTarget) {
                nativeSkip = Array.from(document.querySelectorAll('[class*="skip"]'))
                    .find(el => {
                        if (el.offsetParent === null) return false;
                        const text = el.innerText.trim().toLowerCase();
                        if (!text.includes('пропустить') && !text.includes('skip')) return false;

                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    });
            }

            if (nativeSkip) {
                btn.style.display = "none";
                currentSkipTarget = null;
                if (settings.autoSkip) {
                    const timeBeforeClick = v.currentTime;
                    const skipEndTime = isEdTarget ? skipData.ed.end : skipData.op.end;
                    const opts = { bubbles: true, cancelable: true, view: window };
                    nativeSkip.dispatchEvent(new MouseEvent('mousedown', opts));
                    nativeSkip.dispatchEvent(new MouseEvent('mouseup', opts));
                    nativeSkip.click();
                    setTimeout(() => {
                        if (Math.abs(v.currentTime - timeBeforeClick) < 1 && skipEndTime > 0) {
                            v.currentTime = skipEndTime;
                        }
                    }, 300);
                }
                return;
            }

            if (isOpTarget) {
                btn.innerText = "Пропустить опенинг";
                skipTarget = skipData.op.end;
            } else if (isEdTarget) {
                btn.innerText = "Пропустить эндинг";
                skipTarget = skipData.ed.end;
            }

            currentSkipTarget = skipTarget;

            if (skipTarget) {
                if (settings.autoSkip) { v.currentTime = skipTarget; btn.style.display = "none"; }
                else { btn.style.display = "block"; btn.onclick = (e) => { e.stopPropagation(); v.currentTime = skipTarget; }; }
            } else { btn.style.display = "none"; }
        });

        v.addEventListener('loadedmetadata', () => updateTimelineZones(v));
    }

    function handleZone(e, type, v) {
        if (!settings.showDBL) return;
        e.stopPropagation(); e.preventDefault();
        clickCount++;
        if (clickCount >= 2) {
            if (type === 'prev') doRewind(-5, v);
            if (type === 'next') doRewind(5, v);
            if (type === 'mid') document.getElementById('ag-fs-patch').click();
            clickCount = 0; clearTimeout(clickTimer);
        } else {
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                if (clickCount === 1) { v.paused ? v.play() : v.pause(); }
                clickCount = 0;
            }, 250);
        }
    }

    function drawUI(v) {
        if (document.getElementById('ag-ui')) return;
        setupSmartSkip(v);

        const font = window.AG_FONT || 'sans-serif';
        const redColor = window.AG_RED || '#ff0000';

        const style = document.createElement("style");
        style.innerText = `
            #ag-ui { position:absolute; inset:0; pointer-events:none; z-index:9999990; opacity:0; transition:0.5s; display:flex; align-items:center; justify-content:center; font-family:${font}; }
            .ag-btn { position:absolute; pointer-events:auto; cursor:pointer; background:rgba(30,30,30,0.5); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1); color:#fff; display:flex; align-items:center; justify-content:center; transition:0.2s; border-radius:15px; user-select:none; opacity:0.3; z-index:9999997; }
            .ag-btn:hover { opacity:0.8; color:${redColor}; border-color:${redColor}33; }
            .ag-nav { width:80px; height:140px; font-size:35px; top:50%; transform:translateY(-50%); } 
            #ag-skip { left:0; top:calc(50% + 150px); transform:translateY(-50%); width:80px; height:140px; font-size:45px; transition: 0.4s; }
            body.ag-fs-active #ag-skip { top: auto !important; bottom: 80px !important; left: 0 !important; transform: translateY(0) !important; }
            
            #ag-smart-skip {
                position:fixed; bottom:75px; right:25px; z-index:2147483647; 
                padding:10px 20px; background:rgba(0,0,0,0.7); color:#fff; 
                border:1px solid rgba(255,255,255,0.35); border-radius:4px; 
                cursor:pointer; font-family:sans-serif; font-size:14px; 
                display:none; pointer-events:auto; transition:0.2s; user-select:none;
            }
            #ag-smart-skip:hover {
                background: rgba(255,255,255,0.15); 
                border-color: rgba(255,255,255,0.8);
            }

            .ag-center-btn { position:relative; width:60px; height:60px; font-size:18px; border-radius:50%; margin:0 40px; }
            #ag-pip { top:25px; right:25px; width:48px; height:48px; }
            #ag-flash { position:absolute; top:30%; left:50%; transform:translateX(-50%); color:white; font-size:32px; font-weight:bold; opacity:0; text-shadow:0 0 10px #000; z-index:10000; }
            .ag-click-zone { position:absolute; top:55px; height:calc(75% - 55px); pointer-events:auto; z-index:9999980; }
            #ag-fs-patch { position:absolute; bottom:0; right:0; width:60px; height:60px; pointer-events:auto; z-index:9999999; cursor:pointer; }
            #ag-tooltip { position:absolute; bottom:65px; right:10px; background:rgba(21,21,21,0.9); color:#fff; padding:4px 9px; border-radius:4px; font-size:12px; opacity:0; transition:0.1s; pointer-events:none; white-space:nowrap; border:1px solid #333; }
            #ag-fs-patch:hover + #ag-tooltip { opacity:1; }
            .ag-num { position:absolute; top:12px; font-size:16px; font-weight:bold; opacity:0.9; }
            body.ag-fs-transitioning, body.ag-fs-transitioning * { transition: none !important; animation: none !important; }
            
            /* Нативные выпадающие меню Kodik (серии, озвучки, сезоны) поднимаем выше наших клик-зон */
            .serial-seasons-box, .serial-series-box, .serial-translations-box {
                z-index: 9999995 !important;
            }
            /* Отключаем наши клик-зоны и весь интерфейс, когда наведен курсор или открыты меню выбора */
            body:has(.serial-seasons-box.active) .ag-click-zone,
            body:has(.serial-series-box.active) .ag-click-zone,
            body:has(.serial-translations-box.active) .ag-click-zone,
            body:has(.serial-seasons-box:hover) .ag-click-zone,
            body:has(.serial-series-box:hover) .ag-click-zone,
            body:has(.serial-translations-box:hover) .ag-click-zone,
            body:has(.serial-seasons-box.active) #ag-ui,
            body:has(.serial-series-box.active) #ag-ui,
            body:has(.serial-translations-box.active) #ag-ui,
            body:has(.serial-seasons-box:hover) #ag-ui,
            body:has(.serial-series-box:hover) #ag-ui,
            body:has(.serial-translations-box:hover) #ag-ui {
                pointer-events: none !important;
                opacity: 0 !important;
            }
        `;
        document.head.appendChild(style);
        const ui = document.createElement('div'); ui.id = 'ag-ui';
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div class="ag-btn ag-nav" style="left:0" id="ag-p"><span>&lt;</span><div id="ag-pn" class="ag-num"></div></div><div class="ag-btn ag-nav" style="right:0" id="ag-n"><span>&gt;</span><div id="ag-nn" class="ag-num"></div></div><div class="ag-btn" id="ag-skip"><span>»</span></div><div class="ag-btn ag-center-btn" id="ag-c1">«5</div><div class="ag-btn ag-center-btn" id="ag-c2">5»</div><div class="ag-btn" id="ag-pip" title="PiP (Картинка в картинке)"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z"/></svg></div><div id="ag-flash"></div><div class="ag-click-zone" style="left:0; width:20%;" id="z-p"></div><div class="ag-click-zone" style="right:0; width:20%;" id="z-n"></div><div class="ag-click-zone" style="left:20%; width:60%;" id="z-m"></div><div id="ag-fs-patch"></div><div id="ag-tooltip">AnimeGO+: Расширить плеер</div>`, 'text/html');
        ui.replaceChildren(...doc.body.childNodes);
        document.body.appendChild(ui);

        applyVisualSettings();

        const fsPatch = document.getElementById('ag-fs-patch');
        if (fsPatch) {
            const handleFsPatch = (e) => {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }
                sendFs('toggle');
                return false;
            };
            fsPatch.onclick = handleFsPatch;
            fsPatch.addEventListener('mousedown', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, true);
            fsPatch.addEventListener('mouseup', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); }, true);
            fsPatch.addEventListener('click', handleFsPatch, true);
        }

        document.getElementById('ag-p').onclick = () => {
            if (isJutsu) { switchKodikEpisode('prev'); updateLocalEpisodeNumbers(); }
            else window.top.postMessage({ type: 'AG_NAV', dir: 'prev' }, '*');
        };
        document.getElementById('ag-n').onclick = () => {
            if (isJutsu) { switchKodikEpisode('next'); updateLocalEpisodeNumbers(); }
            else window.top.postMessage({ type: 'AG_NAV', dir: 'next' }, '*');
        };
        document.getElementById('ag-skip').onclick = () => v.currentTime += 90;
        document.getElementById('ag-c1').onclick = () => doRewind(-5, v);
        document.getElementById('ag-c2').onclick = () => doRewind(5, v);
        document.getElementById('ag-pip').onclick = async () => {
            try {
                if (document.pictureInPictureElement) await document.exitPictureInPicture();
                else await v.requestPictureInPicture();
            } catch (err) { console.error("PiP error:", err); }
        };
        document.getElementById('z-p').onclick = (e) => handleZone(e, 'prev', v);
        document.getElementById('z-n').onclick = (e) => handleZone(e, 'next', v);
        document.getElementById('z-m').onclick = (e) => handleZone(e, 'mid', v);

        const preventNativeDblClick = (e) => { e.preventDefault(); e.stopPropagation(); };
        document.getElementById('z-p').ondblclick = preventNativeDblClick;
        document.getElementById('z-n').ondblclick = preventNativeDblClick;
        document.getElementById('z-m').ondblclick = preventNativeDblClick;

        const triggerUiAutoHide = () => {
            if (ui.style.opacity !== '1') ui.style.opacity = '1';
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => ui.style.opacity = '0', settings.hideTime);
        };

        v.addEventListener('play', triggerUiAutoHide);
        v.addEventListener('pause', triggerUiAutoHide);

        let moveTimer;
        window.addEventListener('mousemove', () => {
            if (moveTimer) return;
            moveTimer = setTimeout(() => { moveTimer = null; }, 150);
            triggerUiAutoHide();
        });

        window.addEventListener('message', (e) => {
            // Исправлено: window.isValidOrigin нет в скрипте, заменил на базовую проверку
            if (!e.origin.includes('animego.me') && !e.origin.includes('animego.org') && !e.origin.includes('jut-su.net')) return;

            if (e.data?.type === 'AG_MOUSE_MOVE') {
                triggerUiAutoHide();
            }

            if (e.data?.type === 'AG_DATA') {
                const getN = (s) => s ? s.match(/\d+/)?.[0] : "";
                const prevNum = getN(e.data.prevTitle);
                const nextNum = getN(e.data.nextTitle);

                if (document.getElementById('ag-pn')) document.getElementById('ag-pn').textContent = prevNum;
                if (document.getElementById('ag-nn')) document.getElementById('ag-nn').textContent = nextNum;

                if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
                    navigator.mediaSession.metadata.title = e.data.currentTitle || 'AnimeGO+';
                }
            }
        });

        window.top.postMessage({ type: 'AG_GET_DATA' }, '*');

        if ('mediaSession' in navigator) {
            try {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: 'AnimeGO+',
                    artist: 'AnimeGO+',
                    album: 'AnimeGO Series'
                });

                navigator.mediaSession.setActionHandler('seekforward', () => { v.currentTime += 5; });
                navigator.mediaSession.setActionHandler('seekbackward', () => { v.currentTime -= 5; });
                navigator.mediaSession.setActionHandler('previoustrack', () => {
                    if (isJutsu) { switchKodikEpisode('prev'); updateLocalEpisodeNumbers(); }
                    else window.top.postMessage({ type: 'AG_NAV', dir: 'prev' }, '*');
                });
                navigator.mediaSession.setActionHandler('nexttrack', () => {
                    if (isJutsu) { switchKodikEpisode('next'); updateLocalEpisodeNumbers(); }
                    else window.top.postMessage({ type: 'AG_NAV', dir: 'next' }, '*');
                });
            } catch (e) { console.warn("MediaSession not fully supported."); }
        }

        const showVolumeOSD = (vol) => {
            let osd = document.getElementById('ag-vol-osd');
            if (!osd) {
                osd = document.createElement('div');
                osd.id = 'ag-vol-osd';
                osd.style = `
                    position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
                    background: rgba(0,0,0,0.7); color: #fff; padding: 10px 20px;
                    border-radius: 8px; font-size: 20px; z-index: 9999999;
                    pointer-events: none; transition: opacity 0.3s;
                    font-family: ${font}; border: 1px solid rgba(255,255,255,0.2);
                    backdrop-filter: blur(10px);
                `;
                document.body.appendChild(osd);
            }
            const volPercent = Math.round(vol * 100);
            osd.innerHTML = `🔊 ${volPercent}%`;
            osd.style.opacity = '1';

            clearTimeout(osd.hideTimeout);
            osd.hideTimeout = setTimeout(() => {
                osd.style.opacity = '0';
            }, 1500);
        };

        document.addEventListener('wheel', (e) => {
            const volBar = e.target.closest('.fp-volume');
            if (volBar) {
                e.preventDefault();
                const step = settings.volStep || 0.05;
                const delta = e.deltaY < 0 ? step : -step;
                let newVol = v.volume + delta;
                newVol = Math.max(0, Math.min(1, newVol));
                v.volume = newVol;

                showVolumeOSD(newVol);

                try {
                    const slider = volBar.querySelector('.fp-volumeslider');
                    if (slider) {
                        const bars = Array.from(slider.querySelectorAll('em'));
                        if (bars.length > 0) {
                            const activeCount = Math.round(newVol * bars.length);
                            bars.forEach((em, idx) => {
                                em.className = idx < activeCount ? 'fp-color' : 'fp-grey';
                            });
                        }
                    }
                } catch (err) { /* Игнорируем ошибки при изменении верстки плеера */ }
            }
        }, { passive: false });

        document.addEventListener('click', (e) => {
            if (e.target.closest('.fp-volume') && e.isTrusted) {
                setTimeout(() => { showVolumeOSD(v.volume); }, 50);
            }
        });

        if (isJutsu) {
            const checkInterval = setInterval(() => {
                const sel = document.querySelector('.serial-series-box select, .serial-series select, select[name="series"], .series-select');
                const items = document.querySelectorAll('.serial-series-box .dropdown-content .item, .dropdown-content .item');
                if ((sel && sel.options && sel.options.length > 0) || items.length > 0) {
                    updateLocalEpisodeNumbers();
                    reportActiveEpisode();
                    clearInterval(checkInterval);
                }
            }, 500);
            setTimeout(() => clearInterval(checkInterval), 10000);
            
            document.addEventListener('change', (e) => {
                if (e.target.matches('.serial-series-box select, .serial-series select, select[name="series"], .series-select')) {
                    lastSwitchTime = Date.now();
                    startEpisodeIdx = getActiveEpisodeIndex();
                    setTimeout(() => {
                        updateLocalEpisodeNumbers();
                        reportActiveEpisode();
                    }, 100);
                }
            });

            document.addEventListener('click', (e) => {
                if (e.target.closest('.serial-series-box .dropdown-content .item, .serial-series .dropdown-content .item, .series-select .dropdown-content .item')) {
                    lastSwitchTime = Date.now();
                    startEpisodeIdx = getActiveEpisodeIndex();
                    setTimeout(() => {
                        updateLocalEpisodeNumbers();
                        reportActiveEpisode();
                    }, 200);
                }
            });
        }
    }

    const iframeObserver = new MutationObserver(() => {
        checkAndClickPlayButton();

        const v = document.querySelector('video');
        if (v && !v.dataset.agInit) {
            v.dataset.agInit = '1';
            drawUI(v);
            startEpisodeIdx = getActiveEpisodeIndex();

            v.addEventListener('play', () => {
                if (settings.autoFS) sendFs('enable');
                startEpisodeIdx = getActiveEpisodeIndex();
            }, { once: true });

            let isHandlingEnded = false;
            const handleEndedEvent = (e) => {
                if (e) {
                    try {
                        e.stopImmediatePropagation();
                        e.stopPropagation();
                    } catch (err) {}
                }

                const now = Date.now();
                if (isHandlingEnded || (now - lastSwitchTime < 3000)) return;
                isHandlingEnded = true;
                lastSwitchTime = now;

                if (settings.autoNext) {
                    if (isJutsu) {
                        switchKodikEpisode('next', true);
                        updateLocalEpisodeNumbers();
                    } else {
                        window.top.postMessage({ type: 'AG_NAV', dir: 'next' }, '*');
                    }
                }

                setTimeout(() => {
                    isHandlingEnded = false;
                }, 3000);
            };

            // Захватываем событие ended на фазе погружения (capture = true),
            // предотвращая срабатывание дублирующих нативных обработчиков Kodik/Jut-Su
            v.addEventListener('ended', handleEndedEvent, true);
            v.onended = handleEndedEvent;

            // Если авто-переход выключен в настройках, блокируем нативные timeupdate редиректы сайта
            v.addEventListener('timeupdate', () => {
                if (!settings.autoNext && v.duration && (v.duration - v.currentTime <= 0.3) && !v.paused) {
                    try {
                        v.pause();
                        v.currentTime = Math.max(0, v.duration - 0.1);
                    } catch (err) {}
                }
            }, true);
        }

        // --- ИСПРАВЛЕННЫЙ БЛОК AUTO-SKIP ---
        if (settings.autoSkip) {
            document.querySelectorAll('[class*="skip"]').forEach(btn => {
                const text = btn.textContent.toLowerCase();
                const isFpSkip = btn.classList.contains('fp-skip-button');

                const isVisible = isFpSkip ? btn.classList.contains('active') : (window.getComputedStyle(btn).display !== 'none');

                const video = document.querySelector('video');
                const curTime = video ? video.currentTime : 0;
                // Достаем время последнего клика (или -999, если еще не кликали)
                const lastSkipTime = parseFloat(btn.dataset.agSkipTime) || -999;

                // Если кнопка видима, текст подходит и с прошлого клика прошло больше 30 секунд
                if (isVisible && (text.includes('пропустить') || text.includes('skip')) && Math.abs(curTime - lastSkipTime) > 30) {

                    // Записываем текущее время как время последнего скипа
                    btn.dataset.agSkipTime = curTime.toString();

                    const seekTime = btn.getAttribute('data-seek-to');
                    if (seekTime && video) {
                        video.currentTime = parseFloat(seekTime);
                    } else {
                        const timeBeforeClick = video ? video.currentTime : null;
                        const opts = { bubbles: true, cancelable: true, view: window };
                        btn.dispatchEvent(new MouseEvent('mousedown', opts));
                        btn.dispatchEvent(new MouseEvent('mouseup', opts));
                        btn.click();

                        // Fallback: если клик был проигнорирован (isTrusted=false)
                        if (video && timeBeforeClick !== null) {
                            setTimeout(() => {
                                if (Math.abs(video.currentTime - timeBeforeClick) < 1) {
                                    const edEnd = skipData.ed.end;
                                    const opEnd = skipData.op.end;
                                    const cur = video.currentTime;

                                    if (edEnd > 0 && cur >= skipData.ed.start && cur <= skipData.ed.end) {
                                        video.currentTime = edEnd;
                                    } else if (opEnd > 0 && cur >= skipData.op.start && cur <= skipData.op.end) {
                                        video.currentTime = opEnd;
                                    }
                                }
                            }, 300);
                        }
                    }
                }
            });
        }
        // -----------------------------------

        if (settings.autoPlay) {
            const playBtn = document.querySelector('.play_button');
            if (playBtn && !playBtn.dataset.agAutoclicked) {
                if (canAutoPlay) {
                    playBtn.dataset.agAutoclicked = '1';
                    setTimeout(() => { if (playBtn) playBtn.click(); }, 600);
                } else {
                    playBtn.addEventListener('click', () => {
                        window.top.postMessage({ type: 'AG_START_MARATHON' }, '*');
                    }, { once: true });
                }
            }
        }
    });
    iframeObserver.observe(document.body, { childList: true, subtree: true });

    // Video progress reporter for Shikimori Auto-Sync
    const videoAttachInterval = setInterval(() => {
        const v = document.querySelector('video');
        if (!v) return;
        if (v.dataset.shikiAttached === '1') {
            clearInterval(videoAttachInterval);
            return;
        }
        v.dataset.shikiAttached = '1';
        clearInterval(videoAttachInterval);

        v.addEventListener('play', () => {
            const data = getLocalEpisodeData();
            window.top.postMessage({ type: 'AG_VIDEO_PLAY', episode: data.current }, '*');
        });

        v.addEventListener('timeupdate', () => {
            if (v.duration && (v.currentTime / v.duration) >= 0.80) {
                const data = getLocalEpisodeData();
                window.top.postMessage({ type: 'AG_VIDEO_PROGRESS', episode: data.current, isEnded: false }, '*');
            }
        });

        v.addEventListener('ended', () => {
            const data = getLocalEpisodeData();
            window.top.postMessage({ type: 'AG_VIDEO_PROGRESS', episode: data.current, isEnded: true }, '*');
        });
    }, 1000);

    setTimeout(() => clearInterval(videoAttachInterval), 15000);


    let isKodikVoiceDone = false;
    const findAndSelectPriorityVoiceKodik = () => {
        if (isKodikVoiceDone || !settings || settings.auto_select_voice === false) return false;
        const priorityList = settings.voice_priority_list || (window.DEFAULT_SETTINGS ? window.DEFAULT_SETTINGS.voice_priority_list : ["Anilibria", "Studio Band"]);
        if (!priorityList || priorityList.length === 0) return false;

        const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9а-яё]/gi, '').trim();

        // 1. Check standard <select> elements (fastest, 0ms load)
        const voiceSelect = document.querySelector('.serial-translations-box select, .serial-translations select, select[name="translation"], select[name="voice"], [class*="translation"] select');
        if (voiceSelect && voiceSelect.options) {
            const options = Array.from(voiceSelect.options);
            for (const priorityName of priorityList) {
                const prioClean = clean(priorityName);
                if (!prioClean) continue;

                for (let i = 0; i < options.length; i++) {
                    const optText = clean(options[i].text || options[i].value || '');
                    if (optText && (optText.includes(prioClean) || prioClean.includes(optText))) {
                        isKodikVoiceDone = true;
                        if (voiceSelect.selectedIndex !== i) {
                            voiceSelect.selectedIndex = i;
                            voiceSelect.dispatchEvent(new Event('change', { bubbles: true }));
                            voiceSelect.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                        return true;
                    }
                }
            }
        }

        // 2. Check custom Kodik dropdown items
        const dropdownItems = Array.from(document.querySelectorAll('.serial-translations-box .dropdown-content .item, .serial-translations .dropdown-content .item, .translation-select .dropdown-content .item, [class*="translation"] .dropdown-content .item, .dropdown-content .item'));

        if (dropdownItems.length > 0) {
            for (const priorityName of priorityList) {
                const prioClean = clean(priorityName);
                if (!prioClean) continue;

                for (const item of dropdownItems) {
                    const text = clean(item.innerText || item.textContent || '');
                    if (text && (text.includes(prioClean) || prioClean.includes(text))) {
                        isKodikVoiceDone = true;
                        if (!item.classList.contains('selected') && !item.classList.contains('active')) {
                            item.click();
                        }
                        return true;
                    }
                }
            }
        }

        return false;
    };

    findAndSelectPriorityVoiceKodik();

    let kodikCheckTimer = null;
    let lastKodikCheckTime = 0;

    const voiceObserver = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastKodikCheckTime < 300) return;
        lastKodikCheckTime = now;

        if (findAndSelectPriorityVoiceKodik()) {
            voiceObserver.disconnect();
            if (kodikCheckTimer) clearTimeout(kodikCheckTimer);
        }
    });
    if (document.documentElement) {
        voiceObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    kodikCheckTimer = setTimeout(() => {
        voiceObserver.disconnect();
    }, 4000);
})();