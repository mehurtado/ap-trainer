import { test } from 'node:test';
import assert from 'node:assert';
import { ConfusionMatrix } from './ConfusionMatrix.js';

test('ConfusionMatrix.record - correct answer', () => {
  const cm = new ConfusionMatrix();
  cm.record('C', 'C', true, true, false);

  assert.strictEqual(cm.failureCounts['C'].correct, 1);
  assert.strictEqual(cm.lastCorrect, 'C');
  assert.strictEqual(cm.matrix['C']['C'], 0); // matrix is only for wrong answers according to code
});

test('ConfusionMatrix.record - incorrect answer (confident)', () => {
  const cm = new ConfusionMatrix();
  cm.record('C', 'D', false, true, false);

  assert.strictEqual(cm.matrix['C']['D'], 1);
  assert.strictEqual(cm.failureCounts['C'].total, 1);
  assert.strictEqual(cm.failureCounts['C'].confidentWrong, 1);
  assert.strictEqual(cm.failureCounts['C'].correct, 0);
  assert.strictEqual(cm.lastCorrect, null);

  // Test accumulating values
  cm.record('C', 'D', false, true, false);
  assert.strictEqual(cm.matrix['C']['D'], 2);
  assert.strictEqual(cm.failureCounts['C'].total, 2);
  assert.strictEqual(cm.failureCounts['C'].confidentWrong, 2);
});

test('ConfusionMatrix.record - incorrect answer (not confident)', () => {
  const cm = new ConfusionMatrix();
  cm.record('C', 'E', false, false, false);

  assert.strictEqual(cm.matrix['C']['E'], 1);
  assert.strictEqual(cm.failureCounts['C'].total, 1);
  assert.strictEqual(cm.failureCounts['C'].confidentWrong, 0);
  assert.strictEqual(cm.failureCounts['C'].correct, 0);
});

test('ConfusionMatrix.record - sine mode filtering', () => {
  const cm = new ConfusionMatrix('sine');

  // Record not sine (should be ignored)
  cm.record('C', 'D', false, true, false);
  assert.strictEqual(cm.matrix['C']['D'], 0);
  assert.strictEqual(cm.failureCounts['C'].total, 0);

  // Record sine (should be recorded)
  cm.record('C', 'D', false, true, true);
  assert.strictEqual(cm.matrix['C']['D'], 1);
  assert.strictEqual(cm.failureCounts['C'].total, 1);
});

test('ConfusionMatrix.record - instrument mode filtering', () => {
  const cm = new ConfusionMatrix('instrument');

  // Record sine (should be ignored)
  cm.record('C', 'D', false, true, true);
  assert.strictEqual(cm.matrix['C']['D'], 0);
  assert.strictEqual(cm.failureCounts['C'].total, 0);

  // Record not sine (should be recorded)
  cm.record('C', 'D', false, true, false);
  assert.strictEqual(cm.matrix['C']['D'], 1);
  assert.strictEqual(cm.failureCounts['C'].total, 1);
});
