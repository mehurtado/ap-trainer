import { createRepository } from './repository.js';

const listeners = new Set();
export const subscribeData = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export const notifyData = type => { for (const listener of listeners) listener(type); };
let active = createRepository('ap-trainer', null, notifyData);
// Set only during startup, before React mounts. Identity changes reload the page,
// so old asynchronous training work can never write into a new account.
export function setRepository(repository) { active = repository; }
export function getRepository() { return active; }
export function saveTrial(trial) { return active.write('trials', { ...trial, timestamp: trial.timestamp ?? new Date().toISOString() }); }
export function saveAmbient(entry) { return active.write('ambient', { ...entry, timestamp: entry.timestamp ?? new Date().toISOString() }); }
export const getAllTrials = () => active.records('trials');
export const getAllAmbient = () => active.records('ambient');
export const getRecords = store => active.records(store);
export const putRecord = (store, record) => active.write(store, record);
export const getMeta = key => active.getMeta(key);
export const setMeta = (key, value, options) => active.setMeta(key, value, options);
export const backfillMissingIds = () => active.initialize();
export const backfillAllMissingIds = () => active.initialize();
export async function clearHistory() {
  if (active.owner) return active.reset(null);
  return active.reset(null, true);
}
export const exportJSON = () => active.exportJSON();
export const importJSON = data => active.importJSON(data);

export function computeBackupSummary(data) {
  const trials = data.trials ?? [];
  const timestamps = trials.map(t => t.timestamp).filter(Boolean).sort();
  return {
    trialCount: trials.length,
    sessionCount: (data.sessions ?? []).length,
    blockCount: (data.blocks ?? []).length,
    epochCount: (data.epochs ?? []).length,
    ambientCount: (data.ambient ?? []).length,
    earliestTrial: timestamps[0] ?? null,
    latestTrial: timestamps[timestamps.length - 1] ?? null,
  };
}

const CSV_INJECTION_REGEX = /^[=+\-@\t\r]/;

export function sanitizeForCSV(value) {
  if (typeof value === 'string' && CSV_INJECTION_REGEX.test(value)) {
    return "'" + value;
  }
  return value;
}

// CSV export
export async function exportCSV() {
  const trials = await getAllTrials();
  const ambient = await getAllAmbient();

  const trialHeaders = [
    'id','schema_version','session_id','block_id','training_epoch','trial_purpose','target_pitch','response','correct','explicit_response_set','timbre','octave','stimulus_type','feedback_policy','input_method','second_instinct','second_instinct_latency','learner_model_version','scheduler_version','benchmark_version','stimulus_generator_version',
    'timestamp','is_cold_start','target_chroma','target_octave',
    'is_out_of_set','active_set_size',
    'cents_offset','cents_direction','instrument_id','sine_wave_flag',
    'noise_masked_flag','noise_type','dropout_type','tonal_context_flag',
    'attention_cue','user_guess','user_guess_direction','confidence',
    'latency_ms','result_bool','timeout_flag',
    'second_instinct_flag','second_instinct_note',
    'level','session_fatigue_flag','session_type',
    'drill_mode_flag','drill_notes',
    'progression_flag','progression_quality','progression_length','progression_degrees',
    'notes'
  ];

  const ambientHeaders = [
    'timestamp','sound_source','user_guess','confidence','verified',
    'verified_pitch','identification_mode','notes'
  ];

  const toCSV = (headers, rows) => {
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map(h => JSON.stringify(sanitizeForCSV(row[h] ?? ''))).join(','));
    }
    return lines.join('\n');
  };

  return {
    trials: toCSV(trialHeaders, trials),
    ambient: toCSV(ambientHeaders, ambient),
  };
}
