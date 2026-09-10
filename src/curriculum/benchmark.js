import { CHROMAS } from '../audio/constants.js';
import { VERSIONS } from './model.js';
import { prng, shuffle } from './scheduler.js';
export const BENCHMARK = Object.freeze({
  ...VERSIONS,
  block_length: 72,
  response_window_ms: 3000,
  feedback_policy: 'after block only',
  explicit_response_set: CHROMAS,
  octaves: [4, 5],
  timbres: ['piano', 'guitar', 'held-out-harmonics'],
  stimulus_types: ['instrument-sample', 'synthesized'],
  detuning: 0,
  noise_configuration: null,
  sequence_constraints: 'no consecutive identical chromas',
  pitch_distribution: 'uniform, six per chroma'
});
export function benchmark(seed) {
  const random = prng(seed),
    trials = [];
  for (let c = 0; c < 6; c++) {
    const notes = shuffle(CHROMAS, random);
    if (notes[0] === trials.at(-1)?.target_pitch) [notes[0], notes[1]] = [notes[1], notes[0]];
    const timbre = BENCHMARK.timbres[Math.floor(c / 2)];
    for (const p of notes) trials.push({
      target_pitch: p,
      octave: 4 + c % 2,
      timbre,
      stimulus_type: timbre === 'held-out-harmonics' ? 'synthesized' : 'instrument-sample',
      detuning: 0,
      noise_configuration: null,
      sample_id: null,
      sample_onset_offset: 0,
      trial_purpose: 'benchmark',
      intertrial_ms: 900 + Math.floor(random() * 900)
    });
  }
  return {
    ...BENCHMARK,
    random_seed: seed,
    sampling_distribution: Object.fromEntries(CHROMAS.map(p => [p, 1 / 12])),
    out_of_set_distribution: {},
    scheduler_decision: {
      action: 'fixed benchmark'
    },
    scheduler_state_snapshot: {
      roles: Object.fromEntries(CHROMAS.map(p => [p, 'diagnostic']))
    },
    trials
  };
}
