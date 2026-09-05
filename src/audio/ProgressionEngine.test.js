import { test } from 'node:test';
import assert from 'node:assert';
import { generateProgression, buildChord, QUALITIES } from './ProgressionEngine.js';
import { CHROMAS } from './constants.js';

// Independently-computed scale table (not imported from the engine) so a
// bug in the engine's own table wouldn't also hide in the test.
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

const MAJOR_SIGNATURES = ['1-5-6-4-1', '1-6-4-5-1', '1-4-5-1', '1-7-3-6-2-5-1'];
const MINOR_SIGNATURES = ['1-6-3-7-1', '1-2-5-1', '1-7-6-7-1', '1-4-7-3-1'];

function findProgressionWithSignature(activeNotes, quality, signature, maxTries = 500) {
  for (let i = 0; i < maxTries; i++) {
    const p = generateProgression({ activeNotes, level: 12 });
    if (p.quality === quality && p.degrees.join('-') === signature) return p;
  }
  throw new Error(`Never sampled ${quality} progression ${signature} in ${maxTries} tries`);
}

test('generateProgression returns one of the fixed progressions', () => {
  const activeNotes = ['C', 'G'];
  for (let i = 0; i < 50; i++) {
    const p = generateProgression({ activeNotes, level: 1 });

    assert.ok(activeNotes.includes(p.tonic), `Tonic ${p.tonic} should be in activeNotes`);
    assert.strictEqual(p.chords.length, p.length);
    assert.strictEqual(p.degrees.length, p.length);

    const signature = p.degrees.join('-');
    if (p.quality === 'major') {
      assert.ok(MAJOR_SIGNATURES.includes(signature), `Unexpected major signature ${signature}`);
    } else {
      assert.ok(MINOR_SIGNATURES.includes(signature), `Unexpected minor signature ${signature}`);
    }

    // Every chord is a valid triad-or-larger of real chromas.
    for (const chord of p.chords) {
      assert.ok(chord.length >= 3, `Chord ${chord} should have at least 3 tones`);
      for (const note of chord) assert.ok(CHROMAS.includes(note), `Invalid note ${note}`);
    }

    // First and last chord are tonic-quality chords (anchors the key).
    assert.ok(p.chords[0].includes(p.tonic), 'First chord should contain the tonic');
    assert.ok(p.chords[p.chords.length - 1].includes(p.tonic), 'Last chord should contain the tonic');

    assert.ok(p.quality === 'major' || p.quality === 'minor');
  }
});

test('generateProgression mixes major and minor qualities and all 8 progressions', () => {
  const activeNotes = CHROMAS;
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const p = generateProgression({ activeNotes, level: 12 });
    seen.add(`${p.quality}:${p.degrees.join('-')}`);
  }
  for (const sig of MAJOR_SIGNATURES) assert.ok(seen.has(`major:${sig}`), `Missing major ${sig}`);
  for (const sig of MINOR_SIGNATURES) assert.ok(seen.has(`minor:${sig}`), `Missing minor ${sig}`);
  assert.strictEqual(seen.size, 8, 'Should see exactly 8 distinct progressions');
});

test('major "Axis" progression (I-V-vi-IV-I) has correct chord tones in C', () => {
  const p = findProgressionWithSignature(['C'], 'major', '1-5-6-4-1');
  assert.deepStrictEqual(p.chords[0], ['C', 'E', 'G', 'B', 'D']);   // CΔ9
  assert.deepStrictEqual(p.chords[1], ['G', 'B', 'D', 'F', 'A']);   // G9
  assert.deepStrictEqual(p.chords[2], ['A', 'C', 'E', 'G']);        // Am7
  assert.deepStrictEqual(p.chords[3], ['F', 'A', 'C', 'E']);        // FΔ7
  assert.deepStrictEqual(p.chords[4], ['C', 'E', 'G', 'B']);        // CΔ7
});

test('major "Autumn Leaves" turnaround has the correct altered V7b5/vi chord', () => {
  const p = findProgressionWithSignature(['C'], 'major', '1-7-3-6-2-5-1');
  assert.deepStrictEqual(p.chords[1], ['B', 'D', 'F', 'A']);        // Bø7 (viiø7)
  assert.deepStrictEqual(p.chords[2], ['E', 'G#', 'A#', 'D']);      // E7b5 (V7b5/vi): root E, maj3rd G#, b5 Bb(A#), m7 D
  assert.deepStrictEqual(p.chords[3], ['A', 'C', 'E', 'G']);        // Am7 (vi)
});

test('minor ii-V-i has the correct altered V7b5 chord (not diatonic v)', () => {
  const p = findProgressionWithSignature(['A'], 'minor', '1-2-5-1');
  assert.deepStrictEqual(p.chords[0], ['A', 'C', 'E', 'G', 'B']);   // Am9
  assert.deepStrictEqual(p.chords[1], ['B', 'D', 'F', 'A']);        // Bø7 (iiø7)
  assert.deepStrictEqual(p.chords[2], ['E', 'G#', 'A#', 'D']);      // E7b5: root E, maj3rd G#, b5 Bb(A#), m7 D
  assert.deepStrictEqual(p.chords[3], ['A', 'C', 'E', 'G']);        // Am7
});

test('buildChord applies quality intervals to the correct root', () => {
  const tonicIdx = CHROMAS.indexOf('D');
  const chord = buildChord(tonicIdx, MAJOR_SCALE, { degree: 5, quality: 'dom9' });
  // Degree 5 of D major = A. A9 = A C# E G B.
  assert.deepStrictEqual(chord, ['A', 'C#', 'E', 'G', 'B']);
});

test('QUALITIES table has no duplicate pitch classes within a chord', () => {
  for (const [name, intervals] of Object.entries(QUALITIES)) {
    const classes = new Set(intervals.map(i => i % 12));
    assert.strictEqual(classes.size, intervals.length, `${name} has a duplicate pitch class`);
  }
});
