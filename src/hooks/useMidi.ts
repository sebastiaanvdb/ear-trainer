"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export interface MidiNote {
  note: number;
  velocity: number;
  timestamp: number;
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

export interface UseMidiReturn {
  isSupported: boolean;
  isConnected: boolean;
  devices: MidiDevice[];
  activeDevice: MidiDevice | null;
  activeNotes: Set<number>;
  lastNote: MidiNote | null;
  lastChord: number[];
  connectToDevice: (deviceId: string) => void;
  clearLastChord: () => void;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function midiToNoteName(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const noteName = NOTE_NAMES[midiNote % 12];
  return `${noteName}${octave}`;
}

export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return -1;
  const [, note, octaveStr] = match;
  const noteIndex = NOTE_NAMES.indexOf(note);
  if (noteIndex === -1) return -1;
  const octave = parseInt(octaveStr, 10);
  return (octave + 1) * 12 + noteIndex;
}

export function useMidi(): UseMidiReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [activeDevice, setActiveDevice] = useState<MidiDevice | null>(null);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [lastNote, setLastNote] = useState<MidiNote | null>(null);
  const [lastChord, setLastChord] = useState<number[]>([]);

  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const activeInputRef = useRef<MIDIInput | null>(null);
  const chordTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingNotesRef = useRef<number[]>([]);

  const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
    const [status, note, velocity] = event.data as Uint8Array;
    const command = status & 0xf0;

    // Note On
    if (command === 0x90 && velocity > 0) {
      const midiNote: MidiNote = {
        note,
        velocity,
        timestamp: Date.now(),
      };
      setLastNote(midiNote);
      setActiveNotes((prev) => new Set([...prev, note]));

      // Chord detection: collect notes within 50ms window
      pendingNotesRef.current.push(note);
      
      if (chordTimeoutRef.current) {
        clearTimeout(chordTimeoutRef.current);
      }
      
      chordTimeoutRef.current = setTimeout(() => {
        const sortedNotes = [...pendingNotesRef.current].sort((a, b) => a - b);
        setLastChord(sortedNotes);
        pendingNotesRef.current = [];
      }, 50);
    }

    // Note Off
    if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
    }
  }, []);

  const connectToDevice = useCallback(
    (deviceId: string) => {
      if (!midiAccessRef.current) return;

      // Disconnect from previous device
      if (activeInputRef.current) {
        activeInputRef.current.onmidimessage = null;
        activeInputRef.current = null;
      }

      const input = midiAccessRef.current.inputs.get(deviceId);
      if (input) {
        input.onmidimessage = handleMidiMessage;
        activeInputRef.current = input;
        setActiveDevice({
          id: input.id,
          name: input.name || "Unknown Device",
          manufacturer: input.manufacturer || "Unknown",
        });
        setIsConnected(true);
      }
    },
    [handleMidiMessage]
  );

  const clearLastChord = useCallback(() => {
    setLastChord([]);
    pendingNotesRef.current = [];
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.requestMIDIAccess) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    navigator.requestMIDIAccess().then(
      (access) => {
        midiAccessRef.current = access;

        const updateDevices = () => {
          const inputDevices: MidiDevice[] = [];
          access.inputs.forEach((input) => {
            inputDevices.push({
              id: input.id,
              name: input.name || "Unknown Device",
              manufacturer: input.manufacturer || "Unknown",
            });
          });
          setDevices(inputDevices);

          // Auto-connect to first available device
          if (inputDevices.length > 0 && !activeInputRef.current) {
            connectToDevice(inputDevices[0].id);
          }
        };

        updateDevices();
        access.onstatechange = updateDevices;
      },
      (error) => {
        console.error("MIDI access denied:", error);
        setIsSupported(false);
      }
    );

    return () => {
      if (activeInputRef.current) {
        activeInputRef.current.onmidimessage = null;
      }
      if (chordTimeoutRef.current) {
        clearTimeout(chordTimeoutRef.current);
      }
    };
  }, [connectToDevice]);

  return {
    isSupported,
    isConnected,
    devices,
    activeDevice,
    activeNotes,
    lastNote,
    lastChord,
    connectToDevice,
    clearLastChord,
  };
}
