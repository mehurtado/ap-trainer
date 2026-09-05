import { useEffect } from 'react';
import NoteGrid from './NoteGrid.jsx';

export default function ProgressionScreen({
  currentProgression,
  activeNotes,
  onGuess,
  onPlayAgain,
  onQuit,
  level,
  trialIndex,
  sessionCorrect,
  sessionTotal,
}) {
  // Auto-play the progression whenever a new trial is presented.
  useEffect(() => {
    if (currentProgression) onPlayAgain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProgression]);

  return (
    <div className="screen progression-screen">
      <div className="trial-meta">
        <span>Level {level}</span>
        <span>#{trialIndex + 1}</span>
        {sessionTotal > 0 && (
          <span className="session-record">{sessionCorrect}/{sessionTotal}</span>
        )}
        <span className="tag prog">chord progression</span>
        <button className="quit-btn" aria-label="Quit progression" onClick={onQuit}>✕</button>
      </div>

      <div className="progression-info">
        <span className="progression-label">Identify the key</span>
        <button className="play-again-btn" onClick={onPlayAgain}>▶ Play again</button>
      </div>

      <NoteGrid activeNotes={activeNotes} onPress={onGuess} showOther={false} />
    </div>
  );
}
