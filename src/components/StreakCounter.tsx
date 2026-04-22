"use client";

import { useEffect, useState } from "react";
import { loadProgress } from "@/lib/storage";

export function StreakCounter() {
  const [streak, setStreak] = useState(0);
  const [todayAttempts, setTodayAttempts] = useState(0);

  useEffect(() => {
    const progress = loadProgress();
    setStreak(progress.streakCount);
    
    const today = new Date().toISOString().split("T")[0];
    const todayStats = progress.dailyStats[today];
    setTodayAttempts(todayStats?.attempts || 0);
  }, []);

  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-2">
        <span className="text-3xl">🔥</span>
        <div>
          <p className="text-2xl font-bold text-zinc-800">{streak}</p>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Day Streak</p>
        </div>
      </div>
      
      <div className="h-10 w-px bg-zinc-200" />
      
      <div>
        <p className="text-2xl font-bold text-zinc-800">{todayAttempts}</p>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Today</p>
      </div>
    </div>
  );
}
