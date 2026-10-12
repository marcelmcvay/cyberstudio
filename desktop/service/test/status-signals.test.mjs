import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Sessions, needsYou } from '../sessions.mjs';
import { claudeHookSettings, hookCommand, hookEvent, promptOnScreen, answersPrompt, oscNotifications, writeClaudeHooks } from '../cli-signals.mjs';
import { claudeProjectFolder, pickProjectFolder, strixWatchScript, watchStrixTranscript } from '../strix-watch.mjs';
import { strixScript, STRIX_FOLDER_LINE, terminalCommand } from '../agents.mjs';
import { sleep } from '../util.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const writer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../hook-writer.mjs');
async function fixture(agent = 'claude') {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'status-test-'));
  const sessions = await new Sessions(repo, path.join(repo, '.mrmak')).init();
  const item = sessions.make({ id: 'chat-s', name: 'Status Review', agent, open: true, status: 'running', createdAt: new Date().toISOString(), cols: 80, rows: 25 });
  item.process = { write() {}, kill() {} };
  sessions.items.set(item.id, item);
  return { repo, sessions, item };
}
async function until(check, timeout = 3500) {
  const end = Date.now() + timeout;
  while (!(await check())) { if (Date.now() > end) throw new Error('Timed out'); await sleep(30); }
}

test('per-chat Claude hook settings cover input, work, permission and turn end', async () => {
  const settings = claudeHookSettings('/tmp/x.jsonl', { platform: 'darwin' });
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Notification', 'PostToolUse', 'Stop']) assert.ok(settings.hooks[event]?.[0].hooks[0].command, event);
  assert.match(settings.hooks.Notification[0].matcher, /permission_prompt/);
  assert.doesNotMatch(settings.hooks.Notification[0].matcher, /idle_prompt/);
  assert.match(hookCommand('/a b/it\'s.jsonl', 'done', 'Stop', { platform: 'darwin' }), /'\/a b\/it'\\''s\.jsonl'$/);
  assert.match(hookCommand('C:\\s\\x.jsonl', 'done', 'Stop', { platform: 'win32', node: 'C:\\node.exe' }), /^"C:\\node\.exe" ".+hook-writer\.mjs" "C:\\s\\x\.jsonl" done Stop$/);
  // The settings file is passed only to this chat's CLI.
  const command = (() => { try { return terminalCommand('claude', { claudeSettings: '/state/hooks/a.settings.json' }); } catch { return null; } })();
  if (command) assert.deepEqual(command.args.slice(-2), ['--settings', '/state/hooks/a.settings.json']);
});

test('hook commands append parseable status lines (POSIX printf and the Node writer)', { skip: process.platform === 'win32' }, async () => {
  const { repo, sessions } = await fixture();
  try {
    const { file, settings } = await writeClaudeHooks(path.join(repo, '.mrmak'), 'chat-s');
    const parsed = JSON.parse(await readFile(settings, 'utf8'));
    execFileSync('/bin/sh', ['-c', parsed.hooks.PermissionRequest[0].hooks[0].command]);
    execFileSync(process.execPath, [writer, file, 'done', 'notify', JSON.stringify({ type: 'agent-turn-complete', 'turn-id': 't-9', 'last-assistant-message': 'All set.' })]);
    execFileSync(process.execPath, [writer, file, 'done', 'notify', JSON.stringify({ type: 'other' })]);
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    assert.equal(lines.length, 2);
    assert.deepEqual({ ...hookEvent(lines[0]), text: undefined }, { kind: 'attention', source: 'hook', text: undefined });
    assert.equal(hookEvent(lines[0]).text, 'The agent is asking for permission.');
    assert.deepEqual(hookEvent(lines[1]), { kind: 'turn-completed', id: 't-9', text: 'The agent finished its turn. Review the result.', preview: 'All set.', source: 'hook' });
    assert.equal(hookEvent('{"state":"bogus"}'), null);
    assert.equal(hookEvent('not json'), null);
  } finally { await sessions.close(); }
});

test('hook file drives waiting > working > done; transcript guesses cannot clear waiting', async () => {
  const { repo, sessions, item } = await fixture();
  const notices = [], counts = [];
  sessions.on('notice', notice => notices.push(notice.kind));
  sessions.on('attention-count', count => counts.push(count));
  const file = path.join(repo, 'hooks.jsonl');
  await appendFile(file, '');
  sessions.watchHooks(item, file);
  const write = (state, event = 'PermissionRequest') => appendFile(file, JSON.stringify({ state, event, ts: 1 }) + '\n');
  try {
    // Before hooks load (trust dialog), the screen reports the prompt.
    sessions.nativeEvent(item, { kind: 'attention', source: 'screen', prompt: 'trust', text: 'The agent is waiting for you to trust this folder.' });
    assert.equal(item.activity, 'waiting'); assert.equal(item.waitingKind, 'trust'); assert.equal(needsYou(item), true);
    sessions.input(item.id, '\r');
    assert.equal(item.activity, 'idle');
    await write('ready');
    await until(() => item.hooks);
    assert.equal(item.activity, 'idle');
    await write('working');
    await until(() => item.activity === 'working');
    await write('waiting');
    await until(() => item.activity === 'waiting');
    assert.equal(item.waitingText, 'The agent is asking for permission.');
    sessions.nativeEvent(item, { kind: 'turn-started' }); // late transcript record
    assert.equal(item.activity, 'waiting');
    assert.equal(answersPrompt('\x1b[A'), false);
    sessions.input(item.id, '1');
    assert.equal(item.activity, 'working');
    // With hooks loaded, the transcript only supplies the preview.
    sessions.nativeEvent(item, { kind: 'turn-completed', id: 'msg-1', text: 'done', preview: 'Preview from transcript.' });
    assert.equal(item.unread, false); assert.equal(item.preview, 'Preview from transcript.');
    await write('done');
    await until(() => item.unread);
    assert.equal(item.activity, 'idle'); assert.equal(item.completionVersion, 1);
    assert.deepEqual(notices, ['attention', 'attention', 'turn-completed']);
    assert.ok(counts.includes(1));
    sessions.seen(item.id, item.completionVersion);
    assert.equal(counts.at(-1), 0);
  } finally { await sessions.close(); }
});

test('screen prompts: trust dialog, tool permission and Codex approval', () => {
  assert.equal(promptOnScreen('claude', ['Accessing workspace:', '', ' Quick safety check: Is this a project you created or one you trust?', ' ❯ 1. Yes, I trust this folder', '   2. No, exit'])?.kind, 'trust');
  assert.equal(promptOnScreen('strix', 'Do you trust the files in this folder?\n1. Yes, proceed')?.kind, 'trust');
  assert.equal(promptOnScreen('claude', ['Bash command', '  npm test', 'Do you want to proceed?', '❯ 1. Yes', '  2. No'])?.kind, 'permission');
  assert.equal(promptOnScreen('codex', ['Would you like to run the following command?', '$ rm -rf build'])?.kind, 'permission');
  assert.equal(promptOnScreen('claude', ['> reply with ok', 'ok']), null);
  assert.equal(promptOnScreen('shell', ['Do you want to proceed?']), null);
});

test('Codex OSC 9 notifications survive chunk splits and skip progress reports', () => {
  let state = oscNotifications('', 'text \x1b]9;4;1;50\x07 more \x1b]9;Approval req');
  assert.deepEqual(state.found, []);
  state = oscNotifications(state.carry, 'uested: npm test\x07 tail');
  assert.deepEqual(state.found, ['Approval requested: npm test']);
  assert.equal(state.carry, '');
});

test('Strix transcript path: Claude folder mangling and the remote watcher', async () => {
  assert.equal(claudeProjectFolder('C:\\Users\\Ada\\studio\\projects\\demo-game'), 'C--Users-Ada-studio-projects-demo-game');
  assert.equal(claudeProjectFolder('C:\\Users\\Ada'), 'C--Users-Ada');
  assert.equal(pickProjectFolder(['C--Users-Ada', 'c--users-ada-studio', 'C--Windows-system32'], 'C:\\Users\\Ada\\Studio'), 'c--users-ada-studio');
  assert.equal(pickProjectFolder(['C--Users-Ada'], 'D:\\elsewhere'), null);
  const script = strixWatchScript(path.join(process.env.HOME || '/Users/x', 'studio', 'demo'), '11111111-2222-3333-4444-555555555555');
  assert.match(script, /\$id = '11111111-2222-3333-4444-555555555555'; \$name = \$id \+ '\.jsonl'/);
  assert.match(script, /Join-Path \$HOME 'studio\\demo'/);
  assert.match(script, /-replace '\[\^a-zA-Z0-9\]', '-'/);
  // Resumed chats start at the end of the file; new ones from the start. The
  // file is opened briefly per read with full sharing, and the script ends with
  // this session's claude.exe (Windows sshd does not end it on disconnect).
  assert.match(script, /\$pos = if \(\$fresh\) \{ 0 \} else \{ \(\[System\.IO\.FileInfo\]::new\(\$file\)\)\.Length \}/);
  assert.match(script, /'ReadWrite, Delete'/);
  assert.match(script, /Name='claude\.exe'.+CommandLine -like "\*\$id\*"/);
  assert.doesNotMatch(script, /Get-Content/);
  assert.match(script, /Get-ChildItem -LiteralPath \$root -Directory/);
  // The interactive script names the folder it used, including the fallback.
  assert.match(strixScript('/nowhere', [], null, 'id'), /Folder not found on Strix, using home/);
  assert.deepEqual(STRIX_FOLDER_LINE.exec('[CyberStudio] Folder not found on Strix, using home: C:\\Users\\Ada  ').slice(1), ['Folder not found on Strix, using home', 'C:\\Users\\Ada']);
  assert.equal(STRIX_FOLDER_LINE.exec('[CyberStudio] Strix folder: C:\\Users\\Ada\\studio')[2], 'C:\\Users\\Ada\\studio');

  const children = [];
  const spawnImpl = (file, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {};
    child.kill = () => { child.killed = true; child.emit('close'); };
    child.args = args; children.push(child);
    return child;
  };
  const events = [], files = [];
  const stop = watchStrixTranscript({ cwd: '/tmp', nativeId: 'abc', onEvent: event => events.push(event.kind), onTranscript: file => files.push(file), spawnImpl, retryMs: 10 });
  if (!children.length) { stop(); return; } // No ssh on this machine.
  assert.ok(children[0].args.includes('BatchMode=yes'));
  assert.ok(children[0].args.includes('ServerAliveInterval=10'));
  children[0].stdout.emit('data', '@@cyberstudio-transcript C:\\Users\\Ada\\.claude\\projects\\C--Users-Ada\\abc.jsonl\r\n{"type":"user","message":{"content":"hi"}}\r\n{"type":"assistant","message":{"id":"m1","stop_reason":"end_');
  children[0].stdout.emit('data', 'turn","content":[{"type":"text","text":"ok"}]}}\r\n');
  assert.deepEqual(files, ['C:\\Users\\Ada\\.claude\\projects\\C--Users-Ada\\abc.jsonl']);
  assert.deepEqual(events, ['turn-started', 'turn-completed']);
  children[0].emit('close'); // dropped link: restarts
  await until(() => children.length === 2);
  stop();
  assert.equal(children[1].killed, true);
  await sleep(40); assert.equal(children.length, 2);
});

test('closing a chat on request is not logged as an exit', { skip: process.platform === 'win32' }, async () => {
  const { sessions } = await fixture('shell');
  const notices = [];
  sessions.on('notice', notice => notices.push(notice));
  try {
    const created = await sessions.create({ agent: 'shell', name: 'Shell Close', cwd: sessions.repo });
    await sessions.remove(created.id);
    await sleep(100);
    assert.equal(notices.filter(notice => notice.kind === 'exit').length, 0);
  } finally { await sessions.close(); }
});
