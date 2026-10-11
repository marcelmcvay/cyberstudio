import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse as parseEnv } from 'dotenv';
import { isWindows, resolveCommand, shellCommand, shellLabel } from './platform.mjs';

export { shellCommand };

export function wrapCommand(file, args = []) {
  if (!isWindows) return { file, args };
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  const script = `[Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); & ${[file, ...args].map(quote).join(' ')}; exit $LASTEXITCODE`;
  return { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] };
}

export const AGENTS = [
  { id: 'codex', label: 'Codex', color: '#88d8bf', command: 'codex', subscription: true },
  { id: 'claude', label: 'Claude Code', color: '#dba68c', command: 'claude', subscription: true },
  { id: 'opencode', label: 'OpenCode', color: '#c8d2dc', command: 'opencode', subscription: false },
  // Claude Code on the ROG Strix over Tailscale + SSH (`Host strix` in ~/.ssh/config).
  { id: 'strix', label: 'Claude on Strix', color: '#dcb35c', command: 'ssh', subscription: true },
  { id: 'kimi', label: 'Kimi', color: '#b3a3f7', command: 'kimi', subscription: true },
  { id: 'shell', label: shellLabel(), color: '#89b7ed', command: 'shell', subscription: false },
];

export function commandPath(name, env = process.env, home) {
  return resolveCommand(name, env, home);
}

export function inventory(env = process.env) {
  const shell = shellCommand(env);
  const shellAvailable = path.isAbsolute(shell.file) ? existsSync(shell.file) : !!commandPath(shell.file, env);
  return AGENTS.map(agent => ({ ...agent, available: agent.id === 'shell' ? shellAvailable : agent.id === 'strix' ? strixConfigured(env) : !!commandPath(agent.command, env) }));
}

export const STRIX_HOST = process.env.CYBERSTUDIO_STRIX_HOST || 'strix';

function strixConfigured(env = process.env) {
  if (isWindows || !commandPath('ssh', env)) return false;
  try { return new RegExp(`^\\s*Host\\s+(.*\\s)?${STRIX_HOST}(\\s|$)`, 'm').test(readFileSync(path.join(os.homedir(), '.ssh', 'config'), 'utf8')); } catch { return false; }
}

// The Strix's SSH shell is Windows PowerShell 5.1. Map the local working folder
// to the same path under the remote home (the kit and projects are cloned there
// with the same layout) and fall back to the remote home.
export function strixScript(cwd, claudeArgs, resumeId, nativeId) {
  const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
  const rel = cwd && path.relative(os.homedir(), cwd);
  const target = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? `Join-Path $HOME ${quote(rel.split(path.sep).join('\\'))}` : '$HOME';
  const args = claudeArgs.map(quote).join(' ');
  // A session closed before its first prompt has nothing to resume: start it fresh under the same ID.
  const run = resumeId
    ? `claude --resume ${quote(resumeId)} ${args}; if ($LASTEXITCODE -ne 0) { claude --session-id ${quote(resumeId)} ${args} }`
    : `claude ${nativeId ? `--session-id ${quote(nativeId)} ` : ''}${args}`;
  return `$d = ${target}; if (Test-Path $d) { Set-Location $d } else { Set-Location $HOME }; ${run}`;
}

// Resolve the real Codex binary when available so JSON-RPC does not pass through a shell.
export function codexBinary(env = process.env) {
  if (!isWindows) {
    const executable = commandPath('codex', env);
    if (executable) return { file: executable, args: [] };
    throw new Error('Codex CLI is not installed. Install it and sign in once to use CyberStudio.');
  }
  const npmRoot = path.join(env.APPDATA || '', 'npm', 'node_modules', '@openai');
  const triple = process.arch === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const platformPackage = `codex-win32-${process.arch}`;
  for (const root of [path.join(npmRoot, 'codex', 'node_modules', '@openai', platformPackage), path.join(npmRoot, platformPackage), path.join(npmRoot, 'codex')]) {
    for (const directory of ['bin', 'codex']) {
      const candidate = path.join(root, 'vendor', triple, directory, 'codex.exe');
      if (existsSync(candidate)) return { file: candidate, args: [] };
    }
  }
  const js = path.join(npmRoot, 'codex', 'bin', 'codex.js');
  if (existsSync(js)) return { file: process.execPath, args: [js] };
  const executable = commandPath('codex', env);
  if (executable && !/\.(cmd|bat|ps1)$/i.test(executable)) return { file: executable, args: [] };
  throw new Error('Codex CLI is not installed. Install it and sign in once to use CyberStudio.');
}

export function terminalCommand(agent, { bypass = false, resumeId, nativeId, effort, opencodeMajor = 1, cwd } = {}) {
  if (!AGENTS.some(item => item.id === agent)) throw new Error('Unknown agent');
  if (agent === 'strix') {
    const ssh = commandPath('ssh');
    if (!ssh || !strixConfigured()) throw new Error('Add a "Host strix" entry to ~/.ssh/config to use Claude on Strix.');
    const claudeArgs = [...(bypass ? ['--dangerously-skip-permissions'] : []), ...(effort ? ['--effort', effort] : [])];
    return { file: ssh, args: ['-tt', '-o', 'ServerAliveInterval=30', '-o', 'ConnectTimeout=15', STRIX_HOST, strixScript(cwd, claudeArgs, resumeId, nativeId)] };
  }
  const command = agent === 'shell' ? shellCommand() : { file: commandPath(AGENTS.find(item => item.id === agent).command), args: [] };
  if (!command || !command.file) throw new Error(`${agent} is not installed on this computer`);
  if (agent === 'shell' && (path.isAbsolute(command.file) ? !existsSync(command.file) : !commandPath(command.file))) throw new Error('The local shell is not available on this computer');
  const args = [];
  if (agent === 'codex') {
    if (resumeId) args.push('resume', resumeId);
    // Inline mode retains xterm scrollback for new and resumed conversations.
    args.push('--no-alt-screen');
    if (bypass) args.push('--dangerously-bypass-approvals-and-sandbox');
    if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  } else if (agent === 'claude') {
    if (resumeId) args.push('--resume', resumeId);
    else if (nativeId) args.push('--session-id', nativeId);
    if (bypass) args.push('--dangerously-skip-permissions');
    if (effort) args.push('--effort', effort);
  } else if (agent === 'kimi') {
    if (resumeId) args.push('--session', resumeId);
    if (bypass) args.push('--yolo');
  } else if (agent === 'opencode') {
    // A private v2 server keeps each tab's observer and native session separate.
    if (opencodeMajor >= 2) args.push('--standalone');
    if (resumeId) args.push('--session', resumeId);
    if (bypass) args.push('--auto');
  }
  if (!isWindows || agent === 'shell') return { file: command.file || command, args: [...(command.args || []), ...args] };
  // No -NoExit: stale coordinator input cannot become shell commands after the agent exits.
  return wrapCommand(command.file, [...(command.args || []), ...args]);
}

export function childEnvironment(repo) {
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  // Forward only explicitly named MCP credentials. Voice and unrelated API keys
  // stay private to the service; CLI subscription authentication is unchanged.
  if (repo) {
    const values = parseEnv(readDotEnv(path.join(repo, '.env')));
    for (const [name, value] of Object.entries(values)) if (/^MRMAK_MCP_[A-Z0-9_]+$/.test(name) && !env[name]) env[name] = value;
  }
  // Drop host-agent identity from the parent so every terminal is an independent CLI.
  for (const key of Object.keys(env)) {
    if (/^(CLAUDECODE|CLAUDE_CODE_ENTRYPOINT|CODEX_THREAD_ID|CODEX_TURN_ID|CODEX_SHELL|MRMAK_TOKEN|MRMAK_PARENT_PID)$/.test(key) || key.startsWith('MRMAK_OPENCODE_')) delete env[key];
  }
  return env;
}

export function readDotEnv(file) {
  try { return readFileSync(file, 'utf8'); } catch { return ''; }
}
