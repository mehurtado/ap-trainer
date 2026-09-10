import { CHROMAS } from '../audio/constants.js';
export const VERSIONS = Object.freeze({
  schema_version: 2,
  learner_model_version: '1',
  scheduler_version: '1',
  benchmark_version: '2',
  stimulus_generator_version: '2'
});
export const POLICY = Object.freeze({
  adaptive: 1,
  probe: 1.5,
  mapping: 1.5,
  benchmark: 0,
  custom: .25,
  drill: .1
});
export const CRITERIA = Object.freeze({
  minEvidence: 40,
  lowerAccuracy: .8,
  upperFalsePositive: .12,
  latency: 1800,
  sessions: 3,
  delayedProbes: 3,
  delayMs: 86400000,
  halfLifeMs: 30 * 86400000
});
export function beta(success, total) {
  const a = 1 + success,
    b = 1 + total - success;
  const mean = a / (a + b),
    sd = Math.sqrt(a * b / ((a + b) ** 2 * (a + b + 1)));
  return {
    mean,
    lower: Math.max(0, mean - 1.96 * sd),
    upper: Math.min(1, mean + 1.96 * sd),
    evidence: total
  };
}
export const median = xs => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
const rate = rows => rows.length ? rows.filter(t => t.correct).length / rows.length : null;

// Rebuild solely from observations; scheduler roles are deliberately absent here.
export function estimate(trials, epoch, now = Date.now(), criteria = CRITERIA) {
  const valid = trials.filter(t => t.schema_version === 2 && t.learner_model_version === VERSIONS.learner_model_version && t.stimulus_generator_version === VERSIONS.stimulus_generator_version && CHROMAS.includes(t.target_pitch)).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const pitches = Object.fromEntries(CHROMAS.map(p => {
    const exposures = valid.filter(t => t.target_pitch === p);
    const named = exposures.filter(t => t.explicit_response_set.includes(p));
    const canonical = named.filter(t => t.canonical_condition && (POLICY[t.session_type] ?? 0) > 0);
    const weight = t => (POLICY[t.trial_purpose] ?? POLICY[t.session_type] ?? 0) * Math.pow(.5, Math.max(0, now - Date.parse(t.timestamp)) / criteria.halfLifeMs) * (t.training_epoch === epoch ? 1 : .15);
    const sum = (rows, pred = () => true) => rows.reduce((n, t) => n + (pred(t) ? weight(t) : 0), 0);
    const accuracy = beta(sum(canonical, t => t.correct), sum(canonical));
    const negatives = valid.filter(t => t.target_pitch !== p && t.explicit_response_set.includes(p) && t.canonical_condition && (POLICY[t.session_type] ?? 0) > 0);
    const falsePositive = beta(sum(negatives, t => t.response === p), sum(negatives));
    const recent = canonical.filter(t => t.training_epoch === epoch).slice(-30);
    const rt = median(recent.filter(t => t.correct).map(t => t.latency_ms));
    const sessions = new Set(canonical.filter(t => t.training_epoch === epoch).map(t => t.session_id)).size;
    const probes = canonical.filter(t => t.training_epoch === epoch && t.trial_purpose === 'probe' && t.delay_since_exposure_ms >= criteria.delayMs);
    const delayed = probes.filter(t => t.correct).length;
    const previous = canonical.slice(0, -12);
    let hits = 0;
    const previouslyStrong = previous.some((t, i) => {
      hits += Number(t.correct);
      return i + 1 >= criteria.minEvidence && hits / (i + 1) >= .9;
    });
    const regression = previouslyStrong && recent.length >= 12 && rate(recent.slice(-12)) < .6;
    const stable = accuracy.evidence >= criteria.minEvidence && accuracy.lower > criteria.lowerAccuracy && falsePositive.upper < criteria.upperFalsePositive && rt !== null && rt < criteria.latency && sessions >= criteria.sessions && delayed >= criteria.delayedProbes && rate(probes) >= .8;
    const state = regression ? 'regressed' : stable ? 'stable' : !canonical.length ? 'unknown' : accuracy.mean >= .7 ? 'emerging' : 'unstable';
    const confusion = Object.fromEntries(CHROMAS.concat('OTHER', 'TIMEOUT').map(r => [r, named.filter(t => t.response === r).length]));
    const groups = key => Object.fromEntries([...new Set(named.map(t => t[key]))].map(v => [v, {
      count: named.filter(t => t[key] === v).length,
      accuracy: rate(named.filter(t => t[key] === v))
    }]));
    const calibrated = recent.filter(t => t.confidence != null);
    return [p, {
      ability_state: state,
      accuracy,
      falsePositive,
      uncertainty: accuracy.upper - accuracy.lower,
      observation_count: named.length,
      exposure_count: exposures.length,
      median_rt: rt,
      canonical_accuracy: rate(recent),
      training_accuracy: rate(named.filter(t => t.session_type === 'adaptive')),
      benchmark_accuracy: rate(named.filter(t => t.session_type === 'benchmark')),
      confusion_probability: Object.fromEntries(Object.entries(confusion).map(([q, n]) => [q, named.length ? n / named.length : null])),
      confidence_calibration: calibrated.length ? calibrated.reduce((n, t) => n + (t.confidence - Number(t.correct)) ** 2, 0) / calibrated.length : null,
      confusion,
      robustness: {
        octave: groups('octave'),
        timbre: groups('timbre'),
        context: groups('canonical_condition')
      },
      retention: {
        delayed_probes: probes.length,
        delayed_correct: delayed,
        last_exposure: exposures.at(-1)?.timestamp ?? null,
        last_probe: canonical.filter(t => t.trial_purpose === 'probe').at(-1)?.timestamp ?? null,
        previously_strong: previouslyStrong
      },
      trend: recent.length >= 12 ? rate(recent.slice(-6)) - rate(recent.slice(-12, -6)) : null
    }];
  }));
  const other = {};
  for (const t of valid.filter(t => !t.explicit_response_set.includes(t.target_pitch))) {
    const key = [...t.explicit_response_set].sort().join(',');
    other[key] ??= {
      total: 0,
      correct: 0
    };
    other[key].total++;
    other[key].correct += Number(t.correct);
  }
  const configurations = {};
  for (const t of valid.filter(t => t.canonical_condition && t.training_epoch === epoch && ['adaptive', 'mapping'].includes(t.session_type))) {
    const key = [...t.explicit_response_set].sort().join(',') + '|' + (t.response_window_ms ?? 3000);
    configurations[key] ??= Object.fromEntries(CHROMAS.map(p => [p, {
      correct: 0,
      total: 0
    }]));
    if (t.explicit_response_set.includes(t.target_pitch)) {
      const stat = configurations[key][t.target_pitch];
      const w = Math.pow(.5, Math.max(0, now - Date.parse(t.timestamp)) / criteria.halfLifeMs);
      stat.total += w;
      stat.correct += Number(t.correct) * w;
    }
  }
  return {
    pitches,
    other,
    configurations,
    computed_at: now,
    training_epoch: epoch,
    ...VERSIONS
  };
}
