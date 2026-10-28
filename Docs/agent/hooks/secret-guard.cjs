// preToolUse hook: deny tool calls that would read, write, or expose secrets.
// Reads a Copilot hook event on stdin, writes a decision JSON object on stdout.
const fs = require('node:fs');

const PATH_KEYS = ['path', 'paths', 'file_path', 'filePath', 'files', 'file', 'uri', 'cwd', 'directory', 'glob'];
const GLOB_TOOLS = new Set(['glob', 'Glob']);
const SHELL_TOOLS = new Set(['bash', 'Bash', 'powershell', 'PowerShell']);

const END = String.raw`(?=$|[\s'"\x60;|&)<>,\]])`;
const START = String.raw`(?:^|[\s/'"\x60=:(<>|;&,\[])`;

const ENV_FILE = new RegExp(`${START}\\.env([\\w.*-]*)${END}`, 'g');
const ENV_TEMPLATE_SUFFIX = /^\.(example|sample|template)$/;

const SECRET_PATH_RULES = [
  { label: 'SSH private key', re: /id_(rsa|dsa|ecdsa|ed25519)(?![\w.])/ },
  { label: 'key/certificate file', re: new RegExp(`\\.(pem|key|p12|pfx|jks|keystore)${END}`) },
  {
    label: 'credentials/secrets file',
    re: new RegExp(`(/(credentials|secrets?)(\\.\\w+)?|${START}(credentials|secrets?)\\.\\w+)${END}`),
  },
  { label: 'service account key', re: /service-account[\w-]*\.json/ },
  { label: 'auth config file', re: /\.(npmrc|netrc|pgpass|git-credentials)(?![\w-])/ },
  { label: 'cloud credentials dir', re: /\.(aws|supabase)\// },
  { label: 'Supabase CLI temp dir', re: /supabase\/\.temp/ },
];

const SHELL_RULES = [
  { label: 'environment dump', re: /(^|[;&|(]\s*)(printenv\b|env\s*($|[|;&>)]))/ },
  {
    label: 'secret environment variable',
    re: /\$\{?[A-Z0-9_]*(SECRET|PASSWORD|PASSWD|TOKEN|SERVICE_ROLE|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*\}?/,
  },
];

function parseArgs(raw) {
  if (typeof raw !== 'string') return raw && typeof raw === 'object' ? raw : {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function collectTargets(toolName, args) {
  const keys = GLOB_TOOLS.has(toolName) ? [...PATH_KEYS, 'pattern'] : PATH_KEYS;
  const targets = keys.flatMap((key) => [args[key]].flat()).filter((v) => typeof v === 'string');
  const command = typeof args.command === 'string' ? args.command : null;
  return { targets: command ? [...targets, command] : targets, command };
}

function findEnvFile(text) {
  for (const match of text.matchAll(ENV_FILE)) {
    if (!ENV_TEMPLATE_SUFFIX.test(match[1])) return `.env${match[1]}`;
  }
  return null;
}

function findViolation(toolName, args) {
  const { targets, command } = collectTargets(toolName, args);
  for (const text of targets) {
    const envFile = findEnvFile(text);
    if (envFile) return `env file (${envFile})`;
    const rule = SECRET_PATH_RULES.find(({ re }) => re.test(text));
    if (rule) return rule.label;
  }
  if (command && SHELL_TOOLS.has(toolName)) {
    const rule = SHELL_RULES.find(({ re }) => re.test(command));
    if (rule) return rule.label;
  }
  return null;
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
  const args = parseArgs(event.toolArgs ?? event.tool_input);
  const violation = findViolation(toolName, args);
  if (!violation) return {};
  return {
    permissionDecision: 'deny',
    permissionDecisionReason:
      `Blocked by secret-guard hook: this ${toolName} call references a ${violation}. ` +
      'Agents must not read, write, or print secrets. Use a template like .env.example, ' +
      'or ask the user to handle the secret themselves.',
  };
}

try {
  process.stdout.write(JSON.stringify(decide(fs.readFileSync(0, 'utf8'))));
} catch {
  process.stdout.write('{}');
}
