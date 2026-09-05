export default function ProgressionFeedback({ feedback, onContinue }) {
  if (!feedback) return null;

  const keyName = `${feedback.target} ${feedback.quality}`;

  return (
    <div className="screen feedback-screen">
      <div className={`result-indicator ${feedback.correct ? 'correct' : 'wrong'}`}>
        {feedback.correct ? '✓' : '✗'}
      </div>

      {!feedback.correct && (
        <div className="correction-info">
          <div className="correct-label">You pressed: {feedback.guess}</div>
        </div>
      )}

      <div className="target-label">
        Key: <strong>{keyName}</strong>
      </div>

      <button className="continue-btn" onClick={onContinue}>Continue →</button>
    </div>
  );
}
