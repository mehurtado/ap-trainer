import { test } from 'node:test';
import assert from 'node:assert';
import { calculateMaxStreak, calculateSineRtCorrect, calculateNoiseRtCorrect } from './Dashboard.jsx';

test('calculateMaxStreak', () => {
  const trials = [
    { result_bool: true },
    { result_bool: true },
    { result_bool: false },
    { result_bool: true },
    { result_bool: true },
    { result_bool: true },
    { result_bool: false },
  ];
  assert.strictEqual(calculateMaxStreak(trials), 3);
});

test('calculateMaxStreak empty', () => {
  assert.strictEqual(calculateMaxStreak([]), 0);
});

test('calculateSineRtCorrect', () => {
  const trials = [
    { sine_wave_flag: true, timeout_flag: false, result_bool: true, latency_ms: 100 },
    { sine_wave_flag: true, timeout_flag: false, result_bool: true, latency_ms: 200 },
    { sine_wave_flag: true, timeout_flag: false, result_bool: false, latency_ms: 50 }, // wrong
    { sine_wave_flag: false, timeout_flag: false, result_bool: true, latency_ms: 300 }, // not sine
    { sine_wave_flag: true, timeout_flag: true, result_bool: true, latency_ms: 1000 }, // timeout
  ];
  assert.strictEqual(calculateSineRtCorrect(trials), 150);
});

test('calculateSineRtCorrect empty', () => {
  assert.strictEqual(calculateSineRtCorrect([]), '--');
});

test('calculateNoiseRtCorrect', () => {
  const trials = [
    { noise_masked_flag: true, timeout_flag: false, result_bool: true, latency_ms: 400 },
    { noise_masked_flag: true, timeout_flag: false, result_bool: true, latency_ms: 600 },
    { noise_masked_flag: true, timeout_flag: false, result_bool: false, latency_ms: 200 }, // wrong
    { noise_masked_flag: false, timeout_flag: false, result_bool: true, latency_ms: 300 }, // not noise
  ];
  assert.strictEqual(calculateNoiseRtCorrect(trials), 500);
});

test('calculateNoiseRtCorrect empty', () => {
  assert.strictEqual(calculateNoiseRtCorrect([]), '--');
});
