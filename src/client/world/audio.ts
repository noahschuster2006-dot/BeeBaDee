// Generative music and sound effects, synthesised live with the Web Audio API (no audio files).

type Mood = "pub" | "hollow" | "neon" | "realm" | "combat";

const SCALES: Record<Mood, { root: number; steps: number[]; tempo: number; wave: OscillatorType; pad: OscillatorType; bright: number }> = {
  pub: { root: 57, steps: [0, 2, 4, 7, 9, 12, 14, 16], tempo: 0.32, wave: "triangle", pad: "sine", bright: 2400 },
  hollow: { root: 50, steps: [0, 3, 5, 7, 10, 12, 15, 17], tempo: 0.5, wave: "sine", pad: "triangle", bright: 1800 },
  neon: { root: 45, steps: [0, 3, 5, 7, 10, 12, 14, 15], tempo: 0.18, wave: "sawtooth", pad: "sawtooth", bright: 1600 },
  realm: { root: 52, steps: [0, 2, 3, 5, 7, 9, 10, 12], tempo: 0.36, wave: "triangle", pad: "sine", bright: 2200 },
  combat: { root: 45, steps: [0, 1, 3, 5, 7, 8, 10, 12], tempo: 0.16, wave: "square", pad: "sawtooth", bright: 1400 },
};

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

export class Sound {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private mood: Mood = "pub";
  private step = 0;
  private next = 0;
  enabled = true;

  /** Must be called from a user gesture. */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.16;
    this.music.connect(this.ctx.destination);
    this.next = this.ctx.currentTime + 0.1;
    window.setInterval(() => this.schedule(), 50);
  }

  setMood(m: Mood) { this.mood = m; }
  private musicLevel = 0.6;
  /** Volumes from the settings menu (0-1). */
  setVolumes(music: number, sfx: number) {
    this.musicLevel = music;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0.75 * sfx, this.ctx.currentTime, 0.1);
    this.music.gain.setTargetAtTime(this.enabled ? 0.27 * music : 0, this.ctx.currentTime, 0.1);
  }
  setMusic(on: boolean) { this.enabled = on; if (this.music && this.ctx) this.music.gain.setTargetAtTime(on ? 0.27 * this.musicLevel : 0, this.ctx.currentTime, 0.3); }

  private schedule() {
    const ctx = this.ctx!;
    while (this.next < ctx.currentTime + 0.2) {
      this.beat(this.next, this.step++);
      this.next += SCALES[this.mood].tempo;
    }
  }

  private beat(t: number, i: number) {
    const s = SCALES[this.mood];
    const bar = Math.floor(i / 8) % 4;
    const chordRoot = [0, 5, 3, 4][bar];
    // pad on bar start
    if (i % 8 === 0) for (const k of [0, 2, 4]) this.note(midi(s.root - 12 + s.steps[(chordRoot + k) % 8]), t, s.tempo * 8, s.pad, 0.07, s.bright * 0.4);
    // melody: sparse random walk
    const pattern = this.mood === "neon" || this.mood === "combat" ? 0.8 : 0.45;
    if (pseudo(i) < pattern) {
      const deg = (chordRoot + Math.floor(pseudo(i * 7) * 6)) % 8;
      this.note(midi(s.root + 12 + s.steps[deg]), t, s.tempo * 1.6, s.wave, 0.06, s.bright);
    }
    // bass
    if (i % 4 === 0) this.note(midi(s.root - 24 + s.steps[chordRoot % 8]), t, s.tempo * 3.5, this.mood === "neon" ? "sawtooth" : "sine", 0.12, 600);
    // drums for combat / neon
    if (this.mood === "combat" || this.mood === "neon") {
      if (i % 4 === 0) this.kick(t);
      if (i % 4 === 2) this.hat(t, 0.05);
      if (this.mood === "combat" && i % 8 === 4) this.hat(t, 0.12, 1200);
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, vol: number, cutoff: number, dest?: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dest ?? this.music);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.25);
  }

  private hat(t: number, vol: number, hp = 7000) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    src.connect(f).connect(g).connect(this.music);
    src.start(t);
  }

  sfx(kind: "dice" | "hit" | "miss" | "heal" | "spell" | "death" | "levelup" | "chat" | "turn" | "scene" | "bell" | "chime" | "boom" | "splash" | "zap" | "horn" | "vote") {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case "dice":
        for (let i = 0; i < 5; i++) this.click(t + i * 0.07 + Math.random() * 0.04, 0.12 - i * 0.02);
        break;
      case "hit": this.noiseBurst(t, 0.25, 900); this.note(90, t, 0.2, "square", 0.15, 500, this.master); break;
      case "miss": this.noiseBurst(t, 0.08, 3000, 0.25); break;
      case "heal": [0, 4, 7, 12].forEach((k, i) => this.note(midi(72 + k), t + i * 0.07, 0.4, "sine", 0.08, 4000, this.master)); break;
      case "spell": [0, 7, 12, 19].forEach((k, i) => this.note(midi(64 + k), t + i * 0.04, 0.5, "triangle", 0.07, 5000, this.master)); break;
      case "death": [0, -3, -7].forEach((k, i) => this.note(midi(52 + k), t + i * 0.18, 0.6, "sawtooth", 0.06, 900, this.master)); break;
      case "levelup": [0, 4, 7, 12, 16, 19, 24].forEach((k, i) => this.note(midi(67 + k), t + i * 0.06, 0.35, "square", 0.05, 4000, this.master)); break;
      case "chat": this.note(1320, t, 0.08, "sine", 0.03, 6000, this.master); break;
      case "turn": this.note(880, t, 0.15, "triangle", 0.1, 5000, this.master); this.note(1320, t + 0.12, 0.25, "triangle", 0.1, 5000, this.master); break;
      case "scene": this.note(midi(48), t, 2.5, "sine", 0.12, 900, this.master); this.note(midi(55), t + 0.2, 2.3, "sine", 0.08, 900, this.master); break;
      case "bell": [0, 7, 12, 16].forEach((k, i) => this.note(midi(45 + k), t, 3.5 - i * 0.5, "sine", 0.14 / (i + 1), 3000, this.master)); break;
      case "chime": [0, 4, 7].forEach((k, i) => this.note(midi(76 + k + Math.floor(Math.random() * 3)), t + i * 0.05, 1.2, "sine", 0.06, 6000, this.master)); break;
      case "boom": this.note(55, t, 0.8, "sine", 0.4, 300, this.master); this.noiseBurst(t, 0.3, 200, 0.4); break;
      case "splash": this.noiseBurst(t, 0.6, 1500, 0.3); this.noiseBurst(t + 0.1, 0.5, 3000, 0.15); break;
      case "zap": { const o = ctx.createOscillator(); const gn = ctx.createGain(); o.type = "sawtooth"; o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.35); gn.gain.setValueAtTime(0.12, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.4); o.connect(gn).connect(this.master); o.start(t); o.stop(t + 0.45); break; }
      case "horn": this.note(midi(45), t, 1.2, "sawtooth", 0.12, 900, this.master); this.note(midi(52), t, 1.2, "sawtooth", 0.1, 900, this.master); break;
      case "vote": this.note(midi(67), t, 0.2, "triangle", 0.1, 5000, this.master); this.note(midi(72), t + 0.15, 0.4, "triangle", 0.1, 5000, this.master); break;
    }
  }

  private click(t: number, vol: number) {
    this.noiseBurst(t, 0.03, 2500, vol);
  }

  private noiseBurst(t: number, dur: number, freq: number, vol = 0.3) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }
}

function pseudo(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export const sound = new Sound();
