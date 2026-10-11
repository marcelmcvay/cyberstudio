// Inbox intake: files and share links become inbox/<id>/ folders with an
// asset.json sidecar (schemas/asset-v1.json). Shared by scripts/intake.mjs and
// the desktop service. Node built-ins only, so the CLI runs without installs.
import path from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { within } from './util.mjs';

export const MAX_LINK_BYTES = 500 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const KINDS = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'avif', 'svg', 'psd', 'exr', 'hdr', 'tga'],
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'],
  mesh: ['glb', 'gltf', 'fbx', 'obj', 'usd', 'usda', 'usdc', 'usdz', 'stl', 'ply', 'blend', '3ds', 'dae', 'abc'],
  document: ['pdf', 'doc', 'docx', 'md', 'txt', 'rtf', 'ppt', 'pptx', 'key', 'pages', 'xls', 'xlsx', 'csv', 'odt', 'html'],
};
export function kindFor(name) {
  const extension = path.extname(String(name)).slice(1).toLowerCase();
  for (const [kind, list] of Object.entries(KINDS)) if (list.includes(extension)) return kind;
  return 'reference';
}

export function slug(value) {
  return String(value).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 56).replace(/-+$/, '') || 'asset';
}

export function safeFilename(value, fallback = 'download') {
  const name = String(value || '').replace(/[\x00-\x1f\x7f/\\:*?"<>|]+/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120);
  return name || fallback;
}

// Share URL -> { link: what we record, download: what we fetch, provider, folder }.
// The recorded link never carries signatures or tokens: query strings are
// dropped except Dropbox's dl and rlkey (rlkey is part of the share link
// itself; modern Dropbox links do not open without it).
export function normalizeLink(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw fail('Paste a full link starting with https://.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw fail('Paste an http or https link.');
  url.username = ''; url.password = ''; url.hash = '';
  const host = url.hostname.toLowerCase();
  if (host === 'dropbox.com' || host.endsWith('.dropbox.com')) {
    if (host !== 'dl.dropboxusercontent.com') url.hostname = 'www.dropbox.com';
    const keep = new URLSearchParams();
    for (const key of ['rlkey', 'dl']) if (url.searchParams.has(key)) keep.set(key, url.searchParams.get(key));
    url.search = keep.toString();
    const link = url.toString();
    const folder = /^\/(sh|scl\/fo)\//.test(url.pathname);
    const download = new URL(link);
    if (host !== 'dl.dropboxusercontent.com') download.searchParams.set('dl', '1');
    return { link, download: download.toString(), provider: 'dropbox', folder };
  }
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    if (/\/folders\//.test(url.pathname)) throw fail('Google Drive folder links cannot be downloaded here. Share the files, or zip the folder first.');
    const id = url.pathname.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{10,})/)?.[1] || url.searchParams.get('id');
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) throw fail('This Google link has no file id. Use the "Copy link" link of a single file.');
    if (host === 'docs.google.com') throw fail('Google Docs, Sheets and Slides need an export. Download as PDF and drop the file in.');
    return { link: `https://drive.google.com/file/d/${id}/view`, download: `https://drive.google.com/uc?export=download&id=${id}`, provider: 'drive', folder: false, driveId: id };
  }
  const download = url.toString();
  url.search = '';
  return { link: url.toString(), download, provider: 'web', folder: false };
}

export function contentDispositionName(header) {
  if (!header) return '';
  const star = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)?'[^']*'([^;]+)/);
  if (star) { try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch { /* fall through */ } }
  const plain = header.match(/filename\s*=\s*("([^"]*)"|[^;]+)/i);
  return plain ? (plain[2] ?? plain[1]).trim() : '';
}

// Width/height from a file header. Cheap: PNG, GIF, BMP, WebP and JPEG only.
export function imageSize(data) {
  if (data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), format: 'png' };
  if (data.length >= 10 && /^GIF8[79]a/.test(data.subarray(0, 6).toString('latin1'))) return { width: data.readUInt16LE(6), height: data.readUInt16LE(8), format: 'gif' };
  if (data.length >= 26 && data.subarray(0, 2).toString('latin1') === 'BM') return { width: data.readInt32LE(18), height: Math.abs(data.readInt32LE(22)), format: 'bmp' };
  if (data.length >= 30 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') {
    const chunk = data.subarray(12, 16).toString('latin1');
    if (chunk === 'VP8X') return { width: 1 + data.readUIntLE(24, 3), height: 1 + data.readUIntLE(27, 3), format: 'webp' };
    if (chunk === 'VP8L') { const bits = data.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), format: 'webp' }; }
    if (chunk === 'VP8 ') return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff, format: 'webp' };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let at = 2;
    while (at + 9 < data.length) {
      if (data[at] !== 0xff) { at++; continue; }
      const marker = data[at + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) { at += marker === 0xff ? 1 : 2; continue; }
      const length = data.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: data.readUInt16BE(at + 7), height: data.readUInt16BE(at + 5), format: 'jpeg' };
      at += 2 + length;
    }
  }
  return null;
}
async function readHead(file, bytes = 1024 * 1024) {
  const handle = await open(file, 'r');
  try { const buffer = Buffer.alloc(bytes); const { bytesRead } = await handle.read(buffer, 0, bytes, 0); return buffer.subarray(0, bytesRead); }
  finally { await handle.close(); }
}

// Stream chunks to a new file while hashing; enforce the cap as bytes arrive.
async function writeHashed(source, file, maxBytes, tooLarge) {
  const hash = createHash('sha256'), out = createWriteStream(file, { flags: 'wx' });
  let bytes = 0;
  try {
    for await (const chunk of source) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw fail(tooLarge, 413);
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve));
    }
    await new Promise((resolve, reject) => out.end(error => error ? reject(error) : resolve()));
  } catch (error) { out.destroy(); throw error; }
  return { sha256: hash.digest('hex'), bytes };
}

async function inboxRoot(root) {
  const repo = await realpath(path.resolve(root));
  if (!(await stat(repo)).isDirectory()) throw fail('The project folder does not exist.');
  const inbox = path.join(repo, 'inbox');
  await mkdir(inbox, { recursive: true });
  const actual = await realpath(inbox);
  if (!within(repo, actual)) throw fail('The inbox folder must stay inside the project.');
  return { repo, inbox: actual };
}

async function download(target, staging, maxBytes, retried = false) {
  const response = await fetch(target.download, { redirect: 'follow', signal: AbortSignal.timeout(15 * 60 * 1000), headers: { 'User-Agent': 'CyberStudio-intake/1' } }).catch(error => { throw fail(`Could not reach the link (${error.cause?.code || error.message}).`, 502); });
  const type = (response.headers.get('content-type') || '').toLowerCase();
  const html = type.includes('text/html') || type.includes('application/xhtml');
  if (html && target.provider === 'drive' && !retried && response.ok) {
    // Large Drive files answer with a virus-scan confirmation page first.
    await response.body?.cancel();
    return download({ ...target, download: `https://drive.usercontent.google.com/download?id=${target.driveId}&export=download&confirm=t` }, staging, maxBytes, true);
  }
  if (html) {
    await response.body?.cancel();
    if (!response.ok) throw fail(`The link answered HTTP ${response.status} with a web page, not a file. Check that the link is complete and shared publicly.`, 422);
    throw fail('The link returned a web page, not a file. It probably needs a sign-in or is not shared publicly. Set sharing to "anyone with the link", or download it and drop the file into the inbox.', 422);
  }
  if (!response.ok || !response.body) { await response.body?.cancel(); throw fail(`The link answered HTTP ${response.status}. Check that it is shared publicly.`, 502); }
  const declared = Number(response.headers.get('content-length'));
  if (declared > maxBytes) { await response.body.cancel(); throw fail(`The file is ${Math.round(declared / 1048576)} MB. Links are limited to ${Math.round(maxBytes / 1048576)} MB.`, 413); }
  let name = contentDispositionName(response.headers.get('content-disposition'));
  if (!name) { try { name = decodeURIComponent(path.posix.basename(new URL(response.url || target.download).pathname)); } catch { name = ''; } }
  if (!name || name === '/' || name === 'uc' || name === 'download') name = target.folder ? 'folder.zip' : 'download';
  if (target.folder && !/\.zip$/i.test(name)) name += '.zip';
  name = safeFilename(name);
  const file = path.join(staging, name);
  const body = Readable.fromWeb(response.body);
  const result = await writeHashed(body, file, maxBytes, `The file is larger than ${Math.round(maxBytes / 1048576)} MB.`);
  // Some hosts mislabel a login page; sniff the first bytes as a backstop.
  const head = (await readHead(file, 512)).toString('utf8').trimStart().slice(0, 200).toLowerCase();
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) throw fail('The link returned a web page, not a file. It probably needs a sign-in or is not shared publicly.', 422);
  return { name, ...result };
}

// sources: [{ file: absolute path } | { url } | { stream, name }]
// One asset per call. All sources land in the same inbox/<id>/ folder.
export async function intake({ root, sources, title, from, tags, maxLinkBytes = MAX_LINK_BYTES, maxUploadBytes = MAX_UPLOAD_BYTES }) {
  if (!Array.isArray(sources) || !sources.length) throw fail('Add a file or a link.');
  if (sources.length > 100) throw fail('Add up to 100 files at a time.');
  const { repo, inbox } = await inboxRoot(root);
  const staging = path.join(inbox, `.intake-${randomUUID().slice(0, 8)}`);
  await mkdir(staging);
  try {
    const files = [];
    let link = null, folderZip = false;
    for (const source of sources) {
      if (source.url) {
        if (link) throw fail('Add one link per asset.');
        const target = normalizeLink(source.url);
        const saved = await download(target, staging, maxLinkBytes);
        link = target.link; folderZip = target.folder;
        files.push({ ...saved, note: target.folder ? 'Shared folder downloaded as a zip; not unpacked.' : undefined });
      } else if (source.file) {
        const actual = await realpath(path.resolve(source.file));
        const info = await stat(actual);
        if (!info.isFile()) throw fail(`Not a file: ${path.basename(source.file)}. Zip folders first.`);
        let name = safeFilename(path.basename(actual), 'file');
        if (files.some(item => item.name === name)) name = `${randomUUID().slice(0, 4)}-${name}`;
        files.push({ name, ...await writeHashed(createReadStream(actual), path.join(staging, name), maxUploadBytes, 'Choose files of 1 GB or less.') });
      } else if (source.stream) {
        let name = safeFilename(source.name, 'file');
        if (files.some(item => item.name === name)) name = `${randomUUID().slice(0, 4)}-${name}`;
        files.push({ name, ...await writeHashed(source.stream, path.join(staging, name), maxUploadBytes, 'Choose files of 1 GB or less.') });
      } else throw fail('Add a file or a link.');
    }
    const cleanTitle = String(title || '').replace(/\s+/g, ' ').trim().slice(0, 120) || path.basename(files[0].name, path.extname(files[0].name)).replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Untitled';
    const kinds = [...new Set(files.map(item => folderZip ? 'reference' : kindFor(item.name)))];
    const kind = kinds.length === 1 ? kinds[0] : 'reference';
    // Reserve a unique id: rename the staging folder into place.
    const existing = new Set((await readdir(inbox)).map(name => name.toLowerCase()));
    const base = slug(title || files[0].name);
    let id = base;
    for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;
    const folder = path.join(inbox, id);
    await rename(staging, folder);
    const now = new Date().toISOString();
    const asset = {
      schema: 'cyberstudio.asset/v1', id, title: cleanTitle, kind, status: 'draft', created: now, updated: now,
      ...(tagList(tags).length ? { tags: tagList(tags) } : {}),
      files: files.map(item => ({ path: path.relative(repo, path.join(folder, item.name)).split(path.sep).join('/'), role: kind === 'mesh' ? 'output' : 'reference', sha256: item.sha256, bytes: item.bytes, ...(item.note ? { note: item.note } : {}) })),
      provenance: { origin: link ? 'link' : 'imported', ...(link ? { link } : {}), ...(String(from || '').trim() ? { imported_from: String(from).trim().slice(0, 200) } : {}) },
      cost: { usd: 0, jobs: 0, basis: 'none' },
    };
    if (kind === 'image' && files.length === 1) {
      const size = imageSize(await readHead(path.join(folder, files[0].name)).catch(() => Buffer.alloc(0)));
      if (size?.width > 0 && size?.height > 0) asset.image = size;
    }
    await writeFile(path.join(folder, 'asset.json'), JSON.stringify(asset, null, 2) + '\n', { flag: 'wx' });
    return { id, path: folder, relative: path.relative(repo, folder).split(path.sep).join('/'), asset };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export function tagList(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(',');
  return [...new Set(list.map(tag => String(tag).trim().toLowerCase().slice(0, 40)).filter(Boolean))].slice(0, 30);
}

// True when a drop target folder is the project's inbox itself.
export async function isInbox(root, folder) {
  try { return (await realpath(path.resolve(folder))) === (await realpath(path.join(root, 'inbox'))); } catch { return false; }
}
