const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'secret-guard.cjs');

function runGuard(payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const result = spawnSync(process.execPath, [SCRIPT], { input, encoding: 'utf8' });
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout || '{}');
}

const call = (toolName, toolArgs) => ({ sessionId: 's', timestamp: 0, cwd: '/repo', toolName, toolArgs });

function assertDenied(payload) {
  const out = runGuard(payload);
  assert.equal(out.permissionDecision, 'deny', `expected deny for ${JSON.stringify(payload)}`);
  assert.ok(out.permissionDecisionReason, 'deny must include a reason');
}

function assertNoDecision(payload) {
  assert.deepEqual(runGuard(payload), {}, `expected no decision for ${JSON.stringify(payload)}`);
}

test('denies reading .env files with view', () => {
  assertDenied(call('view', { path: '/repo/frontend/.env' }));
  assertDenied(call('view', { path: '/repo/.env.local' }));
  assertDenied(call('view', { path: '/repo/backend/.env.production' }));
});

test('denies bash commands that touch .env files', () => {
  assertDenied(call('bash', { command: 'cat frontend/.env' }));
  assertDenied(call('bash', { command: 'source .env && npm start' }));
  assertDenied(call('bash', { command: "grep KEY '.env.local'" }));
  assertDenied(call('bash', { command: 'cp .env.example .env' }));
});

test('denies glob/grep that target env files', () => {
  assertDenied(call('glob', { pattern: '**/.env*' }));
  assertDenied(call('grep', { pattern: 'SUPABASE', paths: ['/repo/.env'] }));
  assertDenied(call('grep', { pattern: 'x', glob: '.env.*' }));
});

test('denies writing or editing env files', () => {
  assertDenied(call('create', { path: '/repo/frontend/.env.local', file_text: 'X=1' }));
  assertDenied(call('edit', { path: '/repo/.env', old_str: 'a', new_str: 'b' }));
});

test('denies keys, certs and credential stores', () => {
  assertDenied(call('view', { path: '/Users/me/.ssh/id_ed25519' }));
  assertDenied(call('bash', { command: 'cat ~/.ssh/id_rsa' }));
  assertDenied(call('view', { path: '/repo/certs/server.pem' }));
  assertDenied(call('view', { path: '/repo/tls/private.key' }));
  assertDenied(call('bash', { command: 'cat ~/.aws/credentials' }));
  assertDenied(call('view', { path: '/repo/gcp/service-account-prod.json' }));
  assertDenied(call('view', { path: '/repo/config/credentials.json' }));
  assertDenied(call('view', { path: '/repo/config/secrets.yaml' }));
  assertDenied(call('bash', { command: 'cat ~/.npmrc' }));
  assertDenied(call('bash', { command: 'cat ~/.netrc' }));
  assertDenied(call('bash', { command: 'cat ~/.git-credentials' }));
  assertDenied(call('bash', { command: 'ls supabase/.temp' }));
  assertDenied(call('bash', { command: 'cat ~/.supabase/access-token' }));
});

test('denies dumping the environment or secret variables', () => {
  assertDenied(call('bash', { command: 'env' }));
  assertDenied(call('bash', { command: 'printenv' }));
  assertDenied(call('bash', { command: 'env | grep SUPA' }));
  assertDenied(call('bash', { command: 'echo $SUPABASE_SERVICE_ROLE_KEY' }));
  assertDenied(call('bash', { command: 'echo "${DB_PASSWORD}"' }));
});

test('supports the VS Code compatible snake_case payload', () => {
  assertDenied({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { path: '/repo/.env' } });
  assertDenied({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'cat .env' } });
});

test('parses toolArgs passed as a JSON string', () => {
  assertDenied(call('view', JSON.stringify({ path: '/repo/.env' })));
});

test('allows env template files', () => {
  assertNoDecision(call('view', { path: '/repo/frontend/.env.example' }));
  assertNoDecision(call('view', { path: '/repo/.env.sample' }));
  assertNoDecision(call('bash', { command: 'cat .env.template' }));
});

test('allows ordinary project work', () => {
  assertNoDecision(call('view', { path: '/repo/frontend/src/App.jsx' }));
  assertNoDecision(call('view', { path: '/Users/me/.ssh/id_ed25519.pub' }));
  assertNoDecision(call('bash', { command: 'npm run build' }));
  assertNoDecision(call('bash', { command: 'git commit -m "fix credentials check in room join"' }));
  assertNoDecision(call('bash', { command: 'gh secret list' }));
  assertNoDecision(call('bash', { command: 'npm run lint && npx vitest run --environment jsdom' }));
  assertNoDecision(call('grep', { pattern: 'import.meta.env', paths: ['/repo/frontend/src'] }));
  assertNoDecision(call('glob', { pattern: 'src/**/*.jsx' }));
});

test('does not scan file contents being written', () => {
  assertNoDecision(
    call('edit', {
      path: '/repo/frontend/README.md',
      old_str: 'x',
      new_str: 'Copy .env.example to .env.local and set VITE_SUPABASE_URL.',
    }),
  );
  assertNoDecision(call('create', { path: '/repo/src/lib/supabase.js', file_text: 'import.meta.env.VITE_X' }));
});

test('fails open with no decision on malformed input', () => {
  assert.deepEqual(runGuard('not json'), {});
  assert.deepEqual(runGuard(''), {});
});
