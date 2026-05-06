"use client";

export interface IntervalStats {
  attempts: number;
  correct: number;
  recentAttempts: boolean[]; // last 8, newest last
}

// Keyed by semitones 0–11
export type IntervalMovementProgress = Partial<Record<number, IntervalStats>>;

// ─── Pedagogical introduction phases ─────────────────────────────────────────
// Ordered by frequency in Western tonal music and perceptual distinctiveness.
// Based on Berklee ear training curriculum and interval recognition research.
// Each group is introduced together; the next phase unlocks when ALL currently
// active intervals reach ≥70% recent accuracy AND have ≥3 attempts each.
export const INTRODUCTION_PHASES: number[][] = [
  [5, 7],   // Phase 1: P4/P5  — V→I, I→IV, I→V (most common functional movements)
  [0],      // Phase 2: Unison — same root, only quality changes
  [2, 10],  // Phase 3: M2/m7  — stepwise diatonic motion
  [3, 9],   // Phase 4: m3/M6  — thirds, common in minor/relative major
  [4, 8],   // Phase 5: M3/m6  — major mediant movement
  [1, 11],  // Phase 6: m2/M7  — chromatic half-step
  [6],      // Phase 7: Tritone — most dissonant, equal ascending/descending
];

// ─── Musically common quality pairings per interval ───────────────────────────
// Arrays weighted by repetition: more copies = higher probability.
// shortNames match CHORD_TYPES in exercises.ts: "maj","min","dim","aug","maj7","min7","7"
const INTERVAL_QUALITY_PREFS: Record<number, string[]> = {
  0:  ["maj", "min", "7", "maj7", "min7"],     // Unison — any quality works
  1:  ["maj", "maj", "7"],                      // ↑m2 — Neapolitan, chromatic approach
  2:  ["maj", "min", "maj", "min"],             // ↑M2 — diatonic stepwise
  3:  ["min", "min", "maj"],                    // ↑m3 — i→III, relative major motion
  4:  ["maj", "maj", "min"],                    // ↑M3 — mediant
  5:  ["maj", "min", "7", "maj"],               // ↑P4 — I→IV, V→I resolution
  6:  ["dim", "7", "maj"],                      // Tritone — dim chord, tritone substitution
  7:  ["maj", "7", "maj", "min"],               // ↑P5 — I→V, dominant motion
  8:  ["min", "maj", "aug"],                    // ↑m6
  9:  ["min", "maj", "min"],                    // ↑M6 — relative minor / vi
  10: ["7", "min", "7"],                        // ↑m7 — secondary dominant
  11: ["maj", "maj7"],                          // ↑M7 — leading tone chromatic
};

// Recent accuracy for one interval (uses last 8 attempts, or all if fewer)
export function getRecentAccuracy(stats: IntervalStats): number {
  if (stats.recentAttempts.length === 0) return 0;
  return stats.recentAttempts.filter(Boolean).length / stats.recentAttempts.length;
}

// All semitone values currently introduced (key exists in the progress object)
export function getActiveIntervals(p: IntervalMovementProgress): number[] {
  return Object.keys(p).map(Number).sort((a, b) => a - b);
}

// Which phase index comes next, or null if all phases are already unlocked
export function getNextPhaseIndex(p: IntervalMovementProgress): number | null {
  const active = new Set(getActiveIntervals(p));
  for (let i = 0; i < INTRODUCTION_PHASES.length; i++) {
    if (!INTRODUCTION_PHASES[i].every(s => active.has(s))) return i;
  }
  return null;
}

// True when all active intervals have ≥3 attempts AND ≥70% recent accuracy,
// or when no intervals are active yet (triggers Phase 1 unlock on first use).
export function shouldUnlockNextPhase(p: IntervalMovementProgress): boolean {
  const active = getActiveIntervals(p);
  if (active.length === 0) return true;
  return active.every(s => {
    const stats = p[s];
    return stats !== undefined && stats.attempts >= 3 && getRecentAccuracy(stats) >= 0.70;
  });
}

// Mutates p to introduce the next phase's intervals with fresh stats
export function unlockNextPhase(p: IntervalMovementProgress): void {
  const next = getNextPhaseIndex(p);
  if (next === null) return;
  for (const s of INTRODUCTION_PHASES[next]) {
    if (p[s] === undefined) {
      p[s] = { attempts: 0, correct: 0, recentAttempts: [] };
    }
  }
}

function weightedRandom(items: number[], weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Main selection:
// 1. Unlock next phase if all active intervals are ready
// 2. Weighted-random pick — struggling intervals get more reps, new intervals get a boost
export function selectNextInterval(p: IntervalMovementProgress): number {
  if (shouldUnlockNextPhase(p)) unlockNextPhase(p);

  const active = getActiveIntervals(p);
  if (active.length === 0) {
    // Fallback — shouldn't happen, but ensure we always have something
    unlockNextPhase(p);
    return getActiveIntervals(p)[0] ?? 5;
  }

  const weights = active.map(s => {
    const stats = p[s];
    if (!stats) return 1.0;
    const acc = getRecentAccuracy(stats);
    const base = Math.max(0.1, 1.0 - acc);      // inversely proportional to accuracy
    const newBoost = stats.attempts < 4 ? 0.5 : 0; // extra reps for newly introduced
    return base + newBoost;
  });

  return weightedRandom(active, weights);
}

// Pick a chord quality for the target interval, constrained to availableShortNames.
// Draws from INTERVAL_QUALITY_PREFS (weighted by repetition in the array),
// filtered to the quality names actually available at the current difficulty level.
export function selectChordQualityForInterval(
  semitones: number,
  availableShortNames: string[],
): string {
  const prefs = INTERVAL_QUALITY_PREFS[semitones] ?? [];
  const filtered = prefs.filter(q => availableShortNames.includes(q));

  if (filtered.length === 0) {
    return availableShortNames[Math.floor(Math.random() * availableShortNames.length)];
  }

  return filtered[Math.floor(Math.random() * filtered.length)];
}

// Immutable update: record one attempt and keep recentAttempts at most 8 entries
export function recordIntervalAttempt(
  p: IntervalMovementProgress,
  semitones: number,
  correct: boolean,
): IntervalMovementProgress {
  const existing = p[semitones] ?? { attempts: 0, correct: 0, recentAttempts: [] };
  const recentAttempts = [...existing.recentAttempts, correct].slice(-8);
  return {
    ...p,
    [semitones]: {
      attempts: existing.attempts + 1,
      correct: existing.correct + (correct ? 1 : 0),
      recentAttempts,
    },
  };
}
