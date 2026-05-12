import React, { useState } from 'react';
import { CHROMAS } from '../audio/constants.js';

const MAX_LEVEL = 12;

export default function HomeScreen({
  level,
  streak,
  onStartEvening,
  onStartColdStart,
  onStartMicro,
  onStartBinary,
  onDashboard,
  onAmbient,
  onSetLevel,
  theme,
  onToggleTheme,
}) {
  const [showBinaryPicker, setShowBinaryPicker] = useState(false);
  const [pickedNotes, setPickedNotes] = useState([]);

  function toggleNote(note) {
    setPickedNotes(prev => {
      if (prev.includes(note)) return prev.filter(n => n !== note);
      if (prev.length < 2) return [...prev, note];
      return [prev[1], note];
    });
  }

  function openPicker() {
    setShowBinaryPicker(true);
    setPickedNotes([]);
  }

  function closePicker() {
    setShowBinaryPicker(false);
    setPickedNotes([]);
  }

  function startBinary() {
    onStartBinary(pickedNotes[0], pickedNotes[1]);
    closePicker();
  }

  const pickerLabel =
    pickedNotes.length === 0 ? 'Pick two notes' :
    pickedNotes.length === 1 ? `${pickedNotes[0]} · pick second note` :
    `${pickedNotes[0]} vs ${pickedNotes[1]}`;

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
          className={`session-btn micro${showBinaryPicker ? ' binary-active' : ''}`}
          onClick={showBinaryPicker ? closePicker : openPicker}
        >
          Binary Drill
          <span className="btn-sub">Two-note focus · no advancement</span>
        </button>

        {showBinaryPicker && (
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
            {pickedNotes.length === 2 && (
              <button className="session-btn primary" onClick={startBinary}>
                Start →
              </button>
            )}
          </div>
        )}
      </div>

      <div className="secondary-buttons">
        <button className="nav-btn" onClick={onDashboard}>Dashboard</button>
        <button className="nav-btn" onClick={onAmbient}>Ambient Log</button>
      </div>
    </div>
  );
}
