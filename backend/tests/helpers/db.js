import { createClient } from '@supabase/supabase-js';

// One anon-key client per signed-in user — RLS is exercised exactly as the
// browser would hit it. globalSetup.js fills these env vars from `supabase status`.
const URL = () => process.env.SUPABASE_URL;
const ANON = () => process.env.SUPABASE_ANON_KEY;

const CLIENT_OPTS = { auth: { persistSession: false, autoRefreshToken: false } };

export const USERS = {
  dm: 'dm@test.dev',
  player1: 'player1@test.dev',
  player2: 'player2@test.dev',
};

export const TEST_ROOM = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  code: 'TESTRM',
  password: 'roompass',
};

/** A fresh anonymous (not-signed-in) client. */
export function anonClient() {
  return createClient(URL(), ANON(), CLIENT_OPTS);
}

/** Sign in a seeded test user and return their authed client. */
export async function signIn(email, password = 'password123') {
  const client = createClient(URL(), ANON(), CLIENT_OPTS);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}
