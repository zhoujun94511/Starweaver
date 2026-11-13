// Rich Web Audio API procedural sound & interactive foley synthesizer — zero external audio files.
// Includes: dynamic wind LFO, ethereal pentatonic desert chimes, rolling sand footsteps,
// UI hover/click/modal feedback, proximity target lock ping, spatial station hums,
// Milo's cute helper chirps, barrier buzz, harvest clinks, and cinematic launch audio.

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.masterGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.furnaceHumGain = null;
    this.fabHumGain = null;

    this._stepCooldown = 0;
    this._jetCooldown = 0;
    this._chimeTimer = 7.5;
    this._noiseBuffer = null;
    this._resumingPromise = null;
  }

  ensureContext() {
    if (this.muted) return false;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.36;
        this.masterGain.connect(this.ctx.destination);
        this._buildSharedNoiseBuffer();
        this._startAmbientSoundscape();
      } catch {
        this.ctx = null;
        return false;
      }
    }
    if (this.ctx.state === 'suspended' && !this._resumingPromise) {
      this._resumingPromise = this.ctx
        .resume()
        .catch(() => {})
        .finally(() => {
          this._resumingPromise = null;
        });
    }
    // Guard against scheduling oscillators onto a frozen suspended timeline (prevents delayed burst race!)
    return this.ctx.state === 'running';
  }

  handleVisibilityChange(hidden) {
    if (!this.ctx) return;
    if (hidden) {
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (!this.muted && this.ctx.state === 'suspended' && !this._resumingPromise) {
      this._resumingPromise = this.ctx
        .resume()
        .catch(() => {})
        .finally(() => {
          this._resumingPromise = null;
        });
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0.0 : 0.36,
        this.ctx.currentTime,
        0.05
      );
    }
  }

  _buildSharedNoiseBuffer() {
    if (!this.ctx) return;
    const len = this.ctx.sampleRate * 2;
    this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 1.9;
    }
  }

  _startAmbientSoundscape() {
    if (!this.ctx || !this.masterGain || !this._noiseBuffer) return;
    try {
      // 1. Desert breeze with slow LFO filter sweep (organic breathing wind)
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer;
      src.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 250;
      this.windFilter.Q.value = 1.4;

      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.09; // ~11s gentle swell cycle
      const lfoDepth = this.ctx.createGain();
      lfoDepth.gain.value = 110;
      lfo.connect(lfoDepth);
      lfoDepth.connect(this.windFilter.frequency);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.065;

      src.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      src.start();
      lfo.start();

      // 2. Spatial station hum oscillators (modulated dynamically by player distance & queue)
      const fOsc = this.ctx.createOscillator();
      fOsc.type = 'triangle';
      fOsc.frequency.value = 92.5; // Warm low solar hearth drone
      this.furnaceHumGain = this.ctx.createGain();
      this.furnaceHumGain.gain.value = 0.0;
      fOsc.connect(this.furnaceHumGain);
      this.furnaceHumGain.connect(this.masterGain);
      fOsc.start();

      const fabOsc = this.ctx.createOscillator();
      fabOsc.type = 'sine';
      fabOsc.frequency.value = 220.0; // Clean precision servo hum
      this.fabHumGain = this.ctx.createGain();
      this.fabHumGain.gain.value = 0.0;
      fabOsc.connect(this.fabHumGain);
      this.fabHumGain.connect(this.masterGain);
      fabOsc.start();
    } catch {
      // Ignore if browser blocks audio nodes before gesture
    }
  }

  setWeatherIntensity(sandstormWeight = 0, overcastWeight = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const storm = Math.max(0, Math.min(1, sandstormWeight));
    const over = Math.max(0, Math.min(1, overcastWeight));
    if (this.windGain) {
      const targetGain = 0.062 + over * 0.025 + storm * 0.145;
      this.windGain.gain.setTargetAtTime(targetGain, now, 0.25);
    }
    if (this.windFilter) {
      const targetFreq = 250 + over * 65 + storm * 340;
      this.windFilter.frequency.setTargetAtTime(targetFreq, now, 0.25);
    }
  }

  /**
   * Updates continuous spatial audio cues & occasional calm pentatonic starlight notes.
   */
  updateSpatial(dt, robotPos, furnaceBusy = false, inCutscene = false) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    if (inCutscene) {
      if (this.furnaceHumGain) this.furnaceHumGain.gain.setTargetAtTime(0, now, 0.1);
      if (this.fabHumGain) this.fabHumGain.gain.setTargetAtTime(0, now, 0.1);
      return;
    }

    // Spatial distance attenuation to Solar Furnace (8.2, 2.2) & Fabricator (-8.2, 2.2)
    if (this.furnaceHumGain && robotPos) {
      const dFurnace = Math.hypot(robotPos.x - 8.2, robotPos.z - 2.2);
      const prox = Math.max(0, 1 - dFurnace / 13.0);
      const targetGain = prox * prox * (furnaceBusy ? 0.095 : 0.028);
      this.furnaceHumGain.gain.setTargetAtTime(targetGain, now, 0.12);
    }

    if (this.fabHumGain && robotPos) {
      const dFab = Math.hypot(robotPos.x + 8.2, robotPos.z - 2.2);
      const prox = Math.max(0, 1 - dFab / 12.0);
      const targetGain = prox * prox * (furnaceBusy ? 0.075 : 0.018);
      this.fabHumGain.gain.setTargetAtTime(targetGain, now, 0.12);
    }

    // Serene Outer-Wilds / Journey inspired sparse pentatonic harmonic note every ~10–16s
    this._chimeTimer -= dt;
    if (this._chimeTimer <= 0) {
      this._chimeTimer = 10.5 + Math.random() * 6.5;
      const scale = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
      const n1 = scale[Math.floor(Math.random() * scale.length)];
      this._tone(n1, n1 * 1.002, 1.65, 'sine', 0.042, 0);
      if (Math.random() > 0.45) {
        const n2 = scale[Math.floor(Math.random() * scale.length)];
        this._tone(n2, n2, 1.45, 'sine', 0.032, 0.38);
      }
    }
  }

  _tone(freq, endFreq, duration, type = 'sine', gainPeak = 0.25, delay = 0) {
    if (!this.ensureContext()) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + Math.min(0.025, duration * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  _noiseBurst(duration = 0.06, centerFreq = 900, gainPeak = 0.06, delay = 0) {
    if (!this.ensureContext() || !this._noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(centerFreq, t0);
    filter.Q.value = 1.8;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    src.start(t0, Math.random() * 0.8, duration + 0.02);
  }

  playStep(dt, speedRatio = 1) {
    this._stepCooldown -= dt;
    if (this._stepCooldown > 0) return;
    this._stepCooldown = Math.max(0.17, 0.3 / Math.max(0.6, speedRatio));
    // Soft rubber wheel tread + gentle sand crunch
    this._tone(125 + Math.random() * 22, 82, 0.05, 'triangle', 0.048);
    this._noiseBurst(0.045, 1150 + Math.random() * 350, 0.035);
  }

  playUiClick() {
    this._tone(660, 880, 0.055, 'sine', 0.09, 0);
  }

  playModalOpen() {
    this._tone(440, 660, 0.09, 'sine', 0.1, 0);
    this._tone(660, 880, 0.09, 'triangle', 0.08, 0.045);
  }

  playModalClose() {
    this._tone(620, 410, 0.085, 'sine', 0.085, 0);
  }

  playTargetFocus() {
    // Subtle, non-fatiguing soft sonar tick when walking into interaction range
    this._tone(920, 1120, 0.045, 'sine', 0.045, 0);
  }

  playRobotChirp(mood = 'curious') {
    if (mood === 'happy') {
      this._tone(740, 1080, 0.09, 'sine', 0.13, 0);
      this._tone(1080, 1420, 0.11, 'sine', 0.12, 0.08);
    } else if (mood === 'warn') {
      this._tone(420, 310, 0.11, 'triangle', 0.12, 0);
      this._tone(310, 250, 0.13, 'triangle', 0.11, 0.09);
    } else {
      this._tone(680, 920, 0.08, 'sine', 0.11, 0);
      this._tone(880, 760, 0.08, 'sine', 0.09, 0.07);
    }
  }

  playBarrierBump() {
    this._tone(155, 95, 0.18, 'sawtooth', 0.11, 0);
    this._tone(310, 210, 0.14, 'sine', 0.09, 0.03);
  }

  playGather(isCrystal = false) {
    if (isCrystal) {
      this._tone(720, 1040, 0.16, 'sine', 0.2, 0);
      this._tone(1080, 1480, 0.22, 'triangle', 0.17, 0.065);
      this._tone(1560, 1760, 0.18, 'sine', 0.11, 0.12);
    } else {
      this._noiseBurst(0.07, 650, 0.07, 0);
      this._tone(250, 165, 0.11, 'triangle', 0.2, 0);
      this._tone(510, 680, 0.14, 'sine', 0.15, 0.055);
    }
  }

  playCraftStart(station = 'furnace') {
    if (station === 'furnace') {
      this._noiseBurst(0.18, 480, 0.09, 0);
      this._tone(180, 330, 0.28, 'sawtooth', 0.11, 0);
      this._tone(360, 540, 0.24, 'triangle', 0.13, 0.08);
    } else {
      this._tone(460, 680, 0.11, 'square', 0.08, 0);
      this._tone(620, 920, 0.14, 'triangle', 0.12, 0.08);
    }
  }

  playCraftComplete() {
    this._tone(523.25, 523.25, 0.13, 'triangle', 0.19, 0);
    this._tone(659.25, 659.25, 0.17, 'triangle', 0.21, 0.085);
    this._tone(783.99, 1046.5, 0.26, 'sine', 0.23, 0.17);
  }

  playError() {
    this._tone(240, 175, 0.16, 'sawtooth', 0.11, 0);
  }

  playFacilityActivate() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, i) => {
      this._tone(n, n * 1.02, 0.22, 'sine', 0.18, i * 0.07);
    });
  }

  playRepairInstall() {
    const notes = [392.0, 493.88, 587.33, 783.99, 1046.5];
    notes.forEach((n, i) => {
      this._tone(n, n, 0.28, 'triangle', 0.22, i * 0.085);
    });
  }

  playLaunchSequence() {
    if (!this.ensureContext()) return;
    this._noiseBurst(2.2, 220, 0.16, 0);
    this._tone(65, 145, 2.4, 'sawtooth', 0.2, 0);
    this._tone(110, 220, 2.4, 'triangle', 0.18, 0.2);
    const fanfare = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    fanfare.forEach((n, idx) => {
      this._tone(n, n, 0.48, 'sine', 0.2, 0.9 + idx * 0.22);
    });
  }

  playHomecomingChime() {
    const chord = [523.25, 659.25, 783.99, 987.77, 1046.5];
    chord.forEach((n, idx) => {
      this._tone(n, n, 0.65, 'sine', 0.18, idx * 0.14);
    });
  }

  playIntroDescentWhoosh() {
    if (!this.ensureContext()) return;
    // Atmospheric entry roar + descent whistle
    this._noiseBurst(2.5, 340, 0.14, 0);
    this._tone(210, 68, 2.3, 'sawtooth', 0.13, 0);
    // Sandy crater impact thud at ~2.55s + power conduit spark crackle
    this._noiseBurst(0.65, 160, 0.22, 2.5);
    this._tone(95, 38, 0.55, 'triangle', 0.24, 2.5);
    this._tone(880, 320, 0.14, 'sawtooth', 0.09, 2.95);
  }

  playIntroWakeup() {
    if (!this.ensureContext()) return;
    // Warm ascending 4-note Milo boot chime + cheerful chirp
    const bootNotes = [392.0, 523.25, 659.25, 783.99];
    bootNotes.forEach((n, i) => {
      this._tone(n, n * 1.01, 0.2, 'sine', 0.14, i * 0.11);
    });
    this._tone(987.77, 1174.66, 0.16, 'triangle', 0.13, 0.55);
  }

  playSonarPing(foundCount = 0) {
    if (!this.ensureContext()) return;
    // Outward seismic radar sweep + crystalline echo blips
    this._tone(1160, 580, 0.34, 'sine', 0.17, 0);
    this._tone(580, 880, 0.28, 'triangle', 0.11, 0.08);
    const echoes = Math.min(3, foundCount);
    for (let i = 0; i < echoes; i++) {
      this._tone(1320 + i * 160, 1480 + i * 160, 0.14, 'sine', 0.12, 0.28 + i * 0.11);
    }
  }

  playGeoDrill() {
    if (!this.ensureContext()) return;
    // Rotary auger torque rumble + rock fracture + crystal pop chime!
    this._noiseBurst(0.45, 420, 0.16, 0);
    this._tone(115, 72, 0.42, 'sawtooth', 0.16, 0);
    this._tone(210, 145, 0.36, 'triangle', 0.14, 0.05);
    this._tone(680, 1120, 0.22, 'sine', 0.19, 0.34);
    this._tone(1120, 1480, 0.2, 'triangle', 0.15, 0.42);
  }

  playJetpackPulse(dt) {
    this._jetCooldown -= dt;
    if (this._jetCooldown > 0) return;
    this._jetCooldown = 0.095;
    this._noiseBurst(0.11, 780 + Math.random() * 180, 0.055, 0);
    this._tone(195 + Math.random() * 20, 245, 0.1, 'triangle', 0.052, 0);
  }
}
