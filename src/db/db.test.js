import { test } from 'node:test';
import assert from 'node:assert';
import { sanitizeForCSV, computeBackupSummary } from './db.js';

test('computeBackupSummary counts each store and finds earliest/latest trial', () => {
  const data = {
    trials: [
      { id: 'a', timestamp: '2026-03-02T00:00:00.000Z' },
      { id: 'b', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'c', timestamp: '2026-02-01T00:00:00.000Z' },
    ],
    ambient: [{ id: 'x' }, { id: 'y' }],
    sessions: [{ id: 's1' }],
    blocks: [],
    epochs: [{ id: 'e1' }, { id: 'e2' }],
  };
  const summary = computeBackupSummary(data);
  assert.strictEqual(summary.trialCount, 3);
  assert.strictEqual(summary.ambientCount, 2);
  assert.strictEqual(summary.sessionCount, 1);
  assert.strictEqual(summary.blockCount, 0);
  assert.strictEqual(summary.epochCount, 2);
  assert.strictEqual(summary.earliestTrial, '2026-01-01T00:00:00.000Z');
  assert.strictEqual(summary.latestTrial, '2026-03-02T00:00:00.000Z');
});

test('computeBackupSummary handles empty payload', () => {
  const summary = computeBackupSummary({});
  assert.strictEqual(summary.trialCount, 0);
  assert.strictEqual(summary.earliestTrial, null);
  assert.strictEqual(summary.latestTrial, null);
});

test('sanitizeForCSV prepends single quote to dangerous characters', () => {
  assert.strictEqual(sanitizeForCSV('=1+2'), "'=1+2");
  assert.strictEqual(sanitizeForCSV('+sum(A1:A2)'), "'+sum(A1:A2)");
  assert.strictEqual(sanitizeForCSV('-123'), "'-123");
  assert.strictEqual(sanitizeForCSV('@something'), "'@something");
  assert.strictEqual(sanitizeForCSV('\talert(1)'), "'\talert(1)");
  assert.strictEqual(sanitizeForCSV('\rtest'), "'\rtest");
});

test('sanitizeForCSV does not modify safe strings', () => {
  assert.strictEqual(sanitizeForCSV('hello'), 'hello');
  assert.strictEqual(sanitizeForCSV('123'), '123');
  assert.strictEqual(sanitizeForCSV(''), '');
});

test('sanitizeForCSV does not modify non-string values', () => {
  assert.strictEqual(sanitizeForCSV(123), 123);
  assert.strictEqual(sanitizeForCSV(true), true);
  assert.strictEqual(sanitizeForCSV(null), null);
  assert.strictEqual(sanitizeForCSV(undefined), undefined);
});

import 'fake-indexeddb/auto';
const { saveTrial, getAllTrials, exportJSON, importJSON, saveAmbient, getAllAmbient } = await import('./db.js');

test('test saveTrial success', async () => {
  await saveTrial({ note: 'C' });
  const trials = await getAllTrials();
  assert.strictEqual(trials.length, 1);
  assert.strictEqual(trials[0].note, 'C');
  assert.ok(trials[0].timestamp);
});

test('test saveTrial error', async () => {
  await assert.rejects(
    () => saveTrial({ uncloneable: () => {} }),
    { name: 'DataCloneError' }
  );
});

test('exportJSON/importJSON round-trips trials and ambient with original timestamps', async () => {
  const before = await exportJSON();
  assert.ok(Array.isArray(before.trials));
  assert.ok(Array.isArray(before.ambient));

  const backup = {
    trials: [{ note: 'G', timestamp: '2020-01-01T00:00:00.000Z' }],
    ambient: [{ sound_source: 'fridge', timestamp: '2020-01-01T00:00:00.000Z' }],
  };
  const result = await importJSON(backup);
  assert.strictEqual(result.trials, 1);
  assert.strictEqual(result.ambient, 1);

  const after = await getAllTrials();
  const imported = after.find(t => t.note === 'G');
  assert.ok(imported, 'imported trial should be present');
  // Timestamp must be preserved exactly, not overwritten with import time
  // (unlike saveTrial, which always stamps "now").
  assert.strictEqual(imported.timestamp, '2020-01-01T00:00:00.000Z');
});

test('version 2 backup preserves session, block, epoch and metadata snapshots', async () => {
 const backup={trials:[{id:'v2-test',schema_version:2,target_pitch:'C',timestamp:'2026-01-01T00:00:00Z'}],sessions:[{id:'session-1',training_epoch:'epoch-1'}],blocks:[{id:'block-1',explicit_response_set:['C','G'],trials:[{target_pitch:'C'}]}],epochs:[{id:'epoch-1'}],meta:[{key:'curriculumEpoch',value:'epoch-1'}]};
 await importJSON(backup);await importJSON(backup);const exported=await exportJSON();
 assert.equal(exported.trials.filter(t=>t.id==='v2-test').length,1);
 for(const key of ['sessions','blocks','epochs','meta'])assert.deepEqual(exported[key],backup[key]);
});

test('saveAmbient assigns a UUID when entry has no id', async () => {
  await saveAmbient({ sound_source: 'fridge-hum-marker' });
  const all = await getAllAmbient();
  const entry = all.find(a => a.sound_source === 'fridge-hum-marker');
  assert.ok(entry, 'ambient entry should be present');
  assert.ok(entry.id, 'ambient entry should get an assigned id');
});

test('saveAmbient preserves an explicitly provided id', async () => {
  await saveAmbient({ sound_source: 'kettle-marker', id: 'preset-ambient-id' });
  const all = await getAllAmbient();
  const entry = all.find(a => a.sound_source === 'kettle-marker');
  assert.strictEqual(entry.id, 'preset-ambient-id');
});

// Real migration/backfill coverage lives in repository.test.js.
