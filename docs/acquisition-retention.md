# Acquisition and retention (learner/scheduler v3)

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

Expansion still requires floor(.75 × active count), minimum one, pitches with
configuration evidence >= 12 and mean >= .82, total evidence >= 24 and load < .40.
Retention is not an expansion gate. Snapshots expose individual qualification and
aggregate gate results. Regression still requires historical strength and recent
contradictory pitch-local observations in comparable context; decay cannot cause it.

No history migrations or writes are performed. Schema 2/model 1, 2 and 3 observations
with compatible stimulus semantics are rebuilt. Evidence values are weighted trial
equivalents; observation/exposure and confusion counts remain separately available.
Constants are starting hypotheses, not calibrated optima.

Validation: npm test; npm run build. Dedicated regression cases cover supersession,
pitch/configuration locality, inactivity, rapid acquisition, retention separation,
delayed probes, expansion, history compatibility/reproducibility, purpose weighting,
and exploration false positives.
