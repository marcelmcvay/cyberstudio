import path from 'node:path';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, realpath } from 'node:fs/promises';

// Report review submissions. A report tab may declare, in workspace.json,
//   "review": { "form": "<id>", "inbox": "<path relative to the card folder>.jsonl", "owner": "<who processes it>" }
// The report never chooses the destination and never receives an API token:
// the UI resolves the frame's own content URL to its registered step, shows a
// trusted confirmation, and only then calls submit(). Each submission is one
// appended JSON line; resending the same id returns the first receipt.
const SCHEMA = 'cyberstudio.review-submission/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const QUESTION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const FORM = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const HEX = /^[a-f0-9]{64}$/;
const DECISIONS = new Set(['approve', 'request-edits']);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, max, name) => {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw fail(`${name} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw fail(`${name} is longer than ${max} characters.`);
  return trimmed;
};

export class ReviewSubmissions {
  constructor({ repo, files, registry }) { this.repo = repo; this.files = files; this.registry = registry; this.writes = Promise.resolve(); }

  async target(url, form) {
    if (typeof url !== 'string' || url.length > 8192) throw fail('Choose a report.');
    if (typeof form !== 'string' || !FORM.test(form)) throw fail('This report has no valid review form id.');
    const { file } = await this.files.resolveContentUrl(url);
    const repo = await realpath(this.repo);
    const registry = await this.registry();
    for (const entity of registry.entities || []) {
      if (typeof entity?.folder !== 'string') continue;
      const folder = path.resolve(repo, 'workspace', entity.folder);
      for (const [index, step] of (entity.steps || []).entries()) {
        const review = step?.review;
        if (!review || typeof review !== 'object' || review.form !== form || typeof step.path !== 'string' || typeof review.inbox !== 'string') continue;
        let served; try { served = await realpath(path.resolve(folder, step.path)); } catch { continue; }
        if (served !== file) continue;
        const inbox = path.resolve(folder, review.inbox);
        const relative = path.relative(repo, inbox);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || path.extname(inbox).toLowerCase() !== '.jsonl' || relative.split(path.sep).some(part => part === '.git' || part === 'node_modules'))
          throw fail('This review inbox is not a .jsonl file inside the project.', 403);
        return { entity: String(entity.id), step: index, stepName: String(step.name || ''), form, owner: text(review.owner, 120, 'Owner'), inbox, destination: relative.split(path.sep).join('/'), report: file, repo };
      }
    }
    throw fail('This report has no registered review inbox.', 404);
  }

  async describe({ url, form } = {}) {
    const target = await this.target(url, form);
    return { form: target.form, owner: target.owner, destination: target.destination, entity: target.entity, step: target.stepName };
  }

  normalize(submission) {
    if (!submission || typeof submission !== 'object') throw fail('Nothing to send.');
    if (Buffer.byteLength(JSON.stringify(submission)) > 64 * 1024) throw fail('This submission is larger than 64 KB.');
    if (typeof submission.id !== 'string' || !UUID.test(submission.id)) throw fail('This submission has no valid id.');
    if (!Array.isArray(submission.decisions) || !submission.decisions.length) throw fail('Choose at least one decision before sending.');
    if (submission.decisions.length > 50) throw fail('Send at most 50 decisions at once.');
    const seen = new Set();
    const decisions = submission.decisions.map(item => {
      if (!item || typeof item !== 'object') throw fail('A decision is malformed.');
      const questionId = item.questionId;
      if (typeof questionId !== 'string' || !QUESTION.test(questionId) || seen.has(questionId)) throw fail('Each decision needs one valid, unique question id.');
      seen.add(questionId);
      if (!DECISIONS.has(item.decision)) throw fail(`${questionId}: choose Approve or Request edits.`);
      if (typeof item.revision !== 'string' || !HEX.test(item.revision)) throw fail(`${questionId}: the reviewed revision is missing.`);
      const note = text(item.note, 4000, `${questionId} note`);
      if (item.decision === 'request-edits' && note.replace(/\s/g, '').length < 3) throw fail(`${questionId}: say what should change.`);
      const references = Array.isArray(item.references) ? item.references.slice(0, 20).map(ref => {
        const refPath = text(ref?.path, 300, 'Reference path');
        if (!refPath || typeof ref.sha256 !== 'string' || !HEX.test(ref.sha256)) throw fail(`${questionId}: a reference is malformed.`);
        return { path: refPath, sha256: ref.sha256 };
      }) : [];
      return { questionId, title: text(item.title, 200, 'Title'), decision: item.decision, note, revision: item.revision, scope: text(item.scope, 2000, 'Scope'), references };
    });
    return { id: submission.id, form: submission.form, decisions, draftedAt: text(submission.draftedAt, 40, 'Draft time') };
  }

  async submit({ url, submission } = {}) {
    const clean = this.normalize(submission);
    const target = await this.target(url, clean.form);
    const run = this.writes.then(async () => {
      await mkdir(path.dirname(target.inbox), { recursive: true });
      const folder = await realpath(path.dirname(target.inbox));
      if (path.relative(target.repo, folder).startsWith('..')) throw fail('This review inbox is not inside the project.', 403);
      let existing = '';
      try { existing = await readFile(target.inbox, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      for (const line of existing.split('\n')) {
        if (!line.includes(clean.id)) continue;
        try {
          const record = JSON.parse(line);
          if (record.id === clean.id) return { status: 'recorded', duplicate: true, id: record.id, receivedAt: record.receivedAt, destination: target.destination, owner: record.owner, count: record.decisions.length };
        } catch { /* A damaged line is left for the owner to inspect. */ }
      }
      const report = await readFile(target.report);
      const record = {
        schema: SCHEMA, id: clean.id, receivedAt: new Date().toISOString(), form: clean.form,
        entity: target.entity, step: target.step, stepName: target.stepName, owner: target.owner,
        report: { path: path.relative(target.repo, target.report).split(path.sep).join('/'), sha256: createHash('sha256').update(report).digest('hex') },
        confirmedInWorkspace: true, draftedAt: clean.draftedAt, decisions: clean.decisions,
      };
      const line = JSON.stringify(record) + '\n';
      await appendFile(target.inbox, line, { encoding: 'utf8', flag: 'a' });
      return { status: 'recorded', duplicate: false, id: record.id, receivedAt: record.receivedAt, destination: target.destination, owner: target.owner, count: record.decisions.length, sha256: createHash('sha256').update(line).digest('hex') };
    });
    this.writes = run.catch(() => {});
    return run;
  }
}
