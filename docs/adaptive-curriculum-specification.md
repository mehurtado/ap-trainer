# AP Trainer — Adaptive Chromatic Curriculum Specification

## 1. Objective

Replace fixed level/note-set progression with an adaptive curriculum that builds and maintains a model of the learner's representation of all twelve pitch classes.

The long-term objective is:

$$
\boxed{\text{fast, accurate, retained 12-way pitch-class identification}}
$$

that generalizes across reasonable changes in octave, timbre, and presentation conditions.

The training trajectory is approximately:

$$
\text{category formation}
\rightarrow
\text{chromatic expansion}
\rightarrow
\text{boundary discrimination}
\rightarrow
\text{automaticity}
\rightarrow
\text{retention}.
$$

Three principles govern pacing:

1. **Exposure is aggressive.**
2. **Sustained cognitive load is adaptive.**
3. **Mastery is declared conservatively.**

There is no predetermined pitch sequence and no calendar-based progression.

---

# 2. Architectural Separation

The application must separate three systems:

$$
\boxed{\text{Learner Model}}
$$

$$
\boxed{\text{Scheduler}}
$$

$$
\boxed{\text{Benchmark}}
$$

### Learner Model

Answers:

> What does current evidence imply about the learner's pitch representation?

It consumes raw observations and produces estimates with uncertainty.

### Scheduler

Answers:

> Given those estimates, what should the learner experience next?

It chooses the next training configuration.

### Benchmark

Answers:

> Under a fixed protocol, how capable is the learner?

It is independent of the adaptive training policy.

The learner model must not simply encode whatever the scheduler currently believes should be trained.

---

# 3. Fundamental Objects

Let

$$
U=\mathbb Z_{12}
$$

be the complete pitch-class universe.

Maintain independently:

1. pitch universe \(U\);
2. explicit response vocabulary \(A_b\);
3. trial sampling distribution \(P_b(p)\);
4. learner-state estimates;
5. scheduler roles;
6. scheduler objectives;
7. stimulus configuration;
8. standardized benchmark performance.

None of these concepts should collapse into `level`.

---

# 4. No Predetermined Pitch Sets

The adaptive curriculum must not encode a canonical progression based on:

* major/minor scales;
* triads;
* circle-of-fifths order;
* chromatic order;
* fixed increasingly large pitch sets.

The explicit response vocabulary is an output of the scheduler:

$$
A_b=g(M_t,\text{objectives},\text{constraints}),
$$

where \(M_t\) is the current learner model.

Chromatic geometry may inform early exploration, but empirical confusion data should increasingly supersede theoretical pitch spacing.

---

# 5. Separate Ability State From Scheduler Role

Do not combine these into one state machine.

## Learner ability state

For each pitch:

```text id="h1mp20"
unknown
emerging
unstable
stable
regressed
```

These labels describe inferred ability.

## Scheduler role

Independently assign:

```text id="rjvsaf"
exploration
acquisition
maintenance
remediation
diagnostic
```

These describe what the trainer is currently doing with the pitch.

Therefore a pitch may simultaneously be:

```text id="ld0oe6"
ability_state = stable
scheduler_role = maintenance
```

or:

```text id="vgaczn"
ability_state = regressed
scheduler_role = remediation
```

This prevents training policy from being confused with learner ability.

---

# 6. Multidimensional Learner Model

Do not reduce learner state prematurely to one mastery number.

For pitch \(i\), maintain estimates for:

$$
S_i=
(A_i,R_i,C_i,L_i,T_i,F_i,U_i)
$$

representing:

* accuracy/sensitivity;
* response latency;
* confidence calibration;
* retention;
* robustness;
* false-positive/confusion behavior;
* uncertainty.

Pairwise relations are also first-class data.

The learner model is therefore not merely:

$$
S=\prod_iS_i.
$$

Maintain a confusion structure:

$$
M_{ij}=P(\hat j\mid i).
$$

Introducing one pitch may alter performance on another. That interaction is meaningful.

---

# 7. Do Not Hide Important Weaknesses Inside a Mastery Average

A scalar summary may exist for display or coarse scheduling, but it must not be authoritative.

For example:

* excellent accuracy + poor retention;
* moderate accuracy + excellent retention;
* excellent hit rate + high false-positive rate

are different learner states.

Important transitions should use explicit criteria rather than a weighted average alone.

For example, `stable` may eventually require:

$$
A_i>A_{\min}
$$

AND

$$
FP_i<FP_{\max}
$$

AND

$$
RT_i<RT_{\max}
$$

AND sufficient observations across sessions

AND successful delayed probes.

Exact thresholds remain configurable and empirically tunable.

---

# 8. Uncertainty Is First-Class

An estimate based on 10 observations must not be treated like the same estimate based on 200 observations.

The learner model should use regularized or Bayesian estimates where practical rather than raw rolling percentages.

For binary quantities such as correct identification of a given pitch, a beta-binomial model is an acceptable initial implementation.

The scheduler should distinguish:

$$
\boxed{\text{no evidence}}
$$

from

$$
\boxed{\text{evidence of poor performance}}.
$$

Both may produce uncertainty or training priority, but for different reasons.

---

# 9. Exposure, Acquisition, and Stability Are Distinct

A pitch can be exposed without being learned.

A pitch can be actively acquired without being stable.

A pitch can be stable while receiving very little targeted training.

Conceptually:

$$
\text{exposure: fast}
$$

$$
\text{acquisition: medium}
$$

$$
\text{stability/retention: slow}.
$$

A valid state might therefore be:

```text id="rmvjyx"
Pitch classes encountered:    9
Explicit response classes:    7
Under active acquisition:     3
Stable:                       3
Uncertain:                    2
```

There is no required temporal schedule connecting these quantities.

---

# 10. No Calendar-Based Progression

Do not encode:

```text id="qxvs6j"
one pitch per week
X sessions before expansion
Y days at N pitch classes
```

Time enters the model because it provides information about:

* retention;
* forgetting;
* consolidation;
* reacquisition.

Curriculum expansion operates on accumulated evidence and may occur within one sitting.

---

# 11. Curriculum Blocks

The smallest unit at which the response vocabulary can change is a **curriculum block**.

For block \(b\):

$$
A_b\subseteq U
$$

is the explicit response vocabulary.

Once the block begins:

$$
\boxed{A_b\text{ remains fixed until the block ends.}}
$$

The following cannot change mid-block:

* selectable pitches;
* inactive pitch positions;
* availability of OTHER.

This prevents the UI from leaking information about the current stimulus.

---

# 12. Block Boundary Does Not Imply Curriculum Change

A block boundary is an opportunity to update the learner model.

It does **not** require the scheduler to modify the task.

Most block boundaries may produce:

$$
A_{b+1}=A_b.
$$

Major structural changes such as activating another response category should require sufficient accumulated evidence, potentially spanning multiple blocks.

This prevents 20-trial hill-climbing and scheduler oscillation.

---

# 13. Block Length

A nominal block may contain approximately 20–30 trials for manageable training sessions.

However, this is a **UI/training unit**, not necessarily a sufficient statistical sample.

With many explicit categories, one block may contain too few observations per class to justify structural decisions.

The learner model accumulates evidence across blocks and sessions.

---

# 14. Stable Explicit Response Vocabulary

Under normal adaptive training:

$$
A_1\subseteq A_2\subseteq\cdots\subseteq U.
$$

Once a pitch becomes explicitly selectable, it ordinarily remains selectable.

Its presentation probability may decrease substantially.

A regressed pitch remains selectable but receives increased remediation.

### Exceptional rollback

The system may support deliberate rollback if activation was clearly premature and overall performance becomes persistently overloaded.

Rollback must:

* occur only at a block/session boundary;
* require stronger evidence than ordinary reweighting;
* be logged as a curriculum intervention;
* never occur because of one poor block.

Monotonic activation remains the default.

---

# 15. Permanent Response Layout

Every chroma receives one fixed spatial location.

For example:

```text id="nqz62u"
 C    C#    D    Eb    E    F

 F#    G    Ab    A    Bb    B
```

Positions never change across:

* blocks;
* sessions;
* scheduler decisions;
* activation;
* regression.

Inactive positions remain visible but noninteractive.

Do not:

* randomize positions;
* compact active buttons;
* reorder by probability;
* reorder by mastery.

---

# 16. Latency Interpretation

Measured latency:

$$
RT=t_{\text{response}}-t_{\text{auditory onset}}
$$

contains:

$$
RT=
T_{\text{perception}}
+
T_{\text{decision}}
+
T_{\text{visual/motor response}}.
$$

Stable button locations minimize variation in the final term.

Use high-resolution timing such as `performance.now()`.

Where possible, measure latency relative to the scheduled/known Web Audio onset rather than merely the invocation of playback.

---

# 17. Acoustic-Onset Control

Different samples may contain different attack delays or leading silence.

If latency is analytically important:

* trim or normalize leading silence;
* store sample onset offsets where relevant;
* avoid comparing raw RT across stimulus types with systematically different onset characteristics without correction.

Also record:

```text id="eh14x5"
input_method
audio_output_type
device_context
```

where practical.

These variables are primarily analytical covariates, not scheduler inputs.

---

# 18. Sparse Response Mode

Before all twelve pitches are explicit, the UI displays:

$$
A_b+\text{OTHER}.
$$

Example arbitrary scheduler state:

$$
A_b=\{D,F,A\flat,B\}.
$$

UI:

```text id="etrc22"
 ·     ·     D     ·     ·     F

 ·     ·    Ab     ·     ·     B

              OTHER
```

This set is illustrative only.

No particular pitch collection is privileged.

---

# 19. OTHER Semantics

For target \(p\):

$$
y=
\begin{cases}
p,&p\in A_b\\
OTHER,&p\notin A_b.
\end{cases}
$$

OTHER is a negative-category response.

It does not mean:

> identify the exact inactive pitch.

It means:

> this stimulus does not match any explicit category.

---

# 20. OTHER Must Be Scored Separately

Aggregate accuracy can be misleading when OTHER represents many chromas.

Do not allow high OTHER accuracy to conceal weak named-pitch identification.

Track separately:

### Named-pitch balanced accuracy

Average identification performance across explicit pitches.

### OTHER accuracy

$$
P(\widehat{OTHER}=OTHER\mid p\notin A_b).
$$

### Per-pitch false positives

For explicit pitch \(i\):

$$
P(\hat i=i\mid p\neq i).
$$

The difficulty controller must not rely on raw overall accuracy.

---

# 21. OTHER Is Conditional on the Explicit Set

OTHER changes meaning as \(A_b\) expands.

Therefore:

$$
P(\widehat{OTHER}=OTHER)
$$

from two different response vocabularies is not directly comparable.

Store and analyze OTHER performance conditional on:

$$
A_b.
$$

Do not plot a single longitudinal “OTHER accuracy” curve without accounting for response-set composition.

---

# 22. Out-of-Set Sampling Must Be Structured

Out-of-set trials should include a mixture of:

* chromatically near negatives;
* medium-distance negatives;
* far negatives;
* broad/random negatives.

Do not make OTHER artificially easy by overwhelmingly sampling pitches far from explicit categories.

Do not make it predictable by repeatedly using the same neighboring pitch.

The negative distribution must be stored for every block.

---

# 23. Sampling Probability and Button Availability Are Independent

A pitch can remain pressable while appearing rarely.

For example, an arbitrary block could have:

$$
A_b=\{D,F,A\flat,B\}
$$

with:

$$
P(D)=.10,\quad
P(F)=.30,\quad
P(A\flat)=.15,\quad
P(B)=.15,\quad
P(OTHER)=.30.
$$

All four pitch buttons remain equally available.

Sampling probabilities are not shown during training.

---

# 24. Sampling Floors and Caps

Adaptive weighting must have bounds.

### Maintenance floor

Every explicit pitch receives enough occasional sampling to detect regression.

### Oversampling cap

No weak pitch should become so frequent that its high prior probability becomes an exploitable response strategy.

The exact bounds should depend on response-set size and be configurable.

This prevents:

$$
P(p)\gg P(q)
$$

from becoming an unintended cue.

---

# 25. Difficulty Controller

Do not use raw aggregate accuracy as the control signal.

The controller should consider:

* balanced named-pitch accuracy;
* OTHER performance separately;
* uncertainty;
* response-set size;
* confusion structure;
* latency;
* recent stability;
* task configuration.

A normalized challenge metric should eventually replace simple raw thresholds.

During initial implementation, thresholds such as 82–88% may be used only for **balanced named-category performance within comparable configurations**, not as universal accuracy targets.

---

# 26. Instability / Load Estimate

Estimate unresolved cognitive load using multiple dimensions rather than the weakest pitch alone.

Conceptually:

$$
B=
g(
\text{uncertainty},
\text{error rates},
\text{confusions},
\text{latency},
|A_b|
).
$$

Low load:

> expansion may be useful.

Moderate load:

> maintain configuration and collect evidence.

High load:

> consolidate and rebalance.

One weak category should not automatically freeze expansion.

---

# 27. Scheduler Objective

The scheduler's ultimate objective is not:

> maximize next-block accuracy.

Nor is it:

> maximize information gain.

The objective is:

$$
\boxed{\text{maximize progress toward retained, fast, full-chromatic AP}}
$$

subject to manageable training difficulty.

Information gain, weakness targeting, and short-term accuracy are subordinate signals.

---

# 28. Scheduler Priority

A candidate scheduling priority may consider:

$$
Q_i=
g(
W_i,
U_i,
R_i,
X_i,
G_i,
H_i
)
$$

where:

* \(W_i\): weakness;
* \(U_i\): uncertainty;
* \(R_i\): retention need;
* \(X_i\): confusion/boundary importance;
* \(G_i\): chromatic/curriculum value;
* \(H_i\): historical evidence.

The initial policy should be explicit and interpretable.

Do not begin with an opaque ML policy.

---

# 29. Broad Sampling / Exploration Floor

Adaptive targeting must not consume the entire distribution.

Reserve a configurable fraction for broad sampling.

Conceptually:

$$
P=
(1-\epsilon)P_{\text{adaptive}}
+
\epsilon P_{\text{broad}}.
$$

A starting value near:

$$
\epsilon=.20
$$

may be experimentally evaluated.

This supports:

* regression detection;
* model calibration;
* avoidance of scheduler overfitting;
* continued exposure to strong categories.

---

# 30. Evidence Accumulation and Recency

Historical observations should not all have equal weight.

The learner model should account for:

* time since observation;
* training epoch;
* software/stimulus protocol version;
* session context;
* mode.

Recent valid evidence generally receives more weight for current scheduling.

Older evidence remains useful for:

* retention analysis;
* reacquisition analysis;
* long-term history.

---

# 31. Training Epochs

Introduce an explicit `training_epoch`.

An epoch may begin after:

* a prolonged hiatus;
* major curriculum redesign;
* major stimulus-generation change;
* destructive historical data discontinuity;
* explicit user reset.

Old epochs remain preserved.

Current-state estimation may downweight prior epochs while still using them for historical comparison.

---

# 32. Retention Model

Retention priority must be operational rather than vague.

For each pitch, track at minimum:

* time since meaningful exposure;
* time since clean diagnostic probe;
* previous stable performance;
* current performance;
* evidence of decay after intervals.

The scheduler should distinguish:

$$
\text{not tested recently}
$$

from:

$$
\text{tested recently and demonstrably regressed}.
$$

Regression requires evidence, not merely elapsed time.

---

# 33. Training Trials vs Probe Trials

Adaptive sessions may contain distinct trial purposes.

### Training trial

Provides normal immediate feedback and contributes primarily to learning.

### Probe trial

Used primarily to estimate current ability.

Feedback may be delayed or withheld until an appropriate point.

### Benchmark trial

Belongs to the standardized benchmark and is analyzed separately.

Every trial stores:

```text id="m2bgjc"
trial_purpose
```

The learner model may weight these trial types differently.

---

# 34. Feedback Policy

Feedback behavior must be explicitly specified.

For normal training:

* correctness may be shown immediately;
* target identity may be shown after an incorrect response;
* replay behavior must be consistent and logged.

For probes:

* avoid immediate feedback where it would contaminate subsequent diagnostic trials;
* feedback may occur after a small probe group or block.

For benchmarks:

* no trial-by-trial correctness feedback.

Feedback configuration must be stored.

---

# 35. Second Instinct

Second instinct is a metacognitive measurement.

It must not replace the original response for ordinary accuracy calculations.

Store:

```text id="sc4fjo"
first_response
second_instinct
second_instinct_latency
```

where available.

A wrong first response followed by a correct second instinct remains a wrong primary identification, while providing useful secondary evidence.

---

# 36. Context and Canonical Ability

Session context may include:

```text id="r3b4uj"
sober/intoxicated
focused/distracted
distraction_type
subjective_alertness
audio_output
```

However, these conditions should not initially influence the scheduler equally.

Define a **canonical acquisition condition**, approximately:

* sober;
* reasonably focused;
* ordinary listening setup;
* no deliberate concurrent task.

Primary ability/stability estimates should preferentially use canonical or comparable conditions.

Distracted/intoxicated/adversarial trials are useful for robustness analysis but should not cause a stable category to be declared regressed without corroboration under canonical conditions.

---

# 37. Stimulus Balancing

Pitch identity must not become confounded with stimulus properties.

Across sufficient observations, approximately balance or orthogonalize:

$$
\text{chroma}
\times
\text{octave}
\times
\text{timbre}
\times
\text{stimulus type}.
$$

Avoid situations where one chroma is disproportionately presented:

* in an easier octave;
* with a familiar timbre;
* as sine tones;
* under cleaner conditions.

Store the complete stimulus configuration per trial.

---

# 38. Sequence Effects

Immediate auditory memory can produce apparent AP performance.

The generator should control or analyze:

* consecutive identical chromas;
* repeated interval transitions;
* predictable transition patterns.

In diagnostic and benchmark contexts, avoid immediate identical-pitch repetitions unless intentionally testing them.

Store enough sequence information to analyze:

$$
P(\hat p_t=p_t\mid p_{t-1}).
$$

This can reveal dependence on previous-pitch references.

---

# 39. Anti-Relative-Pitch Controls

Where practical:

* use progression/buffer wiping before diagnostic sessions;
* vary intertrial intervals;
* avoid predictable transition patterns;
* analyze performance as a function of preceding pitch and interval.

The goal is not to prevent the auditory system from hearing intervals.

The goal is to detect whether apparent AP depends substantially on a recent reference pitch.

---

# 40. Do Not Change Multiple Major Difficulty Axes Simultaneously

When the scheduler activates another explicit chroma, it should generally avoid simultaneously:

* sharply shortening the response window;
* substantially increasing noise;
* substantially increasing detuning;
* introducing another major degradation.

Otherwise the cause of performance changes becomes uninterpretable.

Prefer one major curriculum intervention per block transition.

---

# 41. Curriculum Objectives Are Soft, Not Exclusive Global States

The system may describe broad objectives such as:

* anchor formation;
* chromatic expansion;
* boundary sharpening;
* robustness;
* retention.

However, different pitches may require different objectives simultaneously.

Therefore the scheduler should operate on weighted objectives rather than a rigid global phase state machine.

The UI may summarize the **dominant current objective** as a phase label.

Conceptually:

$$
\text{scheduler objectives}
\rightarrow
\text{descriptive phase}
$$

rather than:

$$
\text{phase}
\rightarrow
\text{rigid scheduler behavior}.
$$

---

# 42. Early Category Formation

When chromatic coverage is sparse, candidate activation should consider:

* useful chromatic separation;
* avoidance of excessive tonal redundancy;
* uncertainty;
* existing learner evidence;
* information gain.

No specific theoretical geometry should dominate permanently.

As empirical confusion data accumulate:

$$
\text{empirical perceptual structure}
>
\text{assumed chromatic geometry}.
$$

---

# 43. Transition to Full 12-Way Response

As \(A_b\) approaches \(U\), OTHER loses information.

The transition should be explicit and versioned.

Once:

$$
A_b=U,
$$

then:

* all twelve buttons are active;
* OTHER disappears;
* every trial requires exact chroma identification.

This does not imply all twelve pitches are stable.

It means only that the response vocabulary is now fully chromatic.

---

# 44. Mapping Mode

Mapping answers:

> What pitch-class structure appears to exist right now?

For returning or experienced learners, mapping may use:

$$
A=U
$$

from the beginning.

For genuinely naïve learners, full 12-way mapping may mostly measure guessing and interface familiarity.

Onboarding should therefore distinguish at minimum:

```text id="z2l4di"
new/untrained
returning/pretrained
```

Mapping strategy may differ accordingly.

---

# 45. Benchmark Mode

Benchmarking answers:

> How capable is the learner under a stable external protocol?

The benchmark must define and version:

* pitch distribution;
* number of trials;
* octave distribution;
* timbre distribution;
* stimulus types;
* detuning;
* noise;
* response window;
* feedback policy;
* sequence constraints.

Benchmark trials must not adapt to current weaknesses.

---

# 46. Held-Out Evaluation Stimuli

Where generalization is being tested, maintain stimulus families held out from ordinary training.

Call these:

> **held-out evaluation stimuli**

rather than “unfamiliar stimuli.”

Repeated benchmarking itself creates familiarity.

Therefore:

* maintain a sufficiently large evaluation pool;
* avoid excessive repetition of identical samples;
* optionally rotate some held-out stimulus families;
* preserve a stable benchmark core for longitudinal comparison.

---

# 47. Adaptive Training Metrics Are Policy-Conditioned

Accuracy during adaptive training reflects both:

$$
\text{learner ability}
$$

and

$$
\text{scheduler choices}.
$$

Therefore adaptive-session accuracy must be labeled accordingly.

Do not present it as equivalent to benchmark accuracy.

The dashboard should visually distinguish:

* training performance;
* diagnostic/probe performance;
* benchmark performance.

---

# 48. Manual Modes and Evidence Weighting

Custom and Drill modes may produce highly biased stimulus distributions.

Their trials must not automatically contribute to learner-state estimation with the same evidentiary weight as canonical probes.

Every mode receives an explicit evidence policy.

For example:

```text id="x7o1a0"
benchmark        longitudinal measurement
probe            high diagnostic weight
adaptive         normal learner-model weight
custom           context-dependent weight
drill            low diagnostic weight
```

Exact weights should be configurable.

Raw data are never discarded.

---

# 49. Dashboard

Display all twelve chromas simultaneously.

For each pitch expose:

* learner ability state;
* scheduler role;
* uncertainty;
* observation count;
* recent canonical accuracy;
* adaptive-training accuracy;
* benchmark accuracy where available;
* median RT;
* confidence calibration;
* false-positive behavior;
* principal confusions;
* octave/timbre robustness;
* retention evidence;
* recent trend.

Do not hide these dimensions behind one mastery percentage.

---

# 50. Trial UI Information Leakage

During trials, do not expose:

* scheduler weights;
* weak-pitch emphasis;
* expected target;
* mastery status.

When a new pitch becomes explicit at a block boundary, avoid emphasizing:

> NEW PITCH: X

immediately before training.

Instead, neutrally display the complete response vocabulary for the upcoming block.

This reduces salience-induced prior bias.

---

# 51. Data Model

## Session

Store:

```text id="pbj7vo"
session_id
training_epoch
started_at
ended_at
session_type
canonical_condition
sober/intoxicated
focused/distracted
distraction_type
subjective_alertness
audio_output
device_context
optional_notes
```

## Block

Store:

```text id="4rf1ip"
block_id
session_id
block_index
explicit_response_set
sampling_distribution
out_of_set_distribution
response_window_ms
feedback_policy
scheduler_version
learner_model_version
scheduler_decision
scheduler_state_snapshot
random_seed
```

## Trial

Store:

```text id="a4xevd"
session_id
block_id
trial_index_session
trial_index_block
trial_purpose

target_pitch
response
correct
latency_ms

confidence
second_instinct
second_instinct_latency

octave
timbre
stimulus_type
detuning
noise_configuration
sample_id
sample_onset_offset

input_method

scheduler_reason
target_scheduler_role
target_ability_state_at_trial
```

Raw trial data should be append-only.

---

# 52. Versioning and Reproducibility

Persist:

```text id="2swbgd"
schema_version
learner_model_version
scheduler_version
benchmark_version
stimulus_generator_version
```

For generated blocks, preserve either:

* PRNG seed + deterministic generator version;

or:

* the complete generated trial sequence.

This allows future reconstruction of what the learner actually experienced.

Derived learner states should be recomputable from raw observations.

---

# 53. Simulation Before Deployment

The adaptive scheduler must be tested against synthetic learners before being trusted.

At minimum simulate:

### Fast learner

Rapid improvement across categories.

Expected behavior:

> curriculum expands rapidly.

### Slow learner

Gradual improvement.

Expected:

> scheduler consolidates without freezing indefinitely.

### Single-category weakness

One persistent poor category.

Expected:

> targeted remediation without blocking global expansion.

### Broad confusion

Many categories overlap.

Expected:

> expansion slows and discrimination receives priority.

### High false-positive learner

High hit rates but overly broad categories.

Expected:

> scheduler detects poor specificity rather than declaring mastery.

### Noisy learner

Performance varies randomly across blocks.

Expected:

> scheduler does not oscillate aggressively.

### Regressing learner

Previously stable categories deteriorate.

Expected:

> maintenance transitions toward remediation.

### Context-sensitive learner

Strong canonical performance, poor distracted performance.

Expected:

> robustness score falls without falsely declaring canonical ability lost.

The scheduler should pass explicit behavioral assertions for each synthetic learner before normal deployment.

---

# 54. Implementation Order

## Milestone 1 — Measurement foundation

Implement:

* sessions;
* blocks;
* epochs;
* trial purposes;
* canonical-condition metadata;
* complete configuration snapshots;
* versioning.

## Milestone 2 — Stable response UI

Implement:

* permanent 12-position layout;
* block-fixed response vocabulary;
* OTHER;
* invariant positions;
* neutral block-transition presentation.

## Milestone 3 — Learner model

Implement:

* regularized accuracy estimates;
* uncertainty;
* latency;
* false positives;
* confusion matrix;
* recency;
* context-aware evidence;
* ability states.

## Milestone 4 — Mapping and probes

Implement:

* returning-user mapping;
* naïve-user mapping;
* diagnostic trials;
* feedback separation.

## Milestone 5 — Scheduler

Implement:

* scheduler roles;
* sampling floors/caps;
* load estimation;
* evidence accumulation;
* candidate activation;
* broad-sampling floor;
* block-level adaptation.

## Milestone 6 — Simulation harness

Validate scheduler behavior against synthetic learner profiles.

Do this **before** allowing aggressive automatic curriculum decisions.

## Milestone 7 — Full curriculum

Implement weighted objectives for:

* category formation;
* chromatic expansion;
* boundary sharpening;
* retention;
* robustness/automaticity.

## Milestone 8 — Benchmark

Implement standardized, versioned longitudinal assessment.

## Milestone 9 — Analytics

Implement:

* 12-pitch learner map;
* confusion visualization;
* RT trends;
* context effects;
* retention;
* benchmark history;
* training-vs-benchmark distinction.

---

# 55. Non-Goals

The system must not:

* recreate fixed levels under different terminology;
* privilege historical note sets;
* prescribe a fixed pitch order;
* prescribe pitches per day/week;
* change response vocabulary during a block;
* treat one block as sufficient evidence for major structural changes;
* use raw aggregate accuracy as the sole difficulty signal;
* treat OTHER accuracy as equivalent to named-pitch accuracy;
* hide uncertainty behind mastery percentages;
* let one weak pitch freeze expansion;
* oversample weaknesses enough to reveal response priors;
* treat distracted/intoxicated performance as equivalent to canonical ability;
* rearrange response buttons;
* make several major difficulty changes simultaneously;
* treat Drill/Custom statistics as unbiased evidence;
* treat adaptive-training accuracy as benchmark performance;
* assume chromatic distance perfectly describes perceptual distance;
* assume old and recent trials have equal relevance;
* infer regression merely from elapsed time;
* optimize for immediate accuracy at the expense of eventual full-chromatic AP.

---

# 56. Governing Principles

### Model before scheduling

$$
\boxed{\text{Estimate learner state independently from training policy.}}
$$

### Expose aggressively

$$
\boxed{\text{New information is cheap to probe.}}
$$

### Adapt conservatively

$$
\boxed{\text{Do not chase block-level noise.}}
$$

### Keep response mechanics invariant

$$
\boxed{A_b\text{ is fixed within a block and positions never move.}}
$$

### Separate sensitivity from specificity

$$
\boxed{\text{Recognizing X and rejecting non-X are both necessary.}}
$$

### Preserve uncertainty

$$
\boxed{\text{Unknown is not the same as weak.}}
$$

### Increase meaningful complexity

$$
\boxed{\text{Chromatic richness generally precedes artificial adversity.}}
$$

### Mastery requires time

$$
\boxed{\text{Short-term performance cannot establish retention.}}
$$

### Measurement remains external to adaptation

$$
\boxed{\text{Training optimizes; benchmarking measures.}}
$$

---

# 57. Final System Loop

At the end of a block:

### 1. Update learner model

$$
D_{\le t}
\rightarrow
M_t
$$

using raw observations, context, recency, uncertainty, and evidence policy.

### 2. Evaluate scheduler objectives

Determine current needs across:

* acquisition;
* exploration;
* maintenance;
* remediation;
* chromatic expansion;
* boundary sharpening;
* retention;
* robustness.

### 3. Generate candidate next-block configurations

Each candidate specifies:

$$
C_k=
(A_k,P_k,\text{stimulus parameters}).
$$

### 4. Apply constraints

Reject configurations that:

* leak target information;
* exceed sampling caps;
* violate maintenance floors;
* increase multiple major difficulty axes unnecessarily;
* represent excessive change from weak evidence.

### 5. Select next block

Choose the configuration expected to best advance:

$$
\boxed{\text{retained, fast, full-chromatic identification}}
$$

given current evidence.

### 6. Freeze configuration

Before the first trial:

$$
\boxed{A_b\text{ becomes immutable for the block.}}
$$

### 7. Train

Collect raw observations.

Then repeat.

The resulting architecture is:

$$
\boxed{
\text{Raw Evidence}
\rightarrow
\text{Learner Model}
\rightarrow
\text{Scheduler}
\rightarrow
\text{Fixed Training Block}
}
$$

while a separate standardized pathway provides:

$$
\boxed{
\text{Benchmark}
\rightarrow
\text{Longitudinal Ability Measurement}
}.
$$

That separation is the foundation of the redesigned AP Trainer.
