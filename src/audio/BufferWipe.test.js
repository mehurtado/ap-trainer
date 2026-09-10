import test from 'node:test';
import assert from 'node:assert/strict';
import { audioEngine } from './AudioEngine.js';

test('buffer wipe schedules every original stage across the full ten seconds', () => {
  const engine = new audioEngine.constructor();
  engine.ctx = { currentTime: 100 };
  const calls = [];
  for (const method of ['_playNotchedBrownNoise', '_playKeySpam', '_playWhiteNoiseSegment', '_playRandomMelody']) {
    engine[method] = (...args) => calls.push([method, ...args]);
  }
  const end = engine.runBufferWipe(440, 'piano');
  const start = 100.05;
  assert.equal(end, start + 10);
  assert.deepEqual(calls, [
    ['_playNotchedBrownNoise', start, 2, 440],
    ['_playKeySpam', start + 2, 10, start + 3],
    ['_playWhiteNoiseSegment', start + 3, 2],
    ['_playRandomMelody', start + 5, 2, 'piano'],
    ['_playKeySpam', start + 7, 10, start + 8],
    ['_playNotchedBrownNoise', start + 8, 2, 440],
  ]);
});

test('quitting while wipe samples load cannot restart audio', async () => {
  const engine = new audioEngine.constructor();
  engine.ctx = { currentTime: 0, state: 'running' };
  const pending = [];
  engine.loadSample = () => new Promise(resolve => pending.push(resolve));
  engine.playSine = () => assert.fail('cancelled wipe played a fallback tone');
  engine._playKeySpam(2, 10, 3);
  engine._playRandomMelody(5, 2, 'piano');
  engine.ctx = null;
  pending.forEach(resolve => resolve(null));
  await Promise.resolve();
});

test('late sample loads cannot play after their wipe stage', async () => {
  const engine = new audioEngine.constructor();
  engine.ctx = { currentTime: 0, state: 'running' };
  const pending = [];
  engine.loadSample = () => new Promise(resolve => pending.push(resolve));
  engine.playSine = () => assert.fail('expired wipe stage played audio');
  engine._playKeySpam(2, 10, 3);
  engine._playRandomMelody(5, 2, 'piano');
  engine.ctx.currentTime = 11;
  pending.forEach(resolve => resolve(null));
  await Promise.resolve();
});
