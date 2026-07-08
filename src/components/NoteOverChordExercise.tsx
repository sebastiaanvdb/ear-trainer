"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAudioEngine } from "@/lib/audio";
import { CHORD_TYPES, ChordType, DifficultyLevel } from "@/lib/exercises";
import { MidiCC } from "@/hooks/useMidi";
import {
  recordAttempt,
  getCurrentDifficulty,
  getRecentStreak,
  getDegreeProgress,
  saveDegreeProgress,
  recordDegreeAttemptStorage,
} from "@/lib/storage";
import {
  DegreeProgress,
  DEGREES,
  degreeLabel,
  getAvailableDegrees,
  getChordsForDifficulty,
  selectNextDegree,
  getActiveDegreeList,
  getDegreeRecentAccuracy,
} from "@/lib/degreeIdentificationLearning";

const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const ROOT_NOTE_MIN = 48;
const ROOT_NOTE_MAX = 72;

function noteName(midi: number): string {
  return NOTE_NAMES[midi % 12];
}

function getChordTypesForDifficulty(difficulty: DifficultyLevel): ChordType[] {
  const allowed = getChordsForDifficulty(difficulty);
  return CHORD_TYPES.filter(c => allowed.includes(c.shortName));
}

interface NoteOverChordQuestion {
  rootNote: number;
  chordType: ChordType;
  chordNotes: number[];
  melodyNote: number;
  targetDegree: number; // semitones from root (0–11)
  availableDegrees: number[]; // degrees shown as answer buttons for this question
}

type ExerciseState = "waiting" | "listening" | "correct" | "incorrect";

interface Props {
  activeNotes?: Set<number>;
  lastChord?: number[];
  onClearChord?: () => void;
  lastCC?: MidiCC | null;
  onClearCC?: () => void;
}

export function NoteOverChordExercise({ lastCC, onClearCC }: Props) {
  const [question, setQuestion] = useState<NoteOverChordQuestion | null>(null);
  const [state, setState] = useState<ExerciseState>("waiting");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(1);
  const [degreeProgress, setDegreeProgress] = useState<DegreeProgress>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [newDegreeBanner, setNewDegreeBanner] = useState<string | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [recentStreak, setRecentStreak] = useState({ correct: 0, total: 0 });

  const hasInteractedRef = useRef(false);
  const questionIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDifficulty(getCurrentDifficulty("noteOverChord"));
    setRecentStreak(getRecentStreak("noteOverChord"));
    setDegreeProgress(getDegreeProgress());
  }, []);

  const generateNewQuestion = useCallback(() => {
    // Pick chord first so available degrees can be constrained to chord tones at low difficulty
    const availableChords = getChordTypesForDifficulty(difficulty);
    const chordType = availableChords[Math.floor(Math.random() * availableChords.length)];

    // Difficulty 1-2: only ask about notes actually in the chord (chord tones).
    // Difficulty 3+: add diatonic extensions and alterations progressively.
    const available = difficulty <= 2
      ? chordType.intervals
      : getAvailableDegrees(difficulty);

    const currentProgress = getDegreeProgress();
    const prevActiveCount = getActiveDegreeList(currentProgress).length;

    const progressClone = { ...currentProgress };
    const targetDegree = selectNextDegree(progressClone, available);

    // Detect newly unlocked degrees
    const newActiveCount = getActiveDegreeList(progressClone).length;
    if (newActiveCount > prevActiveCount) {
      const newSemitones = getActiveDegreeList(progressClone).filter(
        s => !getActiveDegreeList(currentProgress).includes(s)
      );
      const labels = newSemitones
        .map(s => DEGREES.find(d => d.semitones === s)?.label ?? "")
        .filter(Boolean)
        .join(", ");
      if (labels) {
        setNewDegreeBanner(labels);
        setTimeout(() => setNewDegreeBanner(null), 4000);
      }
    }

    saveDegreeProgress(progressClone);
    setDegreeProgress(progressClone);
    const rootNote = ROOT_NOTE_MIN + Math.floor(Math.random() * (ROOT_NOTE_MAX - ROOT_NOTE_MIN + 1));
    const chordNotes = chordType.intervals.map(i => rootNote + i);

    // Melody note: rootNote + targetDegree, shifted to be above root if needed
    let melodyNote = rootNote + targetDegree;
    if (melodyNote <= rootNote) melodyNote += 12;
    // Keep in a comfortable range (one octave above root at most)
    while (melodyNote > rootNote + 12) melodyNote -= 12;
    while (melodyNote < rootNote) melodyNote += 12;

    setQuestion({ rootNote, chordType, chordNotes, melodyNote, targetDegree, availableDegrees: available });
    setState("waiting");
    setSelected(null);
  }, [difficulty]);

  const playQuestion = useCallback(async () => {
    if (!question) return;
    hasInteractedRef.current = true;
    const audio = getAudioEngine();
    audio.init();
    await audio.playChordThenNote(question.chordNotes, question.melodyNote, 1.0, 1.2, 1.2, 0.8);
    if (state === "waiting") setState("listening");
  }, [question, state]);

  // Auto-play when new question arrives
  useEffect(() => {
    if (!question || !hasInteractedRef.current) return;
    const id = `${question.rootNote}-${question.chordType.shortName}-${question.targetDegree}-${Date.now()}`;
    if (id !== questionIdRef.current && state === "waiting") {
      questionIdRef.current = id;
      const t = setTimeout(() => playQuestion(), 400);
      return () => clearTimeout(t);
    }
  }, [question, state, playQuestion]);

  // Generate first question
  useEffect(() => {
    if (!question) generateNewQuestion();
  }, [question, generateNewQuestion]);

  const handleAnswer = useCallback((semitones: number) => {
    if (!question || state !== "listening") return;
    const isCorrect = semitones === question.targetDegree;

    setSelected(semitones);
    setState(isCorrect ? "correct" : "incorrect");

    const updated = recordDegreeAttemptStorage(question.targetDegree, isCorrect);
    setDegreeProgress(updated);

    const audio = getAudioEngine();
    if (isCorrect) {
      audio.playCorrect();
      setStats(prev => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    } else {
      audio.playIncorrect();
      setStats(prev => ({ ...prev, total: prev.total + 1 }));
    }

    const progress = recordAttempt("noteOverChord", difficulty, isCorrect);
    setDifficulty(progress.currentDifficulty.noteOverChord);
    setRecentStreak(getRecentStreak("noteOverChord"));
  }, [question, state, difficulty]);

  const handleNext = useCallback(() => {
    getAudioEngine().init();
    generateNewQuestion();
  }, [generateNewQuestion]);

  // MIDI CC 51 advance
  useEffect(() => {
    if (!lastCC) return;
    if (lastCC.controller === 51 && lastCC.value === 0) {
      onClearCC?.();
      if (state === "correct" || state === "incorrect") handleNext();
    }
  }, [lastCC, state, handleNext, onClearCC]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && (state === "correct" || state === "incorrect")) {
        e.preventDefault();
        handleNext();
      }
      if (e.key === " " && (state === "waiting" || state === "listening")) {
        e.preventDefault();
        playQuestion();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, handleNext, playQuestion]);

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const activeDegrees = getActiveDegreeList(degreeProgress);

  // Answer buttons = degrees available for the current question (chord-tone-aware)
  const answerDegrees = DEGREES.filter(d =>
    question ? question.availableDegrees.includes(d.semitones) : activeDegrees.includes(d.semitones)
  );

  const getStateColor = () => {
    switch (state) {
      case "correct": return "from-emerald-500/20 to-emerald-600/5";
      case "incorrect": return "from-rose-500/20 to-rose-600/5";
      default: return "from-blue-500/10 to-indigo-500/5";
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-zinc-800">Note over Chord</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              Level {difficulty}
            </span>
            <div className="flex gap-0.5" title={`${recentStreak.correct}/5 correct → level up at 4/5`}>
              {[0, 1, 2, 3, 4].map(i => (
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
        <span className="text-sm text-zinc-500">
          {stats.correct}/{stats.total} ({accuracy}%)
        </span>
      </div>

      {/* Degree progress bars */}
      {activeDegrees.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-4">
          {newDegreeBanner && (
            <p className="text-xs text-emerald-600 font-medium mb-2">
              ✨ New degree unlocked: {newDegreeBanner}
            </p>
          )}
          <p className="text-[10px] text-blue-400 uppercase tracking-wide mb-2">Degree progress</p>
          <div className="space-y-1.5">
            {activeDegrees.map(s => {
              const stats = degreeProgress[s]!;
              const acc = getDegreeRecentAccuracy(stats);
              const d = DEGREES.find(x => x.semitones === s)!;
              const isNew = stats.attempts < 3;
              const barColor = isNew
                ? "bg-zinc-300"
                : acc >= 0.75 ? "bg-emerald-400"
                : acc >= 0.5  ? "bg-amber-400"
                : "bg-rose-400";
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold text-blue-700 w-10 shrink-0">
                    {d.label}
                    {d.altLabel && <span className="text-blue-400 font-normal">/{d.altLabel}</span>}
                  </span>
                  {isNew ? (
                    <span className="text-[10px] text-zinc-400 italic">new</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className={`w-2 h-3 rounded-sm ${i < Math.round(acc * 8) ? barColor : "bg-zinc-200"}`} />
                        ))}
                      </div>
                      <span className="text-[10px] text-zinc-400 ml-0.5">{Math.round(acc * 100)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main area */}
      <div className={`relative rounded-2xl p-8 transition-all duration-500 bg-gradient-to-br ${getStateColor()} border border-zinc-200`}>

        {/* Chord name — always visible */}
        {question && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Chord:</span>
            <span className="px-2 py-1 bg-white/80 rounded-md text-sm font-mono font-bold text-zinc-700 shadow-sm">
              {noteName(question.rootNote)} {question.chordType.name}
            </span>
          </div>
        )}

        <div className="text-center mb-8 pt-2">
          {state === "waiting" && (
            <p className="text-zinc-600 text-lg">Press play — chord, then a note</p>
          )}
          {state === "listening" && (
            <p className="text-blue-700 text-lg font-medium animate-pulse">
              What degree is the melody note?
            </p>
          )}
          {(state === "correct" || state === "incorrect") && question && (
            <div className="space-y-3">
              <p className={`text-2xl font-bold ${state === "correct" ? "text-emerald-700" : "text-rose-700"}`}>
                {state === "correct" ? "✓ Correct!" : "✗ Not quite"}
              </p>
              <div className="flex flex-col items-center gap-1">
                <div className="px-5 py-3 bg-white/80 rounded-xl border border-blue-200 inline-block text-center">
                  <p className="text-3xl font-bold text-blue-700">
                    {degreeLabel(question.targetDegree, question.chordType.shortName)}
                  </p>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {noteName(question.melodyNote)} over {noteName(question.rootNote)} {question.chordType.name}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {DEGREES.find(d => d.semitones === question.targetDegree)?.description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={playQuestion}
            disabled={!question}
            className={`
              px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 transform
              ${state === "waiting" || state === "listening"
                ? "bg-blue-500 text-white hover:bg-blue-600 hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30"
                : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
              }
            `}
          >
            {state === "waiting" ? "▶ Play" : state === "listening" ? "▶ Replay" : "▶ Hear Again"}
          </button>
          {(state === "correct" || state === "incorrect") && (
            <button
              onClick={handleNext}
              className="px-8 py-4 rounded-xl font-bold text-lg bg-zinc-800 text-white hover:bg-zinc-700 transition-all duration-200 transform hover:scale-105 active:scale-95"
            >
              Next →
            </button>
          )}
        </div>

        {/* Answer buttons */}
        {state === "listening" && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {answerDegrees.map(d => (
              <button
                key={d.semitones}
                onClick={() => handleAnswer(d.semitones)}
                className="px-3 py-3 rounded-xl text-sm font-medium bg-white hover:bg-blue-50 hover:scale-105 active:scale-95 shadow border border-zinc-200 cursor-pointer transition-all duration-200"
              >
                <span className="block font-bold text-blue-700">
                  {question ? degreeLabel(d.semitones, question.chordType.shortName) : d.label}
                </span>
                {d.altLabel && (
                  <span className="block text-[10px] text-zinc-400">{d.altLabel}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Answer reveal */}
        {(state === "correct" || state === "incorrect") && question && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {answerDegrees.map(d => {
              const isTarget = d.semitones === question.targetDegree;
              const isSelected = d.semitones === selected;
              return (
                <div
                  key={d.semitones}
                  className={`px-3 py-3 rounded-xl text-sm font-medium text-center ${
                    isTarget
                      ? "bg-emerald-100 text-emerald-800 border-2 border-emerald-400"
                      : isSelected
                        ? "bg-rose-100 text-rose-800 border-2 border-rose-400"
                        : "bg-zinc-50 text-zinc-400 border border-zinc-100"
                  }`}
                >
                  <span className="block font-bold">
                    {degreeLabel(d.semitones, question.chordType.shortName)}
                  </span>
                  {d.altLabel && <span className="block text-[10px] opacity-60">{d.altLabel}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reference */}
      <details className="bg-zinc-50 rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-800">
          Degree reference
        </summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {DEGREES.map(d => (
            <div key={d.semitones} className="px-3 py-2 bg-white rounded-lg text-sm flex justify-between items-center">
              <span className="font-bold text-blue-700">
                {d.label}{d.altLabel ? ` / ${d.altLabel}` : ""}
              </span>
              <span className="text-zinc-400 text-xs">{d.description}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
