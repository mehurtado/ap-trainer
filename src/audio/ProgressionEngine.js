import { CHROMAS } from './constants.js';
import { audioEngine } from './AudioEngine.js';

// Semitone offsets from the tonic for each scale degree (0-indexed).
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

// Semitone offsets from a chord's own root, by quality.
export const QUALITIES = {
  m7:       [0, 3, 7, 10],
  m9:       [0, 3, 7, 10, 14],
  maj7:     [0, 4, 7, 11],
  maj9:     [0, 4, 7, 11, 14],
  dom7:     [0, 4, 7, 10],
  dom9:     [0, 4, 7, 10, 14],
  halfDim7: [0, 3, 6, 10],   // m7♭5 / ø7
  dom7b5:   [0, 4, 6, 10],   // altered dominant
};

// A fixed set of 4 major + 4 minor progressions (curated, not randomly
// generated) so every trial is a recognizable, idiomatic progression rather
// than an arbitrary scale-degree walk. Each chord is { degree, quality }:
// `degree` (1-indexed) picks the chord root off the key's scale; `quality`
// is normally the plain diatonic 7th chord built on that degree, but two
// entries deliberately override it with a chromatic/altered quality for the
// jazz ii–V sound — those are commented at the point of use.
const MAJOR_PROGRESSIONS = [
  // I gains a 9th, V a 9th — "Axis" progression, jazzed.
  [{ degree: 1, quality: 'maj9' }, { degree: 5, quality: 'dom9' }, { degree: 6, quality: 'm7' }, { degree: 4, quality: 'maj7' }, { degree: 1, quality: 'maj7' }],
  // "50s progression" / doo-wop, jazzed.
  [{ degree: 1, quality: 'maj7' }, { degree: 6, quality: 'm9' }, { degree: 4, quality: 'maj7' }, { degree: 5, quality: 'dom7' }, { degree: 1, quality: 'maj7' }],
  // Plain authentic cadence — unaltered anchor progression.
  [{ degree: 1, quality: 'maj7' }, { degree: 4, quality: 'maj7' }, { degree: 5, quality: 'dom7' }, { degree: 1, quality: 'maj7' }],
  // "Autumn Leaves"-style turnaround: viiø7 (=ii of the relative minor) into
  // V7♭5/vi (secondary dominant of vi — root shares degree 3's pitch, but
  // it's functioning as an altered V/vi, not a plain iii chord; the raised
  // 3rd and flat 5 make this chromatic, not diatonic), resolving to vi
  // before the ii–V–I turnaround back to the true tonic.
  [{ degree: 1, quality: 'maj7' }, { degree: 7, quality: 'halfDim7' }, { degree: 3, quality: 'dom7b5' }, { degree: 6, quality: 'm7' }, { degree: 2, quality: 'm7' }, { degree: 5, quality: 'dom9' }, { degree: 1, quality: 'maj7' }],
];

const MINOR_PROGRESSIONS = [
  // All diatonic to natural minor — no borrowed/altered tones.
  [{ degree: 1, quality: 'm7' }, { degree: 6, quality: 'maj7' }, { degree: 3, quality: 'maj7' }, { degree: 7, quality: 'dom9' }, { degree: 1, quality: 'm7' }],
  // Textbook minor ii–V–i. Natural minor's v is diatonically minor (m7);
  // making it a dominant with a ♭5 requires raising the 3rd (borrowed from
  // harmonic minor) and flatting the 5th — both chromatic, by design.
  [{ degree: 1, quality: 'm9' }, { degree: 2, quality: 'halfDim7' }, { degree: 5, quality: 'dom7b5' }, { degree: 1, quality: 'm7' }],
  // All diatonic to natural minor.
  [{ degree: 1, quality: 'm7' }, { degree: 7, quality: 'dom9' }, { degree: 6, quality: 'maj7' }, { degree: 7, quality: 'dom9' }, { degree: 1, quality: 'm7' }],
  // All diatonic to natural minor.
  [{ degree: 1, quality: 'm7' }, { degree: 4, quality: 'm7' }, { degree: 7, quality: 'dom9' }, { degree: 3, quality: 'maj9' }, { degree: 1, quality: 'm7' }],
];

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Build the chord tones (chromas) for one { degree, quality } entry in a key.
export function buildChord(tonicIdx, scale, entry) {
  const root = (tonicIdx + scale[(entry.degree - 1) % 7]) % 12;
  return QUALITIES[entry.quality].map(interval => CHROMAS[(root + interval) % 12]);
}

// Generates a chord-progression trial by picking one of the fixed major or
// minor progressions and transposing it to a tonic drawn from `activeNotes`
// (the level's unlocked set). Quality (major/minor) is mixed in without
// affecting the answer options — a major-key and minor-key trial in the
// same tonic both answer with that tonic chroma.
export function generateProgression({ activeNotes, level }) {
  const quality = Math.random() < 0.5 ? 'major' : 'minor';
  const scale = quality === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  const progression = randChoice(quality === 'major' ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS);

  const tonic = randChoice(activeNotes);
  const tonicIdx = CHROMAS.indexOf(tonic);

  const chords = progression.map(entry => buildChord(tonicIdx, scale, entry));
  const degrees = progression.map(entry => entry.degree);

  return {
    tonic,
    quality,
    degrees,
    chords,
    length: chords.length,
    activeSetSize: activeNotes.length,
    level,
  };
}

// Plays the progression on piano and returns the wall-clock ms when the last
// chord finishes sounding (used as the reference for response latency).
export async function playProgression(trial) {
  await audioEngine.resume();
  const chordDur = 0.9;
  const gap = 0.15;
  const startTime = audioEngine.currentTime + 0.05;
  const wallStart = Date.now() + 50;

  let t = startTime;
  for (const chord of trial.chords) {
    await Promise.allSettled(
      chord.map(note => audioEngine.playInstrumentSample('piano', note, 4, t, chordDur))
    );
    t += chordDur + gap;
  }

  const totalSec = trial.chords.length * chordDur + (trial.chords.length - 1) * gap;
  return wallStart + totalSec * 1000;
}
