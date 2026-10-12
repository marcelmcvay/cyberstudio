import { open, realpath, stat, lstat, unlink, link, copyFile, mkdir, rename, rmdir, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { within } from './util.mjs';
import { invalidFilename, isMacOS, isWindows, samePath } from './platform.mjs';

export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const invalid = message => Object.assign(new Error(message), { status: 400 });

export async function importFile(source, folder, name, maxBytes = MAX_FILE_BYTES) {
  if (typeof folder !== 'string' || !folder) throw invalid('Choose a destination folder.');
  if (invalidFilename(name)) {
    throw invalid('This file name cannot be used on Windows.');
  }
  const destination = await realpath(path.resolve(folder));
  if (!(await stat(destination)).isDirectory()) throw invalid('Choose a folder to copy files into.');
  const extension = path.extname(name), stem = name.slice(0, name.length - extension.length);
  let handle, target;
  for (let copy = 1; copy <= 9999; copy++) {
    target = path.join(destination, copy === 1 ? name : `${stem} (${copy})${extension}`);
    try { handle = await open(target, 'wx'); break; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  if (!handle) throw invalid('Too many copies with this name. Rename the file and try again.');
  let size = 0;
  try {
    // Stream directly to the new file; large assets never accumulate in memory.
    for await (const chunk of source) {
      size += chunk.length;
      if (size > maxBytes) throw Object.assign(new Error('Choose files of 1 GB or less.'), { status: 413 });
      await handle.writeFile(chunk);
    }
    await handle.close();
    return { path: target, name: path.basename(target), size, renamed: path.basename(target) !== name };
  } catch (error) {
    await handle.close().catch(() => {});
    await unlink(target).catch(() => {});
    throw error;
  }
}

export async function dragFiles(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > 100 || paths.some(file => typeof file !== 'string' || !file)) {
    throw invalid('Choose between 1 and 100 files or folders to drag.');
  }
  return Promise.all(paths.map(async file => {
    const actual = await realpath(path.resolve(file));
    const info = await stat(actual);
    if (!info.isFile() && !info.isDirectory()) throw invalid('Drag a regular file or folder from the tree.');
    return actual;
  }));
}

export async function entryPath(value) {
  if (typeof value !== 'string' || !value.trim()) throw invalid('Choose a file or folder.');
  const absolute = path.resolve(value);
  if (path.dirname(absolute) === absolute) throw invalid('A drive root cannot be changed here.');
  // Resolve the parent, never the last link: recycling a junction must not delete its target.
  const actual = path.join(await realpath(path.dirname(absolute)), path.basename(absolute));
  await lstat(actual);
  return actual;
}

export async function recyclePath(value, repo) {
  const actual = await entryPath(value);
  if (within(actual, repo)) throw invalid('The project folder and its parent folders cannot be deleted here.');
  return actual;
}

export async function moveFile(value, folder) {
  const source = await entryPath(value);
  if (typeof folder !== 'string' || !folder) throw invalid('Choose a destination folder.');
  const destination = await realpath(path.resolve(folder));
  if (!(await stat(destination)).isDirectory()) throw invalid('Choose a destination folder.');
  const target = path.join(destination, path.basename(source));
  if (samePath(source, target)) return { path: source, moved: false };
  const before = await lstat(source);
  if (!before.isFile() || before.isSymbolicLink()) throw invalid(`Move individual files here. Use ${isWindows ? 'Explorer' : isMacOS ? 'Finder' : 'the file manager'} for folder or link moves.`);
  try {
    // A same-volume hard link is an exclusive, constant-time move reservation.
    // Neither this path nor the cross-volume fallback can overwrite another file.
    try { await link(source, target); }
    catch (error) {
      if (!['EXDEV', 'EPERM', 'ENOTSUP', 'EACCES'].includes(error.code)) throw error;
      await copyFile(source, target, constants.COPYFILE_EXCL);
    }
  } catch (error) {
    if (error.code === 'EEXIST') throw Object.assign(new Error('A file with this name already exists in that folder. Nothing was moved.'), { status: 409 });
    throw error;
  }
  try {
    const current = await lstat(source);
    if (current.ino !== before.ino || current.size !== before.size || current.mtimeMs !== before.mtimeMs) throw invalid('The source changed during the move. Try again after it finishes saving.');
    await unlink(source);
  } catch (error) { await unlink(target).catch(() => {}); throw error; }
  return { path: target, moved: true };
}

/*
 * Undoable trash.
 *
 * The OS trash cannot be undone reliably from here: the native side uses the
 * `trash` crate, which on macOS moves the item through Finder and offers no
 * restore, and the Trash may rename it on a name clash. So a project file is
 * first renamed into `<repo>/.trash/<stamp>/` (same volume, instant, exact
 * bytes and metadata). Undo renames it back. After the hold window the staged
 * item is handed to the OS trash, where it can still be put back by hand.
 * Leftovers from a crash or quit are emptied on the next start. Items outside
 * the project, or on another volume, go straight to the OS trash as before.
 */
export const TRASH_DIR = '.trash';
export const TRASH_HOLD_MS = 15000;

export class TrashStage {
  constructor(repo, { native = () => {}, holdMs = TRASH_HOLD_MS } = {}) {
    this.repo = repo; this.native = native; this.holdMs = holdMs;
    this.root = path.join(repo, TRASH_DIR);
    this.pending = new Map();
  }

  async stage(file) {
    if (!within(this.repo, file) || samePath(file, this.repo) || within(this.root, file)) return null;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const folder = path.join(this.root, id);
    await mkdir(folder, { recursive: true });
    // Never versioned, whatever the project's own .gitignore says.
    await writeFile(path.join(this.root, '.gitignore'), '*\n', { flag: 'wx' }).catch(() => {});
    const staged = path.join(folder, path.basename(file));
    try { await rename(file, staged); }
    catch (error) {
      await rmdir(folder).catch(() => {});
      if (['EXDEV', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) return null;
      throw error;
    }
    const timer = setTimeout(() => this.flush(id), this.holdMs);
    timer.unref?.();
    this.pending.set(id, { id, original: file, staged, folder, timer });
    return { id, path: file, name: path.basename(file), holdMs: this.holdMs };
  }

  async restore(id) {
    const item = this.pending.get(id);
    if (!item) throw Object.assign(new Error(`Too late to undo here. The item is in the ${isMacOS ? 'Trash' : isWindows ? 'Recycle Bin' : 'Trash'} now.`), { status: 410 });
    try { await lstat(item.original); throw Object.assign(new Error(`Something new is at ${path.basename(item.original)}. Nothing was restored.`), { status: 409 }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    clearTimeout(item.timer);
    this.pending.delete(id);
    try {
      await mkdir(path.dirname(item.original), { recursive: true });
      await rename(item.staged, item.original);
    } catch (error) { this.pending.set(id, { ...item, timer: setTimeout(() => this.flush(id), this.holdMs) }); throw error; }
    await rmdir(item.folder).catch(() => {});
    return { path: item.original, restored: true };
  }

  flush(id) {
    const item = this.pending.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    this.pending.delete(id);
    this.native({ type: 'recycle-file', path: item.staged });
    // The native move is asynchronous; drop the stamp folder once it is empty.
    setTimeout(() => rmdir(item.folder).catch(() => {}), 5000).unref?.();
  }

  /** Empty what an earlier run left behind and drop empty stamp folders. */
  async sweep() {
    let names = [];
    try { names = await readdir(this.root); } catch { return; }
    for (const name of names) {
      if (name === '.gitignore' || [...this.pending.values()].some(item => path.basename(item.folder) === name)) continue;
      const folder = path.join(this.root, name);
      let children = [];
      try { children = await readdir(folder); } catch { continue; }
      if (!children.length) { await rmdir(folder).catch(() => {}); continue; }
      for (const child of children) this.native({ type: 'recycle-file', path: path.join(folder, child) });
    }
  }

  close() { for (const item of this.pending.values()) clearTimeout(item.timer); }
}
