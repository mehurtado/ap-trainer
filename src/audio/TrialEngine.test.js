import { test } from 'node:test';
import assert from 'node:assert';
import { generateTrial, adversarialPick, getActiveNotes } from './TrialEngine.js';
import { ConfusionMatrix } from './ConfusionMatrix.js';
import { CHROMAS, LEVEL_NOTES } from './constants.js';

test('getActiveNotes returns correct notes for levels', () => {
  // Level 1 should return LEVEL_NOTES[1]
  assert.deepStrictEqual(getActiveNotes(1), LEVEL_NOTES[1]);

  // Level 4 with null perNoteAccuracy should return LEVEL_NOTES[4]
  assert.deepStrictEqual(getActiveNotes(4, null), LEVEL_NOTES[4]);

  // Level 4 with perNoteAccuracy should currently return LEVEL_NOTES[4] (based on current implementation)
  const accuracy = { 'C': 0.5, 'G': 0.8 };
  assert.deepStrictEqual(getActiveNotes(4, accuracy), LEVEL_NOTES[4]);

  // Level 11 should return CHROMAS
  assert.deepStrictEqual(getActiveNotes(11), CHROMAS);
});

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

test('generateTrial returns correct object structure and respects sessionType', () => {
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
    'targetChroma', 'octave', 'instrument', 'stimType',
    'centOffset', 'centDirection', 'noiseType', 'hz',
    'responseWindowMs', 'durationMs'
  ];
  for (const key of expectedKeys) {
    assert.ok(key in trial, `Missing key: ${key}`);
  }

  // Check types
  assert.strictEqual(typeof trial.hz, 'number');
  assert.ok(activeNotes.includes(trial.targetChroma));

  // Check sessionType === 'drill' results in stimType === 'instrument'
  assert.strictEqual(trial.stimType, 'instrument');
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
    sessionType: 'adversarial'
  };

  const trial = generateTrial(params);
  assert.ok(activeNotes.includes(trial.targetChroma));
});
