import { test } from 'node:test';
import assert from 'node:assert';
import { chromaOctaveToMidi } from './constants.js';

test('chromaOctaveToMidi translates chroma and octave to correct MIDI notes', () => {
  // Middle C
  assert.strictEqual(chromaOctaveToMidi('C', 4), 60);

  // Tuning A
  assert.strictEqual(chromaOctaveToMidi('A', 4), 69);

  // Lowest possible MIDI note
  assert.strictEqual(chromaOctaveToMidi('C', -1), 0);

  // B in octave -1
  assert.strictEqual(chromaOctaveToMidi('B', -1), 11);

  // G in octave 9 (MIDI 127)
  assert.strictEqual(chromaOctaveToMidi('G', 9), 127);

  // Sharp notes
  assert.strictEqual(chromaOctaveToMidi('C#', 4), 61);
  assert.strictEqual(chromaOctaveToMidi('A#', 0), 22);
});
