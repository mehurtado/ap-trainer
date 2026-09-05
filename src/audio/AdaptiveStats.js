import { INSTRUMENTS, INSTRUMENT_REGISTERS } from './constants.js';

const MIN_TRIALS = 5;

// Default stimulus type probabilities — mirrors pickStimulusType in TrialEngine
const STIM_DEFAULTS = { sine: 0.40, instrument: 0.42, detuned: 0.12, noise: 0.06 };

export function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Helper to score a hit based on response latency
// 1.0 for latency <= 500ms, scaling down to 0.2 at latency >= 1500ms
export function calculateLatencyScore(hit, latencyMs) {
  if (!hit) return 0;
  if (latencyMs <= 500) return 1.0;
  if (latencyMs >= 1500) return 0.2;
  return 1.0 - (0.8 * ((latencyMs - 500) / 1000));
}

// In-set-only per-chroma { correct, total } tally. Deliberately excludes any
// trial with is_out_of_set === true: a correct "Other" press means "correctly
// rejected," not "correctly identified," and must not count toward a note's
// tracked accuracy — mixing the two would corrupt the cold-start-to-tau
// default that pickMasteryWeighted (and pickNote) depend on. Trials that
// predate this field (is_out_of_set === undefined) are treated as in-set,
// which is correct for historical data recorded before this feature existed.
export function buildChromaAccuracy(trials) {
  const acc = {};
  for (const t of trials) {
    const c = t.target_chroma;
    if (!c || t.is_out_of_set || t.progression_flag) continue;
    if (!acc[c]) acc[c] = { correct: 0, total: 0 };
    acc[c].total++;
    if (t.result_bool) acc[c].correct++;
  }
  return acc;
}

// ── Mastery-gated in-set note selection (Not-In-Set / Other feature) ───────
// Standalone (not a class method): callers can build perNoteAccuracy via
// buildChromaAccuracy(trials) directly, or via an AdaptiveStats instance's
// getChromaStats(), independent of whether adaptiveMode/pickNote is active.
// tau matches ADVANCEMENT_ACCURACY in useGameState.js (kept as a local
// literal here to avoid a cross-module import).
export function pickMasteryWeighted(activeNotes, perNoteAccuracy, { tau = 0.90, epsMin = 0.05, wMax = 0.15 } = {}) {
  const weights = activeNotes.map(note => {
    const stat = perNoteAccuracy[note];
    const a = (!stat || stat.total < MIN_TRIALS) ? 0 : stat.correct / stat.total;
    const raw = tau - a;
    return Math.min(wMax, Math.max(epsMin, raw));
  });
  return weightedRandom(activeNotes, weights);
}

export class AdaptiveStats {
  constructor(trials) {
    this._chroma     = {};   // 'C'       → { correct, total } (latency-weighted, in-set only)
    this._type       = {};   // 'C:sine'  → { correct, total }
    this._octave     = {};   // 'C:4'     → { correct, total }
    this._instrument = {};   // 'C:piano' → { correct, total }
    this._direction  = {};   // 'C:sharp' → { correct, total }

    for (const t of trials) {
      const c = t.target_chroma;
      if (!c || t.progression_flag) continue;
      const hit = t.result_bool ? 1 : 0;
      const score = calculateLatencyScore(hit, t.latency_ms || 0);

      // Chroma accuracy is latency-weighted (see calculateLatencyScore) but
      // excludes out-of-set trials so a note still arrives at unlock "cold" —
      // a correct "Other" press is a rejection, not an identification.
      if (!t.is_out_of_set) this._inc(this._chroma, c, score);

      const type = t.sine_wave_flag     ? 'sine'
                 : t.noise_masked_flag  ? 'noise'
                 : Math.abs(t.cents_offset || 0) > 0 ? 'detuned'
                 : 'instrument';
      this._inc(this._type, `${c}:${type}`, score);

      if (t.target_octave != null) this._inc(this._octave, `${c}:${t.target_octave}`, score);
      if (t.instrument_id)         this._inc(this._instrument, `${c}:${t.instrument_id}`, score);

      if (type === 'detuned' && t.cents_direction && t.cents_direction !== 'none') {
        this._inc(this._direction, `${c}:${t.cents_direction}`, score);
      }
    }
  }

  _inc(map, key, score) {
    if (!map[key]) map[key] = { correct: 0, total: 0 };
    map[key].total++;
    map[key].correct += score;
  }

  // In-set-only per-chroma { correct, total } counts (latency-weighted, see
  // calculateLatencyScore), for callers outside this class's own weighting
  // methods (e.g. pickMasteryWeighted). Out-of-set trials are excluded.
  getChromaStats() {
    return this._chroma;
  }

  // Returns inverse-accuracy weight for a stat bucket.
  // Falls back to `fallback` when there isn't enough data to be meaningful.
  _w(stat, fallback) {
    if (!stat || stat.total < MIN_TRIALS) return fallback;
    return Math.max(0.1, 1 - stat.correct / stat.total);
  }

  // Pick a note from activeNotes weighted by inverse accuracy.
  // Notes with no data get neutral weight 0.5; tiebreak favours less-seen notes.
  pickNote(activeNotes) {
    const maxSeen = Math.max(1, ...activeNotes.map(n => this._chroma[n]?.total || 0));
    const weights = activeNotes.map(n => {
      const base = this._w(this._chroma[n], 0.5);
      const seen = this._chroma[n]?.total || 0;
      return base + (1 - seen / maxSeen) * 0.05;
    });
    return weightedRandom(activeNotes, weights);
  }

  // Pick stimulus type weighted by inverse accuracy.
  // Types with insufficient data fall back to their natural base rate.
  pickStimType(chroma, isDrill) {
    if (isDrill) return 'instrument';
    const types = Object.keys(STIM_DEFAULTS);
    const weights = types.map(t => this._w(this._type[`${chroma}:${t}`], STIM_DEFAULTS[t]));
    return weightedRandom(types, weights);
  }

  // Pick octave within reg weighted by inverse accuracy.
  // Octaves with insufficient data are treated equally (weight 1.0).
  pickOctave(chroma, reg) {
    const octaves = [];
    for (let o = reg.min; o <= reg.max; o++) octaves.push(o);
    const weights = octaves.map(o => this._w(this._octave[`${chroma}:${o}`], 1.0));
    return weightedRandom(octaves, weights);
  }

  // Pick instrument weighted by inverse accuracy per chroma.
  // Instruments with insufficient data are treated equally (weight 1.0).
  pickInstrument(chroma) {
    const weights = INSTRUMENTS.map(i => this._w(this._instrument[`${chroma}:${i}`], 1.0));
    return weightedRandom(INSTRUMENTS, weights);
  }

  // Pick detuned direction weighted by inverse accuracy.
  // Directions with insufficient data are treated equally (weight 1.0).
  pickDetunedDirection(chroma) {
    const dirs = ['sharp', 'flat'];
    const weights = dirs.map(d => this._w(this._direction[`${chroma}:${d}`], 1.0));
    return weightedRandom(dirs, weights);
  }
}
