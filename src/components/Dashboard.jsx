import React, { useEffect, useState } from 'react';
import { getAllTrials, exportCSV, clearHistory } from '../db/db.js';
import { CHROMAS, INSTRUMENTS } from '../audio/constants.js';

function buildConfusionGrid(trials, filter = 'all') {
  const grid = {};
  for (const c of CHROMAS) { grid[c] = {}; for (const r of CHROMAS) grid[c][r] = 0; }
  for (const t of trials) {
    if (filter === 'sine' && !t.sine_wave_flag) continue;
    if (filter === 'instrument' && (t.sine_wave_flag || t.noise_masked_flag || Math.abs(t.cents_offset || 0) > 0)) continue;
    if (filter === 'detuned' && Math.abs(t.cents_offset || 0) === 0) continue;
    if (filter === 'noise' && !t.noise_masked_flag) continue;
    if (filter.startsWith('inst:') && t.instrument_id !== filter.slice(5)) continue;

    if (!t.result_bool && t.user_guess && t.user_guess !== 'TIMEOUT' && t.target_chroma) {
      grid[t.target_chroma][t.user_guess] = (grid[t.target_chroma][t.user_guess] || 0) + 1;
    }
  }
  return grid;
}

function ConfusionMatrix({ grid, title }) {
  const maxVal = Math.max(1, ...CHROMAS.flatMap(t => CHROMAS.map(r => grid[t]?.[r] || 0)));
  return (
    <div className="matrix-wrap">
      <h3>{title}</h3>
      <div className="matrix-grid" style={{ gridTemplateColumns: `repeat(${CHROMAS.length + 1}, 1fr)` }}>
        <div className="matrix-cell header" />
        {CHROMAS.map(r => <div key={r} className="matrix-cell header">{r}</div>)}
        {CHROMAS.map(target => (
          <React.Fragment key={target}>
            <div className="matrix-cell header">{target}</div>
            {CHROMAS.map(response => {
              const val = grid[target]?.[response] || 0;
              const isDiag = target === response;
              const intensity = isDiag ? 0 : Math.min(1, val / maxVal);
              return (
                <div
                  key={response}
                  className={`matrix-cell ${isDiag ? 'diag' : ''}`}
                  style={{ backgroundColor: isDiag ? 'var(--bg3)' : `rgba(255,60,60,${intensity})` }}
                  title={`${target}→${response}: ${val}`}
                >
                  {val > 0 && !isDiag ? val : ''}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function AccuracyChart({ trials }) {
  const coldTrials = trials.filter(t => t.is_cold_start);
  const eveningTrials = trials.filter(t => !t.is_cold_start && t.session_type === 'evening');

  const bucketByDay = (arr) => {
    const days = {};
    for (const t of arr) {
      const day = t.timestamp?.slice(0, 10);
      if (!day) continue;
      if (!days[day]) days[day] = { correct: 0, total: 0 };
      days[day].total++;
      if (t.result_bool) days[day].correct++;
    }
    return Object.entries(days).sort().map(([day, d]) => ({
      day, acc: d.total ? d.correct / d.total : 0
    }));
  };

  const coldByDay = bucketByDay(coldTrials);
  const eveningByDay = bucketByDay(eveningTrials);
  const allDays = [...new Set([...coldByDay.map(d => d.day), ...eveningByDay.map(d => d.day)])].sort();

  if (allDays.length === 0) return <div className="chart-empty">No data yet</div>;

  const chartH = 120;
  const chartW = Math.max(300, allDays.length * 24);

  const toY = (acc) => chartH - acc * chartH;

  const makePolyline = (data) => {
    const map = Object.fromEntries(data.map(d => [d.day, d.acc]));
    return allDays
      .map((day, i) => map[day] !== undefined ? `${i * 24 + 12},${toY(map[day])}` : null)
      .filter(Boolean).join(' ');
  };

  return (
    <div className="chart-wrap">
      <h3>Accuracy: Cold Start vs Evening</h3>
      <div style={{ overflowX: 'auto' }}>
        <svg width={chartW} height={chartH + 20} style={{ display: 'block' }}>
          {[0.25, 0.5, 0.75, 0.9].map(v => (
            <line key={v} x1={0} y1={toY(v)} x2={chartW} y2={toY(v)}
              stroke="#333" strokeWidth={1} strokeDasharray="3 3" />
          ))}
          {makePolyline(coldByDay) && (
            <polyline points={makePolyline(coldByDay)} fill="none" stroke="#4af" strokeWidth={2} />
          )}
          {makePolyline(eveningByDay) && (
            <polyline points={makePolyline(eveningByDay)} fill="none" stroke="#f84" strokeWidth={2} />
          )}
          {allDays.map((day, i) => (
            <text key={day} x={i * 24 + 12} y={chartH + 14} fontSize={8} fill="#666" textAnchor="middle">
              {day.slice(5)}
            </text>
          ))}
        </svg>
      </div>
      <div className="chart-legend">
        <span style={{ color: '#4af' }}>Cold start</span>
        <span style={{ color: '#f84' }}>Evening</span>
      </div>
    </div>
  );
}

export default function Dashboard({ onBack }) {
  const [trials, setTrials] = useState([]);
  const [matrixFilter, setMatrixFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    getAllTrials().then(setTrials);
  }, []);

  const grid = buildConfusionGrid(trials, matrixFilter);

  async function doExport() {
    setExporting(true);
    const { trials: tCSV, ambient: aCSV } = await exportCSV();
    const zip = [
      { name: 'trials.csv', content: tCSV },
      { name: 'ambient.csv', content: aCSV },
    ];
    for (const f of zip) {
      const blob = new Blob([f.content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = f.name; a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  async function doWipe() {
    setWiping(true);
    await clearHistory();
    setTrials([]);
    setWiping(false);
    setConfirmWipe(false);
  }

  const totalTrials = trials.length;
  const correctTrials = trials.filter(t => t.result_bool).length;
  const overallAcc = totalTrials ? (correctTrials / totalTrials * 100).toFixed(1) : '--';

  const sineTrials = trials.filter(t => t.sine_wave_flag);
  const sineAcc = sineTrials.length
    ? (sineTrials.filter(t => t.result_bool).length / sineTrials.length * 100).toFixed(1)
    : '--';

  const timeouts = trials.filter(t => t.timeout_flag || t.user_guess === 'TIMEOUT').length;
  const timeoutFreq = totalTrials ? (timeouts / totalTrials * 100).toFixed(1) : '--';

  const validRtTrials = trials.filter(t => typeof t.latency_ms === 'number' && t.latency_ms > 0 && !t.timeout_flag);
  const avgRt = validRtTrials.length
    ? Math.round(validRtTrials.reduce((sum, t) => sum + t.latency_ms, 0) / validRtTrials.length)
    : '--';

  const validCorrectRtTrials = validRtTrials.filter(t => t.result_bool);
  const avgRtCorrect = validCorrectRtTrials.length
    ? Math.round(validCorrectRtTrials.reduce((sum, t) => sum + t.latency_ms, 0) / validCorrectRtTrials.length)
    : '--';

  return (
    <div className="screen dashboard-screen">
      <div className="dash-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Dashboard</h2>
        <div className="dash-actions">
          <button className="export-btn" onClick={doExport} disabled={exporting}>
            {exporting ? '...' : 'Export CSV'}
          </button>
          <button className="wipe-btn" onClick={() => setConfirmWipe(true)} disabled={confirmWipe}>
            Wipe History
          </button>
        </div>
      </div>

      {confirmWipe && (
        <div className="wipe-confirm-bar">
          <span>Delete all trial and ambient data?</span>
          <button className="back-btn" onClick={() => setConfirmWipe(false)}>Cancel</button>
          <button className="wipe-btn danger" onClick={doWipe} disabled={wiping}>
            {wiping ? '...' : 'Yes, wipe'}
          </button>
        </div>
      )}

      <div className="stat-row">
        <div className="stat"><span className="stat-value">{totalTrials}</span><span className="stat-label">trials</span></div>
        <div className="stat"><span className="stat-value">{overallAcc}%</span><span className="stat-label">overall</span></div>
        <div className="stat"><span className="stat-value">{sineAcc}%</span><span className="stat-label">sine wave</span></div>
      </div>

      <div className="stat-row">
        <div className="stat"><span className="stat-value">{timeoutFreq}%</span><span className="stat-label">timeout freq</span></div>
        <div className="stat"><span className="stat-value">{avgRt}{avgRt !== '--' ? 'ms' : ''}</span><span className="stat-label">avg RT (all)</span></div>
        <div className="stat"><span className="stat-value">{avgRtCorrect}{avgRtCorrect !== '--' ? 'ms' : ''}</span><span className="stat-label">avg RT (correct)</span></div>
      </div>

      <AccuracyChart trials={trials} />

      <div className="matrix-filter">
        {['all', 'sine', 'instrument', 'detuned', 'noise'].map(f => (
          <button key={f} className={`filter-btn ${matrixFilter === f ? 'active' : ''}`}
            onClick={() => setMatrixFilter(f)}>
            {f}
          </button>
        ))}
        <select
          className="filter-dropdown"
          value={matrixFilter.startsWith('inst:') ? matrixFilter : ''}
          onChange={(e) => setMatrixFilter(e.target.value)}
        >
          <option value="" disabled>Per Instrument</option>
          {INSTRUMENTS.map(inst => (
            <option key={inst} value={`inst:${inst}`}>
              {inst}
            </option>
          ))}
        </select>
      </div>

      <ConfusionMatrix grid={grid} title={`Confusion Matrix (${matrixFilter})`} />
    </div>
  );
}
