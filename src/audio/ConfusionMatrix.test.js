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

test('ConfusionMatrix.weightedFailureRate returns 0 for note with only correct attempts and low latency', () => {
  const cm = new ConfusionMatrix();
  // Simulate correct answer: record(target, response, correct, confident, isSine, latencyMs)
  cm.record('C', 'C', true, true, false, 300);
  cm.record('C', 'C', true, false, false, 500);

  assert.strictEqual(cm.weightedFailureRate('C'), 0);
});

test('ConfusionMatrix.weightedFailureRate applies latency penalty for slow correct answers', () => {
  const cm = new ConfusionMatrix();
  // Very slow correct answer (>= 1500ms -> penalty 0.8)
  cm.record('C', 'C', true, true, false, 1600);
  // Total = 1, weighted = 0.8
  // expected = 0.8 / 1 = 0.8
  assert.strictEqual(cm.weightedFailureRate('C'), 0.8);

  // Mid slow correct answer (1000ms -> penalty 0.4)
  cm.record('D', 'D', true, true, false, 1000);
  assert.strictEqual(cm.weightedFailureRate('D'), 0.4);
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
