import {
  CHROMAS, INSTRUMENTS, INSTRUMENT_REGISTERS, LEVEL_NOTES,
  chromaOctaveToHz, getValidNotes
} from './constants.js';
import { audioEngine } from './AudioEngine.js';

// Picks a random integer in [min, max] inclusive
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Returns a random instrument and valid octave for a given chroma
function randomInstrumentOctaveForChroma(chroma) {
  const inst = randChoice(INSTRUMENTS);
  const reg = INSTRUMENT_REGISTERS[inst];
  const oct = randInt(reg.min, reg.max);
  return { instrument: inst, octave: oct };
}

// Overall mix: 40% sine, 12% detuned, 6% noise, 42% clean instrument.
// Drill sessions bypass detuned and noise entirely (always clean instrument).
function pickStimulusType(level, isDrill = false) {
  if (isDrill) return 'instrument';
  const roll = Math.random();
  if (roll < 0.40) return 'sine';
  if (roll < 0.52) return 'detuned';
  if (roll < 0.58) return 'noise';
  return 'instrument';
}

// Generates the next trial spec given active notes and level
export function generateTrial({ activeNotes, level, instrumentId, trialIndexInSession, confusionMatrix, sessionType }) {
  // Pick target chroma
  let targetChroma;
  if (level === 12 && confusionMatrix) {
    targetChroma = adversarialPick(activeNotes, confusionMatrix, trialIndexInSession);
  } else {
    targetChroma = randChoice(activeNotes);
  }

  // Pick instrument and octave — uniform across register
  const inst = instrumentId || randChoice(INSTRUMENTS);
  const reg = INSTRUMENT_REGISTERS[inst];
  const octave = randInt(reg.min, reg.max);

  const isDrill = sessionType === 'binary' || sessionType === 'drill';
  const stimType = pickStimulusType(level, isDrill);
  let centOffset = 0;
  let centDirection = 'none';

  if (stimType === 'detuned') {
    centOffset = randInt(10, 25) * (Math.random() < 0.5 ? 1 : -1);
    centDirection = centOffset > 0 ? 'sharp' : 'flat';
  }

  const noiseType = Math.random() < 0.5 ? 'white' : 'pink';

  return {
    targetChroma,
    octave,
    instrument: inst,
    stimType,       // 'instrument' | 'sine' | 'detuned' | 'noise'
    centOffset,
    centDirection,
    noiseType,
    hz: chromaOctaveToHz(targetChroma, octave, centOffset),
    responseWindowMs: 1500,
    durationMs: 800,
  };
}

// Plays the trial stimulus. Returns wall-clock ms timestamp when audio starts.
export async function playTrial(trial) {
  await audioEngine.resume();
  const startTime = audioEngine.currentTime + 0.05;
  const wallClockStart = Date.now() + 50; // matches the +0.05s AudioContext offset
  const durationSec = trial.durationMs / 1000;

  let played = false;

  if (trial.stimType === 'sine') {
    audioEngine.playSine(trial.hz, startTime, durationSec + 0.5, 0.5);
    played = true;
  } else if (trial.stimType === 'noise') {
    const result = await audioEngine.playNoiseMasked(
      trial.instrument, trial.targetChroma, trial.octave,
      startTime, durationSec + 0.5, trial.noiseType, 7
    );
    played = !!result;
  } else {
    // instrument or detuned
    const result = await audioEngine.playInstrumentSample(
      trial.instrument, trial.targetChroma, trial.octave,
      startTime, durationSec + 0.5, trial.centOffset
    );
    played = !!result;
  }

  // Fall back to sine wave when sample files are not available
  if (!played) {
    audioEngine.playSine(trial.hz, startTime, durationSec + 0.5, 0.5);
  }

  return wallClockStart; // wall-clock ms, compatible with Date.now()
}

// ── Adversarial agent ──────────────────────────────────────────────────────

export function adversarialPick(activeNotes, confusionMatrix, trialIndexInSession) {
  // Cold start: first 10 trials pure random
  if (trialIndexInSession < 10) return randChoice(activeNotes);

  const roll = Math.random();
  if (roll < 0.40) {
    return neighborAttack(activeNotes, confusionMatrix);
  } else if (roll < 0.70) {
    return weaknessAttack(activeNotes, confusionMatrix);
  } else {
    return randChoice(activeNotes);
  }
}

function neighborAttack(activeNotes, cm) {
  // Find the note most confused with the last correct answer
  if (!cm.lastCorrect) return randChoice(activeNotes);
  const confused = cm.mostConfusedWith(cm.lastCorrect, activeNotes);
  return confused || randChoice(activeNotes);
}

function weaknessAttack(activeNotes, cm) {
  // Note with highest weighted failure rate (confident wrong = 3×)
  let best = null, bestScore = -1;
  for (const note of activeNotes) {
    const score = cm.weightedFailureRate(note);
    if (score > bestScore) { bestScore = score; best = note; }
  }
  return best || randChoice(activeNotes);
}

// ── Active notes for level ─────────────────────────────────────────────────

export function getActiveNotes(level, perNoteAccuracy = null) {
  if (level <= 3 || !perNoteAccuracy) {
    return LEVEL_NOTES[level] || CHROMAS;
  }
  // Level 4+: dynamic — add semitone neighbor of lowest-accuracy active note
  const base = [...(LEVEL_NOTES[level] || CHROMAS)];
  return base;
}

export const LEVEL_NOTES_EXPORT = LEVEL_NOTES;
