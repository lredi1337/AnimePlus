document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const notifId = params.get('id');

    const notifPoster = document.getElementById('notifPoster');
    const notifBadge = document.getElementById('notifBadge');
    const notifTitle = document.getElementById('notifTitle');
    const notifVoiceovers = document.getElementById('notifVoiceovers');
    const notifBtns = document.getElementById('notifBtns');
    const btnClose = document.getElementById('btnClose');

    if (btnClose) {
        btnClose.onclick = () => window.close();
    }

    if (!notifId) return;

    try {
        const storage = await chrome.storage.local.get(['active_notifications_map']);
        const notifMap = storage.active_notifications_map || {};
        const info = notifMap[notifId];

        if (info) {
            if (info.poster && notifPoster) notifPoster.src = info.poster;
            if (info.episode && notifBadge) notifBadge.textContent = `🔥 Вышла ${info.episode} серия`;
            if (info.russianName && notifTitle) notifTitle.textContent = info.russianName;
            if (info.voiceovers && notifVoiceovers) notifVoiceovers.textContent = `🎤 ${info.voiceovers}`;

            if (notifBtns) {
                notifBtns.innerHTML = '';
                if (info.animegoUrl) {
                    const btnAg = document.createElement('button');
                    btnAg.className = 'btn-portal btn-ag';
                    btnAg.textContent = '▶ AnimeGO';
                    btnAg.onclick = () => {
                        chrome.tabs.create({ url: info.animegoUrl });
                        window.close();
                    };
                    notifBtns.appendChild(btnAg);
                }
                if (info.jutsuUrl) {
                    const btnJt = document.createElement('button');
                    btnJt.className = 'btn-portal btn-jt';
                    btnJt.textContent = '▶ JUT-SU';
                    btnJt.onclick = () => {
                        chrome.tabs.create({ url: info.jutsuUrl });
                        window.close();
                    };
                    notifBtns.appendChild(btnJt);
                }
                if (!info.animegoUrl && !info.jutsuUrl) {
                    const btnDef = document.createElement('button');
                    btnDef.className = 'btn-portal btn-ag';
                    btnDef.textContent = '▶ Смотреть';
                    btnDef.onclick = () => {
                        const fallbackUrl = `https://animego.me/search/anime?q=${encodeURIComponent(info.russianName || '')}`;
                        chrome.tabs.create({ url: fallbackUrl });
                        window.close();
                    };
                    notifBtns.appendChild(btnDef);
                }
            }
        }
    } catch (e) {
        console.error('Error initializing notification window:', e);
    }

    setTimeout(() => window.close(), 9000);
});
