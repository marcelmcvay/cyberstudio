// Run a command-line tool from a script on macOS, Linux and Windows. Built-ins only.
//
// npm installs CLIs such as gltf-transform as .cmd shims on Windows. spawnSync
// runs only .exe and .com there; a .cmd needs cmd.exe. So on Windows the tool is
// looked up on PATH first: a missing tool fails with ENOENT as it does elsewhere,
// an .exe runs directly, and a .cmd or .bat runs through the shell, each part quoted.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, extname, join } from 'node:path';

const WIN = process.platform === 'win32';
const quote = (s) => `"${String(s)}"`;

function which(cmd) {
  const exts = extname(cmd) ? [''] : (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const dirs = /[\\/]/.test(cmd) ? [''] : (process.env.PATH || '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const file = dir ? join(dir, cmd + ext) : cmd + ext;
      if (existsSync(file)) return file;
    }
  }
  return null;
}

export function spawnTool(cmd, args = [], opts = {}) {
  if (!WIN) return spawnSync(cmd, args, opts);
  const file = which(cmd);
  if (!file) {
    const error = Object.assign(new Error(`spawnSync ${cmd} ENOENT`), { code: 'ENOENT' });
    return { pid: 0, output: [], stdout: '', stderr: '', status: null, signal: null, error };
  }
  if (!/\.(cmd|bat)$/i.test(file)) return spawnSync(file, args, opts);
  return spawnSync([file, ...args].map(quote).join(' '), { ...opts, shell: true });
}
