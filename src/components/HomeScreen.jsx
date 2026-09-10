import { useState } from 'react';
import { CHROMAS } from '../audio/constants.js';

const MAX_LEVEL = 12;

const OUT_OF_SET = 'outOfSet';

// Splits `total` across `keys` in proportion to their values in `source`
// (falling back to an even split when source has nothing to go on). The
// last key absorbs any rounding remainder so the result always sums to
// exactly `total` — the invariant every slider in the custom picker relies
// on to keep its handle position and displayed % in sync.
function proportionalSplit(source, keys, total) {
  if (keys.length === 0) return {};
  const oldTotal = keys.reduce((sum, k) => sum + (source[k] || 0), 0);
  const result = {};
  let used = 0;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      result[k] = total - used;
      return;
    }
    const v = oldTotal > 0
      ? Math.round(((source[k] || 0) / oldTotal) * total)
      : Math.floor(total / keys.length);
    result[k] = v;
    used += v;
  });
  return result;
}

// Removes `key` from a 0-100 locked distribution, handing its share back
// to the remaining unlocked keys in proportion to what they already had.
// Locked keys keep their exact value untouched.
function removeFromDistribution(dist, key, lockedKeys) {
  if (!(key in dist)) return dist;
  const rest = { ...dist };
  delete rest[key];
  const restKeys = Object.keys(rest);
  if (restKeys.length === 0) return {};
  const unlockedKeys = restKeys.filter(k => !lockedKeys[k]);
  if (unlockedKeys.length === 0) {
    // Everything left is locked, but locked shares no longer sum to 100
    // now that `key` is gone — scale them all up to fill the gap.
    return proportionalSplit(rest, restKeys, 100);
  }
  const lockedTotal = restKeys.filter(k => lockedKeys[k]).reduce((s, k) => s + rest[k], 0);
  const shrunk = proportionalSplit(rest, unlockedKeys, 100 - lockedTotal);
  return { ...rest, ...shrunk };
}

// Adds `key` to a locked distribution with a fair share, shrinking the
// existing unlocked keys proportionally to make room (locked keys are left
// alone). When adding this key covers every chroma, out-of-set is
// meaningless — its share (if unlocked) is folded back into the notes.
function addToDistribution(dist, key, isFullChromaSet, lockedKeys) {
  const existingKeys = Object.keys(dist);
  if (existingKeys.length === 0) return { [key]: 100 };
  const unlockedKeys = existingKeys.filter(k => !lockedKeys[k]);
  const lockedTotal = existingKeys.filter(k => lockedKeys[k]).reduce((s, k) => s + dist[k], 0);
  const room = 100 - lockedTotal;
  const newShare = Math.min(Math.round(100 / (existingKeys.length + 1)), room);
  const shrunk = proportionalSplit(dist, unlockedKeys, room - newShare);
  let next = { ...dist, ...shrunk, [key]: newShare };
  if (isFullChromaSet && OUT_OF_SET in next && !lockedKeys[OUT_OF_SET]) {
    next = removeFromDistribution(next, OUT_OF_SET, lockedKeys);
  }
  return next;
}

export default function HomeScreen({
  manualOnly = false,
  level,
  streak,
  onStartEvening,
  onStartColdStart,
  onStartMicro,
  onStartDrill,
  onStartCustom,
  onStartProgression,
  onDashboard,
  onAmbient,
  onSetLevel,
  theme,
  onToggleTheme,
  adaptiveMode,
  onToggleAdaptive,
  notExactMode,
  onToggleNotExact,
  noiseScrambleMode,
  onToggleNoiseScramble,
}) {
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [pickedNotes, setPickedNotes] = useState([]);

  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [distribution, setDistribution] = useState({}); // { chroma|outOfSet: 0-100 }, always sums to 100
  const [locked, setLocked] = useState({}); // { chroma|outOfSet: true } — held fixed while other sliders move
  const [allowSine, setAllowSine] = useState(false);
  const [allowNoise, setAllowNoise] = useState(false);
  const [allowDetune, setAllowDetune] = useState(false);

  const customNotes = CHROMAS.filter(c => c in distribution);
  const outOfSetPct = distribution[OUT_OF_SET] || 0;

  function toggleCustomNote(note) {
    setDistribution(prev => {
      if (note in prev) {
        const next = removeFromDistribution(prev, note, locked);
        const stillHasNotes = Object.keys(next).some(k => k !== OUT_OF_SET);
        return stillHasNotes ? next : {};
      }
      const notesAfter = Object.keys(prev).filter(k => k !== OUT_OF_SET).length + 1;
      return addToDistribution(prev, note, notesAfter === CHROMAS.length, locked);
    });
    setLocked(prev => {
      if (!(note in prev)) return prev;
      const next = { ...prev };
      delete next[note];
      return next;
    });
  }

  function toggleLock(key) {
    setLocked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Dragging one slider to `value` takes the difference out of (or gives it
  // back to) every other UNLOCKED slider, in proportion to their current
  // shares — so the slider you're holding always shows exactly the value
  // you set it to, and stays there until a different slider is moved.
  // Locked sliders are held fixed so you can tune the rest around them.
  function setSliderValue(key, rawValue) {
    if (locked[key]) return;
    setDistribution(prev => {
      const dist = key in prev ? prev : { ...prev, [key]: 0 };
      const otherKeys = Object.keys(dist).filter(k => k !== key);
      if (otherKeys.length === 0) return { [key]: 100 };
      const lockedOtherKeys = otherKeys.filter(k => locked[k]);
      const unlockedOtherKeys = otherKeys.filter(k => !locked[k]);
      const lockedTotal = lockedOtherKeys.reduce((s, k) => s + dist[k], 0);
      const maxValue = 100 - lockedTotal;
      const newValue = Math.max(0, Math.min(rawValue, maxValue));
      if (unlockedOtherKeys.length === 0) {
        return { ...dist, [key]: maxValue };
      }
      const shrunk = proportionalSplit(dist, unlockedOtherKeys, maxValue - newValue);
      return { ...dist, ...shrunk, [key]: newValue };
    });
  }

  function openCustomPicker() {
    setShowCustomPicker(true);
    setDistribution({});
    setLocked({});
    setAllowSine(false);
    setAllowNoise(false);
    setAllowDetune(false);
  }

  function closeCustomPicker() {
    setShowCustomPicker(false);
  }

  function startCustom() {
    const weights = {};
    for (const n of customNotes) weights[n] = distribution[n];
    const allowedStimTypes = ['instrument'];
    if (allowSine) allowedStimTypes.push('sine');
    if (allowNoise) allowedStimTypes.push('noise');
    if (allowDetune) allowedStimTypes.push('detuned');
    onStartCustom({
      notes: customNotes,
      weights,
      outOfSetProb: customNotes.length < CHROMAS.length ? outOfSetPct / 100 : 0,
      allowedStimTypes,
    });
    closeCustomPicker();
  }

  function toggleNote(note) {
    setPickedNotes(prev => {
      if (prev.includes(note)) return prev.filter(n => n !== note);
      return [...prev, note];
    });
  }

  function openPicker() {
    setShowDrillPicker(true);
    setPickedNotes([]);
  }

  function closePicker() {
    setShowDrillPicker(false);
    setPickedNotes([]);
  }

  function startDrill() {
    onStartDrill(pickedNotes);
    closePicker();
  }

  const pickerLabel =
    pickedNotes.length === 0 ? 'Pick two or more notes' :
    pickedNotes.length === 1 ? `${pickedNotes[0]} · pick second note` :
    pickedNotes.join(' vs ');

  return (
    <div className="screen home-screen">
      <header className="home-header">
        <div className="home-brand">
          <h1 className="app-title">AP Trainer</h1>
          <span className="app-tagline">Absolute pitch training</span>
        </div>
        <button className="theme-btn" aria-label="Toggle theme" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? '○' : '●'}
        </button>
      </header>

      <div className="home-layout">
        <aside className="home-side">
          {!manualOnly && <div className="stat-row">
            <div className="stat">
              <div className="level-selector">
                <button className="level-arrow" aria-label="Decrease level" onClick={() => onSetLevel(Math.max(1, level - 1))} disabled={level <= 1}>‹</button>
                <span className="stat-value">Lv {level}</span>
                <button className="level-arrow" aria-label="Increase level" onClick={() => onSetLevel(Math.min(MAX_LEVEL, level + 1))} disabled={level >= MAX_LEVEL}>›</button>
              </div>
              <span className="stat-label">level</span>
            </div>
            <div className="stat">
              <span className="stat-value">{streak}</span>
              <span className="stat-label">cold start streak</span>
            </div>
          </div>

          }
          <div className="mode-panel">
            <h3 className="panel-label">Modes</h3>
            <div className="adaptive-row">
              <button
                className={`adaptive-btn${adaptiveMode ? ' active' : ''}`}
                onClick={onToggleAdaptive}
              >
                {adaptiveMode ? '◉' : '○'} Manual stimulus weighting
              </button>
              {adaptiveMode && <span className="adaptive-hint">worst notes first</span>}
            </div>
            <div className="adaptive-row">
              <button
                className={`adaptive-btn${notExactMode ? ' active' : ''}`}
                onClick={onToggleNotExact}
              >
                {notExactMode ? '◉' : '○'} Microtonal
              </button>
              {notExactMode && <span className="adaptive-hint">ask direction for detuned</span>}
            </div>
            <div className="adaptive-row">
              <button
                className={`adaptive-btn${noiseScrambleMode ? ' active' : ''}`}
                onClick={onToggleNoiseScramble}
              >
                {noiseScrambleMode ? '◉' : '○'} Noise Scramble
              </button>
              {noiseScrambleMode && <span className="adaptive-hint">every note under noise</span>}
            </div>
          </div>

          <div className="secondary-buttons">
            <button className="nav-btn" onClick={onDashboard}>Dashboard</button>
            <button className="nav-btn" onClick={onAmbient}>Ambient Log</button>
          </div>
        </aside>

        <section className="session-panel">
          <h2 className="panel-title">Start a session</h2>
          <div className="session-buttons">
            {!manualOnly && <><button className="session-btn primary" onClick={onStartColdStart}>
              Cold Start
              <span className="btn-sub">Morning · pure measurement</span>
            </button>

            <button className="session-btn" onClick={onStartEvening}>
              Evening Session
              <span className="btn-sub">Full training block</span>
            </button>

            <button className="session-btn micro" onClick={onStartMicro}>
              Micro (3 trials)
              <span className="btn-sub">Quick practice · no wipe</span>
            </button>

            </>}
            <button
              className={`session-btn micro${showDrillPicker ? ' binary-active' : ''}`}
              onClick={showDrillPicker ? closePicker : openPicker}
            >
              Drill Mode
              <span className="btn-sub">Custom subset focus · no advancement</span>
            </button>

            <button className="session-btn micro" onClick={onStartProgression}>
              Chord Progressions
              <span className="btn-sub">Identify the key · 3–6 chords</span>
            </button>

            <button
              className={`session-btn micro${showCustomPicker ? ' binary-active' : ''}`}
              onClick={showCustomPicker ? closeCustomPicker : openCustomPicker}
            >
              Custom Mode
              <span className="btn-sub">Pick notes & weight probabilities · no advancement</span>
            </button>

            {showCustomPicker && (
              <div className="custom-picker">
                <div className="binary-picker-label">
                  {customNotes.length === 0 ? 'Pick one or more notes' : `${customNotes.length} note${customNotes.length > 1 ? 's' : ''} selected`}
                </div>
                <div className="binary-note-grid">
                  {CHROMAS.map(note => (
                    <button
                      key={note}
                      className={`binary-note-btn${note in distribution ? ' selected' : ''}`}
                      onClick={() => toggleCustomNote(note)}
                    >
                      {note}
                    </button>
                  ))}
                </div>

                {customNotes.length > 0 && (
                  <div className="custom-sliders">
                    {customNotes.map(note => (
                      <div className="custom-slider-row" key={note}>
                        <span className="custom-slider-label">{note}</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={distribution[note]}
                          disabled={!!locked[note]}
                          onChange={e => setSliderValue(note, Number(e.target.value))}
                        />
                        <span className="custom-slider-value">{distribution[note]}%</span>
                        <button
                          type="button"
                          className={`lock-btn${locked[note] ? ' active' : ''}`}
                          onClick={() => toggleLock(note)}
                          title={locked[note] ? 'Unlock' : 'Lock'}
                          aria-label={locked[note] ? `Unlock ${note}` : `Lock ${note}`}
                        >
                          {locked[note] ? '◉' : '○'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {customNotes.length > 0 && customNotes.length < CHROMAS.length && (
                  <div className="custom-slider-row">
                    <span className="custom-slider-label">Out-of-set</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={outOfSetPct}
                      disabled={!!locked[OUT_OF_SET]}
                      onChange={e => setSliderValue(OUT_OF_SET, Number(e.target.value))}
                    />
                    <span className="custom-slider-value">{outOfSetPct}%</span>
                    <button
                      type="button"
                      className={`lock-btn${locked[OUT_OF_SET] ? ' active' : ''}`}
                      onClick={() => toggleLock(OUT_OF_SET)}
                      title={locked[OUT_OF_SET] ? 'Unlock' : 'Lock'}
                      aria-label={locked[OUT_OF_SET] ? 'Unlock out-of-set' : 'Lock out-of-set'}
                    >
                      {locked[OUT_OF_SET] ? '◉' : '○'}
                    </button>
                  </div>
                )}

                <div className="custom-toggle-row">
                  <label className="custom-checkbox">
                    <input type="checkbox" checked={allowSine} onChange={e => setAllowSine(e.target.checked)} />
                    Sine tones
                  </label>
                  <label className="custom-checkbox">
                    <input type="checkbox" checked={allowNoise} onChange={e => setAllowNoise(e.target.checked)} />
                    Noise-masked
                  </label>
                  <label className="custom-checkbox">
                    <input type="checkbox" checked={allowDetune} onChange={e => setAllowDetune(e.target.checked)} />
                    Detuned
                  </label>
                </div>

                {customNotes.length >= 1 && (
                  <button className="session-btn primary" onClick={startCustom}>
                    Start →
                  </button>
                )}
              </div>
            )}

            {showDrillPicker && (
              <div className="binary-picker">
                <div className="binary-picker-label">{pickerLabel}</div>
                <div className="binary-note-grid">
                  {CHROMAS.map(note => (
                    <button
                      key={note}
                      className={`binary-note-btn${pickedNotes.includes(note) ? ' selected' : ''}`}
                      onClick={() => toggleNote(note)}
                    >
                      {note}
                    </button>
                  ))}
                </div>
                {pickedNotes.length >= 2 && (
                  <button className="session-btn primary" onClick={startDrill}>
                    Start →
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
