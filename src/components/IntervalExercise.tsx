"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { getAudioEngine } from "@/lib/audio";
import { midiToNoteName } from "@/hooks/useMidi";
import {
  IntervalQuestion,
  generateIntervalQuestion,
  INTERVALS,
  DifficultyLevel,
  Interval,
} from "@/lib/exercises";
import { recordAttempt, getCurrentDifficulty, getRecentStreak } from "@/lib/storage";

// Middle 3 octaves: C3 to C6 (MIDI 48-84)
const PIANO_START = 36; // C2 (show a bit more for context)
const PIANO_END = 96;   // C7 (show a bit more for context)
const ROOT_NOTE_MIN = 48; // C3
const ROOT_NOTE_MAX = 84; // C6
const LOW_THRESHOLD = 54;  // Below this, prefer ascending
const HIGH_THRESHOLD = 78; // Above this, prefer descending

interface IntervalExerciseProps {
  activeNotes: Set<number>;
  lastChord: number[];
  onClearChord: () => void;
}

type ExerciseState = "waiting" | "listening" | "correct" | "incorrect";
type AnswerMode = "keyboard" | "buttons";

function getIntervalsForDifficulty(difficulty: DifficultyLevel): Interval[] {
  switch (difficulty) {
    case 1:
      return INTERVALS.filter((i) => [0, 5, 7, 12].includes(i.semitones));
    case 2:
      return INTERVALS.filter((i) => [0, 3, 4, 5, 7, 8, 9, 12].includes(i.semitones));
    case 3:
      return INTERVALS.filter((i) => [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12].includes(i.semitones));
    case 4:
    case 5:
      return INTERVALS;
  }
}

export function IntervalExercise({
  activeNotes,
  lastChord,
  onClearChord,
}: IntervalExerciseProps) {
  const [question, setQuestion] = useState<IntervalQuestion | null>(null);
  const [state, setState] = useState<ExerciseState>("waiting");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(1);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [recentStreak, setRecentStreak] = useState({ correct: 0, total: 0 });
  const [chainMode, setChainMode] = useState(false);
  const [skipFirstNote, setSkipFirstNote] = useState(false); // Only play target note in chain mode
  const [lastAnswerNote, setLastAnswerNote] = useState<number | null>(null);
  const lastAnswerNoteRef = useRef<number | null>(null); // Ref for immediate access
  const [answerMode, setAnswerMode] = useState<AnswerMode>("keyboard");
  const [selectedInterval, setSelectedInterval] = useState<number | null>(null);
  const hasCheckedRef = useRef(false);
  const hasInteractedRef = useRef(false); // Track if user has interacted (for auto-play)

  // Load difficulty on mount
  useEffect(() => {
    setDifficulty(getCurrentDifficulty("interval"));
    setRecentStreak(getRecentStreak("interval"));
  }, []);

  const generateNewQuestion = useCallback((forceRootNote?: number) => {
    const baseQuestion = generateIntervalQuestion(difficulty);
    const intervalSize = Math.abs(baseQuestion.interval);
    
    // Determine root note
    let rootNote: number;
    if (forceRootNote !== undefined) {
      // Chain mode: use the provided note, clamped to valid range
      rootNote = Math.max(ROOT_NOTE_MIN, Math.min(ROOT_NOTE_MAX, forceRootNote));
    } else {
      // Random root note in our preferred range
      rootNote = ROOT_NOTE_MIN + Math.floor(Math.random() * (ROOT_NOTE_MAX - ROOT_NOTE_MIN + 1));
    }
    
    // Determine direction based on position
    let direction: "ascending" | "descending";
    if (rootNote <= LOW_THRESHOLD) {
      // Near bottom: go up
      direction = "ascending";
    } else if (rootNote >= HIGH_THRESHOLD) {
      // Near top: go down
      direction = "descending";
    } else {
      // In the middle: random
      direction = Math.random() > 0.5 ? "ascending" : "descending";
    }
    
    // Make sure the target note stays in range
    const targetNote = direction === "ascending" 
      ? rootNote + intervalSize 
      : rootNote - intervalSize;
    
    // If target would be out of range, flip direction
    if (targetNote > ROOT_NOTE_MAX) {
      direction = "descending";
    } else if (targetNote < ROOT_NOTE_MIN) {
      direction = "ascending";
    }
    
    const interval = direction === "ascending" ? intervalSize : -intervalSize;
    
    const newQuestion: IntervalQuestion = {
      type: "interval",
      rootNote,
      interval,
      intervalName: baseQuestion.intervalName,
      direction,
    };
    
    setQuestion(newQuestion);
    setState("waiting");
    setShowAnswer(false);
    setSelectedInterval(null);
    hasCheckedRef.current = false;
    onClearChord();
  }, [difficulty, onClearChord]);

  const handleNext = useCallback(() => {
    // Use ref for immediate access to latest value
    if (chainMode && lastAnswerNoteRef.current !== null) {
      generateNewQuestion(lastAnswerNoteRef.current);
    } else {
      generateNewQuestion();
    }
  }, [chainMode, generateNewQuestion]);

  const playQuestion = useCallback(async () => {
    hasInteractedRef.current = true; // Mark that user has interacted
    if (!question) return;
    const audio = getAudioEngine();
    
    audio.init();
    await audio.ready();
    
    // In chain mode with skipFirstNote, only play the target note
    if (chainMode && skipFirstNote && lastAnswerNoteRef.current !== null) {
      // Only play the second note (target)
      const targetNote = question.rootNote + question.interval;
      await audio.playNote(targetNote, 0.9, 0.8);
    } else {
      // Play full interval
      await audio.playInterval(question.rootNote, question.interval, 80);
    }
    
    // Only change to listening if we're in waiting state (not after answering)
    if (state === "waiting") {
      setState("listening");
    }
  }, [question, state, chainMode, skipFirstNote]);

  // Auto-play when a new question is ready (only after user has interacted)
  const questionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!question) return;
    if (!hasInteractedRef.current) return; // Don't auto-play until user interaction
    
    // Create a unique ID for this question to detect new questions
    const questionId = `${question.rootNote}-${question.interval}`;
    if (questionId !== questionIdRef.current && state === "waiting") {
      questionIdRef.current = questionId;
      // Small delay to let the UI update first
      const timer = setTimeout(() => {
        playQuestion();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [question, state, playQuestion]);

  const processAnswer = useCallback((playedNote: number) => {
    if (!question || hasCheckedRef.current || state !== "listening") return;
    if (answerMode !== "keyboard") return;
    
    hasCheckedRef.current = true;
    const audio = getAudioEngine();

    // Calculate the expected target note
    const targetNote = question.rootNote + question.interval;
    
    // Check if the played note matches the target (allow any octave)
    const playedPitchClass = playedNote % 12;
    const targetPitchClass = targetNote % 12;
    const isCorrect = playedPitchClass === targetPitchClass;

    // Store the answer note for chain mode (use the actual target for consistency)
    lastAnswerNoteRef.current = targetNote;
    setLastAnswerNote(targetNote);

    if (isCorrect) {
      setState("correct");
      audio.playCorrect();
      setStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    } else {
      setState("incorrect");
      audio.playIncorrect();
      setStats((prev) => ({ ...prev, total: prev.total + 1 }));
    }

    const progress = recordAttempt("interval", difficulty, isCorrect);
    setDifficulty(progress.currentDifficulty.interval);
    setRecentStreak(getRecentStreak("interval"));
  }, [question, state, answerMode, difficulty]);

  // Handle button click answer
  const handleIntervalClick = useCallback((interval: Interval) => {
    if (state !== "listening" || !question || hasCheckedRef.current) return;
    
    hasCheckedRef.current = true;
    setSelectedInterval(interval.semitones);
    
    const isCorrect = interval.semitones === Math.abs(question.interval);
    const targetNote = question.rootNote + question.interval;
    const audio = getAudioEngine();

    lastAnswerNoteRef.current = targetNote;
    setLastAnswerNote(targetNote);

    if (isCorrect) {
      setState("correct");
      audio.playCorrect();
      setStats((prev) => ({ correct: prev.correct + 1, total: prev.total + 1 }));
    } else {
      setState("incorrect");
      audio.playIncorrect();
      setStats((prev) => ({ ...prev, total: prev.total + 1 }));
    }

    const progress = recordAttempt("interval", difficulty, isCorrect);
    setDifficulty(progress.currentDifficulty.interval);
    setRecentStreak(getRecentStreak("interval"));
  }, [state, question, difficulty]);

  // Watch for MIDI input
  useEffect(() => {
    if (state !== "listening" || !question || hasCheckedRef.current || answerMode !== "keyboard") {
      return;
    }

    // Check if a new note was played via MIDI
    if (activeNotes.size > 0) {
      const notesArray = Array.from(activeNotes);
      const playedNote = notesArray[notesArray.length - 1];
      processAnswer(playedNote);
    }
  }, [activeNotes, question, state, answerMode, processAnswer]);

  // Handle keyboard note (both on-screen clicks and for sound)
  const handleKeyboardNoteOn = useCallback((note: number) => {
    const audio = getAudioEngine();
    audio.startNote(note);
    
    // Process this as a potential answer
    processAnswer(note);
  }, [processAnswer]);

  const handleKeyboardNoteOff = useCallback((note: number) => {
    const audio = getAudioEngine();
    audio.stopNote(note);
  }, []);

  // Start with a question
  useEffect(() => {
    if (!question) {
      generateNewQuestion();
    }
  }, [question, generateNewQuestion]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Enter or Space to go to next question
      if ((e.key === "Enter" || e.key === " ") && (state === "correct" || state === "incorrect")) {
        e.preventDefault();
        handleNext();
      }
      // Space to play/replay when waiting or listening
      if (e.key === " " && (state === "waiting" || state === "listening")) {
        e.preventDefault();
        playQuestion();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, handleNext, playQuestion]);

  const getStateColor = () => {
    switch (state) {
      case "correct":
        return "from-emerald-500/20 to-emerald-600/5";
      case "incorrect":
        return "from-rose-500/20 to-rose-600/5";
      default:
        return "from-amber-500/10 to-orange-500/5";
    }
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const availableIntervals = getIntervalsForDifficulty(difficulty);
  
  // Get the starting note name
  const startingNoteName = question ? midiToNoteName(question.rootNote) : "";
  const targetNoteName = question ? midiToNoteName(question.rootNote + question.interval) : "";

  // Get interval name for display
  const intervalInfo = question 
    ? INTERVALS.find(i => i.semitones === Math.abs(question.interval))
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-zinc-800">Interval Recognition</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-full">
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
              onClick={() => setAnswerMode("keyboard")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                answerMode === "keyboard" 
                  ? "bg-white text-zinc-800 shadow-sm" 
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Keyboard
            </button>
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
          </div>
        </div>
      </div>

      {/* Chain mode toggle */}
      <div className="flex items-center justify-between bg-zinc-50 rounded-xl p-4">
        <div>
          <span className="font-medium text-zinc-700">Chain intervals</span>
          <p className="text-xs text-zinc-500">
            Next interval starts from your last answer note
          </p>
        </div>
        <button
          onClick={() => setChainMode(!chainMode)}
          className={`
            relative w-12 h-7 rounded-full transition-colors duration-200
            ${chainMode ? "bg-amber-500" : "bg-zinc-300"}
          `}
        >
          <span
            className={`
              absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm
              transition-transform duration-200
              ${chainMode ? "left-6" : "left-1"}
            `}
          />
        </button>
      </div>

      {/* Skip first note toggle (only visible when chain mode is enabled) */}
      {chainMode && (
        <div className="flex items-center justify-between bg-amber-50 rounded-xl p-4 border border-amber-200">
          <div>
            <span className="font-medium text-amber-700">Skip first note</span>
            <p className="text-xs text-amber-600">
              Only play the target note (you remember the previous)
            </p>
          </div>
          <button
            onClick={() => setSkipFirstNote(!skipFirstNote)}
            className={`
              relative w-12 h-7 rounded-full transition-colors duration-200
              ${skipFirstNote ? "bg-amber-500" : "bg-zinc-300"}
            `}
          >
            <span
              className={`
                absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm
                transition-transform duration-200
                ${skipFirstNote ? "left-6" : "left-1"}
              `}
            />
          </button>
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
        {/* Starting note display */}
        {question && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Starting note:</span>
            <span className="px-2 py-1 bg-white/80 rounded-md text-sm font-mono font-bold text-zinc-700 shadow-sm">
              {startingNoteName}
            </span>
            {chainMode && lastAnswerNote !== null && state === "waiting" && (
              <span className="text-xs text-amber-600">← from last answer</span>
            )}
          </div>
        )}

        {/* Question display */}
        <div className="text-center mb-8 pt-6">
          {state === "waiting" && (
            <p className="text-zinc-600 text-lg">Press play to hear the interval</p>
          )}
          {state === "listening" && (
            <div className="space-y-2">
              <p className="text-amber-700 text-lg font-medium animate-pulse">
                {answerMode === "keyboard" 
                  ? "Play the target note..." 
                  : "Select the interval..."}
              </p>
              {answerMode === "keyboard" && (
                <p className="text-sm text-zinc-500">
                  Starting from <span className="font-mono font-bold">{startingNoteName}</span> — play the second note
                </p>
              )}
            </div>
          )}
          {state === "correct" && (
            <div className="space-y-2 animate-celebrate">
              <p className="text-emerald-700 text-2xl font-bold">✓ Correct!</p>
              <p className="text-emerald-600 text-lg">{intervalInfo?.name}</p>
              <p className="text-sm text-zinc-500">
                {startingNoteName} → {targetNoteName}
              </p>
            </div>
          )}
          {state === "incorrect" && (
            <div className="space-y-2">
              <p className="text-rose-700 text-2xl font-bold">✗ Not quite</p>
              {showAnswer ? (
                <div className="space-y-1">
                  <p className="text-rose-600 text-lg">{intervalInfo?.name}</p>
                  <p className="text-sm text-zinc-500">
                    {startingNoteName} → {targetNoteName}
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="text-rose-600 underline text-sm"
                >
                  Show answer
                </button>
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
                ? "bg-amber-500 text-white hover:bg-amber-600 hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/30"
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

        {/* Interval buttons (when in buttons mode) */}
        {answerMode === "buttons" && state === "listening" && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {availableIntervals.map((interval) => (
              <button
                key={interval.semitones}
                onClick={() => handleIntervalClick(interval)}
                className="px-3 py-3 rounded-xl text-sm font-medium bg-white hover:bg-amber-50 
                           hover:scale-105 active:scale-95 shadow-md hover:shadow-lg 
                           border border-zinc-200 cursor-pointer transition-all duration-200"
              >
                <span className="block text-xs text-zinc-500 mb-0.5">{interval.shortName}</span>
                <span className="block">{interval.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Show answer buttons after answering (buttons mode) */}
        {answerMode === "buttons" && (state === "correct" || state === "incorrect") && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {availableIntervals.map((interval) => {
              const isCorrectAnswer = question && interval.semitones === Math.abs(question.interval);
              const isSelected = selectedInterval === interval.semitones;
              const showAsCorrect = isCorrectAnswer;
              const showAsWrong = isSelected && !isCorrectAnswer;
              
              return (
                <div
                  key={interval.semitones}
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
                  <span className="block text-xs opacity-70 mb-0.5">{interval.shortName}</span>
                  <span className="block">{interval.name}</span>
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
          highlightedNotes={
            showAnswer && question
              ? [question.rootNote, question.rootNote + question.interval]
              : state === "listening" && question
                ? [question.rootNote]
                : []
          }
          onNoteOn={handleKeyboardNoteOn}
          onNoteOff={handleKeyboardNoteOff}
          disabled={state !== "listening" || answerMode === "buttons"}
        />
        <p className="text-center text-xs text-zinc-400 mt-2">
          {answerMode === "keyboard" 
            ? "Click a key or play on your MIDI keyboard"
            : "Switch to keyboard mode to play"
          }
        </p>
      </div>

      {/* Interval reference (collapsible) */}
      <details className="bg-zinc-50 rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-800">
          Interval reference
        </summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {INTERVALS.slice(0, 13).map((interval) => (
            <div
              key={interval.semitones}
              className="px-3 py-2 bg-white rounded-lg text-sm"
            >
              <span className="font-mono text-zinc-400 mr-2">{interval.shortName}</span>
              <span className="text-zinc-700">{interval.name}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
