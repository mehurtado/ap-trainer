import { CHROMAS, INSTRUMENTS, INSTRUMENT_REGISTERS } from '../audio/constants.js';
import { VERSIONS } from './model.js';
export const CONFIG = Object.freeze({
  blockLength: 24,
  exploration: .2,
  negativeMass: .25,
  minPerPitch: .5,
  maxPerPitch: 1.6,
  expansionEvidence: 12,
  expansionAccuracy: .82,
  responseWindow: 3000
});
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function shuffle(xs, random) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const distance = (a, b) => {
  const d = Math.abs(CHROMAS.indexOf(a) - CHROMAS.indexOf(b));
  return Math.min(d, 12 - d);
};
function candidate(active, model, random) {
  const remaining = shuffle(CHROMAS.filter(p => !active.includes(p)), random);
  return remaining.sort((a, b) => score(b) - score(a))[0];
  function score(p) {
    const empirical = active.reduce((n, q) => n + model.pitches[p].confusion[q] + model.pitches[q].confusion[p], 0);
    return empirical + model.pitches[p].uncertainty + (active.length ? Math.min(...active.map(q => distance(p, q))) / (1 + model.pitches[p].observation_count) : 0);
  }
}
export function schedule(model, previous, seed, config = CONFIG) {
  const random = prng(seed);
  const active = [...(previous?.explicit_response_set ?? [])];
  if (!active.length) {
    active.push(candidate(active, model, random));
    active.push(candidate(active, model, random));
  }
  const comparable = model.configurations?.[[...active].sort().join(',') + '|' + (previous?.response_window_ms ?? config.responseWindow)];
  const states = active.map(p => {
    const s = model.pitches[p],
      c = comparable?.[p];
    return c ? {
      ...s,
      accuracy: {
        ...s.accuracy,
        mean: (c.correct + 1) / (c.total + 2),
        evidence: c.total
      }
    } : {
      ...s,
      accuracy: {
        ...s.accuracy,
        mean: .5,
        evidence: 0
      }
    };
  });
  const balanced = states.reduce((n, s) => n + s.accuracy.mean, 0) / states.length;
  const uncertainty = states.reduce((n, s) => n + s.uncertainty, 0) / states.length;
  const confusion = states.reduce((n, s) => n + s.falsePositive.mean, 0) / states.length;
  const latencyLoad = states.reduce((n, s) => n + (s.median_rt == null ? .5 : Math.min(1, s.median_rt / config.responseWindow)), 0) / states.length;
  const load = (1 - balanced + uncertainty + confusion + latencyLoad) / 4;
  const qualified = states.filter(s => s.accuracy.evidence >= config.expansionEvidence && s.accuracy.mean >= config.expansionAccuracy).length;
  const since = states.reduce((n, s) => n + s.accuracy.evidence, 0);
  const expand = previous && active.length < 12 && qualified >= Math.max(1, Math.floor(active.length * .75)) && since >= 24 && load < .4;
  if (expand) active.push(candidate(active, model, random));
  const roles = Object.fromEntries(CHROMAS.map(p => [p, !active.includes(p) ? 'exploration' : model.pitches[p].ability_state === 'regressed' ? 'remediation' : model.pitches[p].ability_state === 'stable' ? 'maintenance' : model.pitches[p].observation_count === 0 ? 'diagnostic' : 'acquisition']));
  const inactive = CHROMAS.filter(p => !active.includes(p));
  const mass = inactive.length ? config.negativeMass : 0;
  const weights = active.map(p => {
    const s = model.pitches[p];
    const overdue = s.retention.last_probe ? Math.min(1, (model.computed_at - Date.parse(s.retention.last_probe)) / 604800000) : 1;
    return 1 + (1 - s.accuracy.mean) + s.uncertainty + overdue + s.falsePositive.mean;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  // Clip to feasible bounds then redistribute residual mass without violating them.
  let probs = weights.map(w => (1 - config.exploration) * w / total + config.exploration / active.length);
  const lo = config.minPerPitch / active.length,
    hi = Math.min(.65, config.maxPerPitch / active.length);
  for (let k = 0; k < 30; k++) {
    probs = probs.map(v => Math.max(lo, Math.min(hi, v)));
    const residual = 1 - probs.reduce((a, b) => a + b, 0);
    const free = probs.map((v, i) => (residual > 0 ? v < hi : v > lo) ? i : -1).filter(i => i >= 0);
    if (!free.length || Math.abs(residual) < 1e-12) break;
    for (const i of free) probs[i] += residual / free.length;
  }
  const distribution = Object.fromEntries(CHROMAS.map(p => [p, 0]));
  active.forEach((p, i) => distribution[p] = probs[i] * (1 - mass));
  const buckets = [[], [], []];
  inactive.forEach(p => {
    const d = Math.min(...active.map(q => distance(p, q)));
    buckets[d <= 1 ? 0 : d <= 3 ? 1 : 2].push(p);
  });
  const nonempty = buckets.filter(b => b.length);
  for (const p of inactive) {
    const bucket = nonempty.find(b => b.includes(p));
    distribution[p] = mass * (config.exploration / inactive.length + (1 - config.exploration) / nonempty.length / bucket.length);
  }
  const objectives = {
    category_formation: 1 - balanced,
    chromatic_expansion: (12 - active.length) / 12 * (1 - load),
    boundary_sharpening: confusion,
    retention: states.filter(s => s.ability_state === 'stable').length / states.length,
    robustness: active.length === 12 ? balanced * .5 : 0,
    automaticity: active.length === 12 ? latencyLoad : 0
  };
  return {
    ...VERSIONS,
    explicit_response_set: active,
    sampling_distribution: distribution,
    out_of_set_distribution: Object.fromEntries(inactive.map(p => [p, distribution[p] / mass])),
    response_window_ms: !expand && active.length === 12 && balanced > .9 && states.every(s => s.accuracy.evidence >= 40) ? Math.max(1500, (previous?.response_window_ms ?? config.responseWindow) - 100) : previous?.response_window_ms ?? config.responseWindow,
    feedback_policy: 'immediate training; probe feedback after block',
    random_seed: seed,
    scheduler_decision: {
      action: expand ? 'activate' : 'consolidate',
      balanced_named_accuracy: balanced,
      load,
      objectives,
      evidence_at_activation: expand || !previous ? states.reduce((n, s) => n + s.accuracy.evidence, 0) : previous.scheduler_decision.evidence_at_activation
    },
    scheduler_state_snapshot: {
      roles,
      model
    },
    block_length: config.blockLength
  };
}
export function generateSequence(block) {
  const random = prng(block.random_seed),
    // Two independent per-pitch counters with independently randomized
    // starting offsets, so timbre and octave rotate on different periods
    // and don't become confounded with each other (spec ~ stimulus balancing).
    instCount = Object.fromEntries(CHROMAS.map(p => [p, Math.floor(random() * INSTRUMENTS.length)])),
    octCount = Object.fromEntries(CHROMAS.map(p => [p, Math.floor(random() * 4)]));
  let previous = null;
  const pick = () => {
    let x = random();
    for (const p of CHROMAS) {
      x -= block.sampling_distribution[p];
      if (x <= 0) return p;
    }
    return CHROMAS.at(-1);
  };
  return Array.from({
    length: block.block_length
  }, (_, i) => {
    let target = pick();
    if (i < 4 && target === previous) {
      for (let attempt = 0; attempt < 100 && target === previous; attempt++) target = pick();
    }
    previous = target;
    instCount[target] ??= 0;
    octCount[target] ??= 0;
    const inst = INSTRUMENTS[instCount[target]++ % INSTRUMENTS.length];
    const reg = INSTRUMENT_REGISTERS[inst];
    const octave = reg.min + (octCount[target]++ % (reg.max - reg.min + 1));
    return {
      target_pitch: target,
      octave,
      timbre: inst,
      stimulus_type: 'instrument-sample',
      detuning: 0,
      noise_configuration: null,
      sample_id: null,
      sample_onset_offset: 0,
      trial_purpose: i < 4 ? 'probe' : 'training',
      intertrial_ms: 900 + Math.floor(random() * 900)
    };
  });
}
