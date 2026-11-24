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

// Document Ready
document.addEventListener('DOMContentLoaded', async () => {
    await initConfig();
    await initHistory();
    await initProfile();
    initUIEvents();
    populatePlaceholderReel();
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
        if (vol <= 0.01) icon.textContent = '🔇';
        else if (vol < 0.5) icon.textContent = '🔉';
        else icon.textContent = '🔊';
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
        btn.innerHTML = '⏳ Запуск...';
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
            btn.innerHTML = '🚀 Запущено в osu!';
            setTimeout(() => { btn.innerHTML = oldText; btn.disabled = false; }, 2500);
        } catch (e) {
            btn.innerHTML = '❌ Ошибка';
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
        btn.textContent = 'Индексация...';
        btn.disabled = true;
        try {
            const res = await fetch('/api/local/reindex', { method: 'POST' });
            const data = await res.json();
            checkLocalStatus();
            initProfile();
        } catch (e) {
            console.error(e);
        } finally {
            btn.textContent = '⟳ Обновить базу client.realm';
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

// Initial placeholder cards
function populatePlaceholderReel() {
    const track = document.getElementById('rouletteTrack');
    track.innerHTML = '';
    
    for (let i = 0; i < 25; i++) {
        const card = document.createElement('div');
        card.className = 'map-card';
        card.innerHTML = `
            <img class="card-bg-img" src="https://assets.ppy.sh/beatmaps/covers/cover.jpg" alt="Cover">
            <div class="map-card-content">
                <div class="map-sr-pill" style="background: #4290fb;">4.20★</div>
                <div class="map-title">osu! Beatmap #${i + 1}</div>
                <div class="map-artist">Artist Name</div>
                <div class="map-version">Normal</div>
            </div>
        `;
        track.appendChild(card);
    }
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
    btnSpin.innerHTML = '<span>🌀 КАТИТСЯ...</span>';

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

    let rollData = null;
    try {
        const res = await fetch('/api/roll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Ошибка сервера' }));
            alert(err.detail || 'Не найдено карт по заданным фильтрам.');
            btnSpin.disabled = false;
            btnSpin.innerHTML = '<span>🎰 КРУТИТЬ РУЛЕТКУ</span>';
            isSpinning = false;
            return;
        }
        rollData = await res.json();
    } catch (e) {
        console.error('Roll error:', e);
        alert('Не удалось связаться с сервером. Попробуйте еще раз.');
        btnSpin.disabled = false;
        btnSpin.innerHTML = '<span>🎰 КРУТИТЬ РУЛЕТКУ</span>';
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
        btnSpin.innerHTML = '<span>⚡ СИНХРОНИЗАЦИЯ ЛОББИ...</span>';
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
        btnSpin.innerHTML = '<span>🎰 КРУТИТЬ РУЛЕТКУ</span>';

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
        badge.textContent = '🔍 Сканирование client.realm...';
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
                    badge.textContent = `🎉 Победа в Лесенке! Следующий уровень разблокирован (+Next)`;
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
            badge.textContent = `✔️ Скор зафиксирован: ранг ${rank}`;
            badge.style.color = '#22c55e';
            badge.style.background = 'rgba(34, 197, 94, 0.15)';
        } else {
            badge.textContent = `❌ Провал (Fail / D / F)`;
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
        document.getElementById('btnPlayPause').innerHTML = '▶';
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
            btn.innerHTML = '⏸';
        }).catch(() => {
            btn.innerHTML = '▶';
        });
    } else {
        currentAudio.pause();
        btn.innerHTML = '▶';
    }
}

function stopAudio() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
    }
    const btn = document.getElementById('btnPlayPause');
    if (btn) btn.innerHTML = '▶';
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
// V2.0 FEATURES: THEME, SIDEBAR, OVERLAY, LOBBY, OSDB, ANTI-TILT
// ========================================================
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

    if (bgImg === 'none') {
        bgLayer.style.backgroundImage = 'none';
        bgLayer.style.opacity = '0';
    } else {
        bgLayer.style.backgroundImage = `url('/static/backgrounds/${bgImg}')`;
        bgLayer.style.opacity = '1';
    }

    bgLayer.style.filter = `blur(${blur}px)`;
    bgOverlay.style.background = `rgba(9, 9, 11, ${dim})`;

    document.body.classList.remove('theme-glass', 'theme-dark', 'theme-transparent');
    document.body.classList.add(`theme-${style}`);

    // Sync controls inside modal
    document.querySelectorAll('.bg-thumb-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.bg === bgImg);
    });
    document.querySelectorAll('.style-pill-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.style === style);
    });
    const dimSlider = document.getElementById('sliderBgDim');
    const dimVal = document.getElementById('bgDimVal');
    if (dimSlider) dimSlider.value = dim;
    if (dimVal) dimVal.textContent = `${Math.round(dim * 100)}%`;

    const blurSlider = document.getElementById('sliderBgBlur');
    const blurVal = document.getElementById('bgBlurVal');
    if (blurSlider) blurSlider.value = blur;
    if (blurVal) blurVal.textContent = `${blur}px`;

    const hkSel = document.getElementById('selectOverlayHotkey');
    if (hkSel && cfg.overlay_hotkey) hkSel.value = cfg.overlay_hotkey;

    const irSel = document.getElementById('selectInstantRollHotkey');
    if (irSel && cfg.instant_roll_hotkey) irSel.value = cfg.instant_roll_hotkey;

    const alChk = document.getElementById('toggleOverlayAutoLaunch');
    if (alChk) alChk.checked = Boolean(cfg.overlay_auto_launch);

    const autoChk = document.getElementById('toggleOverlayAutostart');
    if (autoChk) autoChk.checked = Boolean(cfg.overlay_autostart);
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

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load & apply initial theme/sidebar config
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const cfg = await res.json();
            Object.assign(currentConfig, cfg);
            applyThemeVisuals(currentConfig);

            const sidebar = document.getElementById('mainSidebar');
            const toggleIcon = document.getElementById('sidebarToggleIcon');
            if (cfg.sidebar_collapsed && sidebar) {
                sidebar.classList.add('collapsed');
                if (toggleIcon) toggleIcon.textContent = '⟩';
            }
        }
    } catch (e) {}

    // 2. Sidebar Collapse Toggle
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    if (btnToggleSidebar) {
        btnToggleSidebar.addEventListener('click', () => {
            const sidebar = document.getElementById('mainSidebar');
            const toggleIcon = document.getElementById('sidebarToggleIcon');
            if (!sidebar) return;
            const collapsed = sidebar.classList.toggle('collapsed');
            if (toggleIcon) toggleIcon.textContent = collapsed ? '⟩' : '⟨';
            saveThemeConfigPatch({ sidebar_collapsed: collapsed });
        });
    }

    // 3. Theme Modal Bindings
    const themeModal = document.getElementById('themeModal');
    document.getElementById('btnOpenTheme')?.addEventListener('click', () => {
        if (themeModal) themeModal.style.display = 'flex';
    });
    document.getElementById('btnCloseTheme')?.addEventListener('click', () => {
        if (themeModal) themeModal.style.display = 'none';
    });
    themeModal?.addEventListener('click', (e) => {
        if (e.target === themeModal) themeModal.style.display = 'none';
    });

    document.querySelectorAll('.bg-thumb-btn').forEach(btn => {
        btn.addEventListener('click', () => saveThemeConfigPatch({ bg_image: btn.dataset.bg }));
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
    document.getElementById('selectOverlayHotkey')?.addEventListener('change', (e) => {
        saveThemeConfigPatch({ overlay_hotkey: e.target.value });
        showToast(`Хоткей оверлея: ${e.target.value}`);
    });
    document.getElementById('selectInstantRollHotkey')?.addEventListener('change', (e) => {
        saveThemeConfigPatch({ instant_roll_hotkey: e.target.value });
        showToast(`Хоткей быстрой крутки: ${e.target.value}`);
    });
    document.getElementById('toggleOverlayAutoLaunch')?.addEventListener('change', (e) => {
        saveThemeConfigPatch({ overlay_auto_launch: e.target.checked });
    });
    document.getElementById('toggleOverlayAutostart')?.addEventListener('change', (e) => {
        saveThemeConfigPatch({ overlay_autostart: e.target.checked });
    });

    // 4. Steam-like Overlay Button
    const btnOverlay = document.getElementById('btnToggleOverlay');
    let overlayActive = false;
    async function refreshOverlayBtn() {
        try {
            const res = await fetch('/api/overlay/state');
            if (res.ok) {
                const st = await res.json();
                overlayActive = Boolean(st.is_open);
                if (btnOverlay) {
                    btnOverlay.classList.toggle('active-overlay', overlayActive);
                    btnOverlay.textContent = overlayActive ? '🎮 Оверлей (Вкл)' : '🎮 Оверлей';
                }
            }
        } catch (e) {}
    }
    btnOverlay?.addEventListener('click', async () => {
        if (overlayActive) {
            await fetch('/api/overlay/close', { method: 'POST' });
            showToast('Игровой оверлей закрыт');
        } else {
            await fetch('/api/overlay/open?expanded=true', { method: 'POST' });
            showToast(`Оверлей запущен! Нажмите ${currentConfig.overlay_hotkey || 'F9'} чтобы свернуть в Click-Through`);
        }
        refreshOverlayBtn();
    });
    setInterval(refreshOverlayBtn, 2500);

    // 5. Collections Export (.osdb)
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

    // 6. Multiplayer Sync Lobby
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
        showToast(`Комната ${data.room_code} создана!`);
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
        showToast(`Вы вошли в комнату ${data.room_code}!`);
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
            showToast(`Код ${code} скопирован в буфер обмена!`);
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

                // Render members
                const mList = document.getElementById('lobbyMembersList');
                if (mList) {
                    mList.innerHTML = '';
                    st.members.forEach(m => {
                        const chip = document.createElement('div');
                        chip.className = 'lobby-member-chip';
                        chip.innerHTML = `
                            <img src="${m.avatar || 'https://assets.ppy.sh/favicon/favicon-32x32.png'}" alt="">
                            <span>${m.name}${m.is_host ? ' 👑' : ''}</span>
                        `;
                        mList.appendChild(chip);
                    });
                }

                // Render round scores leaderboard
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
                                    <strong style="color:#ff6699;">${Math.round(s.pp)} PP</strong>
                                </div>
                            `;
                            lbList.appendChild(row);
                        });
                    } else {
                        lbList.innerHTML = '<div class="lobby-empty">Сыграйте выпавшую карту в osu!(lazer), чтобы результаты появились здесь автоматически.</div>';
                    }
                }

                // Sync remote spin from another player/host
                if (st.latest_spin && st.latest_spin.spin_id && st.latest_spin.spin_id !== lastSyncedSpinId) {
                    lastSyncedSpinId = st.latest_spin.spin_id;
                    if (st.latest_spin.sender_id !== myLobbyClientId && typeof startRouletteAnimationWithData === 'function') {
                        showToast(`🎲 ${st.latest_spin.host_name || 'Хост'} запустил прокрутку!`);
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

    // 7. Anti-Tilt Detector
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
});
