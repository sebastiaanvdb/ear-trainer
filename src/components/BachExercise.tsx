"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAudioEngine } from "@/lib/audio";
import { INTERVALS } from "@/lib/exercises";
import { PianoKeyboard } from "./PianoKeyboard";
import { BACH_MELODIES, BachMelody } from "@/lib/bachMelodies";

type ExerciseState = "waiting" | "listening" | "correct" | "incorrect";
type ChunkOption = "note" | "quarter" | "half" | "bar";

interface BachExerciseProps {
  activeNotes: Set<number>;
  lastCC?: { controller: number; value: number } | null;
  onClearCC?: () => void;
}

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
function midiToName(midi: number): string {
  return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

// Compute actual note count for a chunk option given the melody's notesPerBar.
// Returns the number of notes in the chunk (intervals = returned value - 1).
function getChunkSize(option: ChunkOption, notesPerBar: number): number {
  switch (option) {
    case "note":    return 2;
    case "quarter": return Math.max(2, Math.round(notesPerBar / 4));
    case "half":    return Math.max(3, Math.round(notesPerBar / 2));
    case "bar":     return Math.max(3, notesPerBar);
  }
}

const CHUNK_OPTIONS: { option: ChunkOption; label: string }[] = [
  { option: "note",    label: "Per note" },
  { option: "quarter", label: "¼ bar" },
  { option: "half",    label: "½ bar" },
  { option: "bar",     label: "Full bar" },
];

const DIFFICULTY_LABELS = { 1: "Easy", 2: "Medium", 3: "Hard" } as const;

function pickMelody(pool: BachMelody[], currentId: string): BachMelody {
  const others = pool.filter(m => m.id !== currentId);
  const candidates = others.length > 0 ? others : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function BachExercise({ activeNotes, lastCC, onClearCC }: BachExerciseProps) {
  const [selectedDifficulty, setSelectedDifficulty] = useState<1 | 2 | 3>(1);
  const [melodyId, setMelodyId] = useState(BACH_MELODIES[0].id);

  // Chunk-mode state
  const [chunkOption, setChunkOption] = useState<ChunkOption>("note");
  const [chunkStart, setChunkStart] = useState(0);
  const [chunkOffset, setChunkOffset] = useState(0);
  const [chunkAnswers, setChunkAnswers] = useState<(boolean | null)[]>([]);

  const [state, setState] = useState<ExerciseState>("waiting");
  const [selectedInterval, setSelectedInterval] = useState<number | null>(null);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [answerMode, setAnswerMode] = useState<"keyboard" | "buttons">("buttons");
  const [skipFirstNote, setSkipFirstNote] = useState(false);

  const hasCheckedRef = useRef(false);
  const hasStartedRef = useRef(false);

  // ── Derived values ────────────────────────────────────────────────────────
  const melody = BACH_MELODIES.find(m => m.id === melodyId) ?? BACH_MELODIES[0];
  const availableMelodies = BACH_MELODIES.filter(m => m.difficulty <= selectedDifficulty);
  const totalPairs = melody.notes.length - 1;
  const absolutePos = chunkStart + chunkOffset;
  const isMelodyComplete = absolutePos >= totalPairs;

  const chunkSize = getChunkSize(chunkOption, melody.notesPerBar);
  const chunkEnd = Math.min(chunkStart + chunkSize, melody.notes.length);
  const chunkNotes = melody.notes.slice(chunkStart, chunkEnd);
  const pairsInChunk = Math.max(0, chunkNotes.length - 1);

  const question = isMelodyComplete ? null : {
    noteA: melody.notes[absolutePos],
    noteB: melody.notes[absolutePos + 1],
    interval: melody.notes[absolutePos + 1] - melody.notes[absolutePos],
    position: absolutePos,
  };

  const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null;
  const composerLabel = melody.composer ?? "J.S. Bach";

  // Deduplicate chunk options that resolve to the same note count for this melody
  const visibleChunkOptions = CHUNK_OPTIONS.filter((opt, i, arr) => {
    const size = getChunkSize(opt.option, melody.notesPerBar);
    return arr.findIndex(o => getChunkSize(o.option, melody.notesPerBar) === size) === i;
  });

  // ── Resets ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setChunkStart(0);
    setChunkOffset(0);
    setChunkAnswers([]);
    setStats({ correct: 0, total: 0 });
    setState("waiting");
    setSelectedInterval(null);
    hasStartedRef.current = false;
    hasCheckedRef.current = false;
  }, [melodyId]);

  // Reset chunk answer record when chunk advances
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setChunkAnswers(new Array(pairsInChunk).fill(null));
  }, [chunkStart]);

  // ── Playback ──────────────────────────────────────────────────────────────
  const playChunk = useCallback(() => {
    hasStartedRef.current = true;
    const audio = getAudioEngine();

    if (chunkOption === "note" && question) {
      if (skipFirstNote && absolutePos > 0) {
        audio.playNote(question.noteB, 0.9, 0.8);
      } else {
        audio.playInterval(question.noteA, question.interval, 80);
      }
    } else {
      const notes = melody.notes.slice(chunkStart, Math.min(chunkStart + chunkSize, melody.notes.length));
      audio.playMelody(notes, 120);
    }

    setState("listening");
    hasCheckedRef.current = false;
  }, [chunkOption, question, skipFirstNote, absolutePos, melody, chunkStart, chunkSize]);

  // Auto-play when a new chunk starts (after user has started at least once)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!hasStartedRef.current || state !== "waiting") return;
    playChunk();
  }, [chunkStart]);

  // ── Answering ─────────────────────────────────────────────────────────────
  const processAnswer = useCallback((correct: boolean, semitones: number) => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    setStats(s => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    setChunkAnswers(prev => {
      const next = [...prev];
      next[chunkOffset] = correct;
      return next;
    });
    setState(correct ? "correct" : "incorrect");
    setSelectedInterval(semitones);
  }, [chunkOffset]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    const nextOffset = chunkOffset + 1;

    if (chunkOption !== "note" && nextOffset < pairsInChunk) {
      // Still inside chunk — advance pair, keep "listening" (already heard the phrase)
      setChunkOffset(nextOffset);
      setState("listening");
      setSelectedInterval(null);
      hasCheckedRef.current = false;
    } else {
      // Done with chunk — overlapping advance (last note of old chunk = first of new)
      const nextStart = chunkStart + pairsInChunk;
      setChunkStart(nextStart);
      setChunkOffset(0);
      setState("waiting");
      setSelectedInterval(null);
      hasCheckedRef.current = false;
    }
  }, [chunkOffset, chunkOption, chunkStart, pairsInChunk]);

  useEffect(() => {
    if ((state !== "correct" && state !== "incorrect") || isMelodyComplete) return;
    const delay = state === "correct" ? 600 : 1400;
    const timer = setTimeout(handleNext, delay);
    return () => clearTimeout(timer);
  }, [state, isMelodyComplete, handleNext]);

  // ── Button answers ────────────────────────────────────────────────────────
  const handleIntervalClick = useCallback((semitones: number) => {
    if (state !== "listening" || !question || hasCheckedRef.current) return;
    processAnswer(Math.abs(question.interval) === semitones, semitones);
  }, [state, question, processAnswer]);

  // ── MIDI / on-screen keyboard ─────────────────────────────────────────────
  useEffect(() => {
    if (state !== "listening" || !question || hasCheckedRef.current || answerMode !== "keyboard") return;
    if (activeNotes.size === 0) return;
    const targetPC = ((question.noteB % 12) + 12) % 12;
    for (const note of activeNotes) {
      if (((note % 12) + 12) % 12 === targetPC) {
        processAnswer(true, Math.abs(question.interval));
        return;
      }
    }
  }, [activeNotes, state, question, answerMode, processAnswer]);

  const handleKeyboardNoteOn = useCallback((note: number) => {
    getAudioEngine().startNote(note);
    if (state !== "listening" || !question || hasCheckedRef.current || answerMode !== "keyboard") return;
    const targetPC = ((question.noteB % 12) + 12) % 12;
    processAnswer(((note % 12) + 12) % 12 === targetPC, Math.abs(question.interval));
  }, [state, question, answerMode, processAnswer]);

  const handleKeyboardNoteOff = useCallback((note: number) => {
    getAudioEngine().stopNote(note);
  }, []);

  // ── Difficulty picker ─────────────────────────────────────────────────────
  const handleDifficultyChange = useCallback((diff: 1 | 2 | 3) => {
    setSelectedDifficulty(diff);
    // If current melody is harder than new difficulty, switch to one that fits
    const current = BACH_MELODIES.find(m => m.id === melodyId);
    if (current && current.difficulty > diff) {
      const pool = BACH_MELODIES.filter(m => m.difficulty <= diff);
      if (pool.length > 0) setMelodyId(pool[0].id);
    }
  }, [melodyId]);

  // ── Melody browser ────────────────────────────────────────────────────────
  const handleChangeMelody = useCallback((dir: -1 | 1) => {
    const avail = BACH_MELODIES.filter(m => m.difficulty <= selectedDifficulty);
    const idx = avail.findIndex(m => m.id === melodyId);
    const next = avail[(idx + dir + avail.length) % avail.length];
    if (next) setMelodyId(next.id);
  }, [melodyId, selectedDifficulty]);

  const handleRestartMelody = useCallback(() => {
    setChunkStart(0);
    setChunkOffset(0);
    setChunkAnswers([]);
    setStats({ correct: 0, total: 0 });
    setState("waiting");
    setSelectedInterval(null);
    hasStartedRef.current = false;
    hasCheckedRef.current = false;
  }, []);

  const handleNextMelody = useCallback(() => {
    const pool = BACH_MELODIES.filter(m => m.difficulty <= selectedDifficulty);
    setMelodyId(pickMelody(pool, melodyId).id);
  }, [selectedDifficulty, melodyId]);

  const handleChunkOptionChange = useCallback((opt: ChunkOption) => {
    setChunkOption(opt);
    // Restart chunk from current position with new size
    setChunkStart(absolutePos);
    setChunkOffset(0);
    setState("waiting");
    setSelectedInterval(null);
    hasCheckedRef.current = false;
  }, [absolutePos]);

  // ── CC / keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    if (!lastCC) return;
    if (lastCC.controller === 51 && lastCC.value === 0) {
      if (state === "correct" || state === "incorrect") handleNext();
      else playChunk();
      onClearCC?.();
    }
  }, [lastCC, state, handleNext, playChunk, onClearCC]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " " && (state === "waiting" || state === "listening")) {
        e.preventDefault(); playChunk();
      }
      if (e.key === "Enter" && (state === "correct" || state === "incorrect") && !isMelodyComplete) {
        e.preventDefault(); handleNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, isMelodyComplete, playChunk, handleNext]);

  // ── Derived UI helpers ─────────────────────────────────────────────────────
  const absInterval = question ? Math.abs(question.interval) : 0;
  const intervalName = INTERVALS.find(i => i.semitones === absInterval)?.name ?? `${absInterval} semitones`;
  const dirSymbol = !question || question.interval === 0 ? "=" : question.interval > 0 ? "↑" : "↓";

  const stateGradient = {
    waiting:   "from-amber-50/40 to-zinc-50",
    listening: "from-amber-50/60 to-zinc-50",
    correct:   "from-emerald-50 to-green-50",
    incorrect: "from-rose-50 to-red-50",
  }[state];

  // ── Completion screen ─────────────────────────────────────────────────────
  if (isMelodyComplete) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="text-center py-12 bg-amber-50 rounded-2xl border border-amber-200">
          <p className="text-5xl mb-3">🎼</p>
          <h2 className="text-2xl font-bold text-zinc-800 mb-1">Melody complete!</h2>
          <p className="text-sm text-zinc-500 mb-6">{melody.title} · {melody.catalog} · {composerLabel}</p>
          <div className="text-6xl font-bold text-amber-700 mb-1">{accuracy ?? 0}%</div>
          <p className="text-zinc-500 mb-6">{stats.correct} / {stats.total} correct</p>
          <div className="flex gap-3 justify-center">
            <button onClick={handleRestartMelody} className="px-6 py-3 bg-white border-2 border-amber-200 text-amber-700 rounded-xl font-semibold hover:bg-amber-50 transition-colors">
              Restart
            </button>
            <button onClick={handleNextMelody} className="px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors">
              Next melody →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* Difficulty + melody selector row */}
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
        <button onClick={() => handleChangeMelody(-1)} className="w-8 h-8 flex items-center justify-center text-xl text-amber-600 hover:text-amber-900 rounded-lg hover:bg-amber-100 transition-colors">‹</button>
        <div className="flex-1 text-center">
          <p className="font-semibold text-amber-900 text-sm">{melody.title}</p>
          <p className="text-xs text-amber-600">{melody.catalog} · {melody.key} · {composerLabel}</p>
        </div>
        <button onClick={() => handleChangeMelody(1)} className="w-8 h-8 flex items-center justify-center text-xl text-amber-600 hover:text-amber-900 rounded-lg hover:bg-amber-100 transition-colors">›</button>
      </div>

      {/* Difficulty picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-400 shrink-0">Difficulty:</span>
        <div className="flex gap-1">
          {([1, 2, 3] as const).map(d => (
            <button
              key={d}
              onClick={() => handleDifficultyChange(d)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedDifficulty === d
                  ? "bg-amber-500 text-white"
                  : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}
            >
              <span className="flex gap-0.5 items-center">
                {([1, 2, 3] as const).map(dot => (
                  <span key={dot} className={`block w-1.5 h-1.5 rounded-full ${dot <= d ? "bg-current" : "bg-current opacity-25"}`} />
                ))}
              </span>
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
        </div>
        <span className="text-xs text-zinc-400">{availableMelodies.length} melodies</span>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-zinc-100 rounded-full h-1.5 overflow-hidden">
          <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.min((absolutePos / totalPairs) * 100, 100)}%` }} />
        </div>
        <span className="text-xs text-zinc-400 tabular-nums">{absolutePos + 1}/{totalPairs + 1}</span>
        {accuracy !== null && <span className="text-xs text-zinc-400 tabular-nums">{accuracy}%</span>}
      </div>

      {/* Chunk size selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-400 shrink-0">Listen:</span>
        <div className="flex gap-1">
          {visibleChunkOptions.map(opt => {
            const noteCount = getChunkSize(opt.option, melody.notesPerBar);
            const intervals = noteCount - 1;
            return (
              <button
                key={opt.option}
                onClick={() => handleChunkOptionChange(opt.option)}
                title={opt.option === "note" ? "1 interval" : `${intervals} intervals (${noteCount} notes)`}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  chunkOption === opt.option ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                }`}
              >
                {opt.label}
                {opt.option !== "note" && (
                  <span className={`ml-1 opacity-70 ${chunkOption === opt.option ? "text-amber-100" : "text-zinc-400"}`}>
                    ({intervals})
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {chunkOption !== "note" && (
          <span className="text-xs text-zinc-400">
            — hear phrase, then answer each interval
          </span>
        )}
      </div>

      {/* Main card */}
      <div className={`relative rounded-2xl p-6 transition-all duration-500 bg-gradient-to-br ${stateGradient} border border-zinc-200`}>

        {/* Chunk timeline */}
        {chunkOption !== "note" && state !== "waiting" && chunkNotes.length > 1 && (
          <div className="flex items-center justify-center gap-1 mb-4">
            {chunkNotes.map((_, i) => {
              const isFrom = i === chunkOffset;
              const isTo = i === chunkOffset + 1;
              const isPast = i < chunkOffset;
              const pastAnswer = isPast ? chunkAnswers[i] : null;
              const prevLineAnswer = i > 0 && i - 1 < chunkOffset ? chunkAnswers[i - 1] : null;
              const isActiveLine = i > 0 && i - 1 === chunkOffset;
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className={`block w-5 h-px ${
                      prevLineAnswer === true  ? "bg-emerald-400"
                      : prevLineAnswer === false ? "bg-rose-400"
                      : isActiveLine ? "bg-amber-400"
                      : "bg-zinc-300"
                    }`} />
                  )}
                  <span className={`block w-2.5 h-2.5 rounded-full border-2 transition-colors ${
                    isFrom || isTo
                      ? "border-amber-500 bg-amber-200"
                      : isPast
                        ? pastAnswer === true  ? "border-emerald-500 bg-emerald-200"
                          : pastAnswer === false ? "border-rose-400 bg-rose-100"
                          : "border-zinc-400 bg-zinc-200"
                        : "border-zinc-300 bg-white"
                  }`} />
                </span>
              );
            })}
          </div>
        )}

        {/* From-note badge + within-chunk counter */}
        {question && state !== "waiting" && (
          <div className="absolute top-4 left-4 flex items-center gap-1.5">
            <span className="text-xs text-zinc-400">From:</span>
            <span className="px-2 py-0.5 bg-white/80 rounded text-sm font-mono font-bold text-zinc-700 shadow-sm">{midiToName(question.noteA)}</span>
          </div>
        )}
        {chunkOption !== "note" && state !== "waiting" && (
          <div className="absolute top-4 right-4">
            <span className="text-xs text-zinc-400 tabular-nums">{chunkOffset + 1}/{pairsInChunk}</span>
          </div>
        )}

        {/* State content */}
        <div className="text-center min-h-[80px] flex flex-col items-center justify-center mb-5 pt-5">
          {state === "waiting" && (
            <p className="text-zinc-500 text-lg">
              {chunkOption === "note"
                ? "Press play to hear the interval"
                : `Press play to hear ${pairsInChunk} interval${pairsInChunk !== 1 ? "s" : ""}`}
            </p>
          )}
          {state === "listening" && (
            <div className="space-y-2">
              <p className="text-amber-700 text-lg font-medium animate-pulse">
                {answerMode === "buttons" ? "Which interval?" : "Play the second note…"}
              </p>
              <p className="text-3xl text-amber-400 font-light">{dirSymbol}</p>
            </div>
          )}
          {state === "correct" && (
            <div className="space-y-1">
              <p className="text-emerald-700 text-2xl font-bold">✓ Correct!</p>
              <p className="text-emerald-600 font-medium">{dirSymbol} {intervalName}</p>
              {question && <p className="text-emerald-400 text-sm">{midiToName(question.noteA)} → {midiToName(question.noteB)}</p>}
            </div>
          )}
          {state === "incorrect" && (
            <div className="space-y-1">
              <p className="text-rose-700 text-2xl font-bold">✗ Not quite</p>
              <p className="text-rose-600 font-medium">{dirSymbol} {intervalName}</p>
              {question && <p className="text-rose-400 text-sm">{midiToName(question.noteA)} → {midiToName(question.noteB)}</p>}
            </div>
          )}
        </div>

        {/* Play button */}
        <div className="flex justify-center">
          <button
            onClick={playChunk}
            disabled={!question}
            className={`px-8 py-3.5 rounded-xl font-bold text-base transition-all duration-200 ${
              state === "waiting" || state === "listening"
                ? "bg-amber-500 text-white hover:bg-amber-600 shadow-lg hover:shadow-xl active:scale-95"
                : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {state === "waiting"
              ? chunkOption === "note" ? "▶ Play" : "▶ Play phrase"
              : chunkOption !== "note" && state === "listening" ? "▶ Replay phrase"
              : state === "listening" ? "▶ Replay"
              : "▶ Hear again"}
          </button>
        </div>

        {/* Toggles */}
        <div className="flex justify-center gap-6 mt-4">
          {chunkOption === "note" && (
            <button onClick={() => setSkipFirstNote(s => !s)} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-700 transition-colors">
              <div className={`relative w-8 h-4 rounded-full transition-colors ${skipFirstNote ? "bg-amber-500" : "bg-zinc-300"}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${skipFirstNote ? "left-4" : "left-0.5"}`} />
              </div>
              Skip first note
            </button>
          )}
          <button onClick={() => setAnswerMode(m => m === "buttons" ? "keyboard" : "buttons")} className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">
            {answerMode === "buttons" ? "Keyboard mode" : "Button mode"}
          </button>
        </div>
      </div>

      {/* Interval answer buttons — listening */}
      {answerMode === "buttons" && state === "listening" && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {INTERVALS.map(interval => (
            <button
              key={interval.semitones}
              onClick={() => handleIntervalClick(interval.semitones)}
              className="px-3 py-3 rounded-xl text-sm font-medium bg-white hover:bg-amber-50 hover:scale-105 active:scale-95 shadow border border-zinc-200 transition-all duration-150"
            >
              <span className="block text-xs text-zinc-400 mb-0.5">{interval.shortName}</span>
              <span className="block">{interval.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Interval answer buttons — feedback */}
      {answerMode === "buttons" && (state === "correct" || state === "incorrect") && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {INTERVALS.map(interval => {
            const isCorrect = interval.semitones === absInterval;
            const isWrong   = interval.semitones === selectedInterval && !isCorrect;
            return (
              <div key={interval.semitones} className={`px-3 py-3 rounded-xl text-sm font-medium ${
                isCorrect ? "bg-emerald-100 border-2 border-emerald-400 text-emerald-800"
                  : isWrong ? "bg-rose-100 border-2 border-rose-400 text-rose-800"
                  : "bg-zinc-50 border border-zinc-100 text-zinc-400"
              }`}>
                <span className="block text-xs opacity-70 mb-0.5">{interval.shortName}</span>
                <span className="block">{interval.name}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Piano keyboard */}
      <div className={`bg-zinc-50 rounded-xl p-4 ${answerMode === "buttons" && state === "listening" ? "opacity-50" : ""}`}>
        <PianoKeyboard
          startNote={36}
          endNote={84}
          activeNotes={activeNotes}
          highlightedNotes={
            question && (state === "correct" || state === "incorrect")
              ? [question.noteA, question.noteB]
              : question && state !== "waiting" ? [question.noteA]
              : []
          }
          onNoteOn={handleKeyboardNoteOn}
          onNoteOff={handleKeyboardNoteOff}
          disabled={answerMode === "buttons" || state !== "listening"}
        />
        <p className="text-center text-xs text-zinc-400 mt-2">
          {answerMode === "keyboard" ? "Click a key or use your MIDI keyboard" : "Switch to keyboard mode to play notes"}
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={() => getAudioEngine().playMelody(melody.notes, 120)} className="text-xs text-amber-600 hover:text-amber-800 transition-colors underline underline-offset-2">
          ♪ Hear full melody
        </button>
      </div>
    </div>
  );
}
