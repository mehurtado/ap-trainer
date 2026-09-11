import { test } from 'node:test';
import assert from 'node:assert';
import { isSupabaseConfigured, getSupabaseClient } from './supabaseClient.js';

test('isSupabaseConfigured is false when env vars are absent', () => {
  assert.strictEqual(isSupabaseConfigured({}), false);
  assert.strictEqual(isSupabaseConfigured({ VITE_SUPABASE_URL: '' }), false);
  assert.strictEqual(isSupabaseConfigured({ VITE_SUPABASE_ANON_KEY: '' }), false);
});

test('isSupabaseConfigured is false when only one env var is present', () => {
  assert.strictEqual(isSupabaseConfigured({ VITE_SUPABASE_URL: 'https://x.supabase.co' }), false);
  assert.strictEqual(isSupabaseConfigured({ VITE_SUPABASE_ANON_KEY: 'anon-key' }), false);
});

test('isSupabaseConfigured is true when both env vars are present and non-empty', () => {
  assert.strictEqual(
    isSupabaseConfigured({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon-key' }),
    true
  );
});

test('isSupabaseConfigured defaults to reading import.meta.env, which is unset under plain Node', () => {
  assert.strictEqual(isSupabaseConfigured(), false);
});

test('getSupabaseClient returns null when unconfigured, without throwing', () => {
  assert.strictEqual(getSupabaseClient(), null);
});
