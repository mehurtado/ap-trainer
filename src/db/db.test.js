import { test } from 'node:test';
import assert from 'node:assert';
import { sanitizeForCSV } from './db.js';

test('sanitizeForCSV prepends single quote to dangerous characters', () => {
  assert.strictEqual(sanitizeForCSV('=1+2'), "'=1+2");
  assert.strictEqual(sanitizeForCSV('+sum(A1:A2)'), "'+sum(A1:A2)");
  assert.strictEqual(sanitizeForCSV('-123'), "'-123");
  assert.strictEqual(sanitizeForCSV('@something'), "'@something");
  assert.strictEqual(sanitizeForCSV('\talert(1)'), "'\talert(1)");
  assert.strictEqual(sanitizeForCSV('\rtest'), "'\rtest");
});

test('sanitizeForCSV does not modify safe strings', () => {
  assert.strictEqual(sanitizeForCSV('hello'), 'hello');
  assert.strictEqual(sanitizeForCSV('123'), '123');
  assert.strictEqual(sanitizeForCSV(''), '');
});

test('sanitizeForCSV does not modify non-string values', () => {
  assert.strictEqual(sanitizeForCSV(123), 123);
  assert.strictEqual(sanitizeForCSV(true), true);
  assert.strictEqual(sanitizeForCSV(null), null);
  assert.strictEqual(sanitizeForCSV(undefined), undefined);
});

// --- Mock IndexedDB for testing integration ---

class MockIDBObjectStore {
  constructor() {
    this.data = [];
  }
  add(item) {
    if (item.triggerError) {
      this.tx.error = new Error('Mocked transaction error');
    } else {
      this.data.push(item);
    }
  }
  put(item) { const key=item.id??item.key; const i=this.data.findIndex(x=>(x.id??x.key)===key); if(i<0)this.data.push(item);else this.data[i]=item; }
  getAll() {
    const req = {};
    setTimeout(() => {
      req.result = [...this.data];
      if (req.onsuccess) req.onsuccess();
    }, 0);
    return req;
  }
  createIndex() {}
}

class MockIDBTransaction {
  constructor(stores) {
    this.stores = stores;
    this.oncomplete = null;
    this.onerror = null;
    this.error = null;

    for (const key in stores) {
      stores[key].tx = this;
    }

    setTimeout(() => {
      if (this.error && this.onerror) {
        this.onerror();
      } else if (!this.error && this.oncomplete) {
        this.oncomplete();
      }
    }, 0);
  }
  objectStore(name) {
    return this.stores[name];
  }
}

class MockIDBDatabase {
  constructor() {
    this.objectStoreNames = {
      contains: () => false
    };
    this.stores = {
      trials: new MockIDBObjectStore(),
      ambient: new MockIDBObjectStore(),
      meta: new MockIDBObjectStore()
    };
  }
  createObjectStore(name) {
    return this.stores[name] ??= new MockIDBObjectStore();
  }
  transaction() {
    return new MockIDBTransaction(this.stores);
  }
}

globalThis.indexedDB = {
  open: () => {
    const req = {};
    setTimeout(() => {
      const db = new MockIDBDatabase();
      if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
      if (req.onsuccess) {
        req.result = db;
        req.onsuccess();
      }
    }, 0);
    return req;
  }
};

const { saveTrial, getAllTrials, exportJSON, importJSON } = await import('./db.js');

test('test saveTrial success', async () => {
  await saveTrial({ note: 'C' });
  const trials = await getAllTrials();
  assert.strictEqual(trials.length, 1);
  assert.strictEqual(trials[0].note, 'C');
  assert.ok(trials[0].timestamp);
});

test('test saveTrial error', async () => {
  await assert.rejects(
    () => saveTrial({ triggerError: true }),
    { message: 'Mocked transaction error' }
  );
});

test('exportJSON/importJSON round-trips trials and ambient with original timestamps', async () => {
  const before = await exportJSON();
  assert.ok(Array.isArray(before.trials));
  assert.ok(Array.isArray(before.ambient));

  const backup = {
    trials: [{ note: 'G', timestamp: '2020-01-01T00:00:00.000Z' }],
    ambient: [{ sound_source: 'fridge', timestamp: '2020-01-01T00:00:00.000Z' }],
  };
  const result = await importJSON(backup);
  assert.strictEqual(result.trials, 1);
  assert.strictEqual(result.ambient, 1);

  const after = await getAllTrials();
  const imported = after.find(t => t.note === 'G');
  assert.ok(imported, 'imported trial should be present');
  // Timestamp must be preserved exactly, not overwritten with import time
  // (unlike saveTrial, which always stamps "now").
  assert.strictEqual(imported.timestamp, '2020-01-01T00:00:00.000Z');
});

test('version 2 backup preserves session, block, epoch and metadata snapshots', async () => {
 const backup={trials:[{id:'v2-test',schema_version:2,target_pitch:'C',timestamp:'2026-01-01T00:00:00Z'}],sessions:[{id:'session-1',training_epoch:'epoch-1'}],blocks:[{id:'block-1',explicit_response_set:['C','G'],trials:[{target_pitch:'C'}]}],epochs:[{id:'epoch-1'}],meta:[{key:'curriculumEpoch',value:'epoch-1'}]};
 await importJSON(backup);await importJSON(backup);const exported=await exportJSON();
 assert.equal(exported.trials.filter(t=>t.id==='v2-test').length,1);
 for(const key of ['sessions','blocks','epochs','meta'])assert.deepEqual(exported[key],backup[key]);
});
