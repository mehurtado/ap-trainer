# Acquisition and retention (learner v3 / scheduler v4)

Acquisition uses purpose × epoch × 2^(-newer relevant observations/50) ×
2^(-age/90 days). Relevant named targets form independent pitch sequences;
configuration estimates form independent pitch/response-set/window sequences.
Label false positives use independent negative-opportunity sequences. Exploration
contributes to confusion and label negatives, but never names an inactive target.
Canonical and context-specific estimates retain their own observation sequences,
so a context shift does not overwrite canonical evidence. Sparse configuration
contexts retain the existing two-observation shrinkage toward their pooled estimate.

Retention uses named, valid, evidence-bearing probes with a recorded exposure
delay of at least 24 hours. Their Beta posterior uses 180-day temporal decay only:
no purpose, epoch, or observation-count discount. Unknown delays do not qualify.
Raw probe counts, effective evidence, successful delays, and timestamps are separate.
The existing approximate 95% Beta bounds are retained.

Acquisition strength requires 40 effective observations, lower accuracy > .80,
false-positive upper < .12, median correct RT < 1800 ms, and three sessions.
Retention requires at least three delayed probes, mean >= .80 and lower >= .50.
Overall stability also requires canonical acquisition support. With Beta(1,1),
three perfect probes reach exactly .80 only before temporal decay; in practice
four may be needed. Strong acquisition can receive maintenance pressure before
retention is established. Only eligible delayed probes reset the retention clock.

Expansion now distinguishes recognition, specificity, and evidence quality. Recognition
uses the configuration posterior lower bound; specificity uses the pooled/context
false-positive upper bound. A conjunctive per-pitch predicate is combined with the
relative floor(.75 × active count), minimum one, rule. Total evidence >= 24,
load < .40, all active pitches measured, no regression, and overall readiness >= .45
are required to introduce a candidate. Stability variability is diagnostic only.

Candidates are genuine named choices at 8% of training sampling mass. They become
active after 12 weighted configuration observations and recognition >= .25, without
detected interference, high load, or regression. Promotion preserves the vocabulary
and its configuration evidence. Introduction changes the configuration and evidence
must accumulate again. Candidate mass is carved out of negative sampling (.25 to .17),
leaving active mass at .75. Probes target distinct active notes with bounded bias.

Retention gates otherwise-ready notes after three session opportunities for delayed
retrieval. Ten blocked training days make this gate report-only for that note, with
a notice. Opportunities count sessions; the breaker counts local training dates.
Neither clock advances merely because the learner is idle. A same-day second block
does not increment the counter. Retention stays recorded after its gate is waived.

Withdrawal is human-initiated, at the next block boundary. It is an exceptional
rollback of the provisional vocabulary only; the promoted active set is monotone.
Settings captures the reason and shows blocks held and recent trend. The learner,
rather than an automatic counter, judges whether a trajectory warrants withdrawal.
Set-aside notes remain excluded until explicitly restored in Settings. The scheduler
is pure; the UI persists candidateOverride and a one-introduction readinessPerturbation
in the existing meta store. There is no database schema change.

The sole accuracy scope exception is interference: pooled lower bounds are compared
with their own introduction baseline because the configuration changes at introduction.
The v3 comparison retains v3's pooled uncertainty and configuration aggregate evidence;
v4 load and recognition use the unified configuration/context posterior. Weighted
pseudo-counts mean the approximate 95% confidence coverage is not exact.

No history migrations or writes are performed. Schema 2/model 1, 2 and 3 observations
with compatible stimulus semantics are rebuilt. Evidence values are weighted trial
equivalents; observation/exposure and confusion counts remain separately available.
Constants are starting hypotheses, not calibrated optima.

Validation: npm test; npm run build. Dedicated regression cases cover supersession,
pitch/configuration locality, inactivity, rapid acquisition, retention separation,
delayed probes, expansion, history compatibility/reproducibility, purpose weighting,
and exploration false positives.

## Constants and provenance

| Constant | Value | Where | Provenance | Revision path |
|---|---|---|---|---|
| `readinessAccuracyCeiling` (`a₁`) | `.80` | readiness.js | **Reused** — `CRITERIA.lowerAccuracy` (`model.js:21`), already the lower‑bound bar for `acquisitionStable`. `A_p = 1` ⟺ the pitch meets the existing stability bar. | Moves only if `CRITERIA.lowerAccuracy` moves. Must be *the same symbol*, not a copy. |
| `a_floor` | `.55` | CONFIG | **Prior (calibrated to one example).** §5.2's table shows the shape it produces (required config mean ≈ .765@n=12 → .72@n=24 → .69@n=40), but the *value* was chosen so a pitch at v3's current bar clears comfortably and the snapshot's C♯ does not. That is one anchor point, not a derivation. | Re‑derive from the §5.2 table if the anchors change. **Never** tune by "it didn't expand." |
| `specificityFloorFP` (`s₀`) | `.12` | readiness.js | **Reused** — `CRITERIA.upperFalsePositive`. `S_p = 1` ⟺ the FP upper bound meets the existing specificity bar. | Tied to `CRITERIA`. |
| `specificityScaleFP` (`s₁`) | `.30` | CONFIG | **Prior.** Proposal said `.25` on the FP *mean*; `.30` on the FP *upper bound* is approximately as strict, since a Beta(1,1) upper bound sits ~.08–.10 above the mean at realistic negative counts. | Prior. |
| `s_floor` | `.40` | CONFIG | **Prior (calibrated to one example).** §5.3's table shows it corresponds to ≈ "no worse than 10% FP at 40 opportunities," but the value was chosen so the snapshot's E (20% FP) fails outright. Same status as `a_floor`. | Re‑derive from §5.3. |
| `uncertaintyScale` | `.50` | CONFIG | **Derived (example‑independent).** The proposal's `.30` maps a v3‑*passing* pitch (CI width ≈ .39 at n = 12) to `U_p = 0`, making the component dead across its whole operating range. `.50` gives U ≈ .22/.54/.72 at n = 12/40/100 — live throughout. No snapshot reference. | Low priority (weight .15). |
| `R_p` weights | A `.55` / S `.30` / U `.15` | CONFIG | **Prior.** Exact renormalization of v1's A/S/U over the dropped `T` weight is `.5625/.3125/.125`; these are those values rounded to two decimals. The rounding shifts any `R_p` by < .012 and `R_set` by < .003 (verified in §5.6). Disclosed as rounding, not presented as derivation. | Prior. |
| `stabilityWindow` (`w`) | `8` observations | CONFIG | **From proposal** (its smallest window). **Diagnostic only** — feeds no gate. | — |
| `stabilityMinWindows` / `MaxWindows` | `4` / `8` | CONFIG | **Derived (example‑independent):** 4 × 8 = 32 = the proposal's largest window, the minimum for a 4‑sample dispersion statistic; up to 8 so the diagnostic sharpens as evidence grows. **Diagnostic only.** | — |
| `quantile` convention | type‑7, linear on `(n−1)` | readiness.js | **Pinned convention.** Conventions diverge ~2× at n = 3, which is exactly the operating point. | Frozen; changing it is a `scheduler_version` bump. |
| `R_set` blend | `.65` mean / `.35` Q₀.₂₅ | CONFIG | **From proposal**, unchanged — including its structural weakness at small n, documented in §5.6. | Delete the whole term if it never binds (see §5.6). |
| `setReadinessThreshold` | `.45` | CONFIG | **Derived (example‑independent), bracketed:** strictly below `.471` = the `R_set` of a set in which *every* pitch sits exactly at its per‑pitch floors — so `R_set` can never be the binding constraint on a set the per‑pitch predicate already accepts as uniformly marginal; strictly above `.287` = the weakest set the `.75` relative rule permits at |active| = 3 (two at floor + one collapsed) — so it retains bite against at‑floor‑plus‑one‑collapsed sets. **Caveat:** both brackets are functions of `a_floor`/`s_floor`, which are calibrated‑to‑one‑example, so this inherits a share of that status even though its own arithmetic is snapshot‑free. | Re‑derive whenever `a_floor`/`s_floor` move. |
| `candidateMass` | `.08` | CONFIG | **Prior**, midpoint of the proposal's 5–10%. ≈ 1.9 trials per 24‑trial block. | Prior. |
| `candidateEvidence` | `12` | CONFIG | **Reused/tied** — same symbol as `expansionEvidence`. ≈ 6 blocks of candidacy. | Tied to `expansionEvidence`. |
| `candidateAccuracyFloor` | `.25` (on `A_p`) | CONFIG | **Prior.** Promotion requires *demonstrable learning*, not mastery — deliberately far below `a_floor`. | Prior. |
| `interferenceTolerance` | `.15` | CONFIG | **Prior**, from the proposal's "no existing pitch falls > 15 points." Applied to the pooled CI **lower bound**, not the mean. | Prior. |
| `retentionGraceOpportunities` | `3` | CONFIG | **Reused/tied** — `CRITERIA.delayedProbes = 3`. A pitch is exempt from the retention sub‑gate until it has had at least as many *opportunities* for a delayed probe as the criterion demands probes. | Tied to `CRITERIA.delayedProbes`. |
| `retentionBlockGraceTrainingDays` | `10` | CONFIG | **Prior.** Roughly double §4.3's "≥ 5 days with perfect targeting" ceiling, so the breaker fires only after targeting has demonstrably failed rather than merely been unlucky. | Prior; raise if the breaker fires spuriously. |
| `candidateHoldNoticeBlocks` | `8` | CONFIG | **Prior.** How long a candidate may sit held (interference or insufficient learning) before the UI proactively asks the human to decide. | Prior. |
| `expansionEvidence` `12` · aggregate `since ≥ 24` · `load < .40` · `|A| < 12` | unchanged | CONFIG | **Existing v3 constants, deliberately preserved** for continuity of the historical record. | — |


### Recognition

| `n` | `m` | `lower` | `A_p` | reading |
|---|---|---|---|---|
| 12 | .82 | .626 | **.683** | a pitch that passes v3 *today* — comfortably clears `a_floor = .55` |
| 24 | .82 | .675 | .773 | |
| 40 | .82 | .705 | .827 | |
| 12 | .90 | .748 | .906 | |
| 40 | .75 | .621 | .674 | the snapshot's E — passes on recognition, fails on specificity |
| 24 | .70 | .527 | .504 | **the snapshot's C♯ — fails** |
| 12 | .70 | .468 | .397 | fails |
| 24 | .60 | .415 | .300 | fails |
| 12 | .50 | .247 | .000 | at chance |
| 0 | — | — | **null** | unmeasured — *not* 0 |

### Specificity

| FP rate | `N` | `fp.upper` | `S_p` |
|---|---|---|---|
| 0 | 40 | .069 | 1.00 |
| 0 | 20 | .131 | .941 |
| 0 | 10 | .234 | .369 (thin evidence, honestly penalized) |
| 5% | 40 | .148 | .844 |
| 10% | 40 | .216 | .467 |
| **20% (the E case)** | 40 | .337 | **0** |

### 5.6 `R_p`, `quantile`, `R_set` — and an honest account of what `R_set` can and cannot do

```
R_p    = Σ w_c · c  over non-null components, with weights RENORMALIZED over the non-null set
         w = { A: .55, S: .30, U: .15 }
R_p    = null if A_p is null   // an unmeasured pitch has no readiness; it is not "low readiness"
```

```
quantile(sorted, .25)  // TYPE-7, pinned: idx = .25*(n−1); interpolate between floor/ceil
R_set  = .65 · mean(R_p) + .35 · quantile(R_p, .25)
R_set  = null if any active R_p is null
```

**Worked example, required in the docs — the snapshot that motivated the entire proposal.** (v1's version of this table contained an arithmetic error: C♯'s `U` was copied from G's. Corrected here. `chance = .25`, `uncertaintyScale = .50`.)

| pitch | source numbers | A | S | U | `R_p` |
|---|---|---|---|---|---|
| G | n = 24, m = .82, 0 FP @ N = 40 | .773 | 1.000 | .420 | **.788** |
| E | n = 40, m = .75, **20% FP @ N = 40** | .674 | **0** | .482 | **.443** |
| C♯ | n = 24, m = .70, 10% FP @ N = 40 | .504 | .467 | .309 | **.464** |

`mean = .565`; `Q₀.₂₅` (type‑7, n = 3, idx = .5) `= (.443 + .464)/2 = .453`; **`R_set = .65(.565) + .35(.453) = .526`.**
(Using the exact unrounded weights `.5625/.3125/.125` instead gives `R_set = .529` — a difference of `.003`, which is why the rounding in §2 is disclosed as immaterial.)

Reference points, same formula:
- **All three exactly at their per‑pitch floors** (`A = a_floor = .55`, `S = s_floor = .40`, `U ≈ .323` at n = 24): `R_p = .471` each ⇒ `R_set = .471`.
- **All three strong** (n = 40, m = .82, 0 FP): `R_p = .836` each ⇒ `R_set = .836`.
- **All three weak** (n = 24, m ≈ .55, 10% FP): `R_p = .290` each ⇒ `R_set = .290`.
- **Weakest set the `.75` relative rule permits at |active| = 3** (two at floor, one collapsed to 0): `R_set = .287`.

**`setReadinessThreshold = .45` is therefore bracketed, not fitted:** strictly below `.471` so `R_set` can never veto a set that the per‑pitch predicate has already accepted as uniformly marginal (v1's `.60` did exactly that, which contradicted v1's own claim that `R_set` is not the load‑bearing gate); strictly above `.287` so it still catches at‑floor‑plus‑one‑collapsed sets. That the motivating snapshot lands at `.526`, above threshold, is a **consistency check, not the derivation** — and the derivation's brackets are themselves functions of `a_floor` and `s_floor`, so it inherits a share of their one‑anecdote status.

**The finding that changes how `R_set` should be read.** The proposal justified the `.65·mean + .35·Q₀.₂₅` blend as preventing "one disastrous category hidden by two excellent ones" — *"G can't completely carry a terrible C♯."* At |active| = 3 the blend **cannot do this.** Two excellent pitches plus one collapsed to zero scores `R_set = .508`; three pitches sitting exactly at their floors scores `.471`. The "bad" configuration scores **higher** than the marginal one. No single threshold can accept the latter and reject the former, so no setting of `setReadinessThreshold` achieves the proposal's stated purpose at the set size this system actually operates at. The dispersion job is done instead by the **conjunctive per‑pitch predicate** and the **`.75` relative rule** — at the snapshot above, `qualified = 1` (only G) against `required = 2`, so the set consolidates.

`R_set` is kept anyway, for three reasons that are worth its small cost: it is the only continuous set‑level summary in the record, it is the quantity §5.7's perturbation study varies, and it retains genuine bite against broad low‑level mediocrity and against at‑floor‑plus‑collapse. **Disposition to write into the docs:** if after six months of real use `expansion_gates.readiness` has never once been the sole false gate, delete the term and the constant. Recording `readiness` on every block makes that a five‑minute question to answer.

**v4a's verdict on the motivating snapshot, stated for the docs:** `action = 'consolidate'`, blocked by `qualified_pitch_count = 1 < required 2`. The per‑pitch reasons read: **G qualifies. E fails specificity** (20% of inappropriate responses go to E — a well‑recognized pitch with a broken category boundary). **C♯ fails recognition** (lower bound `.527` below the `.55` floor — not enough evidence to say the category exists). v3 produced one number, `qualified = 1`, with no way to see that E's and C♯'s problems are *different kinds of problem*. **That distinction is the entire value of this change**, and it should be the first thing the docs say.


## 12. Known limitations — to be reproduced in the docs

These are not risks to be mitigated; they are properties of the design that a future reader must not discover by surprise.

1. **Two decision‑critical constants are fit to one anecdote.** `a_floor` and `s_floor` were chosen so the G/E/C♯ snapshot lands on the intended side. §5.7 explains why nothing in this system will ever calibrate them: no mechanism will introduce a candidate over their objection, so no counterfactual evidence about them can ever be generated. They are permanent priors unless a second real anchor appears.
2. **One absolute veto survives.** `regression` — one pitch, indefinite freeze. Narrowly triggered and pedagogically defended (§6.2), but the same mechanism *shape* the proposal's rejected floor had.
3. **`R_set` is near‑inert at |active| = 3** and structurally cannot achieve the "one disaster can't be carried by two stars" purpose the proposal assigned it (§5.6). It is retained for its record value and as the perturbation substrate, with an explicit delete‑if‑never‑binds disposition.
4. **`A_p` and `U_p` are drawn from the same posterior.** Reducing `U`'s weight dilutes the double‑counting; it does not remove it (§5.4).
5. **The 95% CI coverage is approximate**, because `configurations[key][p].total` is a weighted pseudo‑count, not an integer trial count (§5.1).
6. **Interference detection can misattribute a post‑break dip** to candidate interference, because pooled accuracy decays over 50 observations / 90 days (§7.5). This is why it holds promotion and raises a question rather than acting.
7. **The stability reference band is optimistic.** It is a normal approximation; binomial discreteness at w = 8 is material (§5.5). It is a diagnostic, never a test.
8. **Expansion pacing is measured in evidence, not calendar time.** This is **expected behaviour, not a bug,** and belongs in the docs in those words. A daily trainer and a three‑times‑a‑week trainer will experience very different real‑world speeds from identical per‑block logic, because every gate in this system counts *observations* — `expansionEvidence`, `since ≥ 24`, `candidateEvidence`, the stability windows, the decay half‑lives. Two consequences a learner will actually notice: a candidacy sized at ~6 blocks can stretch over many weeks of real time for a sporadic trainer; and the stability windows can span months, blending session‑start "cold" trials into a single window. The two deliberate exceptions are `retention_opportunities` (counted in first‑blocks‑of‑session, so idleness does not burn grace) and `retention_blocked_days` (counted in training days, so idleness does not trip the circuit breaker either) — both exist specifically because retention is the one construct that is *about* elapsed time, and both are documented in §4.3/§4.3a.

---


## 13. Epistemic status — to be reproduced in `docs/acquisition-retention.md`

Van Hedger et al. (2019) validates the *scaffolding strategy* — gradually widening an active pitch set from three toward twelve in adults — but publishes no comparable "when do we add the next pitch" gate. **Neither v3's 82% nor v4a's readiness model is empirically calibrated against the AP literature; both are engineering priors.**

What v4a actually buys is **diagnostic granularity.** It can distinguish:
- a well‑recognized pitch with a broken category boundary (**E**: 75% accurate, absorbing 20% of wrong answers → fails on specificity),
- from a poorly‑measured one (**C♯**: 70% on 24 observations, lower bound .527 → fails on recognition),
- from a genuinely ready one (**G**),

which v3 structurally could not, because v3 never inspected false positives or evidence quality at all — it saw three numbers above or below .82. That is a real and well‑targeted improvement, and it is the improvement the docs should claim.

It is **not** a more scientifically grounded answer to "how much interference is tolerable." It is not more probabilistic than v3 — `R_set` is one more boolean threshold. It has *more* gate machinery than v3, not less. And two of its constants are fit to a single snapshot of one learner. The documentation must not claim otherwise, and the map view's plain‑language sentences must describe what was measured, never imply a standard that was validated.

## Operational interpretation and validation

The learner-model version stays 3 because existing derived values and observation
interpretation are unchanged. Only additive diagnostics were added. The widening
compatibility whitelist explicitly includes 1, 2, and 3. Bump the learner version only
when existing interpretation changes, and always retain every historical version.
Scheduler version 4 distinguishes the new policy. No historical records are rewritten.

The optional six-point threshold experiment clears after one introduction. It probes
set readiness only; it cannot calibrate the recognition or specificity floors, because
neither is overridden. Stability has no gating role. The chance anchor excludes the
candidate, making recognition mildly conservative; as active sets grow, the same floor
is less strict in raw accuracy.

Implementation deviations discovered by running fixtures: the old single-weak-note
simulation sends every error to the first other note. At two active notes this creates
both recognition failure and excessive false positives, contradicting the new specificity
gate. Its isolated-weakness case now uses TIMEOUT errors; an explicit overbroad-response
archetype independently asserts specificity rejection. The isolated-weakness 12-note endpoint
and 140-block budget remain. The fast learner introduces note twelve at block 96
and promotes it at block 110. Its budget is extended from 100 to 120 to assert full
promotion, while retaining the original under-100 vocabulary-introduction assertion. Synthetic fixtures that replace explicit_response_set now also
replace active_set, the authoritative v4 tier state; sampling assertions are unchanged.
The G/C#/E fixture now qualifies only C#: G fails specificity and E fails recognition.

Run npm test and npm run build. Run npm run lint and report pre-existing failures
separately; do not hide unrelated failures. The browser smoke exercises candidate naming,
null diagnostics, saved roles/reasons, and Settings withdrawal in an isolated browser.

### 11.3 Watch protocol — the actual safety mechanism

For the first **two weeks of real sessions**, after each session:

1. Open the map view. Does every pitch's top‑line sentence match your own sense of that note? A sentence that reads wrong is the highest‑signal bug report this system can produce.
2. Read the latest block's `scheduler_decision`. Specifically: `action`, `expansion_gates` (which are false), `qualified_pitch_count` vs `required`, and **`v3_comparison.would_expand`**.
3. **The one thing to look hard at:** blocks where `v3_comparison.would_expand` disagrees with v4a's `action`. Every disagreement should be *explicable in one sentence* ("v3 would have expanded because E is at 84%, v4a didn't because E is absorbing 20% of wrong answers"). An inexplicable disagreement is a bug.
4. If expansion has not fired in ~2 weeks of normal practice and no gate reason reads as legitimate, **do not tune `a_floor` downward.** Re‑derive it from §5.2's table, or record the observation and change nothing. Tuning a floor until the gate opens converts a measurement into a formality.
5. Note whether `expansion_gates.readiness` is ever the *sole* false gate. §5.6 predicts it will not be. If six months pass without it binding once, delete `R_set` and its constant.

Only after those two weeks, and only if something looks wrong, build the corresponding reactive archetype from §10.3 to reproduce it.

---
