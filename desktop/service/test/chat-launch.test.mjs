import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { childEnvironment } from '../agents.mjs';
import { workingFolder } from '../sessions.mjs';
import { stoppedChatState } from '../../../src/desktop/chatActivity.ts';

test('a stopped chat says why instead of claiming to reconnect', () => {
  const chat = { agent: 'claude', status: 'exited', exitCode: 0, hasConversation: true, restoreError: null };
  assert.deepEqual(stoppedChatState(chat), { text: 'Ended · exit 0', short: 'Ended · exit 0', action: 'Resume conversation' });
  assert.deepEqual(stoppedChatState({ ...chat, agent: 'shell', exitCode: 130 }), { text: 'Ended · exit 130', short: 'Ended · exit 130', action: 'Restart' });
  assert.equal(stoppedChatState({ ...chat, hasConversation: false }).action, 'Restart');
  assert.deepEqual(stoppedChatState({ ...chat, status: 'stopped', restoreError: 'spawn failed' }), { text: 'Could not start: spawn failed', short: 'Could not start', action: 'Resume conversation' });
  assert.equal(stoppedChatState({ ...chat, status: 'stopped', exitCode: null }).short, 'Restoring…');
  for (const status of ['exited', 'stopped']) assert.doesNotMatch(stoppedChatState({ ...chat, status }).text, /Reconnect/);
});

test('working folder expands a leading ~ and explains a missing or file path', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'cyberstudio-home-'));
  const base = await mkdtemp(path.join(os.tmpdir(), 'cyberstudio-base-'));
  await mkdir(path.join(home, 'Desktop'));
  await writeFile(path.join(home, 'notes.md'), '');

  assert.equal(await workingFolder('~/Desktop', base, home), path.join(home, 'Desktop'));
  assert.equal(await workingFolder('~', base, home), home);
  assert.equal(await workingFolder('', base, home), base);
  assert.equal(await workingFolder(` ${home} `, base, home), home);
  await assert.rejects(workingFolder('~/Missing', base, home), { message: `That folder doesn't exist: ${path.join(home, 'Missing')}`, status: 400 });
  await assert.rejects(workingFolder('~/notes.md', base, home), { message: `That path is a file, not a folder: ${path.join(home, 'notes.md')}`, status: 400 });
  // Only a leading ~ means home; a folder named ~something is relative.
  await assert.rejects(workingFolder('~other', base, home), { message: `That folder doesn't exist: ${path.join(base, '~other')}` });
});

test('child terminals do not inherit the host Claude Code session identity', () => {
  const names = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_PID', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN'];
  const kept = { ANTHROPIC_BASE_URL: 'https://example.invalid', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CONFIG_DIR: '/tmp/claude-config' };
  const saved = { ...process.env };
  try {
    for (const name of names) process.env[name] = 'host';
    Object.assign(process.env, kept);
    const env = childEnvironment();
    for (const name of names) assert.equal(env[name], undefined, name);
    for (const [name, value] of Object.entries(kept)) assert.equal(env[name], value, name);
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  }
});
