export interface Interval {
  semitones: number;
  name: string;
  shortName: string;
}

export const INTERVALS: Interval[] = [
  { semitones: 0, name: "Unison", shortName: "P1" },
  { semitones: 1, name: "Minor 2nd", shortName: "m2" },
  { semitones: 2, name: "Major 2nd", shortName: "M2" },
  { semitones: 3, name: "Minor 3rd", shortName: "m3" },
  { semitones: 4, name: "Major 3rd", shortName: "M3" },
  { semitones: 5, name: "Perfect 4th", shortName: "P4" },
  { semitones: 6, name: "Tritone", shortName: "TT" },
  { semitones: 7, name: "Perfect 5th", shortName: "P5" },
  { semitones: 8, name: "Minor 6th", shortName: "m6" },
  { semitones: 9, name: "Major 6th", shortName: "M6" },
  { semitones: 10, name: "Minor 7th", shortName: "m7" },
  { semitones: 11, name: "Major 7th", shortName: "M7" },
  { semitones: 12, name: "Octave", shortName: "P8" },
];

export interface ChordType {
  name: string;
  shortName: string;
  intervals: number[]; // semitones from root
}

export const CHORD_TYPES: ChordType[] = [
  { name: "Major", shortName: "maj", intervals: [0, 4, 7] },
  { name: "Minor", shortName: "min", intervals: [0, 3, 7] },
  { name: "Diminished", shortName: "dim", intervals: [0, 3, 6] },
  { name: "Augmented", shortName: "aug", intervals: [0, 4, 8] },
  { name: "Major 7th", shortName: "maj7", intervals: [0, 4, 7, 11] },
  { name: "Minor 7th", shortName: "min7", intervals: [0, 3, 7, 10] },
  { name: "Dominant 7th", shortName: "7", intervals: [0, 4, 7, 10] },
];

export type ExerciseType = "interval" | "chord" | "melody";
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export interface ExerciseConfig {
  type: ExerciseType;
  difficulty: DifficultyLevel;
}

export interface IntervalQuestion {
  type: "interval";
  rootNote: number;
  interval: number;
  intervalName: string;
  direction: "ascending" | "descending";
}

export interface ChordQuestion {
  type: "chord";
  rootNote: number;
  chordType: ChordType;
  notes: number[];
}

export interface MelodyQuestion {
  type: "melody";
  notes: number[];
  rootNote: number;
}

export type Question = IntervalQuestion | ChordQuestion | MelodyQuestion;

// Get random integer between min and max (inclusive)
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get random element from array
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Get available intervals based on difficulty
function getIntervalsForDifficulty(difficulty: DifficultyLevel): Interval[] {
  switch (difficulty) {
    case 1:
      // Perfect intervals only
      return INTERVALS.filter((i) => [0, 5, 7, 12].includes(i.semitones));
    case 2:
      // Add major/minor 3rds and 6ths
      return INTERVALS.filter((i) => [0, 3, 4, 5, 7, 8, 9, 12].includes(i.semitones));
    case 3:
      // Add 2nds and 7ths
      return INTERVALS.filter((i) => [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].includes(i.semitones));
    case 4:
    case 5:
      // All intervals including tritone
      return INTERVALS;
  }
}

// Get available chord types based on difficulty
function getChordTypesForDifficulty(difficulty: DifficultyLevel): ChordType[] {
  switch (difficulty) {
    case 1:
      return CHORD_TYPES.filter((c) => ["maj", "min"].includes(c.shortName));
    case 2:
      return CHORD_TYPES.filter((c) => ["maj", "min", "dim", "aug"].includes(c.shortName));
    case 3:
    case 4:
    case 5:
      return CHORD_TYPES;
  }
}

export function generateIntervalQuestion(difficulty: DifficultyLevel): IntervalQuestion {
  const intervals = getIntervalsForDifficulty(difficulty);
  const interval = randomChoice(intervals);
  // C3 to C5 range for root note
  const rootNote = randomInt(48, 72);
  const direction = difficulty >= 3 && Math.random() > 0.7 ? "descending" : "ascending";

  return {
    type: "interval",
    rootNote,
    interval: direction === "ascending" ? interval.semitones : -interval.semitones,
    intervalName: interval.name,
    direction,
  };
}

export function generateChordQuestion(difficulty: DifficultyLevel): ChordQuestion {
  const chordTypes = getChordTypesForDifficulty(difficulty);
  const chordType = randomChoice(chordTypes);
  // C3 to G4 range for root note (so full chord fits nicely)
  const rootNote = randomInt(48, 67);
  const notes = chordType.intervals.map((i) => rootNote + i);

  return {
    type: "chord",
    rootNote,
    chordType,
    notes,
  };
}

// Scale patterns (semitones from root)
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const PENTATONIC = [0, 2, 4, 7, 9];

// Get note from scale degree (with octave handling)
function getScaleNote(root: number, degree: number, scale: number[]): number {
  const octaves = Math.floor(degree / scale.length);
  const degreeInOctave = ((degree % scale.length) + scale.length) % scale.length;
  return root + octaves * 12 + scale[degreeInOctave];
}

export function generateMelodyQuestion(difficulty: DifficultyLevel): MelodyQuestion {
  // Length increases with difficulty
  const length = difficulty <= 2 ? 3 : difficulty <= 3 ? 4 : difficulty <= 4 ? 5 : 6;
  
  // Root note range (C4 to G4 so melody stays in comfortable range)
  const rootNote = randomInt(60, 67);
  
  // Choose scale based on difficulty
  const scales = difficulty <= 2 
    ? [PENTATONIC] 
    : difficulty <= 3 
      ? [MAJOR_SCALE, PENTATONIC]
      : [MAJOR_SCALE, MINOR_SCALE];
  const scale = randomChoice(scales);
  
  // Start on root (degree 0)
  let currentDegree = 0;
  const degrees: number[] = [currentDegree];
  
  // Motion patterns based on difficulty
  // Lower difficulty: mostly stepwise, higher: allows more leaps
  const stepOptions = difficulty <= 2 
    ? [-1, 1, 1, 1]  // Mostly up, always stepwise
    : difficulty <= 3 
      ? [-2, -1, -1, 1, 1, 2]  // Steps with occasional 3rd
      : [-3, -2, -1, 1, 2, 3];  // Wider range, including 4ths
  
  // Generate melodic contour
  for (let i = 1; i < length; i++) {
    const step = randomChoice(stepOptions);
    let nextDegree = currentDegree + step;
    
    // Keep within reasonable range (roughly an octave)
    if (nextDegree > 7) nextDegree = 7 - (nextDegree - 7);
    if (nextDegree < -2) nextDegree = -2 + (-2 - nextDegree);
    
    degrees.push(nextDegree);
    currentDegree = nextDegree;
  }
  
  // At higher difficulties, sometimes return to root at the end
  if (difficulty >= 3 && Math.random() > 0.5) {
    degrees[degrees.length - 1] = 0;
  }
  
  // Convert degrees to MIDI notes
  const notes = degrees.map(degree => getScaleNote(rootNote, degree, scale));

  return {
    type: "melody",
    notes,
    rootNote,
  };
}

export function generateQuestion(config: ExerciseConfig): Question {
  switch (config.type) {
    case "interval":
      return generateIntervalQuestion(config.difficulty);
    case "chord":
      return generateChordQuestion(config.difficulty);
    case "melody":
      return generateMelodyQuestion(config.difficulty);
  }
}

// Check if played interval matches the question
export function checkIntervalAnswer(question: IntervalQuestion, playedNotes: number[]): boolean {
  if (playedNotes.length !== 2) return false;
  const sorted = [...playedNotes].sort((a, b) => a - b);
  const playedInterval = sorted[1] - sorted[0];
  return playedInterval === Math.abs(question.interval);
}

// Check if played chord matches (by chord type, any inversion)
export function checkChordAnswer(question: ChordQuestion, playedNotes: number[]): boolean {
  if (playedNotes.length !== question.notes.length) return false;

  // Normalize to pitch classes (0-11)
  const expectedPitchClasses = question.notes.map((n) => n % 12).sort((a, b) => a - b);
  const playedPitchClasses = playedNotes.map((n) => n % 12).sort((a, b) => a - b);

  return expectedPitchClasses.every((pc, i) => pc === playedPitchClasses[i]);
}

// Check if played melody matches
export function checkMelodyAnswer(question: MelodyQuestion, playedNotes: number[]): boolean {
  if (playedNotes.length !== question.notes.length) return false;

  // Check intervals (relative, not absolute pitch)
  for (let i = 1; i < question.notes.length; i++) {
    const expectedInterval = question.notes[i] - question.notes[i - 1];
    const playedInterval = playedNotes[i] - playedNotes[i - 1];
    if (expectedInterval !== playedInterval) return false;
  }
  return true;
}
