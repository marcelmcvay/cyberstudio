import { open, readdir, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readCodexMetadata } from './codex-history.mjs';

// Recent native conversations a CLI keeps for one folder, newest first, for
// "Pick a conversation" when a chat's own conversation is missing (C-18).
// Read-only: transcripts are listed and their first prompt is read, never changed.

const sameFolder = (a, b) => typeof a === 'string' && typeof b === 'string' && path.resolve(a).replaceAll('\\', '/').toLowerCase() === path.resolve(b).replaceAll('\\', '/').toLowerCase();
const claudeRoot = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');
const codexRoot = () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'sessions');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Claude Code names a project folder after its path with every other character as "-".
export const claudeProjectFolder = cwd => String(cwd).replace(/[^a-zA-Z0-9]/g, '-');

// The first lines of a transcript, bounded, without loading the whole file.
async function headLines(file, maxBytes = 256 * 1024) {
  let handle;
  try {
    handle = await open(file, 'r');
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    const lines = buffer.subarray(0, bytesRead).toString('utf8').split('\n');
    if (bytesRead === maxBytes) lines.pop();
    return lines;
  } catch { return []; } finally { await handle?.close(); }
}

const tidy = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
// Wrapper text the CLIs add around the person's prompt: slash commands, context, instructions.
const generated = text => /^\s*<(command-|local-command|environment_context|user_instructions|system-reminder)|^\s*Caveat: /i.test(text);

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(part => part && ['text', 'input_text'].includes(part.type)).map(part => part.text).join(' ');
  return '';
}

export function claudeFirstPrompt(lines) {
  for (const line of lines) {
    let record; try { record = JSON.parse(line); } catch { continue; }
    if (record?.type !== 'user' || record.isMeta || record.message?.role !== 'user') continue;
    const text = textOf(record.message.content);
    if (text && !generated(text)) return tidy(text);
  }
  return '';
}

export function codexFirstPrompt(lines) {
  let fallback = '';
  for (const line of lines) {
    let record; try { record = JSON.parse(line); } catch { continue; }
    const payload = record?.payload;
    if (record?.type === 'event_msg' && payload?.type === 'user_message' && payload.message && !generated(payload.message)) return tidy(payload.message);
    if (!fallback && record?.type === 'response_item' && payload?.type === 'message' && payload.role === 'user') {
      const text = textOf(payload.content);
      if (text && !generated(text)) fallback = tidy(text);
    }
  }
  return fallback;
}

export async function claudeConversations(cwd, { root = claudeRoot(), limit = 20 } = {}) {
  const wanted = claudeProjectFolder(cwd).toLowerCase();
  const folder = (await readdir(root).catch(() => [])).find(item => item.toLowerCase() === wanted);
  if (!folder) return [];
  const directory = path.join(root, folder);
  const files = [];
  for (const name of await readdir(directory).catch(() => [])) {
    const id = name.replace(/\.jsonl$/, '');
    if (!name.endsWith('.jsonl') || !uuid.test(id)) continue;
    const info = await stat(path.join(directory, name)).catch(() => null);
    if (info?.isFile() && info.size > 0) files.push({ id, file: path.join(directory, name), updatedAt: info.mtime.toISOString(), mtime: info.mtimeMs });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const result = [];
  for (const item of files.slice(0, limit)) {
    const prompt = claudeFirstPrompt(await headLines(item.file));
    // A transcript with no prompt of the person's own (only a slash command) is not worth resuming.
    if (prompt) result.push({ id: item.id, updatedAt: item.updatedAt, prompt });
  }
  return result;
}

export async function codexConversations(cwd, { root = codexRoot(), limit = 20, scan = 400 } = {}) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const folder = pending.pop();
    for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const info = await stat(file).catch(() => null);
        if (info) files.push({ file, mtime: info.mtimeMs, updatedAt: info.mtime.toISOString() });
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const result = [];
  for (const item of files.slice(0, scan)) {
    if (result.length >= limit) break;
    const meta = await readCodexMetadata(item.file);
    // Only conversations the person started in this folder, not subagents or exec runs.
    if (!meta || !sameFolder(meta.cwd, cwd) || (meta.source && meta.source !== 'cli')) continue;
    result.push({ id: meta.id, updatedAt: item.updatedAt, prompt: codexFirstPrompt(await headLines(item.file)) });
  }
  return result;
}

export async function recentConversations(agent, cwd, options = {}) {
  if (agent === 'claude') return { conversations: await claudeConversations(cwd, options.claude) };
  if (agent === 'codex') return { conversations: await codexConversations(cwd, options.codex) };
  const where = agent === 'strix' ? 'on the Strix' : 'in this CLI';
  return { conversations: [], note: `CyberStudio cannot list conversations ${where}. Copy a session ID from the CLI's resume picker and paste it below.` };
}
