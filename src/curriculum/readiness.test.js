import { test } from 'node:test';
import assert from 'node:assert/strict';
import { posterior, recognition, specificity, components, pitchReadiness, setReadiness, quantile, stability, READINESS } from './readiness.js';
import { shrinkEstimate, VERSIONS, COMPATIBLE_LEARNER_MODEL_VERSIONS } from './model.js';
const near = (a, b, tolerance = 1e-12) => assert.ok(Math.abs(a - b) < tolerance, a + ' != ' + b);
test('compatibility whitelist has no historical gaps', () => {
  assert.ok(Object.isFrozen(COMPATIBLE_LEARNER_MODEL_VERSIONS));
  for (let i = 1; i <= Number(VERSIONS.learner_model_version); i++) assert.ok(COMPATIBLE_LEARNER_MODEL_VERSIONS.includes(String(i)));
});
test('posterior reproduces Laplace and empirical shrinkage means exactly', () => {
  for (const n of [1, 3.7, 12, 40, 100]) for (const fraction of [0, .2, .7, 1]) {
    const c = n * fraction, mean = (c + 1) / (n + 2);
    near(posterior(c + 1, n - c + 1, n).mean, mean);
    for (const prior of [.2, .5, .9]) near(posterior(c + 2 * prior, n - c + 2 * (1 - prior), n).mean, shrinkEstimate(c, n, { mean: prior }));
  }
  assert.deepEqual(posterior(1, 1, 0), { mean: .5, lower: 0, upper: 1, evidence: 0 });
});
test('type 7 quantiles at all operating set sizes', () => {
  for (const n of [2, 3, 4, 5, 6, 12]) near(quantile(Array.from({length:n}, (_, i) => i + 1)), 1 + .25 * (n - 1));
  near(quantile([10, 1, 4]), 2.5);
});
test('recognition reproduces the lower-bound table and ignores candidate count', () => {
  for (const [n, m, expected] of [[12,.82,.683],[24,.82,.773],[40,.82,.827],[12,.9,.906],[40,.75,.674],[24,.7,.504],[12,.7,.397],[24,.6,.300],[12,.5,0]]) {
    near(recognition(posterior(m * (n + 2), (1 - m) * (n + 2), n), 3), expected, .0015);
  }
  assert.equal(recognition(posterior(1,1,0),3), null);
});
test('specificity reproduces negative-opportunity table', () => {
  for (const [rate,n,expected] of [[0,40,1],[0,20,.941],[0,10,.369],[.05,40,.844],[.1,40,.467],[.2,40,0]]) near(specificity(posterior(1+rate*n,1+(1-rate)*n,n)), expected, .004);
});
test('readiness renormalizes missing components and preserves threshold brackets', () => {
  near(pitchReadiness({A:.8,S:null,U:.4}), (.55*.8+.15*.4)/.7);
  assert.equal(pitchReadiness({A:null,S:1,U:1}),null);
  assert.equal(setReadiness([.5,null]),null);
  near(setReadiness([.788,.464,.443]),.526, .001);
  const floor = pitchReadiness({A:READINESS.a_floor,S:READINESS.s_floor,U:.323});
  near(floor,.471,.001); near(setReadiness([floor,floor,0]),.287,.001);
  assert.ok(READINESS.setReadinessThreshold < floor && READINESS.setReadinessThreshold > setReadiness([floor,floor,0]));
});
test('stability is a decline-only diagnostic with an approximate reference', () => {
  assert.equal(stability(null,null),null); assert.equal(stability([1,1,1],1),null);
  assert.equal(stability([.2,.4,.6,.8],.5).D,0);
  const s = stability([.875,.5,.875,.5],.6875);
  near(s.D,.375); near(s.reference_band,2.06*Math.sqrt(.6875*.3125/8));
});

// Integration checks use deliberately explicit counts so each gate is independently observable.

test('worked snapshot is reproduced from its posterior inputs',()=>{
  const values=[[24,.82,0,.788],[40,.75,.2,.443],[24,.7,.1,.464]].map(([n,m,fp,expected])=>{
    const r=components({accuracy:posterior(m*(n+2),(1-m)*(n+2),n),falsePositive:posterior(1+fp*40,1+(1-fp)*40,40)},3);
    near(r.R,expected,.001);return r.R;
  });
  near(setReadiness(values),.526,.001);
});
