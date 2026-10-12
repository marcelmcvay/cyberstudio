// Close and quit confirmation (C-05, C-07), missing conversations (C-18) and
// conversation discovery. Isolated folders; no CLI login or real conversation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sessions } from '../sessions.mjs';
import { createService } from '../server.mjs';
import { claudeConversations, codexConversations, claudeFirstPrompt, codexFirstPrompt, claudeProjectFolder, recentConversations } from '../conversations.mjs';
import { closeConfirmation, checksForeground, stoppedChatState } from '../../../src/desktop/chatActivity.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
async function tempRepo(prefix) {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  return mkdtemp(path.join(root, '.cache', prefix));
}
const chat = values => ({ id: 'a', name: 'Animation pass', agent: 'claude', cwd: '/tmp', status: 'running', activity: 'idle', open: true, ...values });

test('close asks only when the chat is working, waiting, or a shell runs a foreground command', () => {
  assert.equal(closeConfirmation(chat({ activity: 'working' }), 'Claude Code'), 'Claude Code is still working in Animation pass. Stop it and close?');
  assert.equal(closeConfirmation(chat({ activity: 'waiting' }), 'Codex'), 'Codex is waiting for your answer in Animation pass. Stop it and close?');
  // Routine closes stay one click: idle, finished with an unread result, stopped.
  assert.equal(closeConfirmation(chat({}), 'Claude Code'), null);
  assert.equal(closeConfirmation(chat({ unread: true }), 'Claude Code'), null);
  assert.equal(closeConfirmation(chat({ status: 'exited', activity: 'working' }), 'Claude Code'), null);
  // A shell asks the service only while running and not already known to be busy.
  const shell = chat({ agent: 'shell', name: 'Build' });
  assert.equal(checksForeground(shell), true);
  assert.equal(checksForeground({ ...shell, status: 'stopped' }), false);
  assert.equal(checksForeground(chat({})), false);
  assert.equal(closeConfirmation(shell, 'zsh', 'sleep'), 'sleep is still running in Build. Stop it and close?');
  assert.equal(closeConfirmation(shell, 'zsh', null), null);
  // A missing conversation shows its own actions instead of Resume.
  assert.deepEqual(stoppedChatState(chat({ status: 'stopped', conversationMissing: true, restoreError: 'gone' })), { text: 'gone', short: 'Conversation not found', action: '' });
});

test('a local shell reports its foreground command; quit lists busy chats', { skip: process.platform === 'win32' && 'Windows reports no foreground process' }, async () => {
  const repo = await tempRepo('chat-close-');
  const priorShell = process.env.SHELL;
  process.env.SHELL = '/bin/sh';
  const sessions = await new Sessions(repo, path.join(repo, 'state')).init();
  try {
    const shell = await sessions.create({ agent: 'shell', name: 'Build shell', cwd: repo });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(await sessions.busy(shell.id), null, 'an idle prompt is not busy');
    sessions.input(shell.id, 'sleep 5\r');
    let busy = null;
    for (let i = 0; i < 40 && !busy; i++) { await new Promise(resolve => setTimeout(resolve, 100)); busy = await sessions.busy(shell.id); }
    assert.deepEqual(busy, { id: shell.id, name: 'Build shell', agent: 'shell', reason: 'process', command: 'sleep' });
    // Agent chats are busy by activity; closed and idle chats are not listed.
    for (const [id, activity, open] of [['working', 'working', true], ['waiting', 'waiting', true], ['idle', 'idle', true], ['closed', 'working', false]]) {
      const item = sessions.make({ id, name: `Chat ${id}`, agent: 'claude', cwd: repo, status: 'running', activity, open, createdAt: '2026-10-11', cols: 80, rows: 24 });
      item.process = { write() {}, kill() {}, resize() {} };
      sessions.items.set(id, item);
    }
    assert.deepEqual((await sessions.busyChats()).map(item => [item.name, item.reason]).sort(), [['Build shell', 'process'], ['Chat waiting', 'waiting'], ['Chat working', 'working']]);
    for (const id of ['working', 'waiting', 'idle', 'closed']) sessions.items.get(id).process = null;
  } finally {
    await sessions.close();
    if (priorShell === undefined) delete process.env.SHELL; else process.env.SHELL = priorShell;
  }
});

test('the shell asks the service which chats are busy before quitting', async () => {
  const repo = await tempRepo('quit-check-');
  await mkdir(path.join(repo, 'workspace'), { recursive: true });
  await writeFile(path.join(repo, 'workspace/workspace.json'), '{"entities":[]}');
  const events = [];
  const service = await createService({ repo, uiDir: path.join(repo, 'ui'), native: event => events.push(event), mcpOptions: { home: repo, env: {} } });
  try {
    const item = service.sessions.make({ id: 'busy', name: 'Long task', agent: 'codex', cwd: repo, status: 'running', activity: 'working', open: true, createdAt: '2026-10-11', cols: 80, rows: 24 });
    item.process = { write() {}, kill() {}, resize() {} };
    service.sessions.items.set('busy', item);
    service.nativeMessage({ type: 'quit-check', requestId: 'q1' });
    for (let i = 0; i < 50 && !events.some(event => event.type === 'quit-check'); i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(events.find(event => event.type === 'quit-check'), { type: 'quit-check', requestId: 'q1', chats: [{ id: 'busy', name: 'Long task', agent: 'codex', reason: 'working' }] });
    item.process = null;
  } finally { await service.close(); }
});

test('a reopen from History with a missing conversation opens the tab read-only, then starts fresh or resumes a pick', async () => {
  const repo = await tempRepo('missing-chat-');
  const priorHome = process.env.CODEX_HOME;
  process.env.CODEX_HOME = path.join(repo, 'codex-empty');
  const sessions = await new Sessions(repo, path.join(repo, 'state')).init();
  const launches = [];
  sessions.launch = (session, resumeId) => { launches.push({ nativeId: session.nativeId, resumeId }); session.process = { write() {}, kill() {}, resize() {} }; session.status = 'running'; session.conversationMissing = false; session.restoreError = null; };
  sessions.nativeBoundary = async () => null;
  try {
    sessions.items.set('saved', sessions.make({ id: 'saved', name: 'Shader notes', agent: 'codex', cwd: repo, nativeId: null, hasConversation: true, open: false, status: 'stopped', createdAt: '2026-10-01', cols: 80, rows: 24 }));
    await assert.rejects(sessions.resume('saved', undefined, { fromHistory: true }), error => error.code === 'conversation-missing' && /Codex conversation for "Shader notes"/.test(error.message));
    const opened = sessions.list().find(item => item.id === 'saved');
    assert.equal(opened.open, true, 'the tab opens with its saved screen');
    assert.equal(opened.conversationMissing, true);
    assert.match(opened.restoreError, /Shader notes/);
    // An open tab that fails without fromHistory keeps its state too; a closed one stays closed.
    sessions.items.set('closed', sessions.make({ id: 'closed', name: 'Old', agent: 'codex', cwd: repo, nativeId: null, hasConversation: true, open: false, status: 'stopped', createdAt: '2026-10-01', cols: 80, rows: 24 }));
    await assert.rejects(sessions.resume('closed'));
    assert.equal(sessions.get('closed').open, false);
    // "Start a new conversation here"
    await sessions.resume('saved', undefined, { fresh: true });
    assert.deepEqual(launches.at(-1), { nativeId: null, resumeId: null });
    assert.equal(sessions.get('saved').hasConversation, false);
    // "Pick a conversation"
    sessions.get('saved').process = null;
    await sessions.resume('saved', '019a0000-0000-7000-8000-000000000001');
    assert.deepEqual(launches.at(-1), { nativeId: '019a0000-0000-7000-8000-000000000001', resumeId: '019a0000-0000-7000-8000-000000000001' });
    // Reasoning effort for the next start (C-27).
    assert.equal(sessions.setEffort('saved', 'high').effort, 'high');
    assert.throws(() => sessions.setEffort('saved', 'extreme'), /medium, high, xhigh or max/);
    sessions.get('saved').process = null;
  } finally {
    await sessions.close();
    if (priorHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = priorHome;
  }
});

test('conversation discovery lists a folder\'s Claude and Codex conversations, newest first, with the first prompt', async () => {
  const repo = await tempRepo('conversations-');
  const cwd = path.join(repo, 'Projects', 'Dream Game');
  const claudeRoot = path.join(repo, 'claude-projects');
  const folder = path.join(claudeRoot, claudeProjectFolder(cwd));
  await mkdir(folder, { recursive: true });
  const older = '11111111-1111-4111-8111-111111111111', newer = '22222222-2222-4222-8222-222222222222', commandOnly = '33333333-3333-4333-8333-333333333333';
  const line = value => JSON.stringify(value) + '\n';
  await writeFile(path.join(folder, `${older}.jsonl`), line({ type: 'summary', summary: 'x' }) + line({ type: 'user', isMeta: true, message: { role: 'user', content: 'Caveat: generated' } }) + line({ type: 'user', message: { role: 'user', content: 'Rig the   fox\nfor walking' } }));
  await writeFile(path.join(folder, `${newer}.jsonl`), line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Bake the textures' }] } }));
  await writeFile(path.join(folder, `${commandOnly}.jsonl`), line({ type: 'user', message: { role: 'user', content: '<command-name>/clear</command-name>' } }));
  await writeFile(path.join(folder, 'notes.txt'), 'not a transcript');
  await utimes(path.join(folder, `${older}.jsonl`), new Date('2026-10-01'), new Date('2026-10-01'));
  await utimes(path.join(folder, `${newer}.jsonl`), new Date('2026-10-05'), new Date('2026-10-05'));
  const claude = await claudeConversations(cwd, { root: claudeRoot });
  assert.deepEqual(claude.map(item => [item.id, item.prompt]), [[newer, 'Bake the textures'], [older, 'Rig the fox for walking']]);
  assert.deepEqual(await claudeConversations(path.join(repo, 'elsewhere'), { root: claudeRoot }), []);

  const codexRoot = path.join(repo, 'codex', 'sessions', '2026', '10', '03');
  await mkdir(codexRoot, { recursive: true });
  const codex = (id, at, cwdValue, prompt, source = 'cli') => writeFile(path.join(codexRoot, `rollout-${at}-${id}.jsonl`), line({ type: 'session_meta', payload: { id, cwd: cwdValue, source, instructions: 'x'.repeat(1000) } }) + line({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } }) + line({ type: 'event_msg', payload: { type: 'user_message', message: prompt } }));
  await codex('aaaaaaaa-0000-4000-8000-000000000001', 'a', cwd, 'Fix the camera');
  await codex('aaaaaaaa-0000-4000-8000-000000000002', 'b', path.join(repo, 'other'), 'Other folder');
  await codex('aaaaaaaa-0000-4000-8000-000000000003', 'c', cwd, 'Subagent run', 'exec');
  const found = await codexConversations(cwd, { root: path.join(repo, 'codex', 'sessions') });
  assert.deepEqual(found.map(item => [item.id, item.prompt]), [['aaaaaaaa-0000-4000-8000-000000000001', 'Fix the camera']]);

  assert.equal(claudeFirstPrompt(['not json', line({ type: 'assistant' })]), '');
  assert.equal(codexFirstPrompt([line({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fallback prompt' }] } })]), 'Fallback prompt');
  const remote = await recentConversations('strix', cwd);
  assert.deepEqual(remote.conversations, []);
  assert.match(remote.note, /Strix/);
});
