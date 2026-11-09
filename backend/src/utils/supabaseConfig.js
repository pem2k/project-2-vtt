import { URL } from 'node:url';

export function loadBackendEnv() {
  if (!process.env.SUPABASE_URL && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(new URL('../../.env', import.meta.url));
    } catch {
      // Ignore if missing
    }
  }
}

export function getSupabaseConfig() {
  loadBackendEnv();

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY.');
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}
