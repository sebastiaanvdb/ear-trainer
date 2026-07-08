export interface BachMelody {
  id: string;
  title: string;
  catalog: string; // BWV, HWV, RV, Z, Op., etc.
  key: string;
  difficulty: 1 | 2 | 3;
  composer?: string; // defaults to "J.S. Bach" when omitted
  /** Notes per bar as encoded — drives the rhythm-aware chunk sizes. */
  notesPerBar: number;
  notes: number[]; // MIDI note numbers, consecutive pairs form the intervals
}

export const BACH_MELODIES: BachMelody[] = [
  // ── J.S. Bach ─────────────────────────────────────────────────────────────
  {
    id: "minuet-g",
    title: "Minuet in G",
    catalog: "BWV Anh. 114",
    key: "G Major",
    difficulty: 1,
    notesPerBar: 4, // 3/4, quarter-note melody
    notes: [
      67, 69, 71, 72, 74, 67, 67,
      62, 64, 66, 67, 69, 71, 67,
      76, 76, 74, 72, 71, 72, 74, 67, 67,
    ],
  },
  {
    id: "minuet-gminor",
    title: "Minuet in G minor",
    catalog: "BWV Anh. 115",
    key: "G minor",
    difficulty: 1,
    notesPerBar: 4, // 3/4, quarter-note melody
    notes: [
      67, 65, 63, 62, 63, 65, 67, 67,
      62, 58, 60, 62, 63, 65, 67, 63, 65, 62,
      67, 65, 63, 62, 60, 62, 63, 65, 67,
    ],
  },
  {
    id: "musette",
    title: "Musette in D",
    catalog: "BWV Anh. 126",
    key: "D Major",
    difficulty: 1,
    notesPerBar: 6, // 4/4 with eighth-note ornaments
    notes: [
      62, 64, 66, 67, 66, 64, 62, 66, 64, 62, 61, 62, 64,
      57, 59, 61, 62, 64, 66, 67, 66, 64, 62, 66, 69,
    ],
  },
  {
    id: "invention1",
    title: "Invention No. 1",
    catalog: "BWV 772",
    key: "C Major",
    difficulty: 2,
    notesPerBar: 8, // 4/4, continuous 16th notes — 8 per half-bar
    notes: [
      60, 62, 64, 65, 64, 62, 60, 64,
      62, 60, 59, 60, 62, 55, 60, 64,
      65, 62, 64, 60, 62, 59, 60, 57,
      59, 55, 57, 53, 55, 52, 53, 50,
    ],
  },
  {
    id: "jesu-joy",
    title: "Jesu, Joy of Man's Desiring",
    catalog: "BWV 147",
    key: "G Major",
    difficulty: 2,
    notesPerBar: 9, // 9/8 — three groups of three eighth notes
    notes: [
      67, 69, 67, 64, 67, 69, 72, 71, 69,
      72, 74, 72, 71, 69, 67, 69, 71,
      72, 74, 76, 74, 72, 71,
      72, 74, 79, 76, 74, 72,
    ],
  },
  {
    id: "bourree",
    title: "Bourrée in E minor",
    catalog: "BWV 996",
    key: "E minor",
    difficulty: 2,
    notesPerBar: 8, // 4/4 cut time, eighth notes
    notes: [
      64, 66, 67, 69, 67, 66, 64, 67,
      66, 64, 62, 64, 66, 59, 64, 67,
      66, 64, 66, 62, 64, 66, 67, 69, 71, 67, 69,
    ],
  },
  {
    id: "air",
    title: "Air on the G String",
    catalog: "BWV 1068",
    key: "D Major",
    difficulty: 2,
    notesPerBar: 8, // 4/4, slow — many passing tones fill each bar
    notes: [
      74, 73, 74, 71, 69, 67, 66, 67, 69,
      74, 73, 71, 69, 71, 73, 74,
      76, 74, 73, 71, 69, 68, 66, 68, 69, 71,
      73, 71, 69, 68, 66, 64, 66, 68, 69,
    ],
  },
  {
    id: "polonaise-gmin",
    title: "Polonaise in G minor",
    catalog: "BWV Anh. 119",
    key: "G minor",
    difficulty: 2,
    notesPerBar: 6, // 3/4, eighth notes
    notes: [
      67, 62, 63, 62, 67, 62, 58, 60, 62,
      63, 62, 60, 58, 57, 58, 60, 62,
      65, 67, 70, 67, 65, 63, 62, 60, 62, 63, 65, 67,
    ],
  },
  {
    id: "little-fugue",
    title: "Little Fugue — subject",
    catalog: "BWV 578",
    key: "G minor",
    difficulty: 3,
    notesPerBar: 8, // 4/4, quarter and eighth notes
    notes: [
      67, 65, 63, 62, 60, 62, 63, 62, 60, 58, 57, 58, 55,
      62, 60, 58, 57, 55, 57, 58, 57, 55, 53, 52, 53, 50,
    ],
  },
  {
    id: "invention13",
    title: "Invention No. 13",
    catalog: "BWV 784",
    key: "A minor",
    difficulty: 3,
    notesPerBar: 8, // 4/4, 16th-note runs
    notes: [
      69, 72, 71, 69, 68, 69,
      72, 71, 69, 68, 69,
      64, 65, 67, 68, 69, 68, 67, 65, 64,
      62, 64, 65, 67, 68, 69, 71, 72,
    ],
  },
  {
    id: "fugue-cmin",
    title: "Fugue in C minor — subject",
    catalog: "BWV 847",
    key: "C minor",
    difficulty: 3,
    notesPerBar: 10, // 4/4, chromatic 16th-note subject spans ~2 bars
    notes: [
      67, 67, 60, 62, 63, 62, 60, 62, 63, 65, 67, 68, 67, 65, 63, 62, 60, 59, 60,
      62, 62, 55, 57, 58, 57, 55, 57, 58, 60, 62, 63, 62, 60, 58, 57, 55, 54, 55,
    ],
  },
  {
    id: "chaconne",
    title: "Chaconne — violin melody",
    catalog: "BWV 1004",
    key: "D minor",
    difficulty: 3,
    notesPerBar: 6, // 3/4
    notes: [
      62, 65, 69, 74, 73, 74, 76, 77,
      76, 74, 72, 70, 69, 67, 65, 64, 62,
      65, 69, 72, 71, 70, 69, 67, 65, 64, 62,
      60, 62, 65, 67, 69, 70, 72, 74,
    ],
  },
  {
    id: "toccata",
    title: "Toccata in D minor — opening",
    catalog: "BWV 565",
    key: "D minor",
    difficulty: 3,
    notesPerBar: 8, // 4/4
    notes: [
      69, 74, 72, 70, 69, 67, 65, 63, 62, 60, 59, 60,
      67, 62, 65, 64, 62, 65, 64, 62, 60, 62,
      69, 67, 65, 64, 62, 65, 63, 62,
    ],
  },

  // ── G.F. Handel ───────────────────────────────────────────────────────────
  {
    id: "handel-glory",
    title: "And the Glory of the Lord",
    catalog: "HWV 56",
    key: "A Major",
    composer: "G.F. Handel",
    difficulty: 2,
    notesPerBar: 8, // 4/4
    notes: [
      69, 71, 73, 76, 74, 73, 71, 73, 74, 76, 78, 76, 74, 73, 74, 71, 69,
      73, 74, 76, 74, 73, 71, 69, 71, 73, 74, 73, 71, 69, 66, 69,
    ],
  },
  {
    id: "handel-hornpipe",
    title: "Water Music — Hornpipe",
    catalog: "HWV 348",
    key: "D Major",
    composer: "G.F. Handel",
    difficulty: 2,
    notesPerBar: 6, // 3/4 dance
    notes: [
      62, 66, 69, 74, 73, 71, 69, 66, 64, 62,
      66, 69, 71, 69, 66, 62, 64, 66, 69, 71, 74,
      73, 71, 69, 71, 74, 71, 69, 66, 64, 62,
    ],
  },
  {
    id: "handel-sarabande",
    title: "Sarabande",
    catalog: "HWV 437",
    key: "D minor",
    composer: "G.F. Handel",
    difficulty: 3,
    notesPerBar: 6, // 3/2, slow and expressive
    notes: [
      62, 69, 67, 65, 64, 62, 65, 64, 62, 60, 59,
      60, 67, 65, 64, 62, 65, 63, 62, 60, 58, 57,
      60, 62, 65, 67, 69, 70, 69, 67, 65, 64, 62,
    ],
  },

  // ── A. Vivaldi ────────────────────────────────────────────────────────────
  {
    id: "vivaldi-spring",
    title: "The Four Seasons — Spring",
    catalog: "RV 269",
    key: "E Major",
    composer: "A. Vivaldi",
    difficulty: 2,
    notesPerBar: 8, // 4/4, 16th-note violin writing
    notes: [
      71, 69, 68, 66, 64, 66, 68, 69, 71,
      76, 75, 73, 71, 73, 76, 73, 71, 69, 68, 66, 64,
      68, 69, 71, 73, 76, 73, 71, 69,
    ],
  },
  {
    id: "vivaldi-winter",
    title: "The Four Seasons — Winter",
    catalog: "RV 297",
    key: "F minor",
    composer: "A. Vivaldi",
    difficulty: 3,
    notesPerBar: 8, // 4/4, driven 16th-note writing
    notes: [
      72, 77, 75, 73, 72, 70, 68, 67, 65,
      68, 70, 72, 73, 75, 77, 79, 77, 75, 73, 72, 70, 68, 67, 65,
      68, 72, 75, 72, 70, 68, 65, 68, 70, 72,
    ],
  },

  // ── H. Purcell ────────────────────────────────────────────────────────────
  {
    id: "purcell-dido",
    title: "Dido's Lament",
    catalog: "Z.626",
    key: "G minor",
    composer: "H. Purcell",
    difficulty: 3,
    notesPerBar: 6, // 3/2 ground bass, soprano has ~6 notes per bar
    notes: [
      67, 67, 70, 69, 67, 65, 64, 62,
      60, 59, 60, 62, 65, 64, 62, 60, 59,
      67, 67, 70, 69, 67, 65, 64, 62, 60, 59, 67,
    ],
  },

  // ── A. Corelli ────────────────────────────────────────────────────────────
  {
    id: "corelli-pastorale",
    title: "Christmas Concerto — Pastorale",
    catalog: "Op. 6 No. 8",
    key: "G Major",
    composer: "A. Corelli",
    difficulty: 1,
    notesPerBar: 6, // 12/8, two dotted-quarter beats of triplets per bar
    notes: [
      67, 71, 69, 71, 74, 71, 69, 67,
      71, 74, 72, 71, 69, 67, 69, 71, 74,
      74, 72, 71, 69, 71, 74, 72, 71, 69, 67,
    ],
  },
];
