import { test, mock } from 'node:test';
import assert from 'node:assert';
import { AdaptiveStats, pickMasteryWeighted, buildChromaAccuracy } from './AdaptiveStats.js';

test('AdaptiveStats.pickStimType', async (t) => {
  await t.test('returns "instrument" if isDrill is true', () => {
    const stats = new AdaptiveStats([]);
    assert.strictEqual(stats.pickStimType('C', true), 'instrument');
  });

  await t.test('uses default weights when no data is available', () => {
    const stats = new AdaptiveStats([]);

    // Default weights according to STIM_DEFAULTS:
    // { sine: 0.40, instrument: 0.42, detuned: 0.12, noise: 0.06 }

    // We mock Math.random() to deterministically select buckets.
    // Total weight = 1.0, so:
    // sine (cumulative 0.40) -> random < 0.40
    // instrument (cumulative 0.82) -> random < 0.82
    // detuned (cumulative 0.94) -> random < 0.94
    // noise (cumulative 1.00) -> random < 1.00

    let randomMock = mock.method(Math, 'random', () => 0.1);
    assert.strictEqual(stats.pickStimType('C', false), 'sine');
    randomMock.mock.restore();

    randomMock = mock.method(Math, 'random', () => 0.5);
    assert.strictEqual(stats.pickStimType('C', false), 'instrument');
    randomMock.mock.restore();

    randomMock = mock.method(Math, 'random', () => 0.9);
    assert.strictEqual(stats.pickStimType('C', false), 'detuned');
    randomMock.mock.restore();

    randomMock = mock.method(Math, 'random', () => 0.98);
    assert.strictEqual(stats.pickStimType('C', false), 'noise');
    randomMock.mock.restore();
  });

  await t.test('weights shift based on inverse accuracy', () => {
    // We provide >= 5 trials (MIN_TRIALS) per stimulus type to trigger _w behavior.
    const trials = [];

    // 5 correct sine trials (fast <= 500ms -> score 1.0) -> accuracy 1.0 -> weight Math.max(0.1, 1 - 1.0) = 0.1
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, latency_ms: 300, sine_wave_flag: true });
    }

    // 5 incorrect noise trials -> accuracy 0.0 -> weight Math.max(0.1,  ​1 - 0.0) = 1.0
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: false, latency_ms: 600, noise_masked_flag: true });
    }

    // 5 instrument trials with 60% accuracy -> accuracy 0.6 -> weight Math.max(0.1, 1 - 0.6) = 0.4
    for (let i = 0; i < 3; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, latency_ms: 400, instrument_id: 'piano' });
    }
    for (let i = 0; i < 2; i++) {
      trials.push({ target_chroma: 'C', result_bool: false, latency_ms: 1200, instrument_id: 'piano' });
    }

    // 5 detuned trials with 20% accuracy -> accuracy 0.2 -> weight Math.max(0.1, 1 - 0.2) = 0.8
    for (let i = 0; i < 1; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, latency_ms: 200, cents_offset: 50, cents_direction: 'sharp' });
    }
    for (let i = 0; i < 4; i++) {
      trials.push({ target_chroma: 'C', result_bool: false, latency_ms: 300, cents_offset: 50, cents_direction: 'sharp' });
    }

    const stats = new AdaptiveStats(trials);

    // According to AdaptiveStats, STIM_DEFAULTS are:
    // { sine: 0.40, instrument: 0.42, detuned: 0.12, noise: 0.06 }
    // Object.keys(STIM_DEFAULTS) order is: ['sine', 'instrument', 'detuned', 'noise']
    //
    // Computed weights via `this._w(stat, STIM_DEFAULTS[t])`:
    // sine: 0.1
    // instrument: 0.4
    // detuned: 0.8
    // noise: 1.0
    //
    // Total weights = 0.1 + 0.4 + 0.8 + 1.0 = 2.3
    // Cumulative thresholds (r / total):
    // sine: < (0.1 / 2.3) ≈ 0.043
    // instrument: < (0.5 / 2.3) ≈ 0.217
    // detuned: < (1.3 / 2.3) ≈ 0.565
    // noise: <= 1.0

    // sine
    let randomMock = mock.method(Math, 'random', () => 0.02);
    assert.strictEqual(stats.pickStimType('C', false), 'sine');
    randomMock.mock.restore();

    // instrument
    randomMock = mock.method(Math, 'random', () => 0.15);
    assert.strictEqual(stats.pickStimType('C', false), 'instrument');
    randomMock.mock.restore();

    // detuned
    randomMock = mock.method(Math, 'random', () => 0.4);
    assert.strictEqual(stats.pickStimType('C', false), 'detuned');
    randomMock.mock.restore();

    // noise
    randomMock = mock.method(Math, 'random', () => 0.8);
    assert.strictEqual(stats.pickStimType('C', false), 'noise');
    randomMock.mock.restore();
  });

  await t.test('weights shift based on latency penalty', () => {
    const trials = [];

    // Sine: 5 correct but very slow (1500ms = 0.2 score) -> score 1.0 / 5 = 0.2 -> weight 0.8
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, latency_ms: 1600, sine_wave_flag: true });
    }

    // Instrument: 5 correct and fast (200ms = 1.0 score) -> score 5.0 / 5 = 1.0 -> weight 0.1
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, latency_ms: 200, instrument_id: 'piano' });
    }

    // Detuned: 5 correct, mid latency (1000ms = 0.6 score) -> score 3.0 / 5 = 0.6 -> weight 0.4
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, latency_ms: 1000, cents_offset: 50, cents_direction: 'sharp' });
    }

    // Noise: 5 wrong (score 0.0) -> score 0.0 / 5 = 0.0 -> weight 1.0
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: false, latency_ms: 1000, noise_masked_flag: true });
    }

    const stats = new AdaptiveStats(trials);

    // Weights:
    // sine: 0.8
    // instrument: 0.1
    // detuned: 0.4
    // noise: 1.0
    // Total = 2.3
    // Cumulative: sine < 0.8/2.3 (0.347), instrument < 0.9/2.3 (0.391), detuned < 1.3/2.3 (0.565), noise <= 1.0

    let randomMock = mock.method(Math, 'random', () => 0.2); // 0.2 * 2.3 = 0.46 < 0.8 -> sine
    assert.strictEqual(stats.pickStimType('C', false), 'sine');
    randomMock.mock.restore();

    randomMock = mock.method(Math, 'random', () => 0.36); // 0.36 * 2.3 = 0.828 -> instrument
    assert.strictEqual(stats.pickStimType('C', false), 'instrument');
    randomMock.mock.restore();

    randomMock = mock.method(Math, 'random', () => 0.45); // 0.45 * 2.3 = 1.035 -> detuned
    assert.strictEqual(stats.pickStimType('C', false), 'detuned');
    randomMock.mock.restore();

    randomMock = mock.method(Math, 'random', () => 0.8); // 0.8 * 2.3 = 1.84 -> noise
    assert.strictEqual(stats.pickStimType('C', false), 'noise');
    randomMock.mock.restore();
  });
});

test('getChromaStats returns raw per-chroma correct/total counts', () => {
  const trials = [
    { target_chroma: 'C', result_bool: true },
    { target_chroma: 'C', result_bool: false },
    { target_chroma: 'E', result_bool: true },
  ];
  const stats = new AdaptiveStats(trials);
  assert.deepStrictEqual(stats.getChromaStats().C, { correct: 1, total: 2 });
  assert.deepStrictEqual(stats.getChromaStats().E, { correct: 1, total: 1 });
});

// Blocker fix (Red Team): out-of-set exposures must not count toward a note's
// tracked accuracy, or a note would arrive at unlock already looking "warm"
// instead of cold, breaking pickMasteryWeighted's tau-default rule.
test('buildChromaAccuracy / getChromaStats exclude out-of-set trials entirely', () => {
  const trials = [
    { target_chroma: 'F#', result_bool: true, is_out_of_set: true },  // correct pre-unlock "Other" press
    { target_chroma: 'F#', result_bool: true, is_out_of_set: true },
    { target_chroma: 'C',  result_bool: true, is_out_of_set: false }, // real in-set trial
  ];
  const direct = buildChromaAccuracy(trials);
  assert.strictEqual(direct['F#'], undefined); // zero in-set history despite 2 correct Other presses
  assert.deepStrictEqual(direct.C, { correct: 1, total: 1 });

  const stats = new AdaptiveStats(trials);
  assert.strictEqual(stats.getChromaStats()['F#'], undefined);
  assert.deepStrictEqual(stats.getChromaStats().C, { correct: 1, total: 1 });
});

test('buildChromaAccuracy treats trials predating is_out_of_set (undefined) as in-set', () => {
  const trials = [{ target_chroma: 'C', result_bool: true }]; // legacy trial, no is_out_of_set field
  assert.deepStrictEqual(buildChromaAccuracy(trials).C, { correct: 1, total: 1 });
});

test('pickMasteryWeighted treats sub-MIN_TRIALS history as cold (0% accuracy)', (t) => {
  const activeNotes = ['C', 'E'];
  // C: 4/4 correct but only 4 trials (< MIN_TRIALS=5) -> must be treated as a=0 -> weight 0.15
  // E: no entry -> a=0 -> weight 0.15
  // Equal weights [0.15, 0.15], total=0.30
  const perNoteAccuracy = { C: { correct: 4, total: 4 } };
  t.mock.method(Math, 'random', () => 0.1); // r=0.03 -> subtract 0.15 -> <=0 -> index 0
  assert.strictEqual(pickMasteryWeighted(activeNotes, perNoteAccuracy), 'C');
  t.mock.method(Math, 'random', () => 0.9); // r=0.27 -> subtract 0.15 -> 0.12 -> subtract 0.15 -> <=0 -> index 1
  assert.strictEqual(pickMasteryWeighted(activeNotes, perNoteAccuracy), 'E');
});

test('pickMasteryWeighted floors a mastered note at epsMin instead of 0', (t) => {
  const activeNotes = ['C', 'E'];
  // C: 19/20 = 95% accuracy, past MIN_TRIALS -> raw = 0.90-0.95 = -0.05 -> clamp to epsMin=0.05
  // E: no entry -> a=0 -> raw=0.90 -> clamp to wMax=0.15
  // weights [0.05, 0.15], total=0.20
  const perNoteAccuracy = { C: { correct: 19, total: 20 } };
  t.mock.method(Math, 'random', () => 0.1); // r=0.02 -> subtract 0.05 -> <=0 -> index 0
  assert.strictEqual(pickMasteryWeighted(activeNotes, perNoteAccuracy), 'C');
  t.mock.method(Math, 'random', () => 0.9); // r=0.18 -> subtract 0.05 -> 0.13 -> subtract 0.15 -> <=0 -> index 1
  assert.strictEqual(pickMasteryWeighted(activeNotes, perNoteAccuracy), 'E');
});

// Red Team: previous tests only ever exercised the two clamp plateaus (0% and
// 95% accuracy). This proves the graduated 75-85%-ish band actually produces
// a distinct, intermediate weight rather than the formula secretly being a
// binary step function end to end.
test('pickMasteryWeighted produces a graduated weight for a mid-band accuracy (80%)', (t) => {
  const activeNotes = ['C', 'E', 'F'];
  // C: 16/20 = 80%, past MIN_TRIALS -> raw = 0.90-0.80 = 0.10 -> unclamped, weight 0.10
  // E: no entry -> a=0 -> weight 0.15 (wMax)
  // F: 19/20 = 95% -> weight 0.05 (epsMin)
  // weights [0.10, 0.15, 0.05], total=0.30
  const perNoteAccuracy = { C: { correct: 16, total: 20 }, F: { correct: 19, total: 20 } };
  t.mock.method(Math, 'random', () => 0.1);  // r=0.03  -> subtract 0.10 -> <=0 -> index 0 ('C')
  assert.strictEqual(pickMasteryWeighted(activeNotes, perNoteAccuracy), 'C');
  t.mock.method(Math, 'random', () => 0.5);  // r=0.15  -> subtract 0.10 -> 0.05 -> subtract 0.15 -> <=0 -> index 1 ('E')
  assert.strictEqual(pickMasteryWeighted(activeNotes, perNoteAccuracy), 'E');
  t.mock.method(Math, 'random', () => 0.9);  // r=0.27  -> subtract 0.10 -> 0.17 -> subtract 0.15 -> 0.02 -> subtract 0.05 -> <=0 -> index 2 ('F')
  assert.strictEqual(pickMasteryWeighted(activeNotes, perNoteAccuracy), 'F');
});
