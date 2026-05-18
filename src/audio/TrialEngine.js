import {
  CHROMAS, INSTRUMENTS, INSTRUMENT_REGISTERS,
  chromaOctaveToHz,
} from './constants.js';
import { audioEngine } from './AudioEngine.js';

// Picks a random integer in [min, max] inclusive
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Overall mix: 40% sine, 12% detuned, 6% noise, 42% clean instrument.
// Drill sessions bypass detuned and noise entirely (always clean instrument).
function pickStimulusType(isDrill = false) {
  if (isDrill) return 'instrument';
  const roll = Math.random();
  if (roll < 0.40) return 'sine';
  if (roll < 0.52) return 'detuned';
  if (roll < 0.58) return 'noise';
  return 'instrument';
}

// Generates the next trial spec given active notes and level.
// When adaptiveStats is provided it drives all selection dimensions;
// otherwise falls back to adversarial pick at level 12 or uniform random.
export function generateTrial({ activeNotes, level, instrumentId, trialIndexInSession, confusionMatrix, sessionType, adaptiveStats }) {
  const isDrill = sessionType === 'drill';

  // ── Chroma ────────────────────────────────────────────────────────────────
  let targetChroma;
  if (adaptiveStats) {
    targetChroma = adaptiveStats.pickNote(activeNotes);
  } else if (level === 12 && confusionMatrix) {
    targetChroma = adversarialPick(activeNotes, confusionMatrix, trialIndexInSession);
  } else {
    targetChroma = randChoice(activeNotes);
  }

  // ── Instrument & octave ───────────────────────────────────────────────────
  const inst = adaptiveStats
    ? adaptiveStats.pickInstrument(targetChroma)
    : (instrumentId || randChoice(INSTRUMENTS));
  const reg = INSTRUMENT_REGISTERS[inst];
  const octave = adaptiveStats
    ? adaptiveStats.pickOctave(targetChroma, reg)
    : randInt(reg.min, reg.max);

  // ── Stimulus type ─────────────────────────────────────────────────────────
  const stimType = adaptiveStats
    ? adaptiveStats.pickStimType(targetChroma, isDrill)
    : pickStimulusType(isDrill);

  // ── Detuned params ────────────────────────────────────────────────────────
  let centOffset = 0;
  let centDirection = 'none';
  if (stimType === 'detuned') {
    const magnitude = randInt(10, 25);
    if (adaptiveStats) {
      centDirection = adaptiveStats.pickDetunedDirection(targetChroma);
      centOffset = centDirection === 'sharp' ? magnitude : -magnitude;
    } else {
      centOffset = magnitude * (Math.random() < 0.5 ? 1 : -1);
      centDirection = centOffset > 0 ? 'sharp' : 'flat';
    }
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

