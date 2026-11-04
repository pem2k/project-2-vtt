import { createClient } from '@supabase/supabase-js';

// Single browser Supabase client. It persists the auth session in localStorage
// by default, which is what keeps the user logged in across page refreshes.
const url =
  import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.MODE === 'test' ? 'http://localhost:54321' : undefined);
const anonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (import.meta.env.MODE === 'test' ? 'dummy-anon-key' : undefined);

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.example to .env.local and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(url, anonKey);
