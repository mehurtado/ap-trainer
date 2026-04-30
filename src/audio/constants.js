export const CHROMAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const CHROMA_TO_MIDI_BASE = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
  'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11
};

// Register constraints (octave range to sample from)
export const INSTRUMENT_REGISTERS = {
  piano:   { min: 2, max: 7 },
  guitar:  { min: 2, max: 6 },
  harp:    { min: 2, max: 6 },
  trumpet: { min: 3, max: 6 },
  violin:  { min: 3, max: 7 },
  bass:    { min: 1, max: 4 },
};

export const INSTRUMENTS = Object.keys(INSTRUMENT_REGISTERS);

// Maps our instrument IDs to the folder name in /public/samples/
export const INSTRUMENT_FOLDER = {
  piano:   'piano',
  guitar:  'guitar-electric',
  harp:    'harp',
  trumpet: 'trumpet',
  violin:  'violin',
  bass:    'bass-electric',
};

// Exact notes available on disk per instrument (our C#/D# notation internally)
// Used for nearest-sample pitch-shifting
export const INSTRUMENT_SAMPLES = {
  piano: (() => {
    const notes = [];
    for (let o = 1; o <= 7; o++) for (const c of CHROMAS) notes.push({ chroma: c, octave: o });
    notes.push({ chroma: 'C', octave: 8 });
    return notes;
  })(),
  guitar: [
    { chroma: 'C#', octave: 2 }, { chroma: 'C', octave: 3 }, { chroma: 'C', octave: 4 },
    { chroma: 'C', octave: 5 }, { chroma: 'C', octave: 6 }, { chroma: 'D#', octave: 3 },
    { chroma: 'D#', octave: 4 }, { chroma: 'D#', octave: 5 }, { chroma: 'E', octave: 2 },
    { chroma: 'F#', octave: 2 }, { chroma: 'F#', octave: 3 }, { chroma: 'F#', octave: 4 },
    { chroma: 'F#', octave: 5 }, { chroma: 'A', octave: 2 }, { chroma: 'A', octave: 3 },
    { chroma: 'A', octave: 4 }, { chroma: 'A', octave: 5 },
  ],
  harp: [
    { chroma: 'B', octave: 1 }, { chroma: 'B', octave: 3 }, { chroma: 'B', octave: 5 },
    { chroma: 'B', octave: 6 }, { chroma: 'C', octave: 3 }, { chroma: 'C', octave: 5 },
    { chroma: 'D', octave: 2 }, { chroma: 'D', octave: 4 }, { chroma: 'D', octave: 6 },
    { chroma: 'D', octave: 7 }, { chroma: 'E', octave: 1 }, { chroma: 'E', octave: 3 },
    { chroma: 'E', octave: 5 }, { chroma: 'F', octave: 2 }, { chroma: 'F', octave: 4 },
    { chroma: 'F', octave: 6 }, { chroma: 'F', octave: 7 }, { chroma: 'G', octave: 1 },
    { chroma: 'G', octave: 3 }, { chroma: 'G', octave: 5 }, { chroma: 'A', octave: 2 },
    { chroma: 'A', octave: 4 }, { chroma: 'A', octave: 6 },
  ],
  violin: [
    { chroma: 'G', octave: 3 }, { chroma: 'G', octave: 4 }, { chroma: 'G', octave: 5 },
    { chroma: 'G', octave: 6 }, { chroma: 'A', octave: 3 }, { chroma: 'A', octave: 4 },
    { chroma: 'A', octave: 5 }, { chroma: 'A', octave: 6 }, { chroma: 'C', octave: 4 },
    { chroma: 'C', octave: 5 }, { chroma: 'C', octave: 6 }, { chroma: 'C', octave: 7 },
    { chroma: 'E', octave: 4 }, { chroma: 'E', octave: 5 }, { chroma: 'E', octave: 6 },
  ],
  trumpet: [
    { chroma: 'A', octave: 3 }, { chroma: 'A', octave: 5 }, { chroma: 'A#', octave: 4 },
    { chroma: 'C', octave: 4 }, { chroma: 'C', octave: 6 }, { chroma: 'D', octave: 5 },
    { chroma: 'D#', octave: 4 }, { chroma: 'F', octave: 3 }, { chroma: 'F', octave: 4 },
    { chroma: 'F', octave: 5 }, { chroma: 'G', octave: 4 },
  ],
  bass: [
    { chroma: 'A#', octave: 1 }, { chroma: 'A#', octave: 2 }, { chroma: 'A#', octave: 3 },
    { chroma: 'A#', octave: 4 }, { chroma: 'C#', octave: 1 }, { chroma: 'C#', octave: 2 },
    { chroma: 'C#', octave: 3 }, { chroma: 'C#', octave: 4 }, { chroma: 'E', octave: 1 },
    { chroma: 'E', octave: 2 }, { chroma: 'E', octave: 3 }, { chroma: 'E', octave: 4 },
    { chroma: 'G', octave: 1 }, { chroma: 'G', octave: 2 }, { chroma: 'G', octave: 3 },
    { chroma: 'G', octave: 4 },
  ],
};

// MIDI note number → frequency
export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function chromaOctaveToMidi(chroma, octave) {
  return CHROMA_TO_MIDI_BASE[chroma] + (octave + 1) * 12;
}

export function chromaOctaveToHz(chroma, octave, centOffset = 0) {
  const midi = chromaOctaveToMidi(chroma, octave);
  const basHz = midiToHz(midi);
  return basHz * Math.pow(2, centOffset / 1200);
}

// Returns all valid [chroma, octave] pairs for an instrument
export function getValidNotes(instrumentId) {
  const reg = INSTRUMENT_REGISTERS[instrumentId];
  const notes = [];
  for (let oct = reg.min; oct <= reg.max; oct++) {
    for (const chroma of CHROMAS) {
      notes.push({ chroma, octave: oct });
    }
  }
  return notes;
}

// Build the on-disk path. Sharps: C# → Cs, D# → Ds, etc. (tonejs naming)
export function samplePath(instrumentId, chroma, octave) {
  const folder = INSTRUMENT_FOLDER[instrumentId] || instrumentId;
  const filename = chroma.replace('#', 's') + octave + '.wav';
  return `/samples/${folder}/${filename}`;
}

// Find nearest available sample for an instrument + return cents offset needed
export function nearestSample(instrumentId, chroma, octave) {
  const samples = INSTRUMENT_SAMPLES[instrumentId];
  if (!samples || samples.length === 0) return { chroma, octave, detuneOffset: 0 };

  const targetMidi = chromaOctaveToMidi(chroma, octave);
  let best = null;
  let bestDist = Infinity;

  for (const s of samples) {
    const dist = Math.abs(targetMidi - chromaOctaveToMidi(s.chroma, s.octave));
    if (dist < bestDist) { bestDist = dist; best = s; }
  }

  const detuneOffset = (targetMidi - chromaOctaveToMidi(best.chroma, best.octave)) * 100;
  return { chroma: best.chroma, octave: best.octave, detuneOffset };
}

export const LEVEL_NOTES = {
  1:  ['C', 'G'],
  2:  ['C', 'E', 'G'],
  3:  ['C', 'C#', 'E', 'G'],
  4:  ['C', 'C#', 'D', 'E', 'G'],
  5:  ['C', 'C#', 'D', 'E', 'F', 'G'],
  6:  ['C', 'C#', 'D', 'E', 'F', 'F#', 'G'],
  7:  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G'],
  8:  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'],
  9:  ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A'],
  10: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#'],
  11: CHROMAS,
  12: CHROMAS,
};
