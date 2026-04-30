import { CHROMAS } from './constants.js';

export class ConfusionMatrix {
  constructor(mode = 'all') {
    this.mode = mode; // 'all' | 'sine' | 'instrument'
    // matrix[target][response] = { total, confident }
    this.matrix = {};
    this.failureCounts = {};     // note → { total, confidentWrong }
    this.lastCorrect = null;
    for (const c of CHROMAS) {
      this.matrix[c] = {};
      this.failureCounts[c] = { total: 0, confidentWrong: 0, correct: 0 };
      for (const r of CHROMAS) {
        this.matrix[c][r] = 0;
      }
    }
  }

  record(target, response, correct, confident, isSine) {
    if (this.mode === 'sine' && !isSine) return;
    if (this.mode === 'instrument' && isSine) return;

    if (!correct) {
      this.matrix[target][response] = (this.matrix[target][response] || 0) + 1;
      this.failureCounts[target].total++;
      if (confident) this.failureCounts[target].confidentWrong++;
    } else {
      this.failureCounts[target].correct++;
      this.lastCorrect = target;
    }
  }

  weightedFailureRate(note) {
    const f = this.failureCounts[note];
    if (!f) return 0;
    const total = f.total + f.correct;
    if (total === 0) return 0;
    const weighted = f.confidentWrong * 3 + (f.total - f.confidentWrong);
    return weighted / total;
  }

  mostConfusedWith(note, activeNotes) {
    const row = this.matrix[note];
    if (!row) return null;
    let best = null, bestCount = -1;
    for (const candidate of activeNotes) {
      if (candidate === note) continue;
      const count = row[candidate] || 0;
      if (count > bestCount) { bestCount = count; best = candidate; }
    }
    return best;
  }

  // Top N off-diagonal pairs for contrastive drilling
  topConfusedPairs(n = 3) {
    const pairs = [];
    for (const target of CHROMAS) {
      for (const response of CHROMAS) {
        if (target === response) continue;
        const count = this.matrix[target][response] || 0;
        if (count > 0) pairs.push({ target, response, count });
      }
    }
    pairs.sort((a, b) => b.count - a.count);
    return pairs.slice(0, n);
  }

  // Returns a flat 12×12 array suitable for rendering
  toGrid() {
    return CHROMAS.map(target =>
      CHROMAS.map(response => this.matrix[target]?.[response] || 0)
    );
  }

  // For register diagnostic: failure rate per chroma per octave
  // Requires octave-level tracking — pass optional octaveMatrix
}

// Singleton store — three matrices
export class MatrixStore {
  constructor() {
    this.all = new ConfusionMatrix('all');
    this.sine = new ConfusionMatrix('sine');
    this.instrument = new ConfusionMatrix('instrument');
  }

  record(target, response, correct, confident, isSine) {
    this.all.record(target, response, correct, confident, isSine);
    this.sine.record(target, response, correct, confident, isSine);
    this.instrument.record(target, response, correct, confident, isSine);
  }
}
