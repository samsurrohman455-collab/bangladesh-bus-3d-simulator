(function (global) {
  'use strict';

  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.engineGain = null;
      this.engineOsc1 = null;
      this.engineOsc2 = null;
      this.engineFilter = null;
      this.turboOsc = null;
      this.turboGain = null;
      this.noiseBuffer = null;
      this.rainGain = null;
      this.rainFilter = null;
      this.windGain = null;
      this.tireGain = null;
      this.tireFilter = null;
      this.riverGain = null;
      this.hornOsc1 = null;
      this.hornOsc2 = null;
      this.hornGain = null;
      this.enabled = true;
      this.volume = 0.8;
      this.initialized = false;
      this.horning = false;
      this.ambienceTimer = 1.5;
      this.paxCount = 0;
    }

    init() {
      if (this.initialized) {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        return;
      }

      const AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;

      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.enabled ? this.volume * 0.45 : 0;
        this.masterGain.connect(this.ctx.destination);

        // Shared 1.5s white noise buffer for rain, wind, tire friction, thunder & river flow
        const bufLen = Math.floor(this.ctx.sampleRate * 1.5);
        this.noiseBuffer = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufLen; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        // 1. Diesel Engine Dual-Oscillator + Lowpass
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.value = 180;
        this.engineFilter.Q.value = 2.4;

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.001;

        this.engineOsc1 = this.ctx.createOscillator();
        this.engineOsc1.type = 'sawtooth';
        this.engineOsc1.frequency.value = 38;

        this.engineOsc2 = this.ctx.createOscillator();
        this.engineOsc2.type = 'triangle';
        this.engineOsc2.frequency.value = 76;

        this.engineOsc1.connect(this.engineFilter);
        this.engineOsc2.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.masterGain);

        this.engineOsc1.start();
        this.engineOsc2.start();

        // 2. Turbocharger Spool Whine
        this.turboOsc = this.ctx.createOscillator();
        this.turboOsc.type = 'sine';
        this.turboOsc.frequency.value = 950;
        this.turboGain = this.ctx.createGain();
        this.turboGain.gain.value = 0.0001;
        this.turboOsc.connect(this.turboGain);
        this.turboGain.connect(this.masterGain);
        this.turboOsc.start();

        // 3. Looping Noise Channels (Rain on roof, Wind, Tire/Road friction, River flow)
        const makeLoopNoise = (filterType, freq, q) => {
          const src = this.ctx.createBufferSource();
          src.buffer = this.noiseBuffer;
          src.loop = true;
          const filter = this.ctx.createBiquadFilter();
          filter.type = filterType;
          filter.frequency.value = freq;
          if (q) filter.Q.value = q;
          const gain = this.ctx.createGain();
          gain.gain.value = 0.0001;
          src.connect(filter);
          filter.connect(gain);
          gain.connect(this.masterGain);
          src.start();
          return { filter, gain };
        };

        const rainCh = makeLoopNoise('bandpass', 1550, 0.8);
        this.rainFilter = rainCh.filter;
        this.rainGain = rainCh.gain;

        const windCh = makeLoopNoise('lowpass', 380, 0.7);
        this.windGain = windCh.gain;

        const tireCh = makeLoopNoise('bandpass', 620, 1.1);
        this.tireFilter = tireCh.filter;
        this.tireGain = tireCh.gain;

        const riverCh = makeLoopNoise('lowpass', 520, 0.5);
        this.riverGain = riverCh.gain;

        this.initialized = true;
      } catch (_) {
        // Ignore audio init errors on restricted devices
      }
    }

    setConfig(enabled, volumePct) {
      this.enabled = !!enabled;
      this.volume = Math.max(0, Math.min(1, (volumePct ?? 80) / 100));
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setTargetAtTime(
          this.enabled ? this.volume * 0.45 : 0,
          this.ctx.currentTime,
          0.05
        );
      }
    }

    updateEngine(rpmNormalized, throttle, isDriving) {
      if (!this.initialized || !this.ctx || !this.engineGain) return;
      const now = this.ctx.currentTime;
      if (!isDriving || !this.enabled) {
        this.engineGain.gain.setTargetAtTime(0.0001, now, 0.08);
        if (this.turboGain) this.turboGain.gain.setTargetAtTime(0.0001, now, 0.08);
        return;
      }
      const baseFreq = 34 + rpmNormalized * 78;
      this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.98, now, 0.06);
      this.engineFilter.frequency.setTargetAtTime(140 + rpmNormalized * 460 + throttle * 180, now, 0.06);
      this.engineGain.gain.setTargetAtTime(0.18 + throttle * 0.16, now, 0.06);

      // Turbo spool whine above moderate load
      if (this.turboOsc && this.turboGain) {
        const turboLvl = Math.max(0, (rpmNormalized - 0.35) * (0.4 + throttle * 0.6));
        this.turboOsc.frequency.setTargetAtTime(920 + rpmNormalized * 1650, now, 0.08);
        this.turboGain.gain.setTargetAtTime(turboLvl * 0.028, now, 0.08);
      }
    }

    updateEnvironmentAudio(dt, ctx) {
      if (!this.initialized || !this.ctx || !this.enabled) return;
      const now = this.ctx.currentTime;
      const active = !!ctx.isDriving;

      // Rain patter on vehicle body
      const rainAmt = active ? (ctx.rainIntensity || 0) : (ctx.rainIntensity || 0) * 0.35;
      if (this.rainGain && this.rainFilter) {
        this.rainFilter.frequency.setTargetAtTime(1100 + rainAmt * 950, now, 0.15);
        this.rainGain.gain.setTargetAtTime(rainAmt * 0.14, now, 0.15);
      }

      // Wind rush noise (speed + storm wind)
      const windLevel = active
        ? Math.min(1, (ctx.speedKmh || 0) / 130) * 0.75 + (ctx.windStrength || 0) * 0.35
        : (ctx.windStrength || 0) * 0.12;
      if (this.windGain) {
        this.windGain.gain.setTargetAtTime(windLevel * 0.09, now, 0.12);
      }

      // Tire friction / wet spray / gravel rumble / hard brake squeal
      if (this.tireGain && this.tireFilter) {
        if (!active || (ctx.speedKmh || 0) < 4) {
          this.tireGain.gain.setTargetAtTime(0.0001, now, 0.08);
        } else {
          const spdN = Math.min(1, ctx.speedKmh / 100);
          const brakingHard = ctx.isBraking && ctx.speedKmh > 22;
          const rough = ctx.surfaceType === 'village' || ctx.surfaceType === 'grass' || ctx.isBrokenRoad;
          const freq = brakingHard ? 1450 : rough ? 260 : ctx.rainIntensity > 0.2 ? 980 : 540;
          const lvl = brakingHard ? 0.11 : rough ? spdN * 0.09 : spdN * (0.04 + (ctx.rainIntensity || 0) * 0.05);
          this.tireFilter.frequency.setTargetAtTime(freq, now, 0.08);
          this.tireGain.gain.setTargetAtTime(lvl, now, 0.08);
        }
      }

      // River water flow ambience
      if (this.riverGain) {
        this.riverGain.gain.setTargetAtTime(ctx.nearRiver ? 0.065 : 0.0001, now, 0.25);
      }

      // Periodic Bangladesh Environment Ambience (birds, night crickets, rickshaw bell, terminal chime, passenger murmur)
      this.paxCount = ctx.paxCount || 0;
      if (!active) return;
      this.ambienceTimer -= dt;
      if (this.ambienceTimer <= 0) {
        this.ambienceTimer = 4.2 + Math.random() * 4.5;
        if (ctx.isDark && (ctx.rainIntensity || 0) < 0.3) {
          // Night insects / crickets
          this.playCricketChirp();
        } else if (!ctx.isDark && (ctx.rainIntensity || 0) < 0.25 && ctx.speedKmh < 45) {
          // Morning/day birds singing in rural Bangladesh
          this.playBirdChirp();
        }
        if (ctx.nearCity && Math.random() < 0.65) {
          // Rickshaw bell or market/terminal bell cue
          setTimeout(() => this.playRickshawBell(), 450);
        } else if (this.paxCount > 4 && Math.random() < 0.45) {
          // Soft passenger chatter tone
          this.playTone(310 + Math.random() * 90, 0.14, 'sine', 0.02);
        }
      }
    }

    playBirdChirp() {
      if (!this.initialized || !this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      const base = 2100 + Math.random() * 700;
      osc.frequency.setValueAtTime(base, now);
      osc.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.07);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, now + 0.14);
      g.gain.setValueAtTime(0.03, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.18);
    }

    playCricketChirp() {
      if (!this.initialized || !this.enabled || !this.ctx) return;
      for (let i = 0; i < 3; i++) {
        setTimeout(() => this.playTone(4200, 0.035, 'sine', 0.02), i * 65);
      }
    }

    playRickshawBell() {
      if (!this.initialized || !this.enabled || !this.ctx) return;
      this.playTone(1760, 0.08, 'triangle', 0.06);
      setTimeout(() => this.playTone(1760, 0.1, 'triangle', 0.055), 95);
    }

    playWiperSweep() {
      if (!this.initialized || !this.enabled || !this.ctx) return;
      this.playTone(145, 0.06, 'sine', 0.045);
    }

    playDoorPneumatic() {
      this.playAirBrake();
    }

    playSuspensionThud() {
      this.playTone(68, 0.11, 'triangle', 0.14);
    }

    playThunder(intensity = 0.9) {
      this.init();
      if (!this.initialized || !this.enabled || !this.ctx || !this.noiseBuffer) return;
      const now = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, now);
      filter.frequency.exponentialRampToValueAtTime(55, now + 1.35);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.36 * intensity, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.45);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(now);
      src.stop(now + 1.48);
    }

    startHorn() {
      this.init();
      if (!this.initialized || !this.enabled || this.horning) return;
      this.horning = true;
      const now = this.ctx.currentTime;

      this.hornGain = this.ctx.createGain();
      this.hornGain.gain.setValueAtTime(0.001, now);
      this.hornGain.gain.linearRampToValueAtTime(0.32, now + 0.04);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 620;
      filter.Q.value = 1.2;

      this.hornOsc1 = this.ctx.createOscillator();
      this.hornOsc1.type = 'sawtooth';
      this.hornOsc1.frequency.value = 277.18;

      this.hornOsc2 = this.ctx.createOscillator();
      this.hornOsc2.type = 'sawtooth';
      this.hornOsc2.frequency.value = 349.23;

      this.hornOsc1.connect(filter);
      this.hornOsc2.connect(filter);
      filter.connect(this.hornGain);
      this.hornGain.connect(this.masterGain);

      this.hornOsc1.start(now);
      this.hornOsc2.start(now);
    }

    stopHorn() {
      if (!this.horning || !this.ctx) return;
      this.horning = false;
      const now = this.ctx.currentTime;
      const g = this.hornGain;
      const o1 = this.hornOsc1;
      const o2 = this.hornOsc2;
      if (g) {
        g.gain.setTargetAtTime(0.0001, now, 0.04);
      }
      setTimeout(() => {
        try {
          if (o1) o1.stop();
          if (o2) o2.stop();
        } catch (_) {}
      }, 140);
      this.hornOsc1 = null;
      this.hornOsc2 = null;
      this.hornGain = null;
    }

    playTone(freq, duration, type = 'sine', gainVal = 0.15) {
      if (!this.initialized || !this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(gainVal, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    playTick(high = true) {
      this.playTone(high ? 950 : 720, 0.035, 'square', 0.06);
    }

    playGearShift() {
      this.playTone(130, 0.09, 'triangle', 0.16);
    }

    playAirBrake() {
      if (!this.initialized || !this.enabled || !this.ctx || !this.noiseBuffer) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.14, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start();
      src.stop(this.ctx.currentTime + 0.24);
    }

    playCrash(intensity = 0.7) {
      this.init();
      if (!this.initialized || !this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.26);
      g.gain.setValueAtTime(Math.min(0.45, 0.2 + intensity * 0.25), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.3);
    }

    playChime() {
      this.init();
      this.playTone(587.33, 0.16, 'triangle', 0.18);
      setTimeout(() => this.playTone(880, 0.24, 'triangle', 0.18), 110);
    }
  }

  global.BDSoundEngine = SoundEngine;
})(typeof window !== 'undefined' ? window : globalThis);
