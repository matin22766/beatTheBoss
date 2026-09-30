/**
 * Procedural sound effects built from oscillators and filtered noise (no audio files needed).
 * Every sound takes an `intensity` (0..1+) that scales loudness/brightness and gets slight random
 * pitch variation so repeated hits never sound identical.
 */

export type SoundName =
  | 'punch'
  | 'slap'
  | 'thud'
  | 'crunch'
  | 'splat'
  | 'slice'
  | 'stab'
  | 'clang'
  | 'whoosh'
  | 'gunshot'
  | 'shotgun'
  | 'explosion'
  | 'zap'
  | 'freeze'
  | 'shatter'
  | 'ignite'
  | 'coin'
  | 'grunt'
  | 'scream'
  | 'click'
  | 'pop'
  | 'boing'
  | 'squeak'
  | 'glass'
  | 'twinkle'
  | 'thunk'
  | 'cheer'
  | 'kaching'
  | 'slowIn'
  | 'slowOut'
  | 'step';

interface AmbiencePreset {
  noise?: { type: BiquadFilterType; freq: number; q: number; level: number; lfoRate?: number; lfoDepth?: number };
  drones?: Array<[number, number]>;
}

/** Quiet background beds per arena. */
export const AMBIENCE: Record<string, AmbiencePreset> = {
  office: { noise: { type: 'lowpass', freq: 380, q: 0.7, level: 0.035 }, drones: [[60, 0.012]] },
  warehouse: { noise: { type: 'lowpass', freq: 220, q: 0.7, level: 0.05 }, drones: [[45, 0.02]] },
  ring: { noise: { type: 'bandpass', freq: 900, q: 0.6, level: 0.09, lfoRate: 0.25, lfoDepth: 0.5 } },
  kitchen: { drones: [[120, 0.012], [240, 0.006]], noise: { type: 'lowpass', freq: 300, q: 0.7, level: 0.02 } },
  rooftop: { noise: { type: 'bandpass', freq: 520, q: 0.9, level: 0.07, lfoRate: 0.11, lfoDepth: 0.7 }, drones: [[38, 0.015]] },
  lab: { drones: [[90, 0.012], [3100, 0.0025]], noise: { type: 'lowpass', freq: 500, q: 0.7, level: 0.02 } },
  beach: { noise: { type: 'lowpass', freq: 750, q: 0.5, level: 0.13, lfoRate: 0.12, lfoDepth: 0.85 } },
  space: { drones: [[55, 0.02], [82.5, 0.012]], noise: { type: 'lowpass', freq: 260, q: 0.7, level: 0.025 } },
};

export type LoopName = 'chainsaw' | 'flame' | 'electric' | 'freezeRay';

interface PlayOpts {
  intensity?: number;
  pitch?: number;
  /** Stereo pan -1..1. */
  pan?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private voices = 0;
  private ambienceStop: (() => void) | null = null;
  private slowFilter!: BiquadFilterNode;
  private timeScale = 1;
  private ambienceName: string | null = null;
  private lastPlayed = new Map<string, number>();
  volume = 0.8;
  muted = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.sfx = ctx.createGain();
    // Bullet time muffles everything through this low-pass.
    this.slowFilter = ctx.createBiquadFilter();
    this.slowFilter.type = 'lowpass';
    this.slowFilter.frequency.value = 20000;
    this.sfx.connect(this.slowFilter);
    this.slowFilter.connect(comp);
    comp.connect(this.master);
    this.master.connect(ctx.destination);

    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(1.2, 2.5);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.18;
    this.reverbSend.connect(conv);
    conv.connect(comp);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.ambienceName) this.setAmbience(this.ambienceName);
  }

  get ready(): boolean {
    return !!this.ctx;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.02);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.setVolume(this.volume);
  }

  /** Slow motion: lower pitch of new sounds and muffle the mix. */
  setTimeScale(k: number): void {
    if (Math.abs(k - this.timeScale) < 0.005) return;
    this.timeScale = k;
    if (this.ctx) this.slowFilter.frequency.setTargetAtTime(k >= 0.99 ? 20000 : 700 + 4000 * k, this.ctx.currentTime, 0.05);
  }

  setReverb(amount: number): void {
    if (this.ctx) this.reverbSend.gain.value = amount;
  }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /** Output bus for one voice: gain → pan → sfx (+ reverb send). */
  private bus(gain: number, pan = 0, verb = 1): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(this.sfx);
    if (verb > 0) {
      const s = ctx.createGain();
      s.gain.value = verb;
      p.connect(s);
      s.connect(this.reverbSend);
    }
    return g;
  }

  private noise(dest: AudioNode, t: number, dur: number, filter: BiquadFilterType, f0: number, f1: number, q = 1, level = 1, attack = 0.002): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, dur: number, type: OscillatorType, f0: number, f1: number, level = 1, attack = 0.003): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  /** Formant-filtered sawtooth "voice" for grunts and screams. */
  private voice(dest: AudioNode, t: number, dur: number, pitch: number, pitchEnd: number, f1: [number, number], f2: [number, number], vibrato = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(pitch, t);
    o.frequency.exponentialRampToValueAtTime(pitchEnd, t + dur);
    if (vibrato > 0) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const lg = ctx.createGain();
      lg.gain.value = vibrato;
      lfo.connect(lg);
      lg.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(1, t + 0.02);
    out.gain.setValueAtTime(1, t + dur * 0.6);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [fa, fb, gain] of [
      [f1[0], f1[1], 1],
      [f2[0], f2[1], 0.5],
    ] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.setValueAtTime(fa, t);
      bp.frequency.exponentialRampToValueAtTime(fb, t + dur);
      const g = ctx.createGain();
      g.gain.value = gain * 2.2;
      o.connect(bp);
      bp.connect(g);
      g.connect(out);
    }
    out.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name: SoundName, opts: PlayOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    // Throttle identical sounds to avoid machine-gun phasing and CPU spikes.
    const now = ctx.currentTime;
    const minGap = name === 'coin' ? 0.05 : 0.03;
    if (now - (this.lastPlayed.get(name) ?? -1) < minGap) return;
    this.lastPlayed.set(name, now);
    if (this.voices > 28) return;
    this.voices++;
    setTimeout(() => this.voices--, 1200);

    const k = Math.max(0.05, Math.min(1.5, opts.intensity ?? 0.7));
    const p = (opts.pitch ?? 1) * rand(0.92, 1.08) * (0.55 + 0.45 * this.timeScale);
    const t = now + 0.005;
    const out = this.bus(0.3 + k * 0.7, opts.pan ?? 0);

    switch (name) {
      case 'punch':
        this.tone(out, t, 0.18, 'sine', 140 * p, 45, 1);
        this.noise(out, t, 0.07, 'lowpass', 2500 * p, 400, 0.7, 0.9);
        this.noise(out, t, 0.015, 'highpass', 3000, 3000, 0.7, 0.4);
        break;
      case 'slap':
        this.noise(out, t, 0.06, 'bandpass', 2200 * p, 1400, 0.8, 1.2);
        this.tone(out, t, 0.05, 'sine', 300 * p, 120, 0.4);
        break;
      case 'thud':
        this.tone(out, t, 0.3, 'sine', 90 * p, 32, 1.2);
        this.noise(out, t, 0.18, 'lowpass', 900 * p, 120, 0.7, 0.9);
        break;
      case 'crunch': {
        this.tone(out, t, 0.08, 'triangle', 220 * p, 60, 0.8);
        const n = 7 + Math.floor(k * 6);
        for (let i = 0; i < n; i++) {
          const ti = t + Math.random() * 0.14;
          this.noise(out, ti, 0.012 + Math.random() * 0.02, 'bandpass', rand(1200, 4200) * p, rand(800, 2000), 3, rand(0.5, 1.2), 0.001);
        }
        break;
      }
      case 'splat':
        this.noise(out, t, 0.22, 'lowpass', 1800 * p, 250, 3, 1);
        this.tone(out, t, 0.12, 'sine', 180 * p, 60, 0.5);
        break;
      case 'slice':
        this.noise(out, t, 0.14, 'highpass', 2500 * p, 7000, 0.8, 0.8);
        this.noise(out, t + 0.05, 0.12, 'lowpass', 1500 * p, 300, 2, 0.6);
        break;
      case 'stab':
        this.noise(out, t, 0.05, 'bandpass', 3000 * p, 1500, 1.5, 0.8);
        this.noise(out, t + 0.02, 0.15, 'lowpass', 900 * p, 200, 4, 0.9);
        break;
      case 'clang':
        for (const [r, lvl] of [
          [1, 0.6],
          [2.76, 0.4],
          [5.4, 0.25],
          [8.93, 0.15],
        ] as const)
          this.tone(out, t, 0.9, 'sine', 380 * p * r, 380 * p * r * 0.99, lvl, 0.001);
        this.noise(out, t, 0.03, 'highpass', 4000, 4000, 0.7, 0.6);
        break;
      case 'whoosh':
        this.noise(out, t, 0.28, 'bandpass', 350 * p, 1600, 2.5, 0.7, 0.08);
        break;
      case 'gunshot':
        this.noise(out, t, 0.25, 'lowpass', 6000 * p, 300, 0.7, 1.4, 0.001);
        this.tone(out, t, 0.12, 'sine', 160 * p, 50, 1);
        break;
      case 'shotgun':
        this.noise(out, t, 0.45, 'lowpass', 5000 * p, 150, 0.7, 1.6, 0.001);
        this.tone(out, t, 0.2, 'sine', 110 * p, 40, 1.3);
        break;
      case 'explosion':
        this.noise(out, t, 1.6, 'lowpass', 1500 * p, 60, 0.8, 1.6, 0.005);
        this.tone(out, t, 1.0, 'sine', 70 * p, 25, 1.4);
        this.noise(out, t, 0.08, 'highpass', 2000, 800, 0.7, 1);
        break;
      case 'zap': {
        const o = this.tone(out, t, 0.35, 'sawtooth', 110 * p, 80, 0.5);
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 47;
        const lg = ctx.createGain();
        lg.gain.value = 600;
        lfo.connect(lg);
        lg.connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + 0.4);
        this.noise(out, t, 0.35, 'highpass', 5000, 3000, 0.7, 0.5);
        break;
      }
      case 'freeze':
        this.tone(out, t, 0.6, 'sine', 1800 * p, 3500, 0.3, 0.05);
        for (let i = 0; i < 6; i++) this.noise(out, t + Math.random() * 0.4, 0.03, 'highpass', 6000, 5000, 1, 0.5, 0.001);
        break;
      case 'shatter':
        for (let i = 0; i < 14; i++) {
          const ti = t + Math.random() * 0.35;
          this.tone(out, ti, 0.25, 'sine', rand(2500, 6000), rand(2400, 5800), 0.2, 0.001);
          this.noise(out, ti, 0.04, 'highpass', 5000, 4000, 1, 0.4, 0.001);
        }
        this.noise(out, t, 0.3, 'bandpass', 3000, 1500, 0.7, 0.8);
        break;
      case 'glass':
        for (let i = 0; i < 6; i++) this.tone(out, t + Math.random() * 0.1, 0.4, 'sine', rand(3000, 5500), rand(2900, 5400), 0.2, 0.001);
        this.noise(out, t, 0.12, 'highpass', 4000, 3000, 0.7, 0.6);
        break;
      case 'ignite':
        this.noise(out, t, 0.6, 'bandpass', 400 * p, 2500, 0.8, 1, 0.05);
        break;
      case 'coin':
        this.tone(out, t, 0.08, 'square', 988 * p, 988 * p, 0.12, 0.002);
        this.tone(out, t + 0.07, 0.25, 'square', 1319 * p, 1319 * p, 0.12, 0.002);
        break;
      case 'grunt': {
        const v = Math.floor(Math.random() * 3);
        const base = rand(100, 140) * (opts.pitch ?? 1);
        const f: Array<[[number, number], [number, number]]> = [
          [
            [700, 450],
            [1150, 850],
          ],
          [
            [550, 650],
            [950, 1300],
          ],
          [
            [650, 350],
            [1100, 700],
          ],
        ];
        this.voice(out, t, rand(0.16, 0.28), base * 1.1, base * 0.75, f[v][0], f[v][1]);
        break;
      }
      case 'scream':
        this.voice(out, t, rand(0.5, 0.8), rand(230, 290) * (opts.pitch ?? 1), rand(160, 200), [800, 700], [1300, 1100], 18);
        break;
      case 'click':
        this.tone(out, t, 0.04, 'sine', 1200 * p, 900, 0.3);
        break;
      case 'pop':
        this.tone(out, t, 0.09, 'sine', 500 * p, 1200, 0.6);
        break;
      case 'boing':
        this.tone(out, t, 0.5, 'sine', 180 * p, 520, 0.6, 0.005);
        break;
      case 'squeak':
        this.tone(out, t, 0.25, 'square', 900 * p, 1500, 0.15, 0.01);
        this.tone(out, t + 0.12, 0.2, 'square', 1500 * p, 700, 0.12, 0.01);
        break;
      case 'twinkle':
        [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(out, t + i * 0.07, 0.3, 'sine', f, f, 0.2, 0.002));
        break;
      case 'cheer':
        this.noise(out, t, 2.2, 'bandpass', 1100 * p, 1500, 0.6, 0.9, 0.25);
        for (let i = 0; i < 5; i++) this.voice(out, t + Math.random() * 0.4, rand(0.5, 0.9), rand(260, 420), rand(300, 500), [800, 900], [1300, 1500], 12);
        break;
      case 'kaching':
        this.noise(out, t, 0.08, 'highpass', 5000, 4000, 0.7, 0.8, 0.001);
        [2093, 2637, 3136].forEach((f, i) => this.tone(out, t + 0.05 + i * 0.05, 0.6, 'triangle', f, f, 0.18, 0.002));
        break;
      case 'slowIn':
        this.tone(out, t, 0.6, 'sine', 420, 60, 0.9, 0.01);
        this.noise(out, t, 0.6, 'lowpass', 3000, 200, 0.7, 0.5, 0.02);
        break;
      case 'slowOut':
        this.tone(out, t, 0.4, 'sine', 70, 380, 0.7, 0.01);
        this.noise(out, t, 0.35, 'bandpass', 300, 2500, 0.8, 0.4, 0.02);
        break;
      case 'step':
        this.tone(out, t, 0.07, 'sine', 110 * p, 55, 0.5);
        this.noise(out, t, 0.05, 'lowpass', 900 * p, 300, 0.7, 0.35);
        break;
      case 'thunk':
        this.tone(out, t, 0.12, 'triangle', 200 * p, 90, 0.8);
        this.noise(out, t, 0.05, 'bandpass', 1500 * p, 600, 2, 0.6);
        break;
    }
  }

  /** Crossfade to an arena's background bed (null = silence). Safe to call before unlock. */
  setAmbience(name: string | null): void {
    this.ambienceName = name;
    const ctx = this.ctx;
    if (!ctx) return;
    this.ambienceStop?.();
    this.ambienceStop = null;
    const preset = name ? AMBIENCE[name] : null;
    if (!preset) return;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(this.sfx);
    const t = ctx.currentTime;
    out.gain.exponentialRampToValueAtTime(1, t + 1.5);
    const nodes: AudioScheduledSourceNode[] = [];
    if (preset.noise) {
      const n = preset.noise;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = n.type;
      f.frequency.value = n.freq;
      f.Q.value = n.q;
      const g = ctx.createGain();
      g.gain.value = n.level;
      if (n.lfoRate) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = n.lfoRate;
        const lg = ctx.createGain();
        lg.gain.value = n.level * (n.lfoDepth ?? 0.5);
        lfo.connect(lg);
        lg.connect(g.gain);
        nodes.push(lfo);
      }
      src.connect(f);
      f.connect(g);
      g.connect(out);
      nodes.push(src);
    }
    for (const [freq, level] of preset.drones ?? []) {
      const o = ctx.createOscillator();
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(out);
      nodes.push(o);
    }
    nodes.forEach((n) => n.start());
    this.ambienceStop = () => {
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      nodes.forEach((n) => n.stop(now + 0.9));
    };
  }

  /** Sustained sound for hold-to-use weapons. Returns a stop function. */
  loop(name: LoopName, intensity = 0.8): () => void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return () => {};
    const t = ctx.currentTime;
    const out = this.bus(0.0001, 0, 0.5);
    out.gain.exponentialRampToValueAtTime(0.35 + intensity * 0.4, t + 0.08);
    const nodes: AudioScheduledSourceNode[] = [];
    const osc = (type: OscillatorType, f: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      nodes.push(o);
      return o;
    };
    const noiseSrc = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noiseBuf;
      s.loop = true;
      nodes.push(s);
      return s;
    };
    const filt = (type: BiquadFilterType, f: number, q = 1) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };

    switch (name) {
      case 'chainsaw': {
        const o = osc('sawtooth', 95);
        const lfo = osc('sine', 18);
        const lg = ctx.createGain();
        lg.gain.value = 12;
        lfo.connect(lg);
        lg.connect(o.frequency);
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          const x = (i / 255) * 2 - 1;
          curve[i] = Math.tanh(x * 4);
        }
        shaper.curve = curve;
        const lp = filt('lowpass', 2200);
        o.connect(shaper);
        shaper.connect(lp);
        lp.connect(out);
        const n = noiseSrc();
        const bp = filt('bandpass', 1800, 1.5);
        const ng = ctx.createGain();
        ng.gain.value = 0.3;
        n.connect(bp);
        bp.connect(ng);
        ng.connect(out);
        break;
      }
      case 'flame': {
        const n = noiseSrc();
        const lp = filt('lowpass', 900, 0.7);
        const bp = filt('bandpass', 3500, 0.8);
        const g2 = ctx.createGain();
        g2.gain.value = 0.3;
        n.connect(lp);
        lp.connect(out);
        n.connect(bp);
        bp.connect(g2);
        g2.connect(out);
        break;
      }
      case 'electric': {
        const o = osc('sawtooth', 60);
        const lfo = osc('square', 31);
        const lg = ctx.createGain();
        lg.gain.value = 300;
        lfo.connect(lg);
        lg.connect(o.frequency);
        const hp = filt('highpass', 300);
        o.connect(hp);
        hp.connect(out);
        const n = noiseSrc();
        const nf = filt('highpass', 5000);
        const ng = ctx.createGain();
        ng.gain.value = 0.25;
        n.connect(nf);
        nf.connect(ng);
        ng.connect(out);
        break;
      }
      case 'freezeRay': {
        const o = osc('sine', 1400);
        const lfo = osc('sine', 9);
        const lg = ctx.createGain();
        lg.gain.value = 250;
        lfo.connect(lg);
        lg.connect(o.frequency);
        const og = ctx.createGain();
        og.gain.value = 0.25;
        o.connect(og);
        og.connect(out);
        const n = noiseSrc();
        const nf = filt('bandpass', 6000, 2);
        n.connect(nf);
        nf.connect(out);
        break;
      }
    }
    nodes.forEach((n) => n.start());
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      nodes.forEach((n) => n.stop(now + 0.15));
    };
  }
}

export const audio = new AudioEngine();
