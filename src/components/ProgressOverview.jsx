import { useMemo, useState } from 'react';
import { CHROMAS } from '../audio/constants.js';
import { summarizeProgress } from '../lib/progress.js';
const percent = n => n == null ? '—' : `${Math.round(n * 100)}%`;
const purposes = { training: 'Practice with feedback', probe: 'Recall checks', mapping: 'Starting assessment', benchmark: 'Benchmark attempts' };
const holds = { evidence: 'Gathering more evidence', learning: 'Learning the new note', interference: 'Reinforcing an established note', load: 'Consolidating the current set', regression: 'Revisiting a note that needs attention' };
export default function ProgressOverview({ trials, blocks = [], epoch, compact = false, onDashboard }) {
  const [days, setDays] = useState('all');
  const summary = useMemo(() => summarizeProgress(trials, compact ? '7' : days), [trials, days, compact]);
  const latest = [...blocks].filter(b => b.session_type === 'adaptive' && b.training_epoch === epoch).sort((a,b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))).at(-1);
  const decision = latest?.scheduler_decision;
  const active = decision?.active_set ?? latest?.explicit_response_set ?? [];
  const candidate = decision?.candidate;
  const blockCounts = new Map();
  for (const row of summary.rows) blockCounts.set(row.block_id, (blockCounts.get(row.block_id) ?? 0) + 1);
  const recent = [...blocks].filter(b => blockCounts.has(b.id)).sort((a,b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).slice(0, 5);
  return <section className="progress-overview" aria-label="Training progress">
    <div className="section-heading"><div><h2>{compact ? 'Your progress at a glance' : 'Your training progress'}</h2><p>{compact ? 'Last 7 days · adaptive training and assessments' : 'Adaptive training and assessments. Manual exercises are shown separately below.'}</p></div>{!compact && <label className="range-label">Show <select value={days} onChange={e => setDays(e.target.value)}><option value="all">All time</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select></label>}</div>
    <div className="progress-metrics">
      {[[summary.rows.length.toLocaleString(), 'Responses recorded'], [percent(summary.accuracy), 'Named-note accuracy'], [summary.activeDays, 'Days practiced'], [summary.median == null ? '—' : `${(summary.median / 1000).toFixed(2)} s`, 'Typical correct response']].map(([value,label]) => <div className="progress-metric" key={label}><strong>{value}</strong><span>{label}</span></div>)}
    </div>
    <div className="training-focus"><div><h3>Current training set</h3><div className="note-chips">{active.length ? active.map(note => <span key={note}>{note}</span>) : <p>Your first round will establish a starting set.</p>}</div></div><div><h3>{candidate ? `Introducing ${candidate.pitch}` : 'Next step'}</h3><p>{candidate ? holds[candidate.hold_reason] ?? 'Seeing how this note fits alongside your current set.' : active.length ? 'Continue adaptive practice. The trainer checks recognition, confusion, and retention before adding notes.' : 'Start training to begin building your pitch history.'}</p>{latest && <small>Set shown from the latest scheduled round.</small>}</div></div>
    {summary.rows.length === 0 && <div className="progress-empty"><h3>{trials.some(t => t.schema_version === 2 && t.trial_purpose !== 'manual') ? 'No adaptive responses in this period' : 'Your adaptive progress starts here'}</h3><p>Complete a training round to see accuracy, response time, and note-by-note results here. Existing manual practice remains available below on the dashboard.</p></div>}
    {compact ? <button className="progress-link" onClick={onDashboard}>Open dashboard →</button> : <>
      <p className="metric-explanation">Named-note accuracy counts only targets available as note buttons; correct “OTHER” answers are excluded. Response time is the median for correct named answers. These summaries describe your practice, not a mastery score.</p>
      {summary.named.length > 0 && <div className="progress-columns"><section className="dash-card"><h3>Accuracy by day</h3><p>Latest 10 practice days in this period. Conditions and note sets may vary.</p><div className="daily-bars">{summary.daily.slice(-10).map(d => <div className="daily-row" key={d.day}><span>{d.day.slice(5)}</span><div className="accuracy-track"><div style={{width: `${d.accuracy*100}%`}} /></div><strong>{percent(d.accuracy)}</strong><small>{d.count} trials</small></div>)}</div></section>
      <section className="dash-card"><h3>Accuracy by note</h3><p>Counts matter: a few correct answers do not establish reliability.</p><div className="note-results">{CHROMAS.map(note => { const s = summary.byNote.find(n => n.note === note); return <div key={note}><strong>{note}</strong><span>{percent(s?.accuracy)}</span><small>{s ? `${s.count} trials` : 'Not measured'}</small></div>; })}</div></section></div>}
      {summary.rows.length > 0 && <div className="progress-columns"><section className="dash-card"><h3>Results by purpose</h3><p>Keep practice and assessment results separate. Benchmark attempts here include partial and nonstandard sessions.</p><div className="purpose-list">{summary.purposes.filter(p => p.count).map(p => <div key={p.purpose}><span>{purposes[p.purpose]}<small>{p.count} named trials</small></span><strong>{percent(p.accuracy)}</strong></div>)}</div></section><section className="dash-card"><h3>Recent rounds</h3><p>Recorded responses / planned trials. An unfinished round still contributes its saved responses.</p>{recent.length ? recent.map(b => { const count = blockCounts.get(b.id); return <div className="round-row" key={b.id}><span>{b.session_type === 'adaptive' ? 'Adaptive training' : b.session_type}<small>{b.created_at ? new Date(b.created_at).toLocaleDateString() : 'Date unavailable'}</small></span><strong>{count} / {b.block_length ?? b.trials?.length ?? '—'}</strong></div>; }) : <p>No round records available for these responses.</p>}</section></div>}
    </>}
  </section>;
}
