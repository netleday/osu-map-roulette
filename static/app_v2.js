// ========================================================
// V2.0 FEATURES: THEMES, CUSTOM BG, SETTINGS, LOBBY, OSDB, ANTI-TILT
// ========================================================
const THEME_PRESETS = {
    installer_pink:  { primary: '#ff4081', secondary: '#c026d3', glow: 'rgba(255, 64, 129, 0.35)' },
    lazer_neon:      { primary: '#ff66aa', secondary: '#38bdf8', glow: 'rgba(255, 102, 170, 0.35)' },
    deep_ocean:      { primary: '#3b82f6', secondary: '#06b6d4', glow: 'rgba(59, 130, 246, 0.35)' },
    emerald_mint:    { primary: '#10b981', secondary: '#059669', glow: 'rgba(16, 185, 129, 0.35)' },
    graphite_minimal:{ primary: '#d4d4d8', secondary: '#71717a', glow: 'rgba(212, 212, 216, 0.22)' }
};

function hexToRgba(hex, alpha) {
    const clean = (hex || '#ff4081').replace('#', '');
    if (clean.length !== 6) return `rgba(255, 64, 129, ${alpha})`;
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'toast-item';
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => {
        item.style.opacity = '0';
        item.style.transition = 'opacity 0.25s ease';
        setTimeout(() => item.remove(), 250);
    }, 3200);
}

function applyThemeVisuals(cfg) {
    const bgLayer = document.getElementById('appBgLayer');
    const bgOverlay = document.getElementById('appBgOverlay');
    if (!bgLayer || !bgOverlay) return;

    const bgImg = cfg.bg_image || 'bg_1.png';
    const dim = cfg.bg_dim !== undefined ? cfg.bg_dim : 0.72;
    const blur = cfg.bg_blur !== undefined ? cfg.bg_blur : 12;
    const style = cfg.ui_theme_style || 'glass';
    const presetKey = cfg.theme_preset || 'installer_pink';
    const panelOpacity = cfg.panel_opacity !== undefined ? cfg.panel_opacity : 0.74;

    let primary = '#ff4081';
    let secondary = '#c026d3';
    let glow = 'rgba(255, 64, 129, 0.35)';
    if (presetKey === 'custom') {
        primary = cfg.custom_primary || '#ff4081';
        secondary = cfg.custom_secondary || '#c026d3';
        glow = hexToRgba(primary, 0.35);
    } else if (THEME_PRESETS[presetKey]) {
        primary = THEME_PRESETS[presetKey].primary;
        secondary = THEME_PRESETS[presetKey].secondary;
        glow = THEME_PRESETS[presetKey].glow;
    }

    document.documentElement.style.setProperty('--accent-primary', primary);
    document.documentElement.style.setProperty('--accent-secondary', secondary);
    document.documentElement.style.setProperty('--accent-glow', glow);
    document.documentElement.style.setProperty('--border-active', primary);
    document.documentElement.style.setProperty('--panel-opacity', panelOpacity);

    if (bgImg === 'none') {
        bgLayer.style.backgroundImage = 'none';
        bgLayer.style.opacity = '0';
    } else if (bgImg.startsWith('custom:')) {
        const fname = bgImg.slice(7);
        bgLayer.style.backgroundImage = `url('/api/backgrounds/file/${encodeURIComponent(fname)}')`;
        bgLayer.style.opacity = '1';
    } else {
        bgLayer.style.backgroundImage = `url('/static/backgrounds/${bgImg}')`;
        bgLayer.style.opacity = '1';
    }

    bgLayer.style.filter = `blur(${blur}px)`;
    bgOverlay.style.background = `rgba(9, 9, 11, ${dim})`;

    document.body.classList.remove('theme-glass', 'theme-dark', 'theme-transparent');
    document.body.classList.add(`theme-${style}`);

    document.querySelectorAll('.theme-preset-card').forEach(b => {
        b.classList.toggle('active', b.dataset.preset === presetKey);
    });
    document.querySelectorAll('.bg-thumb-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.bg === bgImg);
    });
    document.querySelectorAll('.style-pill-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.style === style);
    });

    const cPrim = document.getElementById('customColorPrimary');
    const cSec = document.getElementById('customColorSecondary');
    if (cPrim) cPrim.value = cfg.custom_primary || primary;
    if (cSec) cSec.value = cfg.custom_secondary || secondary;

    const opSlider = document.getElementById('sliderPanelOpacity');
    const opVal = document.getElementById('panelOpacityVal');
    if (opSlider) opSlider.value = panelOpacity;
    if (opVal) opVal.textContent = `${Math.round(panelOpacity * 100)}%`;

    const dimSlider = document.getElementById('sliderBgDim');
    const dimVal = document.getElementById('bgDimVal');
    if (dimSlider) dimSlider.value = dim;
    if (dimVal) dimVal.textContent = `${Math.round(dim * 100)}%`;

    const blurSlider = document.getElementById('sliderBgBlur');
    const blurVal = document.getElementById('bgBlurVal');
    if (blurSlider) blurSlider.value = blur;
    if (blurVal) blurVal.textContent = `${blur}px`;

    const lp = document.getElementById('inputLazerPath');
    const sm = document.getElementById('selectMirror');
    const cid = document.getElementById('inputClientId');
    const csec = document.getElementById('inputClientSecret');
    if (lp && cfg.lazer_path !== undefined) lp.value = cfg.lazer_path;
    if (sm && cfg.preferred_mirror) sm.value = cfg.preferred_mirror;
    if (cid && cfg.client_id !== undefined) cid.value = cfg.client_id;
    if (csec && cfg.client_secret !== undefined) csec.value = cfg.client_secret;
}

async function saveThemeConfigPatch(patch) {
    Object.assign(currentConfig, patch);
    applyThemeVisuals(currentConfig);
    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig)
        });
    } catch (e) {}
}

async function refreshBackgroundPicker() {
    const grid = document.getElementById('bgPickerGrid');
    if (!grid) return;
    try {
        const res = await fetch('/api/backgrounds/list');
        if (!res.ok) return;
        const data = await res.json();
        const activeBg = currentConfig.bg_image || 'bg_1.png';

        grid.innerHTML = '';

        const noneBtn = document.createElement('button');
        noneBtn.type = 'button';
        noneBtn.className = `bg-thumb-btn${activeBg === 'none' ? ' active' : ''}`;
        noneBtn.dataset.bg = 'none';
        noneBtn.innerHTML = '<div class="bg-thumb-none">—</div><span>Без фона</span>';
        noneBtn.addEventListener('click', () => saveThemeConfigPatch({ bg_image: 'none' }));
        grid.appendChild(noneBtn);

        (data.backgrounds || []).forEach(bg => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `bg-thumb-btn${activeBg === bg.id ? ' active' : ''}`;
            btn.dataset.bg = bg.id;
            btn.innerHTML = `<img src="${bg.url}" alt="${bg.name}" loading="lazy"><span>${bg.name}</span>`;
            btn.addEventListener('click', () => saveThemeConfigPatch({ bg_image: bg.id }));
            grid.appendChild(btn);
        });
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const cfg = await res.json();
            Object.assign(currentConfig, cfg);
            applyThemeVisuals(currentConfig);
            await refreshBackgroundPicker();

            const sidebar = document.getElementById('mainSidebar');
            const toggleSvg = document.getElementById('sidebarToggleSvg');
            if (cfg.sidebar_collapsed && sidebar) {
                sidebar.classList.add('collapsed');
                if (toggleSvg) toggleSvg.style.transform = 'rotate(180deg)';
            }
        }
    } catch (e) {}

    // Sidebar Collapse Toggle
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            const sidebar = document.getElementById('mainSidebar');
            const toggleSvg = document.getElementById('sidebarToggleSvg');
            if (!sidebar) return;
            const collapsed = sidebar.classList.toggle('collapsed');
            if (toggleSvg) toggleSvg.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
            saveThemeConfigPatch({ sidebar_collapsed: collapsed });
        });
    }

    // Settings Modal Bindings
    const settingsModal = document.getElementById('settingsModal');
    document.getElementById('btnOpenSettings')?.addEventListener('click', () => {
        if (settingsModal) {
            applyThemeVisuals(currentConfig);
            refreshBackgroundPicker();
            settingsModal.style.display = 'flex';
        }
    });
    document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
        if (settingsModal) settingsModal.style.display = 'none';
    });
    settingsModal?.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.style.display = 'none';
    });

    // Theme Presets
    document.querySelectorAll('.theme-preset-card').forEach(btn => {
        btn.addEventListener('click', () => {
            saveThemeConfigPatch({ theme_preset: btn.dataset.preset });
        });
    });

    // Custom Theme Builder
    document.getElementById('btnApplyCustomTheme')?.addEventListener('click', () => {
        const pColor = document.getElementById('customColorPrimary')?.value || '#ff4081';
        const sColor = document.getElementById('customColorSecondary')?.value || '#c026d3';
        saveThemeConfigPatch({
            theme_preset: 'custom',
            custom_primary: pColor,
            custom_secondary: sColor
        });
        showToast('Своя тема применена и сохранена');
    });

    document.getElementById('sliderPanelOpacity')?.addEventListener('input', (e) => {
        saveThemeConfigPatch({ panel_opacity: parseFloat(e.target.value) });
    });

    document.querySelectorAll('.style-pill-btn').forEach(btn => {
        btn.addEventListener('click', () => saveThemeConfigPatch({ ui_theme_style: btn.dataset.style }));
    });
    document.getElementById('sliderBgDim')?.addEventListener('input', (e) => {
        saveThemeConfigPatch({ bg_dim: parseFloat(e.target.value) });
    });
    document.getElementById('sliderBgBlur')?.addEventListener('input', (e) => {
        saveThemeConfigPatch({ bg_blur: parseInt(e.target.value, 10) });
    });

    // Custom Background Upload
    const uploadInput = document.getElementById('inputUploadBg');
    document.getElementById('btnUploadBg')?.addEventListener('click', () => uploadInput?.click());
    uploadInput?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            showToast('Загрузка изображения...');
            const res = await fetch('/api/backgrounds/upload', { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                showToast(err.detail || 'Ошибка загрузки фона');
                return;
            }
            const data = await res.json();
            await saveThemeConfigPatch({ bg_image: data.id });
            await refreshBackgroundPicker();
            showToast('Свой фон установлен');
        } catch (err) {
            showToast('Не удалось загрузить файл');
        } finally {
            uploadInput.value = '';
        }
    });

    // Save Technical Settings
    document.getElementById('btnSaveTechSettings')?.addEventListener('click', async () => {
        await saveThemeConfigPatch({
            lazer_path: document.getElementById('inputLazerPath')?.value.trim() || '',
            preferred_mirror: document.getElementById('selectMirror')?.value || 'beatconnect',
            client_id: document.getElementById('inputClientId')?.value.trim() || '',
            client_secret: document.getElementById('inputClientSecret')?.value.trim() || ''
        });
        checkLocalStatus();
        showToast('Настройки osu! сохранены');
    });

    // Collections Export (.osdb)
    document.getElementById('btnExportOsdb')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/collections/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: '' })
            });
            if (!res.ok) {
                const err = await res.json();
                showToast(err.detail || 'Не удалось экспортировать коллекцию');
                return;
            }
            const data = await res.json();
            showToast(`Сохранено ${data.count} карт в .osdb! Открываю папку...`);
            await fetch('/api/collections/open_folder', { method: 'POST' });
        } catch (e) {
            showToast('Ошибка экспорта коллекции');
        }
    });

    // Multiplayer Sync Lobby
    let lastSyncedSpinId = null;
    let myLobbyClientId = null;

    document.getElementById('btnCreateLobby')?.addEventListener('click', async () => {
        showToast('Создание комнаты...');
        const res = await fetch('/api/lobby/create', { method: 'POST' });
        const data = await res.json();
        if (!data.ok) {
            showToast(`Ошибка: ${data.error || 'нет связи с брокером'}`);
            return;
        }
        showToast(`Комната ${data.room_code} создана`);
        pollLobbyState();
    });

    document.getElementById('btnJoinLobby')?.addEventListener('click', async () => {
        const code = document.getElementById('inputLobbyCode')?.value.trim();
        if (!code) { showToast('Введите код комнаты'); return; }
        showToast(`Подключение к ${code}...`);
        const res = await fetch('/api/lobby/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (!data.ok) {
            showToast(`Ошибка входа: ${data.error || 'комната недоступна'}`);
            return;
        }
        showToast(`Вы вошли в комнату ${data.room_code}`);
        pollLobbyState();
    });

    document.getElementById('btnLeaveLobby')?.addEventListener('click', async () => {
        await fetch('/api/lobby/leave', { method: 'POST' });
        showToast('Вы вышли из лобби');
        pollLobbyState();
    });

    document.getElementById('roomCodeBadge')?.addEventListener('click', async () => {
        const code = document.getElementById('roomCodeText')?.textContent;
        if (code && navigator.clipboard) {
            await navigator.clipboard.writeText(code);
            showToast(`Код ${code} скопирован в буфер обмена`);
        }
    });

    async function pollLobbyState() {
        try {
            const res = await fetch('/api/lobby/state');
            if (!res.ok) return;
            const st = await res.json();
            myLobbyClientId = st.client_id;

            const discCtrl = document.getElementById('lobbyControlsDisconnected');
            const connCtrl = document.getElementById('lobbyControlsConnected');
            const body = document.getElementById('lobbyBody');
            const pill = document.getElementById('lobbyStatusPill');

            if (st.in_room) {
                if (discCtrl) discCtrl.style.display = 'none';
                if (connCtrl) connCtrl.style.display = 'flex';
                if (body) body.style.display = 'flex';
                document.getElementById('roomCodeText').textContent = st.room_code;
                if (pill) {
                    pill.textContent = st.connected ? `В сети • ${st.members.length} игр.` : 'Переподключение...';
                    pill.classList.toggle('connected', st.connected);
                }

                const mList = document.getElementById('lobbyMembersList');
                if (mList) {
                    mList.innerHTML = '';
                    st.members.forEach(m => {
                        const chip = document.createElement('div');
                        chip.className = 'lobby-member-chip';
                        chip.innerHTML = `
                            <img src="${m.avatar || 'https://assets.ppy.sh/favicon/favicon-32x32.png'}" alt="">
                            <span>${m.name}${m.is_host ? ' (Хост)' : ''}</span>
                        `;
                        mList.appendChild(chip);
                    });
                }

                const lbList = document.getElementById('lobbyLeaderboardList');
                if (lbList) {
                    if (st.round_scores && st.round_scores.length > 0) {
                        lbList.innerHTML = '';
                        st.round_scores.forEach((s, idx) => {
                            const row = document.createElement('div');
                            row.className = 'lobby-lb-row';
                            row.innerHTML = `
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <strong style="color:#fbbf24;">#${idx + 1}</strong>
                                    <span style="font-weight:700;">${s.name}</span>
                                </div>
                                <div style="display:flex;align-items:center;gap:12px;">
                                    <span style="font-weight:800;color:#4ade80;">${s.rank}</span>
                                    <span>${s.accuracy.toFixed(2)}%</span>
                                    <span style="color:#f87171;">${s.misses}x</span>
                                    <strong style="color:var(--accent-primary);">${Math.round(s.pp)} PP</strong>
                                </div>
                            `;
                            lbList.appendChild(row);
                        });
                    } else {
                        lbList.innerHTML = '<div class="lobby-empty">Сыграйте выпавшую карту в osu!(lazer), чтобы результаты появились здесь автоматически.</div>';
                    }
                }

                if (st.latest_spin && st.latest_spin.spin_id && st.latest_spin.spin_id !== lastSyncedSpinId) {
                    lastSyncedSpinId = st.latest_spin.spin_id;
                    if (st.latest_spin.sender_id !== myLobbyClientId && typeof startRouletteAnimationWithData === 'function') {
                        showToast(`${st.latest_spin.host_name || 'Хост'} запустил прокрутку`);
                        startRouletteAnimationWithData(st.latest_spin);
                    }
                }
            } else {
                if (discCtrl) discCtrl.style.display = 'flex';
                if (connCtrl) connCtrl.style.display = 'none';
                if (body) body.style.display = 'none';
                if (pill) {
                    pill.textContent = 'Не в комнате';
                    pill.classList.remove('connected');
                }
            }
        } catch (e) {}
    }
    setInterval(pollLobbyState, 1600);

    // Anti-Tilt Detector
    let tiltDismissed = false;
    async function pollTiltDetector() {
        if (!currentWinner || tiltDismissed) return;
        try {
            const res = await fetch('/api/tilt/status');
            if (!res.ok) return;
            const data = await res.json();
            const banner = document.getElementById('tiltAlertBanner');
            if (banner) {
                banner.style.display = data.tilting ? 'flex' : 'none';
            }
        } catch (e) {}
    }
    setInterval(pollTiltDetector, 8000);

    document.getElementById('btnDismissTilt')?.addEventListener('click', () => {
        tiltDismissed = true;
        const banner = document.getElementById('tiltAlertBanner');
        if (banner) banner.style.display = 'none';
    });

    document.getElementById('btnAntiTiltSpin')?.addEventListener('click', () => {
        const srMinEl = document.getElementById('inputSrMin');
        const srMaxEl = document.getElementById('inputSrMax');
        if (srMinEl && srMaxEl) {
            srMinEl.value = Math.max(0.5, (parseFloat(srMinEl.value) || 3.5) - 0.3).toFixed(1);
            srMaxEl.value = Math.max(1.0, (parseFloat(srMaxEl.value) || 4.8) - 0.3).toFixed(1);
            srMinEl.dispatchEvent(new Event('input', { bubbles: true }));
            srMaxEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const banner = document.getElementById('tiltAlertBanner');
        if (banner) banner.style.display = 'none';
        tiltDismissed = false;
        document.getElementById('btnSpin')?.click();
    });

    // ========================================================
    // GITHUB UPDATER & CHANGELOG
    // ========================================================
    let latestUpdaterState = null;
    let updateBannerDismissed = false;
    let downloadPollTimer = null;

    function renderUpdateUI(st) {
        latestUpdaterState = st;
        const verBadge = document.getElementById('aboutVersionBadge');
        if (verBadge && st.current_version) verBadge.textContent = `v${st.current_version}`;

        const aboutStatus = document.getElementById('aboutUpdateStatus');
        if (aboutStatus) {
            if (st.update_available) {
                aboutStatus.textContent = `Доступна v${st.latest_version}`;
                aboutStatus.style.color = 'var(--accent-primary)';
            } else {
                aboutStatus.textContent = 'Актуальная версия';
                aboutStatus.style.color = '#4ade80';
            }
        }

        const banner = document.getElementById('updateBanner');
        const bannerTitle = document.getElementById('updateBannerTitle');
        if (banner && !updateBannerDismissed) {
            if (st.update_available) {
                if (bannerTitle) bannerTitle.textContent = `Доступно обновление v${st.latest_version}`;
                banner.style.display = 'flex';
            } else {
                banner.style.display = 'none';
            }
        }

        const progWrap = document.getElementById('updateProgressWrap');
        const progFill = document.getElementById('updateProgressFill');
        const progText = document.getElementById('updateProgressText');
        if (progWrap && st.downloading) {
            progWrap.style.display = 'flex';
            if (progFill) progFill.style.width = `${st.download_progress || 0}%`;
            if (progText) progText.textContent = `${st.download_progress || 0}%`;
        }
    }

    async function fetchUpdaterStatus() {
        try {
            const res = await fetch('/api/updater/status');
            if (res.ok) {
                const st = await res.json();
                renderUpdateUI(st);
            }
        } catch (e) {}
    }

    // Poll once shortly after load so background GitHub check completes
    fetchUpdaterStatus();
    setTimeout(fetchUpdaterStatus, 2500);

    document.getElementById('btnBannerDismiss')?.addEventListener('click', () => {
        updateBannerDismissed = true;
        const banner = document.getElementById('updateBanner');
        if (banner) banner.style.display = 'none';
    });

    document.getElementById('btnCheckUpdates')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnCheckUpdates');
        if (btn) btn.disabled = true;
        showToast('Проверка обновлений на GitHub...');
        try {
            const res = await fetch('/api/updater/check', { method: 'POST' });
            if (res.ok) {
                const st = await res.json();
                updateBannerDismissed = false;
                renderUpdateUI(st);
                if (st.update_available) {
                    showToast(`Найдено обновление v${st.latest_version}`);
                } else {
                    showToast(`Установлена актуальная версия v${st.current_version}`);
                }
            }
        } catch (e) {
            showToast('Не удалось проверить обновления');
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    function openChangelogModal() {
        const modal = document.getElementById('changelogModal');
        const body = document.getElementById('changelogBody');
        const footer = document.getElementById('changelogFooter');
        if (!modal || !body) return;

        body.innerHTML = '';

        // If remote release notes exist, render them first
        if (latestUpdaterState && latestUpdaterState.update_available) {
            const box = document.createElement('div');
            box.className = 'changelog-entry';
            box.style.borderColor = 'var(--accent-primary)';
            const notesHtml = (latestUpdaterState.release_notes || 'Новое обновление готово к установке.')
                .split('\n')
                .filter(l => l.trim())
                .map(l => `<li>${l.replace(/^[-*]\s*/, '')}</li>`)
                .join('');
            box.innerHTML = `
                <div class="changelog-entry-head">
                    <span class="changelog-ver">Новое: v${latestUpdaterState.latest_version}</span>
                    <span class="changelog-date">GitHub Release</span>
                </div>
                <div class="changelog-title">${latestUpdaterState.release_title || 'Доступно обновление'}</div>
                <ul class="changelog-list">${notesHtml}</ul>
            `;
            body.appendChild(box);
            if (footer) footer.style.display = 'flex';
        } else {
            if (footer) footer.style.display = 'none';
        }

        const localList = (latestUpdaterState && latestUpdaterState.local_changelog) || [];
        localList.forEach(item => {
            const box = document.createElement('div');
            box.className = 'changelog-entry';
            const itemsHtml = (item.changes || []).map(c => `<li>${c}</li>`).join('');
            box.innerHTML = `
                <div class="changelog-entry-head">
                    <span class="changelog-ver">${item.version}</span>
                    <span class="changelog-date">${item.date || ''}</span>
                </div>
                <div class="changelog-title">${item.title || ''}</div>
                <ul class="changelog-list">${itemsHtml}</ul>
            `;
            body.appendChild(box);
        });

        modal.style.display = 'flex';
    }

    document.getElementById('btnOpenChangelog')?.addEventListener('click', openChangelogModal);
    document.getElementById('btnBannerChangelog')?.addEventListener('click', openChangelogModal);
    document.getElementById('btnCloseChangelog')?.addEventListener('click', () => {
        const modal = document.getElementById('changelogModal');
        if (modal) modal.style.display = 'none';
    });
    document.getElementById('changelogModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'changelogModal') e.target.style.display = 'none';
    });

    async function triggerUpdateInstall() {
        const modal = document.getElementById('changelogModal');
        if (modal) modal.style.display = 'none';
        updateBannerDismissed = false;
        const banner = document.getElementById('updateBanner');
        if (banner) banner.style.display = 'flex';
        const progWrap = document.getElementById('updateProgressWrap');
        if (progWrap) progWrap.style.display = 'flex';

        const btnInst = document.getElementById('btnBannerInstall');
        if (btnInst) {
            btnInst.disabled = true;
            btnInst.textContent = 'Загрузка...';
        }

        try {
            const res = await fetch('/api/updater/install', { method: 'POST' });
            const data = await res.json();
            if (!data.ok) {
                showToast(data.error || 'Не удалось начать загрузку');
                if (btnInst) { btnInst.disabled = false; btnInst.textContent = 'Обновить'; }
                return;
            }
            if (downloadPollTimer) clearInterval(downloadPollTimer);
            downloadPollTimer = setInterval(async () => {
                await fetchUpdaterStatus();
                if (latestUpdaterState && latestUpdaterState.download_error) {
                    clearInterval(downloadPollTimer);
                    showToast(`Ошибка: ${latestUpdaterState.download_error}`);
                    if (btnInst) { btnInst.disabled = false; btnInst.textContent = 'Обновить'; }
                }
            }, 250);
        } catch (e) {
            showToast('Ошибка запуска обновления');
        }
    }

    document.getElementById('btnBannerInstall')?.addEventListener('click', triggerUpdateInstall);
    document.getElementById('btnChangelogInstall')?.addEventListener('click', triggerUpdateInstall);
});
