const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'filter-output.cjs');
const LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'filter-output-test-'));

function runFilter(payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const result = spawnSync(process.execPath, [SCRIPT], {
    input,
    encoding: 'utf8',
    env: { ...process.env, HOOK_LOG_DIR: LOG_DIR },
  });
  assert.equal(result.status, 0, `hook exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout || '{}');
}

const bashResult = (text, command = 'npm install') => ({
  sessionId: 's',
  timestamp: 0,
  cwd: '/repo',
  toolName: 'bash',
  toolArgs: { command },
  toolResult: { resultType: 'success', textResultForLlm: text },
});

function noisyNpmLog() {
  const lines = ['> frontend@0.0.0 build', '> vite build', ''];
  for (let i = 0; i < 2000; i += 1) lines.push(`\u001b[2mtransforming module ${i} of 2000 ...\u001b[22m`);
  lines.splice(900, 0, 'npm WARN deprecated inflight@1.0.6: leaks memory');
  lines.splice(1200, 0, 'src/App.jsx:3:7: ERROR: Expected ";" but found "x"');
  lines.push('found 0 vulnerabilities', '✓ built in 289ms', '<shellId: 7 completed with exit code 1>');
  return lines.join('\n');
}

test('leaves short output untouched', () => {
  assert.deepEqual(runFilter(bashResult('found 0 vulnerabilities\n<shellId: 1 completed with exit code 0>')), {});
});

test('condenses long output while keeping errors, warnings and summary', () => {
  const original = noisyNpmLog();
  const out = runFilter(bashResult(original));
  const text = out.modifiedResult.textResultForLlm;

  assert.equal(out.modifiedResult.resultType, 'success');
  assert.ok(text.length < original.length / 5, `expected big reduction, got ${text.length}/${original.length}`);
  assert.match(text, /ERROR: Expected ";"/);
  assert.match(text, /npm WARN deprecated/);
  assert.match(text, /found 0 vulnerabilities/);
  assert.match(text, /✓ built in 289ms/);
  assert.match(text, /> vite build/, 'keeps the head');
  assert.match(text, /<shellId: 7 completed with exit code 1>/, 'keeps the tail');
  assert.doesNotMatch(text, /\u001b\[/, 'strips ANSI escapes');
});

test('saves the full log and tells the agent where it is', () => {
  const original = noisyNpmLog();
  const text = runFilter(bashResult(original)).modifiedResult.textResultForLlm;
  const match = text.match(/Full output \([\d,]+ lines\) saved to: (\S+)/);

  assert.ok(match, 'mentions the saved log path');
  assert.ok(match[1].startsWith(LOG_DIR), 'log written to HOOK_LOG_DIR');
  assert.equal(fs.readFileSync(match[1], 'utf8'), original);
});

test('skips filtering when the command opts out with HOOK_NOFILTER=1', () => {
  assert.deepEqual(runFilter(bashResult(noisyNpmLog(), 'HOOK_NOFILTER=1 npm run build')), {});
});

test('accepts the VS Code compatible snake_case payload', () => {
  const out = runFilter({
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'npm ci' },
    tool_result: { result_type: 'success', text_result_for_llm: noisyNpmLog() },
  });
  assert.match(out.modifiedResult.textResultForLlm, /ERROR: Expected ";"/);
});

test('fails open with no change on malformed input', () => {
  assert.deepEqual(runFilter('not json'), {});
  assert.deepEqual(runFilter({ toolName: 'bash', toolArgs: {} }), {});
});
