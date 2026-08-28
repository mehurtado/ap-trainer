import { test } from 'node:test';
import assert from 'node:assert';
import { ConfusionMatrix } from './ConfusionMatrix.js';

test('ConfusionMatrix.mostConfusedWith', async (t) => {
  await t.test('returns null if the provided note does not exist in the matrix', () => {
    const cm = new ConfusionMatrix();
    const result = cm.mostConfusedWith('INVALID_NOTE', ['C', 'D']);
    assert.strictEqual(result, null);
  });

  await t.test('returns a valid candidate when confusion counts are zero', () => {
    const cm = new ConfusionMatrix();
    const result = cm.mostConfusedWith('C', ['C', 'D', 'E']);
    // Since count for all is 0 and bestCount starts at -1, it should pick the first valid one which is 'D'
    assert.strictEqual(result, 'D');
  });

  await t.test('returns the candidate with the highest confusion count present in activeNotes', () => {
    const cm = new ConfusionMatrix();
    cm.record('C', 'C#', false, true, false); // count = 1
    cm.record('C', 'D', false, true, false);
    cm.record('C', 'D', false, true, false); // count = 2

    const result = cm.mostConfusedWith('C', ['C', 'C#', 'D', 'E']);
    assert.strictEqual(result, 'D');
  });

  await t.test('ignores highly confused notes if they are not in the activeNotes array', () => {
    const cm = new ConfusionMatrix();
    cm.record('C', 'D', false, true, false);
    cm.record('C', 'D', false, true, false); // count = 2
    cm.record('C', 'E', false, true, false); // count = 1

    // 'D' is the most confused but not in activeNotes
    const result = cm.mostConfusedWith('C', ['C', 'E', 'F']);
    assert.strictEqual(result, 'E');
  });

  await t.test('ignores self (where candidate === note)', () => {
    const cm = new ConfusionMatrix();
    // Simulate count for 'C' itself
    cm.matrix['C']['C'] = 10;
    cm.matrix['C']['D'] = 2;

    const result = cm.mostConfusedWith('C', ['C', 'D']);
    assert.strictEqual(result, 'D'); // Should pick D and ignore C
  });
});
