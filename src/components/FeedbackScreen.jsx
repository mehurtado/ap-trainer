export default function FeedbackScreen({ feedback, onContinue, sessionFatigue }) {
  if (!feedback) return null;

  return (
    <div className="screen feedback-screen">
      <div className={`result-indicator ${feedback.correct ? 'correct' : 'wrong'}`}>
        {feedback.correct ? '✓' : '✗'}
      </div>

      {!feedback.correct && (
        <div className="correction-info">
          <div className="correct-label">
            {feedback.isTimeout ? 'TIMEOUT' : `You pressed: ${feedback.guess}`}
          </div>
          <div className="target-label">
            Correct: <strong>{feedback.target}</strong>
          </div>
          {feedback.neighbors.length > 0 && (
            <div className="neighbors">
              <span className="neighbors-label">Often confused with: </span>
              {feedback.neighbors.join(', ')}
            </div>
          )}
        </div>
      )}

      {sessionFatigue && (
        <div className="fatigue-warning">
          Session fatigue detected. Stop here and rest.
        </div>
      )}

      <button className="continue-btn" onClick={onContinue}>
        {sessionFatigue ? 'End session' : 'Continue →'}
      </button>
    </div>
  );
}
