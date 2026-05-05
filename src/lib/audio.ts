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

  // Must be called synchronously inside a user-gesture handler.
  // Creates the AudioContext (which starts "running" when created in a gesture)
  // and resumes it if it was previously suspended (e.g. tab backgrounded).
  init(): void {
    const AC = this.getAC();
    if (!AC) return;
    try {
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 1.0;
        this.master.connect(this.ctx.destination);
        console.log("[Audio] context created, state:", this.ctx.state);
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    } catch (e) {
      console.error("[Audio] init failed:", e);
    }
  }

  async ready(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state === "running") return true;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
        return true;
      } catch (e) {
        console.error("[Audio] resume failed:", e);
        return false;
      }
    }
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

  // Schedule a single sine-wave note. Pure and simple — no harmonics means
  // nothing to go wrong, and the level is predictable.
  private tone(
    frequency: number,
    startTime: number,
    duration: number,
    peakGain: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    osc.connect(g);
    g.connect(this.master);

    // Simple ADSR
    const t = startTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peakGain, t + 0.015);       // attack
    g.gain.linearRampToValueAtTime(peakGain * 0.65, t + 0.12); // decay to sustain
    g.gain.setValueAtTime(peakGain * 0.65, t + duration - 0.06);
    g.gain.linearRampToValueAtTime(0.0001, t + duration + 0.08); // release

    osc.start(t);
    osc.stop(t + duration + 0.15);
  }

  async playNote(midiNote: number, duration = 0.8, velocity = 0.8): Promise<void> {
    if (!await this.ready()) return;
    this.tone(this.freq(midiNote), this.ctx!.currentTime + 0.005, duration, velocity * 0.7);
  }

  async playInterval(rootNote: number, interval: number, tempo = 100): Promise<void> {
    if (!await this.ready()) return;
    const d = 60 / tempo;
    const t = this.ctx!.currentTime + 0.005;
    this.tone(this.freq(rootNote), t, d * 1.2, 0.7);
    this.tone(this.freq(rootNote + interval), t + d + 0.1, d * 1.2, 0.7);
  }

  async playChord(notes: number[], duration = 1.2): Promise<void> {
    if (!notes?.length) return;
    if (!await this.ready()) {
      console.warn("[Audio] playChord: context not ready, state:", this.ctx?.state);
      return;
    }
    // Gain scaled by sqrt(N) so the total RMS is the same regardless of chord size.
    // master.gain is 1.0, so peak headroom per note = 0.7/sqrt(N).
    const gain = 0.7 / Math.sqrt(notes.length);
    const t = this.ctx!.currentTime + 0.005;
    console.log(`[Audio] playChord ${notes.length} notes, gain=${gain.toFixed(3)}, ctx=${this.ctx!.state}`);
    notes.forEach(note => this.tone(this.freq(note), t, duration, gain));
  }

  async playChordProgression(
    first: number[], second: number[],
    gap = 1.3, d1 = 1.0, d2 = 1.5,
  ): Promise<void> {
    if (!first?.length || !second?.length) return;
    if (!await this.ready()) return;
    const g1 = 0.7 / Math.sqrt(first.length);
    const g2 = 0.7 / Math.sqrt(second.length);
    const t = this.ctx!.currentTime + 0.005;
    first.forEach(note => this.tone(this.freq(note), t, d1, g1));
    second.forEach(note => this.tone(this.freq(note), t + gap, d2, g2));
  }

  async playMelody(notes: number[], tempo = 120): Promise<void> {
    if (!notes?.length) return;
    if (!await this.ready()) return;
    const d = 60 / tempo;
    const t = this.ctx!.currentTime + 0.005;
    notes.forEach((note, i) => this.tone(this.freq(note), t + i * (d + 0.02), d * 0.9, 0.6));
  }

  // Sustained note for piano keyboard interaction
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
      gainNode.gain.setValueAtTime(0.0001, t);
      gainNode.gain.linearRampToValueAtTime(velocity * 0.4, t + 0.01);
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
    const t = this.ctx!.currentTime + 0.005;
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, t + i * 0.08, 0.3, 0.25));
  }

  async playIncorrect(): Promise<void> {
    if (!await this.ready()) return;
    this.tone(180, this.ctx!.currentTime + 0.005, 0.25, 0.25);
  }

  async initAsync(): Promise<void> { await this.ready(); }
}

// Module-level singleton. On HMR, this resets to null, which is fine:
// hasInteractedRef in the exercise components also resets (component remounts),
// so auto-play is blocked until the user clicks Play — a genuine user gesture
// that creates a fresh AudioContext in "running" state.
let _engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (typeof window === "undefined") return new AudioEngine();
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}

export type { AudioEngine };
