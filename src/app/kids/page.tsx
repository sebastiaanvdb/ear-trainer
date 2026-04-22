"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { getAudioEngine } from "@/lib/audio";

// Fun animal characters for the kids mode
const ANIMALS = [
  { name: "Bunny", emoji: "🐰", color: "from-pink-400 to-pink-500" },
  { name: "Bear", emoji: "🐻", color: "from-amber-400 to-amber-500" },
  { name: "Frog", emoji: "🐸", color: "from-green-400 to-green-500" },
  { name: "Bird", emoji: "🐦", color: "from-sky-400 to-sky-500" },
  { name: "Cat", emoji: "🐱", color: "from-orange-400 to-orange-500" },
  { name: "Dog", emoji: "🐕", color: "from-yellow-400 to-yellow-500" },
];

// Simple interval concepts for toddlers - we use relative pitch (high/low)
// and simple melodic patterns with colors
const PITCH_COLORS = {
  veryLow: { name: "Dark Blue", color: "#1e3a5f", bgClass: "bg-blue-900" },
  low: { name: "Blue", color: "#3b82f6", bgClass: "bg-blue-500" },
  medium: { name: "Green", color: "#22c55e", bgClass: "bg-green-500" },
  high: { name: "Yellow", color: "#eab308", bgClass: "bg-yellow-400" },
  veryHigh: { name: "Pink", color: "#ec4899", bgClass: "bg-pink-500" },
};

// Simple activities for 2.5 year olds
type Activity = "home" | "high-low" | "same-different" | "animal-sounds" | "follow-pattern";

// Celebration confetti particle
interface Confetti {
  id: number;
  x: number;
  color: string;
  delay: number;
}

function CelebrationAnimation({ show }: { show: boolean }) {
  const [confetti, setConfetti] = useState<Confetti[]>([]);

  useEffect(() => {
    if (show) {
      const particles: Confetti[] = [];
      const colors = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#ff6bff", "#6bffff"];
      for (let i = 0; i < 30; i++) {
        particles.push({
          id: i,
          x: Math.random() * 100,
          color: colors[Math.floor(Math.random() * colors.length)],
          delay: Math.random() * 0.5,
        });
      }
      setConfetti(particles);
      
      const timer = setTimeout(() => setConfetti([]), 2000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  if (!show || confetti.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      {confetti.map((particle) => (
        <div
          key={particle.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${particle.x}%`,
            backgroundColor: particle.color,
            width: "15px",
            height: "15px",
            borderRadius: "50%",
            animationDelay: `${particle.delay}s`,
          }}
        />
      ))}
      {/* Big star in the middle */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-9xl animate-bounce-in">
        ⭐
      </div>
    </div>
  );
}

// Big friendly button component for toddlers
function BigButton({
  children,
  onClick,
  color = "from-amber-400 to-orange-500",
  size = "large",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
  size?: "medium" | "large" | "huge";
  disabled?: boolean;
}) {
  const sizeClasses = {
    medium: "w-32 h-32 text-5xl",
    large: "w-40 h-40 text-6xl",
    huge: "w-52 h-52 text-7xl",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        rounded-full bg-gradient-to-br ${color}
        shadow-lg hover:shadow-xl
        transform transition-all duration-200
        hover:scale-110 active:scale-95
        flex items-center justify-center
        border-4 border-white/50
        disabled:opacity-50 disabled:hover:scale-100
        animate-pulse-gentle
      `}
    >
      {children}
    </button>
  );
}

// High/Low game - simplest interval concept
function HighLowGame({ onBack }: { onBack: () => void }) {
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<"high" | "low" | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const audioRef = useRef<ReturnType<typeof getAudioEngine> | null>(null);

  useEffect(() => {
    audioRef.current = getAudioEngine();
  }, []);

  const playSound = useCallback(async () => {
    if (!audioRef.current) return;
    audioRef.current.init();
    await audioRef.current.ready();
    
    // Random high or low
    const isHigh = Math.random() > 0.5;
    setCurrentQuestion(isHigh ? "high" : "low");
    setAnswered(false);
    setHasPlayed(true);
    
    // Play a clear high or low note
    // Low notes: C3-E3 (48-52), High notes: C5-G5 (72-79)
    const note = isHigh 
      ? 72 + Math.floor(Math.random() * 8) 
      : 48 + Math.floor(Math.random() * 5);
    
    audioRef.current.playNote(note, 1.5, 0.9);
  }, []);

  const handleAnswer = useCallback((answer: "high" | "low") => {
    if (!currentQuestion || answered) return;
    
    setAnswered(true);
    const correct = answer === currentQuestion;
    setIsCorrect(correct);
    
    if (correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
      if (streak >= 2) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2000);
      }
      audioRef.current?.playCorrect();
    } else {
      setStreak(0);
      audioRef.current?.playIncorrect();
    }
  }, [currentQuestion, answered, streak]);

  const handleNext = useCallback(() => {
    setAnswered(false);
    setCurrentQuestion(null);
    setHasPlayed(false);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-200 via-sky-100 to-white flex flex-col items-center">
      <CelebrationAnimation show={showCelebration} />
      
      {/* Header */}
      <div className="w-full p-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-3xl"
        >
          🏠
        </button>
        <div className="flex items-center gap-2 bg-white rounded-full px-6 py-3 shadow-lg">
          <span className="text-3xl">⭐</span>
          <span className="text-3xl font-bold text-amber-500">{score}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        {/* Title with animal */}
        <div className="text-center">
          <span className="text-8xl block mb-4">🐦</span>
          <h2 className="text-4xl font-bold text-sky-600">
            High or Low?
          </h2>
        </div>

        {/* Play button or answer feedback */}
        {!hasPlayed ? (
          <BigButton
            onClick={playSound}
            color="from-green-400 to-emerald-500"
            size="huge"
          >
            🎵
          </BigButton>
        ) : answered ? (
          <div className="text-center animate-bounce-in">
            <span className="text-9xl block">
              {isCorrect ? "🎉" : "💪"}
            </span>
            <p className="text-4xl font-bold mt-4">
              {isCorrect ? "Yay!" : "Try again!"}
            </p>
            <p className="text-2xl text-zinc-500 mt-2">
              It was a {currentQuestion} sound!
            </p>
            <button
              onClick={handleNext}
              className="mt-8 px-12 py-6 bg-gradient-to-r from-purple-400 to-pink-500 text-white text-3xl font-bold rounded-full shadow-lg hover:scale-105 transition-transform"
            >
              Next! →
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <button
              onClick={playSound}
              className="text-2xl text-sky-500 underline"
            >
              🔊 Hear again
            </button>
            
            {/* Answer buttons */}
            <div className="flex gap-8">
              {/* High button - bird flying up */}
              <div className="flex flex-col items-center gap-2">
                <BigButton
                  onClick={() => handleAnswer("high")}
                  color="from-pink-400 to-rose-500"
                  size="large"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-5xl">🐦</span>
                    <span className="text-2xl">⬆️</span>
                  </div>
                </BigButton>
                <span className="text-2xl font-bold text-pink-600">HIGH</span>
              </div>

              {/* Low button - whale going down */}
              <div className="flex flex-col items-center gap-2">
                <BigButton
                  onClick={() => handleAnswer("low")}
                  color="from-blue-400 to-indigo-500"
                  size="large"
                >
                  <div className="flex flex-col items-center">
                    <span className="text-5xl">🐋</span>
                    <span className="text-2xl">⬇️</span>
                  </div>
                </BigButton>
                <span className="text-2xl font-bold text-blue-600">LOW</span>
              </div>
            </div>
          </div>
        )}

        {/* Streak indicator */}
        {streak > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: Math.min(streak, 5) }).map((_, i) => (
              <span key={i} className="text-4xl animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}>
                ⭐
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Same or Different game - comparing two sounds
function SameDifferentGame({ onBack }: { onBack: () => void }) {
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<"same" | "different" | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [note1, setNote1] = useState(60);
  const [note2, setNote2] = useState(60);
  const audioRef = useRef<ReturnType<typeof getAudioEngine> | null>(null);

  useEffect(() => {
    audioRef.current = getAudioEngine();
  }, []);

  const playSound = useCallback(async () => {
    if (!audioRef.current) return;
    audioRef.current.init();
    await audioRef.current.ready();
    
    // Generate two notes - same or different
    const isSame = Math.random() > 0.5;
    const firstNote = 55 + Math.floor(Math.random() * 15);
    const secondNote = isSame ? firstNote : firstNote + (Math.random() > 0.5 ? 4 : -4);
    
    setNote1(firstNote);
    setNote2(secondNote);
    setCurrentQuestion(isSame ? "same" : "different");
    setAnswered(false);
    setHasPlayed(true);
    
    // Play first note
    audioRef.current.playNote(firstNote, 0.8, 0.9);
    
    // Play second note after delay
    setTimeout(() => {
      audioRef.current?.playNote(secondNote, 0.8, 0.9);
    }, 1000);
  }, []);

  const replaySound = useCallback(() => {
    if (!audioRef.current || !hasPlayed) return;
    audioRef.current.playNote(note1, 0.8, 0.9);
    setTimeout(() => {
      audioRef.current?.playNote(note2, 0.8, 0.9);
    }, 1000);
  }, [hasPlayed, note1, note2]);

  const handleAnswer = useCallback((answer: "same" | "different") => {
    if (!currentQuestion || answered) return;
    
    setAnswered(true);
    const correct = answer === currentQuestion;
    setIsCorrect(correct);
    
    if (correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
      if (streak >= 2) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2000);
      }
      audioRef.current?.playCorrect();
    } else {
      setStreak(0);
      audioRef.current?.playIncorrect();
    }
  }, [currentQuestion, answered, streak]);

  const handleNext = useCallback(() => {
    setAnswered(false);
    setCurrentQuestion(null);
    setHasPlayed(false);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-200 via-purple-100 to-white flex flex-col items-center">
      <CelebrationAnimation show={showCelebration} />
      
      {/* Header */}
      <div className="w-full p-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-3xl"
        >
          🏠
        </button>
        <div className="flex items-center gap-2 bg-white rounded-full px-6 py-3 shadow-lg">
          <span className="text-3xl">⭐</span>
          <span className="text-3xl font-bold text-purple-500">{score}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-8">
        {/* Title */}
        <div className="text-center">
          <div className="text-8xl mb-4">
            <span>🐻</span>
            <span className="mx-4">🐻</span>
          </div>
          <h2 className="text-4xl font-bold text-purple-600">
            Same or Different?
          </h2>
        </div>

        {/* Play button or answer feedback */}
        {!hasPlayed ? (
          <BigButton
            onClick={playSound}
            color="from-purple-400 to-violet-500"
            size="huge"
          >
            🎵
          </BigButton>
        ) : answered ? (
          <div className="text-center animate-bounce-in">
            <span className="text-9xl block">
              {isCorrect ? "🎉" : "💪"}
            </span>
            <p className="text-4xl font-bold mt-4">
              {isCorrect ? "Yay!" : "Good try!"}
            </p>
            <p className="text-2xl text-zinc-500 mt-2">
              They were {currentQuestion}!
            </p>
            <button
              onClick={handleNext}
              className="mt-8 px-12 py-6 bg-gradient-to-r from-purple-400 to-pink-500 text-white text-3xl font-bold rounded-full shadow-lg hover:scale-105 transition-transform"
            >
              Next! →
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <button
              onClick={replaySound}
              className="text-2xl text-purple-500 underline"
            >
              🔊 Hear again
            </button>
            
            {/* Answer buttons */}
            <div className="flex gap-8">
              {/* Same button - matching bears */}
              <div className="flex flex-col items-center gap-2">
                <BigButton
                  onClick={() => handleAnswer("same")}
                  color="from-green-400 to-emerald-500"
                  size="large"
                >
                  <div className="flex items-center">
                    <span className="text-4xl">🐻</span>
                    <span className="text-3xl">=</span>
                    <span className="text-4xl">🐻</span>
                  </div>
                </BigButton>
                <span className="text-2xl font-bold text-green-600">SAME</span>
              </div>

              {/* Different button - different animals */}
              <div className="flex flex-col items-center gap-2">
                <BigButton
                  onClick={() => handleAnswer("different")}
                  color="from-orange-400 to-red-500"
                  size="large"
                >
                  <div className="flex items-center">
                    <span className="text-4xl">🐻</span>
                    <span className="text-3xl">≠</span>
                    <span className="text-4xl">🐰</span>
                  </div>
                </BigButton>
                <span className="text-2xl font-bold text-orange-600">DIFFERENT</span>
              </div>
            </div>
          </div>
        )}

        {/* Streak indicator */}
        {streak > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: Math.min(streak, 5) }).map((_, i) => (
              <span key={i} className="text-4xl animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}>
                ⭐
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Pattern Following Game - simple melodic patterns with colors
function PatternGame({ onBack }: { onBack: () => void }) {
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [pattern, setPattern] = useState<number[]>([]);
  const [playerPattern, setPlayerPattern] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [gameState, setGameState] = useState<"waiting" | "listening" | "playing" | "result">("waiting");
  const [isCorrect, setIsCorrect] = useState(false);
  const audioRef = useRef<ReturnType<typeof getAudioEngine> | null>(null);

  // 4 colored buttons with notes
  const BUTTONS = [
    { note: 60, color: "from-red-400 to-red-500", label: "🔴" },
    { note: 64, color: "from-yellow-400 to-yellow-500", label: "🟡" },
    { note: 67, color: "from-green-400 to-green-500", label: "🟢" },
    { note: 72, color: "from-blue-400 to-blue-500", label: "🔵" },
  ];

  useEffect(() => {
    audioRef.current = getAudioEngine();
  }, []);

  const generatePattern = useCallback(() => {
    // Start with 2 notes, increase as score goes up
    const length = Math.min(2 + Math.floor(score / 3), 4);
    const newPattern: number[] = [];
    for (let i = 0; i < length; i++) {
      newPattern.push(Math.floor(Math.random() * 4));
    }
    return newPattern;
  }, [score]);

  const playPattern = useCallback(async (patternToPlay: number[]) => {
    if (!audioRef.current) return;
    audioRef.current.init();
    await audioRef.current.ready();
    
    setIsPlaying(true);
    setGameState("listening");
    
    for (let i = 0; i < patternToPlay.length; i++) {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          const buttonIndex = patternToPlay[i];
          setActiveIndex(buttonIndex);
          audioRef.current?.playNote(BUTTONS[buttonIndex].note, 0.6, 0.9);
          
          setTimeout(() => {
            setActiveIndex(null);
            resolve();
          }, 400);
        }, i * 700);
      });
    }
    
    setIsPlaying(false);
    setGameState("playing");
    setPlayerPattern([]);
  }, [BUTTONS]);

  const startGame = useCallback(() => {
    const newPattern = generatePattern();
    setPattern(newPattern);
    setPlayerPattern([]);
    playPattern(newPattern);
  }, [generatePattern, playPattern]);

  const handleButtonPress = useCallback((index: number) => {
    if (gameState !== "playing" || isPlaying) return;
    
    audioRef.current?.playNote(BUTTONS[index].note, 0.4, 0.9);
    
    const newPlayerPattern = [...playerPattern, index];
    setPlayerPattern(newPlayerPattern);
    
    // Check if this press is correct so far
    if (newPlayerPattern[newPlayerPattern.length - 1] !== pattern[newPlayerPattern.length - 1]) {
      // Wrong!
      setIsCorrect(false);
      setGameState("result");
      setStreak(0);
      audioRef.current?.playIncorrect();
      return;
    }
    
    // Check if pattern is complete
    if (newPlayerPattern.length === pattern.length) {
      // Correct!
      setIsCorrect(true);
      setGameState("result");
      setScore(s => s + 1);
      setStreak(s => s + 1);
      if (streak >= 2) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2000);
      }
      audioRef.current?.playCorrect();
    }
  }, [gameState, isPlaying, playerPattern, pattern, streak, BUTTONS]);

  const handleNext = useCallback(() => {
    setGameState("waiting");
    setPattern([]);
    setPlayerPattern([]);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 via-amber-100 to-white flex flex-col items-center">
      <CelebrationAnimation show={showCelebration} />
      
      {/* Header */}
      <div className="w-full p-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-3xl"
        >
          🏠
        </button>
        <div className="flex items-center gap-2 bg-white rounded-full px-6 py-3 shadow-lg">
          <span className="text-3xl">⭐</span>
          <span className="text-3xl font-bold text-amber-500">{score}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        {/* Title */}
        <div className="text-center">
          <span className="text-7xl block mb-2">🎨</span>
          <h2 className="text-4xl font-bold text-amber-600">
            Copy the Colors!
          </h2>
          <p className="text-xl text-amber-500 mt-2">
            {gameState === "waiting" && "Press play to start!"}
            {gameState === "listening" && "Watch and listen..."}
            {gameState === "playing" && "Your turn!"}
          </p>
        </div>

        {/* Color buttons grid */}
        <div className="grid grid-cols-2 gap-4">
          {BUTTONS.map((button, index) => (
            <button
              key={index}
              onClick={() => handleButtonPress(index)}
              disabled={gameState !== "playing"}
              className={`
                w-28 h-28 rounded-2xl
                bg-gradient-to-br ${button.color}
                shadow-lg
                transform transition-all duration-100
                ${activeIndex === index ? "scale-110 brightness-125" : ""}
                ${gameState === "playing" ? "hover:scale-105 active:scale-95" : ""}
                disabled:opacity-70
                flex items-center justify-center
                text-5xl
                border-4 border-white/50
              `}
            >
              {button.label}
            </button>
          ))}
        </div>

        {/* Progress dots for player pattern */}
        {gameState === "playing" && pattern.length > 0 && (
          <div className="flex gap-3 mt-4">
            {pattern.map((_, i) => (
              <div
                key={i}
                className={`
                  w-6 h-6 rounded-full
                  ${i < playerPattern.length 
                    ? "bg-green-500 scale-110" 
                    : "bg-zinc-300"
                  }
                  transition-all
                `}
              />
            ))}
          </div>
        )}

        {/* Play button or result */}
        {gameState === "waiting" && (
          <BigButton
            onClick={startGame}
            color="from-green-400 to-emerald-500"
            size="large"
          >
            ▶️
          </BigButton>
        )}

        {gameState === "result" && (
          <div className="text-center animate-bounce-in">
            <span className="text-8xl block">
              {isCorrect ? "🎉" : "💪"}
            </span>
            <p className="text-3xl font-bold mt-4">
              {isCorrect ? "Perfect!" : "Almost!"}
            </p>
            <button
              onClick={handleNext}
              className="mt-6 px-10 py-5 bg-gradient-to-r from-purple-400 to-pink-500 text-white text-2xl font-bold rounded-full shadow-lg hover:scale-105 transition-transform"
            >
              Again! →
            </button>
          </div>
        )}

        {/* Streak indicator */}
        {streak > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: Math.min(streak, 5) }).map((_, i) => (
              <span key={i} className="text-4xl animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}>
                ⭐
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Animal Sounds Game - match sounds to animals (not musical but fun)
function AnimalSoundsGame({ onBack }: { onBack: () => void }) {
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [targetAnimal, setTargetAnimal] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const audioRef = useRef<ReturnType<typeof getAudioEngine> | null>(null);

  // Animals with their "musical" representation
  const ANIMAL_SOUNDS = [
    { name: "Bird", emoji: "🐦", notes: [72, 76, 72], color: "from-sky-400 to-sky-500" },
    { name: "Frog", emoji: "🐸", notes: [55, 55, 55], color: "from-green-400 to-green-500" },
    { name: "Cat", emoji: "🐱", notes: [65, 67, 69, 67], color: "from-orange-400 to-orange-500" },
    { name: "Dog", emoji: "🐕", notes: [52, 52], color: "from-amber-400 to-amber-500" },
  ];

  useEffect(() => {
    audioRef.current = getAudioEngine();
  }, []);

  const playAnimalSound = useCallback(async (animalIndex: number) => {
    if (!audioRef.current) return;
    audioRef.current.init();
    await audioRef.current.ready();
    
    const animal = ANIMAL_SOUNDS[animalIndex];
    animal.notes.forEach((note, i) => {
      setTimeout(() => {
        audioRef.current?.playNote(note, 0.3, 0.9);
      }, i * 200);
    });
  }, [ANIMAL_SOUNDS]);

  const startQuestion = useCallback(async () => {
    if (!audioRef.current) return;
    
    const randomAnimal = Math.floor(Math.random() * ANIMAL_SOUNDS.length);
    setTargetAnimal(randomAnimal);
    setAnswered(false);
    setHasPlayed(true);
    
    await playAnimalSound(randomAnimal);
  }, [playAnimalSound, ANIMAL_SOUNDS]);

  const handleAnswer = useCallback((animalIndex: number) => {
    if (targetAnimal === null || answered) return;
    
    setAnswered(true);
    const correct = animalIndex === targetAnimal;
    setIsCorrect(correct);
    
    if (correct) {
      setScore(s => s + 1);
      setStreak(s => s + 1);
      if (streak >= 2) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2000);
      }
      audioRef.current?.playCorrect();
    } else {
      setStreak(0);
      audioRef.current?.playIncorrect();
    }
  }, [targetAnimal, answered, streak]);

  const handleNext = useCallback(() => {
    setAnswered(false);
    setTargetAnimal(null);
    setHasPlayed(false);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-200 via-green-100 to-white flex flex-col items-center">
      <CelebrationAnimation show={showCelebration} />
      
      {/* Header */}
      <div className="w-full p-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-3xl"
        >
          🏠
        </button>
        <div className="flex items-center gap-2 bg-white rounded-full px-6 py-3 shadow-lg">
          <span className="text-3xl">⭐</span>
          <span className="text-3xl font-bold text-green-500">{score}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
        {/* Title */}
        <div className="text-center">
          <h2 className="text-4xl font-bold text-green-600">
            Who Made That Sound?
          </h2>
        </div>

        {/* Play button or result */}
        {!hasPlayed ? (
          <BigButton
            onClick={startQuestion}
            color="from-green-400 to-emerald-500"
            size="huge"
          >
            🎵
          </BigButton>
        ) : answered ? (
          <div className="text-center animate-bounce-in">
            <span className="text-9xl block">
              {isCorrect ? ANIMAL_SOUNDS[targetAnimal!].emoji : "💪"}
            </span>
            <p className="text-4xl font-bold mt-4">
              {isCorrect ? "Yay!" : "Almost!"}
            </p>
            {!isCorrect && targetAnimal !== null && (
              <p className="text-2xl text-zinc-500 mt-2">
                It was the {ANIMAL_SOUNDS[targetAnimal].name}! {ANIMAL_SOUNDS[targetAnimal].emoji}
              </p>
            )}
            <button
              onClick={handleNext}
              className="mt-6 px-10 py-5 bg-gradient-to-r from-purple-400 to-pink-500 text-white text-2xl font-bold rounded-full shadow-lg hover:scale-105 transition-transform"
            >
              Again! →
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <button
              onClick={() => targetAnimal !== null && playAnimalSound(targetAnimal)}
              className="text-2xl text-green-500 underline"
            >
              🔊 Hear again
            </button>
            
            {/* Animal buttons */}
            <div className="grid grid-cols-2 gap-6">
              {ANIMAL_SOUNDS.map((animal, index) => (
                <BigButton
                  key={index}
                  onClick={() => handleAnswer(index)}
                  color={animal.color}
                  size="large"
                >
                  {animal.emoji}
                </BigButton>
              ))}
            </div>
          </div>
        )}

        {/* Streak indicator */}
        {streak > 0 && (
          <div className="flex gap-2">
            {Array.from({ length: Math.min(streak, 5) }).map((_, i) => (
              <span key={i} className="text-4xl animate-bounce" style={{ animationDelay: `${i * 0.1}s` }}>
                ⭐
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Main Kids Page Component
export default function KidsPage() {
  const [activity, setActivity] = useState<Activity>("home");

  const handleBack = useCallback(() => {
    setActivity("home");
  }, []);

  if (activity === "high-low") {
    return <HighLowGame onBack={handleBack} />;
  }

  if (activity === "same-different") {
    return <SameDifferentGame onBack={handleBack} />;
  }

  if (activity === "follow-pattern") {
    return <PatternGame onBack={handleBack} />;
  }

  if (activity === "animal-sounds") {
    return <AnimalSoundsGame onBack={handleBack} />;
  }

  // Home screen
  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-200 via-purple-100 to-sky-100 flex flex-col items-center">
      {/* Back to main app link (for parents) */}
      <a
        href="/"
        className="absolute top-4 left-4 w-12 h-12 rounded-full bg-white/50 flex items-center justify-center text-xl hover:bg-white transition-colors"
      >
        👤
      </a>

      {/* Welcome */}
      <div className="pt-16 pb-8 text-center">
        <div className="text-8xl mb-4 animate-bounce-slow">
          {ANIMALS[Math.floor(Date.now() / 10000) % ANIMALS.length].emoji}
        </div>
        <h1 className="text-5xl font-bold text-purple-600 mb-2">
          Let&apos;s Play Music!
        </h1>
        <p className="text-2xl text-purple-400">
          Choose a game! 🎵
        </p>
      </div>

      {/* Activity selection - big colorful buttons */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 w-full max-w-md">
        {/* High/Low - fundamental pitch concept */}
        <button
          onClick={() => setActivity("high-low")}
          className="w-full p-6 rounded-3xl bg-gradient-to-r from-sky-400 to-blue-500 shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center gap-4"
        >
          <span className="text-6xl">🐦⬆️</span>
          <div className="text-left">
            <span className="block text-3xl font-bold text-white">High or Low?</span>
            <span className="block text-lg text-white/80">Is the sound high like a bird?</span>
          </div>
        </button>

        {/* Same/Different - comparing sounds */}
        <button
          onClick={() => setActivity("same-different")}
          className="w-full p-6 rounded-3xl bg-gradient-to-r from-purple-400 to-pink-500 shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center gap-4"
        >
          <span className="text-6xl">🐻🐻</span>
          <div className="text-left">
            <span className="block text-3xl font-bold text-white">Same or Different?</span>
            <span className="block text-lg text-white/80">Do they sound the same?</span>
          </div>
        </button>

        {/* Pattern Following - simple memory/pattern game */}
        <button
          onClick={() => setActivity("follow-pattern")}
          className="w-full p-6 rounded-3xl bg-gradient-to-r from-amber-400 to-orange-500 shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center gap-4"
        >
          <span className="text-6xl">🎨</span>
          <div className="text-left">
            <span className="block text-3xl font-bold text-white">Copy the Colors!</span>
            <span className="block text-lg text-white/80">Watch and repeat!</span>
          </div>
        </button>

        {/* Animal Sounds - fun sound recognition */}
        <button
          onClick={() => setActivity("animal-sounds")}
          className="w-full p-6 rounded-3xl bg-gradient-to-r from-green-400 to-emerald-500 shadow-xl hover:scale-105 active:scale-95 transition-transform flex items-center gap-4"
        >
          <span className="text-6xl">🐸🐱</span>
          <div className="text-left">
            <span className="block text-3xl font-bold text-white">Animal Sounds!</span>
            <span className="block text-lg text-white/80">Who made that sound?</span>
          </div>
        </button>
      </div>

      {/* Footer with dancing animals */}
      <div className="p-8 flex gap-4">
        {ANIMALS.map((animal, i) => (
          <span
            key={i}
            className="text-4xl animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          >
            {animal.emoji}
          </span>
        ))}
      </div>
    </div>
  );
}
