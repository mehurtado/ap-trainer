import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHROMAS, INSTRUMENTS } from '../audio/constants.js';
import { estimate, VERSIONS, contextKey, benchmarkEligible } from './model.js';
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
function simulate(profile, blocks = 100, context = {}) {
  const random = prng(87),
    rows = [];
  let previous = null;
  const sizes = [];
  for (let b = 0; b < blocks; b++) {
    const model = estimate(rows, 'e', now);
    const block = schedule(model, previous, b + 10, CONFIG, context.session_context ? contextKey(context.session_context) : null);
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
        ...context,
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
test('distracted performance updates acquisition while canonical evidence is preserved', () => {
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
  assert.equal(s.canonical_estimate.stable, true);
  assert.ok(s.accuracy.mean < .7);
  assert.notEqual(s.ability_state, 'regressed');
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

test('entirely noncanonical training expands without claiming sober mastery', () => {
  const r = simulate(() => .99, 100, {
    canonical_condition: false,
    session_context: { sober: false, focused: true, subjective_alertness: 'ordinary' }
  });
  assert.equal(r.sizes.at(-1), 12);
  for (const p of CHROMAS) {
    const s = estimate(r.rows, 'e', now).pitches[p];
    assert.ok(s.accuracy.evidence > 0);
    assert.equal(s.canonical_estimate.accuracy.evidence, 0);
    assert.equal(s.canonical_estimate.status, 'uncertain');
    assert.equal(s.context_generalization, 'uncertain');
    assert.notEqual(s.ability_state, 'stable');
  }
});
test('context does not discount identical observations', () => {
  const rows = Array.from({length: 80}, (_, i) => row('F#', i < 73 ? 'F#' : 'D', i));
  const altered = rows.map(t => ({...t, canonical_condition: false, session_context: {sober: false, focused: false}}));
  const a = estimate(rows, 'e', now).pitches['F#'];
  const b = estimate(altered, 'e', now).pitches['F#'];
  assert.deepEqual(a.accuracy, b.accuracy);
  assert.deepEqual(a.falsePositive, b.falsePositive);
  assert.deepEqual(a.confusion, b.confusion);
  assert.equal(a.median_rt, b.median_rt);
});
test('v1 history is reprocessed and explicit invalidation excludes evidence', () => {
  const rows = Array.from({length: 20}, (_, i) => row('D', 'D', i, {learner_model_version: '1', canonical_condition: false}));
  const s = estimate(rows, 'e', now).pitches.D;
  assert.ok(s.accuracy.evidence < 20 && s.accuracy.evidence > 17);
  assert.equal(s.contexts.unknown.observation_count, 20);
  for (const flag of [{invalidated:true}, {valid:false}, {completed:false}]) {
    assert.equal(estimate(rows.map(t => ({...t, ...flag})), 'e', now).pitches.D.accuracy.evidence, 0);
  }
});
test('conditional estimates retain empirical differences and sparse shrinkage', () => {
  const high = {sober:false, focused:true, subjective_alertness:'ordinary'};
  const sober = {sober:true, focused:true, subjective_alertness:'ordinary'};
  const rows = Array.from({length:100}, (_,i) => row('F#', i < 90 ? 'F#':'D', i, {canonical_condition:false,session_context:high}));
  rows.push(...Array.from({length:100}, (_,i) => row('F#', i < 60 ? 'F#':'D', i, {session_context:sober})));
  let s = estimate(rows, 'e', now).pitches['F#'];
  assert.ok(s.contexts[contextKey(high)].shrunk_accuracy - s.contexts[contextKey(sober)].shrunk_accuracy > .25);
  assert.ok(s.canonical_estimate.accuracy.evidence > 54 && s.canonical_estimate.accuracy.evidence < 55);
  s = estimate(rows.slice(0,100).concat(row('F#','D',1,{session_context:sober})), 'e', now).pitches['F#'];
  const c = s.contexts[contextKey(sober)];
  assert.ok(c.shrunk_accuracy > c.accuracy.mean);
  assert.equal(c.accuracy.evidence, 1);
  assert.equal(c.stable, false);
});
test('benchmarks require canonical conditions and standard audio output', () => {
  const base = {sober:true, focused:true, subjective_alertness:'ordinary', audio_output:'headphones'};
  assert.equal(benchmarkEligible(base), true);
  for (const extra of [{sober:false},{focused:false},{subjective_alertness:'low'},{audio_output:'speakers'}]) {
    assert.equal(benchmarkEligible({...base,...extra}), false);
  }
});

test('scheduler responds to measured context differences without inventing observations', () => {
  const active = ['D', 'F#'];
  const contexts = [{sober:true, focused:true, subjective_alertness:'ordinary'}, {sober:false, focused:true, subjective_alertness:'ordinary'}];
  const rows = contexts.flatMap((c, j) => Array.from({length:120}, (_, i) => {
    const p = active[i % 2];
    return row(p, !j || i % 4 === 0 ? p : active.find(q => q !== p), i, {
      explicit_response_set:active, session_context:c, canonical_condition:!j
    });
  }));
  const m = estimate(rows, 'e', now);
  const prev = {...schedule(m,null,1), explicit_response_set:active};
  const sober = schedule(m,prev,2,CONFIG,contextKey(contexts[0]));
  const high = schedule(m,prev,2,CONFIG,contextKey(contexts[1]));
  assert.ok(sober.scheduler_decision.balanced_named_accuracy > high.scheduler_decision.balanced_named_accuracy);
  assert.ok(high.scheduler_decision.load > sober.scheduler_decision.load);
});
test('adding noncanonical evidence does not overwrite canonical estimates', () => {
  const sober = Array.from({length:50},(_,i)=>row('D','D',i));
  const high = Array.from({length:90},(_,i)=>row('D','F#',i,{canonical_condition:false,session_context:{sober:false}}));
  const before=estimate(sober,'e',now).pitches.D;
  const after=estimate([...sober,...high],'e',now).pitches.D;
  assert.deepEqual(before.canonical_estimate.accuracy,after.canonical_estimate.accuracy);
  assert.ok(after.accuracy.mean < before.accuracy.mean);
});

test('acquisition supersession and pitch locality', () => {
  const old = Array.from({length:100},(_,i)=>row('C#','D',i));
  const fresh = Array.from({length:50},(_,i)=>row('C#','C#',i));
  const a=estimate(old,'e',now).pitches['C#'];
  const b=estimate([...old,...fresh],'e',now).pitches['C#'];
  const errors = x => (1-x.accuracy.mean)*(x.accuracy.evidence+2)-1;
  assert.ok(Math.abs(errors(b)/errors(a)-.5)<1e-10);
  assert.deepEqual(estimate([...old,...Array.from({length:500},(_,i)=>row('G','G',i))],'e',now).pitches['C#'].accuracy,a.accuracy);
});
test('configuration locality and probe purpose weight', () => {
  const old=Array.from({length:30},(_,i)=>row('C#','C#',i,{explicit_response_set:['G','C#','E']}));
  const fresh=Array.from({length:100},(_,i)=>row('C#','C#',i,{explicit_response_set:['G','C#']}));
  const key='C#,E,G|3000';
  assert.deepEqual(estimate(old,'e',now).configurations[key],estimate([...old,...fresh],'e',now).configurations[key]);
  const m=estimate([row('C#','C#',0,{trial_purpose:'probe'})],'e',now);
  assert.equal(m.pitches['C#'].accuracy.evidence,1.5);
  assert.equal(Object.values(m.configurations)[0]['C#'].total,1.5);
});
test('90-day inactivity halves evidence without manufacturing regression', () => {
  const rows=Array.from({length:100},(_,i)=>row('C#','C#',i));
  const a=estimate(rows,'e',now).pitches['C#'];
  for(const days of [30,90,360]) {
    const b=estimate(rows,'e',now+days*86400000).pitches['C#'];
    assert.notEqual(b.ability_state,'regressed');
    if(days===90) assert.ok(Math.abs(b.accuracy.evidence/a.accuracy.evidence-.5)<1e-10);
  }
});
test('rapid learning responds faster than 30-day-only weighting', () => {
  const rows=Array.from({length:200},(_,i)=>row('C#',i<100 ? (i%5<3?'C#':'D') : (i%20?'C#':'D'),i));
  const current=estimate(rows,'e',now).pitches['C#'].accuracy.mean;
  assert.ok(current > (155+1)/202+.09);
});
test('same-day acquisition is strong but retention needs delayed retrieval', () => {
  const rows=Array.from({length:100},(_,i)=>row('C#','C#',i));
  rows.push(...Array.from({length:100},(_,i)=>row('G','G',i)));
  const a=estimate(rows,'e',now).pitches['C#'];
  assert.equal(a.acquisition_state,'strong');
  assert.equal(a.retention.evidence,0);
  assert.equal(a.stable,false);
  const probes=Array.from({length:4},(_,i)=>row('C#','C#',i,{trial_purpose:'probe',delay_since_exposure_ms:86400000*(i+1)}));
  const b=estimate([...rows,...probes],'e',now).pitches['C#'];
  assert.equal(b.retention.evidence,4);
  assert.equal(b.retentionStable,true);
  assert.equal(b.retention.longest_successful_delay_ms,4*86400000);
  assert.deepEqual(estimate([...rows,...probes,...rows],'e',now).pitches['C#'].retention,b.retention);
  assert.equal(estimate(probes,'e',now+180*86400000).pitches['C#'].retention.evidence,2);
  assert.equal(estimate([row('C#','C#',0,{trial_purpose:'probe',delay_since_exposure_ms:86399999})],'e',now).pitches['C#'].retention.evidence,0);
});
test('two of three qualified pitches expand with diagnostics and no retention', () => {
  const active=['G','C#','E'];
  const rows=active.flatMap(p=>Array.from({length:60},(_,i)=>row(p,p==='E'&&i%2?'G':p,i,{explicit_response_set:active})));
  const m=estimate(rows,'e',now), previous={explicit_response_set:active,response_window_ms:3000,scheduler_decision:{}};
  const b=schedule(m,previous,42);
  assert.equal(b.explicit_response_set.length,4);
  assert.equal(b.scheduler_decision.qualified_pitch_count,2);
  assert.equal(b.scheduler_state_snapshot.pitches.E.scheduler.qualifies_for_expansion,false);
});
test('history rebuild is immutable and reproducible, including compatible v2', () => {
  const rows=Array.from({length:70},(_,i)=>Object.freeze(row('C#',i%4?'C#':'G',i,{learner_model_version:'2',timestamp:new Date(now-i*1000).toISOString()})));
  Object.freeze(rows);
  const a=estimate(rows,'e',now);
  assert.equal(a.pitches['C#'].observation_count,70);
  assert.deepEqual(a,estimate(JSON.parse(JSON.stringify(rows)),'e',now));
  assert.deepEqual(a,estimate([...rows].reverse(),'e',now));
});
test('exploration ages label negatives but not inactive acquisition; excluded trials do neither', () => {
  const old=Array.from({length:100},(_,i)=>row('F#','E',i,{explicit_response_set:['E','G']}));
  const fresh=Array.from({length:100},(_,i)=>row('F#','OTHER',i,{explicit_response_set:['E','G'],correct:true}));
  const a=estimate(old,'e',now),b=estimate([...old,...fresh],'e',now);
  assert.equal(b.pitches['F#'].accuracy.evidence,0);
  assert.ok(b.pitches.E.falsePositive.mean<a.pitches.E.falsePositive.mean-.7);
  assert.deepEqual(a.pitches.E.falsePositive,estimate([...old,...fresh.map(t=>({...t,session_type:'benchmark',trial_purpose:'probe'}))],'e',now).pitches.E.falsePositive);
});
