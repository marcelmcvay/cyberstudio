import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { importFile, dragFiles, moveFile, recyclePath } from '../file-transfers.mjs';
import { createService } from '../server.mjs';
import { taskTitle } from '../titles.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
async function fixture() {
  await mkdir(path.join(root, '.cache'), { recursive: true });
  const repo = await mkdtemp(path.join(root, '.cache', 'file-transfer-test-'));
  await mkdir(path.join(repo, 'inbox'));
  await mkdir(path.join(repo, 'workspace'));
  await writeFile(path.join(repo, 'workspace', 'workspace.json'), '{"entities":[]}');
  await mkdir(path.join(repo, 'ui'));
  await writeFile(path.join(repo, 'ui', 'index.html'), '<html>Test UI</html>');
  return repo;
}

test('streaming copies preserve bytes and concurrent duplicate names never overwrite', async () => {
  const repo = await fixture(), folder = path.join(repo, 'inbox');
  const original = Buffer.from('Existing file must survive');
  await writeFile(path.join(folder, 'My picture.png'), original);
  const payload = Buffer.from(Array.from({ length: 8193 }, (_, i) => i % 256));
  const files = await Promise.all(Array.from({ length: 3 }, () => importFile(Readable.from([payload.subarray(0, 512), payload.subarray(512)]), folder, 'My picture.png')));
  assert.equal(new Set(files.map(file => file.path)).size, 3);
  assert.deepEqual(await readFile(path.join(folder, 'My picture.png')), original);
  for (const file of files) { assert.deepEqual(await readFile(file.path), payload); assert.equal(file.renamed, true); assert.equal(file.size, payload.length); }
  const empty = await importFile(Readable.from([]), folder, 'Empty.txt');
  assert.equal((await readFile(empty.path)).length, 0);
});

test('invalid names, interrupted uploads and size limits leave no partial copies', async () => {
  const repo = await fixture(), folder = path.join(repo, 'inbox');
  const invalidNames = ['../escape.txt', '..\\escape.txt', '.', '..', 'a/b.txt'];
  if (process.platform === 'win32') invalidNames.push('CON.txt', 'C:secret', 'trailing.', 'trailing ');
  for (const name of invalidNames) {
    await assert.rejects(importFile(Readable.from(['bad']), folder, name), /file name/);
  }
  await assert.rejects(importFile(Readable.from([Buffer.from('123'), Buffer.from('456')]), folder, 'Large.bin', 4), /1 GB/);
  async function* interrupted() { yield Buffer.from('partial'); throw new Error('Transfer interrupted'); }
  await assert.rejects(importFile(interrupted(), folder, 'Interrupted.bin'), /interrupted/);
  assert.deepEqual(await readdir(folder), []);
  await assert.rejects(importFile(Readable.from([]), path.join(repo, 'ui', 'index.html'), 'file.txt'), /folder/);
  assert.deepEqual(await dragFiles([folder]), [await realpath(folder)]);
  await assert.rejects(dragFiles([]), /1 and 100/);
});

test('file import and native drag use authenticated control and a selected folder', async () => {
  const repo = await fixture(), events = [];
  const service = await createService({ repo, uiDir: path.join(repo, 'ui'), native: event => events.push(event) });
  try {
    const folder = path.join(repo, 'drops'); await mkdir(folder);
    const endpoint = `${service.origin}/api/files/import?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent('A space.txt')}`;
    const headers = { Authorization: `Bearer ${service.token}` };
    assert.equal((await fetch(endpoint, { method: 'POST', body: 'blocked' })).status, 401);
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { ...headers, Origin: service.contentOrigin }, body: 'blocked' })).status, 403);
    assert.deepEqual(await readdir(folder), []);
    const response = await fetch(endpoint, { method: 'POST', headers, body: 'Copied from Explorer' });
    assert.equal(response.status, 201);
    const file = await response.json();
    assert.equal(await readFile(file.path, 'utf8'), 'Copied from Explorer');
    const listing = await (await fetch(`${service.origin}/api/files?mode=all&path=${encodeURIComponent(folder)}`, { headers })).json();
    assert.deepEqual(listing.entries.map(entry => entry.name), ['A space.txt']);
    const drag = await fetch(`${service.origin}/api/files/drag`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ paths: [file.path] }) });
    assert.equal(drag.status, 200);
    assert.deepEqual(events.at(-1), { type: 'drag-files', window: 'workspace', paths: [await realpath(file.path)] });
    assert.equal(await readFile(file.path, 'utf8'), 'Copied from Explorer');
    // A drop on the inbox itself becomes inbox/<id>/ with an asset.json sidecar.
    const inbox = path.join(repo, 'inbox');
    const intake = await fetch(`${service.origin}/api/files/import?folder=${encodeURIComponent(inbox)}&name=${encodeURIComponent('Mood board.pdf')}`, { method: 'POST', headers, body: 'pdf bytes' });
    assert.equal(intake.status, 201);
    const added = await intake.json();
    assert.equal(added.intake.id, 'mood-board');
    assert.deepEqual(await readdir(path.join(inbox, 'mood-board')), ['Mood board.pdf', 'asset.json']);
    const asset = JSON.parse(await readFile(path.join(inbox, 'mood-board', 'asset.json'), 'utf8'));
    assert.equal(asset.kind, 'document'); assert.equal(asset.status, 'draft'); assert.equal(asset.provenance.origin, 'imported');
    assert.equal(asset.files[0].path, 'inbox/mood-board/Mood board.pdf'); assert.equal(asset.files[0].bytes, 9);
  } finally { await service.close(); }
});

test('coordinator refuses unnamed or generic chats before launching a terminal', async () => {
  const repo = await fixture();
  const service = await createService({ repo, uiDir: path.join(repo, 'ui') });
  try {
    for (const name of ['', 'Conversation 1', 'New chat', 'Session #3', 'Codex', '123', 'Настройки голоса']) {
      await assert.rejects(service.coordinator.execute('open_chat', { agent: 'codex', name }));
    }
    assert.equal(service.sessions.list().length, 0);
    assert.equal(taskTitle('  Dream Game   Combat  '), 'Dream Game Combat');
    assert.equal(taskTitle('Voice Settings'), 'Voice Settings');
  } finally { await service.close(); }
});

test('internal drops move files, same-folder drops do nothing, collisions retain both originals', async () => {
  const repo = await fixture(), folder = path.join(repo, 'inbox');
  const source = path.join(folder, 'Move me.txt');
  await writeFile(source, 'Source bytes');
  assert.deepEqual(await moveFile(source, folder), { path: source, moved: false });
  assert.deepEqual(await readdir(folder), ['Move me.txt']);
  const destination = path.join(repo, 'workspace');
  const target = path.join(destination, 'Move me.txt');
  await writeFile(target, 'Destination bytes');
  await assert.rejects(moveFile(source, destination), /already exists/);
  assert.equal(await readFile(source, 'utf8'), 'Source bytes');
  assert.equal(await readFile(target, 'utf8'), 'Destination bytes');
  const empty = path.join(repo, 'Moved'); await mkdir(empty);
  const result = await moveFile(source, empty);
  assert.equal(result.moved, true);
  assert.equal(await readFile(result.path, 'utf8'), 'Source bytes');
  assert.deepEqual(await readdir(folder), []);
  await assert.rejects(recyclePath(repo, repo), /project folder/);
  assert.equal(await recyclePath(result.path, repo), result.path);
});

test('trash stages project items for undo, then hands them to the OS trash', async () => {
  const { TrashStage } = await import('../file-transfers.mjs');
  const repo = await fixture(), events = [];
  const file = path.join(repo, 'inbox', 'note.txt');
  await writeFile(file, 'keep me');
  const trash = new TrashStage(repo, { native: event => events.push(event), holdMs: 60000 });
  const staged = await trash.stage(file);
  assert.equal(staged.path, file);
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(repo, '.trash', '.gitignore'), 'utf8'), '*\n');
  // Undo restores the exact bytes and clears the stamp folder.
  assert.deepEqual(await trash.restore(staged.id), { path: file, restored: true });
  assert.equal(await readFile(file, 'utf8'), 'keep me');
  assert.deepEqual((await readdir(path.join(repo, '.trash'))).filter(name => name !== '.gitignore'), []);
  await assert.rejects(trash.restore(staged.id), /Too late/);
  // A new file at the old path is never overwritten by an undo.
  const again = await trash.stage(file);
  await writeFile(file, 'newer');
  await assert.rejects(trash.restore(again.id), /Nothing was restored/);
  assert.equal(await readFile(file, 'utf8'), 'newer');
  // Expiry hands the staged copy to the native trash.
  trash.flush(again.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'recycle-file');
  assert.match(events[0].path, /[\\/]\.trash[\\/][^\\/]+[\\/]note\.txt$/);
  // Items outside the project are not staged; the caller recycles them directly.
  assert.equal(await trash.stage(path.dirname(repo)), null);
  // A restart empties leftovers.
  const later = new TrashStage(repo, { native: event => events.push(event) });
  await later.sweep();
  assert.equal(events.length, 2);
  trash.close(); later.close();
});
