import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Assets, applyPatch, receiptPreviews, NOTE_EDIT_MS } from '../assets.mjs';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000030000000208020000', 'hex');
const sha = value => createHash('sha256').update(value).digest('hex');
const base = () => ({
  schema: 'cyberstudio.asset/v1', id: 'crate', title: 'Crate', kind: 'image', status: 'draft',
  created: '2026-10-01T10:00:00.000Z', updated: '2026-10-01T10:00:00.000Z',
  files: [{ path: 'assets/crate/crate.png', role: 'output', sha256: sha(png), bytes: png.length }],
  provenance: { origin: 'generated', jobs: [{ job_id: 'abc12345-0000-4000-8000-000000000001', tool: 'gen', model: 'm1', note: 'front view' }] },
  cost: { usd: 0.1, jobs: 1, basis: 'estimated' },
});
async function project(asset = base()) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'assets-test-'));
  await mkdir(path.join(repo, 'assets', asset.id), { recursive: true });
  await writeFile(path.join(repo, 'assets', asset.id, 'crate.png'), png);
  await writeFile(path.join(repo, 'assets', asset.id, 'asset.json'), JSON.stringify(asset, null, 2));
  return repo;
}
const clock = start => { let at = Date.parse(start); const now = () => new Date(at); now.step = ms => { at += ms; }; return now; };

test('status changes write history; revert from approved archives approved_*', async () => {
  const repo = await project();
  const now = clock('2026-10-11T18:00:00.000Z');
  const assets = new Assets(repo, { now });
  let asset = await assets.update('crate', { status: 'review' });
  assert.deepEqual(asset.review.history, [{ at: '2026-10-11T18:00:00.000Z', by: 'Marcel', status: 'review', from: 'draft' }]);
  now.step(60000);
  asset = await assets.update('crate', { status: 'approved' });
  assert.equal(asset.review.approved_by, 'Marcel');
  assert.equal(asset.review.approved_at, '2026-10-11T18:01:00.000Z');
  now.step(60000);
  asset = await assets.update('crate', { status: 'review' });
  assert.equal(asset.review.approved_by, undefined, 'revert removes approved_by');
  assert.equal(asset.review.approved_at, undefined, 'revert removes approved_at');
  assert.deepEqual(asset.review.history.at(-1), { at: '2026-10-11T18:02:00.000Z', by: 'Marcel', status: 'review', from: 'approved', approved_by: 'Marcel', approved_at: '2026-10-11T18:01:00.000Z' });
  const disk = JSON.parse(await readFile(path.join(repo, 'assets/crate/asset.json'), 'utf8'));
  assert.equal(disk.review.history.length, 3);
  assert.equal(disk.folder, undefined, 'folder is not written');
  const same = await assets.update('crate', { status: 'review' });
  assert.equal(same.review.history.length, 3, 'setting the same status is a no-op');
});

test('undo pops the last change and restores the archived approval', async () => {
  const repo = await project();
  const now = clock('2026-10-11T18:00:00.000Z');
  const assets = new Assets(repo, { now });
  await assets.update('crate', { status: 'approved' });
  now.step(1000);
  await assets.update('crate', { status: 'review' });
  now.step(1000);
  let asset = await assets.update('crate', { status: 'approved', undo: true });
  assert.equal(asset.status, 'approved');
  assert.equal(asset.review.approved_at, '2026-10-11T18:00:00.000Z', 'original approval time is restored');
  assert.equal(asset.review.history.length, 1);
  asset = await assets.update('crate', { status: 'draft', undo: true });
  assert.equal(asset.status, 'draft');
  assert.equal(asset.review, undefined, 'undoing the only change leaves no review block');
  await assert.rejects(assets.update('crate', { status: 'review', undo: true }), /Nothing to undo/);
  await assets.update('crate', { status: 'review' });
  now.step(6 * 60 * 1000);
  await assert.rejects(assets.update('crate', { status: 'draft', undo: true }), /too old/);
  await assert.rejects(assets.update('crate', { status: 'published' }), /Choose/);
});

test('notes: edit and delete inside 10 minutes, retract after', async () => {
  const repo = await project();
  const now = clock('2026-10-11T18:00:00.000Z');
  const assets = new Assets(repo, { now });
  await assets.update('crate', { note: 'first' });
  await assets.update('crate', { note: 'second' });
  now.step(2 * 60 * 1000);
  let asset = await assets.update('crate', { noteEdit: { index: 0, text: 'first, fixed' } });
  assert.equal(asset.review.notes[0].text, 'first, fixed');
  assert.equal(asset.review.notes[0].edited_at, '2026-10-11T18:02:00.000Z');
  asset = await assets.update('crate', { noteDelete: 1 });
  assert.equal(asset.review.notes.length, 1);
  now.step(NOTE_EDIT_MS);
  await assert.rejects(assets.update('crate', { noteEdit: { index: 0, text: 'late' } }), /10 minutes/);
  await assert.rejects(assets.update('crate', { noteDelete: 0 }), /10 minutes/);
  asset = await assets.update('crate', { noteRetract: 0 });
  assert.equal(asset.review.notes[0].text, 'first, fixed', 'retract keeps the text');
  assert.ok(asset.review.notes[0].retracted_at);
  await assert.rejects(assets.update('crate', { noteRetract: 4 }), /not found/);
});

test('notes by someone else cannot be changed; retracted notes cannot be edited', () => {
  const at = '2026-10-11T18:00:00.000Z';
  const asset = { ...base(), review: { notes: [{ at, by: 'QA', text: 'tool note' }, { at, by: 'Marcel', text: 'mine', retracted_at: at }] } };
  const date = new Date('2026-10-11T18:01:00.000Z');
  assert.throws(() => applyPatch(asset, { noteEdit: { index: 0, text: 'x' } }, date), /author/);
  assert.throws(() => applyPatch(asset, { noteRetract: 0 }, date), /author/);
  assert.throws(() => applyPatch(asset, { noteEdit: { index: 1, text: 'x' } }, date), /retracted/);
  assert.throws(() => applyPatch(asset, {}, date), /Send/);
  assert.equal(applyPatch(asset, { cards: ['a-card', 'a-card'] }, date), true);
  assert.deepEqual(asset.cards, ['a-card']);
  assert.throws(() => applyPatch(asset, { cards: ['Bad Card'] }, date), /card ids/);
});

test('receipts map a job to an image; read returns job_previews', async () => {
  const asset = base();
  asset.files.push({ path: 'assets/crate/receipts/job.json', role: 'receipt', sha256: '0'.repeat(64), bytes: 10 });
  assert.deepEqual(receiptPreviews(asset, ['{"id":"abc12345-0000-4000-8000-000000000001","out":"crate.png"}', '{"other":1}']), { 'abc12345-0000-4000-8000-000000000001': 'assets/crate/crate.png' });
  const repo = await project(asset);
  await mkdir(path.join(repo, 'assets/crate/receipts'));
  await writeFile(path.join(repo, 'assets/crate/receipts/job.json'), '{"job":"abc12345-0000-4000-8000-000000000001","file":"assets/crate/crate.png"}');
  const read = await new Assets(repo).read('crate');
  assert.equal(read.job_previews['abc12345-0000-4000-8000-000000000001'], 'assets/crate/crate.png');
});

test('a sidecar with history and edited notes passes sidecar check', async () => {
  const repo = await project();
  const now = clock('2026-10-11T18:00:00.000Z');
  const assets = new Assets(repo, { now });
  await assets.update('crate', { status: 'approved' });
  await assets.update('crate', { status: 'review' });
  await assets.update('crate', { note: 'looks good' });
  await assets.update('crate', { noteEdit: { index: 0, text: 'looks fine' } });
  now.step(NOTE_EDIT_MS + 1000);
  await assets.update('crate', { noteRetract: 0 });
  const result = spawnSync(process.execPath, [path.join(kit, 'scripts/sidecar.mjs'), 'check', '--root', repo], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
