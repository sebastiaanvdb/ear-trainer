"use client";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
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
  // Creates the AudioContext and triggers resume — both happen within the gesture,
  // so the browser permits them. Audio scheduled immediately after this call will
  // play once the context is running (even if it hasn't started yet).
  init(): void {
    const AC = this.getAC();
    if (!AC) return;
    try {
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 1.0;
        this.master.connect(this.ctx.destination);
        console.log("[Audio] created, state:", this.ctx.state);
      }
      if (this.ctx.state === "suspended") {
        // Fire-and-forget: the browser resumes when it can (within gesture window).
        // Scheduled notes with sufficient lookahead will play after resume.
        this.ctx.resume().then(() =>
          console.log("[Audio] resumed, state:", this.ctx?.state)
        );
      }
    } catch (e) {
      console.error("[Audio] init failed:", e);
    }
  }

  // Async ready check — used by play methods that want to await before scheduling.
  async ready(): Promise<boolean> {
    if (!this.ctx) {
      console.warn("[Audio] ready(): context is null");
      return false;
    }
    if (this.ctx.state === "running") return true;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
        console.log("[Audio] resumed in ready(), state:", this.ctx.state);
        return true;
      } catch (e) {
        console.error("[Audio] resume failed:", e);
        return false;
      }
    }
    console.warn("[Audio] ready(): unexpected state:", this.ctx.state);
    return false;
  }

  getContextState(): string {
    return this.ctx?.state ?? "not created";
  }

  setVolume(v: number): void {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1.5, v));
  }

  private freq(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  // Schedule a single sine tone at an absolute startTime.
  // Works even if the context is suspended — notes play once it resumes.
  private scheduleTone(frequency: number, startTime: number, duration: number, gain: number): void {
    if (!this.ctx || !this.master) {
      console.error("[Audio] scheduleTone() called but ctx or master is null");
      return;
    }
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(g);
    g.connect(this.master);

    const t = startTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.setValueAtTime(gain, t + duration - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + duration + 0.05);
    osc.start(t);
    osc.stop(t + duration + 0.1);
  }

  // ─── Synchronous schedule methods ────────────────────────────────────────────
  // Call these right after init() inside a user-gesture handler.
  // No async, no await — everything happens within the gesture window.
  // A 200 ms lookahead ensures notes play even if context needs a moment to resume.

  scheduleChord(notes: number[], duration = 1.2): void {
    if (!notes?.length || !this.ctx || !this.master) return;
    const gain = 0.7 / Math.sqrt(notes.length);
    const t = this.ctx.currentTime + 0.2;
    console.log(`[Audio] scheduleChord: ${notes.length} notes @ t+200ms, gain=${gain.toFixed(3)}, ctx=${this.ctx.state}`);
    notes.forEach(note => this.scheduleTone(this.freq(note), t, duration, gain));
  }

  scheduleChordProgression(
    first: number[], second: number[],
    gap = 1.3, d1 = 1.0, d2 = 1.5,
  ): void {
    if (!first?.length || !second?.length || !this.ctx || !this.master) return;
    const g1 = 0.7 / Math.sqrt(first.length);
    const g2 = 0.7 / Math.sqrt(second.length);
    const t = this.ctx.currentTime + 0.2;
    console.log(`[Audio] scheduleChordProgression: ${first.length}+${second.length} notes, ctx=${this.ctx.state}`);
    first.forEach(note => this.scheduleTone(this.freq(note), t, d1, g1));
    second.forEach(note => this.scheduleTone(this.freq(note), t + gap, d2, g2));
  }

  scheduleInterval(rootNote: number, interval: number, tempo = 100): void {
    if (!this.ctx || !this.master) return;
    const d = 60 / tempo;
    const t = this.ctx.currentTime + 0.2;
    this.scheduleTone(this.freq(rootNote), t, d * 1.2, 0.7);
    this.scheduleTone(this.freq(rootNote + interval), t + d + 0.1, d * 1.2, 0.7);
  }

  scheduleNote(midiNote: number, duration = 0.8, velocity = 0.8): void {
    if (!this.ctx || !this.master) return;
    this.scheduleTone(this.freq(midiNote), this.ctx.currentTime + 0.2, duration, velocity * 0.7);
  }

  // ─── Async play methods ───────────────────────────────────────────────────────
  // Used by the AudioTestButton and other non-gesture callers.
  // These await ready() internally — fine for buttons that are clicked directly.

  async playNote(midiNote: number, duration = 0.8, velocity = 0.8): Promise<void> {
    if (!await this.ready()) return;
    this.scheduleTone(this.freq(midiNote), this.ctx!.currentTime + 0.02, duration, velocity * 0.7);
  }

  async playInterval(rootNote: number, interval: number, tempo = 100): Promise<void> {
    if (!await this.ready()) return;
    const d = 60 / tempo;
    const t = this.ctx!.currentTime + 0.02;
    this.scheduleTone(this.freq(rootNote), t, d * 1.2, 0.7);
    this.scheduleTone(this.freq(rootNote + interval), t + d + 0.1, d * 1.2, 0.7);
  }

  async playChord(notes: number[], duration = 1.2): Promise<void> {
    if (!notes?.length) return;
    if (!await this.ready()) {
      console.warn("[Audio] playChord: not ready, ctx state:", this.ctx?.state);
      return;
    }
    const gain = 0.7 / Math.sqrt(notes.length);
    const t = this.ctx!.currentTime + 0.02;
    console.log(`[Audio] playChord: ${notes.length} notes @ ${t.toFixed(3)}, gain=${gain.toFixed(3)}, ctx=${this.ctx!.state}`);
    notes.forEach(note => this.scheduleTone(this.freq(note), t, duration, gain));
  }

  async playChordProgression(
    first: number[], second: number[],
    gap = 1.3, d1 = 1.0, d2 = 1.5,
  ): Promise<void> {
    if (!first?.length || !second?.length) return;
    if (!await this.ready()) return;
    const g1 = 0.7 / Math.sqrt(first.length);
    const g2 = 0.7 / Math.sqrt(second.length);
    const t = this.ctx!.currentTime + 0.02;
    console.log(`[Audio] playChordProgression: ${first.length}+${second.length} notes, ctx=${this.ctx!.state}`);
    first.forEach(note => this.scheduleTone(this.freq(note), t, d1, g1));
    second.forEach(note => this.scheduleTone(this.freq(note), t + gap, d2, g2));
  }

  async playMelody(notes: number[], tempo = 120): Promise<void> {
    if (!notes?.length) return;
    if (!await this.ready()) return;
    const d = 60 / tempo;
    const t = this.ctx!.currentTime + 0.02;
    notes.forEach((note, i) => this.scheduleTone(this.freq(note), t + i * (d + 0.02), d * 0.9, 0.6));
  }

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
      const t = this.ctx.currentTime + 0.005;
      gainNode.gain.setValueAtTime(velocity * 0.4, t);
      osc.start(t);
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

  async playCorrect(): Promise<void> {
    if (!await this.ready()) return;
    const t = this.ctx!.currentTime + 0.02;
    [523.25, 659.25, 783.99].forEach((f, i) => this.scheduleTone(f, t + i * 0.08, 0.3, 0.25));
  }

  async playIncorrect(): Promise<void> {
    if (!await this.ready()) return;
    this.scheduleTone(180, this.ctx!.currentTime + 0.02, 0.25, 0.25);
  }

  async initAsync(): Promise<void> { await this.ready(); }
}

let _engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (typeof window === "undefined") return new AudioEngine();
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}

export type { AudioEngine };
