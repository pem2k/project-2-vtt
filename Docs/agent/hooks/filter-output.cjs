// postToolUse hook: condense long shell output (npm installs, builds, test runs)
// to errors/warnings/summary lines plus head and tail. The full log is saved to disk.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SHELL_TOOLS = new Set(['bash', 'Bash', 'powershell', 'PowerShell']);
const MIN_CHARS = 4000;
const HEAD_LINES = 15;
const TAIL_LINES = 15;
const MAX_IMPORTANT_LINES = 60;
const MAX_LINE_CHARS = 300;
const OPT_OUT = /\bHOOK_NOFILTER=1\b/;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const IMPORTANT =
  /error|warn|fail|fatal|panic|exception|denied|not found|cannot|unable|vulnerabilit|deprecated|✗|✖|✘|×|✓|✔|passed|skipped|# (tests|pass|fail)|test files|tests? +\d|built in|exit code|ERR!|^\s*at\s/i;

function parseArgs(raw) {
  if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLog(text) {
  const dir = process.env.HOOK_LOG_DIR || path.join(os.tmpdir(), 'copilot-hook-logs');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}.log`);
  fs.writeFileSync(file, text);
  return file;
}

function clip(line) {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)} …` : line;
}

function condense(original) {
  const lines = original.replace(ANSI, '').split('\n').map(clip);
  const headEnd = Math.min(HEAD_LINES, lines.length);
  const tailStart = Math.max(headEnd, lines.length - TAIL_LINES);
  const middle = lines.slice(headEnd, tailStart);

  const important = [];
  let lastKept = null;
  for (const line of middle) {
    if (!IMPORTANT.test(line) || line === lastKept) continue;
    important.push(line);
    lastKept = line;
  }
  const kept = important.slice(0, MAX_IMPORTANT_LINES);
  const droppedImportant = important.length - kept.length;

  const logFile = saveLog(original);
  return [
    `[filter-output hook] Full output (${lines.length.toLocaleString('en-US')} lines) saved to: ${logFile}`,
    'Use grep or view with a line range on that file if you need more detail.',
    '',
    '--- head ---',
    ...lines.slice(0, headEnd),
    '',
    `--- errors / warnings / summary (${kept.length} of ${middle.length} middle lines) ---`,
    ...kept,
    ...(droppedImportant > 0 ? [`… ${droppedImportant} more matching lines in the full log`] : []),
    '',
    '--- tail ---',
    ...lines.slice(tailStart),
  ].join('\n');
}

function filter(input) {
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return {};
  }
  if (!event || typeof event !== 'object') return {};
  const toolName = event.toolName ?? event.tool_name;
  if (!SHELL_TOOLS.has(toolName)) return {};

  const args = parseArgs(event.toolArgs ?? event.tool_input);
  if (typeof args.command === 'string' && OPT_OUT.test(args.command)) return {};

  const result = event.toolResult ?? event.tool_result;
  const text = result?.textResultForLlm ?? result?.text_result_for_llm;
  if (typeof text !== 'string' || text.length < MIN_CHARS) return {};

  return { modifiedResult: { resultType: 'success', textResultForLlm: condense(text) } };
}

try {
  process.stdout.write(JSON.stringify(filter(fs.readFileSync(0, 'utf8'))));
} catch {
  process.stdout.write('{}');
}
