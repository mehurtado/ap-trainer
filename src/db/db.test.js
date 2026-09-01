import { test } from 'node:test';
import assert from 'node:assert';
import { sanitizeForCSV, exportCSV } from './db.js';

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

test('exportCSV correctly generates CSV format from IndexedDB data', async () => {
  // Store original indexedDB if it exists
  const originalIndexedDB = global.indexedDB;

  try {
    // Mock global indexedDB
    global.indexedDB = {
      open: () => {
        const req = {};
        setTimeout(() => {
          req.result = {
            transaction: () => ({
              objectStore: (storeName) => ({
                getAll: () => {
                  const getReq = {};
                  setTimeout(() => {
                    if (storeName === 'trials') {
                      getReq.result = [
                        { timestamp: '2023-01-01T12:00:00Z', target_chroma: 'C', user_guess: '=danger', undefined_col: undefined },
                        { timestamp: '2023-01-02T12:00:00Z', target_chroma: 'D', user_guess: 'safe' }
                      ];
                    } else if (storeName === 'ambient') {
                      getReq.result = [
                        { timestamp: '2023-01-01T12:00:00Z', sound_source: 'bird', notes: '+badformula' }
                      ];
                    } else {
                      getReq.result = [];
                    }
                    if (getReq.onsuccess) getReq.onsuccess();
                  }, 0);
                  return getReq;
                }
              })
            })
          };
          if (req.onsuccess) req.onsuccess();
        }, 0);
        return req;
      }
    };

    const result = await exportCSV();

    // Verify output structure
    assert.ok(result.trials, 'exportCSV should return a trials property');
    assert.ok(result.ambient, 'exportCSV should return an ambient property');

    const trialsLines = result.trials.split('\n');
    const ambientLines = result.ambient.split('\n');

    // Verify Headers
    const expectedTrialHeaders = [
      'timestamp','is_cold_start','target_chroma','target_octave',
      'cents_offset','cents_direction','instrument_id','sine_wave_flag',
      'noise_masked_flag','noise_type','dropout_type','tonal_context_flag',
      'attention_cue','user_guess','user_guess_direction','confidence',
      'latency_ms','result_bool','timeout_flag',
      'second_instinct_flag','second_instinct_note',
      'level','session_fatigue_flag','session_type',
      'drill_mode_flag','drill_notes',
      'notes'
    ].join(',');

    const expectedAmbientHeaders = [
      'timestamp','sound_source','user_guess','confidence','verified',
      'verified_pitch','identification_mode','notes'
    ].join(',');

    assert.strictEqual(trialsLines[0], expectedTrialHeaders);
    assert.strictEqual(ambientLines[0], expectedAmbientHeaders);

    // Verify row counts (1 header + 2 trial rows = 3 lines)
    assert.strictEqual(trialsLines.length, 3);
    // (1 header + 1 ambient row = 2 lines)
    assert.strictEqual(ambientLines.length, 2);

    // Parse the first data row for trials to verify CSV structure
    const trialRow1 = trialsLines[1].split(',');

    // timestamp is correctly stringified
    assert.strictEqual(trialRow1[0], '"2023-01-01T12:00:00Z"');

    // Missing value (is_cold_start) maps to ""
    assert.strictEqual(trialRow1[1], '""');

    // target_chroma is correctly stringified
    assert.strictEqual(trialRow1[2], '"C"');

    // user_guess column (index 13) handles CSV injection sanitization
    assert.strictEqual(trialRow1[13], '"\'=danger"');

    // Parse the first data row for ambient to verify CSV structure
    const ambientRow1 = ambientLines[1].split(',');

    // notes column (index 7) handles CSV injection sanitization
    assert.strictEqual(ambientRow1[7], '"\'+badformula"');

  } finally {
    // Clean up mock
    global.indexedDB = originalIndexedDB;
    // We also need to clear the module-level `_db` variable in db.js if we can,
    // or just rely on the fact that node:test runs in a separate process/context per file.
    // However since getDB caches `_db`, we might need to reset it.
    // For now, this test is the only one opening DB, but it's good practice.
  }
});
