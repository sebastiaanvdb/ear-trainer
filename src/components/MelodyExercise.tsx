"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PianoKeyboard } from "./PianoKeyboard";
import { getAudioEngine } from "@/lib/audio";
import { midiToNoteName } from "@/hooks/useMidi";
import {
  MelodyQuestion,
  generateMelodyQuestion,
  DifficultyLevel,
} from "@/lib/exercises";
import { recordAttempt, getCurrentDifficulty, getRecentStreak } from "@/lib/storage";

// Middle octaves for melodies
const PIANO_START = 48; // C3
const PIANO_END = 84;   // C6

interface MelodyExerciseProps {
  activeNotes: Set<number>;
  onClearChord: () => void;
}

type ExerciseState = "waiting" | "listening" | "playing" | "correct" | "incorrect";

export function MelodyExercise({
  activeNotes,
  onClearChord,
}: MelodyExerciseProps) {
  const [question, setQuestion] = useState<MelodyQuestion | null>(null);
  const [state, setState] = useState<ExerciseState>("waiting");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(1);
  const [showAnswer, setShowAnswer] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [recentStreak, setRecentStreak] = useState({ correct: 0, total: 0 });
  const [playedNotes, setPlayedNotes] = useState<number[]>([]);
  const [noteStatuses, setNoteStatuses] = useState<("correct" | "incorrect" | "pending")[]>([]);
  const [showStartingNote, setShowStartingNote] = useState(true);
  const hasCheckedRef = useRef(false);
  const lastNoteTimeRef = useRef<number>(0);
  // Track previously seen notes to detect new ones from MIDI
  const previousNotesRef = useRef<Set<number>>(new Set());
  // Track notes we've already processed to avoid duplicates
  const processedNotesRef = useRef<Set<string>>(new Set());
  // Track if user has interacted (for auto-play)
  const hasInteractedRef = useRef(false);

  // Load difficulty on mount
  useEffect(() => {
    setDifficulty(getCurrentDifficulty("melody"));
    setRecentStreak(getRecentStreak("melody"));
  }, []);

  const generateNewQuestion = useCallback(() => {
    const newQuestion = generateMelodyQuestion(difficulty);
    console.log("Generated melody:", newQuestion.notes.map(n => midiToNoteName(n)));
    
    setQuestion(newQuestion);
    setState("waiting");
    setShowAnswer(false);
    setPlayedNotes([]);
    setNoteStatuses([]);
    hasCheckedRef.current = false;
    previousNotesRef.current = new Set();
    processedNotesRef.current = new Set();
    onClearChord();
  }, [difficulty, onClearChord]);

  const handleNext = useCallback(() => {
    generateNewQuestion();
  }, [generateNewQuestion]);

  const playQuestion = useCallback(async () => {
    hasInteractedRef.current = true; // Mark that user has interacted
    if (!question) return;
    const audio = getAudioEngine();
    
    audio.init();
    await audio.ready();
    
    // Calculate tempo based on difficulty (slower = easier)
    const tempo = difficulty <= 2 ? 80 : difficulty <= 4 ? 100 : 120;
    
    console.log("Playing melody at tempo:", tempo);
    await audio.playMelody(question.notes, tempo);
    
    if (state === "waiting") {
      setState("listening");
    }
    
    // Reset played notes when replaying
    setPlayedNotes([]);
    setNoteStatuses([]);
    hasCheckedRef.current = false;
    previousNotesRef.current = new Set();
    processedNotesRef.current = new Set();
  }, [question, difficulty, state]);

  // Auto-play when a new question is ready (only after user has interacted)
  const questionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!question) return;
    if (!hasInteractedRef.current) return; // Don't auto-play until user interaction
    
    const questionId = question.notes.join("-");
    if (questionId !== questionIdRef.current && state === "waiting") {
      questionIdRef.current = questionId;
      const timer = setTimeout(() => {
        playQuestion();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [question, state, playQuestion]);

  // Process a played note (can be called from MIDI or on-screen piano)
  const processNote = useCallback((playedNote: number) => {
    if (state !== "listening" || !question || hasCheckedRef.current) return;
    
    // Debounce - create a unique key for this note at this time
    const now = Date.now();
    const noteKey = `${playedNote}-${Math.floor(now / 100)}`;
    if (processedNotesRef.current.has(noteKey)) return;
    processedNotesRef.current.add(noteKey);
    
    // Also debounce by time
    if (now - lastNoteTimeRef.current < 80) return;
    lastNoteTimeRef.current = now;

    // Add to played notes using functional update for latest state
    setPlayedNotes(prev => {
      const newPlayedNotes = [...prev, playedNote];
      
      // Check this note
      const noteIndex = newPlayedNotes.length - 1;
      const expectedNote = question.notes[noteIndex];
      
      // Check if pitch class matches (allow any octave)
      const isNoteCorrect = (playedNote % 12) === (expectedNote % 12);
      
      setNoteStatuses(prevStatuses => {
        const newStatuses = [...prevStatuses, isNoteCorrect ? "correct" as const : "incorrect" as const];
        
        // Check if melody is complete
        if (newPlayedNotes.length === question.notes.length) {
          hasCheckedRef.current = true;
          const audio = getAudioEngine();
          
          const allCorrect = newStatuses.every(s => s === "correct");
          
          if (allCorrect) {
            setState("correct");
            audio.playCorrect();
            setStats(s => ({ correct: s.correct + 1, total: s.total + 1 }));
          } else {
            setState("incorrect");
            audio.playIncorrect();
            setStats(s => ({ ...s, total: s.total + 1 }));
          }
          
          const progress = recordAttempt("melody", difficulty, allCorrect);
          setDifficulty(progress.currentDifficulty.melody);
          setRecentStreak(getRecentStreak("melody"));
        }
        
        return newStatuses;
      });
      
      return newPlayedNotes;
    });
  }, [state, question, difficulty]);

  // Handle MIDI input
  useEffect(() => {
    if (state !== "listening" || !question || hasCheckedRef.current) return;

    // Find new notes that weren't in the previous set
    activeNotes.forEach(note => {
      if (!previousNotesRef.current.has(note)) {
        processNote(note);
      }
    });
    
    // Update previous notes for next comparison
    previousNotesRef.current = new Set(activeNotes);
  }, [activeNotes, question, state, processNote]);

  // Start with a question
  useEffect(() => {
    if (!question) {
      generateNewQuestion();
    }
  }, [question, generateNewQuestion]);

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
      // Backspace to undo last note
      if (e.key === "Backspace" && state === "listening" && playedNotes.length > 0) {
        e.preventDefault();
        setPlayedNotes(prev => prev.slice(0, -1));
        setNoteStatuses(prev => prev.slice(0, -1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state, handleNext, playQuestion, playedNotes.length]);

  const handleKeyboardNoteOn = useCallback((note: number) => {
    const audio = getAudioEngine();
    audio.startNote(note);
    
    // Process this note as a potential answer
    processNote(note);
  }, [processNote]);

  const handleKeyboardNoteOff = useCallback((note: number) => {
    const audio = getAudioEngine();
    audio.stopNote(note);
  }, []);

  const getStateColor = () => {
    switch (state) {
      case "correct":
        return "from-emerald-500/20 to-emerald-600/5";
      case "incorrect":
        return "from-rose-500/20 to-rose-600/5";
      default:
        return "from-teal-500/10 to-cyan-500/5";
    }
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  
  // Get melody length based on difficulty
  const melodyLength = question?.notes.length || 0;
  const startingNoteName = question ? midiToNoteName(question.notes[0]) : "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-zinc-800">Melodic Dictation</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-teal-100 text-teal-800 text-sm font-medium rounded-full">
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
          <span className="text-zinc-400">
            {melodyLength} notes
          </span>
        </div>
      </div>

      {/* Settings */}
      <div className="flex items-center justify-between bg-teal-50 rounded-xl p-4">
        <div>
          <span className="font-medium text-zinc-700">Show starting note</span>
          <p className="text-xs text-zinc-500">
            Highlight the first note on the keyboard
          </p>
        </div>
        <button
          onClick={() => setShowStartingNote(!showStartingNote)}
          className={`
            relative w-12 h-7 rounded-full transition-colors duration-200
            ${showStartingNote ? "bg-teal-500" : "bg-zinc-300"}
          `}
        >
          <span
            className={`
              absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm
              transition-transform duration-200
              ${showStartingNote ? "left-6" : "left-1"}
            `}
          />
        </button>
      </div>

      {/* Main exercise area */}
      <div
        className={`
          relative rounded-2xl p-8 transition-all duration-500
          bg-gradient-to-br ${getStateColor()}
          border border-zinc-200
        `}
      >
        {/* Starting note display */}
        {question && showStartingNote && (
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wide">Starting note:</span>
            <span className="px-2 py-1 bg-white/80 rounded-md text-sm font-mono font-bold text-zinc-700 shadow-sm">
              {startingNoteName}
            </span>
          </div>
        )}

        {/* Progress indicator */}
        {question && state === "listening" && (
          <div className="absolute top-4 right-4 flex items-center gap-1">
            {question.notes.map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < noteStatuses.length
                    ? noteStatuses[i] === "correct"
                      ? "bg-emerald-500"
                      : "bg-rose-500"
                    : "bg-zinc-300"
                }`}
              />
            ))}
          </div>
        )}

        {/* Question display */}
        <div className="text-center mb-8 pt-6">
          {state === "waiting" && (
            <p className="text-zinc-600 text-lg">Press play to hear the melody</p>
          )}
          {state === "listening" && (
            <div className="space-y-2">
              <p className="text-teal-700 text-lg font-medium animate-pulse">
                Play the melody back...
              </p>
              <p className="text-sm text-zinc-500">
                {playedNotes.length} / {melodyLength} notes
                {playedNotes.length > 0 && " • Backspace to undo"}
              </p>
            </div>
          )}
          {state === "correct" && (
            <div className="space-y-2 animate-celebrate">
              <p className="text-emerald-700 text-2xl font-bold">✓ Perfect!</p>
              <p className="text-emerald-600">
                {question?.notes.map(n => midiToNoteName(n)).join(" → ")}
              </p>
            </div>
          )}
          {state === "incorrect" && (
            <div className="space-y-2">
              <p className="text-rose-700 text-2xl font-bold">✗ Not quite</p>
              {showAnswer ? (
                <div className="space-y-2">
                  <p className="text-sm text-zinc-600">Correct melody:</p>
                  <p className="text-rose-600 font-medium">
                    {question?.notes.map(n => midiToNoteName(n)).join(" → ")}
                  </p>
                  <p className="text-sm text-zinc-500">You played:</p>
                  <p className="text-zinc-600">
                    {playedNotes.map((n, i) => (
                      <span
                        key={i}
                        className={noteStatuses[i] === "correct" ? "text-emerald-600" : "text-rose-600"}
                      >
                        {midiToNoteName(n)}
                        {i < playedNotes.length - 1 ? " → " : ""}
                      </span>
                    ))}
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
        <div className="flex justify-center gap-4">
          <button
            onClick={playQuestion}
            disabled={!question}
            className={`
              px-8 py-4 rounded-xl font-bold text-lg
              transition-all duration-200 transform
              ${state === "waiting" || state === "listening"
                ? "bg-teal-500 text-white hover:bg-teal-600 hover:scale-105 active:scale-95 shadow-lg shadow-teal-500/30"
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
      </div>

      {/* Note display for what was played */}
      {state === "listening" && playedNotes.length > 0 && (
        <div className="bg-zinc-50 rounded-xl p-4">
          <p className="text-sm text-zinc-500 mb-2">Your melody:</p>
          <div className="flex flex-wrap gap-2">
            {playedNotes.map((note, i) => (
              <span
                key={i}
                className={`px-3 py-1 rounded-lg font-mono text-sm ${
                  noteStatuses[i] === "correct"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {midiToNoteName(note)}
              </span>
            ))}
            {playedNotes.length < melodyLength && (
              <span className="px-3 py-1 rounded-lg font-mono text-sm bg-zinc-200 text-zinc-500">
                ?
              </span>
            )}
          </div>
        </div>
      )}

      {/* Piano keyboard */}
      <div className="bg-zinc-50 rounded-xl p-4">
        <PianoKeyboard
          startNote={PIANO_START}
          endNote={PIANO_END}
          activeNotes={activeNotes}
          highlightedNotes={
            showAnswer && question
              ? question.notes
              : showStartingNote && question && state === "listening"
                ? [question.notes[0]]
                : []
          }
          onNoteOn={handleKeyboardNoteOn}
          onNoteOff={handleKeyboardNoteOff}
          disabled={state !== "listening"}
        />
        <p className="text-center text-xs text-zinc-400 mt-2">
          Play the melody on your MIDI keyboard or click the keys
        </p>
      </div>

      {/* Tips */}
      <details className="bg-zinc-50 rounded-xl p-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-600 hover:text-zinc-800">
          Tips for melodic dictation
        </summary>
        <ul className="mt-3 space-y-2 text-sm text-zinc-600">
          <li>• Listen for the <strong>direction</strong> of each interval (up or down)</li>
          <li>• Pay attention to <strong>step-wise motion</strong> vs. <strong>leaps</strong></li>
          <li>• Use the starting note as your anchor</li>
          <li>• Press <strong>Backspace</strong> to undo the last note</li>
          <li>• Press <strong>Space</strong> to replay the melody</li>
        </ul>
      </details>
    </div>
  );
}
