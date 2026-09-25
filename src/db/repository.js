export const HISTORY = ['trials', 'ambient', 'sessions', 'blocks', 'epochs'];
export const USER_META = ['curriculumEpoch', 'candidateOverride', 'level', 'streak', 'lastTrialTime', 'responseWindowMs', 'adaptiveMode', 'notExactMode', 'noiseScrambleMode'];
const STORES = [...HISTORY, 'meta', 'outbox', 'sync', 'recovery'];
const uuid = () => crypto.randomUUID();
const request = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const completed = tx => new Promise((resolve, reject) => {
  tx.oncomplete = resolve;
  tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage transaction failed'));
});
export function chronological(a, b) {
  const time = row => Date.parse(row.timestamp ?? row.created_at ?? row.started_at) || 0;
  return time(a) - time(b) || String(a.id).localeCompare(String(b.id));
}
export function mergePayload(kind, existing, incoming) {
  if (!existing) return incoming;
  if (kind !== 'sessions') return existing;
  if (!('ended_at' in existing) && !('ended_at' in incoming)) return existing;
  const end = [existing.ended_at, incoming.ended_at].filter(Boolean).sort().at(-1) ?? null;
  return { ...existing, ended_at: end };
}
// Stable IDs for repeated imports of old backups without distributed IDs.
async function legacyId(value) {
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value)))));
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function createRepository(name = 'ap-trainer', owner = null, onChange = () => {}) {
  let connection;
  async function db() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 3);
      req.onupgradeneeded = () => {
        const database = req.result;
        for (const store of STORES) {
          const s = database.objectStoreNames.contains(store) ? req.transaction.objectStore(store)
            : database.createObjectStore(store, store === 'trials' || store === 'ambient'
              ? { autoIncrement: true } : { keyPath: ['meta', 'sync'].includes(store) ? 'key' : 'id' });
          if (HISTORY.includes(store) && !s.indexNames.contains('logical_id')) s.createIndex('logical_id', 'id');
        }
      };
      req.onerror = () => { connection = null; reject(req.error); };
      req.onblocked = () => { connection = null; reject(new Error('Close other AP Trainer tabs to update local storage.')); };
      req.onsuccess = () => {
        req.result.onversionchange = () => { req.result.close(); connection = null; };
        resolve(req.result);
      };
    });
    return connection;
  }
  async function transact(stores, write, fn) {
    const database = await db();
    const tx = database.transaction(stores, write ? 'readwrite' : 'readonly');
    const done = completed(tx);
    try { const result = await fn(tx); await done; return result; }
    catch (error) { try { tx.abort(); } catch { /* already settled */ } await done.catch(() => {}); throw error; }
  }
  const state = key => transact(['sync'], false, tx => request(tx.objectStore('sync').get(key)).then(r => r?.value));
  const setState = (key, value) => transact(['sync'], true, tx => { tx.objectStore('sync').put({ key, value }); });
  const getMeta = key => transact(['meta'], false, tx => request(tx.objectStore('meta').get(key)).then(r => r?.value));
  const records = store => transact([store], false, tx => request(tx.objectStore(store).getAll())).then(rows => HISTORY.includes(store) ? rows.sort(chronological) : rows);
  async function queue(tx, kind, payload, logicalId) {
    const sync = tx.objectStore('sync');
    const clock = Math.max(Date.now(), (await request(sync.get('clock')))?.value + 1 || 0);
    sync.put({ key: 'clock', value: clock });
    let device = (await request(sync.get('device')))?.value;
    if (!device) { device = uuid(); sync.put({ key: 'device', value: device }); }
    const entry = { id: `${kind}:${logicalId}`, kind, logical_id: logicalId, payload, device_id: device, clock, token: uuid() };
    tx.objectStore('outbox').put(entry);
    if (kind === 'meta') sync.put({ key: `version:${logicalId}`, value: [clock, device] });
  }
  async function write(kind, value) {
    const payload = kind === 'meta' ? value : { ...value, id: value.id || uuid() };
    if (!HISTORY.includes(kind) && kind !== 'meta') throw new Error('Unsupported history store');
    const id = kind === 'meta' ? payload.key : payload.id;
    await transact([kind, 'outbox', 'sync'], true, async tx => {
      if (!owner && (await request(tx.objectStore('sync').get('claimedBy')))?.value) throw new Error('This history is attached to an account. Reload to continue.');
      const store = tx.objectStore(kind);
      const keyless = kind === 'trials' || kind === 'ambient';
      const key = keyless ? await request(store.index('logical_id').getKey(id)) : id;
      const old = key === undefined ? undefined : await request(store.get(key));
      const merged = kind === 'meta' ? payload : mergePayload(kind, old, payload);
      if (old && JSON.stringify(merged) === JSON.stringify(old)) return;
      if (keyless) { if (key === undefined) store.add(merged); else store.put(merged, key); }
      else store.put(merged);
      if (kind !== 'meta' || USER_META.includes(id)) await queue(tx, kind, merged, id);
    });
    onChange('write');
    return payload;
  }
  // Each cursor page and its checkpoint commit together. No full-history array.
  async function initialize() {
    for (const kind of [...HISTORY, 'meta']) {
      let finished = false;
      while (!finished) {
        finished = await transact([kind, 'sync', 'outbox'], true, async tx => {
          const sync = tx.objectStore('sync');
          const checkpoint = (await request(sync.get(`seed:${kind}`)))?.value;
          if (checkpoint?.done) return true;
          const store = tx.objectStore(kind);
          let count = 0;
          return new Promise((resolve, reject) => {
            const req = store.openCursor(checkpoint?.key == null ? undefined : IDBKeyRange.lowerBound(checkpoint.key, true));
            req.onerror = () => reject(req.error);
            req.onsuccess = async () => {
              try {
                const cursor = req.result;
                if (!cursor) { sync.put({ key: `seed:${kind}`, value: { done: true } }); resolve(true); return; }
                let row = cursor.value;
                if (kind !== 'meta' && !row.id) { row = { ...row, id: uuid() }; cursor.update(row); }
                const id = kind === 'meta' ? row.key : row.id;
                if (kind !== 'meta' || USER_META.includes(id)) {
                  if (!await request(tx.objectStore('outbox').get(`${kind}:${id}`))) await queue(tx, kind, row, id);
                }
                sync.put({ key: `seed:${kind}`, value: { key: cursor.primaryKey } });
                if (++count >= 250) resolve(false); else cursor.continue();
              } catch (e) { reject(e); }
            };
          });
        });
      }
    }
  }
  const pending = (limit = 200, after) => transact(['outbox'], false, tx => request(tx.objectStore('outbox').getAll(after ? IDBKeyRange.lowerBound(after, true) : undefined, limit)));
  async function acknowledge(entries) {
    await transact(['outbox'], true, async tx => {
      const store = tx.objectStore('outbox');
      for (const entry of entries) {
        const current = await request(store.get(entry.id));
        if (current?.token === entry.token) store.delete(entry.id);
      }
    });
  }
  async function applyPage(rows, cursor, generation) {
    await transact([...HISTORY, 'meta', 'sync', 'outbox'], true, async tx => {
      const sync = tx.objectStore('sync');
      for (const row of rows) {
        const kind = row.kind;
        if (!HISTORY.includes(kind) && !(kind === 'meta' && USER_META.includes(row.logical_id))) throw new Error('Unsupported cloud record');
        if (kind !== 'meta' && row.payload.id !== row.logical_id) throw new Error('Cloud identity mismatch');
        const store = tx.objectStore(kind);
        if (kind === 'meta') {
          const version = (await request(sync.get(`version:${row.logical_id}`)))?.value ?? [0, ''];
          const newer = row.clock > version[0] || row.clock === version[0] && row.device_id >= version[1];
          const currentClock = (await request(sync.get('clock')))?.value ?? 0;
          sync.put({ key: 'clock', value: Math.max(currentClock, row.clock) });
          const localMeta = await request(store.get(row.logical_id));
          if (newer || row.logical_id === 'curriculumEpoch' && localMeta?.initial) {
            store.put(row.payload);
            sync.put({ key: `version:${row.logical_id}`, value: [row.clock, row.device_id] });
          }
        } else {
          const keyless = kind === 'trials' || kind === 'ambient';
          const key = keyless ? await request(store.index('logical_id').getKey(row.logical_id)) : row.logical_id;
          const old = key === undefined ? null : await request(store.get(key));
          // Server chooses the immutable winner; preserve any newer local session completion.
          const payload = kind === 'sessions' ? mergePayload(kind, row.payload, old ?? {}) : row.payload;
          if (keyless) { if (key === undefined) store.add(payload); else store.put(payload, key); }
          else store.put(payload);
        }
      }
      sync.put({ key: 'cursor', value: cursor });
      sync.put({ key: 'generation', value: generation });
    });
    // Engine emits one invalidation after the complete reconciliation pass.
  }
  async function reset(generation, recover = false) {
    await transact(STORES, true, async tx => {
      const pendingRows = await request(tx.objectStore('outbox').getAll());
      if (pendingRows.length && !recover) throw new Error('Sync pending changes before clearing the local cache.');
      if (recover) for (const entry of pendingRows) tx.objectStore('recovery').put({ ...entry, id: `${uuid()}:${entry.id}` });
      for (const kind of [...HISTORY, 'meta', 'outbox']) tx.objectStore(kind).clear();
      const syncStore = tx.objectStore('sync');
      for (const key of await request(syncStore.getAllKeys())) {
        if (String(key).startsWith('version:')) syncStore.delete(key);
      }
      tx.objectStore('sync').put({ key: 'cursor', value: 0 });
      if (generation != null) tx.objectStore('sync').put({ key: 'generation', value: generation });
    });
    onChange('reset');
  }
  async function exportJSON() {
    return transact([...HISTORY, 'meta'], false, async tx => {
      const result = { schema_version: 3, owner_id: owner, exportedAt: new Date().toISOString() };
      for (const kind of [...HISTORY, 'meta']) result[kind] = await request(tx.objectStore(kind).getAll());
      result.meta = result.meta.filter(r => USER_META.includes(r.key) || r.key === 'readinessPerturbation');
      return result;
    });
  }
  async function importJSON(data) {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup');
    if (data.owner_id && data.owner_id !== owner) throw new Error('This backup belongs to another account. Sign in to that account to restore it.');
    for (const kind of [...HISTORY, 'meta']) if (data[kind] != null && !Array.isArray(data[kind])) throw new Error(`Invalid ${kind} backup`);
    const counts = { trials: 0, ambient: 0 };
    const occurrences = new Map();
    for (const kind of [...HISTORY, 'meta']) {
      for (const original of data[kind] ?? []) {
        if (!original || typeof original !== 'object') throw new Error('Invalid backup record');
        if (kind === 'meta' && !USER_META.includes(original.key) && original.key !== 'readinessPerturbation') continue;
        let logicalId = original.id;
        if (kind !== 'meta' && !logicalId) {
          const fingerprint = await legacyId(original);
          const key = `${kind}:${fingerprint}`;
          const occurrence = (occurrences.get(key) ?? 0) + 1;
          occurrences.set(key, occurrence);
          logicalId = occurrence === 1 ? fingerprint : await legacyId({ fingerprint, occurrence });
        }
        const row = kind === 'meta' ? original : { ...original, id: logicalId };
        await write(kind, row);
        if (kind in counts) counts[kind]++;
      }
    }
    onChange('pull');
    return counts;
  }
  async function hasHistory() {
    return transact(HISTORY, false, async tx => {
      for (const kind of HISTORY) if (await request(tx.objectStore(kind).count())) return true;
      return false;
    });
  }
  async function copyInto(target) {
    for (const kind of [...HISTORY, 'meta']) {
      let after;
      while (true) {
        const page = await transact([kind], false, async tx => {
          const store = tx.objectStore(kind);
          const range = after === undefined ? undefined : IDBKeyRange.lowerBound(after, true);
          const [keys, values] = await Promise.all([request(store.getAllKeys(range, 200)), request(store.getAll(range, 200))]);
          return { keys, values };
        });
        if (!page.values.length) break;
        await target.importJSON({ [kind]: page.values });
        after = page.keys.at(-1);
      }
    }
  }
  async function close() { if (connection) (await connection).close(); connection = null; }
  return { name, owner, count: kind => transact([kind], false, tx => request(tx.objectStore(kind).count())), initialize, hasHistory, copyInto, changed: () => onChange('pull'), write, records, getMeta, state, setState, pending, acknowledge, applyPage, reset, exportJSON, importJSON, close,
    setMeta: (key, value, options = {}) => write('meta', { key, value, ...options }),
    recovery: () => records('recovery') };
}
