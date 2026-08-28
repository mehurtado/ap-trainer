import { performance } from 'node:perf_hooks';

function sanitizeForCSV_old(value) {
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) {
    return "'" + value;
  }
  return value;
}

const CSV_INJECTION_REGEX = /^[=+\-@\t\r]/;
function sanitizeForCSV_new(value) {
  if (typeof value === 'string' && CSV_INJECTION_REGEX.test(value)) {
    return "'" + value;
  }
  return value;
}

const ITERATIONS = 10000000;

function benchOld() {
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    sanitizeForCSV_old("normal string");
    sanitizeForCSV_old("=formula");
    sanitizeForCSV_old(123);
  }
  const end = performance.now();
  console.log(`old: ${(end - start).toFixed(2)} ms`);
}

function benchNew() {
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    sanitizeForCSV_new("normal string");
    sanitizeForCSV_new("=formula");
    sanitizeForCSV_new(123);
  }
  const end = performance.now();
  console.log(`new: ${(end - start).toFixed(2)} ms`);
}

benchOld();
benchNew();
benchOld();
benchNew();
