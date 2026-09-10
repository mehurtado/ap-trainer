import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHROMAS, INSTRUMENTS } from '../audio/constants.js';
import { estimate, VERSIONS } from './model.js';
import { schedule, generateSequence, prng, CONFIG } from './scheduler.js';
import { benchmark } from './benchmark.js';
const now = Date.UTC(2026, 8, 9);
function row(p, response, i, extra = {}) {
  return {
    ...VERSIONS,
    target_pitch: p,
    response,
    correct: p === response,
    explicit_response_set: CHROMAS,
    session_type: 'adaptive',
    trial_purpose: 'training',
    canonical_condition: true,
    training_epoch: 'e',
    timestamp: new Date(now).toISOString(),
    session_id: `s${Math.floor(i / 12) % 4}`,
    latency_ms: 900,
    octave: 4,
    timbre: 'sine',
    confidence: .9,
    ...extra
  };
}
function simulate(profile, blocks = 100) {
  const random = prng(87),
    rows = [];
  let previous = null;
  const sizes = [];
  for (let b = 0; b < blocks; b++) {
    const model = estimate(rows, 'e', now);
    const block = schedule(model, previous, b + 10);
    sizes.push(block.explicit_response_set.length);
    for (const t of generateSequence(block)) {
      const p = t.target_pitch,
        active = block.explicit_response_set;
      const seen = rows.filter(r => r.target_pitch === p && r.explicit_response_set.includes(p)).length;
      const probability = profile(p, seen, b);
      const expected = active.includes(p) ? p : 'OTHER';
      const response = random() < probability ? expected : active.find(q => q !== p);
      rows.push(row(p, response, b, {
        ...t,
        explicit_response_set: active,
        correct: response === expected
      }));
    }
    previous = block;
  }
  return {
    sizes,
    rows,
    previous
  };
}
test('fast learner expands without calendar gating', () => {
  const r = simulate(() => .99);
  assert.equal(r.sizes.at(-1), 12);
  assert.ok(r.sizes.indexOf(12) < 100);
});
test('slow learner eventually expands as evidence improves', () => {
  const r = simulate((p, n) => Math.min(.99, .6 + n * .012));
  assert.ok(r.sizes.at(-1) > 2);
});
test('single weak category does not block global expansion', () => {
  const r = simulate(p => p === schedule(estimate([], 'e', now), null, 10).explicit_response_set[0] ? .2 : .99, 140);
  assert.equal(r.sizes.at(-1), 12);
});
test('broad confusion slows expansion', () => {
  const r = simulate(() => .4);
  assert.equal(r.sizes.at(-1), 2);
});
test('noisy learner never oscillates vocabulary', () => {
  const r = simulate((p, n, b) => b % 2 ? .95 : .3);
  assert.ok(r.sizes.every((n, i) => !i || n >= r.sizes[i - 1]));
  assert.ok(r.sizes.at(-1) < 12);
});
test('high false positives cannot be stable', () => {
  const rows = Array.from({
    length: 600
  }, (_, i) => row(CHROMAS[i % 12], 'C', i, {
    trial_purpose: 'probe',
    delay_since_exposure_ms: 86400000
  }));
  assert.notEqual(estimate(rows, 'e', now).pitches.C.ability_state, 'stable');
});
test('demonstrated regression triggers remediation, elapsed time alone does not', () => {
  const rows = Array.from({
    length: 600
  }, (_, i) => row(CHROMAS[i % 12], CHROMAS[i % 12], i, {
    trial_purpose: 'probe',
    delay_since_exposure_ms: 86400000
  }));
  assert.equal(estimate(rows, 'e', now).pitches.C.ability_state, 'stable');
  assert.notEqual(estimate(rows, 'e', now + 90 * 86400000).pitches.C.ability_state, 'regressed');
  for (let i = 0; i < 20; i++) rows.push(row('C', 'D', i));
  const m = estimate(rows, 'e', now);
  assert.equal(m.pitches.C.ability_state, 'regressed');
  const prev = schedule(estimate([], 'e', now), null, 1);
  prev.explicit_response_set = CHROMAS;
  assert.equal(schedule(m, prev, 2).scheduler_state_snapshot.roles.C, 'remediation');
});
test('distracted performance affects robustness without canonical regression', () => {
  const rows = Array.from({
    length: 600
  }, (_, i) => row(CHROMAS[i % 12], CHROMAS[i % 12], i, {
    trial_purpose: 'probe',
    delay_since_exposure_ms: 86400000
  }));
  for (let i = 0; i < 100; i++) rows.push(row('C', 'D', i, {
    canonical_condition: false
  }));
  const s = estimate(rows, 'e', now).pitches.C;
  assert.equal(s.ability_state, 'stable');
  assert.equal(s.robustness.context.false.accuracy, 0);
});
test('uncertainty distinguishes absent and abundant evidence; OTHER does not identify inactive pitch', () => {
  const empty = estimate([], 'e', now).pitches.C;
  const rows = Array.from({
    length: 100
  }, (_, i) => row('C', 'OTHER', i, {
    explicit_response_set: ['D'],
    correct: true
  }));
  const s = estimate(rows, 'e', now).pitches.C;
  assert.equal(s.ability_state, 'unknown');
  assert.equal(s.accuracy.evidence, 0);
  assert.equal(s.exposure_count, 100);
  assert.equal(empty.accuracy.evidence, 0);
});
test('benchmark fixed balanced conditions and no adjacent repeats, reproducible', () => {
  const b = benchmark(8);
  assert.deepEqual(b, benchmark(8));
  assert.equal(b.trials.length, 72);
  for (const p of CHROMAS) {
    const ts = b.trials.filter(t => t.target_pitch === p);
    assert.equal(ts.length, 6);
    assert.equal(new Set(ts.map(t => `${t.octave}/${t.timbre}`)).size, 6);
  }
  assert.ok(b.trials.every((t, i) => !i || t.target_pitch !== b.trials[i - 1].target_pitch));
});
test('sampling is normalized with floors, caps, broad negatives and deterministic sequences', () => {
  let m = estimate([], 'e', now),
    prev = null;
  for (let n = 2; n <= 12; n++) {
    const b = schedule(m, prev, 100 + n);
    b.explicit_response_set = CHROMAS.slice(0, n);
    prev = b;
    const next = schedule(m, prev, 200 + n),
      a = next.explicit_response_set;
    assert.ok(Math.abs(Object.values(next.sampling_distribution).reduce((x, y) => x + y, 0) - 1) < 1e-9);
    const mass = a.length < 12 ? .75 : 1;
    for (const p of a) {
      assert.ok(next.sampling_distribution[p] >= mass * CONFIG.minPerPitch / a.length - 1e-9);
      assert.ok(next.sampling_distribution[p] <= mass * Math.min(.65, CONFIG.maxPerPitch / a.length) + 1e-9);
    }
    assert.deepEqual(generateSequence(next), generateSequence(next));
  }
});
test('adaptive stimuli use real instruments, roughly balanced per chroma and not confounded with octave', () => {
  const model = estimate([], 'e', now);
  let block = schedule(model, null, 42);
  block.explicit_response_set = CHROMAS;
  const perChroma = Object.fromEntries(CHROMAS.map(p => [p, {}]));
  const octavesSeenPerInstrument = new Set();
  for (let b = 0; b < 60; b++) {
    block = schedule(model, block, 1000 + b);
    block.explicit_response_set = CHROMAS;
    for (const t of generateSequence(block)) {
      assert.ok(INSTRUMENTS.includes(t.timbre));
      perChroma[t.target_pitch][t.timbre] = (perChroma[t.target_pitch][t.timbre] || 0) + 1;
      octavesSeenPerInstrument.add(`${t.timbre}:${t.octave}`);
    }
  }
  for (const p of CHROMAS) {
    assert.ok(Object.keys(perChroma[p]).length >= INSTRUMENTS.length - 1, `chroma ${p} saw too few distinct instruments`);
  }
  // Each instrument should show up with more than one octave across many blocks
  // (i.e. octave is not a deterministic function of the chosen instrument).
  const octaveCountByInstrument = {};
  for (const key of octavesSeenPerInstrument) {
    const [inst] = key.split(':');
    octaveCountByInstrument[inst] = (octaveCountByInstrument[inst] || 0) + 1;
  }
  for (const inst of INSTRUMENTS) {
    assert.ok((octaveCountByInstrument[inst] || 0) > 1, `${inst} only ever appeared at one octave`);
  }
});
test('benchmark data does not alter canonical learner state', () => {
  const rows = Array.from({
    length: 100
  }, (_, i) => row('C', 'C', i, {
    session_type: 'benchmark',
    trial_purpose: 'benchmark'
  }));
  const s = estimate(rows, 'e', now).pitches.C;
  assert.equal(s.ability_state, 'unknown');
  assert.equal(s.benchmark_accuracy, 1);
});
