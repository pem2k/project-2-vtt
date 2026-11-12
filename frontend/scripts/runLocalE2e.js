import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read only the local stack's public connection settings; never print keys.
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const frontend = fileURLToPath(new URL('../', import.meta.url));
const status = JSON.parse(
  execFileSync('supabase', ['status', '--output', 'json'], {
    cwd: backend,
    encoding: 'utf8',
  }),
);
if (!status.API_URL || !status.ANON_KEY) {
  throw new Error('Start local Supabase from backend/ before running E2E tests.');
}
const result = spawnSync('npm', ['run', 'test:e2e', '--', ...process.argv.slice(2)], {
  cwd: frontend,
  stdio: 'inherit',
  env: { ...process.env, SUPABASE_URL: status.API_URL, SUPABASE_ANON_KEY: status.ANON_KEY },
});
process.exit(result.status ?? 1);
