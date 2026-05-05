"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { getAudioEngine } from "@/lib/audio";
import { midiToNoteName } from "@/hooks/useMidi";
import {
  ChordQuestion,
  generateChordQuestion,
  checkChordAnswer,
  CHORD_TYPES,
  DifficultyLevel,
  ChordType,
} from "@/lib/exercises";
import { MidiCC } from "@/hooks/useMidi";
import { recordAttempt, getCurrentDifficulty, getRecentStreak } from "@/lib/storage";

// Middle 3 octaves
const PIANO_START = 36;
const PIANO_END = 96;
const ROOT_NOTE_MIN = 48;
const ROOT_NOTE_MAX = 72;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Intervals for root movement - showing both up and down equivalents
const ROOT_MOVEMENTS = [
  { semitones: 0, name: "Same root", short: "Unison", upDown: "Same" },
  { semitones: 1, name: "Half step", short: "m2 / M7", upDown: "↑m2 / ↓M7" },
  { semitones: 2, name: "Whole step", short: "M2 / m7", upDown: "↑M2 / ↓m7" },
  { semitones: 3, name: "Minor 3rd", short: "m3 / M6", upDown: "↑m3 / ↓M6" },
  { semitones: 4, name: "Major 3rd", short: "M3 / m6", upDown: "↑M3 / ↓m6" },
  { semitones: 5, name: "Perfect 4th", short: "P4 / P5", upDown: "↑P4 / ↓P5" },
  { semitones: 6, name: "Tritone", short: "TT", upDown: "↑TT / ↓TT" },
  { semitones: 7, name: "Perfect 5th", short: "P5 / P4", upDown: "↑P5 / ↓P4" },
  { semitones: 8, name: "Minor 6th", short: "m6 / M3", upDown: "↑m6 / ↓M3" },
  { semitones: 9, name: "Major 6th", short: "M6 / m3", upDown: "↑M6 / ↓m3" },
  { semitones: 10, name: "Minor 7th", short: "m7 / M2", upDown: "↑m7 / ↓M2" },
  { semitones: 11, name: "Major 7th", short: "M7 / m2", upDown: "↑M7 / ↓m2" },
];

// Harmonic progression difficulty system
// Each entry: { degree: semitones from key root, quality: chord type shortName, name: display name }
interface HarmonicChord {
  degree: number;
  quality: string;
  name: string;
  category: "diatonic" | "modal" | "secondary" | "chromatic";
}

// Level 1-2: Diatonic chords (major scale)
const DIATONIC_CHORDS: HarmonicChord[] = [
  { degree: 0, quality: "maj", name: "I", category: "diatonic" },
  { degree: 2, quality: "min", name: "ii", category: "diatonic" },
  { degree: 4, quality: "min", name: "iii", category: "diatonic" },
  { degree: 5, quality: "maj", name: "IV", category: "diatonic" },
  { degree: 7, quality: "maj", name: "V", category: "diatonic" },
  { degree: 9, quality: "min", name: "vi", category: "diatonic" },
  { degree: 11, quality: "dim", name: "vii°", category: "diatonic" },
];

// Get possible diatonic functions for a chord quality
function getDiatonicFunctions(chordQuality: string): string[] {
  return DIATONIC_CHORDS
    .filter(c => c.quality === chordQuality)
    .map(c => c.name);
}

// Level 3: Modal interchange (borrowed from parallel minor/modes)
const MODAL_INTERCHANGE_CHORDS: HarmonicChord[] = [
  { degree: 10, quality: "maj", name: "♭VII", category: "modal" },     // From Mixolydian
  { degree: 5, quality: "min", name: "iv", category: "modal" },        // From minor
  { degree: 8, quality: "maj", name: "♭VI", category: "modal" },       // From minor
  { degree: 3, quality: "maj", name: "♭III", category: "modal" },      // From minor
  { degree: 0, quality: "min", name: "i", category: "modal" },         // Parallel minor
  { degree: 1, quality: "maj", name: "♭II (N)", category: "modal" },   // Neapolitan
];

// Level 4: Secondary dominants and applied chords
const SECONDARY_CHORDS: HarmonicChord[] = [
  { degree: 2, quality: "maj", name: "V/V", category: "secondary" },   // Secondary dom to V
  { degree: 9, quality: "maj", name: "V/ii", category: "secondary" },  // Secondary dom to ii
  { degree: 4, quality: "maj", name: "V/vi", category: "secondary" },  // Secondary dom to vi
  { degree: 11, quality: "maj", name: "V/iii", category: "secondary" },// Secondary dom to iii
  { degree: 0, quality: "7", name: "V7/IV", category: "secondary" },   // Secondary dom to IV
  { degree: 7, quality: "7", name: "V7", category: "secondary" },      // Dominant 7th
  { degree: 2, quality: "7", name: "V7/V", category: "secondary" },    // Secondary V7 to V
];

// Level 5: Chromatic/atonal relationships
const CHROMATIC_CHORDS: HarmonicChord[] = [
  { degree: 6, quality: "maj", name: "♭V (TT)", category: "chromatic" },  // Tritone sub
  { degree: 1, quality: "maj", name: "♭II", category: "chromatic" },      // Half step up
  { degree: 3, quality: "min", name: "♭iii", category: "chromatic" },     // Chromatic mediant
  { degree: 8, quality: "min", name: "♭vi", category: "chromatic" },      // Chromatic mediant
  { degree: 4, quality: "maj", name: "III", category: "chromatic" },      // Major III
  { degree: 9, quality: "maj", name: "VI", category: "chromatic" },       // Major VI
  { degree: 6, quality: "min", name: "♯iv", category: "chromatic" },      // Chromatic
  { degree: 1, quality: "min", name: "♭ii", category: "chromatic" },      // Chromatic
];

function getChordsForDifficulty(difficulty: DifficultyLevel): HarmonicChord[] {
  switch (difficulty) {
    case 1:
      // Just primary triads: I, IV, V, vi
      return DIATONIC_CHORDS.filter(c => [0, 5, 7, 9].includes(c.degree));
    case 2:
      // All diatonic
      return DIATONIC_CHORDS;
    case 3:
      // Diatonic + modal interchange
      return [...DIATONIC_CHORDS, ...MODAL_INTERCHANGE_CHORDS];
    case 4:
      // Add secondary dominants
      return [...DIATONIC_CHORDS, ...MODAL_INTERCHANGE_CHORDS, ...SECONDARY_CHORDS];
    case 5:
      // Everything including chromatic
      return [...DIATONIC_CHORDS, ...MODAL_INTERCHANGE_CHORDS, ...SECONDARY_CHORDS, ...CHROMATIC_CHORDS];
  }
}

function getChordTypesForDifficulty(difficulty: DifficultyLevel): ChordType[] {
  switch (difficulty) {
    case 1:
      return CHORD_TYPES.filter((c) => ["maj", "min"].includes(c.shortName));
    case 2:
      return CHORD_TYPES.filter((c) => ["maj", "min", "dim"].includes(c.shortName));
    case 3:
      return CHORD_TYPES.filter((c) => ["maj", "min", "dim", "aug"].includes(c.shortName));
    case 4:
    case 5:
      return CHORD_TYPES;
  }
}

interface ChordExerciseProps {
  activeNotes: Set<number>;
  lastChord: number[];
  onClearChord: () => void;
  lastCC?: MidiCC | null;
  onClearCC?: () => void;
}

type ExerciseState = "waiting" | "listening" | "correct" | "incorrect";
type AnswerMode = "keyboard" | "buttons";

interface PreviousChordInfo {
  chord: ChordQuestion;
  rootName: string;
  harmonicName?: string;
}

interface KeyContext {
  keyRoot: number;
  keyName: string;
}

function getRootMovement(prevRoot: number, currentRoot: number): number {
  return ((currentRoot % 12) - (prevRoot % 12) + 12) % 12;
}

export function ChordExercise({
  activeNotes,
  lastChord,
  onClearChord,
  lastCC,
  onClearCC,
}: ChordExerciseProps) {
  const [question, setQuestion] = useState<ChordQuestion | null>(null);
  const [state, setState] = useState<ExerciseState>("waiting");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(1);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [recentStreak, setRecentStreak] = useState({ correct: 0, total: 0 });
  const [answerMode, setAnswerMode] = useState<AnswerMode>("buttons");
  const [selectedChord, setSelectedChord] = useState<string | null>(null);
  const [progressionMode, setProgressionMode] = useState(false);
  const [guessRootMovement, setGuessRootMovement] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<number | null>(null);
  const [previousChordInfo, setPreviousChordInfo] = useState<PreviousChordInfo | null>(null);
  const previousChordRef = useRef<PreviousChordInfo | null>(null);
  const [keyContext, setKeyContext] = useState<KeyContext | null>(null);
  const keyContextRef = useRef<KeyContext | null>(null);
  const [currentHarmonicName, setCurrentHarmonicName] = useState<string>("");
  const hasInteractedRef = useRef(false); // Track if user has interacted (for auto-play)
  const hasCheckedRef = useRef(false);
  const hasCheckedMovementRef = useRef(false);

  // Click-to-select chord building (on-screen / computer keyboard)
  const [selectedNotes, setSelectedNotes] = useState<Set<number>>(new Set());

  // Answer state for two-part answering
  const [chordAnswered, setChordAnswered] = useState(false);
  const [movementAnswered, setMovementAnswered] = useState(false);
  const [chordCorrect, setChordCorrect] = useState(false);
  const [movementCorrect, setMovementCorrect] = useState(false);

  // Load difficulty on mount
  useEffect(() => {
    setDifficulty(getCurrentDifficulty("chord"));
    setRecentStreak(getRecentStreak("chord"));
  }, []);

  // Note: Key context is now initialized in the progressionMode toggle effect above

  const generateNewQuestion = useCallback(() => {
    let rootNote: number;
    let chordType: ChordType;
    let harmonicName = "";

    if (progressionMode && keyContextRef.current) {
      // Use harmonic progression system
      const availableChords = getChordsForDifficulty(difficulty);
      const randomHarmonicChord = availableChords[Math.floor(Math.random() * availableChords.length)];
      
      // Calculate root note based on key and degree
      rootNote = keyContextRef.current.keyRoot + randomHarmonicChord.degree;
      
      // Keep in range
      while (rootNote < ROOT_NOTE_MIN) rootNote += 12;
      while (rootNote > ROOT_NOTE_MAX) rootNote -= 12;
      
      // Get the chord type
      const matchingType = CHORD_TYPES.find(c => c.shortName === randomHarmonicChord.quality);
      chordType = matchingType || CHORD_TYPES[0];
      harmonicName = randomHarmonicChord.name;
    } else {
      // Random mode (non-progression)
      const availableTypes = getChordTypesForDifficulty(difficulty);
      chordType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
      rootNote = ROOT_NOTE_MIN + Math.floor(Math.random() * (ROOT_NOTE_MAX - ROOT_NOTE_MIN + 1));
    }

    const notes = chordType.intervals.map((i) => rootNote + i);
    
    const newQuestion: ChordQuestion = {
      type: "chord",
      rootNote,
      chordType,
      notes,
    };
    
    console.log("Generated new question:", newQuestion);
    setQuestion(newQuestion);
    setCurrentHarmonicName(harmonicName);
    setState("waiting");
    setShowAnswer(false);
    setSelectedChord(null);
    setSelectedMovement(null);
    setChordAnswered(false);
    setMovementAnswered(false);
    setChordCorrect(false);
    setMovementCorrect(false);
    setSelectedNotes(new Set());
    hasCheckedRef.current = false;
    hasCheckedMovementRef.current = false;
    onClearChord();
  }, [difficulty, onClearChord, progressionMode]);

  const handleNext = useCallback(() => {
    // Store current chord as previous for next round
    if (progressionMode && question) {
      const info: PreviousChordInfo = {
        chord: question,
        rootName: NOTE_NAMES[question.rootNote % 12],
        harmonicName: currentHarmonicName,
      };
      previousChordRef.current = info;
      setPreviousChordInfo(info);
    }
    generateNewQuestion();
  }, [generateNewQuestion, progressionMode, question, currentHarmonicName]);

  const playQuestion = useCallback(() => {
    hasInteractedRef.current = true;

    if (!question?.notes?.length) return;

    const audio = getAudioEngine();

    // init() is synchronous — creates the AudioContext and triggers resume()
    // within the current user-gesture window. scheduleChord / scheduleChordProgression
    // are also synchronous, so all scheduling happens before the gesture window closes.
    // A 200 ms lookahead in those methods gives the context time to start running.
    audio.init();

    const prevInfo = previousChordRef.current;

    if (progressionMode && prevInfo?.chord?.notes?.length) {
      audio.scheduleChordProgression(prevInfo.chord.notes, question.notes, 1.3, 1.0, 1.5);
      if (state === "waiting") {
        setTimeout(() => setState("listening"), 1300);
      }
    } else {
      audio.scheduleChord(question.notes, 1.5);
      if (state === "waiting") {
        setState("listening");
      }
    }
  }, [question, progressionMode, state]);

  // Auto-play when a new question is ready (only after user has interacted)
  const questionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!question) return;
    if (!hasInteractedRef.current) return; // Don't auto-play until user interaction
    
    const questionId = `${question.rootNote}-${question.chordType.shortName}-${Date.now()}`;
    if (questionId !== questionIdRef.current && state === "waiting") {
      questionIdRef.current = questionId;
      const timer = setTimeout(() => {
        playQuestion();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [question, state, playQuestion]);

  // Check if both parts are answered (when guessing root movement)
  useEffect(() => {
    if (!progressionMode || !guessRootMovement || !previousChordRef.current) return;
    
    if (chordAnswered && movementAnswered && !hasCheckedRef.current) {
      hasCheckedRef.current = true;
      const audio = getAudioEngine();
      const bothCorrect = chordCorrect && movementCorrect;
      
      if (bothCorrect) {
        setState("correct");
        audio.playCorrect();
        setStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      } else {
        setState("incorrect");
        audio.playIncorrect();
        setStats((prev) => ({ ...prev, total: prev.total + 1 }));
      }
      
      const progress = recordAttempt("chord", difficulty, bothCorrect);
      setDifficulty(progress.currentDifficulty.chord);
      setRecentStreak(getRecentStreak("chord"));
    }
  }, [chordAnswered, movementAnswered, chordCorrect, movementCorrect, progressionMode, guessRootMovement, difficulty]);

  const processChordAnswer = useCallback((isCorrect: boolean, selectedType: string) => {
    setSelectedChord(selectedType);
    setChordAnswered(true);
    setChordCorrect(isCorrect);
    
    // If not in root movement mode, finalize immediately
    if (!progressionMode || !guessRootMovement || !previousChordRef.current) {
      hasCheckedRef.current = true;
      const audio = getAudioEngine();

      if (isCorrect) {
        setState("correct");
        audio.playCorrect();
        setStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
      } else {
        setState("incorrect");
        audio.playIncorrect();
        setStats((prev) => ({ ...prev, total: prev.total + 1 }));
      }

      const progress = recordAttempt("chord", difficulty, isCorrect);
      setDifficulty(progress.currentDifficulty.chord);
      setRecentStreak(getRecentStreak("chord"));
    }
  }, [difficulty, progressionMode, guessRootMovement]);

  const processMovementAnswer = useCallback((selectedSemitones: number) => {
    if (!question || !previousChordRef.current) return;
    
    const actualMovement = getRootMovement(previousChordRef.current.chord.rootNote, question.rootNote);
    
    // For symmetrical chords, accept enharmonically equivalent movements
    let isCorrect = selectedSemitones === actualMovement;
    
    if (question.chordType.shortName === "dim") {
      // Diminished chords repeat every minor 3rd (3 semitones)
      // Movements 0, 3, 6, 9 are all equivalent for dim chords
      const selectedMod3 = selectedSemitones % 3;
      const actualMod3 = actualMovement % 3;
      isCorrect = selectedMod3 === actualMod3;
    } else if (question.chordType.shortName === "aug") {
      // Augmented chords repeat every major 3rd (4 semitones)
      // Movements 0, 4, 8 are all equivalent for aug chords
      const selectedMod4 = selectedSemitones % 4;
      const actualMod4 = actualMovement % 4;
      isCorrect = selectedMod4 === actualMod4;
    }
    
    setSelectedMovement(selectedSemitones);
    setMovementAnswered(true);
    setMovementCorrect(isCorrect);
  }, [question]);

  // Handle button click answer
  const handleChordClick = useCallback((chordType: ChordType) => {
    if (state !== "listening" || !question || chordAnswered) return;
    
    const isCorrect = chordType.shortName === question.chordType.shortName;
    processChordAnswer(isCorrect, chordType.shortName);
  }, [state, question, chordAnswered, processChordAnswer]);

  const handleMovementClick = useCallback((movement: typeof ROOT_MOVEMENTS[0]) => {
    if (state !== "listening" || !question || movementAnswered) return;
    processMovementAnswer(movement.semitones);
  }, [state, question, movementAnswered, processMovementAnswer]);

  // Check answer when chord is played via MIDI/keyboard
  useEffect(() => {
    if (state !== "listening" || !question || hasCheckedRef.current || answerMode !== "keyboard") {
      return;
    }

    if (lastChord.length >= 3) {
      const isCorrect = checkChordAnswer(question, lastChord);
      processChordAnswer(isCorrect, isCorrect ? question.chordType.shortName : "played");
    }
  }, [lastChord, question, state, answerMode, processChordAnswer]);

  // MIDI CC 51 value 0 (Chan 1 Control/Mode Change) → advance to next question
  useEffect(() => {
    if (!lastCC) return;
    if (lastCC.controller === 51 && lastCC.value === 0) {
      onClearCC?.();
      if (state === "correct" || state === "incorrect") {
        handleNext();
      }
    }
  }, [lastCC, state, handleNext, onClearCC]);

  // Start with a question
  useEffect(() => {
    if (!question) {
      generateNewQuestion();
    }
  }, [question, generateNewQuestion]);

  // Reset when toggling progression mode
  useEffect(() => {
    previousChordRef.current = null;
    setPreviousChordInfo(null);

    if (progressionMode) {
      // Create new key context immediately
      const keyRoot = ROOT_NOTE_MIN + Math.floor(Math.random() * 12);
      const newContext = { keyRoot, keyName: NOTE_NAMES[keyRoot % 12] };
      setKeyContext(newContext);
      keyContextRef.current = newContext;
    } else {
      setKeyContext(null);
      keyContextRef.current = null;
    }

    // Reset question AFTER setting up key context
    setQuestion(null);
  }, [progressionMode]);

  // New key function
  const generateNewKey = useCallback(() => {
    const keyRoot = ROOT_NOTE_MIN + Math.floor(Math.random() * 12);
    const newContext = { keyRoot, keyName: NOTE_NAMES[keyRoot % 12] };
    setKeyContext(newContext);
    keyContextRef.current = newContext;
    previousChordRef.current = null;
    setPreviousChordInfo(null);
    setQuestion(null);
  }, []);

  const handleKeyboardNoteOn = useCallback((note: number) => {
    const audio = getAudioEngine();
    audio.startNote(note);
    // Toggle this note into the click-to-select chord builder
    if (answerMode === "keyboard" && state === "listening" && !hasCheckedRef.current) {
      setSelectedNotes(prev => {
        const next = new Set(prev);
        next.has(note) ? next.delete(note) : next.add(note);
        return next;
      });
    }
  }, [answerMode, state]);

  const handleKeyboardNoteOff = useCallback((note: number) => {
    const audio = getAudioEngine();
    audio.stopNote(note);
  }, []);

  const submitSelectedNotes = useCallback(() => {
    if (selectedNotes.size < 2 || !question || hasCheckedRef.current) return;
    const notesArray = Array.from(selectedNotes);
    const isCorrect = checkChordAnswer(question, notesArray);
    processChordAnswer(isCorrect, isCorrect ? question.chordType.shortName : "played");
    setSelectedNotes(new Set());
  }, [selectedNotes, question, processChordAnswer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && (state === "correct" || state === "incorrect")) {
        e.preventDefault();
        handleNext();
      }
      if (e.key === " " && (state === "waiting" || state === "listening")) {
        e.preventDefault();
        playQuestion();
      }
      // Submit selected notes when Enter is pressed in keyboard answer mode
      if (e.key === "Enter" && state === "listening" && answerMode === "keyboard" && selectedNotes.size >= 2) {
        e.preventDefault();
        submitSelectedNotes();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, answerMode, selectedNotes, handleNext, playQuestion, submitSelectedNotes]);

  const getStateColor = () => {
    switch (state) {
      case "correct":
        return "from-emerald-500/20 to-emerald-600/5";
      case "incorrect":
        return "from-rose-500/20 to-rose-600/5";
      default:
        return "from-violet-500/10 to-purple-500/5";
    }
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const availableChords = getChordTypesForDifficulty(difficulty);
  
  const rootNoteName = question ? NOTE_NAMES[question.rootNote % 12] : "";
  const chordNotesDisplay = question 
    ? question.notes.map(n => midiToNoteName(n)).join(" - ")
    : "";

  // Calculate actual root movement
  const actualMovement = question && previousChordRef.current
    ? getRootMovement(previousChordRef.current.chord.rootNote, question.rootNote)
    : null;
  const actualMovementInfo = actualMovement !== null
    ? ROOT_MOVEMENTS.find(m => m.semitones === actualMovement)
    : null;

  // Calculate equivalent movements for symmetrical chords
  const getEquivalentMovements = (): string | null => {
    if (!question || actualMovement === null) return null;
    
    if (question.chordType.shortName === "dim") {
      // Dim chords: 0≡3≡6≡9, 1≡4≡7≡10, 2≡5≡8≡11
      const equivalents = ROOT_MOVEMENTS.filter(m => m.semitones % 3 === actualMovement % 3 && m.semitones !== actualMovement);
      if (equivalents.length > 0) {
        return `(Also equivalent: ${equivalents.map(e => e.short).join(", ")})`;
      }
    } else if (question.chordType.shortName === "aug") {
      // Aug chords: 0≡4≡8, 1≡5≡9, 2≡6≡10, 3≡7≡11
      const equivalents = ROOT_MOVEMENTS.filter(m => m.semitones % 4 === actualMovement % 4 && m.semitones !== actualMovement);
      if (equivalents.length > 0) {
        return `(Also equivalent: ${equivalents.map(e => e.short).join(", ")})`;
      }
    }
    return null;
  };
  const equivalentMovementsText = getEquivalentMovements();

  // Determine if we need two-part answer
  const needsMovementAnswer = progressionMode && guessRootMovement && previousChordRef.current !== null;
  const waitingForMoreAnswers = needsMovementAnswer && state === "listening" && (!chordAnswered || !movementAnswered);

  return (
    <div className="flex flex-col gap-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-zinc-800">Chord Recognition</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-violet-100 text-violet-800 text-sm font-medium rounded-full">
              Level {difficulty}
            </span>
            {/* Progress toward next level */}
            <div className="flex gap-0.5" title={`${recentStreak.correct}/5 correct → level up at 4/5`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`w-2 h-4 rounded-sm transition-colors ${
                    i < recentStreak.correct
                      ? "bg-emerald-500"
                      : i < recentStreak.total
                        ? "bg-rose-400"
                        : "bg-zinc-200"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-500">
            {stats.correct}/{stats.total} ({accuracy}%)
          </span>
          {/* Answer mode toggle */}
          <div className="flex bg-zinc-100 rounded-lg p-1">
            <button
              onClick={() => setAnswerMode("buttons")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                answerMode === "buttons" 
                  ? "bg-white text-zinc-800 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Buttons
            </button>
            <button
              onClick={() => setAnswerMode("keyboard")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                answerMode === "keyboard" 
                  ? "bg-white text-zinc-800 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Keyboard
            </button>
          </div>
        </div>
      </div>

      {/* Mode toggles */}
      <div className="space-y-3">
        {/* Progression mode toggle */}
        <div className="flex items-center justify-between bg-violet-50 rounded-xl p-4">
          <div>
            <span className="font-medium text-zinc-700">Progression mode</span>
            <p className="text-xs text-zinc-500">
              Hear previous chord for context
            </p>
          </div>
          <button
            onClick={() => setProgressionMode(!progressionMode)}
            className={`
              relative w-12 h-7 rounded-full transition-colors duration-200
              ${progressionMode ? "bg-violet-500" : "bg-zinc-300"}
            `}
          >
            <span
              className={`
                absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm
                transition-transform duration-200
                ${progressionMode ? "left-6" : "left-1"}
              `}
            />
          </button>
        </div>

        {/* Root movement guessing toggle (only visible in progression mode) */}
        {progressionMode && (
          <div className="flex items-center justify-between bg-purple-50 rounded-xl p-4">
            <div>
              <span className="font-medium text-zinc-700">Guess root movement</span>
              <p className="text-xs text-zinc-500">
                Also identify the interval between chord roots
              </p>
            </div>
            <button
              onClick={() => setGuessRootMovement(!guessRootMovement)}
              className={`
                relative w-12 h-7 rounded-full transition-colors duration-200
                ${guessRootMovement ? "bg-purple-500" : "bg-zinc-300"}
              `}
            >
              <span
                className={`
                  absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm
                  transition-transform duration-200
                  ${guessRootMovement ? "left-6" : "left-1"}
                `}
              />
            </button>
          </div>
        )}
      </div>

      {/* Key and chord context display */}
      {progressionMode && keyContext && (
        <div className="bg-gradient-to-r from-violet-100 to-purple-100 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-6">
              {/* Key display */}
              <div>
                <span className="text-xs text-violet-600 uppercase tracking-wide">Key</span>
                <p className="text-xl font-bold text-violet-800">{keyContext.keyName} Major</p>
              </div>
              
              {/* Previous chord */}
              {previousChordInfo && (
                <>
                  <div className="h-10 w-px bg-violet-300" />
                  <div>
                    <span className="text-xs text-violet-600 uppercase tracking-wide">Previous</span>
                    <p className="text-lg font-bold text-violet-700">
                      {previousChordInfo.harmonicName && (
                        <span className="text-violet-500 mr-1">{previousChordInfo.harmonicName}</span>
                      )}
                      <span className="text-sm font-normal text-violet-600">
                        ({previousChordInfo.rootName} {previousChordInfo.chord.chordType.name})
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>
            
            <button
              onClick={generateNewKey}
              className="px-3 py-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 
                         bg-white rounded-lg hover:bg-violet-50 transition-colors"
            >
              New key
            </button>
          </div>
          
          {/* Difficulty description */}
          <div className="mt-3 pt-3 border-t border-violet-200">
            <p className="text-xs text-violet-500">
              {difficulty === 1 && "Primary chords: I, IV, V, vi"}
              {difficulty === 2 && "All diatonic: I, ii, iii, IV, V, vi, vii°"}
              {difficulty === 3 && "Modal interchange: ♭VII, iv, ♭VI, ♭III..."}
              {difficulty === 4 && "Secondary dominants: V/V, V/ii, V7..."}
              {difficulty === 5 && "Chromatic relations: tritone subs, chromatic mediants..."}
            </p>
          </div>
        </div>
      )}

      {/* Main exercise area */}
      <div
        className={`
          relative rounded-2xl p-8 transition-all duration-500
          bg-gradient-to-br ${getStateColor()}
          border border-zinc-200
        `}
      >
        {/* Root note display */}
        {question && (state === "correct" || state === "incorrect" || showAnswer) && (
          <div className="absolute top-4 left-4 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 uppercase tracking-wide">Root:</span>
              <span className="px-2 py-1 bg-white/80 rounded-md text-sm font-mono font-bold text-zinc-700 shadow-sm">
                {rootNoteName}
              </span>
            </div>
          </div>
        )}

        {/* Question display */}
        <div className="text-center mb-8 pt-2">
          {state === "waiting" && (
            <p className="text-zinc-600 text-lg">
              {progressionMode && previousChordInfo 
                ? "Press play to hear both chords"
                : "Press play to hear the chord"
              }
            </p>
          )}
          {state === "listening" && (
            <div className="space-y-2">
              <p className="text-violet-700 text-lg font-medium animate-pulse">
                {needsMovementAnswer
                  ? `Identify the chord ${chordAnswered ? "✓" : ""} and root movement ${movementAnswered ? "✓" : ""}`
                  : answerMode === "buttons" 
                    ? "What type of chord is this?" 
                    : "Play the chord on your keyboard..."
                }
              </p>
              {progressionMode && previousChordInfo && (
                <p className="text-sm text-violet-500">
                  Previous: {previousChordInfo.rootName} {previousChordInfo.chord.chordType.name}
                </p>
              )}
            </div>
          )}
          {state === "correct" && (
            <div className="space-y-3 animate-celebrate">
              <p className="text-emerald-700 text-2xl font-bold">✓ Correct!</p>
              
              {/* Roman numeral - prominent display (progression mode) */}
              {progressionMode && currentHarmonicName && (
                <div className="flex justify-center">
                  <span className="px-4 py-2 bg-violet-100 text-violet-800 text-2xl font-bold rounded-xl border-2 border-violet-300">
                    {currentHarmonicName}
                  </span>
                </div>
              )}
              
              {/* Diatonic possibilities (non-progression mode) */}
              {!progressionMode && question && (
                <div className="flex justify-center">
                  <div className="px-4 py-2 bg-violet-50 text-violet-700 rounded-xl border border-violet-200">
                    <span className="text-xs text-violet-500 block">Diatonic functions:</span>
                    <span className="text-lg font-bold">
                      {getDiatonicFunctions(question.chordType.shortName).join(", ") || "—"}
                    </span>
                  </div>
                </div>
              )}
              
              <p className="text-emerald-600 text-lg">
                {rootNoteName} {question?.chordType.name}
              </p>
              
              {/* Root movement with Roman numerals */}
              {needsMovementAnswer && actualMovementInfo && previousChordInfo && (
                <div className="bg-purple-50 rounded-lg p-3 inline-block">
                  <p className="text-purple-700 font-medium">
                    <span className="text-lg">{previousChordInfo.harmonicName || "?"}</span>
                    <span className="mx-2 text-purple-400">→</span>
                    <span className="text-lg">{currentHarmonicName || "?"}</span>
                  </p>
                  <p className="text-purple-500 text-sm">{actualMovementInfo.name}</p>
                  {equivalentMovementsText && (
                    <p className="text-purple-400 text-xs mt-1">{equivalentMovementsText}</p>
                  )}
                </div>
              )}
              
              <p className="text-sm text-zinc-500">{chordNotesDisplay}</p>
            </div>
          )}
          {state === "incorrect" && (
            <div className="space-y-3">
              <p className="text-rose-700 text-2xl font-bold">✗ Not quite</p>
              
              {/* Roman numeral - prominent display (progression mode) */}
              {progressionMode && currentHarmonicName && (
                <div className="flex justify-center">
                  <span className="px-4 py-2 bg-violet-100 text-violet-800 text-2xl font-bold rounded-xl border-2 border-violet-300">
                    {currentHarmonicName}
                  </span>
                </div>
              )}
              
              {/* Diatonic possibilities (non-progression mode) */}
              {!progressionMode && question && (
                <div className="flex justify-center">
                  <div className="px-4 py-2 bg-violet-50 text-violet-700 rounded-xl border border-violet-200">
                    <span className="text-xs text-violet-500 block">Diatonic functions:</span>
                    <span className="text-lg font-bold">
                      {getDiatonicFunctions(question.chordType.shortName).join(", ") || "—"}
                    </span>
                  </div>
                </div>
              )}
              
              <p className="text-rose-600 text-lg">
                {rootNoteName} {question?.chordType.name}
              </p>
              
              {/* Root movement with Roman numerals */}
              {needsMovementAnswer && actualMovementInfo && previousChordInfo && (
                <div className="bg-purple-50 rounded-lg p-3 inline-block">
                  <p className="text-purple-700 font-medium">
                    <span className="text-lg">{previousChordInfo.harmonicName || "?"}</span>
                    <span className="mx-2 text-purple-400">→</span>
                    <span className="text-lg">{currentHarmonicName || "?"}</span>
                  </p>
                  <p className="text-purple-500 text-sm">{actualMovementInfo.name}</p>
                  {equivalentMovementsText && (
                    <p className="text-purple-400 text-xs mt-1">{equivalentMovementsText}</p>
                  )}
                </div>
              )}
              
              <p className="text-sm text-zinc-500">{chordNotesDisplay}</p>
              
              {needsMovementAnswer && (
                <div className="mt-2 text-sm">
                  <span className={chordCorrect ? "text-emerald-600" : "text-rose-600"}>
                    Chord: {chordCorrect ? "✓" : "✗"}
                  </span>
                  <span className="mx-2">•</span>
                  <span className={movementCorrect ? "text-emerald-600" : "text-rose-600"}>
                    Movement: {movementCorrect ? "✓" : "✗"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={playQuestion}
            disabled={!question}
            className={`
              px-8 py-4 rounded-xl font-bold text-lg
              transition-all duration-200 transform
              ${state === "waiting" || state === "listening"
                ? "bg-violet-500 text-white hover:bg-violet-600 hover:scale-105 active:scale-95 shadow-lg shadow-violet-500/30"
                : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
              }
            `}
          >
            {state === "waiting" ? "▶ Play" : state === "listening" ? "▶ Replay" : "▶ Hear Again"}
          </button>

          {(state === "correct" || state === "incorrect") && (
            <button
              onClick={handleNext}
              className="px-8 py-4 rounded-xl font-bold text-lg bg-zinc-800 text-white
                         hover:bg-zinc-700 transition-all duration-200 transform hover:scale-105 active:scale-95"
            >
              Next →
            </button>
          )}
        </div>

        {/* Chord type buttons */}
        {answerMode === "buttons" && state === "listening" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-zinc-600 mb-2">
                Chord type {chordAnswered && <span className="text-emerald-500">✓</span>}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {availableChords.map((chord) => (
                  <button
                    key={chord.shortName}
                    onClick={() => handleChordClick(chord)}
                    disabled={chordAnswered}
                    className={`
                      px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200
                      ${chordAnswered && selectedChord === chord.shortName
                        ? chordCorrect
                          ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-400"
                          : "bg-rose-100 text-rose-800 border-2 border-rose-400"
                        : chordAnswered
                          ? "bg-zinc-50 text-zinc-400 border border-zinc-100"
                          : "bg-white hover:bg-violet-50 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg border border-zinc-200 cursor-pointer"
                      }
                    `}
                  >
                    <span className="block font-bold text-inherit">{chord.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Root movement buttons (when enabled) */}
            {needsMovementAnswer && (
              <div>
                <p className="text-sm font-medium text-purple-600 mb-2">
                  Root movement {movementAnswered && <span className="text-emerald-500">✓</span>}
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {ROOT_MOVEMENTS.map((movement) => (
                    <button
                      key={movement.semitones}
                      onClick={() => handleMovementClick(movement)}
                      disabled={movementAnswered}
                      className={`
                        px-2 py-2 rounded-lg text-xs font-medium transition-all duration-200
                        ${movementAnswered && selectedMovement === movement.semitones
                          ? movementCorrect
                            ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-400"
                            : "bg-rose-100 text-rose-800 border-2 border-rose-400"
                          : movementAnswered && movement.semitones === actualMovement
                            ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-400"
                            : movementAnswered
                              ? "bg-zinc-50 text-zinc-400 border border-zinc-100"
                              : "bg-white hover:bg-purple-50 hover:scale-105 active:scale-95 shadow border border-zinc-200 cursor-pointer"
                        }
                      `}
                    >
                      <span className="block font-bold text-[11px]">{movement.upDown}</span>
                      <span className="block text-[9px] opacity-70 truncate">{movement.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Show answer after answering */}
        {answerMode === "buttons" && (state === "correct" || state === "incorrect") && !needsMovementAnswer && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {availableChords.map((chord) => {
              const isCorrectAnswer = question && chord.shortName === question.chordType.shortName;
              const isSelected = selectedChord === chord.shortName;
              const showAsCorrect = isCorrectAnswer;
              const showAsWrong = isSelected && !isCorrectAnswer;
              
              return (
                <div
                  key={chord.shortName}
                  className={`
                    px-3 py-3 rounded-xl text-sm font-medium
                    ${showAsCorrect
                      ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-400"
                      : showAsWrong
                        ? "bg-rose-100 text-rose-800 border-2 border-rose-400"
                        : "bg-zinc-50 text-zinc-400 border border-zinc-100"
                    }
                  `}
                >
                  <span className="block font-bold">{chord.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Piano keyboard */}
      <div className={`bg-zinc-50 rounded-xl p-4 ${answerMode === "buttons" && state === "listening" ? "opacity-50" : ""}`}>
        <PianoKeyboard
          startNote={PIANO_START}
          endNote={PIANO_END}
          activeNotes={activeNotes}
          selectedNotes={Array.from(selectedNotes)}
          highlightedNotes={
            (state === "correct" || state === "incorrect") && question
              ? question.notes
              : []
          }
          onNoteOn={handleKeyboardNoteOn}
          onNoteOff={handleKeyboardNoteOff}
          disabled={state !== "listening" || answerMode === "buttons"}
        />

        {/* Click-to-select chord builder UI */}
        {answerMode === "keyboard" && state === "listening" && (
          <div className="mt-3 flex flex-col items-center gap-2">
            {selectedNotes.size > 0 ? (
              <>
                <div className="flex gap-1 flex-wrap justify-center">
                  {Array.from(selectedNotes).sort((a, b) => a - b).map(n => (
                    <span
                      key={n}
                      className="px-2 py-1 bg-violet-100 text-violet-800 text-sm font-mono rounded-md
                                 cursor-pointer hover:bg-violet-200 transition-colors select-none"
                      onClick={() => setSelectedNotes(prev => {
                        const next = new Set(prev);
                        next.delete(n);
                        return next;
                      })}
                    >
                      {NOTE_NAMES[n % 12]} ×
                    </span>
                  ))}
                </div>
                {selectedNotes.size >= 2 && (
                  <button
                    onClick={submitSelectedNotes}
                    className="px-5 py-2 bg-violet-500 text-white rounded-xl font-medium
                               hover:bg-violet-600 active:scale-95 transition-all"
                  >
                    Check ({selectedNotes.size} notes) · Enter ↵
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-zinc-400">
                Click notes to build your chord, then press Enter or Check — or play simultaneously on MIDI
              </p>
            )}
          </div>
        )}

        {answerMode !== "keyboard" && (
          <p className="text-center text-xs text-zinc-400 mt-2">
            Switch to keyboard mode to play chords
          </p>
        )}
      </div>

      {/* Chord reference (collapsible) */}
      <details className="bg-zinc-50 rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-800">
          Chord reference
        </summary>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CHORD_TYPES.map((chord) => (
            <div
              key={chord.shortName}
              className="px-3 py-2 bg-white rounded-lg text-sm flex justify-between items-center"
            >
              <span className="font-medium text-zinc-700">{chord.name}</span>
              <span className="font-mono text-zinc-400">
                {chord.intervals.join("-")}
              </span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
