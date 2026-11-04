// preToolUse hook: prompt user verification before executing any git write commands.
// Reads a hook event on stdin, writes a decision JSON object on stdout.
const fs = require('node:fs');

const SHELL_TOOLS = new Set(['bash', 'Bash', 'powershell', 'PowerShell', 'run_command']);

// Git subcommands that mutate git state (writes)
const GIT_WRITE_COMMANDS = [
  'commit',
  'push',
  'merge',
  'rebase',
  'cherry-pick',
  'reset',
  'revert',
  'tag',
  'branch',
  'clean',
  'apply',
  'stash',
  'rm',
  'mv',
  'checkout',
  'switch',
  'restore',
  'pull',
];

const GIT_WRITE_PATTERN = new RegExp(
  `(^|[;&|\\s])git\\s+(${GIT_WRITE_COMMANDS.join('|')})(\\s|$|[;&|])`,
  'i'
);

function parseArgs(raw) {
  if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function findGitWrite(command) {
  if (typeof command !== 'string') return null;
  const match = command.match(GIT_WRITE_PATTERN);
  return match ? match[2] : null;
}

function decide(input) {
  let event;
  try {
    event = JSON.parse(input);
  } catch {
    return {};
  }
  if (!event || typeof event !== 'object') return {};

  const toolName = event.toolName ?? event.tool_name;
  if (!SHELL_TOOLS.has(toolName)) return {};

  const args = parseArgs(event.toolArgs ?? event.tool_input ?? event);
  const command = args.command ?? args.CommandLine;

  const gitWriteSubcommand = findGitWrite(command);
  if (!gitWriteSubcommand) return {};

  return {
    permissionDecision: 'ask',
    permissionDecisionReason:
      `User verification required: executing 'git ${gitWriteSubcommand}' mutates git state. ` +
      'Please verify and confirm before any git write operation.',
  };
}

try {
  process.stdout.write(JSON.stringify(decide(fs.readFileSync(0, 'utf8'))));
} catch {
  process.stdout.write('{}');
}

