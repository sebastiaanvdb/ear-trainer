import { IntervalStats } from "./intervalMovementLearning";
export type { IntervalStats };

// keyed by semitones 0–11
export type DegreeProgress = Partial<Record<number, IntervalStats>>;

// Jazz degree labels, indexed by semitones from root
export const DEGREES = [
  { semitones: 0,  label: "1",   altLabel: null,   description: "Root" },
  { semitones: 1,  label: "b9",  altLabel: null,   description: "Minor 9th" },
  { semitones: 2,  label: "9",   altLabel: null,   description: "Major 9th" },
  { semitones: 3,  label: "#9",  altLabel: "b3",   description: "Minor 3rd / #9" },
  { semitones: 4,  label: "3",   altLabel: null,   description: "Major 3rd" },
  { semitones: 5,  label: "11",  altLabel: "4",    description: "Perfect 11th" },
  { semitones: 6,  label: "#11", altLabel: "b5",   description: "Tritone / #11" },
  { semitones: 7,  label: "5",   altLabel: null,   description: "Perfect 5th" },
  { semitones: 8,  label: "b13", altLabel: "#5",   description: "Minor 6th / b13" },
  { semitones: 9,  label: "13",  altLabel: "6",    description: "Major 6th / 13" },
  { semitones: 10, label: "b7",  altLabel: null,   description: "Minor 7th" },
  { semitones: 11, label: "7",   altLabel: null,   description: "Major 7th" },
] as const;

// For minor/dim chords show "b3" instead of "#9", and for augmented show "#5" instead of "b13"
export function degreeLabel(semitones: number, chordShortName: string): string {
  const d = DEGREES.find(x => x.semitones === semitones);
  if (!d) return String(semitones);
  if (semitones === 3 && ["min", "min7", "dim"].includes(chordShortName)) return "b3";
  if (semitones === 8 && chordShortName === "aug") return "#5";
  return d.label;
}

// Available degree semitones per difficulty level
export function getAvailableDegrees(difficulty: number): number[] {
  switch (difficulty) {
    case 1: return [0, 3, 4, 7];              // chord tones only (root, 3rd/b3, 5th)
    case 2: return [0, 3, 4, 7, 10, 11];      // + b7, 7
    case 3: return [0, 2, 3, 4, 7, 10, 11];   // + 9
    case 4: return [0, 2, 3, 4, 5, 7, 9, 10, 11]; // + 11, 13
    default: return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // all
  }
}

// Chord types available per difficulty level
export function getChordsForDifficulty(difficulty: number): string[] {
  switch (difficulty) {
    case 1: return ["maj", "min"];
    case 2: return ["maj", "min", "maj7", "min7", "7"];
    case 3: return ["maj", "min", "maj7", "min7", "7", "dim", "aug"];
    default: return ["maj", "min", "maj7", "min7", "7", "dim", "aug"];
  }
}

// Pedagogical introduction phases — subsets of DEGREE_PHASES introduced one group at a time.
// Unlocked within the set available at the current difficulty level.
export const DEGREE_PHASES: number[][] = [
  [0, 7],      // Phase 1: root + 5th  — most stable
  [4, 3],      // Phase 2: 3rd + b3   — chord quality
  [11, 10],    // Phase 3: 7 + b7     — seventh chords
  [2],         // Phase 4: 9          — most common extension
  [5, 9],      // Phase 5: 11 + 13
  [1, 6, 8],   // Phase 6: b9, #11, b13 — altered
];

function getRecentAccuracy(stats: IntervalStats): number {
  if (stats.recentAttempts.length === 0) return 0;
  return stats.recentAttempts.filter(Boolean).length / stats.recentAttempts.length;
}

function getActiveDegrees(p: DegreeProgress): number[] {
  return Object.keys(p).map(Number).sort((a, b) => a - b);
}

function shouldUnlock(p: DegreeProgress, available: number[]): boolean {
  const active = getActiveDegrees(p).filter(s => available.includes(s));
  if (active.length === 0) return true;
  return active.every(s => {
    const stats = p[s];
    return stats !== undefined && stats.attempts >= 3 && getRecentAccuracy(stats) >= 0.70;
  });
}

function unlockNext(p: DegreeProgress, available: number[]): void {
  const activeSet = new Set(getActiveDegrees(p));
  for (const phase of DEGREE_PHASES) {
    const phaseInAvail = phase.filter(s => available.includes(s));
    if (phaseInAvail.length === 0) continue;
    if (!phaseInAvail.every(s => activeSet.has(s))) {
      for (const s of phaseInAvail) {
        if (p[s] === undefined) p[s] = { attempts: 0, correct: 0, recentAttempts: [] };
      }
      return;
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

export function selectNextDegree(p: DegreeProgress, availableSemitones: number[]): number {
  if (shouldUnlock(p, availableSemitones)) unlockNext(p, availableSemitones);

  const active = getActiveDegrees(p).filter(s => availableSemitones.includes(s));
  if (active.length === 0) {
    unlockNext(p, availableSemitones);
    return getActiveDegrees(p).filter(s => availableSemitones.includes(s))[0] ?? availableSemitones[0];
  }

  const weights = active.map(s => {
    const stats = p[s];
    if (!stats) return 1.0;
    const acc = getRecentAccuracy(stats);
    return Math.max(0.1, 1.0 - acc) + (stats.attempts < 4 ? 0.5 : 0);
  });

  return weightedRandom(active, weights);
}

export function recordDegreeAttempt(
  p: DegreeProgress,
  semitones: number,
  correct: boolean,
): DegreeProgress {
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

export function getActiveDegreeList(p: DegreeProgress): number[] {
  return getActiveDegrees(p);
}

export function getDegreeRecentAccuracy(stats: IntervalStats): number {
  return getRecentAccuracy(stats);
}
