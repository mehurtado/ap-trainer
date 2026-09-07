import { useState } from 'react';
import { CHROMAS } from '../audio/constants.js';

const MAX_LEVEL = 12;

const DEFAULT_WEIGHT = 50;

export default function HomeScreen({
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
  const [customWeights, setCustomWeights] = useState({}); // { chroma: 0-100 }
  const [outOfSetPct, setOutOfSetPct] = useState(0);
  const [allowSine, setAllowSine] = useState(false);
  const [allowNoise, setAllowNoise] = useState(false);
  const [allowDetune, setAllowDetune] = useState(false);

  const customNotes = Object.keys(customWeights);
  const customTotal = customNotes.reduce((sum, n) => sum + customWeights[n], 0);

  function toggleCustomNote(note) {
    setCustomWeights(prev => {
      if (note in prev) {
        const next = { ...prev };
        delete next[note];
        return next;
      }
      return { ...prev, [note]: DEFAULT_WEIGHT };
    });
  }

  function setCustomWeight(note, value) {
    setCustomWeights(prev => ({ ...prev, [note]: value }));
  }

  function openCustomPicker() {
    setShowCustomPicker(true);
    setCustomWeights({});
    setOutOfSetPct(0);
    setAllowSine(false);
    setAllowNoise(false);
    setAllowDetune(false);
  }

  function closeCustomPicker() {
    setShowCustomPicker(false);
  }

  function startCustom() {
    const weights = {};
    for (const n of customNotes) weights[n] = customWeights[n];
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
          <div className="stat-row">
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

          <div className="mode-panel">
            <h3 className="panel-label">Modes</h3>
            <div className="adaptive-row">
              <button
                className={`adaptive-btn${adaptiveMode ? ' active' : ''}`}
                onClick={onToggleAdaptive}
              >
                {adaptiveMode ? '◉' : '○'} Adaptive
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
            <button className="session-btn primary" onClick={onStartColdStart}>
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
                      className={`binary-note-btn${note in customWeights ? ' selected' : ''}`}
                      onClick={() => toggleCustomNote(note)}
                    >
                      {note}
                    </button>
                  ))}
                </div>

                {customNotes.length > 0 && (
                  <div className="custom-sliders">
                    {customNotes.map(note => {
                      const inSetShare = customTotal > 0 ? customWeights[note] / customTotal : 0;
                      const pct = Math.round(inSetShare * (1 - outOfSetPct / 100) * 100);
                      return (
                        <div className="custom-slider-row" key={note}>
                          <span className="custom-slider-label">{note}</span>
                          <input
                            type="range"
                            min="1"
                            max="100"
                            value={customWeights[note]}
                            onChange={e => setCustomWeight(note, Number(e.target.value))}
                          />
                          <span className="custom-slider-value">{pct}%</span>
                        </div>
                      );
                    })}
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
                      onChange={e => setOutOfSetPct(Number(e.target.value))}
                    />
                    <span className="custom-slider-value">{outOfSetPct}%</span>
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
