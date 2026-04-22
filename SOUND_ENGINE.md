# Piano Sound Engine - Enhanced Synthesis

## Overview

The sound engine uses **additive synthesis with sine waves** to create realistic piano sounds. This is optimal for ear training because:

1. **Pure tones** - Perfect for training pitch perception
2. **Lightweight** - No audio samples to load
3. **Consistent** - Same tone quality across all notes
4. **Realistic** - Multiple harmonics create natural piano timbre

## How It Works

### Additive Synthesis
Instead of using a single sine wave, we layer multiple sine waves (harmonics) at different frequencies and amplitudes to create a rich, piano-like sound.

### Three Different Tone Types

#### 1. Rich Tone (for single notes and melodies)
- **8 harmonics** - Full, rich sound
- **Inharmonicity** - Slight detuning of higher harmonics (real piano strings aren't perfectly harmonic)
- **Velocity sensitivity** - Louder notes are relatively brighter
- **Natural decay** - Higher harmonics decay faster (like a real piano)
- **Attack noise** - Simulates hammer striking strings

```typescript
Harmonics: 1x (fundamental), 2x, 3x, 4x, 5x, 6x, 7x, 8x
Amplitudes: 1.0, 0.6, 0.4, 0.25, 0.15, 0.1, 0.06, 0.04
```

#### 2. Simple Tone (for chords)
- **5 harmonics** - Cleaner blend when playing multiple notes together
- **Reduced harmonics** - Prevents muddiness in chords
- **Balanced decay** - Even decay across all harmonics

```typescript
Harmonics: 1x, 2x, 3x, 4x, 5x
Amplitudes: 1.0, 0.5, 0.3, 0.15, 0.08
```

#### 3. Sustained Tone (for live keyboard)
- **6 harmonics** - Good balance for held notes
- **Velocity-sensitive brightness** - Dynamic response
- **Smooth attack/release** - Natural feeling when playing

```typescript
Harmonics: 1x, 2x, 3x, 4x, 5x, 6x
Amplitudes: 1.0, 0.5, 0.3, 0.2, 0.12, 0.08
```

## Key Features

### Inharmonicity
Real piano strings vibrate with slight inharmonicity (they're not perfectly elastic). We simulate this:

```typescript
const inharmonicity = 1 + (index * 0.0004 * index);
frequency = baseFrequency * harmonicRatio * inharmonicity;
```

This makes higher harmonics slightly sharper, creating a more realistic timbre.

### ADSR Envelope
All tones use Attack-Decay-Sustain-Release envelopes:

- **Attack**: 3-5ms (very fast, like hammer strike)
- **Decay**: 100-150ms (natural decay to sustain level)
- **Sustain**: 60-65% of peak (held tone level)
- **Release**: 150-200ms (tail when note ends)

### Velocity Sensitivity
- **Volume**: Higher velocity = louder notes
- **Brightness**: Higher velocity = relatively more high harmonics
- **Dynamics**: Creates expressive, musical sound

### Attack Noise
The rich tone includes a short burst of filtered noise to simulate the hammer hitting the strings:

```typescript
// Exponentially decaying noise
noise = random() * exp(-time / 6ms)
// Filtered around 3x fundamental frequency
```

This adds realism and makes the attack more percussive.

## Why Sine Waves?

Sine waves are the **purest** form of sound - they contain only one frequency. By combining multiple sine waves at harmonic ratios (1x, 2x, 3x, etc.), we can create any timbre through **Fourier synthesis**.

Benefits for ear training:
- **Clean pitch** - No artifacts or noise
- **Predictable** - Same timbre across all registers
- **Educational** - Pure tones are easier to hear and analyze
- **Efficient** - Fast, no loading times

## Improvements Made

### Before
- 4 harmonics for chords
- 6 harmonics for melodies
- Simple linear amplitude decay
- Fixed brightness regardless of velocity

### After
- 5 harmonics for chords (better clarity)
- 8 harmonics for melodies (fuller sound)
- Natural harmonic decay (higher partials fade faster)
- Velocity-sensitive brightness (dynamic response)
- Realistic inharmonicity (piano-like tuning)
- Enhanced attack noise (percussive realism)
- Improved envelope shapes (natural piano behavior)

## Technical Details

### Harmonic Series
A piano's sound is composed of:
1. **Fundamental** (1x) - The perceived pitch
2. **Octave** (2x) - Adds fullness
3. **12th** (3x) - Perfect 5th + octave, adds warmth
4. **Double octave** (4x) - Adds clarity
5. **17th** (5x) - Major 3rd + 2 octaves, adds brightness
6. **19th** (6x) - Perfect 5th + 2 octaves
7. **21st** (7x) - Minor 7th + 2 octaves
8. **Triple octave** (8x) - Adds sparkle

### Why Not Use Piano Samples?

Piano samples would be more realistic, but have drawbacks:
- **File size** - 88 keys × multiple velocity layers = large download
- **Loading time** - Must load before use
- **Inconsistency** - Samples vary in quality and tuning
- **Not ideal for training** - May contain artifacts or noise

Synthesized sine waves are:
- **Instant** - No loading required
- **Perfect** - Mathematically precise pitches
- **Lightweight** - Just code, no assets
- **Flexible** - Easy to adjust timbre

## Result

The improved sound engine now produces:
- ✅ Realistic piano timbre
- ✅ Velocity-sensitive dynamics
- ✅ Natural decay characteristics
- ✅ Clean, educational tone quality
- ✅ Excellent chord clarity
- ✅ Rich melodic sound

Perfect for ear training! 🎹🎵
