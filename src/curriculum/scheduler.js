import { CHROMAS, INSTRUMENTS, INSTRUMENT_REGISTERS } from '../audio/constants.js';
import { VERSIONS, CRITERIA } from './model.js';
import { posterior, READINESS, components, setReadiness, chanceAnchor } from './readiness.js';
const expansionEvidence = 12;
export const CONFIG = Object.freeze({
  ...READINESS,
  candidateMass: .08, candidateEvidence: expansionEvidence, candidateAccuracyFloor: .25,
  interferenceTolerance: .15, retentionGraceOpportunities: CRITERIA.delayedProbes,
  retentionBlockGraceTrainingDays: 10, candidateHoldNoticeBlocks: 8,
  candidateOverride: null, readinessPerturbation: null,
  blockLength: 24,
  exploration: .2,
  negativeMass: .25,
  minPerPitch: .5,
  maxPerPitch: 1.6,
  expansionEvidence,
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
function nominate(active, model, random, excluded = []) {
  const remaining = shuffle(CHROMAS.filter(p => !active.includes(p) && !excluded.includes(p)), random);
  return remaining.sort((a, b) => score(b) - score(a))[0];
  function score(p) {
    const empirical = active.reduce((n, q) => n + model.pitches[p].confusion[q] + model.pitches[q].confusion[p], 0);
    return empirical + model.pitches[p].uncertainty + (active.length ? Math.min(...active.map(q => distance(p, q))) / (1 + model.pitches[p].observation_count) : 0);
  }
}
// All readiness aggregates use promoted active pitches only. Candidates never add load.
export function expandV3(states, config = CONFIG) {
  const balanced = states.reduce((n, s) => n + s.accuracy.mean, 0) / states.length;
  const uncertainty = states.reduce((n, s) => n + s.uncertainty, 0) / states.length;
  const confusion = states.reduce((n, s) => n + s.falsePositive.mean, 0) / states.length;
  const latency = states.reduce((n, s) => n + (s.median_rt == null ? .5 : Math.min(1, s.median_rt / config.responseWindow)), 0) / states.length;
  const load = (1 - balanced + uncertainty + confusion + latency) / 4;
  const qualified = states.filter(s => s.accuracy.evidence >= config.expansionEvidence && s.accuracy.mean >= config.expansionAccuracy).length;
  const since = states.reduce((n, s) => n + s.accuracy.evidence, 0);
  return { qualified, since, load, would_expand: states.length < 12 && qualified >= Math.max(1, Math.floor(states.length * .75)) && since >= 24 && load < .4 };
}
export function scopedState(model, pitch, configuration, context) {
  const pooled = model.pitches[pitch], c = model.configurations?.[configuration]?.[pitch];
  const ctx = c?.contexts?.[context], fp = pooled.contexts?.[context]?.falsePositive;
  const prior = c ? (c.correct + 1) / (c.total + 2) : .5;
  const accuracy = ctx?.total ? posterior(ctx.correct + 2 * prior, ctx.total - ctx.correct + 2 * (1 - prior), ctx.total)
    : c ? posterior(c.correct + 1, c.total - c.correct + 1, c.total) : posterior(1, 1, 0);
  // Recover the observed negative successes from the existing Beta(1,1) tally.
  const successes = fp ? fp.mean * (fp.evidence + 2) - 1 : 0;
  const falsePositive = fp?.evidence ? posterior(successes + 2 * pooled.falsePositive.mean,
    fp.evidence - successes + 2 * (1 - pooled.falsePositive.mean), fp.evidence) : pooled.falsePositive;
  return { ...pooled, accuracy, falsePositive, uncertainty: accuracy.upper - accuracy.lower,
    median_rt: pooled.contexts?.[context]?.median_rt ?? pooled.median_rt };
}
function bounded(weights, exploration, lo, hi) {
  const total = weights.reduce((a, b) => a + b, 0), n = weights.length;
  let probs = weights.map(w => (1 - exploration) * w / total + exploration / n);
  for (let k = 0; k < 30; k++) {
    probs = probs.map(v => Math.max(lo, Math.min(hi, v)));
    const residual = 1 - probs.reduce((a, b) => a + b, 0);
    const free = probs.map((v, i) => (residual > 0 ? v < hi : v > lo) ? i : -1).filter(i => i >= 0);
    if (!free.length || Math.abs(residual) < 1e-12) break;
    for (const i of free) probs[i] += residual / free.length;
  }
  return probs;
}
const localDay = time => {
  const date = new Date(time);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};
export function schedule(model, previous, seed, config = CONFIG, context = null) {
  config = { ...CONFIG, ...config };
  const random = prng(seed), old = previous?.scheduler_decision;
  let candidate = old?.candidate ? { ...old.candidate } : null;
  const active = [...(old?.active_set ?? (previous?.explicit_response_set ?? []).filter(p => p !== candidate?.pitch))];
  const excluded = config.candidateOverride?.excluded ?? [];
  if (!active.length) {
    active.push(nominate(active, model, random));
    active.push(nominate(active, model, random));
  }
  const evaluatedActive = [...active];
  const configuration = [...(previous?.explicit_response_set ?? active)].sort().join(',') + '|' + (previous?.response_window_ms ?? config.responseWindow);
  const scoped = p => scopedState(model, p, configuration, context);
  const states = active.map(scoped), byPitch = Object.fromEntries(active.map((p, i) => [p, states[i]]));
  const computed_on = localDay(model.computed_at), notices = [];
  const per_pitch = {};
  const score = p => {
    const state = scoped(p), r = components(state, evaluatedActive.length, config);
    const measured = state.accuracy.evidence >= config.expansionEvidence;
    const retentionPending = !state.retention.stable && (state.retention.retention_opportunities ?? 0) >= config.retentionGraceOpportunities;
    const blocked = measured && r.A >= config.a_floor && r.S >= config.s_floor && retentionPending;
    const prior = old?.readiness?.per_pitch?.[p];
    const days = blocked ? (prior?.retention_blocked_days ?? 0) + (old?.computed_on !== computed_on ? 1 : 0) : 0;
    const reportOnly = blocked && (prior?.retention_report_only || days >= config.retentionBlockGraceTrainingDays);
    const reasons = [!measured && 'measured', (r.A == null || r.A < config.a_floor) && 'A',
      (r.S == null || r.S < config.s_floor) && 'S', retentionPending && 'retention'].filter(Boolean);
    if (reportOnly && !prior?.retention_report_only) notices.push('The delayed-recall check for ' + p + ' is still pending. It is no longer holding up progress.');
    return { ...r, qualified: measured && r.A != null && r.A >= config.a_floor && r.S != null && r.S >= config.s_floor && (!retentionPending || reportOnly), reasons,
      retention_blocked_days: days, retention_report_only: Boolean(reportOnly) };
  };
  active.forEach(p => { per_pitch[p] = score(p); });
  if (candidate) per_pitch[candidate.pitch] = score(candidate.pitch);
  const balanced = states.reduce((n, s) => n + s.accuracy.mean, 0) / states.length;
  const confusion = states.reduce((n, s) => n + s.falsePositive.mean, 0) / states.length;
  const latencyLoad = states.reduce((n, s) => n + (s.median_rt == null ? .5 : Math.min(1, s.median_rt / config.responseWindow)), 0) / states.length;
  const { load, since } = expandV3(states, config);
  // Preserve v3's pooled uncertainty and aggregate config evidence in the A/B log.
  const legacyStates = states.map((state, i) => ({ ...state, uncertainty: model.pitches[active[i]].uncertainty,
    accuracy: { ...state.accuracy, evidence: model.configurations?.[configuration]?.[active[i]]?.total ?? 0 } }));
  const v3_comparison = expandV3(legacyStates, config);
  v3_comparison.would_expand = Boolean(previous && v3_comparison.would_expand);
  const qualified = active.filter(p => per_pitch[p].qualified).length, required = Math.max(1, Math.floor(active.length * .75));
  const readinessSet = setReadiness(active.map(p => per_pitch[p].R), config);
  const perturb = config.readinessPerturbation;
  const threshold = config.setReadinessThreshold + (perturb ? (perturb.direction === 'above' ? 1 : -1) * perturb.delta : 0);
  const gates = { qualification: qualified >= required, evidence: since >= 24, load: load < .4,
    capacity: active.length + (candidate ? 1 : 0) < 12,
    regression: states.every(s => s.ability_state !== 'regressed'),
    readiness: readinessSet != null && readinessSet >= threshold,
    candidate_slot: !candidate, measured: active.every(p => byPitch[p].accuracy.evidence > 0 && per_pitch[p].R != null) };
  let action = 'consolidate', history = [...(old?.candidate_history ?? [])];
  const resolve = (outcome, reason) => {
    history.push({ pitch: candidate.pitch, introduced_at: candidate.introduced_at, resolved_at: new Date(model.computed_at).toISOString(),
      outcome, block_span: candidate.blocks_held + 1, reason });
  };
  if (candidate && config.candidateOverride?.withdraw) {
    resolve('withdrawn-by-user', config.candidateOverride.reason || 'Paused by learner');
    action = 'withdraw';
    notices.push(candidate.pitch + ' has been set aside. It will not be suggested again until you bring it back from Settings.');
    candidate = null;
  } else if (candidate) {
    candidate.evidence = scoped(candidate.pitch).accuracy.evidence;
    candidate.A = per_pitch[candidate.pitch].A;
    // Scope exception: only interference compares pooled accuracy to its own past.
    const dropped = Object.keys(candidate.baseline).filter(p => model.pitches[p].accuracy.lower < candidate.baseline[p].lower - config.interferenceTolerance);
    candidate.hold_reason = candidate.evidence < config.candidateEvidence ? 'evidence'
      : candidate.A == null || candidate.A < config.candidateAccuracyFloor ? 'learning'
      : dropped.length ? 'interference' : !gates.load ? 'load' : !gates.regression ? 'regression' : null;
    if (!candidate.hold_reason) {
      resolve('promoted', 'Demonstrated learning without detected interference');
      active.push(candidate.pitch); action = 'promote';
      notices.push(candidate.pitch + ' has joined the set properly and will now receive regular practice.');
      candidate = null;
    } else {
      candidate.blocks_held++;
      if (candidate.hold_reason === 'interference' && old?.candidate?.hold_reason !== 'interference') notices.push(candidate.pitch + ' is still on trial. Accuracy for ' + dropped.join(', ') + ' has dropped since it started. That might be the new note, or a break in practice. You can pause the trial from Settings.');
      if (candidate.hold_reason === 'regression' && old?.candidate?.hold_reason !== 'regression') notices.push('An established note needs more practice. Promotion is paused; you can review the trial in Settings.');
      if (candidate.blocks_held === config.candidateHoldNoticeBlocks) notices.push(candidate.pitch + ' has been on trial for a while without settling. You can keep going or pause it from Settings.');
    }
  } else if (previous && Object.values(gates).every(Boolean)) {
    const pitch = nominate(active, model, random, excluded);
    if (pitch) {
      action = 'activate';
      candidate = { pitch, introduced_at_block_id: null, introduced_at: new Date(model.computed_at).toISOString(),
        baseline: Object.fromEntries(active.map(p => [p, { mean: model.pitches[p].accuracy.mean, lower: model.pitches[p].accuracy.lower, evidence: model.pitches[p].accuracy.evidence }])),
        evidence: 0, A: null, blocks_held: 0, hold_reason: 'evidence' };
      per_pitch[pitch] = score(pitch);
      notices.push('New note on trial: ' + pitch + '. It will show up occasionally while we see how it fits before it joins properly.');
    }
  }
  history = history.slice(-24);
  const candidates = candidate ? [candidate.pitch] : [], explicit = [...active, ...candidates];
  const inactive = CHROMAS.filter(p => !explicit.includes(p));
  const candidateShare = candidate ? config.candidateMass : 0;
  if (candidateShare < 0 || candidateShare > config.maxPerPitch / explicit.length) throw new Error('Candidate share exceeds the sampling cap');
  const negativeShare = inactive.length ? Math.max(0, config.negativeMass - candidateShare) : 0;
  const activeShare = 1 - candidateShare - negativeShare;
  const weights = active.map(p => {
    const state = scoped(p), overdue = state.retention.last_probe ? Math.min(1, (model.computed_at - Date.parse(state.retention.last_probe)) / 604800000) : 1;
    return 1 + (1 - state.accuracy.mean) + state.uncertainty + overdue + (state.acquisitionStable ? 1 - state.retention.mean : 0) + state.falsePositive.mean;
  });
  const probs = bounded(weights, config.exploration, config.minPerPitch / active.length, Math.min(.65, config.maxPerPitch / active.length));
  const distribution = Object.fromEntries(CHROMAS.map(p => [p, 0]));
  active.forEach((p, i) => { distribution[p] = probs[i] * activeShare; });
  if (candidate) distribution[candidate.pitch] = candidateShare;
  const buckets = [[], [], []];
  inactive.forEach(p => { const d = Math.min(...explicit.map(q => distance(p, q))); buckets[d <= 1 ? 0 : d <= 3 ? 1 : 2].push(p); });
  const nonempty = buckets.filter(b => b.length);
  inactive.forEach(p => { distribution[p] = negativeShare * (config.exploration / inactive.length + (1 - config.exploration) / nonempty.length / nonempty.find(b => b.includes(p)).length); });
  const probeWeights = active.map(p => {
    const retention = model.pitches[p].retention;
    return 1 + 1 / (1 + retention.evidence) + Math.max(0, (retention.retention_opportunities ?? 0) - retention.evidence) / (1 + (retention.retention_opportunities ?? 0));
  });
  const probeProbs = bounded(probeWeights, config.exploration, config.minPerPitch / active.length, 1);
  const probe_distribution = Object.fromEntries(active.map((p, i) => [p, probeProbs[i]]));
  const roles = Object.fromEntries(CHROMAS.map(p => [p, candidates.includes(p) ? 'candidate' : !active.includes(p) ? 'exploration' : model.pitches[p].ability_state === 'regressed' ? 'remediation' : model.pitches[p].acquisitionStable ? 'maintenance' : model.pitches[p].observation_count === 0 ? 'diagnostic' : 'acquisition']));
  const objectives = { category_formation: 1 - balanced, chromatic_expansion: (12 - evaluatedActive.length) / 12 * (1 - load), boundary_sharpening: confusion,
    retention: states.filter(s => s.acquisitionStable && !s.retentionStable).length / states.length,
    robustness: evaluatedActive.length === 12 ? balanced * .5 : 0, automaticity: evaluatedActive.length === 12 ? latencyLoad : 0 };
  return {
    ...VERSIONS, explicit_response_set: explicit, sampling_distribution: distribution, probe_distribution,
    out_of_set_distribution: Object.fromEntries(inactive.map(p => [p, negativeShare ? distribution[p] / negativeShare : 0])),
    response_window_ms: action === 'consolidate' && !candidate && active.length === 12 && balanced > .9 && states.every(s => s.accuracy.evidence >= 40)
      ? Math.max(1500, (previous?.response_window_ms ?? config.responseWindow) - 100) : previous?.response_window_ms ?? config.responseWindow,
    feedback_policy: 'immediate training; probe feedback after block', random_seed: seed, block_length: config.blockLength,
    scheduler_decision: { context, configuration, qualified_pitch_count: qualified, required_qualified_pitch_count: required,
      configuration_evidence: since, expansion_gates: gates, action, balanced_named_accuracy: balanced, load, objectives,
      evidence_at_activation: action === 'activate' || !previous ? since : old?.evidence_at_activation,
      active_set: active, computed_on, candidate, candidate_history: history, v3_comparison, notices,
      readiness: { scope: { accuracy: 'configuration', specificity: 'pooled-context', uncertainty: 'configuration', stability: 'pooled-epoch (report-only)' },
        anchors: { chance: chanceAnchor(evaluatedActive.length), accuracy_ceiling: CRITERIA.lowerAccuracy, specificity_floor: CRITERIA.upperFalsePositive,
          specificity_scale: config.specificityScaleFP, uncertainty_scale: config.uncertaintyScale }, weights: config.weights,
        per_pitch, set: readinessSet, threshold: config.setReadinessThreshold,
        perturbation: perturb ? { applied: perturb.direction, delta: perturb.delta, threshold_used: threshold } : null } },
    scheduler_state_snapshot: { roles, pitches: Object.fromEntries(explicit.map(p => {
      const state = scoped(p), r = per_pitch[p];
      return [p, { observation_count: state.observation_count, acquisition: state.acquisition, retention: state.retention,
        scheduler: { configuration_accuracy: state.accuracy.mean, configuration_evidence: state.accuracy.evidence,
          qualifies_for_expansion: r?.qualified ?? false, tier: candidates.includes(p) ? 'candidate' : 'active', readiness: r,
          qualification_reasons: r?.reasons ?? ['measured'] } }];
    })), model }
  };
}
export function generateSequence(block) {
  const random = prng(block.random_seed),
    // Two independent per-pitch counters with independently randomized
    // starting offsets, so timbre and octave rotate on different periods
    // and don't become confounded with each other (spec ~ stimulus balancing).
    instCount = Object.fromEntries(CHROMAS.map(p => [p, Math.floor(random() * INSTRUMENTS.length)])),
    octCount = Object.fromEntries(CHROMAS.map(p => [p, Math.floor(random() * 4)]));
  const usedProbes = new Set();
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
    let target;
    if (i < 4 && block.probe_distribution) {
      let available = Object.entries(block.probe_distribution).filter(([p, mass]) => mass > 0 && !usedProbes.has(p));
      if (!available.length) { usedProbes.clear(); available = Object.entries(block.probe_distribution).filter(([, mass]) => mass > 0); }
      let x = random() * available.reduce((sum, [, mass]) => sum + mass, 0);
      target = available.at(-1)?.[0];
      for (const [p, mass] of available) { x -= mass; if (x <= 0) { target = p; break; } }
      usedProbes.add(target);
    } else target = pick();
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
