import { test } from 'node:test';
import assert from 'node:assert';
import { generateTrial, adversarialPick } from './TrialEngine.js';
import { ConfusionMatrix } from './ConfusionMatrix.js';
import { CHROMAS } from './constants.js';

test('adversarialPick returns a note from activeNotes', () => {
  const cm = new ConfusionMatrix();
  const activeNotes = ['C', 'E', 'G'];

  // Cold start (trialIndexInSession < 10)
  for (let i = 0; i < 10; i++) {
    const pick = adversarialPick(activeNotes, cm, i);
    assert.ok(activeNotes.includes(pick), `Pick ${pick} should be in activeNotes`);
  }

  // After cold start
  for (let i = 10; i < 20; i++) {
    const pick = adversarialPick(activeNotes, cm, i);
    assert.ok(activeNotes.includes(pick), `Pick ${pick} should be in activeNotes`);
  }
});

test('generateTrial returns correct object structure and respects sessionType', (t) => {
  t.mock.method(Math, 'random', () => 0.99); // force isOutOfSet=false (pOut=1/4 at k=3)
  const activeNotes = ['C', 'E', 'G'];
  const params = {
    activeNotes,
    level: 1,
    instrumentId: 'piano',
    trialIndexInSession: 0,
    confusionMatrix: new ConfusionMatrix(),
    sessionType: 'drill'
  };

  const trial = generateTrial(params);

  // Check structure
  const expectedKeys = [
    'targetChroma', 'isOutOfSet', 'octave', 'instrument', 'stimType',
    'centOffset', 'centDirection', 'noiseType', 'hz',
    'responseWindowMs', 'durationMs'
  ];
  for (const key of expectedKeys) {
    assert.ok(key in trial, `Missing key: ${key}`);
  }

  // Check types
  assert.strictEqual(typeof trial.hz, 'number');
  assert.strictEqual(trial.isOutOfSet, false);
  assert.ok(activeNotes.includes(trial.targetChroma));

  // Check sessionType === 'drill' results in stimType === 'instrument'
  assert.strictEqual(trial.stimType, 'instrument');
});

test('generateTrial samples from the complement when forced out-of-set', (t) => {
  const activeNotes = ['C', 'E', 'G']; // k=3, pOut=0.25, complement has 9 notes
  let call = 0;
  const seq = [0.01, 0.5]; // [0]=isOutOfSet roll (forces true), [1]=complement index pick
  t.mock.method(Math, 'random', () => seq[call++] ?? 0.9);
  const trial = generateTrial({ activeNotes, level: 1, instrumentId: 'piano',
    trialIndexInSession: 0, confusionMatrix: new ConfusionMatrix(), sessionType: 'evening' });
  assert.strictEqual(trial.isOutOfSet, true);
  assert.ok(!activeNotes.includes(trial.targetChroma));
  assert.ok(CHROMAS.includes(trial.targetChroma));
});

test('generateTrial never goes out-of-set once activeNotes covers all 12 chromas (level 12)', () => {
  for (let i = 0; i < 30; i++) {
    const trial = generateTrial({ activeNotes: CHROMAS, level: 12, instrumentId: 'piano',
      trialIndexInSession: i, confusionMatrix: new ConfusionMatrix(), sessionType: 'evening' });
    assert.strictEqual(trial.isOutOfSet, false);
    assert.ok(CHROMAS.includes(trial.targetChroma));
  }
});

// Red Team: LEVEL_NOTES[11] === LEVEL_NOTES[12] === CHROMAS, so k=12 first occurs at level 11.
// The gate keys off activeNotes.length, not level, so this must pass identically to the level-12
// case — this test exists specifically to catch a future "simplify to level>=12" regression.
test('generateTrial never goes out-of-set at level 11 either (k=12 there too)', () => {
  for (let i = 0; i < 30; i++) {
    const trial = generateTrial({ activeNotes: CHROMAS, level: 11, instrumentId: 'piano',
      trialIndexInSession: i, confusionMatrix: new ConfusionMatrix(), sessionType: 'evening' });
    assert.strictEqual(trial.isOutOfSet, false);
    assert.ok(CHROMAS.includes(trial.targetChroma));
  }
});

test('generateTrial with level 12 and confusionMatrix uses adversarialPick', () => {
  const activeNotes = CHROMAS;
  const cm = new ConfusionMatrix();
  const params = {
    activeNotes,
    level: 12,
    instrumentId: 'piano',
    trialIndexInSession: 15,
    confusionMatrix: cm,
    sessionType: 'evening'
  };

  const trial = generateTrial(params);
  assert.ok(activeNotes.includes(trial.targetChroma));
});
