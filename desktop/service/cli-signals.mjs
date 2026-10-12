import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Status comes from the CLIs' own signals. Claude Code hooks and Codex notify
// append one JSON line per state change to <stateDir>/hooks/<sessionId>.jsonl.
// Hooks are added for the launched chat only (`claude --settings <file>`); the
// user's own settings files are never written.

const writer = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hook-writer.mjs');
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export const hookFile = (stateDir, sessionId) => path.join(stateDir, 'hooks', `${sessionId}.jsonl`);

// A command that appends {state, event, ts}. POSIX shells use printf (no
// interpreter start per tool call); Windows uses the bundled Node.
export function hookCommand(file, state, event, { platform = process.platform, node = process.execPath } = {}) {
  if (platform === 'win32') return `"${node}" "${writer}" "${file}" ${state} ${event}`;
  return `printf '{"state":"${state}","event":"${event}","ts":%s}\\n' "$(date +%s)" >> ${shellQuote(file)}`;
}

export function claudeHookSettings(file, options) {
  const run = (state, event) => ({ type: 'command', command: hookCommand(file, state, event, options), timeout: 10 });
  const group = (state, event, matcher) => [{ ...(matcher ? { matcher } : {}), hooks: [run(state, event)] }];
  return {
    hooks: {
      SessionStart: group('ready', 'SessionStart'),
      UserPromptSubmit: group('working', 'UserPromptSubmit'),
      // PermissionRequest fires the moment a prompt opens; the permission_prompt
      // notification only after several idle seconds. Both mean "needs you".
      PermissionRequest: group('waiting', 'PermissionRequest'),
      Notification: group('waiting', 'Notification', 'permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input'),
      PostToolUse: group('working', 'PostToolUse'),
      PostToolUseFailure: group('working', 'PostToolUseFailure'),
      Stop: group('done', 'Stop'),
      StopFailure: group('error', 'StopFailure'),
    },
  };
}

export async function writeClaudeHooks(stateDir, sessionId, options) {
  const file = hookFile(stateDir, sessionId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, ''); // One launch, one fresh signal file.
  const settings = path.join(path.dirname(file), `${sessionId}.settings.json`);
  await writeFile(settings, JSON.stringify(claudeHookSettings(file, options), null, 2));
  return { file, settings };
}

// Codex: `notify` reports finished turns (with the turn ID, so it dedupes with
// the transcript). The TUI's OSC 9 notifications report approvals and questions.
// A notify program the user already configured is left in place.
export function userCodexNotify(env = process.env) {
  try { return /^\s*notify\s*=/m.test(readFileSync(path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml'), 'utf8')); } catch { return false; }
}

export async function prepareCodexSignals(stateDir, sessionId, { node = process.execPath, env } = {}) {
  const file = hookFile(stateDir, sessionId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, '');
  const args = ['-c', 'tui.notifications=["approval-requested","plan-mode-prompt","async-question"]', '-c', 'tui.notification_method="osc9"', '-c', 'tui.notification_condition="always"'];
  if (!userCodexNotify(env)) args.push('-c', `notify=[${[node, writer, file, 'done', 'notify'].map(item => JSON.stringify(item)).join(',')}]`);
  return { file, args };
}

const hookKinds = {
  ready: () => ({ kind: 'turn-ready' }),
  working: () => ({ kind: 'turn-started' }),
  waiting: record => ({ kind: 'attention', text: record.event === 'PermissionRequest' || record.type === 'permission_prompt' ? 'The agent is asking for permission.' : 'The agent needs your input.' }),
  done: (record, index) => ({ kind: 'turn-completed', id: record.id || `hook-${record.ts || 0}-${index}`, text: 'The agent finished its turn. Review the result.', ...(record.preview ? { preview: String(record.preview).slice(-350) } : {}) }),
  error: () => ({ kind: 'attention', text: 'The agent reported an error.' }),
};

// One hook line to an activity event. Unknown or malformed lines are ignored.
export function hookEvent(line, index = 0) {
  let record;
  try { record = typeof line === 'string' ? JSON.parse(line) : line; } catch { return null; }
  const make = record && hookKinds[record.state];
  return make ? { ...make(record, index), source: 'hook' } : null;
}

// Prompts the hooks cannot report: the folder trust dialog runs before any
// hook is allowed, and Claude on Strix has no hooks at all. Only the bottom of
// the live screen is checked.
const trustPrompt = /Do you trust the files in this folder|Is this a project you created or one you trust|trust this folder\?/i;
const permissionPrompt = {
  claude: /Do you want to (proceed|make this edit|create|overwrite|allow|run|fetch)\b/i,
  strix: /Do you want to (proceed|make this edit|create|overwrite|allow|run|fetch)\b/i,
  codex: /Would you like to (run the following command|make the following edits|allow|grant)|Allow command\?/i,
};

export function promptOnScreen(agent, lines) {
  const text = (Array.isArray(lines) ? lines : String(lines || '').split('\n')).slice(-16).join('\n');
  if ((agent === 'claude' || agent === 'strix') && trustPrompt.test(text)) return { kind: 'trust', text: 'The agent is waiting for you to trust this folder.' };
  if (permissionPrompt[agent]?.test(text)) return { kind: 'permission', text: 'The agent is asking for permission.' };
  return null;
}

// Keys that answer a prompt: Enter, Escape alone, a numbered choice, y/n/a.
export const answersPrompt = data => data === '\r' || data === '\x1b' || /^[1-9ynaYNA]$/.test(data);

// Codex OSC 9 desktop notifications. OSC 9;4 (progress) is not a notification.
export function oscNotifications(carry, data) {
  const text = carry + data, found = [];
  const pattern = /\x1b\]9;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
  let match, end = 0;
  while ((match = pattern.exec(text))) { end = pattern.lastIndex; if (!/^\d+;/.test(match[1])) found.push(match[1]); }
  const rest = text.slice(end), open = rest.lastIndexOf('\x1b]');
  return { found, carry: open >= 0 && rest.length - open < 2048 ? rest.slice(open) : '' };
}
