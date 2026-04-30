import React, { useEffect, useRef, useState } from 'react';
import NoteGrid from './NoteGrid.jsx';

export default function TrialScreen({
  currentTrial,
  activeNotes,
  onNotePress,
  onTimeout,
  showConfidenceOverlay,
  onConfidence,
  level,
  trialIndex,
  sessionType,
  notExactMode,
}) {
  const [timeLeft, setTimeLeft] = useState(100);
  const intervalRef = useRef(null);
  const didTimeout = useRef(false);

  useEffect(() => {
    if (!currentTrial) return;
    didTimeout.current = false;
    const windowMs = currentTrial.responseWindowMs || 1500;
    const start = Date.now();

    setTimeLeft(100);
    clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / windowMs) * 100);
      setTimeLeft(pct);
      if (elapsed >= windowMs && !didTimeout.current) {
        didTimeout.current = true;
        clearInterval(intervalRef.current);
        onTimeout();
      }
    }, 50);

    return () => clearInterval(intervalRef.current);
  }, [currentTrial]);

  // Stop timer once confidence overlay appears
  useEffect(() => {
    if (showConfidenceOverlay) {
      clearInterval(intervalRef.current);
    }
  }, [showConfidenceOverlay]);

  if (!currentTrial) return null;

  return (
    <div className="screen trial-screen">
      <div className="trial-meta">
        <span>Level {level}</span>
        <span>#{trialIndex + 1}</span>
        {currentTrial.isWarmup && <span className="tag">warm-up</span>}
        {currentTrial.isColdStart && <span className="tag cold">cold start</span>}
      </div>

      {/* Stimulus type indicator — no pitch info, just timbral context */}
      <div className="stimulus-info">
        {currentTrial.stimType === 'detuned' && notExactMode && (
          <span className="tag detuned">not exact</span>
        )}
        {currentTrial.stimType === 'noise' && (
          <span className="tag noise">masked</span>
        )}
        {currentTrial.stimType === 'sine' && (
          <span className="tag sine">sine</span>
        )}
      </div>

      {/* Timer bar */}
      <div className="timer-bar-wrap">
        <div className="timer-bar" style={{ width: `${timeLeft}%` }} />
      </div>

      {/* Note grid — rendered BEFORE audio onset */}
      <NoteGrid
        activeNotes={activeNotes}
        onPress={onNotePress}
        disabled={showConfidenceOverlay}
      />

      {notExactMode && currentTrial.stimType === 'detuned' && (
        <div className="direction-row">
          <button className="dir-btn" onClick={() => onNotePress('__sharp__')}>Sharp ↑</button>
          <button className="dir-btn" onClick={() => onNotePress('__flat__')}>Flat ↓</button>
        </div>
      )}

      {showConfidenceOverlay && (
        <div className="confidence-overlay">
          <p>Confidence?</p>
          <button className="conf-btn high" onClick={() => onConfidence('high')}>Sure</button>
          <button className="conf-btn low" onClick={() => onConfidence('low')}>Unsure</button>
        </div>
      )}
    </div>
  );
}
