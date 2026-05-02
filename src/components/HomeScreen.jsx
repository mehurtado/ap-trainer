import React from 'react';

const MAX_LEVEL = 12;

export default function HomeScreen({
  level,
  streak,
  onStartEvening,
  onStartColdStart,
  onStartMicro,
  onDashboard,
  onAmbient,
  onSetLevel,
  theme,
  onToggleTheme,
}) {
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
      </div>

      <div className="secondary-buttons">
        <button className="nav-btn" onClick={onDashboard}>Dashboard</button>
        <button className="nav-btn" onClick={onAmbient}>Ambient Log</button>
      </div>
    </div>
  );
}
