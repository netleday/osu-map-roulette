// osu! Map Roulette - Client Application (Minimalist Dark Edition)

let currentConfig = {
    source_mode: 'local',
    ladder_start_sr: 3.5,
    ladder_step_sr: 0.15,
    ladder_streak_current: 0,
    ladder_streak_best: 0,
    enable_sounds: true,
    sound_volume: 0.7,
    smart_mod_filter: true,
    pattern_style: 'any'
};

let isSpinning = false;
let currentWinner = null;
let currentStats = null;
let currentAudio = null;
let sessionHistory = [];
let scorePollTimer = null;
let scorePollCount = 0;
let ladderAutoAdvanced = false;
let currentProfileData = null;

const CARD_WIDTH = 220;
const CARD_GAP = 14;
const CARD_TOTAL = CARD_WIDTH + CARD_GAP; // 234px per card

const MOD_LIST = ["NM", "HD", "HR", "DT", "HD+HR", "HD+DT", "DT+HR", "DT+PF", "HR+PF"];

// Difficulty color mapping
function getDifficultyColor(rating) {
    if (rating < 2.0) return '#4290fb';
    if (rating < 2.7) return '#4ff066';
    if (rating < 4.0) return '#f0e84f';
    if (rating < 5.3) return '#f08b4f';
    if (rating < 6.5) return '#f04f4f';
    if (rating < 8.0) return '#c64ff0';
    return '#1e1e24';
}

function getModClass(modStr) {
    const m = (modStr || 'NM').toUpperCase();
    if (m === 'NM') return 'nm';
    if (m.includes('DT') && m.includes('HR')) return 'combo';
    if (m.includes('DT')) return 'dt';
    if (m.includes('HR')) return 'hr';
    if (m.includes('HD')) return 'hd';
    return 'combo';
}

function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

const SVG_SPIN_ICON = '<svg class="ui-icon ui-icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>';
const SVG_PLAY_ICON = '<svg class="ui-icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
const SVG_PAUSE_ICON = '<svg class="ui-icon" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
const SVG_VOL_HIGH = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
const SVG_VOL_LOW = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
const SVG_VOL_MUTE = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';

// Document Ready
document.addEventListener('DOMContentLoaded', async () => {
    await initConfig();
    await initHistory();
    await initProfile();
    initUIEvents();
    await loadInitialReelPreview();
    populateModReel();
    checkLocalStatus();
});

// Load config from backend
async function initConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            currentConfig = await res.json();
        }
    } catch (e) {
        console.warn('Config load fallback:', e);
    }
    applyConfigToUI();
}

// Load persistent history from backend
async function initHistory() {
    try {
        const res = await fetch('/api/history');
        if (res.ok) {
            const data = await res.json();
            sessionHistory = data.history || [];
            if (data.ladder_streak_current !== undefined) {
                currentConfig.ladder_streak_current = data.ladder_streak_current;
            }
            if (data.ladder_streak_best !== undefined) {
                currentConfig.ladder_streak_best = data.ladder_streak_best;
            }
            renderSessionHistory();
            document.getElementById('ladderStreakVal').textContent = currentConfig.ladder_streak_current || 0;
            document.getElementById('ladderBestStreakVal').textContent = currentConfig.ladder_streak_best || 0;
            updateTopStreakWidget();
        }
    } catch (e) {
        console.warn('History load error:', e);
    }
}

// Load player profile from client.realm & backend
async function initProfile() {
    try {
        const res = await fetch('/api/profile');
        if (res.ok) {
            currentProfileData = await res.json();
            updateTopProfileUI();
        }
    } catch (e) {
        console.warn('Profile load error:', e);
    }
}

function updateTopProfileUI() {
    if (!currentProfileData) return;
    const l = currentProfileData.lazer || {};
    const topAvatar = document.getElementById('topProfileAvatar');
    if (topAvatar && l.avatar_url) topAvatar.src = l.avatar_url;

    const topName = document.getElementById('topProfileName');
    if (topName && l.username) topName.textContent = l.username;

    updateTopStreakWidget();
}

function updateTopStreakWidget() {
    const topStreak = document.getElementById('topProfileStreak');
    if (topStreak) {
        const streak = currentConfig.ladder_streak_current || 0;
        const best = currentConfig.ladder_streak_best || 0;
        topStreak.textContent = `Серия: ${streak} • Рекорд: ${best}`;
    }
}

function openProfileModal() {
    initProfile();
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.style.display = 'flex';

    if (currentProfileData) {
        const l = currentProfileData.lazer || {};
        const r = currentProfileData.roulette || {};
        const ps = r.playstyles || {};

        document.getElementById('modalProfileAvatar').src = l.avatar_url || 'https://assets.ppy.sh/favicon/favicon-32x32.png';
        document.getElementById('modalProfileName').textContent = l.username || 'osu! Player';
        document.getElementById('modalProfileCountry').textContent = l.country_code || 'RU';
        document.getElementById('modalProfileId').textContent = l.online_id ? `Online ID: ${l.online_id}` : 'Online ID: ---';
        document.getElementById('modalMaxPpBadge').textContent = l.max_pp ? `Макс. PP: ${l.max_pp} PP` : 'Макс. PP: ---';

        document.getElementById('modalTotalScores').textContent = l.total_scores || 0;
        document.getElementById('modalPassedScores').textContent = l.passed_scores || 0;
        document.getElementById('modalCountSS').textContent = l.count_ss || 0;
        document.getElementById('modalCountS').textContent = l.count_s || 0;
        document.getElementById('modalCountA').textContent = l.count_a || 0;

        document.getElementById('modalRouletteSpins').textContent = sessionHistory.length || r.total_spins || 0;
        document.getElementById('modalLadderCurrent').textContent = currentConfig.ladder_streak_current || 0;
        document.getElementById('modalLadderBest').textContent = currentConfig.ladder_streak_best || 0;

        // Count playstyles from current sessionHistory
        const psCounts = { aim: 0, flow_aim: 0, stream: 0, tech: 0, balanced: 0 };
        sessionHistory.forEach(h => {
            const st = h.card?.playstyle || 'balanced';
            psCounts[st] = (psCounts[st] || 0) + 1;
        });

        document.getElementById('pstCountAim').textContent = psCounts.aim || 0;
        document.getElementById('pstCountFlow').textContent = psCounts.flow_aim || 0;
        document.getElementById('pstCountStream').textContent = psCounts.stream || 0;
        document.getElementById('pstCountTech').textContent = psCounts.tech || 0;
        document.getElementById('pstCountBalanced').textContent = psCounts.balanced || 0;
    }
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
}

function applyConfigToUI() {
    // Source buttons
    setSourceMode(currentConfig.source_mode || 'local', false);

    // Volume Slider & Sounds
    const vol = currentConfig.sound_volume !== undefined ? currentConfig.sound_volume : 0.7;
    const volSlider = document.getElementById('volumeSlider');
    if (volSlider) {
        volSlider.value = vol;
        updateVolumeUI(vol);
    }

    const soundsToggle = document.getElementById('toggleSounds');
    if (soundsToggle) {
        soundsToggle.checked = currentConfig.enable_sounds !== false;
        window.soundController.enabled = soundsToggle.checked;
    }

    // Smart mod filter toggle
    const smartModToggle = document.getElementById('toggleSmartModFilter');
    if (smartModToggle) {
        smartModToggle.checked = currentConfig.smart_mod_filter !== false;
    }

    // Pattern style select
    const patSelect = document.getElementById('selectPatternType');
    if (patSelect && currentConfig.pattern_style) {
        patSelect.value = currentConfig.pattern_style;
    }

    // Saved filters
    if (currentConfig.last_star_min !== undefined) document.getElementById('inputSrMin').value = currentConfig.last_star_min;
    if (currentConfig.last_star_max !== undefined) document.getElementById('inputSrMax').value = currentConfig.last_star_max;
    if (currentConfig.last_bpm_min !== undefined) document.getElementById('inputBpmMin').value = currentConfig.last_bpm_min;
    if (currentConfig.last_bpm_max !== undefined) document.getElementById('inputBpmMax').value = currentConfig.last_bpm_max;
    if (currentConfig.last_length_min !== undefined) document.getElementById('inputLengthMin').value = currentConfig.last_length_min;
    if (currentConfig.last_length_max !== undefined) document.getElementById('inputLengthMax').value = currentConfig.last_length_max;
    if (currentConfig.last_status) document.getElementById('selectStatus').value = currentConfig.last_status;
    updateFilterLabels();

    // Ladder stats
    document.getElementById('ladderStreakVal').textContent = currentConfig.ladder_streak_current || 0;
    document.getElementById('ladderBestStreakVal').textContent = currentConfig.ladder_streak_best || 0;
    updateTopStreakWidget();
}

function updateVolumeUI(vol) {
    window.soundController.volume = vol;
    if (currentAudio) {
        currentAudio.volume = vol;
    }
    const label = document.getElementById('volLabel');
    if (label) {
        label.textContent = `${Math.round(vol * 100)}%`;
    }
    const icon = document.getElementById('volIcon');
    if (icon) {
        if (vol <= 0.01) icon.innerHTML = SVG_VOL_MUTE;
        else if (vol < 0.5) icon.innerHTML = SVG_VOL_LOW;
        else icon.innerHTML = SVG_VOL_HIGH;
    }
}

function setSourceMode(mode, save = true) {
    currentConfig.source_mode = mode;
    const btnLocal = document.getElementById('btnSourceLocal');
    const btnApi = document.getElementById('btnSourceApi');
    const desc = document.getElementById('sourceDesc');

    if (mode === 'local') {
        btnLocal.classList.add('active');
        btnApi.classList.remove('active');
        desc.textContent = 'База client.realm (%appdata%\\osu)';
    } else {
        btnApi.classList.add('active');
        btnLocal.classList.remove('active');
        desc.textContent = 'osu.direct / зеркала онлайн';
    }

    if (save) {
        saveConfig();
    }
}

async function checkLocalStatus() {
    try {
        const res = await fetch('/api/local/status');
        if (!res.ok) return;
        const data = await res.json();
        const badge = document.getElementById('localMapCountBadge');
        const statusEl = document.getElementById('localStatusText');
        
        if (data.exists) {
            badge.textContent = data.map_count;
            statusEl.textContent = `client.realm: ${data.map_count} карт загружено`;
        } else {
            badge.textContent = '0';
            statusEl.textContent = 'Папка osu!(lazer) не найдена';
        }
    } catch (e) {
        console.warn('Local status error:', e);
    }
}

// UI Event Listeners
function initUIEvents() {
    // Volume slider
    const volSlider = document.getElementById('volumeSlider');
    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            updateVolumeUI(v);
        });
        volSlider.addEventListener('change', (e) => {
            const v = parseFloat(e.target.value);
            currentConfig.sound_volume = v;
            saveConfig();
        });
    }

    // Player Profile Widget click
    const btnProfile = document.getElementById('btnOpenProfile');
    if (btnProfile) {
        btnProfile.addEventListener('click', openProfileModal);
    }
    const btnCloseProf = document.getElementById('btnCloseProfile');
    if (btnCloseProf) {
        btnCloseProf.addEventListener('click', closeProfileModal);
    }
    const modalOverlay = document.getElementById('profileModal');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeProfileModal();
        });
    }

    // Global Hotkeys: Space (Spin), Enter (Play in Lazer), M (Preview Audio), Escape (Close Modal)
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            closeProfileModal();
            return;
        }

        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) {
            return;
        }

        if (e.code === 'Space') {
            e.preventDefault();
            if (!isSpinning) {
                startRouletteSpin();
            }
        } else if (e.code === 'Enter') {
            e.preventDefault();
            const playBtn = document.getElementById('btnPlayInLazer');
            if (playBtn && currentWinner && !playBtn.disabled) {
                playBtn.click();
            }
        } else if (e.code === 'KeyM') {
            e.preventDefault();
            toggleAudio();
        }
    });

    // Source Tabs
    document.getElementById('btnSourceLocal').addEventListener('click', () => setSourceMode('local'));
    document.getElementById('btnSourceApi').addEventListener('click', () => setSourceMode('api'));

    // Sound toggle
    document.getElementById('toggleSounds').addEventListener('change', (e) => {
        window.soundController.enabled = e.target.checked;
        currentConfig.enable_sounds = e.target.checked;
        saveConfig();
    });

    // Smart Mod Filter toggle
    const smartModToggle = document.getElementById('toggleSmartModFilter');
    if (smartModToggle) {
        smartModToggle.addEventListener('change', (e) => {
            currentConfig.smart_mod_filter = e.target.checked;
            saveConfig();
        });
    }

    // Pattern Style selector
    const patSelect = document.getElementById('selectPatternType');
    if (patSelect) {
        patSelect.addEventListener('change', (e) => {
            currentConfig.pattern_style = e.target.value;
            saveConfig();
        });
    }

    // Ladder toggle
    document.getElementById('toggleLadderMode').addEventListener('change', (e) => {
        const ladderBlock = document.getElementById('ladderSidebarBlock');
        const btnNext = document.getElementById('btnLadderNext');
        const btnFail = document.getElementById('btnLadderFail');
        
        if (e.target.checked) {
            ladderBlock.style.display = 'flex';
            btnNext.style.display = 'inline-flex';
            btnFail.style.display = 'inline-flex';
            updateLadderSRInputs();
        } else {
            ladderBlock.style.display = 'none';
            btnNext.style.display = 'none';
            btnFail.style.display = 'none';
        }
    });

    // Mod drum toggle
    document.getElementById('toggleRollMods').addEventListener('change', (e) => {
        document.getElementById('modDrumWrapper').style.display = e.target.checked ? 'flex' : 'none';
    });

    // Spin Button
    document.getElementById('btnSpin').addEventListener('click', startRouletteSpin);

    // Audio Play/Pause Button
    document.getElementById('btnPlayPause').addEventListener('click', toggleAudio);
    document.getElementById('seekSlider').addEventListener('input', (e) => {
        if (currentAudio && currentAudio.duration) {
            currentAudio.currentTime = (e.target.value / 100) * currentAudio.duration;
        }
    });

    // Play in osu!(lazer)
    document.getElementById('btnPlayInLazer').addEventListener('click', async () => {
        if (!currentWinner) return;
        const btn = document.getElementById('btnPlayInLazer');
        const oldText = btn.innerHTML;
        btn.innerHTML = '<span>Запуск...</span>';
        btn.disabled = true;

        try {
            const res = await fetch('/api/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    beatmap_id: currentWinner.beatmap_id,
                    beatmapset_id: currentWinner.beatmapset_id,
                    local_path: currentWinner.local_path
                })
            });
            const data = await res.json();
            btn.innerHTML = '<span>Запущено в osu!</span>';
            setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; }, 2500);
        } catch (e) {
            btn.innerHTML = '<span>Ошибка</span>';
            setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; }, 2500);
        }
    });

    // Score verification button (manual check)
    const btnCheckScore = document.getElementById('btnCheckScore');
    if (btnCheckScore) {
        btnCheckScore.addEventListener('click', () => {
            checkScore(true);
        });
    }

    // Ladder Mode: Next (Win)
    document.getElementById('btnLadderNext').addEventListener('click', async () => {
        executeLadderWin();
        startRouletteSpin();
    });

    // Ladder Mode: Fail
    document.getElementById('btnLadderFail').addEventListener('click', async () => {
        try {
            const res = await fetch('/api/ladder/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'lose' })
            });
            const data = await res.json();
            currentConfig.ladder_streak_current = 0;
            document.getElementById('ladderStreakVal').textContent = '0';
            updateTopStreakWidget();
            resetLadderSR();
        } catch (e) {
            console.error(e);
        }
    });

    // Reindex Local Button
    document.getElementById('btnReindexLocal').addEventListener('click', async () => {
        const btn = document.getElementById('btnReindexLocal');
        const prevHtml = btn.innerHTML;
        btn.textContent = 'Индексация...';
        btn.disabled = true;
        try {
            const res = await fetch('/api/local/reindex', { method: 'POST' });
            const data = await res.json();
            checkLocalStatus();
            initProfile();
            showToast(`База обновлена (${data.map_count || 0} карт)`);
        } catch (e) {
            console.error(e);
        } finally {
            btn.innerHTML = prevHtml;
            btn.disabled = false;
        }
    });

    // Input change listeners
    document.getElementById('inputSrMin').addEventListener('input', updateFilterLabels);
    document.getElementById('inputSrMax').addEventListener('input', updateFilterLabels);
    document.getElementById('inputBpmMin').addEventListener('input', updateFilterLabels);
    document.getElementById('inputBpmMax').addEventListener('input', updateFilterLabels);
    document.getElementById('inputLengthMin').addEventListener('input', updateFilterLabels);
    document.getElementById('inputLengthMax').addEventListener('input', updateFilterLabels);
}

function updateFilterLabels() {
    const sMin = parseFloat(document.getElementById('inputSrMin').value).toFixed(1);
    const sMax = parseFloat(document.getElementById('inputSrMax').value).toFixed(1);
    document.getElementById('srLabel').textContent = `${sMin}★ – ${sMax}★`;

    const bMin = document.getElementById('inputBpmMin').value;
    const bMax = document.getElementById('inputBpmMax').value;
    document.getElementById('bpmLabel').textContent = `${bMin} – ${bMax}`;

    const lMin = formatTime(parseInt(document.getElementById('inputLengthMin').value));
    const lMax = formatTime(parseInt(document.getElementById('inputLengthMax').value));
    document.getElementById('lengthLabel').textContent = `${lMin} – ${lMax}`;
}

function updateLadderSRInputs() {
    const streak = currentConfig.ladder_streak_current || 0;
    const start = parseFloat(currentConfig.ladder_start_sr || 3.5);
    const step = parseFloat(currentConfig.ladder_step_sr || 0.15);
    const minVal = start + (streak * step);
    const maxVal = minVal + step;

    document.getElementById('inputSrMin').value = minVal.toFixed(2);
    document.getElementById('inputSrMax').value = maxVal.toFixed(2);
    document.getElementById('ladderLevelText').textContent = `Уровень ${streak + 1}`;
    updateFilterLabels();
}

function advanceLadderSR(step) {
    const minInput = document.getElementById('inputSrMin');
    const maxInput = document.getElementById('inputSrMax');
    let currentMin = parseFloat(minInput.value);
    let newMin = currentMin + step;
    let newMax = newMin + step;
    minInput.value = newMin.toFixed(2);
    maxInput.value = newMax.toFixed(2);
    updateFilterLabels();
}

function resetLadderSR() {
    updateLadderSRInputs();
}

async function executeLadderWin() {
    window.soundController.playLadderSuccess();
    const step = parseFloat(currentConfig.ladder_step_sr || 0.15);
    try {
        const res = await fetch('/api/ladder/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'win', step_sr: step })
        });
        const data = await res.json();
        currentConfig.ladder_streak_current = data.current_streak;
        currentConfig.ladder_streak_best = data.best_streak;
        document.getElementById('ladderStreakVal').textContent = data.current_streak;
        document.getElementById('ladderBestStreakVal').textContent = data.best_streak;
        updateTopStreakWidget();
        advanceLadderSR(step);
    } catch (e) {
        console.error('Ladder win error:', e);
    }
}

async function saveConfig() {
    try {
        await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig)
        });
    } catch (e) {
        console.warn('Config save error:', e);
    }
}

// Load real beatmaps matching saved filters or leave clean empty dark strip
async function loadInitialReelPreview() {
    const track = document.getElementById('rouletteTrack');
    const hint = document.getElementById('drumEmptyHint');
    if (!track) return;
    track.innerHTML = '';

    try {
        const res = await fetch('/api/reel/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                star_min: parseFloat(document.getElementById('inputSrMin')?.value || currentConfig.last_star_min || 3.5),
                star_max: parseFloat(document.getElementById('inputSrMax')?.value || currentConfig.last_star_max || 4.8),
                bpm_min: parseFloat(document.getElementById('inputBpmMin')?.value || currentConfig.last_bpm_min || 120),
                bpm_max: parseFloat(document.getElementById('inputBpmMax')?.value || currentConfig.last_bpm_max || 260),
                length_min: parseInt(document.getElementById('inputLengthMin')?.value || currentConfig.last_length_min || 30, 10),
                length_max: parseInt(document.getElementById('inputLengthMax')?.value || currentConfig.last_length_max || 300, 10),
                status: document.getElementById('selectStatus')?.value || currentConfig.last_status || 'ranked'
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.cards && data.cards.length > 0) {
                if (hint) hint.style.display = 'none';
                buildReelDOM(data.cards);
                return;
            }
        }
    } catch (e) {}

    // Clean empty dark strip
    if (hint) hint.style.display = 'flex';
}

// Populate Mod Reel
function populateModReel() {
    const track = document.getElementById('modTrack');
    track.innerHTML = '';
    
    let items = [];
    for (let i = 0; i < 6; i++) {
        items = items.concat(MOD_LIST);
    }

    items.forEach((m) => {
        const el = document.createElement('div');
        el.className = `mod-box ${getModClass(m)}`;
        el.textContent = `+${m}`;
        track.appendChild(el);
    });
}

/* ========================================================
   CS2 CASE OPENING ROULETTE ENGINE
======================================================== */
async function startRouletteSpin() {
    if (isSpinning) return;
    isSpinning = true;

    stopScorePolling();
    ladderAutoAdvanced = false;

    const btnSpin = document.getElementById('btnSpin');
    btnSpin.disabled = true;
    btnSpin.innerHTML = '<span>ПОДБОР КАРТЫ...</span>';

    stopAudio();
    document.getElementById('winnerSection').style.display = 'none';

    const payload = {
        star_min: parseFloat(document.getElementById('inputSrMin').value),
        star_max: parseFloat(document.getElementById('inputSrMax').value),
        bpm_min: parseFloat(document.getElementById('inputBpmMin').value),
        bpm_max: parseFloat(document.getElementById('inputBpmMax').value),
        length_min: parseInt(document.getElementById('inputLengthMin').value),
        length_max: parseInt(document.getElementById('inputLengthMax').value),
        status: document.getElementById('selectStatus').value,
        roll_mods: document.getElementById('toggleRollMods').checked,
        smart_mod_filter: document.getElementById('toggleSmartModFilter').checked,
        pattern_style: document.getElementById('selectPatternType').value,
        ladder_mode: document.getElementById('toggleLadderMode').checked,
        source_mode: currentConfig.source_mode || 'local'
    };

    // Save last filters
    Object.assign(currentConfig, {
        last_star_min: payload.star_min,
        last_star_max: payload.star_max,
        last_bpm_min: payload.bpm_min,
        last_bpm_max: payload.bpm_max,
        last_length_min: payload.length_min,
        last_length_max: payload.length_max,
        last_status: payload.status
    });
    saveConfig();

    let rollData = null;
    try {
        const res = await fetch('/api/roll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Ошибка сервера' }));
            showToast(err.detail || 'Не найдено карт по заданным фильтрам.');
            btnSpin.disabled = false;
            btnSpin.innerHTML = `${SVG_SPIN_ICON}<span>КРУТИТЬ РУЛЕТКУ</span>`;
            isSpinning = false;
            return;
        }
        rollData = await res.json();
    } catch (e) {
        console.error('Roll error:', e);
        showToast('Не удалось связаться с сервером. Попробуйте еще раз.');
        btnSpin.disabled = false;
        btnSpin.innerHTML = `${SVG_SPIN_ICON}<span>КРУТИТЬ РУЛЕТКУ</span>`;
        isSpinning = false;
        return;
    }

    currentWinner = rollData.winner;
    currentWinner.roll_time = rollData.roll_time || new Date().toISOString();
    currentWinner.playstyle = rollData.playstyle || currentWinner.playstyle || 'balanced';
    currentWinner.playstyle_name = rollData.playstyle_name || currentWinner.playstyle_name || 'Balanced';
    currentStats = rollData.stats;

    buildReelDOM(rollData.reel);
    executeReelSpin(rollData.winner_index, rollData.mods);
}

function startRouletteAnimationWithData(spinData) {
    if (isSpinning || !spinData || !spinData.winner) return;
    isSpinning = true;
    const btnSpin = document.getElementById('btnSpin');
    if (btnSpin) {
        btnSpin.disabled = true;
        btnSpin.innerHTML = '<span>СИНХРОНИЗАЦИЯ ЛОББИ...</span>';
    }

    currentWinner = spinData.winner;
    currentWinner.roll_time = spinData.roll_time || new Date().toISOString();
    currentWinner.playstyle = spinData.playstyle || currentWinner.playstyle || 'balanced';
    currentWinner.playstyle_name = spinData.playstyle_name || currentWinner.playstyle_name || 'Balanced';
    currentStats = spinData.stats;

    const sample = spinData.reel_sample && spinData.reel_sample.length > 0 ? spinData.reel_sample : [spinData.winner];
    const reel = [];
    for (let i = 0; i < 50; i++) {
        reel.push(sample[i % sample.length]);
    }
    reel[38] = spinData.winner;

    buildReelDOM(reel);
    executeReelSpin(38, spinData.mods || 'NM');
}

function buildReelDOM(cards) {
    const hint = document.getElementById('drumEmptyHint');
    if (hint) hint.style.display = 'none';
    const track = document.getElementById('rouletteTrack');
    track.style.transition = 'none';
    track.style.transform = 'translateX(0px)';
    track.innerHTML = '';

    cards.forEach((card, idx) => {
        const el = document.createElement('div');
        el.className = 'map-card';
        el.id = `card-idx-${idx}`;
        const srColor = getDifficultyColor(card.difficulty_rating);
        const cover = card.card_url || card.cover_url || 'https://assets.ppy.sh/beatmaps/covers/cover.jpg';

        el.innerHTML = `
            <img class="card-bg-img" src="${cover}" alt="Cover" loading="lazy">
            <div class="map-card-content">
                <div class="map-sr-pill" style="background: ${srColor};">${card.difficulty_rating.toFixed(2)}★</div>
                <div class="map-title" title="${card.title}">${card.title}</div>
                <div class="map-artist" title="${card.artist}">${card.artist}</div>
                <div class="map-version" title="${card.version}">${card.version}</div>
            </div>
        `;
        track.appendChild(el);
    });
}

function executeReelSpin(winnerIndex, winnerMod) {
    const drumContainer = document.querySelector('.drum-container');
    const containerWidth = drumContainer.offsetWidth;
    const centerOffset = containerWidth / 2;

    const jitter = (Math.random() - 0.5) * (CARD_WIDTH * 0.6);
    const targetCardCenter = (winnerIndex * CARD_TOTAL) + (CARD_WIDTH / 2);
    const targetTranslateX = -(targetCardCenter - centerOffset + jitter);

    const spinDuration = 5500;
    const track = document.getElementById('rouletteTrack');

    track.style.transition = `transform ${spinDuration}ms cubic-bezier(0.12, 0.8, 0.25, 1)`;
    track.style.transform = `translateX(${targetTranslateX}px)`;

    // Audio ticks simulation
    simulateCS2AudioTicks(spinDuration, winnerIndex);

    // Spin Mod Reel
    if (document.getElementById('toggleRollMods').checked) {
        spinModDrum(winnerMod, spinDuration);
    }

    // On completion
    setTimeout(() => {
        track.style.transition = 'none';
        isSpinning = false;
        
        const btnSpin = document.getElementById('btnSpin');
        btnSpin.disabled = false;
        btnSpin.innerHTML = `${SVG_SPIN_ICON}<span>КРУТИТЬ РУЛЕТКУ</span>`;

        window.soundController.playWinChime();
        displayWinnerResult(currentWinner, currentStats, winnerMod);
        addToSessionHistory(currentWinner, currentStats, winnerMod);
        startScorePolling();
    }, spinDuration + 100);
}

function simulateCS2AudioTicks(durationMs, winnerIndex) {
    const totalTicks = winnerIndex + 2;
    const startTime = performance.now();

    function step() {
        if (!isSpinning) return;
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / durationMs, 1.0);

        const eased = 1 - Math.pow(1 - progress, 3);
        const currentCard = Math.floor(eased * totalTicks);

        if (step.lastCard !== undefined && currentCard !== step.lastCard) {
            const pitch = 0.9 + (0.3 * (1 - progress));
            window.soundController.playTick(pitch);
        }
        step.lastCard = currentCard;

        if (progress < 1.0) {
            requestAnimationFrame(step);
        }
    }
    step.lastCard = 0;
    requestAnimationFrame(step);
}

function spinModDrum(winnerMod, durationMs) {
    const modTrack = document.getElementById('modTrack');
    const container = document.getElementById('modDrumWrapper');
    const centerOffset = container.offsetWidth / 2;
    const MOD_WIDTH = 72 + 12; // 84px

    const modPills = modTrack.querySelectorAll('.mod-box');
    let targetIndex = -1;
    for (let i = modPills.length - 1; i >= modPills.length - 12; i--) {
        if (modPills[i].textContent.includes(winnerMod)) {
            targetIndex = i;
            break;
        }
    }
    if (targetIndex === -1) targetIndex = modPills.length - 5;

    const targetPos = (targetIndex * MOD_WIDTH) + (72 / 2);
    const targetX = -(targetPos - centerOffset);

    modTrack.style.transition = `transform ${durationMs}ms cubic-bezier(0.12, 0.8, 0.25, 1)`;
    modTrack.style.transform = `translateX(${targetX}px)`;
}

/* ========================================================
   DISPLAY WINNER CARD & STATS
======================================================== */
function displayWinnerResult(card, stats, mods) {
    const section = document.getElementById('winnerSection');
    section.style.display = 'flex';

    // Banner & Cover
    const coverUrl = card.cover_url || card.card_url || 'https://assets.ppy.sh/beatmaps/covers/cover.jpg';
    document.getElementById('winnerBannerImg').src = coverUrl;
    document.getElementById('winnerTitle').textContent = card.title;
    document.getElementById('winnerArtist').textContent = card.artist;
    document.getElementById('winnerDiffName').textContent = card.version;
    document.getElementById('winnerCreator').textContent = card.creator;

    // Star Rating
    const realSr = stats ? stats.stars : card.difficulty_rating;
    const starBadge = document.getElementById('winnerStarBadge');
    starBadge.textContent = `${realSr.toFixed(2)}★`;
    starBadge.style.background = getDifficultyColor(realSr);

    // Mod tag
    const modTag = document.getElementById('winnerModTag');
    modTag.textContent = mods && mods !== 'NM' ? `+${mods}` : 'NOMOD';
    modTag.className = `mod-tag ${getModClass(mods)}`;

    // Playstyle tag
    const psTag = document.getElementById('winnerPlaystyleTag');
    if (psTag) {
        const ps = card.playstyle || 'balanced';
        const psName = card.playstyle_name || 'Balanced';
        psTag.textContent = psName;
        psTag.className = `playstyle-pill pill-${ps}`;
    }

    // PP Matrix
    if (stats) {
        document.getElementById('pp95').textContent = stats.pp_95 ? `${Math.round(stats.pp_95)}` : '---';
        document.getElementById('pp98').textContent = stats.pp_98 ? `${Math.round(stats.pp_98)}` : '---';
        document.getElementById('pp99').textContent = stats.pp_99 ? `${Math.round(stats.pp_99)}` : '---';
        document.getElementById('pp100').textContent = stats.pp_100 ? `${Math.round(stats.pp_100)}` : '---';

        document.getElementById('specAr').textContent = stats.ar;
        document.getElementById('specOd').textContent = stats.od;
        document.getElementById('specCs').textContent = stats.cs;
        document.getElementById('specHp').textContent = stats.hp;
        document.getElementById('specBpm').textContent = Math.round(stats.bpm);
        document.getElementById('specCombo').textContent = stats.max_combo ? `${stats.max_combo}x` : '---';
    }

    // Reset score UI
    const scoreBox = document.getElementById('scoreBox');
    const scoreView = document.getElementById('scoreView');
    const scoreBadge = document.getElementById('scoreStatusBadge');
    if (scoreBox) scoreBox.style.display = 'block';
    if (scoreView) scoreView.style.display = 'none';
    if (scoreBadge) {
        scoreBadge.textContent = 'Ожидание игры...';
        scoreBadge.style.color = '#94a3b8';
        scoreBadge.style.background = '#1c1c26';
    }

    // Links
    document.getElementById('btnOsuWeb').href = card.beatmap_id > 0 ? `https://osu.ppy.sh/b/${card.beatmap_id}` : '#';

    // Setup preview audio
    setupPreviewAudio(card.preview_url);

    // Scroll smoothly into view
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ========================================================
   SCORE VERIFICATION (client.realm)
======================================================== */
function startScorePolling() {
    stopScorePolling();
    scorePollCount = 0;
    // Check after 3.5s, then repeat every 3.5s up to 60 times (~3.5 minutes)
    scorePollTimer = setInterval(() => {
        scorePollCount++;
        if (scorePollCount > 60) {
            stopScorePolling();
            const badge = document.getElementById('scoreStatusBadge');
            if (badge && badge.textContent.includes('Ожидание')) {
                badge.textContent = 'Таймаут ожидания игры';
            }
            return;
        }
        checkScore(false);
    }, 3500);
}

function stopScorePolling() {
    if (scorePollTimer) {
        clearInterval(scorePollTimer);
        scorePollTimer = null;
    }
}

async function checkScore(isManual = false) {
    if (!currentWinner) return;

    const badge = document.getElementById('scoreStatusBadge');
    if (badge && isManual) {
        badge.textContent = 'Сканирование client.realm...';
    }

    // For automated polling, check scores created near or after roll_time (with 15s grace margin)
    let sinceParam = null;
    if (!isManual && currentWinner.roll_time) {
        try {
            const rollTimeMs = new Date(currentWinner.roll_time).getTime();
            sinceParam = new Date(rollTimeMs - 15000).toISOString();
        } catch {
            sinceParam = null;
        }
    }

    try {
        const res = await fetch('/api/score/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                beatmap_id: currentWinner.beatmap_id || 0,
                beatmap_hash: currentWinner.hash || "",
                since: sinceParam
            })
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.found) {
            stopScorePolling();
            renderScoreView(data);

            // In Ladder mode, automatically award win on first pass
            const isLadder = document.getElementById('toggleLadderMode').checked;
            if (isLadder && data.passed && !ladderAutoAdvanced) {
                ladderAutoAdvanced = true;
                await executeLadderWin();
                if (badge) {
                    badge.textContent = 'Победа в Лесенке! Следующий уровень разблокирован (+Next)';
                    badge.style.color = '#22c55e';
                    badge.style.background = 'rgba(34, 197, 94, 0.15)';
                }
            }
        } else {
            if (isManual && badge) {
                badge.textContent = 'Свежий скор не найден в client.realm';
                badge.style.color = '#eab308';
                badge.style.background = 'rgba(234, 179, 8, 0.15)';
            }
        }
    } catch (e) {
        console.warn('Score check error:', e);
    }
}

function renderScoreView(data) {
    const scoreView = document.getElementById('scoreView');
    const rankPill = document.getElementById('scoreRankPill');
    const accEl = document.getElementById('scoreAcc');
    const comboEl = document.getElementById('scoreCombo');
    const missesEl = document.getElementById('scoreMisses');
    const ppEl = document.getElementById('scorePp');
    const badge = document.getElementById('scoreStatusBadge');

    if (scoreView) scoreView.style.display = 'flex';

    const rank = (data.rank || 'F').toUpperCase();
    if (rankPill) {
        rankPill.textContent = rank;
        rankPill.className = `score-rank-pill rank-${rank.toLowerCase()}`;
    }

    if (accEl) accEl.textContent = `${(data.accuracy || 0).toFixed(2)}%`;
    if (comboEl) comboEl.textContent = `${data.max_combo || 0}x`;
    if (missesEl) missesEl.textContent = `${data.misses || 0}`;
    if (ppEl) {
        if (data.pp && data.pp > 0) {
            ppEl.textContent = `${data.pp.toFixed(1)} PP`;
        } else {
            ppEl.textContent = data.passed ? 'Пасс (No PP)' : 'Провал (Fail)';
        }
    }

    if (badge) {
        if (data.passed) {
            badge.textContent = `Скор зафиксирован: ранг ${rank}`;
            badge.style.color = '#22c55e';
            badge.style.background = 'rgba(34, 197, 94, 0.15)';
        } else {
            badge.textContent = 'Провал (Fail / D / F)';
            badge.style.color = '#ef4444';
            badge.style.background = 'rgba(239, 68, 68, 0.15)';
        }
    }
}

/* ========================================================
   AUDIO PREVIEW CONTROLLER
======================================================== */
function setupPreviewAudio(previewUrl) {
    stopAudio();
    if (!previewUrl) {
        document.getElementById('btnPlayPause').disabled = true;
        return;
    }

    document.getElementById('btnPlayPause').disabled = false;
    currentAudio = new Audio(previewUrl);
    currentAudio.volume = window.soundController.volume;

    currentAudio.addEventListener('timeupdate', () => {
        if (!currentAudio) return;
        const cur = currentAudio.currentTime;
        const dur = currentAudio.duration || 30;
        document.getElementById('seekSlider').value = (cur / dur) * 100;
        document.getElementById('playerCurrentTime').textContent = formatTime(cur);
    });

    currentAudio.addEventListener('loadedmetadata', () => {
        if (currentAudio) {
            document.getElementById('playerDuration').textContent = formatTime(currentAudio.duration);
        }
    });

    currentAudio.addEventListener('ended', () => {
        document.getElementById('btnPlayPause').innerHTML = SVG_PLAY_ICON;
        document.getElementById('seekSlider').value = 0;
        document.getElementById('playerCurrentTime').textContent = '0:00';
    });

    // Auto-play preview
    toggleAudio();
}

function toggleAudio() {
    if (!currentAudio) return;
    const btn = document.getElementById('btnPlayPause');
    if (currentAudio.paused) {
        currentAudio.volume = window.soundController.volume;
        currentAudio.play().then(() => {
            btn.innerHTML = SVG_PAUSE_ICON;
        }).catch(() => {
            btn.innerHTML = SVG_PLAY_ICON;
        });
    } else {
        currentAudio.pause();
        btn.innerHTML = SVG_PLAY_ICON;
    }
}

function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    const btn = document.getElementById('btnPlayPause');
    if (btn) btn.innerHTML = SVG_PLAY_ICON;
    const slider = document.getElementById('seekSlider');
    if (slider) slider.value = 0;
}

/* ========================================================
   SESSION HISTORY (PERSISTENT VIA /api/history)
======================================================== */
async function addToSessionHistory(card, stats, mods) {
    const entry = {
        card,
        stats,
        mods,
        time: new Date().toISOString()
    };
    sessionHistory.unshift(entry);
    sessionHistory = sessionHistory.slice(0, 50);
    renderSessionHistory();

    // Persist to backend / cache/history.json
    try {
        await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        });
    } catch (e) {
        console.warn('Error saving history to server:', e);
    }
}

function renderSessionHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';
    const countEl = document.getElementById('historyCountText');
    if (countEl) {
        countEl.textContent = `${sessionHistory.length} карт`;
    }

    sessionHistory.slice(0, 16).forEach((item) => {
        const el = document.createElement('div');
        el.className = 'history-card';
        const cover = item.card.card_url || item.card.cover_url || 'https://assets.ppy.sh/beatmaps/covers/cover.jpg';
        const sr = item.stats ? item.stats.stars : item.card.difficulty_rating;
        const psClass = item.card.playstyle || 'balanced';
        const psName = item.card.playstyle_name || 'Balanced';

        el.innerHTML = `
            <img class="history-cover" src="${cover}" alt="Thumb" loading="lazy">
            <div class="history-content">
                <div class="history-title" title="${item.card.title}">${item.card.title}</div>
                <div class="history-meta">${item.card.artist} • [${item.card.version}]</div>
                <div style="display: flex; gap: 5px; align-items: center; margin-top: 2px;">
                    <span style="font-size: 10px; font-weight: 700; color: ${getDifficultyColor(sr)};">${sr.toFixed(2)}★</span>
                    <span style="font-size: 10px; color: var(--text-muted);">${item.mods && item.mods !== 'NM' ? '+' + item.mods : 'NM'}</span>
                    <span class="playstyle-pill pill-${psClass}" style="font-size: 8px; padding: 1px 4px;">${psName}</span>
                    <span style="font-size: 10px; color: var(--accent-gold); margin-left: auto;">${item.stats?.pp_100 ? Math.round(item.stats.pp_100) + ' PP' : ''}</span>
                </div>
            </div>
        `;
        list.appendChild(el);
    });
}

// Quick SR Presets
document.addEventListener('DOMContentLoaded', () => {
    const srMinEl = document.getElementById('inputSrMin');
    const srMaxEl = document.getElementById('inputSrMax');
    const srLabel = document.getElementById('srLabel');
    const presetBtns = document.querySelectorAll('.sr-preset-btn');

    function syncPresetActiveState() {
        if (!srMinEl || !srMaxEl) return;
        const minV = parseFloat(srMinEl.value);
        const maxV = parseFloat(srMaxEl.value);
        presetBtns.forEach(btn => {
            const pMin = parseFloat(btn.dataset.min);
            const pMax = parseFloat(btn.dataset.max);
            btn.classList.toggle('active', Math.abs(minV - pMin) < 0.01 && Math.abs(maxV - pMax) < 0.01);
        });
    }

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (!srMinEl || !srMaxEl) return;
            srMinEl.value = btn.dataset.min;
            srMaxEl.value = btn.dataset.max;
            if (srLabel) {
                srLabel.textContent = `${parseFloat(btn.dataset.min).toFixed(1)}★ – ${parseFloat(btn.dataset.max).toFixed(1)}★`;
            }
            srMinEl.dispatchEvent(new Event('input', { bubbles: true }));
            srMaxEl.dispatchEvent(new Event('input', { bubbles: true }));
            syncPresetActiveState();
        });
    });

    if (srMinEl && srMaxEl) {
        srMinEl.addEventListener('input', syncPresetActiveState);
        srMaxEl.addEventListener('input', syncPresetActiveState);
        syncPresetActiveState();
    }
});

// ========================================================
