const DB_NAME = 'ap-trainer';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let _db = null;
async function getDB() {
  if (!_db) _db = await openDB();
  return _db;
}

export async function saveTrial(trial) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trials', 'readwrite');
    tx.objectStore('trials').add({ ...trial, timestamp: new Date().toISOString() });
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
    tx.objectStore('ambient').add({ ...entry, timestamp: new Date().toISOString() });
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

export async function clearHistory() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['trials', 'ambient'], 'readwrite');
    tx.objectStore('trials').clear();
    tx.objectStore('ambient').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// CSV export
export async function exportCSV() {
  const trials = await getAllTrials();
  const ambient = await getAllAmbient();

  const trialHeaders = [
    'timestamp','is_cold_start','target_chroma','target_octave',
    'cents_offset','cents_direction','instrument_id','sine_wave_flag',
    'noise_masked_flag','noise_type','dropout_type','tonal_context_flag',
    'attention_cue','user_guess','user_guess_direction','confidence',
    'latency_ms','result_bool','timeout_flag','level','session_fatigue_flag',
    'cognitive_load_level','intoxication_flag','session_type',
    'contamination_flag','notes'
  ];

  const ambientHeaders = [
    'timestamp','sound_source','user_guess','confidence','verified',
    'verified_pitch','identification_mode','notes'
  ];

  const toCSV = (headers, rows) => {
    const headerCount = headers.length;
    const rowCount = rows.length;
    const lines = new Array(rowCount + 1);
    lines[0] = headers.join(',');
    for (let i = 0; i < rowCount; i++) {
      const row = rows[i];
      const rowValues = new Array(headerCount);
      for (let j = 0; j < headerCount; j++) {
        rowValues[j] = row[headers[j]] ?? '';
      }
      lines[i + 1] = JSON.stringify(rowValues).slice(1, -1);
    }
    return lines.join('\n');
  };

  return {
    trials: toCSV(trialHeaders, trials),
    ambient: toCSV(ambientHeaders, ambient),
  };
}
