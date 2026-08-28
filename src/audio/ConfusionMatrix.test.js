import { test } from 'node:test';
import assert from 'node:assert';
import { ConfusionMatrix } from './ConfusionMatrix.js';

test('ConfusionMatrix.weightedFailureRate returns 0 for unknown note', () => {
  const cm = new ConfusionMatrix();
  assert.strictEqual(cm.weightedFailureRate('Unknown'), 0);
});

test('ConfusionMatrix.weightedFailureRate returns 0 for note with no attempts', () => {
  const cm = new ConfusionMatrix();
  assert.strictEqual(cm.weightedFailureRate('C'), 0);
});

test('ConfusionMatrix.weightedFailureRate returns 0 for note with only correct attempts', () => {
  const cm = new ConfusionMatrix();
  // Simulate correct answer: record(target, response, correct, confident, isSine)
  cm.record('C', 'C', true, true, false);
  cm.record('C', 'C', true, false, false);

  assert.strictEqual(cm.weightedFailureRate('C'), 0);
});

test('ConfusionMatrix.weightedFailureRate calculation with only unconfident wrong attempts', () => {
  const cm = new ConfusionMatrix();
  // Simulate 2 unconfident wrong answers
  cm.record('C', 'C#', false, false, false);
  cm.record('C', 'D', false, false, false);

  // failureCounts['C'] = { total: 2, confidentWrong: 0, correct: 0 }
  // total = 2 + 0 = 2
  // weighted = 0 * 3 + (2 - 0) = 2
  // expected = 2 / 2 = 1
  assert.strictEqual(cm.weightedFailureRate('C'), 1);
});

test('ConfusionMatrix.weightedFailureRate calculation with only confident wrong attempts', () => {
  const cm = new ConfusionMatrix();
  // Simulate 2 confident wrong answers
  cm.record('C', 'C#', false, true, false);
  cm.record('C', 'D', false, true, false);

  // failureCounts['C'] = { total: 2, confidentWrong: 2, correct: 0 }
  // total = 2 + 0 = 2
  // weighted = 2 * 3 + (2 - 2) = 6
  // expected = 6 / 2 = 3
  assert.strictEqual(cm.weightedFailureRate('C'), 3);
});

test('ConfusionMatrix.weightedFailureRate calculation with mixed attempts', () => {
  const cm = new ConfusionMatrix();
  // 1 correct attempt
  cm.record('C', 'C', true, true, false);

  // 2 unconfident wrong attempts
  cm.record('C', 'C#', false, false, false);
  cm.record('C', 'D', false, false, false);

  // 1 confident wrong attempt
  cm.record('C', 'D#', false, true, false);

  // failureCounts['C'] = { total: 3, confidentWrong: 1, correct: 1 }
  // total attempts = 3 (wrong) + 1 (correct) = 4
  // unconfidentWrong = 3 - 1 = 2
  // weighted = (confidentWrong * 3) + unconfidentWrong = (1 * 3) + 2 = 5
  // expected = 5 / 4 = 1.25
  assert.strictEqual(cm.weightedFailureRate('C'), 1.25);
});
