import { test } from 'node:test';
import assert from 'node:assert';
import { weightedRandom } from './AdaptiveStats.js';

test('weightedRandom boundary weights [0, 0] picks uniformly', () => {
  const items = ['A', 'B'];
  const weights = [0, 0];

  let originalRandom = Math.random;
  try {
    // Mock Math.random to pick first item
    Math.random = () => 0.1;
    assert.strictEqual(weightedRandom(items, weights), 'A');

    // Mock Math.random to pick second item
    Math.random = () => 0.9;
    assert.strictEqual(weightedRandom(items, weights), 'B');
  } finally {
    Math.random = originalRandom;
  }
});

test('weightedRandom deterministic edge cases [1, 0] and [0, 1]', () => {
  const items = ['A', 'B'];

  let originalRandom = Math.random;
  try {
    // Math.random could return exactly 0, which would cause [0, 1] to return A
    // if we don't mock it to return > 0
    Math.random = () => 0.5;
    assert.strictEqual(weightedRandom(items, [1, 0]), 'A');
    assert.strictEqual(weightedRandom(items, [0, 1]), 'B');
  } finally {
    Math.random = originalRandom;
  }
});

test('weightedRandom extremely small weights', () => {
  const items = ['A', 'B'];
  const weights = [1e-10, 1e-10];

  let originalRandom = Math.random;
  try {
    Math.random = () => 0.1;
    assert.strictEqual(weightedRandom(items, weights), 'A');

    Math.random = () => 0.9;
    assert.strictEqual(weightedRandom(items, weights), 'B');
  } finally {
    Math.random = originalRandom;
  }
});

test('weightedRandom boundary float precision fall-through', () => {
  const items = ['A', 'B', 'C'];
  const weights = [1, 1, 1];

  let originalRandom = Math.random;
  try {
    // Mock Math.random to return something that will result in r > 0 after all iterations
    Math.random = () => 0.9999999999999999;
    assert.strictEqual(weightedRandom(items, weights), 'C');
  } finally {
    Math.random = originalRandom;
  }
});
