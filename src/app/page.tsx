"use client";

import { useState, useCallback, useEffect } from "react";
import { useMidi } from "@/hooks/useMidi";
import { MidiStatus } from "@/components/MidiStatus";
import { StreakCounter } from "@/components/StreakCounter";
import { IntervalExercise } from "@/components/IntervalExercise";
import { ChordExercise } from "@/components/ChordExercise";
import { MelodyExercise } from "@/components/MelodyExercise";
import { ExerciseType } from "@/lib/exercises";
import { getAudioEngine } from "@/lib/audio";

type AppState = "home" | "training";

function AudioTestButton() {
  const [status, setStatus] = useState<string>("");

  const testAudio = () => {
    try {
      const audio = getAudioEngine();
      audio.init();
      const state = audio.getContextState();
      setStatus(`Context: ${state}`);
      audio.ready().then(ok => {
        setStatus(`Context: ${audio.getContextState()} | ready: ${ok}`);
        if (ok) {
          audio.playNote(69, 0.5, 0.8); // A4
        }
      });
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={testAudio}
        className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs rounded-full transition-colors"
      >
        🔊 Test sound
      </button>
      {status && (
        <p className="text-xs text-zinc-400 font-mono">{status}</p>
      )}
    </div>
  );
}

const EXERCISES: { type: ExerciseType; name: string; emoji: string; description: string; available: boolean }[] = [
  { type: "interval", name: "Intervals", emoji: "🎵", description: "Identify the distance between two notes", available: true },
  { type: "chord", name: "Chords", emoji: "🎹", description: "Recognize chord qualities (major, minor, etc.)", available: true },
  { type: "melody", name: "Melodies", emoji: "🎼", description: "Recreate short melodic phrases", available: true },
];

export default function Home() {
  const [appState, setAppState] = useState<AppState>("home");
  const [currentExercise, setCurrentExercise] = useState<ExerciseType>("interval");
  const midi = useMidi();

  // Call synchronously on every user interaction to satisfy browser autoplay policy
  const initAudio = useCallback(() => {
    getAudioEngine().init();
  }, []);

  const handleStartExercise = useCallback((exerciseType: ExerciseType) => {
    initAudio();
    setCurrentExercise(exerciseType);
    setAppState("training");
  }, [initAudio]);

  const handleBackHome = useCallback(() => {
    setAppState("home");
  }, []);

  // Keyboard shortcut to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && appState === "training") {
        handleBackHome();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appState, handleBackHome]);

  if (appState === "home") {
    return (
      <main className="min-h-screen flex flex-col">
        {/* Header */}
        <header className="p-6">
          <MidiStatus
            isSupported={midi.isSupported}
            isConnected={midi.isConnected}
            activeDevice={midi.activeDevice}
            devices={midi.devices}
            onSelectDevice={midi.connectToDevice}
          />
        </header>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <div className="text-center mb-12 animate-fade-in">
            <h1 className="text-5xl font-bold text-zinc-800 mb-3 tracking-tight">
              Ear Training
            </h1>
            <p className="text-xl text-zinc-500">
              Train your ear. Build musicianship. Daily.
            </p>
          </div>

          {/* Streak counter */}
          <div className="mb-12 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <StreakCounter />
          </div>

          {/* Exercise selection */}
          <div className="w-full max-w-lg animate-slide-up" style={{ animationDelay: "0.2s" }}>
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-4 text-center">
              Choose your exercise
            </h2>
            <div className="flex flex-col gap-3">
              {EXERCISES.map((exercise) => (
                <button
                  key={exercise.type}
                  onClick={() => exercise.available && handleStartExercise(exercise.type)}
                  disabled={!exercise.available}
                  className={`
                    flex items-center gap-4 p-5 rounded-2xl text-left
                    transition-all duration-200 transform
                    ${exercise.available
                      ? "bg-white border-2 border-zinc-200 hover:border-amber-400 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      : "bg-zinc-50 border-2 border-zinc-100 cursor-not-allowed opacity-60"
                    }
                  `}
                >
                  <span className="text-4xl">{exercise.emoji}</span>
                  <div className="flex-1">
                    <span className="block text-lg font-bold text-zinc-800">
                      {exercise.name}
                      {!exercise.available && (
                        <span className="ml-2 text-xs font-normal text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-full">
                          Coming soon
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-zinc-500">{exercise.description}</span>
                  </div>
                  {exercise.available && (
                    <span className="text-2xl text-zinc-300">→</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <footer className="p-6 text-center space-y-4">
          <p className="text-sm text-zinc-400">
            {midi.isConnected 
              ? "Your MIDI keyboard is ready — let's practice!" 
              : "Connect a MIDI keyboard or use the on-screen piano"
            }
          </p>
          <AudioTestButton />
          <a
            href="/kids"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-pink-400 to-purple-400 text-white text-sm font-medium rounded-full hover:scale-105 transition-transform shadow-md"
          >
            <span className="text-lg">🧒</span>
            Kids Mode
          </a>
        </footer>
      </main>
    );
  }

  // Training mode
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="p-6 flex items-center justify-between border-b border-zinc-200">
        <button
          onClick={handleBackHome}
          className="flex items-center gap-2 text-zinc-600 hover:text-zinc-800 transition-colors"
        >
          <span className="text-xl">←</span>
          <span className="text-sm font-medium">Back</span>
        </button>

        <MidiStatus
          isSupported={midi.isSupported}
          isConnected={midi.isConnected}
          activeDevice={midi.activeDevice}
          devices={midi.devices}
          onSelectDevice={midi.connectToDevice}
        />
      </header>

      {/* Exercise area */}
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        {currentExercise === "interval" && (
          <IntervalExercise
            activeNotes={midi.activeNotes}
            lastChord={midi.lastChord}
            onClearChord={midi.clearLastChord}
          />
        )}
        
        {currentExercise === "chord" && (
          <ChordExercise
            activeNotes={midi.activeNotes}
            lastChord={midi.lastChord}
            onClearChord={midi.clearLastChord}
          />
        )}
        
        {currentExercise === "melody" && (
          <MelodyExercise
            activeNotes={midi.activeNotes}
            onClearChord={midi.clearLastChord}
          />
        )}
      </div>

      {/* Footer with keyboard shortcut hint */}
      <footer className="p-4 text-center text-xs text-zinc-400">
        Press <kbd className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-500 font-mono">Esc</kbd> to go back
      </footer>
    </main>
  );
}
