// Procedural Web Audio API sound generator for osu! Map Roulette
class SoundController {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.7;
    }

    init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playTick(pitchModifier = 1.0) {
        if (!this.enabled) return;
        this.init();
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // High crisp wood/plastic tick like CS2 case wheel
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(650 * pitchModifier, now);
            osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);

            gain.gain.setValueAtTime(0.25 * this.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.04);
        } catch (e) {
            console.warn('Audio tick error:', e);
        }
    }

    playModTick() {
        if (!this.enabled) return;
        this.init();
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);

            gain.gain.setValueAtTime(0.2 * this.volume, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.05);
        } catch (e) {
            console.warn('Audio mod tick error:', e);
        }
    }

    playWinChime() {
        if (!this.enabled) return;
        this.init();
        try {
            const now = this.ctx.currentTime;
            // Majestic major 7th chord (C5, E5, G5, B5, D6)
            const freqs = [523.25, 659.25, 783.99, 987.77, 1174.66];
            freqs.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const startTime = now + idx * 0.06;

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);

                gain.gain.setValueAtTime(0.001, startTime);
                gain.gain.linearRampToValueAtTime(0.3 * this.volume, startTime + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.2);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(startTime);
                osc.stop(startTime + 1.25);
            });
        } catch (e) {
            console.warn('Audio win chime error:', e);
        }
    }

    playLadderSuccess() {
        if (!this.enabled) return;
        this.init();
        try {
            const now = this.ctx.currentTime;
            const freqs = [440, 554.37, 659.25, 880];
            freqs.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const startTime = now + idx * 0.07;

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, startTime);

                gain.gain.setValueAtTime(0.2 * this.volume, startTime);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(startTime);
                osc.stop(startTime + 0.35);
            });
        } catch (e) {
            console.warn('Audio ladder error:', e);
        }
    }
}

window.soundController = new SoundController();
