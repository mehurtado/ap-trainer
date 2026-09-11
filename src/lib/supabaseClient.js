import { createClient } from '@supabase/supabase-js';

// import.meta.env is only populated by Vite's transform; under plain Node
// (e.g. this file's own test) it's undefined, so fall back to {} rather
// than throwing on property access.
function readEnv() {
  return import.meta.env || {};
}

export function isSupabaseConfigured(env = readEnv()) {
  return Boolean(env.VITE_SUPABASE_URL) && Boolean(env.VITE_SUPABASE_ANON_KEY);
}

let cachedClient = null;

export function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  const env = readEnv();
  if (!isSupabaseConfigured(env)) return null;
  cachedClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  return cachedClient;
}
