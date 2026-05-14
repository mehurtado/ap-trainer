import { useEffect, useRef, useState } from 'react';
import { saveAmbient, getAllAmbient } from '../db/db.js';
import { CHROMAS } from '../audio/constants.js';

export default function AmbientLog({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState({
    sound_source: '',
    user_guess: '',
    confidence: '2',
    verified: false,
    verified_pitch: '',
    identification_mode: 'unclear',
    notes: '',
  });

  useEffect(() => {
    getAllAmbient().then(e => setEntries(e.reverse()));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    await saveAmbient({ ...form, confidence: parseInt(form.confidence) });
    getAllAmbient().then(e => setEntries(e.reverse()));
    setForm({ sound_source: '', user_guess: '', confidence: '2', verified: false, verified_pitch: '', identification_mode: 'unclear', notes: '' });
  }

  return (
    <div className="screen ambient-screen">
      <div className="dash-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Ambient Log</h2>
      </div>

      <form className="ambient-form" onSubmit={handleSubmit}>
        <input placeholder="Sound source (e.g. car horn, microwave)"
          value={form.sound_source} onChange={e => setForm({ ...form, sound_source: e.target.value })} required />

        <select value={form.user_guess} onChange={e => setForm({ ...form, user_guess: e.target.value })} required>
          <option value="">-- Your guess --</option>
          {CHROMAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="form-row">
          <label>Confidence: {form.confidence}</label>
          <input type="range" min={1} max={3} value={form.confidence}
            onChange={e => setForm({ ...form, confidence: e.target.value })} />
        </div>

        <select value={form.identification_mode} onChange={e => setForm({ ...form, identification_mode: e.target.value })}>
          <option value="categorical">Categorical (AP fired)</option>
          <option value="relational">Relational (RP inference)</option>
          <option value="simultaneous">Simultaneous (both)</option>
          <option value="unclear">Unclear</option>
        </select>

        <div className="form-row">
          <label>
            <input type="checkbox" checked={form.verified}
              onChange={e => setForm({ ...form, verified: e.target.checked })} />
            {' '}Verified
          </label>
          {form.verified && (
            <select value={form.verified_pitch} onChange={e => setForm({ ...form, verified_pitch: e.target.value })}>
              <option value="">-- Actual pitch --</option>
              {CHROMAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        <textarea placeholder="Notes (optional)" value={form.notes}
          onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />

        <button type="submit" className="session-btn primary">Log it</button>
      </form>

      <div className="ambient-list">
        {entries.slice(0, 20).map((entry, i) => (
          <div key={i} className="ambient-entry">
            <span className="ambient-source">{entry.sound_source}</span>
            <span className="ambient-guess">{entry.user_guess}</span>
            {entry.verified && <span className="ambient-verified">{entry.verified_pitch}</span>}
            <span className="ambient-mode">{entry.identification_mode}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
