import { CHROMAS } from '../audio/constants.js';
import { median, benchmarkEligible } from '../curriculum/model.js';
const percent = n => n == null ? '—' : `${Math.round(n * 100)}%`;
export default function CurriculumAnalytics({
  trials,
  blocks,
  model
}) {
  const standardBenchmarks = new Set(blocks.filter(b => {
    const rows = trials.filter(t => t.block_id === b.id);
    return b.session_type === 'benchmark' && rows.length === b.block_length &&
      rows.every(t => benchmarkEligible(t.session_context ?? {}) && t.invalidated !== true && t.valid !== false);
  }).map(b => b.id));
  const categories = ['training', 'probe', 'benchmark'];
  const history = blocks.map(b => {
    const rows = trials.filter(t => t.block_id === b.id && t.explicit_response_set.includes(t.target_pitch));
    return {
      id: b.id,
      label: b.created_at,
      rt: median(rows.filter(t => t.correct).map(t => t.latency_ms)),
      count: rows.length
    };
  }).filter(b => b.rt != null).slice(-30);
  const max = Math.max(3000, ...history.map(b => b.rt));
  return <section><h2>Evidence by purpose</h2><div className="table-scroll"><table><thead><tr><th>Purpose</th><th>Named observations</th><th>Balanced accuracy</th><th>Median correct RT</th></tr></thead><tbody>{categories.map(purpose => {
            const rows = trials.filter(t => t.trial_purpose === purpose && (purpose !== 'benchmark' || standardBenchmarks.has(t.block_id)) && t.explicit_response_set.includes(t.target_pitch));
            const rates = CHROMAS.map(p => rows.filter(t => t.target_pitch === p)).filter(a => a.length).map(a => a.filter(t => t.correct).length / a.length);
            return <tr key={purpose}><th>{purpose}</th><td>{rows.length}</td><td>{percent(rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null)}</td><td>{median(rows.filter(t => t.correct).map(t => t.latency_ms)) ?? '—'} ms</td></tr>;
          })}</tbody></table></div><p>Training and probe summaries depend on the sampled tasks. Benchmark summaries include only complete, sober, focused headphone sessions. Compare the same protocol version.</p>
 <h2>Confusion map</h2><p>Rows are targets; columns are responses. Counts include named-pitch trials; OTHER and timeouts remain separate.</p><div className="table-scroll"><table className="confusion-table"><thead><tr><th>Target</th>{CHROMAS.concat('OTHER', 'TIMEOUT').map(p => <th key={p}>{p}</th>)}</tr></thead><tbody>{CHROMAS.map(p => {
            const counts = model.pitches[p].confusion,
              total = Object.values(counts).reduce((a, b) => a + b, 0);
            return <tr key={p}><th>{p}</th>{CHROMAS.concat('OTHER', 'TIMEOUT').map(q => <td key={q} style={{
                background: `rgba(100,120,240,${total ? counts[q] / total * .7 : 0})`
              }} title={`${p} → ${q}: ${counts[q]} / ${total}`}>{counts[q] || '·'}</td>)}</tr>;
          })}</tbody></table></div>
 <h2>Response-time history</h2><p>Median correct named response per block; mixed training conditions are descriptive, not standardized measurement.</p>{history.length > 0 ? <svg viewBox="0 0 600 180" role="img" aria-label="Median response time over the latest thirty blocks"><line x1="15" y1="155" x2="585" y2="155" stroke="currentColor" />{history.map((b, i) => {
        const x = 20 + i * 560 / Math.max(1, history.length - 1),
          y = 150 - b.rt / max * 125;
        return <g key={b.id}><circle cx={x} cy={y} r="5" fill="currentColor"><title>{b.label}: {Math.round(b.rt)} ms, {b.count} named trials</title></circle>{i > 0 && <line x1={20 + (i - 1) * 560 / Math.max(1, history.length - 1)} y1={150 - history[i - 1].rt / max * 125} x2={x} y2={y} stroke="currentColor" />}</g>;
      })}<text x="15" y="177" fill="currentColor">Earlier</text><text x="530" y="177" fill="currentColor">Recent</text></svg> : <p>No latency observations yet.</p>}
 <h2>OTHER by response vocabulary</h2>{Object.entries(model.other).map(([key, s]) => <p key={key}>{key}: {percent(s.correct / s.total)} · {s.total} negative trials</p>)}
 </section>;
}
