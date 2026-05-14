import { useEffect, useRef, useState } from 'react';
import NoteGrid from './NoteGrid.jsx';

export default function TrialScreen({
  currentTrial,
  activeNotes,
  onNotePress,
  onTimeout,
  showConfidenceOverlay,
  onConfidence,
  secondInstinctPrompt,
  onSecondInstinct,
  level,
  trialIndex,
  sessionType,
  notExactMode,
  sessionCorrect,
  sessionTotal,
  onQuit,
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

  // Stop timer once confidence overlay appears or second instinct appears
  useEffect(() => {
    if (showConfidenceOverlay || secondInstinctPrompt) {
      clearInterval(intervalRef.current);
    }
  }, [showConfidenceOverlay, secondInstinctPrompt]);

  // Prevent unused variable warning
  if (sessionType) {}

  if (!currentTrial) return null;

  return (
    <div className="screen trial-screen">
      <div className="trial-meta">
        <span>Level {level}</span>
        <span>#{trialIndex + 1}</span>
        {sessionTotal > 0 && (
          <span className="session-record">{sessionCorrect}/{sessionTotal}</span>
        )}
        {currentTrial.isColdStart && <span className="tag cold">cold start</span>}
        <button className="quit-btn" onClick={onQuit}>✕</button>
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

      {showConfidenceOverlay && !secondInstinctPrompt && (
        <div className="confidence-overlay">
          <p>Confidence?</p>
          <button className="conf-btn high" onClick={() => onConfidence('high')}>Sure</button>
          <button className="conf-btn low" onClick={() => onConfidence('low')}>Unsure</button>
        </div>
      )}

      {secondInstinctPrompt && (
        <div className="confidence-overlay second-instinct">
          <p>Did you immediately know the correct answer?</p>
          <div className="si-buttons">
            <button className="conf-btn low" onClick={() => onSecondInstinct(false, null)}>No</button>
          </div>
          <p>If yes, which one?</p>
          <div className="si-grid">
            {activeNotes.map(n => (
              <button key={n} className="conf-btn high" onClick={() => onSecondInstinct(true, n)}>{n}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
