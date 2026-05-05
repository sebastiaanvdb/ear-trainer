"use client";

class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeOscillators: Map<number, { oscs: OscillatorNode[]; gain: GainNode }> = new Map();

  private getAudioContext(): typeof AudioContext | null {
    if (typeof window === "undefined") return null;
    return (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext ||
      null
    );
  }

  // Call synchronously inside a click handler — creates/resumes the AudioContext
  // within the user gesture so browsers allow audio playback.
  init(): void {
    const Ctx = this.getAudioContext();
    if (!Ctx) return;
    try {
      if (!this.context) {
        this.context = new Ctx();

        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 0.7;
        this.masterGain.connect(this.context.destination);
      }

      if (this.context.state === "suspended") {
        this.context.resume();
      }
    } catch (e) {
      console.error("[Audio] Failed to create AudioContext:", e);
    }
  }

  async ready(): Promise<boolean> {
    if (!this.context) return false;
    if (this.context.state === "running") return true;
    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
        return true;
      } catch (e) {
        console.error("[Audio] resume failed:", e);
        return false;
      }
    }
    return false;
  }

  getContextState(): string {
    return this.context?.state ?? "not created";
  }

  setVolume(volume: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  private midiToFrequency(midiNote: number): number {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  // Simple, reliable tone with harmonics and ADSR envelope.
  private playTone(
    frequency: number,
    duration: number,
    peakGain: number,
    startOffset: number = 0,
    harmonics: { ratio: number; amp: number }[] = [
      { ratio: 1, amp: 1.0 },
      { ratio: 2, amp: 0.5 },
      { ratio: 3, amp: 0.25 },
      { ratio: 4, amp: 0.1 },
    ]
  ): void {
    if (!this.context || !this.masterGain) return;
    const ctx = this.context;
    // Add a small lookahead so scheduling never falls in the past
    const now = ctx.currentTime + startOffset + 0.005;

    const gainNode = ctx.createGain();
    gainNode.connect(this.masterGain);

    harmonics.forEach(({ ratio, amp }) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency * ratio;
      oscGain.gain.value = amp;
      osc.connect(oscGain);
      oscGain.connect(gainNode);
      osc.start(now);
      osc.stop(now + duration + 0.3);
    });

    // ADSR — start gain from a tiny non-zero value so exponential ramps work
    const attack = 0.01;
    const decay = 0.1;
    const sustainLevel = peakGain * 0.6;

    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + attack);
    gainNode.gain.linearRampToValueAtTime(sustainLevel, now + attack + decay);
    gainNode.gain.setValueAtTime(sustainLevel, now + duration - 0.05);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + duration + 0.1);
  }

  async playNote(midiNote: number, duration: number = 0.8, velocity: number = 0.8): Promise<void> {
    if (!await this.ready()) return;
    // Solo note: full gain budget (0.5 / sqrt(1) = 0.5)
    this.playTone(this.midiToFrequency(midiNote), duration, velocity * 0.5, 0, [
      { ratio: 1, amp: 1.0 },
      { ratio: 2, amp: 0.6 },
      { ratio: 3, amp: 0.3 },
      { ratio: 4, amp: 0.15 },
      { ratio: 5, amp: 0.08 },
      { ratio: 6, amp: 0.04 },
    ]);
  }

  async playInterval(rootNote: number, interval: number, tempo: number = 100): Promise<void> {
    if (!await this.ready()) return;
    const noteDuration = 60 / tempo;
    const gap = noteDuration + 0.1;
    // Two sequential notes — each gets full gain (not simultaneous, so no RMS stacking)
    this.playTone(this.midiToFrequency(rootNote), noteDuration * 1.2, 0.5, 0);
    this.playTone(this.midiToFrequency(rootNote + interval), noteDuration * 1.2, 0.5, gap);
  }

  async playChord(notes: number[], duration: number = 1.2): Promise<void> {
    if (!notes || notes.length === 0) return;
    if (!await this.ready()) return;
    // Scale gain by sqrt(noteCount) so RMS stays constant regardless of chord size.
    // e.g. 4 notes → 0.5/2 = 0.25 each; 1 note → 0.5; 3 notes → 0.5/1.73 ≈ 0.29
    const gain = 0.5 / Math.sqrt(notes.length);
    notes.forEach((note, index) => {
      this.playTone(this.midiToFrequency(note), duration, gain, index * 0.02);
    });
  }

  // Schedules two chords atomically using Web Audio time offsets — no setTimeout needed,
  // so the second chord plays even on browsers that block AudioContext.resume() outside a
  // user gesture (e.g. Safari/iOS after an async gap).
  async playChordProgression(
    firstNotes: number[],
    secondNotes: number[],
    gapSeconds: number = 1.3,
    firstDuration: number = 1.0,
    secondDuration: number = 1.5,
  ): Promise<void> {
    if (!firstNotes?.length || !secondNotes?.length) return;
    if (!await this.ready()) return;
    const gain1 = 0.5 / Math.sqrt(firstNotes.length);
    const gain2 = 0.5 / Math.sqrt(secondNotes.length);
    firstNotes.forEach((note, i) => {
      this.playTone(this.midiToFrequency(note), firstDuration, gain1, i * 0.02);
    });
    secondNotes.forEach((note, i) => {
      this.playTone(this.midiToFrequency(note), secondDuration, gain2, gapSeconds + i * 0.02);
    });
  }

  async playMelody(notes: number[], tempo: number = 120): Promise<void> {
    if (!notes || notes.length === 0) return;
    if (!await this.ready()) return;
    const noteDuration = 60 / tempo;
    // Melody notes are sequential — full gain each
    notes.forEach((note, index) => {
      this.playTone(this.midiToFrequency(note), noteDuration * 0.9, 0.5, index * (noteDuration + 0.02));
    });
  }

  startNote(midiNote: number, velocity: number = 0.8): void {
    if (this.activeOscillators.has(midiNote)) this.stopNote(midiNote);

    this.ready().then(ok => {
      if (!ok || !this.context || !this.masterGain) return;
      const ctx = this.context;
      const freq = this.midiToFrequency(midiNote);
      const now = ctx.currentTime + 0.005;
      const gainNode = ctx.createGain();

      const oscillators: OscillatorNode[] = [];
      [
        { ratio: 1, amp: 1.0 },
        { ratio: 2, amp: 0.4 },
        { ratio: 3, amp: 0.2 },
        { ratio: 4, amp: 0.1 },
      ].forEach(({ ratio, amp }) => {
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * ratio;
        oscGain.gain.value = amp;
        osc.connect(oscGain);
        oscGain.connect(gainNode);
        osc.start(now);
        oscillators.push(osc);
      });

      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.linearRampToValueAtTime(velocity * 0.3, now + 0.01);
      gainNode.connect(this.masterGain!);

      this.activeOscillators.set(midiNote, { oscs: oscillators, gain: gainNode });
    });
  }

  stopNote(midiNote: number): void {
    const active = this.activeOscillators.get(midiNote);
    if (active && this.context) {
      const now = this.context.currentTime;
      active.gain.gain.cancelScheduledValues(now);
      active.gain.gain.setValueAtTime(active.gain.gain.value, now);
      active.gain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
      active.oscs.forEach(osc => {
        try { osc.stop(now + 0.15); } catch { /* already stopped */ }
      });
      this.activeOscillators.delete(midiNote);
    }
  }

  async playCorrect(): Promise<void> {
    if (!await this.ready()) return;
    const ctx = this.context!;
    const now = ctx.currentTime + 0.005;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.08;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.15, t + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  async playIncorrect(): Promise<void> {
    if (!await this.ready()) return;
    const ctx = this.context!;
    const now = ctx.currentTime + 0.005;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 180;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.masterGain!);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Legacy shim
  async initAsync(): Promise<void> {
    await this.ready();
  }
}

export function getAudioEngine(): AudioEngine {
  if (typeof window === "undefined") {
    // SSR context — return a fresh no-op instance (never used for actual audio)
    return new AudioEngine();
  }
  // Attach to window so the instance — and its AudioContext — survive HMR/hot
  // reloads.  Without this, each hot reload resets the module-level variable to
  // null, a new AudioContext is created *outside* a user gesture (from the
  // auto-play setTimeout), the browser puts it in "suspended" state, resume()
  // fails silently, and chord audio stops working until the user manually
  // clicks Play again (creating the context inside a user gesture).
  const win = window as typeof window & { __earTrainingAudio?: AudioEngine };
  if (!win.__earTrainingAudio) {
    win.__earTrainingAudio = new AudioEngine();
  }
  return win.__earTrainingAudio;
}

export type { AudioEngine };
