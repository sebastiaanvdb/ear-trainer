import { ExerciseType, DifficultyLevel } from "./exercises";

export interface ExerciseAttempt {
  type: ExerciseType;
  difficulty: DifficultyLevel;
  correct: boolean;
  timestamp: number;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  practiceTime: number; // seconds
  attempts: number;
  correct: number;
}

export interface ProgressData {
  attempts: ExerciseAttempt[];
  dailyStats: Record<string, DailyStats>;
  streakCount: number;
  lastPracticeDate: string | null;
  exerciseAccuracy: Record<ExerciseType, { attempts: number; correct: number }>;
  currentDifficulty: Record<ExerciseType, DifficultyLevel>;
}

const STORAGE_KEY = "ear-training-progress";

function getDefaultProgress(): ProgressData {
  return {
    attempts: [],
    dailyStats: {},
    streakCount: 0,
    lastPracticeDate: null,
    exerciseAccuracy: {
      interval: { attempts: 0, correct: 0 },
      chord: { attempts: 0, correct: 0 },
      melody: { attempts: 0, correct: 0 },
    },
    currentDifficulty: {
      interval: 1,
      chord: 1,
      melody: 1,
    },
  };
}

export function loadProgress(): ProgressData {
  if (typeof window === "undefined") return getDefaultProgress();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefaultProgress();
    return JSON.parse(stored) as ProgressData;
  } catch {
    return getDefaultProgress();
  }
}

export function saveProgress(data: ProgressData): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save progress:", e);
  }
}

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function isConsecutiveDay(dateStr1: string, dateStr2: string): boolean {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays === 1;
}

export function recordAttempt(
  type: ExerciseType,
  difficulty: DifficultyLevel,
  correct: boolean
): ProgressData {
  const progress = loadProgress();
  const today = getTodayString();

  // Add attempt
  const attempt: ExerciseAttempt = {
    type,
    difficulty,
    correct,
    timestamp: Date.now(),
  };
  progress.attempts.push(attempt);

  // Update daily stats
  if (!progress.dailyStats[today]) {
    progress.dailyStats[today] = {
      date: today,
      practiceTime: 0,
      attempts: 0,
      correct: 0,
    };
  }
  progress.dailyStats[today].attempts++;
  if (correct) progress.dailyStats[today].correct++;

  // Update exercise accuracy
  progress.exerciseAccuracy[type].attempts++;
  if (correct) progress.exerciseAccuracy[type].correct++;

  // Update streak
  if (progress.lastPracticeDate !== today) {
    if (progress.lastPracticeDate === null || isConsecutiveDay(progress.lastPracticeDate, today)) {
      progress.streakCount++;
    } else if (progress.lastPracticeDate !== today) {
      // Check if yesterday was practiced
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      if (progress.lastPracticeDate !== yesterdayStr) {
        progress.streakCount = 1; // Reset streak
      }
    }
    progress.lastPracticeDate = today;
  }

  // Difficulty adaptation - check last 5 attempts for faster progression
  const recentAttempts = progress.attempts
    .filter((a) => a.type === type)
    .slice(-5);
  
  if (recentAttempts.length >= 5) {
    const recentCorrect = recentAttempts.filter((a) => a.correct).length;
    const accuracy = recentCorrect / 5;

    // Level up at 80% (4/5 correct), level down at 40% (2/5 or less)
    if (accuracy >= 0.8 && progress.currentDifficulty[type] < 5) {
      progress.currentDifficulty[type] = (progress.currentDifficulty[type] + 1) as DifficultyLevel;
    } else if (accuracy <= 0.4 && progress.currentDifficulty[type] > 1) {
      progress.currentDifficulty[type] = (progress.currentDifficulty[type] - 1) as DifficultyLevel;
    }
  }

  saveProgress(progress);
  return progress;
}

export function addPracticeTime(seconds: number): void {
  const progress = loadProgress();
  const today = getTodayString();

  if (!progress.dailyStats[today]) {
    progress.dailyStats[today] = {
      date: today,
      practiceTime: 0,
      attempts: 0,
      correct: 0,
    };
  }
  progress.dailyStats[today].practiceTime += seconds;

  saveProgress(progress);
}

export function getRecentStats(days: number = 7): DailyStats[] {
  const progress = loadProgress();
  const stats: DailyStats[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    stats.push(
      progress.dailyStats[dateStr] || {
        date: dateStr,
        practiceTime: 0,
        attempts: 0,
        correct: 0,
      }
    );
  }

  return stats;
}

export function getAccuracy(type: ExerciseType): number {
  const progress = loadProgress();
  const { attempts, correct } = progress.exerciseAccuracy[type];
  return attempts > 0 ? correct / attempts : 0;
}

export function getCurrentDifficulty(type: ExerciseType): DifficultyLevel {
  const progress = loadProgress();
  return progress.currentDifficulty[type];
}

export function getRecentStreak(type: ExerciseType): { correct: number; total: number } {
  const progress = loadProgress();
  const recentAttempts = progress.attempts
    .filter((a) => a.type === type)
    .slice(-5);
  
  return {
    correct: recentAttempts.filter((a) => a.correct).length,
    total: recentAttempts.length,
  };
}

export function resetProgress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
