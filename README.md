# AP Trainer

A browser-based absolute pitch training application. Plays musical tones and asks you to identify the note by ear, tracking accuracy over time and adapting to your weaknesses.

## How it works

Each trial plays a tone and presents a grid of note buttons. You have 1.5 seconds to respond. The app records whether you were correct, how long you took, your confidence, and whether you had an immediate "second instinct" for the correct note even when you answered wrong.

### Level progression

Notes are introduced one at a time. You advance when you hit 80% accuracy over the last 50 trials at a given level.

| Level | Notes active |
|-------|-------------|
| 1 | C |
| 2 | C, G |
| 3 | C, G, D |
| 4 | C, G, D, A |
| 5 | C, G, D, A, E |
| 6 | C, G, D, A, E, B |
| 7 | C, G, D, A, E, B, F# |
| 8 | C, G, D, A, E, B, F#, C# |
| 9 | C, G, D, A, E, B, F#, C#, G# |
| 10 | C, G, D, A, E, B, F#, C#, G#, D# |
| 11 | C, G, D, A, E, B, F#, C#, G#, D#, A# |
| 12 | All 12 chromatic notes |

Notes are introduced in fifths (circle of fifths order) to maximize perceptual distinctiveness at each stage.

### Level 12 adversarial targeting

At level 12, the trial picker uses a confusion matrix to select notes strategically:
- **40%** neighbor attack — picks the note you most often confuse with your last correct answer
- **30%** weakness attack — picks the note with the highest weighted failure rate (confident-wrong errors count 3×)
- **30%** random

The first 10 trials of each session use pure random selection to warm up.

### Session types

| Type | Description |
|------|-------------|
| Cold start | First session of the day, marked separately in analytics |
| Evening | Standard practice session |
| Micro | Short session, same trial logic |
| Drill | Focused on a specific note or set; detuned and noise stimuli disabled — instrument samples only |

### Stimulus types

| Type | Frequency | Description |
|------|-----------|-------------|
| Instrument | 42% | Real instrument sample, random instrument and octave |
| Sine wave | 40% | Pure sine tone at the target frequency |
| Detuned | 12% | Instrument sample pitch-shifted 10–25 cents sharp or flat |
| Noise-masked | 6% | Instrument sample played under white or pink noise |

Drill sessions skip detuned and noise-masked stimuli entirely.

### Buffer wipe

Between sessions, a 10-second sequence plays to clear tonal memory residue before the next session begins:

| Phase | Duration | Content |
|-------|----------|---------|
| Brown noise + notch | 2s | Broadband noise with a band-notched gap |
| Key spam | 1s | Random chromatic keystrokes |
| White noise | 2s | Full-spectrum white noise |
| Melody | 2s | Random atonal melody |
| Key spam | 1s | Random chromatic keystrokes |
| Brown noise + notch | 2s | Broadband noise again |

### Second instinct

When you answer wrong and rate yourself as "unsure", the app asks: "Did you immediately know the correct answer?" If yes, you pick which note you actually heard first. This data appears as "SI accuracy" in the dashboard — tracking how often your gut instinct was right even when you second-guessed yourself.

## Dashboard

- **Aggregate stats**: total trials, overall accuracy, sine-only accuracy, SI accuracy, timeout rate, average response time (all and correct-only)
- **Accuracy by Day**: line chart with separate series for cold start, evening, and drill sessions
- **Per-Note Accuracy**: table showing overall, sine, noise, sharp-detuned, and flat-detuned accuracy per note (columns only appear when data exists for that stimulus type)
- **Confusion Matrix**: heatmap of wrong answers — rows are target notes, columns are guesses; filterable by stimulus type (all / sine / instrument / detuned / noise / per-instrument)

## Ambient Log

Records real-world pitch identification attempts — tones you hear in the environment (phone rings, appliances, music). Separate from training trials, exported in its own CSV.

## Getting started

### Prerequisites

- Node.js 18+
- Internet connection (to download instrument samples on first run)

### Setup

```bash
bash setup.sh
```

This installs dependencies and downloads ~167 WAV instrument samples from the ToneJS instruments repository into `public/samples/`.

### Run

```bash
npm run dev
```

Open `http://localhost:5173` in a browser.

## Project structure

```
ap-trainer/
├── public/
│   └── samples/              # Instrument WAV files (downloaded by setup.sh)
├── src/
│   ├── audio/
│   │   ├── constants.js          # CHROMAS, INSTRUMENTS, LEVEL_NOTES, frequency math
│   │   ├── AudioEngine.js        # Web Audio API: playback, pitch-shifting, buffer wipe
│   │   ├── ConfusionMatrix.js    # Per-note confusion tracking, adversarial query methods
│   │   └── TrialEngine.js        # Trial generation, stimulus selection, adversarial pick
│   ├── components/
│   │   ├── HomeScreen.jsx        # Session config and level display
│   │   ├── TrialScreen.jsx       # Timer bar, note grid, confidence/SI overlays
│   │   ├── FeedbackScreen.jsx    # Post-trial result display
│   │   ├── WipeScreen.jsx        # Buffer wipe countdown UI
│   │   ├── Dashboard.jsx         # Stats, charts, confusion matrix
│   │   ├── AmbientLog.jsx        # Ambient pitch log UI
│   │   └── NoteGrid.jsx          # Reusable chromatic note button grid
│   ├── db/
│   │   └── db.js                 # IndexedDB wrapper: trials, ambient, meta stores
│   ├── hooks/
│   │   └── useGameState.js       # Core session state machine
│   ├── App.jsx
│   └── index.css
├── index.html                    # Sync theme init script, Vite entry point
├── download-samples.sh           # Fetches WAV files from tonejs-instruments
└── setup.sh                      # First-run setup script
```

## Trial data schema

Each trial stored in IndexedDB (and exported to `trials.csv`) contains:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | ISO string | When the trial was recorded |
| `is_cold_start` | bool | First session of the day |
| `target_chroma` | string | Correct note (e.g. `"C"`, `"F#"`) |
| `target_octave` | number | Octave of the played note |
| `cents_offset` | number | Detuning in cents (0 if not detuned) |
| `cents_direction` | string | `"sharp"`, `"flat"`, or `"none"` |
| `instrument_id` | string | Which instrument was used |
| `sine_wave_flag` | bool | True for sine stimulus |
| `noise_masked_flag` | bool | True for noise-masked stimulus |
| `noise_type` | string | `"white"` or `"pink"` |
| `user_guess` | string | Note the user pressed (or `"TIMEOUT"`) |
| `confidence` | string | `"high"` or `"low"` |
| `latency_ms` | number | Response time from audio onset |
| `result_bool` | bool | Whether the guess was correct |
| `timeout_flag` | bool | True if response window expired |
| `second_instinct_flag` | bool | Whether SI was reported |
| `second_instinct_note` | string | Note reported as immediate instinct |
| `level` | number | Level at time of trial (1–12) |
| `session_type` | string | `"cold_start"`, `"evening"`, `"micro"`, `"drill"` |
| `drill_mode_flag` | bool | True for drill sessions |
| `drill_notes` | string | JSON-encoded note set for drill |

Export via **Dashboard → Export CSV** produces `trials.csv` and `ambient.csv`.

## Architecture notes

- **No backend.** All data is stored in IndexedDB in the browser. Nothing is sent to any server.
- **Theming** uses CSS custom properties (`--bg`, `--text`, etc.) with a `data-theme` attribute on `<html>`. A synchronous inline script in `index.html` sets the theme before React mounts, preventing flash-of-wrong-theme.
- **Pitch-shifting** for detuned stimuli uses `AudioBufferSourceNode.detune` (Web Audio API). For instruments with sparse sample sets, `nearestSample()` finds the closest recorded pitch and shifts from there.
- **Sample loading** is lazy — samples are fetched on first play and cached in memory for the session.

## Known TODOs

- **`notExactMode`**: The UI for identifying detuned trials (sharp/flat buttons) exists but is non-functional. The direction buttons currently call `handleNotePress('__sharp__')` which never matches `targetChroma` and always marks wrong. Fix requires: (1) a chroma-guess step, (2) storing direction in `pendingGuess`, (3) wiring up `pendingGuess.direction === trial.centDirection` for correctness. See comments in `useGameState.js` and `TrialScreen.jsx`.
