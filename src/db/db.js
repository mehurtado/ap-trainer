const DB_NAME = 'ap-trainer';
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const name of ['sessions', 'blocks', 'epochs']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('trials')) {
        const store = db.createObjectStore('trials', { autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('is_cold_start', 'is_cold_start');
        store.createIndex('level', 'level');
      }
      if (!db.objectStoreNames.contains('ambient')) {
        const a = db.createObjectStore('ambient', { autoIncrement: true });
        a.createIndex('timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); _db = null; }; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

let _db = null;
async function getDB() {
  if (!_db) _db = openDB().catch(error => { _db = null; throw error; });
  return _db;
}

export async function saveTrial(trial) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trials', 'readwrite');
    tx.objectStore('trials').add({ ...trial, timestamp: trial.timestamp ?? new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllTrials() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trials', 'readonly');
    const req = tx.objectStore('trials').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAmbient(entry) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ambient', 'readwrite');
    tx.objectStore('ambient').add({ ...entry, id: entry.id ?? crypto.randomUUID(), timestamp: new Date().toISOString() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllAmbient() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('ambient', 'readonly');
    const req = tx.objectStore('ambient').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getMeta(key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(key);
    req.onsuccess = () => resolve(req.result?.value);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(key, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function backfillMissingIds(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const keysReq = store.getAllKeys();
    keysReq.onerror = () => reject(keysReq.error);
    keysReq.onsuccess = () => {
      const keys = keysReq.result;
      const valuesReq = store.getAll();
      valuesReq.onerror = () => reject(valuesReq.error);
      valuesReq.onsuccess = () => {
        // This store has no keyPath, so a value on its own carries no
        // record of its real IDB key: getAll() alone can't tell us where to
        // put() it back without inserting a duplicate under a fresh
        // auto-incremented key. getAllKeys() and getAll() on the same store
        // return arrays in identical key order, so zipping them by index
        // recovers the real key, letting store.put(value, key) update the
        // existing record in place (the two-arg put is required — and only
        // valid — on a store with no keyPath).
        valuesReq.result.forEach((value, i) => {
          if (value.id) return;
          store.put({ ...value, id: crypto.randomUUID() }, keys[i]);
        });
      };
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function backfillAllMissingIds() {
  if (await getMeta('uuidBackfillV1')) return;
  await backfillMissingIds('trials');
  await backfillMissingIds('ambient');
  await setMeta('uuidBackfillV1', true);
}

export async function clearHistory() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['trials', 'ambient', 'sessions', 'blocks', 'meta'], 'readwrite');
    tx.objectStore('trials').clear();
    tx.objectStore('ambient').clear();
    tx.objectStore('sessions').clear();
    tx.objectStore('blocks').clear();
    tx.objectStore('meta').delete('curriculumEpoch');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// Full-fidelity backup/restore (JSON, not CSV) so history can be carried
// across origins — e.g. Vercel/Netlify preview deploys, which get a fresh
// throwaway domain per PR and therefore a fresh, empty IndexedDB.
export async function exportJSON() {
  const [trials, ambient] = await Promise.all([getAllTrials(), getAllAmbient()]);
  const [sessions, blocks, epochs, meta] = await Promise.all(['sessions','blocks','epochs','meta'].map(getRecords));
  return { schema_version: 2, trials, ambient, sessions, blocks, epochs, meta, exportedAt: new Date().toISOString() };
}

// Summarizes a payload already produced by exportJSON(), so the counts shown
// to the user describe the exact file they're about to save — not a fresh
// (and possibly different) DB read taken after the fact.
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

export async function importJSON({ trials = [], ambient = [], sessions = [], blocks = [], epochs = [], meta = [] }) {
  const existingIds = new Set((await getAllTrials()).filter(t => t.id).map(t => t.id));
  trials = trials.filter(t => { if (!t.id) return true; if (existingIds.has(t.id)) return false; existingIds.add(t.id); return true; });
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['trials', 'ambient', 'sessions', 'blocks', 'epochs', 'meta'], 'readwrite');
    const tStore = tx.objectStore('trials');
    const aStore = tx.objectStore('ambient');
    for (const t of trials) tStore.add(t);
    for (const a of ambient) aStore.add(a);
    for (const [store, rows] of Object.entries({ sessions, blocks, epochs, meta })) for (const row of rows) tx.objectStore(store).put(row);
    tx.oncomplete = () => resolve({ trials: trials.length, ambient: ambient.length });
    tx.onerror = () => reject(tx.error);
  });
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

export async function getRecords(store) {
 const db=await getDB(); return new Promise((resolve,reject)=>{const req=db.transaction(store,'readonly').objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
}
export async function putRecord(store,record) {
 const db=await getDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(record);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
