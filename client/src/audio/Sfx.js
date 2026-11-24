// Outbreak Deck sound effects: every sound is synthesised in code with Web Audio
// (no audio files, like the art). One shared instance: `import sfx from '../audio/Sfx.js'`,
// then `sfx.play('gunshot')` or `sfx.play('gunshot', 0.5)` (volume 0..1).
// Safe anywhere: without a browser AudioContext (the balance simulator) every call does nothing.
// Browsers only allow sound after a tap or key press: unlock() is called on the first one.

const STORE = 'outbreak-deck-sound';

class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
    this.ambientNodes = null;
    this.last = new Map(); // name -> time, so the same sound can't machine-gun
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem(STORE) ?? '{}');
      if (typeof saved.enabled === 'boolean') this.enabled = saved.enabled;
      if (typeof saved.volume === 'number') this.volume = saved.volume;
    } catch {
      /* no storage: defaults */
    }
    if (typeof window !== 'undefined') {
      const unlock = () => this.unlock();
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
    }
  }

  /** Create / resume the AudioContext (needs a user gesture the first time). */
  unlock() {
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? this.volume : 0;
      this.master.connect(this.comp).connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2);
      if (this.wantAmbient) this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  save() {
    try {
      globalThis.localStorage?.setItem(STORE, JSON.stringify({ enabled: this.enabled, volume: this.volume }));
    } catch {
      /* private mode */
    }
  }

  setEnabled(on) {
    this.enabled = on;
    this.save();
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.05);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    if (this.enabled) this.play('tap');
    return this.enabled;
  }

  /** Play a named sound. `vol` scales it (0..1). */
  play(name, vol = 1) {
    if (!this.ctx || !this.enabled || vol <= 0) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < (GAP[name] ?? 0.04)) return;
    this.last.set(name, now);
    const out = this.ctx.createGain();
    out.gain.value = vol;
    out.connect(this.master);
    fn(this, now, out);
    setTimeout(() => out.disconnect(), 6000);
  }

  // ------------------------------------------------------------ building blocks
  makeNoise(seconds) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A tone with an attack/decay envelope; `to` slides the pitch. */
  tone(out, t, { f = 440, to = null, dur = 0.2, type = 'sine', vol = 0.3, attack = 0.005, delay = 0, vibrato = 0, rate = 6 } = {}) {
    const c = this.ctx;
    const t0 = t + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    if (vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = rate;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return o;
  }

  /** Filtered noise burst; `to` sweeps the filter. */
  noise(out, t, { dur = 0.2, vol = 0.3, filter = 'lowpass', f = 1200, to = null, q = 1, attack = 0.003, delay = 0, lfo = 0, lfoRate = 9 } = {}) {
    const c = this.ctx;
    const t0 = t + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = filter;
    fl.frequency.setValueAtTime(f, t0);
    if (to) fl.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (lfo) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = lfoRate;
      lg.gain.value = vol * lfo;
      l.connect(lg).connect(g.gain);
      l.start(t0);
      l.stop(t0 + dur);
    }
    src.connect(fl).connect(g).connect(out);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  /** Notes one after another: [[freq, startOffset, dur], ...]. */
  notes(out, t, list, o = {}) {
    for (const [f, at, dur] of list) this.tone(out, t, { ...o, f, delay: at, dur });
  }

  // ------------------------------------------------------------ background music (no noise)
  /**
   * A quiet, slow "night shift" pad: four dark chords that change every 8 seconds (soft
   * triangle + sine voices through a warm filter and an echo), a gentle bass note per chord,
   * and now and then a distant sonar ping. No hiss, no rain.
   */
  startAmbient() {
    this.wantAmbient = true;
    if (!this.ctx || this.ambientNodes) return;
    const c = this.ctx;
    const bus = c.createGain();
    bus.gain.setValueAtTime(0, c.currentTime);
    bus.gain.linearRampToValueAtTime(1, c.currentTime + 3); // fade in
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 0.5;
    // a slow sweep on the filter so the pad breathes
    const sweep = c.createOscillator();
    const sweepAmt = c.createGain();
    sweep.frequency.value = 0.05;
    sweepAmt.gain.value = 350;
    sweep.connect(sweepAmt).connect(lp.frequency);
    sweep.start();
    // echo
    const delay = c.createDelay(2);
    delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.35;
    const wet = c.createGain();
    wet.gain.value = 0.4;
    lp.connect(bus);
    lp.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(bus);
    bus.connect(this.master);
    const a = { bus, lp, sweep, sweepAmt, delay, chord: 0, timers: [], dark: false };
    this.ambientNodes = a;
    // C minor, A-flat, E-flat, B-flat: dark but calm
    const CHORDS = [[130.8, 155.6, 196.0, 261.6], [103.8, 130.8, 155.6, 207.7], [155.6, 196.0, 233.1, 311.1], [116.5, 146.8, 174.6, 233.1]];
    const BAR = 8;
    const playChord = () => {
      if (this.ambientNodes !== a) return;
      const t = c.currentTime + 0.05;
      const ch = CHORDS[a.chord++ % CHORDS.length];
      ch.forEach((f, i) => {
        this.pad(lp, t, f, BAR + 1.5, i === 0 ? 0.05 : 0.035, 'triangle');
        this.pad(lp, t, f * 1.004, BAR + 1.5, 0.02, 'sine'); // slight detune = width
      });
      this.pad(lp, t, ch[0] / 2, BAR, 0.06, 'sine'); // bass
    };
    const ping = () => {
      if (this.ambientNodes !== a) return;
      if (!a.dark) {
        const t = c.currentTime + 0.05;
        const notes = [523.3, 622.3, 784, 932.3, 1046.5];
        const f = notes[Math.floor(Math.random() * notes.length)];
        this.pad(delay, t, f, 1.6, 0.03, 'sine', 0.01); // into the echo only: far away
        if (Math.random() < 0.35) this.pad(delay, t + 0.21, f * 1.5, 1.2, 0.02, 'sine', 0.01);
      }
      a.timers.push(setTimeout(ping, 5000 + Math.random() * 7000));
    };
    playChord();
    a.timers.push(setInterval(playChord, BAR * 1000));
    a.timers.push(setTimeout(ping, 3000));
  }

  /** One soft, long note (slow attack and release) into `dest`. */
  pad(dest, t, f, dur, vol, type, attack = Math.min(2.5, dur / 3)) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - 2.5));
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  stopAmbient() {
    this.wantAmbient = false;
    const a = this.ambientNodes;
    if (!a) return;
    this.ambientNodes = null;
    for (const id of a.timers) {
      clearTimeout(id);
      clearInterval(id);
    }
    a.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => {
      a.sweep.stop();
      a.bus.disconnect();
    }, 2500);
  }

  /** Blackout: the music goes muffled and the pings stop while the lights are off. */
  ambientDark(on) {
    const a = this.ambientNodes;
    if (!a) return;
    a.dark = on;
    a.lp.frequency.setTargetAtTime(on ? 260 : 1100, this.ctx.currentTime, 0.3);
    a.sweepAmt.gain.setTargetAtTime(on ? 60 : 350, this.ctx.currentTime, 0.3);
  }
}

// Minimum seconds between two plays of the same sound.
const GAP = { tick: 0.2, heartbeat: 0.25, step: 0.1, growl: 1, thunder: 2 };

// C minor-ish palette so the stings fit together.
const N = { C4: 261.6, D4: 293.7, Eb4: 311.1, F4: 349.2, G4: 392, Ab4: 415.3, Bb4: 466.2, C5: 523.3, D5: 587.3, Eb5: 622.3, G5: 784, C6: 1046.5 };

const SOUNDS = {
  // ---------- UI
  tap: (s, t, o) => s.tone(o, t, { f: 1250, to: 900, dur: 0.06, type: 'square', vol: 0.08 }),
  tick: (s, t, o) => { s.tone(o, t, { f: 1900, dur: 0.05, type: 'triangle', vol: 0.18 }); s.noise(o, t, { dur: 0.03, f: 4000, filter: 'highpass', vol: 0.05 }); },
  emote: (s, t, o) => { s.tone(o, t, { f: 600, to: 1300, dur: 0.12, type: 'sine', vol: 0.2 }); s.tone(o, t, { f: 1600, dur: 0.08, vol: 0.08, delay: 0.08 }); },
  pointsUp: (s, t, o) => s.notes(o, t, [[N.C6, 0, 0.12], [N.G5 * 2, 0.07, 0.25]], { type: 'square', vol: 0.07 }),
  pointsDown: (s, t, o) => s.notes(o, t, [[220, 0, 0.12], [165, 0.09, 0.22]], { type: 'square', vol: 0.08 }),

  // ---------- challenges and chases
  challenge: (s, t, o) => { s.tone(o, t, { f: 220, to: 330, dur: 0.35, type: 'sawtooth', vol: 0.12, vibrato: 6 }); s.tone(o, t, { f: 110, dur: 0.3, type: 'triangle', vol: 0.2 }); s.noise(o, t, { dur: 0.1, f: 3000, filter: 'highpass', vol: 0.06 }); },
  challenged: (s, t, o) => s.notes(o, t, [[880, 0, 0.09], [880, 0.14, 0.09], [1320, 0.28, 0.2]], { type: 'square', vol: 0.11 }),
  accept: (s, t, o) => s.notes(o, t, [[N.C5, 0, 0.12], [N.Eb5, 0.08, 0.12], [N.G5, 0.16, 0.3]], { type: 'triangle', vol: 0.22 }),
  run: (s, t, o) => { s.noise(o, t, { dur: 0.45, f: 400, to: 4000, filter: 'bandpass', q: 2, vol: 0.25 }); s.tone(o, t, { f: 300, to: 900, dur: 0.3, type: 'sawtooth', vol: 0.06 }); },
  heartbeat: (s, t, o) => { s.tone(o, t, { f: 70, to: 40, dur: 0.18, type: 'sine', vol: 0.5 }); s.tone(o, t, { f: 60, to: 35, dur: 0.16, type: 'sine', vol: 0.35, delay: 0.2 }); },
  caught: (s, t, o) => { s.noise(o, t, { dur: 0.25, f: 900, vol: 0.4 }); s.tone(o, t, { f: 160, to: 50, dur: 0.35, type: 'square', vol: 0.18 }); },
  escaped: (s, t, o) => s.notes(o, t, [[N.G4, 0, 0.1], [N.C5, 0.08, 0.1], [N.G5, 0.16, 0.35]], { type: 'sine', vol: 0.2 }),

  // ---------- duels
  cardPick: (s, t, o) => { s.noise(o, t, { dur: 0.12, f: 2500, to: 6000, filter: 'bandpass', q: 1.5, vol: 0.22 }); s.tone(o, t, { f: 500, dur: 0.05, type: 'triangle', vol: 0.1, delay: 0.1 }); },
  cardFlip: (s, t, o) => { s.noise(o, t, { dur: 0.05, f: 5000, filter: 'highpass', vol: 0.3 }); s.tone(o, t, { f: 900, to: 400, dur: 0.07, type: 'triangle', vol: 0.15, delay: 0.02 }); },
  duelWin: (s, t, o) => { s.notes(o, t, [[N.C5, 0, 0.12], [N.Eb5, 0.1, 0.12], [N.G5, 0.2, 0.12], [N.C6, 0.3, 0.5]], { type: 'square', vol: 0.09 }); s.tone(o, t, { f: N.C4, dur: 0.8, type: 'triangle', vol: 0.15, delay: 0.3 }); },
  duelLose: (s, t, o) => s.notes(o, t, [[N.G4, 0, 0.18], [N.Eb4, 0.16, 0.18], [N.C4, 0.32, 0.5]], { type: 'sawtooth', vol: 0.07 }),
  draw: (s, t, o) => s.notes(o, t, [[N.D5, 0, 0.15], [N.D5, 0.18, 0.25]], { type: 'triangle', vol: 0.15 }),
  fake: (s, t, o) => s.notes(o, t, [[N.Eb5, 0, 0.12], [N.D5, 0.1, 0.12], [N.Eb5, 0.2, 0.3]], { type: 'sine', vol: 0.15 }),
  called: (s, t, o) => { s.notes(o, t, [[N.C6, 0, 0.1], [N.C6 * 1.5, 0.08, 0.1], [N.C6 * 2, 0.16, 0.4]], { type: 'square', vol: 0.08 }); s.noise(o, t, { dur: 0.3, f: 6000, filter: 'highpass', vol: 0.08 }); },
  callWrong: (s, t, o) => s.tone(o, t, { f: 140, dur: 0.45, type: 'sawtooth', vol: 0.14, vibrato: 12, rate: 30 }),

  // ---------- the big moments
  gunshot: (s, t, o) => { s.noise(o, t, { dur: 0.08, f: 8000, filter: 'highpass', vol: 0.6 }); s.noise(o, t, { dur: 0.7, f: 1800, to: 200, vol: 0.55, attack: 0.002 }); s.tone(o, t, { f: 120, to: 35, dur: 0.5, type: 'sine', vol: 0.6 }); },
  death: (s, t, o) => { s.tone(o, t, { f: 80, to: 30, dur: 1.4, type: 'sine', vol: 0.6 }); s.tone(o, t, { f: 3200, dur: 1.8, type: 'sine', vol: 0.05, attack: 0.3 }); },
  bite: (s, t, o) => { s.noise(o, t, { dur: 0.6, f: 500, vol: 0.35, lfo: 0.8, lfoRate: 22 }); s.noise(o, t, { dur: 0.12, f: 2500, filter: 'bandpass', q: 3, vol: 0.4, delay: 0.25 }); s.tone(o, t, { f: 180, to: 45, dur: 0.8, type: 'sawtooth', vol: 0.16, delay: 0.2 }); },
  zombieGrew: (s, t, o) => { s.tone(o, t, { f: 420, to: 90, dur: 0.35, type: 'sine', vol: 0.25 }); s.noise(o, t, { dur: 0.3, f: 700, filter: 'bandpass', q: 4, vol: 0.2, lfo: 0.6, lfoRate: 14 }); },
  growl: (s, t, o) => { s.noise(o, t, { dur: 1.1, f: 380, vol: 0.4, lfo: 0.9, lfoRate: 11, attack: 0.15 }); s.tone(o, t, { f: 72, to: 58, dur: 1.1, type: 'sawtooth', vol: 0.12, attack: 0.15, vibrato: 4, rate: 9 }); },
  cure: (s, t, o) => { [N.C5, N.Eb5, N.G5, N.C6, N.Eb5 * 2, N.G5 * 2].forEach((f, i) => s.tone(o, t, { f, dur: 0.5, type: 'sine', vol: 0.12, delay: i * 0.06 })); s.noise(o, t, { dur: 0.8, f: 7000, filter: 'highpass', vol: 0.05, attack: 0.1 }); },
  cureWasted: (s, t, o) => { s.noise(o, t, { dur: 0.6, f: 3000, to: 300, filter: 'bandpass', q: 2, vol: 0.2 }); s.tone(o, t, { f: 600, to: 150, dur: 0.6, type: 'sine', vol: 0.1 }); },
  cell: (s, t, o) => { [180, 263, 397, 541].forEach((f, i) => s.tone(o, t, { f, dur: 1.2 - i * 0.2, type: 'square', vol: 0.06 })); s.noise(o, t, { dur: 0.15, f: 1500, vol: 0.4 }); },
  meeting: (s, t, o) => { for (let i = 0; i < 4; i++) s.tone(o, t, { f: i % 2 ? 620 : 820, dur: 0.32, type: 'sawtooth', vol: 0.1, delay: i * 0.34, attack: 0.02 }); },
  vote: (s, t, o) => s.tone(o, t, { f: N.C4, dur: 1.2, type: 'triangle', vol: 0.25, vibrato: 3 }),
  voteOut: (s, t, o) => { s.noise(o, t, { dur: 0.3, f: 600, vol: 0.5 }); s.tone(o, t, { f: 90, to: 40, dur: 0.9, type: 'sine', vol: 0.5 }); s.notes(o, t, [[N.G4, 0.3, 0.3], [N.Eb4, 0.55, 0.6]], { type: 'sawtooth', vol: 0.06 }); },
  noVote: (s, t, o) => s.notes(o, t, [[N.D5, 0, 0.2], [N.C5, 0.18, 0.35]], { type: 'triangle', vol: 0.15 }),

  // ---------- Restore Power, evac, blackout, cameras
  partPick: (s, t, o) => s.notes(o, t, [[1320, 0, 0.12], [1760, 0.08, 0.3]], { type: 'sine', vol: 0.2 }),
  partFit: (s, t, o) => { s.noise(o, t, { dur: 0.12, f: 800, vol: 0.4 }); s.tone(o, t, { f: 60, to: 180, dur: 0.6, type: 'sawtooth', vol: 0.12, delay: 0.1 }); s.tone(o, t, { f: 880, dur: 0.25, type: 'square', vol: 0.06, delay: 0.5 }); },
  power: (s, t, o) => { s.tone(o, t, { f: 60, to: 900, dur: 1.2, type: 'sawtooth', vol: 0.14 }); [N.C5, N.G5, N.C6].forEach((f) => s.tone(o, t, { f, dur: 1.4, type: 'triangle', vol: 0.12, delay: 1.0, attack: 0.05 })); },
  evacWarn: (s, t, o) => { s.tone(o, t, { f: 349, dur: 0.5, type: 'sawtooth', vol: 0.12 }); s.tone(o, t, { f: 277, dur: 0.6, type: 'sawtooth', vol: 0.12, delay: 0.5 }); },
  evacFail: (s, t, o) => s.tone(o, t, { f: 110, dur: 0.9, type: 'sawtooth', vol: 0.14, vibrato: 8, rate: 25 }),
  blackout: (s, t, o) => { s.tone(o, t, { f: 900, to: 40, dur: 1.0, type: 'sawtooth', vol: 0.14 }); s.noise(o, t, { dur: 0.08, f: 3000, vol: 0.5, delay: 0.95 }); },
  lightsOn: (s, t, o) => { for (let i = 0; i < 4; i++) s.noise(o, t, { dur: 0.04, f: 4000, filter: 'highpass', vol: 0.25, delay: i * 0.09 + Math.random() * 0.04 }); s.tone(o, t, { f: 120, to: 240, dur: 0.5, type: 'sine', vol: 0.1, delay: 0.35 }); },
  camera: (s, t, o) => { s.noise(o, t, { dur: 0.35, f: 3000, filter: 'bandpass', q: 0.7, vol: 0.18 }); s.notes(o, t, [[1500, 0.3, 0.06], [1500, 0.4, 0.06]], { type: 'square', vol: 0.07 }); },
  thunder: (s, t, o) => { s.noise(o, t, { dur: 0.15, f: 6000, filter: 'highpass', vol: 0.3 }); s.noise(o, t, { dur: 2.6, f: 400, to: 60, vol: 0.6, attack: 0.05 }); },
  lastStand: (s, t, o) => { s.noise(o, t, { dur: 0.2, f: 900, vol: 0.5 }); [N.C4 / 2, N.G4 / 2, N.C4].forEach((f) => s.tone(o, t, { f, dur: 2.2, type: 'sawtooth', vol: 0.09, attack: 0.02 })); s.tone(o, t, { f: 3000, dur: 1.5, type: 'sine', vol: 0.03, delay: 0.1 }); },
  refill: (s, t, o) => { for (let i = 0; i < 4; i++) s.noise(o, t, { dur: 0.06, f: 3000 + i * 600, filter: 'bandpass', q: 2, vol: 0.2, delay: i * 0.07 }); },

  // ---------- match end
  matchWin: (s, t, o) => { s.notes(o, t, [[N.C5, 0, 0.18], [N.Eb5, 0.15, 0.18], [N.G5, 0.3, 0.18], [N.C6, 0.45, 0.9]], { type: 'square', vol: 0.09 }); [N.C4, N.G4].forEach((f) => s.tone(o, t, { f, dur: 1.4, type: 'triangle', vol: 0.15, delay: 0.45 })); },
  matchLose: (s, t, o) => { s.notes(o, t, [[N.G4, 0, 0.3], [N.Eb4, 0.28, 0.3], [N.D4, 0.56, 0.3], [N.C4, 0.84, 1.0]], { type: 'sawtooth', vol: 0.07 }); s.tone(o, t, { f: 65, dur: 1.8, type: 'sine', vol: 0.3, delay: 0.84 }); },
};

export const SOUND_NAMES = Object.keys(SOUNDS);
const sfx = new Sfx();
if (typeof window !== 'undefined' && import.meta.env?.DEV) window.__sfx = sfx; // dev console: __sfx.play('gunshot')
export default sfx;
