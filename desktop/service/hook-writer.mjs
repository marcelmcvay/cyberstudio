// Appends one status line for CyberStudio: hook-writer.mjs <file> <state> <event> [codex notify JSON].
// Used by Codex notify on every platform and by Claude Code hooks on Windows.
import { appendFileSync } from 'node:fs';

const [file, state, event, payload] = process.argv.slice(2);
const line = { state, event, ts: Math.floor(Date.now() / 1000) };
if (payload) {
  try {
    const value = JSON.parse(payload);
    if (value.type && value.type !== 'agent-turn-complete') process.exit(0);
    if (value['turn-id']) line.id = value['turn-id'];
    if (value['last-assistant-message']) line.preview = String(value['last-assistant-message']).slice(-350);
  } catch { /* A malformed payload still reports the state. */ }
}
if (file && state) appendFileSync(file, JSON.stringify(line) + '\n');
