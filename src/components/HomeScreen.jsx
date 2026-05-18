import { useState } from 'react';
import { CHROMAS } from '../audio/constants.js';

const MAX_LEVEL = 12;

export default function HomeScreen({
  level,
  streak,
  onStartEvening,
  onStartColdStart,
  onStartMicro,
  onStartDrill,
  onDashboard,
  onAmbient,
  onSetLevel,
  theme,
  onToggleTheme,
  adaptiveMode,
  onToggleAdaptive,
}) {
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [pickedNotes, setPickedNotes] = useState([]);

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
      <div className="home-header">
        <h1 className="app-title">AP Trainer</h1>
        <button className="theme-btn" onClick={onToggleTheme} title="Toggle theme">
          {theme === 'dark' ? '○' : '●'}
        </button>
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="level-selector">
            <button className="level-arrow" onClick={() => onSetLevel(Math.max(1, level - 1))} disabled={level <= 1}>‹</button>
            <span className="stat-value">Lv {level}</span>
            <button className="level-arrow" onClick={() => onSetLevel(Math.min(MAX_LEVEL, level + 1))} disabled={level >= MAX_LEVEL}>›</button>
          </div>
          <span className="stat-label">level</span>
        </div>
        <div className="stat">
          <span className="stat-value">{streak}</span>
          <span className="stat-label">cold start streak</span>
        </div>
      </div>

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

      <div className="adaptive-row">
        <button
          className={`adaptive-btn${adaptiveMode ? ' active' : ''}`}
          onClick={onToggleAdaptive}
        >
          {adaptiveMode ? '◉' : '○'} Adaptive
        </button>
        {adaptiveMode && <span className="adaptive-hint">worst notes first</span>}
      </div>

      <div className="secondary-buttons">
        <button className="nav-btn" onClick={onDashboard}>Dashboard</button>
        <button className="nav-btn" onClick={onAmbient}>Ambient Log</button>
      </div>
    </div>
  );
}
