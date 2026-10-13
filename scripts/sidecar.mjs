#!/usr/bin/env node
// Asset sidecars. Creates, refreshes and checks assets/<id>/asset.json
// against schemas/asset-v1.json. Built-ins only; shells out to gltf-transform.
//
//   node scripts/sidecar.mjs scan [--root DIR] [--dry-run] [--only ID]
//   node scripts/sidecar.mjs check [--root DIR]
//   node scripts/sidecar.mjs ledger-orphans [--root DIR] [--json]
//   node scripts/sidecar.mjs map <asset-id> <ledger-id>... [--root DIR]
//
// Root: --root, else CYBERSTUDIO_PROJECT_ROOT (env or .env), else cwd.
// Ownership: people own title, status, superseded_by, tags, cards (merged),
// ledger_ids, review, provenance.origin/inputs/link/imported_from and
// mesh.real_scale/origin/engine_ready. Everything else is recomputed.
import { createHash } from 'node:crypto';
import { closeSync, createReadStream, existsSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { KIT_ROOT, loadEnv, projectRoot } from './lib/env.mjs';
import { spawnTool } from './lib/spawn.mjs';
import { readRows } from './ledger.mjs';

const SCHEMA_PATH = join(KIT_ROOT, 'schemas', 'asset-v1.json');
const SCHEMA_ID = 'cyberstudio.asset/v1';
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff', '.exr', '.hdr', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const MESH_EXT = new Set(['.glb', '.gltf']);
const LFS_HEAD = 'version https://git-lfs.github.com/spec/v1';
// Tool-dump variants kept beside the cleaned output, e.g. name_tripo_1a9c48fd.glb.
const VARIANT_RE = /_(tripo|higgsfield|fal|meshy|raw|src|orig)(_|\.|$)/i;

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && !['dry-run', 'json'].includes(key)) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

function rootFrom(args) {
  loadEnv();
  if (typeof args.root === 'string') return resolve(args.root.replace(/^~(?=$|\/)/, homedir()));
  return projectRoot();
}

// ---------------------------------------------------------------- helpers

const posix = (p) => p.split(sep).join('/');
const ext = (p) => { const m = p.toLowerCase().match(/\.[^./]+$/); return m ? m[0] : ''; };
const iso = (d) => new Date(d).toISOString();

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return undefined; }
}

function walk(dir, base = dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.DS_Store' || ent.name === '.gitkeep') continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full, base));
    else if (ent.isFile()) out.push(posix(relative(base, full)));
  }
  return out.sort();
}

function sha256(file) {
  return new Promise((res, rej) => {
    const h = createHash('sha256');
    createReadStream(file).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej);
  });
}

function head(file, n) {
  const fd = openSync(file, 'r');
  try { const b = Buffer.alloc(n); const got = readSync(fd, b, 0, n, 0); return b.subarray(0, got); }
  finally { closeSync(fd); }
}

const isLfsPointer = (file) => statSync(file).size < 1024 && head(file, LFS_HEAD.length).toString('utf8') === LFS_HEAD;

function humanize(id) {
  return id.split('-').filter(Boolean).map((w) => (/\d/.test(w) || w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

// Image dimensions from headers: PNG, JPEG, WebP, GIF.
function imageInfo(file) {
  const b = head(file, 256 * 1024);
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), format: 'png' };
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), format: 'gif' };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), format: 'webp' };
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, format: 'webp' };
    if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff), format: 'webp' }; }
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), format: 'jpeg' };
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return undefined;
}

// ---------------------------------------------------------------- gltf-transform

function gt(args) {
  const r = spawnTool('gltf-transform', args, { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' } });
  if (r.error) throw new Error(r.error.code === 'ENOENT' ? 'gltf-transform not found on PATH' : r.error.message);
  return `${r.stdout || ''}${r.stderr || ''}`;
}

// Split `--format md` output into { SECTION: [ {col: value} ] }.
function mdSections(text) {
  const sections = {};
  let name = null, header = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^ ([A-Z][A-Z ]+)$/);
    if (h) { name = h[1].trim(); sections[name] = []; header = null; continue; }
    if (!name || !line.startsWith('|')) continue;
    const cells = line.slice(1, line.lastIndexOf('|')).split('|').map((c) => c.trim());
    if (!header) { header = cells; continue; }
    if (cells.every((c) => /^-+$/.test(c))) continue;
    sections[name].push(Object.fromEntries(header.map((k, i) => [k.replace(/[¹²³⁴⁵]/g, ''), cells[i] ?? ''])));
  }
  return sections;
}

const num = (s) => Number(String(s ?? '').replace(/,/g, '')) || 0;
const vec = (s) => String(s).split(',').map((v) => Number(v.trim()));
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

function meshStats(file) {
  const s = mdSections(gt(['inspect', file, '--format', 'md']));
  const scenes = s.SCENES || [], meshes = s.MESHES || [];
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const sc of scenes) {
    const a = vec(sc.bboxMin), b = vec(sc.bboxMax);
    if (a.length !== 3 || b.length !== 3 || [...a, ...b].some((v) => !Number.isFinite(v))) continue;
    min = min.map((v, i) => Math.min(v, a[i])); max = max.map((v, i) => Math.max(v, b[i]));
  }
  const triangles = meshes.filter((m) => m.mode === 'TRIANGLES').reduce((t, m) => t + num(m.glPrimitives) * Math.max(1, num(m.instances)), 0);
  const vertices = scenes.reduce((t, sc) => t + num(sc.uploadVertexCount), 0);
  const out = { triangles, vertices, materials: (s.MATERIALS || []).length, textures: (s.TEXTURES || []).length };
  if (Number.isFinite(min[0])) {
    const d = max.map((v, i) => v - min[i]); // glTF Y-up: [x, y, z]
    out.bbox_m = [round(d[0]), round(d[2]), round(d[1])]; // width, depth, height
  }
  return out;
}

function validate(file) {
  const s = mdSections(gt(['validate', file, '--format', 'md']));
  return { errors: (s.ERROR || []).length, warnings: (s.WARNING || []).length };
}

// ---------------------------------------------------------------- discovery

function assetFolders(root) {
  const out = [];
  const assets = join(root, 'assets');
  if (existsSync(assets)) {
    for (const e of readdirSync(assets, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')) out.push({ id: e.name, dir: join(assets, e.name), area: 'assets' });
    }
  }
  const inbox = join(root, 'inbox');
  if (existsSync(inbox)) {
    for (const e of readdirSync(inbox, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === 'attachments' || e.name.startsWith('.')) continue;
      const dir = join(inbox, e.name);
      const files = walk(dir).filter((f) => !f.startsWith('attachments/'));
      if (files.length) out.push({ id: e.name, dir, area: 'inbox' });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function ledgerByAsset(root) {
  const rows = readRows(join(root, 'ledger', 'spend.csv'));
  const by = new Map();
  for (const r of rows) {
    const id = (r.asset_id || '').trim();
    if (!by.has(id)) by.set(id, []);
    by.get(id).push(r);
  }
  return by;
}

// Workspace cards whose own folder (excluding sub-folders that belong to
// another card) mentions assets/<id>/ or <id>.glb / <id>.gltf.
function cardIndex(root) {
  const ws = readJson(join(root, 'workspace', 'workspace.json'));
  const ents = (ws?.entities || []).filter((e) => e && typeof e.id === 'string' && typeof e.folder === 'string');
  const folders = new Set(ents.map((e) => posix(e.folder).replace(/\/+$/, '')));
  const cards = [];
  for (const e of ents) {
    const folder = posix(e.folder).replace(/\/+$/, '');
    const dir = join(root, 'workspace', folder);
    if (!existsSync(dir)) continue;
    let text = '';
    const visit = (d, rel) => {
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        const r = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) { if (!folders.has(`${folder}/${r}`)) visit(join(d, ent.name), r); }
        else if (/\.(html|md|json)$/i.test(ent.name)) { try { text += readFileSync(join(d, ent.name), 'utf8') + '\n'; } catch {} }
      }
    };
    visit(dir, '');
    cards.push({ id: e.id, text });
  }
  return (assetId) => {
    const esc = assetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`assets/${esc}/|(?<![a-z0-9-])${esc}\\.(glb|gltf)\\b`, 'i');
    return cards.filter((c) => re.test(c.text)).map((c) => c.id).filter((id) => ID_RE.test(id));
  };
}

// ---------------------------------------------------------------- build

function roleFor(rel, ext_, imageKind) {
  const top = !rel.includes('/');
  const parts = rel.toLowerCase().split('/');
  const name = parts[parts.length - 1];
  if (parts[0] === 'receipts' || (ext_ === '.json' && parts.includes('jobs'))) return 'receipt';
  if (parts[0] === 'textures') return 'texture';
  if (parts[0] === 'lod' || parts[0] === 'lods') return 'lod';
  if (MESH_EXT.has(ext_)) {
    if (top && !VARIANT_RE.test(name)) return 'output';
    return 'source';
  }
  if (ext_ === '.blend') return 'source';
  if (IMAGE_EXT.has(ext_)) {
    if (parts[0] === 'refs' || parts[0] === 'references' || /[_-]ref(s)?(\.|_|-|$)/.test(name)) return 'reference';
    if (imageKind && top) return 'output';
    return 'preview';
  }
  if (VIDEO_EXT.has(ext_)) return top ? 'output' : 'preview';
  if (ext_ === '.json') return 'receipt';
  return 'source';
}

function kindFor(files) {
  const exts = files.map((f) => ext(f));
  if (files.some((f) => MESH_EXT.has(ext(f)) && !f.includes('/'))) return 'mesh';
  if (exts.some((e) => MESH_EXT.has(e))) return 'mesh';
  if (exts.some((e) => IMAGE_EXT.has(e))) return 'image';
  if (exts.some((e) => VIDEO_EXT.has(e))) return 'video';
  if (exts.some((e) => e === '.blend')) return 'scene';
  return 'document';
}

function basisFor(rows) {
  const vals = new Set(rows.map((r) => (r.cost_basis || '').trim()).filter(Boolean).map((v) => (v === 'observed' || v === 'actual' ? 'actual' : 'estimated')));
  if (!rows.length) return 'none';
  if (vals.size === 0) return 'none';
  return vals.size === 1 ? [...vals][0] : 'mixed';
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function jobFrom(r) {
  const j = { job_id: r.job_id, tool: r.tool || 'unknown' };
  if (r.model) j.model = r.model;
  if (r.ts && !Number.isNaN(Date.parse(r.ts))) j.ts = iso(r.ts);
  const c = Number(r.cost_usd);
  if (Number.isFinite(c) && c >= 0) j.cost_usd = c;
  if (r.note) j.note = clip(r.note, 300);
  return j;
}

// Canonical key order, so diffs stay quiet.
const ORDER = ['schema', 'id', 'title', 'kind', 'status', 'superseded_by', 'created', 'updated', 'tags', 'ledger_ids', 'cards', 'files', 'provenance', 'cost', 'mesh', 'image', 'review'];
const PROV_ORDER = ['origin', 'inputs', 'link', 'imported_from', 'jobs'];
const MESH_ORDER = ['triangles', 'vertices', 'materials', 'textures', 'bbox_m', 'origin', 'real_scale', 'validator', 'engine_ready'];
function ordered(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out) && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

async function buildSidecar({ id, dir, root, prev, ledger, cardsFor, now }) {
  const notes = [];
  const all = walk(dir).filter((f) => f !== 'asset.json' && !/\.blend1$/i.test(f) && !/\.blend@$/i.test(f) && !f.startsWith('attachments/'));
  if (!all.length) return { sidecar: null, notes: ['no files'] };
  const kind = prev?.kind && prev.kind !== kindFor(all) && ['texture', 'reference'].includes(prev.kind) ? prev.kind : kindFor(all);

  const files = [];
  let earliest = Infinity;
  const lfs = new Set();
  for (const rel of all) {
    const full = join(dir, rel);
    const st = statSync(full);
    earliest = Math.min(earliest, st.mtimeMs);
    const f = { path: posix(relative(root, full)), role: roleFor(rel, ext(rel), kind === 'image'), sha256: await sha256(full), bytes: st.size };
    const keepNote = prev?.files?.find((p) => p.path === f.path)?.note;
    if (isLfsPointer(full)) { lfs.add(rel); f.note = 'Git LFS pointer only; binary not fetched'; }
    else if (keepNote && keepNote !== 'Git LFS pointer only; binary not fetched') f.note = keepNote;
    files.push(f);
  }

  const ledgerIds = [...new Set([id, ...(prev?.ledger_ids || [])])];
  const rows = ledgerIds.flatMap((lid) => ledger.get(lid) || []).sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  for (const r of rows) if (r.ts && !Number.isNaN(Date.parse(r.ts))) earliest = Math.min(earliest, Date.parse(r.ts));
  const jobs = rows.filter((r) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(r.job_id || '')).map(jobFrom);
  if (jobs.length !== rows.length) notes.push(`${rows.length - jobs.length} ledger row(s) skipped: job_id empty or invalid`);
  const usd = round(rows.reduce((t, r) => t + (Number(r.cost_usd) || 0), 0), 4);

  const s = {
    schema: SCHEMA_ID,
    id,
    title: prev?.title || humanize(id),
    kind,
    status: prev?.status || 'draft',
    superseded_by: prev?.superseded_by,
    created: prev?.created || iso(Number.isFinite(earliest) ? earliest : now),
    updated: prev?.updated || iso(now),
    tags: prev?.tags,
    ledger_ids: prev?.ledger_ids,
    cards: undefined,
    files,
    provenance: ordered({
      origin: prev?.provenance?.origin || (rows.length ? 'generated' : 'manual'),
      inputs: prev?.provenance?.inputs,
      link: prev?.provenance?.link,
      imported_from: prev?.provenance?.imported_from,
      jobs: jobs.length ? jobs : undefined,
    }, PROV_ORDER),
    cost: { usd, jobs: rows.length, basis: basisFor(rows) },
    review: prev?.review,
  };

  const cards = [...new Set([...(prev?.cards || []), ...cardsFor(id)])].sort();
  if (cards.length) s.cards = cards;

  if (kind === 'mesh') {
    const outputs = files.filter((f) => f.role === 'output' && MESH_EXT.has(ext(f.path)));
    const primary = outputs.find((f) => f.path.endsWith(`/${id}.glb`)) || outputs.find((f) => f.path.endsWith(`/${id}.gltf`)) || outputs[0]
      || files.find((f) => MESH_EXT.has(ext(f.path)));
    const human = {};
    for (const k of ['origin', 'real_scale', 'engine_ready']) if (prev?.mesh?.[k] !== undefined) human[k] = prev.mesh[k];
    let tool = {};
    if (primary) {
      const rel = posix(relative(dir, join(root, primary.path)));
      if (lfs.has(rel)) notes.push(`${primary.path} is a Git LFS pointer; mesh stats skipped`);
      else {
        try {
          tool = meshStats(join(root, primary.path));
          const v = validate(join(root, primary.path));
          const pv = prev?.mesh?.validator;
          const prevSha = prev?.files?.find((f) => f.path === primary.path)?.sha256;
          const same = pv && pv.errors === v.errors && pv.warnings === v.warnings && prevSha === primary.sha256 && pv.checked;
          tool.validator = { ...v, checked: same ? pv.checked : iso(now) };
        } catch (e) { notes.push(`mesh stats failed: ${e.message}`); }
      }
      if (outputs.length > 1) notes.push(`primary mesh ${primary.path} (of ${outputs.length} outputs)`);
    }
    const mesh = ordered({ ...tool, ...human }, MESH_ORDER);
    if (Object.keys(mesh).length) s.mesh = mesh;
  }

  if (kind === 'image') {
    const img = files.find((f) => f.role === 'output' && IMAGE_EXT.has(ext(f.path))) || files.find((f) => IMAGE_EXT.has(ext(f.path)));
    if (img && !lfs.has(posix(relative(dir, join(root, img.path))))) {
      const info = imageInfo(join(root, img.path));
      if (info && info.width > 0 && info.height > 0) s.image = info;
    }
  }

  // Bump `updated` only when something other than `updated` changed.
  const out = ordered(s, ORDER);
  if (prev) {
    const strip = (o) => JSON.stringify({ ...o, updated: undefined });
    out.updated = strip(out) === strip(ordered(prev, ORDER)) ? prev.updated : iso(now);
  }
  return { sidecar: out, notes };
}

// ---------------------------------------------------------------- validator
// Covers exactly the keywords schemas/asset-v1.json uses. Unknown keywords
// are reported so a schema change can't silently go unchecked.

const KNOWN = new Set(['$schema', '$id', 'title', 'description', '$defs', 'type', 'const', 'enum', 'required', 'properties',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'format', '$ref']);

function typeOk(t, v) {
  switch (t) {
    case 'object': return v !== null && typeof v === 'object' && !Array.isArray(v);
    case 'array': return Array.isArray(v);
    case 'string': return typeof v === 'string';
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    default: return false;
  }
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/;

function validateNode(schema, v, path, root, errs) {
  if (schema.$ref) {
    const m = schema.$ref.match(/^#\/\$defs\/(.+)$/);
    if (!m || !root.$defs?.[m[1]]) { errs.push(`${path}: unresolved $ref ${schema.$ref}`); return; }
    validateNode(root.$defs[m[1]], v, path, root, errs);
  }
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) errs.push(`${path}: validator does not support keyword "${k}"`);
  if (schema.type && !typeOk(schema.type, v)) { errs.push(`${path}: expected ${schema.type}`); return; }
  if ('const' in schema && v !== schema.const) errs.push(`${path}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${path}: ${JSON.stringify(v)} not in [${schema.enum.join(', ')}]`);
  if (typeof v === 'string') {
    if (schema.minLength !== undefined && [...v].length < schema.minLength) errs.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && [...v].length > schema.maxLength) errs.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(v)) errs.push(`${path}: does not match ${schema.pattern}`);
    if (schema.format === 'date-time' && (!DATE_TIME.test(v) || Number.isNaN(Date.parse(v)))) errs.push(`${path}: not an RFC 3339 date-time`);
    if (schema.format === 'uri') { try { new URL(v); } catch { errs.push(`${path}: not a URI`); } }
  }
  if (typeof v === 'number' && schema.minimum !== undefined && v < schema.minimum) errs.push(`${path}: below ${schema.minimum}`);
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && v.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(v.map((x) => JSON.stringify(x))).size !== v.length) errs.push(`${path}: items not unique`);
    if (schema.items) v.forEach((x, i) => validateNode(schema.items, x, `${path}[${i}]`, root, errs));
  }
  if (typeOk('object', v)) {
    for (const r of schema.required || []) if (!(r in v)) errs.push(`${path}: missing required "${r}"`);
    const props = schema.properties || {};
    for (const [k, x] of Object.entries(v)) {
      if (props[k]) validateNode(props[k], x, path === '$' ? k : `${path}.${k}`, root, errs);
      else if (schema.additionalProperties === false) errs.push(`${path}: unexpected property "${k}"`);
    }
  }
}

export function validateSidecar(doc, schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))) {
  const errs = [];
  validateNode(schema, doc, '$', schema, errs);
  return errs;
}

// ---------------------------------------------------------------- commands

function writeJson(file, obj) { writeFileSync(file, JSON.stringify(obj, null, 2) + '\n'); }

async function cmdScan(args) {
  const root = rootFrom(args);
  const dry = !!args['dry-run'];
  const ledger = ledgerByAsset(root);
  const cardsFor = cardIndex(root);
  const now = Date.now();
  const folders = assetFolders(root).filter((f) => !args.only || f.id === args.only);
  console.log(`sidecar scan  root ${root}${dry ? '  (dry run)' : ''}`);
  if (!folders.length) { console.log('no asset folders found'); return 0; }
  let bad = 0;
  for (const f of folders) {
    if (!ID_RE.test(f.id)) { console.log(`  skip ${f.area}/${f.id}: folder name is not a valid id`); bad++; continue; }
    const file = join(f.dir, 'asset.json');
    const prev = existsSync(file) ? readJson(file) : undefined;
    if (existsSync(file) && !prev) { console.log(`  skip ${f.area}/${f.id}: asset.json is not valid JSON; fix it by hand`); bad++; continue; }
    const { sidecar, notes } = await buildSidecar({ id: f.id, dir: f.dir, root, prev, ledger, cardsFor, now });
    if (!sidecar) { console.log(`  skip ${f.area}/${f.id}: ${notes.join('; ')}`); continue; }
    const errs = validateSidecar(sidecar);
    const changed = !prev || JSON.stringify(prev) !== JSON.stringify(sidecar);
    const verb = !prev ? 'create' : changed ? 'update' : 'same  ';
    if (!dry && changed) writeJson(file, sidecar);
    console.log(`  ${verb} ${posix(relative(root, file))}  ${summary(sidecar)}`);
    for (const n of notes) console.log(`         note: ${n}`);
    for (const e of errs) console.log(`         SCHEMA: ${e}`);
    if (errs.length) bad++;
  }
  return bad ? 1 : 0;
}

function summary(s) {
  const bits = [s.kind, s.status, `$${(s.cost?.usd ?? 0).toFixed(2)} / ${s.cost?.jobs ?? 0} jobs (${s.cost?.basis ?? 'none'})`, `${s.files?.length ?? 0} files`];
  if (s.mesh?.triangles !== undefined) bits.push(`${s.mesh.triangles.toLocaleString('en-US')} tris`);
  if (s.mesh?.bbox_m) bits.push(`${s.mesh.bbox_m.map((v) => v.toFixed(2)).join(' x ')} m`);
  if (s.mesh?.validator) bits.push(`gltf ${s.mesh.validator.errors}E/${s.mesh.validator.warnings}W`);
  if (s.image) bits.push(`${s.image.width}x${s.image.height} ${s.image.format}`);
  if (s.cards?.length) bits.push(`cards: ${s.cards.join(', ')}`);
  return bits.join('  ');
}

function loadSidecars(root) {
  return assetFolders(root).map((f) => ({ ...f, file: join(f.dir, 'asset.json') })).filter((f) => existsSync(f.file));
}

function cmdCheck(args) {
  const root = rootFrom(args);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const list = loadSidecars(root);
  const missing = assetFolders(root).filter((f) => !existsSync(join(f.dir, 'asset.json')));
  console.log(`sidecar check  root ${root}  schema ${posix(relative(KIT_ROOT, SCHEMA_PATH))}`);
  let failed = 0;
  const ids = new Set(list.map((f) => f.id));
  for (const f of list) {
    const rel = posix(relative(root, f.file));
    let doc;
    try { doc = JSON.parse(readFileSync(f.file, 'utf8')); } catch (e) { console.log(`  FAIL ${rel}: invalid JSON (${e.message})`); failed++; continue; }
    const errs = validateSidecar(doc, schema);
    if (doc.id !== f.id) errs.push(`id "${doc.id}" does not match folder "${f.id}"`);
    if (doc.superseded_by && !ids.has(doc.superseded_by)) errs.push(`superseded_by "${doc.superseded_by}" has no sidecar`);
    if (doc.status === 'superseded' && !doc.superseded_by) errs.push('status superseded without superseded_by');
    const warns = [];
    for (const file of Array.isArray(doc.files) ? doc.files : []) {
      const p = join(root, file.path || '');
      if (!existsSync(p)) warns.push(`missing file ${file.path}`);
      else if (statSync(p).size !== file.bytes) warns.push(`size changed ${file.path} (run scan)`);
    }
    if (doc.kind === 'mesh' && !doc.mesh?.triangles) warns.push('mesh without stats');
    if (errs.length) failed++;
    console.log(`  ${errs.length ? 'FAIL' : warns.length ? 'warn' : 'ok  '} ${rel}  ${summary(doc)}`);
    for (const e of errs) console.log(`         error: ${e}`);
    for (const w of warns) console.log(`         warn: ${w}`);
  }
  for (const f of missing) console.log(`  warn ${f.area}/${f.id}/ has no asset.json (run scan)`);
  console.log(`${list.length} sidecar(s), ${failed} failing`);
  return failed ? 1 : 0;
}

// Quick, quiet summary for scripts/doctor.
export function sidecarHealth(root) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const folders = assetFolders(root);
  const list = loadSidecars(root);
  let failing = 0;
  for (const f of list) {
    const doc = readJson(f.file);
    if (!doc || validateSidecar(doc, schema).length || doc.id !== f.id) failing++;
  }
  return { folders: folders.length, sidecars: list.length, missing: folders.length - list.length, failing };
}

function cmdOrphans(args) {
  const root = rootFrom(args);
  const covered = new Set();
  for (const f of loadSidecars(root)) {
    const doc = readJson(f.file);
    covered.add(f.id);
    for (const l of doc?.ledger_ids || []) covered.add(l);
  }
  const orphans = [];
  for (const [id, rows] of ledgerByAsset(root)) {
    if (covered.has(id)) continue;
    orphans.push({ asset_id: id || '(blank)', rows: rows.length, cost_usd: round(rows.reduce((t, r) => t + (Number(r.cost_usd) || 0), 0), 4), first: rows[0]?.ts, last: rows[rows.length - 1]?.ts });
  }
  orphans.sort((a, b) => b.cost_usd - a.cost_usd);
  if (args.json) { console.log(JSON.stringify(orphans, null, 2)); return 0; }
  console.log(`ledger orphans  root ${root}`);
  if (!orphans.length) { console.log('  none: every ledger asset_id is covered by a sidecar'); return 0; }
  for (const o of orphans) console.log(`  ${o.asset_id.padEnd(24)} ${String(o.rows).padStart(3)} rows  $${o.cost_usd.toFixed(4)}`);
  const total = orphans.reduce((t, o) => t + o.cost_usd, 0);
  console.log(`${orphans.length} orphan id(s), $${total.toFixed(4)} unmapped. Map one with: node scripts/sidecar.mjs map <asset-id> <ledger-id>`);
  return 0;
}

async function cmdMap(args) {
  const root = rootFrom(args);
  const [assetId, ...ledgerIds] = args._.slice(1);
  if (!assetId || !ledgerIds.length) { console.error('usage: sidecar.mjs map <asset-id> <ledger-id>...'); return 2; }
  const bad = ledgerIds.filter((l) => !ID_RE.test(l));
  if (bad.length) { console.error(`invalid ledger id(s): ${bad.join(', ')}`); return 2; }
  const f = assetFolders(root).find((x) => x.id === assetId);
  const file = f && join(f.dir, 'asset.json');
  if (!file || !existsSync(file)) { console.error(`no sidecar for ${assetId}; run scan first`); return 1; }
  const doc = readJson(file);
  doc.ledger_ids = [...new Set([...(doc.ledger_ids || []), ...ledgerIds.filter((l) => l !== assetId)])].sort();
  writeJson(file, doc);
  console.log(`${assetId}: ledger_ids = ${doc.ledger_ids.join(', ')}`);
  return cmdScan({ ...args, only: assetId });
}

const USAGE = `usage: node scripts/sidecar.mjs <scan|check|ledger-orphans|map> [--root DIR] [--dry-run]`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];
  if (cmd === 'scan') return cmdScan(args);
  if (cmd === 'check') return cmdCheck(args);
  if (cmd === 'ledger-orphans' || cmd === 'orphans') return cmdOrphans(args);
  if (cmd === 'map') return cmdMap(args);
  console.error(USAGE);
  return 2;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('sidecar.mjs')) {
  main().then((code) => process.exit(code ?? 0)).catch((e) => { console.error(`sidecar: ${e.message}`); process.exit(1); });
}
