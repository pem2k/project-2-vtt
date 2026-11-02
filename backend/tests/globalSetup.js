import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Populate SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY from the running local
// stack (`supabase status -o env`) unless already provided via the environment.
// Keeps tests from hard-coding keys that can differ between machines/CLI versions.
export default function setup() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return;

  const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  let out;
  try {
    out = execSync('supabase status -o env', { cwd: backendDir, encoding: 'utf8' });
  } catch {
    throw new Error(
      'Could not read local Supabase status. Start the stack first: `npm run db:start` (needs Docker running).',
    );
  }

  for (const line of out.split('\n')) {
    const match = line.match(/^(\w+)="?(.*?)"?$/);
    if (!match) continue;
    const [, key, value] = match;
    if (key === 'API_URL') process.env.SUPABASE_URL = value;
    if (key === 'ANON_KEY') process.env.SUPABASE_ANON_KEY = value;
    if (key === 'SERVICE_ROLE_KEY') process.env.SUPABASE_SERVICE_ROLE_KEY = value;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Local Supabase is not running. Start it with `npm run db:start`.');
  }
}
