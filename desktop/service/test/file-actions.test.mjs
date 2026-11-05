import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, unlink, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Files } from '../files.mjs';
import { FileActions } from '../file-actions.mjs';

async function fixture() {
  const repo = await realpath(await mkdtemp(path.join(os.tmpdir(), 'cyberstudio-file-actions-')));
  await mkdir(path.join(repo, 'assets/files'), { recursive: true });
  await mkdir(path.join(repo, 'workspace/card'), { recursive: true });
  const source = path.join(repo, 'assets/files/image #1 + café%.png');
  await writeFile(source, 'source');
  const files = new Files(repo); files.origin = 'http://127.0.0.1:12345';
  return { repo, source, files, url: files.url(source) };
}

test('file action URLs share the content grant, encoding, realpath and private-file boundary', async () => {
  const { repo, source, files, url } = await fixture();
  assert.equal((await files.resolveContentUrl(url + '?x=1#preview')).file, source);
  const fromReport = new URL('../../assets/files/' + encodeURIComponent(path.basename(source)), `${files.origin}/view/${files.repoGrant}/workspace/card/report.html`);
  assert.equal((await files.resolveContentUrl(fromReport)).file, source);
  await writeFile(path.join(repo, '.env'), 'PRIVATE_FIXTURE=');
  await symlink(os.tmpdir(), path.join(repo, 'assets/outside'), process.platform === 'win32' ? 'junction' : 'dir');
  for (const target of [
    `file://${source}`, 'https://example.com/image.png',
    `${files.origin}/view/invalid/assets/file.zip`,
    `${files.origin}/view/${files.repoGrant}/.env`,
    `${files.origin}/view/${files.repoGrant}/%2eenv`,
    `${files.origin}/view/${files.repoGrant}/%2e%2e/outside`,
    `${files.origin}/view/${files.repoGrant}/assets/outside`,
    `${files.origin}/view/${files.repoGrant}/assets/files/%zz`,
    `${files.origin}/view/${files.repoGrant}/assets/files`,
  ]) await assert.rejects(files.resolveContentUrl(target));
});

test('inspection never invokes native actions; reveal/save require capability, revalidation and acknowledgement', async () => {
  const { source, files, url } = await fixture();
  const events = [];
  const actions = new FileActions(files, event => events.push(event));
  const info = await actions.request({ url, action: 'inspect' });
  assert.equal(info.name, path.basename(source)); assert.equal(info.native, false);
  assert.equal(events.length, 0);
  await assert.rejects(actions.request({ url, action: 'reveal' }), /unavailable/);
  actions.receive({ type: 'file-actions-available' });
  const reveal = actions.request({ url, action: 'reveal' });
  // Path validation is asynchronous. Wait until the fake native request arrives.
  while (!events.length) await new Promise(resolve => setImmediate(resolve));
  assert.equal(events[0].path, source); assert.equal(events[0].type, 'reveal');
  actions.receive({ type: 'file-action-result', requestId: 'unrelated' });
  assert.equal(actions.pending.size, 1);
  actions.receive({ type: 'file-action-result', requestId: events[0].requestId });
  assert.deepEqual(await reveal, { status: 'revealed' });
  const save = actions.request({ url, action: 'save' });
  while (events.length < 2) await new Promise(resolve => setImmediate(resolve));
  assert.equal(events[1].type, 'save-copy');
  actions.receive({ type: 'file-action-result', requestId: events[1].requestId, cancelled: true });
  assert.deepEqual(await save, { status: 'cancelled' });
  const failed = actions.request({ url, action: 'reveal' });
  while (events.length < 3) await new Promise(resolve => setImmediate(resolve));
  actions.receive({ type: 'file-action-result', requestId: events[2].requestId, error: 'Finder unavailable' });
  await assert.rejects(failed, /Finder unavailable/);
  await unlink(source);
  await assert.rejects(actions.request({ url, action: 'save' }));
  assert.equal(events.length, 3);
  actions.close();
});
