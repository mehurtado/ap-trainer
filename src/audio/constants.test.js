import { test } from 'node:test';
import assert from 'node:assert';
import { chromaOctaveToMidi, nearestSample } from './constants.js';

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

test('nearestSample returns input with detuneOffset 0 for unknown instrument', () => {
  const result = nearestSample('unknown_instrument', 'C', 4);
  assert.deepStrictEqual(result, { chroma: 'C', octave: 4, detuneOffset: 0 });
});

test('nearestSample finds exact match when sample exists', () => {
  const result = nearestSample('guitar', 'C', 4);
  assert.deepStrictEqual(result, { chroma: 'C', octave: 4, detuneOffset: 0 });
});

test('nearestSample finds nearest sample and calculates positive detuneOffset', () => {
  const result = nearestSample('guitar', 'C#', 4);
  // C#4 (61) is closest to C4 (60) for guitar
  assert.deepStrictEqual(result, { chroma: 'C', octave: 4, detuneOffset: 100 });
});

test('nearestSample finds nearest sample and calculates negative detuneOffset', () => {
  const result = nearestSample('guitar', 'D', 4);
  // D4 (62) is closest to D#4 (63) for guitar
  assert.deepStrictEqual(result, { chroma: 'D#', octave: 4, detuneOffset: -100 });
});

test('nearestSample handles tie-breaking by picking the first encountered nearest sample', () => {
  // F#4 (66) is equidistant to F4 (65) and G4 (67)
  // Trumpet samples list F4 before G4
  const result = nearestSample('trumpet', 'F#', 4);
  assert.deepStrictEqual(result, { chroma: 'F', octave: 4, detuneOffset: 100 });
});
