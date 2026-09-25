export const isAdaptiveTrial = t => t.schema_version === 2 && t.trial_purpose !== 'manual';
export const isValidTrial = t => t.valid !== false && t.invalidated !== true && t.completed !== false;
export function localDay(timestamp) {
  const d = new Date(timestamp);
  return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;
}
export function summarizeProgress(trials, days = 'all', now = new Date()) {
  const cutoff = new Date(now); cutoff.setHours(0, 0, 0, 0);
  if (days !== 'all') cutoff.setDate(cutoff.getDate() - Number(days) + 1);
  const rows = trials.filter(t => isAdaptiveTrial(t) && isValidTrial(t) && Number.isFinite(Date.parse(t.timestamp)) && (days === 'all' || Date.parse(t.timestamp) >= cutoff.getTime()));
  const named = rows.filter(t => Array.isArray(t.explicit_response_set) && t.explicit_response_set.includes(t.target_pitch));
  const accuracy = list => list.length ? list.filter(t => t.correct === true).length / list.length : null;
  const byNote = [...new Set(named.map(t => t.target_pitch))].map(note => { const list = named.filter(t => t.target_pitch === note); return { note, count: list.length, accuracy: accuracy(list) }; });
  const daily = [...new Set(named.map(t => localDay(t.timestamp)))].sort().map(day => { const list = named.filter(t => localDay(t.timestamp) === day); return { day, count: list.length, accuracy: accuracy(list) }; });
  const times = named.filter(t => t.correct === true && Number.isFinite(t.latency_ms) && t.latency_ms >= 0).map(t => t.latency_ms).sort((a,b) => a-b);
  const median = times.length ? (times[Math.floor((times.length-1)/2)] + times[Math.floor(times.length/2)]) / 2 : null;
  return { rows, named, byNote, daily, median, accuracy: accuracy(named), activeDays: new Set(rows.map(t => localDay(t.timestamp))).size,
    purposes: ['training', 'probe', 'mapping', 'benchmark'].map(purpose => { const list = named.filter(t => t.trial_purpose === purpose); return { purpose, count: list.length, accuracy: accuracy(list) }; }) };
}
