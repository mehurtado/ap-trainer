import { test } from 'node:test';
import assert from 'node:assert';
import { AdaptiveStats } from './AdaptiveStats.js';

test('pickNote respects weights and falls back properly', () => {
  const stats = new AdaptiveStats([]);

  // Mock internal state
  // MIN_TRIALS is 5.
  // C: 0% accuracy (0/5) -> weight: base 1.0. seen=5, maxSeen=10 -> base + (1 - 5/10) * 0.05 = 1.0 + 0.025 = 1.025
  // E: 100% accuracy (10/10) -> weight: base max(0.1, 0) = 0.1. seen=10, maxSeen=10 -> 0.1 + (1 - 1) * 0.05 = 0.1
  // G: Unseen (0/0) -> weight: base 0.5. seen=0, maxSeen=10 -> 0.5 + (1 - 0/10) * 0.05 = 0.55
  stats._chroma = {
    'C': { correct: 0, total: 5 },
    'E': { correct: 10, total: 10 },
  };

  const activeNotes = ['C', 'E', 'G'];
  // Weights should be:
  // C: 1.025
  // E: 0.1
  // G: 0.55
  // Total = 1.675

  const originalRandom = Math.random;
  try {
    // If Math.random() is close to 0, it picks C
    Math.random = () => 0.01;
    assert.strictEqual(stats.pickNote(activeNotes), 'C');

    // C boundary is 1.025 / 1.675 = 0.6119
    Math.random = () => 0.61; // 0.61 * 1.675 = 1.02175 < 1.025 -> C
    assert.strictEqual(stats.pickNote(activeNotes), 'C');

    // E boundary is (1.025 + 0.1) / 1.675 = 1.125 / 1.675 = 0.6716
    Math.random = () => 0.62; // 0.62 * 1.675 = 1.0385 > 1.025 (C), so next is E. 1.0385 - 1.025 = 0.0135 < 0.1 -> E
    assert.strictEqual(stats.pickNote(activeNotes), 'E');

    // G is anything above E
    Math.random = () => 0.99;
    assert.strictEqual(stats.pickNote(activeNotes), 'G');
  } finally {
    Math.random = originalRandom;
  }
});

test('pickNote handles empty activeNotes', () => {
  const stats = new AdaptiveStats([]);
  assert.strictEqual(stats.pickNote([]), undefined);
});

test('pickNote handles uninitialized weights', () => {
  const stats = new AdaptiveStats([]);
  const activeNotes = ['C', 'E', 'G'];
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.strictEqual(stats.pickNote(activeNotes), 'C');
    Math.random = () => 0.99;
    assert.strictEqual(stats.pickNote(activeNotes), 'G');
  } finally {
    Math.random = originalRandom;
  }
});
