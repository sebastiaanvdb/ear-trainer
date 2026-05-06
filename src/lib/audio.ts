"use client";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private wave: PeriodicWave | null = null;
  private activeOscillators: Map<number, { osc: OscillatorNode; gain: GainNode }> = new Map();

  private getAC() {
    if (typeof window === "undefined") return null;
    return (
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
      null
    );
  }

  // Call synchronously inside a user-gesture handler.
  // Sets up ctx and master atomically — if anything fails, both stay null so the
  // next call can retry. The master→destination connection is established before
  // this.ctx/master are assigned, guaranteeing a valid signal chain on success.
  init(): void {
    const AC = this.getAC();
    if (!AC) return;

    // Already initialised — just resume if the context got suspended.
    if (this.ctx && this.master) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(e => console.warn("[Audio] resume:", e));
      }
      return;
    }

    try {
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 1.0;
      master.connect(ctx.destination); // connect first — guarantees a path to speakers

      // Atomic assignment: both non-null only once fully wired.
      this.ctx = ctx;
      this.master = master;
      console.log("[Audio] init:", ctx.state);

      if (ctx.state === "suspended") {
        ctx.resume().catch(e => console.warn("[Audio] resume:", e));
      }
    } catch (e) {
      console.error("[Audio] init failed:", e);
      this.ctx = null;
      this.master = null;
      this.wave = null;
    }
  }

  async ready(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state === "running") return true;
    if (this.ctx.state === "suspended") {
      try { await this.ctx.resume(); return true; }
      catch (e) { console.error("[Audio] resume failed:", e); return false; }
    }
    return false;
  }

  getContextState(): string { return this.ctx?.state ?? "not created"; }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1.5, v));
  }

  private freq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Lazy-create a PeriodicWave that gives a warm, mellow character.
  // Fundamental + a few harmonics makes the tone feel more musical than a bare sine.
  // Normalization is on so the wave peak = 1.0 — gain values stay predictable.
  private getWave(): PeriodicWave | null {
    if (!this.ctx) return null;
    if (this.wave) return this.wave;
    try {
      const real = new Float32Array([0, 0, 0, 0, 0]);
      const imag = new Float32Array([0, 1.0, 0.5, 0.2, 0.08]);
      this.wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } catch {
      /* fall back to sine */
    }
    return this.wave;
  }

  // Core tone scheduler. Uses an exponential-decay envelope so notes sound
  // like a struck/plucked instrument rather than a flat organ pipe.
  private scheduleTone(
    frequency: number,
    startTime: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.ctx || !this.master) return;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();

    const wave = this.getWave();
    if (wave) {
      osc.setPeriodicWave(wave);
    } else {
      osc.type = "sine";
    }
    osc.frequency.value = frequency;
    osc.connect(g);
    g.connect(this.master);

    const t = startTime;
    const sustainGain = Math.max(peakGain * 0.45, 0.0001);
    const releaseEnd = t + duration + 0.15;

    // Attack: immediate (no click protection needed — starts at full gain).
    // Decay:  exponential fall to sustain level over most of the note.
    // Release: exponential fade to silence.
    g.gain.setValueAtTime(peakGain, t);
    g.gain.exponentialRampToValueAtTime(sustainGain, t + duration * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);

    osc.start(t);
    osc.stop(releaseEnd + 0.05);
  }

  // ─── Synchronous schedule methods ─────────────────────────────────────────
  // Call immediately after init() inside a user-gesture handler.
  // 200 ms lookahead lets the AudioContext resume before notes are due.

  scheduleChord(notes: number[], duration = 1.2): void {
    if (!notes?.length) return;
    if (!this.ctx || !this.master) { this.init(); }
    if (!this.ctx || !this.master) { console.warn("[Audio] scheduleChord: ctx/master null after init"); return; }
    const gain = 0.45 / Math.sqrt(notes.length);
    const t = this.ctx.currentTime + 0.2;
    notes.forEach(note => this.scheduleTone(this.freq(note), t, duration, gain));
  }

  scheduleChordProgression(
    first: number[], second: number[],
    gap = 1.3, d1 = 1.0, d2 = 1.5,
  ): void {
    if (!first?.length || !second?.length) return;
    if (!this.ctx || !this.master) { this.init(); }
    if (!this.ctx || !this.master) { console.warn("[Audio] scheduleChordProgression: ctx/master null after init"); return; }
    const t = this.ctx.currentTime + 0.2;
    first.forEach(note => this.scheduleTone(this.freq(note), t, d1, 0.45 / Math.sqrt(first.length)));
    second.forEach(note => this.scheduleTone(this.freq(note), t + gap, d2, 0.45 / Math.sqrt(second.length)));
  }

  scheduleInterval(rootNote: number, interval: number, tempo = 100): void {
    if (!this.ctx || !this.master) { this.init(); }
    if (!this.ctx || !this.master) { console.warn("[Audio] scheduleInterval: ctx/master null after init"); return; }
    const d = 60 / tempo;
    const t = this.ctx.currentTime + 0.2;
    this.scheduleTone(this.freq(rootNote), t, d * 1.2, 0.6);
    this.scheduleTone(this.freq(rootNote + interval), t + d + 0.1, d * 1.2, 0.6);
  }

  scheduleNote(midiNote: number, duration = 0.8, velocity = 0.8): void {
    if (!this.ctx || !this.master) { this.init(); }
    if (!this.ctx || !this.master) { console.warn("[Audio] scheduleNote: ctx/master null after init"); return; }
    this.scheduleTone(this.freq(midiNote), this.ctx.currentTime + 0.2, duration, velocity * 0.6);
  }

  // ─── Async play methods ────────────────────────────────────────────────────
  // For the AudioTestButton and other non-gesture callers.

  async playNote(midiNote: number, duration = 0.8, velocity = 0.8): Promise<void> {
    if (!await this.ready()) return;
    this.scheduleTone(this.freq(midiNote), this.ctx!.currentTime + 0.05, duration, velocity * 0.6);
  }

  async playInterval(rootNote: number, interval: number, tempo = 100): Promise<void> {
    if (!await this.ready()) return;
    const d = 60 / tempo;
    const t = this.ctx!.currentTime + 0.05;
    this.scheduleTone(this.freq(rootNote), t, d * 1.2, 0.6);
    this.scheduleTone(this.freq(rootNote + interval), t + d + 0.1, d * 1.2, 0.6);
  }

  async playChord(notes: number[], duration = 1.2): Promise<void> {
    if (!notes?.length || !await this.ready()) return;
    const gain = 0.45 / Math.sqrt(notes.length);
    const t = this.ctx!.currentTime + 0.05;
    notes.forEach(note => this.scheduleTone(this.freq(note), t, duration, gain));
  }

  async playChordProgression(
    first: number[], second: number[],
    gap = 1.3, d1 = 1.0, d2 = 1.5,
  ): Promise<void> {
    if (!first?.length || !second?.length || !await this.ready()) return;
    const t = this.ctx!.currentTime + 0.05;
    first.forEach(note => this.scheduleTone(this.freq(note), t, d1, 0.45 / Math.sqrt(first.length)));
    second.forEach(note => this.scheduleTone(this.freq(note), t + gap, d2, 0.45 / Math.sqrt(second.length)));
  }

  async playMelody(notes: number[], tempo = 120): Promise<void> {
    if (!notes?.length || !await this.ready()) return;
    const d = 60 / tempo;
    const t = this.ctx!.currentTime + 0.05;
    notes.forEach((note, i) => this.scheduleTone(this.freq(note), t + i * (d + 0.02), d * 0.9, 0.5));
  }

  // Sustained note for the on-screen piano keyboard — pure sine so it doesn't
  // clash with the PeriodicWave tones when held alongside a chord.
  startNote(midiNote: number, velocity = 0.8): void {
    if (this.activeOscillators.has(midiNote)) this.stopNote(midiNote);
    this.ready().then(ok => {
      if (!ok || !this.ctx || !this.master) return;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = this.freq(midiNote);
      osc.connect(gainNode);
      gainNode.connect(this.master);
      gainNode.gain.setValueAtTime(velocity * 0.35, this.ctx.currentTime + 0.005);
      osc.start(this.ctx.currentTime + 0.005);
      this.activeOscillators.set(midiNote, { osc, gain: gainNode });
    });
  }

  stopNote(midiNote: number): void {
    const active = this.activeOscillators.get(midiNote);
    if (active && this.ctx) {
      const t = this.ctx.currentTime;
      active.gain.gain.cancelScheduledValues(t);
      active.gain.gain.setValueAtTime(active.gain.gain.value, t);
      active.gain.gain.linearRampToValueAtTime(0.0001, t + 0.08);
      try { active.osc.stop(t + 0.1); } catch { /* already stopped */ }
      this.activeOscillators.delete(midiNote);
    }
  }

  // Pure-sine beep with flat sustain — used for feedback so it sounds clearly
  // different from the PeriodicWave instrument tones.
  private scheduleBeep(frequency: number, startTime: number, duration: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(g);
    g.connect(this.master);
    const t = startTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.setValueAtTime(gain, t + duration - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + duration + 0.05);
    osc.start(t);
    osc.stop(t + duration + 0.1);
  }

  async playCorrect(): Promise<void> {
    if (!await this.ready()) return;
    const t = this.ctx!.currentTime + 0.02;
    [523.25, 659.25, 783.99].forEach((f, i) => this.scheduleBeep(f, t + i * 0.08, 0.3, 0.25));
  }

  async playIncorrect(): Promise<void> {
    if (!await this.ready()) return;
    this.scheduleBeep(180, this.ctx!.currentTime + 0.02, 0.25, 0.25);
  }

  async initAsync(): Promise<void> { await this.ready(); }
}

export function getAudioEngine(): AudioEngine {
  if (typeof window === "undefined") return new AudioEngine();
  const w = window as typeof window & { __earTrainingAudio?: AudioEngine };
  if (!w.__earTrainingAudio) w.__earTrainingAudio = new AudioEngine();
  return w.__earTrainingAudio;
}

export type { AudioEngine };
