import { test } from 'node:test';
import assert from 'node:assert';
import { chromaOctaveToMidi, getValidNotes } from './constants.js';

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

test('getValidNotes returns correct notes for instruments', () => {
  // Piano (min: 3, max: 6) - 4 octaves, 12 notes per octave = 48 notes
  const pianoNotes = getValidNotes('piano');
  assert.strictEqual(pianoNotes.length, 48);
  assert.deepStrictEqual(pianoNotes[0], { chroma: 'C', octave: 3 });
  assert.deepStrictEqual(pianoNotes[47], { chroma: 'B', octave: 6 });

  // Bass (min: 2, max: 4) - 3 octaves, 12 notes per octave = 36 notes
  const bassNotes = getValidNotes('bass');
  assert.strictEqual(bassNotes.length, 36);
  assert.deepStrictEqual(bassNotes[0], { chroma: 'C', octave: 2 });
  assert.deepStrictEqual(bassNotes[35], { chroma: 'B', octave: 4 });

  // Invalid instrument
  assert.throws(() => getValidNotes('invalid_instrument'), TypeError);
});
