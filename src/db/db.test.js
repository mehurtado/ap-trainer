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
    return this.stores[name];
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

const { saveTrial, getAllTrials } = await import('./db.js');

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
