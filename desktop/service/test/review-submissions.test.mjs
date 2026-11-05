import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Files } from '../files.mjs';
import { ReviewSubmissions } from '../review-submissions.mjs';

async function fixture(review = { form: 'demo-form', inbox: 'decisions/inbox.jsonl', owner: 'Demo owner' }) {
  const repo = await realpath(await mkdtemp(path.join(os.tmpdir(), 'review-submissions-')));
  await mkdir(path.join(repo, 'workspace/card'), { recursive: true });
  await writeFile(path.join(repo, 'workspace/card/report.html'), '<!doctype html><title>Report</title>');
  await writeFile(path.join(repo, 'workspace/card/other.html'), '<!doctype html><title>Other</title>');
  const registry = { entities: [{ id: 'card', folder: 'card', steps: [{ name: 'Report', path: 'report.html', review }, { name: 'Other', path: 'other.html' }] }] };
  const files = new Files(repo); files.origin = 'http://127.0.0.1:9';
  const reviews = new ReviewSubmissions({ repo, files, registry: async () => registry });
  return { repo, reviews, url: files.url(path.join(repo, 'workspace/card/report.html')), other: files.url(path.join(repo, 'workspace/card/other.html')) };
}
const decision = (extra = {}) => ({ questionId: 'Q1', decision: 'approve', note: 'Looks right', revision: 'a'.repeat(64), scope: 'The demo', references: [{ path: 'x.png', sha256: 'b'.repeat(64) }], ...extra });
const submission = (extra = {}) => ({ id: '11111111-2222-4333-8444-555555555555', form: 'demo-form', decisions: [decision()], ...extra });

test('describe returns the registered destination, never a report-chosen one', async () => {
  const { reviews, url } = await fixture();
  assert.deepEqual(await reviews.describe({ url, form: 'demo-form' }), { form: 'demo-form', owner: 'Demo owner', destination: 'workspace/card/decisions/inbox.jsonl', entity: 'card', step: 'Report' });
});

test('a report without a matching review declaration cannot submit', async () => {
  const { reviews, url, other } = await fixture();
  await assert.rejects(reviews.describe({ url: other, form: 'demo-form' }), { status: 404 });
  await assert.rejects(reviews.submit({ url, submission: submission({ form: 'another-form' }) }), { status: 404 });
  await assert.rejects(reviews.describe({ url: 'http://evil.example/view/x/report.html', form: 'demo-form' }), { status: 403 });
});

test('an inbox outside the project or not .jsonl is refused', async () => {
  for (const inbox of ['../../../outside.jsonl', 'decisions/inbox.json', '../../.git/inbox.jsonl']) {
    const { reviews, url } = await fixture({ form: 'demo-form', inbox, owner: 'x' });
    await assert.rejects(reviews.describe({ url, form: 'demo-form' }), { status: 403 }, inbox);
  }
});

test('validation: decisions, revisions and edit notes', async () => {
  const { reviews, url } = await fixture();
  await assert.rejects(reviews.submit({ url, submission: submission({ decisions: [] }) }), /at least one/);
  await assert.rejects(reviews.submit({ url, submission: submission({ id: 'not-a-uuid' }) }), /valid id/);
  await assert.rejects(reviews.submit({ url, submission: submission({ decisions: [decision({ decision: 'maybe' })] }) }), /Approve or Request edits/);
  await assert.rejects(reviews.submit({ url, submission: submission({ decisions: [decision({ revision: 'short' })] }) }), /revision/);
  await assert.rejects(reviews.submit({ url, submission: submission({ decisions: [decision({ decision: 'request-edits', note: '  ' })] }) }), /what should change/);
  await assert.rejects(reviews.submit({ url, submission: submission({ decisions: [decision(), decision()] }) }), /unique/);
  await assert.rejects(reviews.submit({ url, submission: submission({ decisions: [decision({ note: 'x'.repeat(4001) })] }) }), /longer/);
});

test('submit appends one line; the same id is not recorded twice', async () => {
  const { repo, reviews, url } = await fixture();
  const first = await reviews.submit({ url, submission: submission() });
  assert.equal(first.status, 'recorded'); assert.equal(first.duplicate, false); assert.equal(first.count, 1);
  const again = await reviews.submit({ url, submission: submission() });
  assert.equal(again.duplicate, true); assert.equal(again.receivedAt, first.receivedAt);
  await reviews.submit({ url, submission: submission({ id: '11111111-2222-4333-8444-666666666666', decisions: [decision({ decision: 'request-edits', note: 'Make it blue' })] }) });
  const lines = (await readFile(path.join(repo, 'workspace/card/decisions/inbox.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].schema, 'cyberstudio.review-submission/v1'); assert.equal(lines[0].confirmedInWorkspace, true);
  assert.equal(lines[0].report.path, 'workspace/card/report.html'); assert.match(lines[0].report.sha256, /^[a-f0-9]{64}$/);
  assert.equal(lines[1].decisions[0].note, 'Make it blue');
});

test('concurrent sends are serialized', async () => {
  const { repo, reviews, url } = await fixture();
  const ids = Array.from({ length: 8 }, (_, i) => `11111111-2222-4333-8444-${String(i).padStart(12, '0')}`);
  await Promise.all(ids.map(id => reviews.submit({ url, submission: submission({ id }) })));
  await Promise.all(ids.map(id => reviews.submit({ url, submission: submission({ id }) })));
  const lines = (await readFile(path.join(repo, 'workspace/card/decisions/inbox.jsonl'), 'utf8')).trim().split('\n');
  assert.equal(lines.length, 8);
});
