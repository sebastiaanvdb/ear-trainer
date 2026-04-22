"use client";

import { MidiDevice } from "@/hooks/useMidi";

interface MidiStatusProps {
  isSupported: boolean;
  isConnected: boolean;
  activeDevice: MidiDevice | null;
  devices: MidiDevice[];
  onSelectDevice: (deviceId: string) => void;
}

export function MidiStatus({
  isSupported,
  isConnected,
  activeDevice,
  devices,
  onSelectDevice,
}: MidiStatusProps) {
  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span>MIDI not supported — use on-screen keyboard</span>
      </div>
    );
  }

  if (!isConnected || devices.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 bg-zinc-100 px-3 py-2 rounded-lg">
        <span className="w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
        <span>Waiting for MIDI keyboard...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="font-medium">{activeDevice?.name}</span>
      </div>
      
      {devices.length > 1 && (
        <select
          value={activeDevice?.id || ""}
          onChange={(e) => onSelectDevice(e.target.value)}
          className="text-sm bg-white border border-zinc-200 rounded-lg px-2 py-1.5 
                     focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {device.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
