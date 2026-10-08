// Shared env + path helpers for CyberStudio scripts. Built-ins only.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function projectRoot() {
  return resolve(process.env.CYBERSTUDIO_PROJECT_ROOT || process.cwd());
}

// Minimal .env parser: KEY=VALUE, optional `export `, quotes, # comments.
export function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let val = m[2];
    if (/^["']/.test(val)) {
      const q = val[0];
      const end = val.indexOf(q, 1);
      val = end > 0 ? val.slice(1, end) : val.slice(1);
      if (q === '"') val = val.replace(/\\n/g, '\n');
    } else {
      val = val.replace(/\s+#.*$/, '').trim();
    }
    out[m[1]] = val;
  }
  return out;
}

export function envFiles() {
  const files = [join(projectRoot(), '.env'), join(KIT_ROOT, '.env')];
  return [...new Set(files)].filter((f) => existsSync(f));
}

let loaded = false;
// Real env wins. Then project .env, then kit .env.
export function loadEnv() {
  if (loaded) return;
  loaded = true;
  for (const file of envFiles()) {
    let vars;
    try { vars = parseEnv(readFileSync(file, 'utf8')); } catch { continue; }
    for (const [k, v] of Object.entries(vars)) {
      if (process.env[k] === undefined || process.env[k] === '') {
        if (v !== '') process.env[k] = v;
      }
    }
  }
}
