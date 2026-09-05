import { test } from 'node:test';
import assert from 'node:assert';
import { generateProgression } from './ProgressionEngine.js';
import { CHROMAS } from './constants.js';

test('generateProgression returns a valid 3–6 chord progression', () => {
  const activeNotes = ['C', 'G'];
  for (let i = 0; i < 50; i++) {
    const p = generateProgression({ activeNotes, level: 1 });

    // Tonic drawn from the active (level) set.
    assert.ok(activeNotes.includes(p.tonic), `Tonic ${p.tonic} should be in activeNotes`);

    // 3–6 chords.
    assert.ok(p.length >= 3 && p.length <= 6, `Length ${p.length} should be 3–6`);
    assert.strictEqual(p.chords.length, p.length);
    assert.strictEqual(p.degrees.length, p.length);

    // Every chord is a valid 3-note triad of real chromas.
    for (const chord of p.chords) {
      assert.strictEqual(chord.length, 3);
      for (const note of chord) assert.ok(CHROMAS.includes(note), `Invalid note ${note}`);
    }

    // First and last chord are the tonic chord (anchors the key).
    assert.ok(p.chords[0].includes(p.tonic), 'First chord should contain the tonic');
    assert.ok(p.chords[p.chords.length - 1].includes(p.tonic), 'Last chord should contain the tonic');

    // Quality is major or minor.
    assert.ok(p.quality === 'major' || p.quality === 'minor');
  }
});

test('generateProgression mixes major and minor qualities', () => {
  const activeNotes = CHROMAS;
  const qualities = new Set();
  for (let i = 0; i < 100; i++) {
    qualities.add(generateProgression({ activeNotes, level: 12 }).quality);
    if (qualities.size === 2) break;
  }
  assert.strictEqual(qualities.size, 2, 'Both major and minor should be produced');
});
