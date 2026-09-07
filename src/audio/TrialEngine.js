import {
  CHROMAS, INSTRUMENTS, INSTRUMENT_REGISTERS,
  chromaOctaveToHz,
} from './constants.js';
import { audioEngine } from './AudioEngine.js';
import { pickMasteryWeighted } from './AdaptiveStats.js';

// Picks a random integer in [min, max] inclusive
function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Overall mix: 40% sine, 12% detuned, 6% noise, 42% clean instrument.
// Drill sessions bypass detuned and noise entirely (always clean instrument).
const STIM_WEIGHTS = { sine: 0.40, detuned: 0.12, noise: 0.06, instrument: 0.42 };

function pickStimulusType(isDrill = false, allowedTypes = null) {
  if (isDrill) return 'instrument';
  const types = allowedTypes && allowedTypes.length > 0 ? allowedTypes : Object.keys(STIM_WEIGHTS);
  if (types.length === 1) return types[0];
  const total = types.reduce((sum, t) => sum + STIM_WEIGHTS[t], 0);
  let r = Math.random() * total;
  for (const t of types) {
    r -= STIM_WEIGHTS[t];
    if (r <= 0) return t;
  }
  return types[types.length - 1];
}

// Weighted random pick from `notes` using per-note weights (need not sum to 1).
// Falls back to uniform random when weights are missing or all zero.
function pickWeighted(notes, weights) {
  const total = notes.reduce((sum, n) => sum + (weights[n] || 0), 0);
  if (total <= 0) return randChoice(notes);
  let r = Math.random() * total;
  for (const n of notes) {
    r -= (weights[n] || 0);
    if (r <= 0) return n;
  }
  return notes[notes.length - 1];
}

// Generates the next trial spec given active notes and level.
// When adaptiveStats is provided it drives all selection dimensions;
// otherwise falls back to adversarial pick at level 12 or uniform random.
export function generateTrial({ activeNotes, level, instrumentId, trialIndexInSession, confusionMatrix, sessionType, adaptiveStats, responseWindowMs, perNoteAccuracy = {}, noiseScramble = false, customWeights = null, customOutOfSetProb = null, allowedStimTypes = null }) {
  const isDrill = sessionType === 'drill';

  // ── Chroma ────────────────────────────────────────────────────────────────
  // "Not In Set" (Other): sample outside the active set S so users can't win
  // by process-of-elimination. P(OutOfSet) = 1/(k+1) for k=|S|, unless a
  // custom mode session supplies an explicit override. Disabled when S
  // already covers all 12 chromas (complement empty — first occurs at
  // level 11, since LEVEL_NOTES[11] === LEVEL_NOTES[12] === CHROMAS).
  const k = activeNotes.length;
  const canGoOutOfSet = k < CHROMAS.length;
  const pOut = !canGoOutOfSet ? 0 : (customOutOfSetProb != null ? customOutOfSetProb : 1 / (k + 1));
  const isOutOfSet = canGoOutOfSet && Math.random() < pOut;

  let targetChroma;
  if (isOutOfSet) {
    const complement = CHROMAS.filter(c => !activeNotes.includes(c));
    targetChroma = randChoice(complement);
  } else if (customWeights) {
    targetChroma = pickWeighted(activeNotes, customWeights);
  } else if (adaptiveStats) {
    targetChroma = adaptiveStats.pickNote(activeNotes);
  } else if (level === 12 && confusionMatrix) {
    targetChroma = adversarialPick(activeNotes, confusionMatrix, trialIndexInSession);
  } else {
    targetChroma = pickMasteryWeighted(activeNotes, perNoteAccuracy);
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
  // An explicit allowedStimTypes list (custom mode) takes priority over
  // adaptive stim-type selection so the user's sine/noise/detune toggles
  // are always respected, regardless of adaptiveMode.
  let stimType = allowedStimTypes
    ? pickStimulusType(false, allowedStimTypes)
    : adaptiveStats
      ? adaptiveStats.pickStimType(targetChroma, isDrill)
      : pickStimulusType(isDrill);

  // Noise Scramble toggle: force every trial to be a noise-masked note
  // (skipped when custom mode has explicitly disallowed noise).
  if (noiseScramble && (!allowedStimTypes || allowedStimTypes.includes('noise'))) {
    stimType = 'noise';
  }

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
    isOutOfSet,
    octave,
    instrument: inst,
    stimType,       // 'instrument' | 'sine' | 'detuned' | 'noise'
    centOffset,
    centDirection,
    noiseType,
    hz: chromaOctaveToHz(targetChroma, octave, centOffset),
    responseWindowMs: responseWindowMs || 1500,
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

