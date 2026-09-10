# Adaptive chromatic curriculum

The default entry point now uses independent raw-evidence, learner-model, scheduler, and benchmark modules. Fixed-level sessions are removed from the manual-tools entry point. Existing history and manual Custom, Drill, and progression tools remain available.

## Protocol v2

- Training blocks contain 24 trials; the first four form a diagnostic group with feedback withheld until block review. Mapping uses 24 sparse diagnostic trials for new learners or 48 balanced full-chromatic probes for returning learners.
- All 12 response positions remain visible. The response vocabulary and OTHER availability are frozen for a block. Inactive positions are disabled. Full-chromatic blocks remove OTHER.
- Adaptive stimuli use real instrument samples (the same six-instrument, register-bounded set as manual practice), not synthesized tones. Per pitch, the instrument and the octave rotate on two independently seeded counters so neither is a deterministic function of the other, and octave is not confounded with timbre. Every sample's leading silence/attack is measured on decode (first frame past 1% of peak) and played back offset-corrected so the reported onset still lines up with the audible onset; detune (pitch-shifting to the nearest available sample) scales that offset accordingly. A block's distinct samples are pre-decoded before its first trial so a cache miss never skews the first onset measurement.
- Benchmark v2 has 72 trials: six per chroma, one in each octave/timbre combination. Two of the three timbres are real instrument samples (piano — exact sample per chroma; guitar — evenly-spaced samples so pitch-shift magnitude doesn't correlate with chroma), and the third is a held-out harmonic synthesis family never used in training. Exact waveform instances repeat across benchmarks; no claim of perpetual unfamiliarity is made. The fixed core is preserved for comparison going forward under v2.
- Benchmark and mapping have no immediate correctness feedback. Every response receives the same confidence and optional second-instinct prompt before feedback, preventing correctness leakage. First responses remain authoritative.
- Audio is scheduled against Web Audio time, mapped to performance.now through output timestamps where available. The fallback includes base latency. Physical device latency remains a measurement limitation. Unpitched separation and randomized intertrial intervals reduce reference carryover; this is not proof of independence from relative pitch.

## Estimation and policy

The learner model uses regularized beta estimates and approximate 95% uncertainty bounds. It retains accuracy, false positives, confusion probabilities/counts, confidence Brier error, latency, context/octave/timbre breakdowns, delayed-probe evidence, and trends. Stability requires independent thresholds for specificity, accuracy, latency, at least three sessions, and successful probes delayed at least one day. Elapsed time alone never declares regression.

Evidence decays with a 30-day half-life and prior epochs receive 0.15 weight. Legacy observations without the new protocol metadata are preserved but excluded from current canonical estimates. Benchmark observations are longitudinal measurement, with zero scheduler evidence weight. Explicit policies for Custom/Drill are defined for protocol-v2 observations; manual sessions now save session and single-trial configuration snapshots with an explicitly excluded canonical evidence policy because their listening context and legacy audio timing are unmeasured. They remain visible in manual/historical analytics.

Expansion uses named-category evidence for the same response vocabulary, never pooled OTHER success. A configurable fraction of strong categories can support expansion despite one weak category. Floors and caps bound named-pitch priors. Out-of-set sampling mixes near, medium, far (when available), and broad negatives. Objective weights and decision inputs are saved. Window shortening starts only with full chromatic responses and strong accumulated evidence, and never accompanies activation. No automatic rollback is implemented; monotonic activation is the default.

These are explicit initial policy thresholds, not empirically established learning-optimal parameters. Moving to natural sampled instruments was itself one such versioned extension (`stimulus_generator_version`/`benchmark_version` bumped to 2 rather than silently redefining v1); `estimate()` excludes v1 rows from canonical estimates accordingly. Wider octave ranges, controlled noise/detuning curricula, and calibrated hardware latency remain candidates for future versioned protocol extensions, not silent changes to v2.

## Storage and reproducibility

IndexedDB v2 adds sessions, immutable block snapshots, and epochs without deleting v1 stores. Raw responses are appended; every new trial has a unique ID. Blocks save the complete generated sequence, PRNG seed, versions, distributions, and learner/scheduler snapshots before playback. JSON backups include all stores and metadata. Re-importing v2 trial IDs is idempotent. Old JSON backups remain accepted. Starting a new epoch retains previous observations.

## Verification

Run `node --test src/curriculum/curriculum.test.js src/audio/*.test.js src/db/db.test.js` and `npm run build`.

The simulation suite asserts behavior for fast, slow, persistently weak, broadly confused, high-false-positive, noisy, regressing, and context-sensitive learners, plus uncertainty, sampling bounds, deterministic generation, and benchmark independence.

`scripts/curriculum-browser.mjs` uses the locally installed Chrome and puppeteer-core to exercise a v1 database upgrade, a full block, block transition, fixed mobile response layout, diagnostic/benchmark feedback, persistence, and backup contents. It uses an isolated browser profile. Puppeteer is an existing local tooling dependency, not added to production dependencies.

The manual-mode smoke test is `node scripts/curriculum-manual-browser.mjs`. Full fixed-level advancement and its timing staircase are no longer used.
