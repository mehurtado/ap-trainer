const CHROMATIC_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function NoteGrid({ activeNotes, onPress, disabled }) {
  const notes = CHROMATIC_ORDER.filter(note => activeNotes.includes(note));
  return (
    <div className="note-grid">
      {notes.map(note => (
        <button
          key={note}
          className="note-btn"
          onClick={() => !disabled && onPress(note)}
          disabled={disabled}
        >
          {note}
        </button>
      ))}
      <button
        key="OTHER"
        className="note-btn"
        onClick={() => !disabled && onPress('OTHER')}
        disabled={disabled}
      >
        Other
      </button>
    </div>
  );
}
