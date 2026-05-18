import { INSTRUMENTS, INSTRUMENT_REGISTERS } from './constants.js';

const MIN_TRIALS = 5;

// Default stimulus type probabilities — mirrors pickStimulusType in TrialEngine
const STIM_DEFAULTS = { sine: 0.40, instrument: 0.42, detuned: 0.12, noise: 0.06 };

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export class AdaptiveStats {
  constructor(trials) {
    this._chroma     = {};   // 'C'       → { correct, total }
    this._type       = {};   // 'C:sine'  → { correct, total }
    this._octave     = {};   // 'C:4'     → { correct, total }
    this._instrument = {};   // 'C:piano' → { correct, total }
    this._direction  = {};   // 'C:sharp' → { correct, total }

    for (const t of trials) {
      const c = t.target_chroma;
      if (!c) continue;
      const hit = t.result_bool ? 1 : 0;

      this._inc(this._chroma, c, hit);

      const type = t.sine_wave_flag     ? 'sine'
                 : t.noise_masked_flag  ? 'noise'
                 : Math.abs(t.cents_offset || 0) > 0 ? 'detuned'
                 : 'instrument';
      this._inc(this._type, `${c}:${type}`, hit);

      if (t.target_octave != null) this._inc(this._octave, `${c}:${t.target_octave}`, hit);
      if (t.instrument_id)         this._inc(this._instrument, `${c}:${t.instrument_id}`, hit);

      if (type === 'detuned' && t.cents_direction && t.cents_direction !== 'none') {
        this._inc(this._direction, `${c}:${t.cents_direction}`, hit);
      }
    }
  }

  _inc(map, key, hit) {
    if (!map[key]) map[key] = { correct: 0, total: 0 };
    map[key].total++;
    map[key].correct += hit;
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
