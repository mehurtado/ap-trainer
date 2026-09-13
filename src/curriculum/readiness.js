import { CRITERIA, STABILITY_WINDOWS } from './model.js';
export const READINESS = Object.freeze({
  a_floor: .55, s_floor: .40, specificityScaleFP: .30, uncertaintyScale: .50,
  weights: Object.freeze({ A: .55, S: .30, U: .15 }),
  setMeanWeight: .65, setQuantileWeight: .35, setReadinessThreshold: .45,
  ...STABILITY_WINDOWS
});
const clip = x => Math.max(0, Math.min(1, x));
// Evidence is an observed pseudo-count, never the empirical prior's mass.
export function posterior(alpha, beta, evidence = alpha + beta - 2) {
  if (!evidence) return { mean: .5, lower: 0, upper: 1, evidence: 0 };
  const mean = alpha / (alpha + beta);
  const sd = Math.sqrt(alpha * beta / ((alpha + beta) ** 2 * (alpha + beta + 1)));
  return { mean, lower: clip(mean - 1.96 * sd), upper: clip(mean + 1.96 * sd), evidence };
}
export const chanceAnchor = activeCount => activeCount < 12 ? 1 / (activeCount + 1) : 1 / 12;
export function recognition(acc, activeCount) {
  const chance = chanceAnchor(activeCount);
  return acc.evidence ? clip((acc.lower - chance) / (CRITERIA.lowerAccuracy - chance)) : null;
}
export function specificity(fp, config = READINESS) {
  return fp.evidence ? clip((config.specificityScaleFP - fp.upper) / (config.specificityScaleFP - CRITERIA.upperFalsePositive)) : null;
}
export const certainty = (acc, config = READINESS) => acc.evidence ? clip(1 - (acc.upper - acc.lower) / config.uncertaintyScale) : null;
export function pitchReadiness(components, weights = READINESS.weights) {
  if (components.A == null) return null;
  const present = Object.keys(weights).filter(k => components[k] != null);
  return present.reduce((sum, k) => sum + weights[k] * components[k], 0) / present.reduce((sum, k) => sum + weights[k], 0);
}
export function quantile(values, q = .25) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), index = q * (sorted.length - 1);
  const lo = Math.floor(index), hi = Math.ceil(index);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
}
export function setReadiness(values, config = READINESS) {
  if (!values.length || values.some(v => v == null)) return null;
  return config.setMeanWeight * values.reduce((a, b) => a + b, 0) / values.length + config.setQuantileWeight * quantile(values);
}
export function stability(means, rate, size = READINESS.stabilityWindow) {
  if (!means || means.length < READINESS.stabilityMinWindows) return null;
  let D = 0;
  means.forEach((a, i) => means.slice(i + 1).forEach(b => { D = Math.max(D, a - b); }));
  return { D, reference_band: 2.06 * Math.sqrt(rate * (1 - rate) / size), windows: means.length };
}
export function components(state, activeCount, config = READINESS) {
  // A and U share a posterior. The small U weight partially mitigates double-counting.
  const result = { A: recognition(state.accuracy, activeCount), S: specificity(state.falsePositive, config), U: certainty(state.accuracy, config) };
  return { ...result, R: pitchReadiness(result, config.weights), stability: stability(state.recent_window_means, state.recent_window_rate, state.recent_window_size) };
}
