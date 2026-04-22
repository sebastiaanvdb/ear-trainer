"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { midiToNoteName } from "@/hooks/useMidi";

interface PianoKeyboardProps {
  startNote?: number; // MIDI note number
  endNote?: number;
  activeNotes?: Set<number>;
  highlightedNotes?: number[];
  onNoteOn?: (note: number) => void;
  onNoteOff?: (note: number) => void;
  showLabels?: boolean;
  disabled?: boolean;
}

const BLACK_KEY_OFFSETS = [1, 3, 6, 8, 10]; // Position in octave

function isBlackKey(midiNote: number): boolean {
  return BLACK_KEY_OFFSETS.includes(midiNote % 12);
}

export function PianoKeyboard({
  startNote = 48, // C3
  endNote = 72, // C5
  activeNotes = new Set(),
  highlightedNotes = [],
  onNoteOn,
  onNoteOff,
  showLabels = true,
  disabled = false,
}: PianoKeyboardProps) {
  const [pressedKeys, setPressedKeys] = useState<Set<number>>(new Set());
  const pressedKeysRef = useRef<Set<number>>(new Set());

  // Stop all pressed notes when disabled changes to true
  useEffect(() => {
    if (disabled && pressedKeysRef.current.size > 0) {
      pressedKeysRef.current.forEach((note) => {
        onNoteOff?.(note);
      });
      pressedKeysRef.current.clear();
      setPressedKeys(new Set());
    }
  }, [disabled, onNoteOff]);

  const handleMouseDown = useCallback(
    (note: number) => {
      if (disabled) return;
      setPressedKeys((prev) => new Set([...prev, note]));
      pressedKeysRef.current.add(note);
      onNoteOn?.(note);
    },
    [disabled, onNoteOn]
  );

  const handleMouseUp = useCallback(
    (note: number) => {
      // Always allow note-off, even when disabled, to stop hanging notes
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      pressedKeysRef.current.delete(note);
      onNoteOff?.(note);
    },
    [onNoteOff]
  );

  const handleMouseLeave = useCallback(
    (note: number) => {
      if (pressedKeysRef.current.has(note)) {
        handleMouseUp(note);
      }
    },
    [handleMouseUp]
  );

  // Global mouse up to catch releases outside keys
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (pressedKeysRef.current.size > 0) {
        pressedKeysRef.current.forEach((note) => {
          onNoteOff?.(note);
        });
        pressedKeysRef.current.clear();
        setPressedKeys(new Set());
      }
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, [onNoteOff]);

  // Keyboard mapping (computer keyboard to piano)
  const keyboardMap: Record<string, number> = {
    a: 48, // C3
    w: 49,
    s: 50,
    e: 51,
    d: 52,
    f: 53,
    t: 54,
    g: 55,
    y: 56,
    h: 57,
    u: 58,
    j: 59,
    k: 60, // C4
    o: 61,
    l: 62,
    p: 63,
    ";": 64,
    "'": 65,
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled || e.repeat) return;
      const note = keyboardMap[e.key.toLowerCase()];
      if (note !== undefined && note >= startNote && note <= endNote) {
        handleMouseDown(note);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Always handle key up to stop notes
      const note = keyboardMap[e.key.toLowerCase()];
      if (note !== undefined) {
        handleMouseUp(note);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [disabled, startNote, endNote, handleMouseDown, handleMouseUp]);

  // Build keys array
  const keys: { note: number; isBlack: boolean }[] = [];
  for (let note = startNote; note <= endNote; note++) {
    keys.push({ note, isBlack: isBlackKey(note) });
  }

  const whiteKeys = keys.filter((k) => !k.isBlack);
  const blackKeys = keys.filter((k) => k.isBlack);

  const whiteKeyWidth = 100 / whiteKeys.length;

  // Calculate black key positions
  const getBlackKeyPosition = (note: number): number => {
    let whiteKeyIndex = 0;
    for (let n = startNote; n < note; n++) {
      if (!isBlackKey(n)) whiteKeyIndex++;
    }
    // Black key sits between the previous white key
    return whiteKeyIndex * whiteKeyWidth - whiteKeyWidth * 0.15;
  };

  return (
    <div className="relative select-none" style={{ height: "160px" }}>
      {/* White keys */}
      <div className="flex h-full">
        {whiteKeys.map(({ note }) => {
          const isActive = activeNotes.has(note) || pressedKeys.has(note);
          const isHighlighted = highlightedNotes.includes(note);
          const noteName = midiToNoteName(note);
          const isC = note % 12 === 0;

          return (
            <div
              key={note}
              className={`
                relative flex-1 border border-zinc-300 rounded-b-lg cursor-pointer
                transition-all duration-75 select-none
                ${isActive 
                  ? "bg-amber-400 shadow-inner" 
                  : isHighlighted 
                    ? "bg-emerald-200" 
                    : "bg-white hover:bg-zinc-50"
                }
                ${disabled ? "opacity-50 cursor-not-allowed" : ""}
              `}
              onMouseDown={() => handleMouseDown(note)}
              onMouseUp={() => handleMouseUp(note)}
              onMouseLeave={() => handleMouseLeave(note)}
            >
              {showLabels && isC && (
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-xs text-zinc-400 font-medium">
                  {noteName}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Black keys */}
      {blackKeys.map(({ note }) => {
        const isActive = activeNotes.has(note) || pressedKeys.has(note);
        const isHighlighted = highlightedNotes.includes(note);
        const left = getBlackKeyPosition(note);

        return (
          <div
            key={note}
            className={`
              absolute top-0 rounded-b-md cursor-pointer z-10
              transition-all duration-75
              ${isActive 
                ? "bg-amber-600" 
                : isHighlighted 
                  ? "bg-emerald-600" 
                  : "bg-zinc-900 hover:bg-zinc-800"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            `}
            style={{
              left: `${left}%`,
              width: `${whiteKeyWidth * 0.6}%`,
              height: "60%",
            }}
            onMouseDown={() => handleMouseDown(note)}
            onMouseUp={() => handleMouseUp(note)}
            onMouseLeave={() => handleMouseLeave(note)}
          />
        );
      })}
    </div>
  );
}
