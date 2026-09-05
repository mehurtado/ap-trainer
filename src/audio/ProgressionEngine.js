import { CHROMAS } from './constants.js';
import { audioEngine } from './AudioEngine.js';

// Semitone offsets from the tonic for each scale degree (0-indexed).
// Major = I ii iii IV V vi vii°, Minor = i ii° III iv v VI VII (natural minor).
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

// Common scale degrees (1-indexed) used in the middle of a progression.
// Degree 1 (the tonic chord) is forced at the start and end so the key is
// clearly anchored regardless of major/minor quality.
const MAJOR_MIDDLE = [4, 5, 6, 2, 3, 1];
const MINOR_MIDDLE = [6, 3, 7, 4, 5, 1];

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Build a triad (3 chromas) for a 1-indexed scale degree of a key.
function triadForDegree(tonicIdx, scale, degree) {
  const root  = (tonicIdx + scale[(degree - 1) % 7]) % 12;
  const third = (tonicIdx + scale[(degree - 1 + 2) % 7]) % 12;
  const fifth = (tonicIdx + scale[(degree - 1 + 4) % 7]) % 12;
  return [CHROMAS[root], CHROMAS[third], CHROMAS[fifth]];
}

// Generates a chord-progression trial. The tonic is drawn from `activeNotes`
// (the level's unlocked set), and the quality (major/minor) is mixed in
// without affecting the answer options — E major and E minor both answer E.
export function generateProgression({ activeNotes, level }) {
  const quality = Math.random() < 0.5 ? 'major' : 'minor';
  const scale = quality === 'major' ? MAJOR_SCALE : MINOR_SCALE;
  const middlePool = quality === 'major' ? MAJOR_MIDDLE : MINOR_MIDDLE;

  const tonic = randChoice(activeNotes);
  const tonicIdx = CHROMAS.indexOf(tonic);

  // 3–6 chords, always starting and ending on the tonic chord.
  const length = randInt(3, 6);
  const degrees = [1];
  for (let i = 0; i < length - 2; i++) degrees.push(randChoice(middlePool));
  degrees.push(1);

  const chords = degrees.map(d => triadForDegree(tonicIdx, scale, d));

  return {
    tonic,
    quality,
    degrees,
    chords,
    length,
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
