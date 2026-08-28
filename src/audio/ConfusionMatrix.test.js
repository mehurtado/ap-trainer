import { test } from 'node:test';
import assert from 'node:assert';
import { ConfusionMatrix } from './ConfusionMatrix.js';
import { CHROMAS } from './constants.js';

test('ConfusionMatrix.topConfusedPairs', async (t) => {
  await t.test('returns empty array when no confusions exist', () => {
    const cm = new ConfusionMatrix();
    const pairs = cm.topConfusedPairs();
    assert.deepStrictEqual(pairs, []);
  });

  await t.test('filters out zero counts and correct answers', () => {
    const cm = new ConfusionMatrix();
    // Correct answers (should not be in topConfusedPairs)
    cm.record('C', 'C', true, true, false);

    // Confusion 1: Target C, Response C# (1 count)
    cm.record('C', 'C#', false, false, false);

    const pairs = cm.topConfusedPairs();
    assert.strictEqual(pairs.length, 1);
    assert.deepStrictEqual(pairs[0], { target: 'C', response: 'C#', count: 1 });
  });

  await t.test('sorts pairs in descending order of count', () => {
    const cm = new ConfusionMatrix();

    // C -> D (3 times)
    cm.record('C', 'D', false, false, false);
    cm.record('C', 'D', false, false, false);
    cm.record('C', 'D', false, false, false);

    // C -> E (1 time)
    cm.record('C', 'E', false, false, false);

    // C -> F (5 times)
    cm.record('C', 'F', false, false, false);
    cm.record('C', 'F', false, false, false);
    cm.record('C', 'F', false, false, false);
    cm.record('C', 'F', false, false, false);
    cm.record('C', 'F', false, false, false);

    const pairs = cm.topConfusedPairs();
    assert.strictEqual(pairs.length, 3);
    assert.deepStrictEqual(pairs[0], { target: 'C', response: 'F', count: 5 });
    assert.deepStrictEqual(pairs[1], { target: 'C', response: 'D', count: 3 });
    assert.deepStrictEqual(pairs[2], { target: 'C', response: 'E', count: 1 });
  });

  await t.test('respects the default limit of 3 and custom limit', () => {
    const cm = new ConfusionMatrix();

    // Create 5 different confused pairs
    cm.record('C', 'C#', false, false, false);
    cm.record('C', 'D', false, false, false);
    cm.record('C', 'D#', false, false, false);
    cm.record('C', 'E', false, false, false);
    cm.record('C', 'F', false, false, false);

    // Default limit should be 3
    const defaultPairs = cm.topConfusedPairs();
    assert.strictEqual(defaultPairs.length, 3);

    // Custom limit
    const customPairs = cm.topConfusedPairs(5);
    assert.strictEqual(customPairs.length, 5);

    const limitedPairs = cm.topConfusedPairs(2);
    assert.strictEqual(limitedPairs.length, 2);
  });
});
