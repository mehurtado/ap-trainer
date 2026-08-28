import { test } from 'node:test';
import assert from 'node:assert';
import { AdaptiveStats } from './AdaptiveStats.js';

test('AdaptiveStats constructor handles empty trials array', () => {
  const stats = new AdaptiveStats([]);

  assert.deepStrictEqual(stats._chroma, {});
  assert.deepStrictEqual(stats._type, {});
  assert.deepStrictEqual(stats._octave, {});
  assert.deepStrictEqual(stats._instrument, {});
  assert.deepStrictEqual(stats._direction, {});
});

test('AdaptiveStats constructor correctly groups chroma hits and misses', () => {
  const trials = [
    { target_chroma: 'C', result_bool: true },
    { target_chroma: 'C', result_bool: false },
    { target_chroma: 'C', result_bool: true },
    { target_chroma: 'F', result_bool: true },
  ];
  const stats = new AdaptiveStats(trials);

  assert.deepStrictEqual(stats._chroma['C'], { correct: 2, total: 3 });
  assert.deepStrictEqual(stats._chroma['F'], { correct: 1, total: 1 });
  assert.strictEqual(stats._chroma['G'], undefined);
});

test('AdaptiveStats constructor ignores trials with missing target_chroma', () => {
  const trials = [
    { target_chroma: 'C', result_bool: true },
    { result_bool: false }, // Missing target_chroma
    { target_chroma: null, result_bool: true },
  ];
  const stats = new AdaptiveStats(trials);

  assert.deepStrictEqual(stats._chroma['C'], { correct: 1, total: 1 });
  assert.strictEqual(Object.keys(stats._chroma).length, 1);
});

test('AdaptiveStats constructor resolves stimulus types correctly', () => {
  const trials = [
    { target_chroma: 'C', result_bool: true, sine_wave_flag: true }, // sine
    { target_chroma: 'C', result_bool: false, noise_masked_flag: true }, // noise (sine false)
    { target_chroma: 'D', result_bool: true, cents_offset: 20, cents_direction: 'sharp' }, // detuned
    { target_chroma: 'E', result_bool: true }, // fallback: instrument
  ];
  const stats = new AdaptiveStats(trials);

  assert.deepStrictEqual(stats._type['C:sine'], { correct: 1, total: 1 });
  assert.deepStrictEqual(stats._type['C:noise'], { correct: 0, total: 1 });
  assert.deepStrictEqual(stats._type['D:detuned'], { correct: 1, total: 1 });
  assert.deepStrictEqual(stats._type['E:instrument'], { correct: 1, total: 1 });
});

test('AdaptiveStats constructor captures octave and instrument data', () => {
  const trials = [
    { target_chroma: 'C', result_bool: true, target_octave: 4, instrument_id: 'piano' },
    { target_chroma: 'C', result_bool: false, target_octave: 4, instrument_id: 'piano' },
    { target_chroma: 'C', result_bool: true, target_octave: 5, instrument_id: 'guitar' },
  ];
  const stats = new AdaptiveStats(trials);

  assert.deepStrictEqual(stats._octave['C:4'], { correct: 1, total: 2 });
  assert.deepStrictEqual(stats._octave['C:5'], { correct: 1, total: 1 });

  assert.deepStrictEqual(stats._instrument['C:piano'], { correct: 1, total: 2 });
  assert.deepStrictEqual(stats._instrument['C:guitar'], { correct: 1, total: 1 });
});

test('AdaptiveStats constructor tracks detuned direction only for detuned types', () => {
  const trials = [
    { target_chroma: 'C', result_bool: true, cents_offset: 20, cents_direction: 'sharp' }, // detuned sharp
    { target_chroma: 'C', result_bool: false, cents_offset: -10, cents_direction: 'flat' }, // detuned flat
    { target_chroma: 'D', result_bool: true, cents_offset: 0, cents_direction: 'sharp' }, // not detuned (offset 0), should not log direction
    { target_chroma: 'E', result_bool: true, cents_offset: 15, cents_direction: 'none' }, // detuned but direction 'none', should not log
  ];
  const stats = new AdaptiveStats(trials);

  assert.deepStrictEqual(stats._direction['C:sharp'], { correct: 1, total: 1 });
  assert.deepStrictEqual(stats._direction['C:flat'], { correct: 0, total: 1 });

  // D is not detuned because cents_offset is 0 (or falsy check Math.abs(0) > 0 is false) -> type is 'instrument'
  assert.strictEqual(stats._direction['D:sharp'], undefined);

  // E is detuned but direction is 'none', handled by `t.cents_direction !== 'none'`
  assert.strictEqual(stats._direction['E:none'], undefined);
});
