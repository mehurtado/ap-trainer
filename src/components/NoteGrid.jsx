import React from 'react';

const CHROMATIC_ORDER = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export default function NoteGrid({ activeNotes, onPress, disabled }) {
  return (
    <div className="note-grid">
      {CHROMATIC_ORDER.map(note => {
        const isActive = activeNotes.includes(note);
        return (
          <button
            key={note}
            className={`note-btn ${isActive ? 'active' : 'inactive'}`}
            onClick={() => isActive && !disabled && onPress(note)}
            disabled={!isActive || disabled}
          >
            {note}
          </button>
        );
      })}
    </div>
  );
}
