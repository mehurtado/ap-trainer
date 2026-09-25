import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeProgress } from './progress.js';
const row = (extra = {}) => ({ schema_version: 2, trial_purpose: 'training', timestamp: '2026-09-24T12:00:00', target_pitch: 'C', explicit_response_set: ['C','G'], correct: true, latency_ms: 1000, ...extra });
test('adaptive summaries exclude manual, invalid, incomplete, and out-of-set answers from named accuracy', () => {
 const s = summarizeProgress([row(), row({correct:false}), row({target_pitch:'D'}), row({trial_purpose:'manual'}), row({schema_version:1}), row({valid:false}), row({invalidated:true}), row({completed:false})]);
 assert.equal(s.rows.length,3); assert.equal(s.named.length,2); assert.equal(s.accuracy,.5); assert.equal(s.median,1000); assert.equal(s.purposes[0].count,2);
});
test('date range includes entire local first day and missing dates do not count', () => {
 const s = summarizeProgress([row({timestamp:'2026-09-18T00:00:00'}), row({timestamp:'2026-09-17T23:59:59'}), row({timestamp:'bad'}), row()], '7', new Date('2026-09-24T23:00:00'));
 assert.equal(s.rows.length,2); assert.equal(s.activeDays,2);
});
test('no evidence stays unknown, not zero percent; purpose groups and median stay distinct', () => {
 assert.equal(summarizeProgress([]).accuracy,null);
 const s=summarizeProgress([row({trial_purpose:'probe',latency_ms:2000}),row({trial_purpose:'benchmark',latency_ms:1000})]);
 assert.equal(s.median,1500); assert.equal(s.purposes.find(p=>p.purpose==='training').count,0); assert.equal(s.purposes.find(p=>p.purpose==='probe').count,1);
});
