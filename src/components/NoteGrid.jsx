const CHROMATIC_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function NoteGrid({ activeNotes, onPress, disabled, showOther = true }) {
  const notes = CHROMATIC_ORDER;
  return (
    <div className="note-grid" style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
      {notes.map(note => (
        <button
          key={note}
          className="note-btn"
          onClick={() => !disabled && onPress(note)}
          disabled={disabled || !activeNotes.includes(note)}
        >
          {note}
        </button>
      ))}
      {showOther && activeNotes.length < 12 && (
        <button
          key="OTHER"
          style={{ gridColumn: '1 / -1' }}
          className="note-btn"
          onClick={() => !disabled && onPress('OTHER')}
          disabled={disabled}
        >
          Other
        </button>
      )}
    </div>
  );
}
