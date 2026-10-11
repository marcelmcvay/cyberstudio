import { readdir, readFile, writeFile, rename, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { realFile } from './util.mjs';

// asset.json sidecars (schemas/asset-v1.json) live in assets/<id>/ and inbox/<id>/.
// Tools fill them; people change status, title, tags and review notes from the Properties panel.
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const FOLDERS = ['assets', 'inbox'];
const STATUSES = ['draft', 'review', 'approved', 'superseded'];
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
const REVIEWER = 'Marcel';
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const files = asset => Array.isArray(asset.files) ? asset.files.filter(file => typeof file?.path === 'string') : [];
const brief = (asset, folder) => {
  const list = files(asset);
  const output = list.find(file => file.role === 'output')?.path || list[0]?.path || null;
  // Textures are images too, but a texture map makes a poor thumbnail.
  const preview = ['preview', 'reference', 'output'].map(role => list.find(file => file.role === role && IMAGE.test(file.path))).find(Boolean)?.path || null;
  return {
    id: asset.id, title: asset.title || asset.id, kind: asset.kind || null, status: asset.status || 'draft', folder,
    cost: { usd: Number(asset.cost?.usd) || 0, jobs: Number(asset.cost?.jobs) || 0 },
    cards: Array.isArray(asset.cards) ? asset.cards : [], tags: Array.isArray(asset.tags) ? asset.tags : [],
    output, preview, updated: asset.updated || asset.created || null,
  };
};

// Review rules. Tools never approve: only these people actions move status.
export const NOTE_EDIT_MS = 10 * 60 * 1000;
export const UNDO_MS = 5 * 60 * 1000;
const HISTORY_MAX = 100;
const noteAt = (notes, index) => {
  if (!Number.isInteger(index) || index < 0 || index >= notes.length) throw fail('That note was not found.', 404);
  const note = notes[index];
  if (note?.by !== REVIEWER) throw fail('Only the author can change a note.', 403);
  return note;
};
const editable = (note, now) => {
  if (note.retracted_at) throw fail('That note was retracted.', 409);
  const age = now - Date.parse(note.at);
  if (!(age >= -60000 && age <= NOTE_EDIT_MS)) throw fail('Notes can be edited or deleted for 10 minutes. Retract it instead.', 409);
};
const noteText = value => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 2000) throw fail('Notes need 1 to 2,000 characters.');
  return text;
};

// Applies one Properties PATCH to a parsed sidecar. Returns true when something changed.
export function applyPatch(asset, patch = {}, date = new Date()) {
  const now = date.toISOString();
  const review = () => { asset.review = asset.review && typeof asset.review === 'object' ? asset.review : {}; return asset.review; };
  const notes = () => { const r = review(); r.notes = Array.isArray(r.notes) ? r.notes : []; return r.notes; };
  const known = ['status', 'undo', 'title', 'tags', 'cards', 'note', 'noteEdit', 'noteDelete', 'noteRetract'];
  if (!patch || typeof patch !== 'object' || !Object.keys(patch).some(key => known.includes(key) && patch[key] !== undefined)) throw fail('Send status, title, tags, cards or a note change.');
  let changed = false;
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw fail('Choose draft, review, approved or superseded.');
    const from = STATUSES.includes(asset.status) ? asset.status : 'draft';
    if (patch.undo === true) {
      // Undo removes the last change instead of stacking a new one, and restores what it moved.
      const history = Array.isArray(asset.review?.history) ? asset.review.history : [];
      const last = history[history.length - 1];
      if (!last || last.status !== from || last.from !== patch.status) throw fail('Nothing to undo for this asset.', 409);
      if (date - Date.parse(last.at) > UNDO_MS) throw fail('That change is too old to undo. Set the status again instead.', 409);
      history.pop();
      const r = review();
      if (!history.length) delete r.history;
      if (patch.status === 'approved' && last.approved_by) { r.approved_by = last.approved_by; r.approved_at = last.approved_at; }
      else if (patch.status === 'approved') { r.approved_by = REVIEWER; r.approved_at = now; }
      else { delete r.approved_by; delete r.approved_at; }
      asset.status = patch.status; changed = true;
    } else if (patch.status !== from) {
      const r = review();
      const entry = { at: now, by: REVIEWER, status: patch.status, from };
      if (from === 'approved') {
        // Archive the approval in the history entry so the sidecar never claims an approval it lost.
        if (r.approved_by) entry.approved_by = r.approved_by;
        if (r.approved_at) entry.approved_at = r.approved_at;
        delete r.approved_by; delete r.approved_at;
      }
      if (patch.status === 'approved') { r.approved_by = REVIEWER; r.approved_at = now; }
      r.history = [...(Array.isArray(r.history) ? r.history : []), entry].slice(-HISTORY_MAX);
      asset.status = patch.status; changed = true;
    }
  }
  if (patch.title !== undefined) {
    const title = typeof patch.title === 'string' ? patch.title.trim() : '';
    if (!title || title.length > 120) throw fail('Titles need 1 to 120 characters.');
    asset.title = title; changed = true;
  }
  if (patch.tags !== undefined) {
    if (!Array.isArray(patch.tags) || patch.tags.length > 50 || patch.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 40)) throw fail('Tags are short text values of up to 40 characters.');
    asset.tags = [...new Set(patch.tags.map(tag => tag.trim()))]; changed = true;
  }
  if (patch.cards !== undefined) {
    if (!Array.isArray(patch.cards) || patch.cards.length > 100 || patch.cards.some(card => typeof card !== 'string' || !ID.test(card))) throw fail('Cards are workspace card ids.');
    asset.cards = [...new Set(patch.cards)]; changed = true;
  }
  if (patch.note !== undefined) {
    notes().push({ at: now, by: REVIEWER, text: noteText(patch.note) }); changed = true;
  }
  if (patch.noteEdit !== undefined) {
    const note = noteAt(notes(), patch.noteEdit?.index);
    editable(note, date);
    const text = noteText(patch.noteEdit?.text);
    if (text !== note.text) { note.text = text; note.edited_at = now; changed = true; }
  }
  if (patch.noteDelete !== undefined) {
    const list = notes();
    editable(noteAt(list, patch.noteDelete), date);
    list.splice(patch.noteDelete, 1); changed = true;
  }
  if (patch.noteRetract !== undefined) {
    const note = noteAt(notes(), patch.noteRetract);
    if (!note.retracted_at) { note.retracted_at = now; changed = true; }
  }
  if (asset.review && !asset.review.notes?.length) delete asset.review.notes;
  if (asset.review && !Object.keys(asset.review).length) delete asset.review;
  return changed;
}

// Receipts are free-form JSON. A receipt that names exactly one of the asset's jobs and one of
// its image files maps that job to the image, so Properties can show the job's output.
export function receiptPreviews(asset, receipts) {
  const jobs = (asset.provenance?.jobs || []).map(job => job?.job_id).filter(value => typeof value === 'string');
  const images = files(asset).filter(file => IMAGE.test(file.path) && file.role !== 'texture');
  const map = {};
  for (const text of receipts) {
    const named = jobs.filter(job => text.includes(job));
    if (named.length !== 1) continue;
    const image = images.find(file => text.includes(file.path) || text.includes(file.path.split('/').pop()));
    if (image && !map[named[0]]) map[named[0]] = image.path;
  }
  return map;
}

export class Assets {
  // `now` is injectable so tests can step through the note edit window.
  constructor(repo, { now = () => new Date() } = {}) { this.repo = repo; this.now = now; this.writes = Promise.resolve(); }
  async list() {
    const seen = new Set(), assets = [], problems = [];
    for (const folder of FOLDERS) {
      const entries = await readdir(path.join(this.repo, folder), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || !ID.test(entry.name) || seen.has(entry.name)) continue;
        const located = await this.locate(entry.name, folder).catch(() => null);
        if (!located) continue;
        try {
          const asset = JSON.parse(await readFile(located.file, 'utf8'));
          if (asset?.id !== entry.name) throw new Error('id does not match its folder');
          seen.add(entry.name); assets.push(brief(asset, folder));
        } catch (error) { problems.push({ path: `${folder}/${entry.name}/asset.json`, message: String(error.message || error).slice(0, 200) }); }
      }
    }
    return { assets: assets.sort((a, b) => String(b.updated).localeCompare(String(a.updated))), problems };
  }
  async locate(id, only) {
    if (typeof id !== 'string' || !ID.test(id)) throw fail('Asset ids use lowercase letters, numbers and dashes.');
    for (const folder of only ? [only] : FOLDERS) {
      // realFile rejects paths and links that leave the repository.
      const found = await realFile(this.repo, `${folder}/${id}/asset.json`).catch(error => { if (error.status === 403) throw error; return null; });
      if (found?.info.isFile()) return { file: found.file, folder };
    }
    throw fail('Asset was not found.', 404);
  }
  async read(id) {
    const { file, folder } = await this.locate(id);
    let asset;
    try { asset = JSON.parse(await readFile(file, 'utf8')); }
    catch { throw fail('asset.json could not be read.', 422); }
    const texts = [];
    for (const item of files(asset).filter(entry => entry.role === 'receipt' && /\.json$/i.test(entry.path)).slice(0, 40)) {
      const found = await realFile(this.repo, item.path).catch(() => null);
      if (found?.info.isFile() && found.info.size <= 256 * 1024) texts.push(await readFile(found.file, 'utf8').catch(() => ''));
    }
    // job_previews is derived on read and never written to the sidecar.
    return { ...asset, folder, job_previews: receiptPreviews(asset, texts) };
  }
  update(id, patch = {}) {
    const operation = this.writes.catch(() => {}).then(async () => {
      const { file, folder } = await this.locate(id);
      const asset = JSON.parse(await readFile(file, 'utf8'));
      const changed = applyPatch(asset, patch, this.now());
      if (!changed) return { ...asset, folder };
      asset.updated = this.now().toISOString();
      const temp = `${file}.${randomBytes(5).toString('hex')}.tmp`;
      const mode = (await stat(file)).mode & 0o777;
      try { await writeFile(temp, JSON.stringify(asset, null, 2) + '\n', { mode }); await rename(temp, file); }
      finally { await unlink(temp).catch(() => {}); }
      return { ...asset, folder };
    });
    this.writes = operation;
    return operation;
  }
}
