import { test, mock } from 'node:test';
import assert from 'node:assert';
import { AdaptiveStats } from './AdaptiveStats.js';

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

    // 5 correct sine trials -> accuracy 1.0 -> weight Math.max(0.1, 1 - 1.0) = 0.1
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, sine_wave_flag: true });
    }

    // 5 incorrect noise trials -> accuracy 0.0 -> weight Math.max(0.1, 1 - 0.0) = 1.0
    for (let i = 0; i < 5; i++) {
      trials.push({ target_chroma: 'C', result_bool: false, noise_masked_flag: true });
    }

    // 5 instrument trials with 60% accuracy -> accuracy 0.6 -> weight Math.max(0.1, 1 - 0.6) = 0.4
    for (let i = 0; i < 3; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, instrument_id: 'piano' });
    }
    for (let i = 0; i < 2; i++) {
      trials.push({ target_chroma: 'C', result_bool: false, instrument_id: 'piano' });
    }

    // 5 detuned trials with 20% accuracy -> accuracy 0.2 -> weight Math.max(0.1, 1 - 0.2) = 0.8
    for (let i = 0; i < 1; i++) {
      trials.push({ target_chroma: 'C', result_bool: true, cents_offset: 50, cents_direction: 'sharp' });
    }
    for (let i = 0; i < 4; i++) {
      trials.push({ target_chroma: 'C', result_bool: false, cents_offset: 50, cents_direction: 'sharp' });
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
});
