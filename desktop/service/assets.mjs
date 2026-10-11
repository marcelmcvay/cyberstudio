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

export class Assets {
  constructor(repo) { this.repo = repo; this.writes = Promise.resolve(); }
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
    try { return { ...JSON.parse(await readFile(file, 'utf8')), folder }; }
    catch { throw fail('asset.json could not be read.', 422); }
  }
  update(id, patch = {}) {
    const operation = this.writes.catch(() => {}).then(async () => {
      const { file, folder } = await this.locate(id);
      const asset = JSON.parse(await readFile(file, 'utf8'));
      const now = new Date().toISOString();
      let changed = false;
      if (patch.status !== undefined) {
        if (!STATUSES.includes(patch.status)) throw fail('Choose draft, review, approved or superseded.');
        asset.status = patch.status; changed = true;
        if (patch.status === 'approved') asset.review = { ...asset.review, approved_by: REVIEWER, approved_at: now };
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
      if (patch.note !== undefined) {
        const text = typeof patch.note === 'string' ? patch.note.trim() : '';
        if (!text || text.length > 2000) throw fail('Notes need 1 to 2,000 characters.');
        asset.review = { ...asset.review, notes: [...(Array.isArray(asset.review?.notes) ? asset.review.notes : []), { at: now, by: REVIEWER, text }] }; changed = true;
      }
      if (!changed) throw fail('Send status, title, tags or note.');
      asset.updated = now;
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
