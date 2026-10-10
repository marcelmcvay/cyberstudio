#!/usr/bin/env node
// Spend ledger. The single writer for <projectRoot>/ledger/spend.csv.
// Soft cap: warns at the warn threshold and when over. Never blocks.
//
//   node scripts/ledger.mjs append --tool tripo --model v2.5 --job-id X \
//     --units 30 --unit-type credits --cost-usd 0.30 --basis estimated \
//     [--asset-id ID] [--note TEXT]
//   node scripts/ledger.mjs mtd [--json]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, projectRoot } from './lib/env.mjs';

export const COLUMNS = ['ts', 'tool', 'model', 'job_id', 'asset_id', 'units', 'unit_type', 'cost_usd', 'cost_basis', 'note'];
const BASES = new Set(['estimated', 'observed']);

export function ledgerPath(root) {
  loadEnv(); // CYBERSTUDIO_PROJECT_ROOT may come from .env
  return join(root ?? projectRoot(), 'ledger', 'spend.csv');
}

export function csvField(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// RFC 4180-ish parser. Handles quoted fields with commas, quotes, newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function ensureLedger(file) {
  if (existsSync(file)) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, COLUMNS.join(',') + '\n');
}

export function config() {
  loadEnv();
  const cap = Number(process.env.CYBERSTUDIO_MONTHLY_CAP_USD || 300);
  const warnPct = Number(process.env.CYBERSTUDIO_WARN_PCT || 80);
  return {
    cap: Number.isFinite(cap) && cap > 0 ? cap : 300,
    warnPct: Number.isFinite(warnPct) && warnPct > 0 ? warnPct : 80,
  };
}

export function readRows(file = ledgerPath()) {
  if (!existsSync(file)) return [];
  const [header, ...rows] = parseCsv(readFileSync(file, 'utf8'));
  if (!header) return [];
  return rows
    .filter((r) => r.length > 1 || (r[0] ?? '') !== '')
    .map((r) => Object.fromEntries(header.map((h, idx) => [h, r[idx] ?? ''])));
}

// Month is the UTC calendar month of the row timestamp.
export function monthToDate({ now = new Date(), file = ledgerPath() } = {}) {
  const { cap, warnPct } = config();
  const month = now.toISOString().slice(0, 7);
  let total = 0, count = 0;
  const byTool = {};
  for (const r of readRows(file)) {
    if (!r.ts || !r.ts.startsWith(month)) continue;
    const c = Number(r.cost_usd);
    if (!Number.isFinite(c)) continue;
    total += c; count++;
    byTool[r.tool || 'unknown'] = (byTool[r.tool || 'unknown'] || 0) + c;
  }
  total = Math.round(total * 10000) / 10000;
  const pct = Math.round((total / cap) * 1000) / 10;
  const state = total > cap ? 'over' : pct >= warnPct ? 'warn' : 'ok';
  return { month, total_usd: total, cap_usd: cap, warn_pct: warnPct, pct_of_cap: pct, state, rows: count, by_tool: byTool, ledger: file };
}

export function budgetWarning(m) {
  if (m.state === 'over') return `ledger: OVER CAP. $${m.total_usd.toFixed(2)} of $${m.cap_usd.toFixed(2)} this month (${m.pct_of_cap}%). Soft cap. Not blocking. Flag it to Marcel.`;
  if (m.state === 'warn') return `ledger: warning. $${m.total_usd.toFixed(2)} of $${m.cap_usd.toFixed(2)} this month (${m.pct_of_cap}%). Past the ${m.warn_pct}% line.`;
  return null;
}

export function append(entry = {}) {
  const file = ledgerPath();
  ensureLedger(file);
  const basis = entry.cost_basis ?? entry.basis ?? 'estimated';
  if (!BASES.has(basis)) throw new Error(`cost_basis must be estimated or observed, got "${basis}"`);
  const cost = entry.cost_usd === undefined || entry.cost_usd === '' ? 0 : Number(entry.cost_usd);
  if (!Number.isFinite(cost)) throw new Error(`cost_usd is not a number: "${entry.cost_usd}"`);
  if (!entry.tool) throw new Error('tool is required');
  const row = {
    ts: entry.ts || new Date().toISOString(),
    tool: entry.tool,
    model: entry.model ?? '',
    job_id: entry.job_id ?? '',
    asset_id: entry.asset_id ?? '',
    units: entry.units ?? '',
    unit_type: entry.unit_type ?? '',
    cost_usd: cost,
    cost_basis: basis,
    note: entry.note ?? '',
  };
  appendFileSync(file, COLUMNS.map((c) => csvField(row[c])).join(',') + '\n');
  const mtd = monthToDate({ file });
  return { row, mtd, warning: budgetWarning(mtd) };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const eq = a.indexOf('=');
    const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-/g, '_');
    if (eq > 0) out[key] = a.slice(eq + 1);
    else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

const USAGE = `usage:
  node scripts/ledger.mjs append --tool T [--model M] [--job-id ID] [--asset-id ID]
       [--units N] [--unit-type credits] [--cost-usd 0.00] [--basis estimated|observed] [--note TEXT]
  node scripts/ledger.mjs mtd [--json]`;

function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (cmd === 'append') {
    let res;
    try {
      res = append({ ...args, cost_basis: args.basis ?? args.cost_basis });
    } catch (e) {
      console.error(`ledger: ${e.message}\n${USAGE}`);
      return 2;
    }
    const { row, mtd, warning } = res;
    console.log(`ledger: +$${Number(row.cost_usd).toFixed(2)} ${row.tool} ${row.job_id} (${row.cost_basis}). Month to date $${mtd.total_usd.toFixed(2)} of $${mtd.cap_usd.toFixed(2)}.`);
    if (warning) console.error(warning);
    return 0; // soft cap: never block
  }
  if (cmd === 'mtd') {
    const m = monthToDate();
    if (args.json) { console.log(JSON.stringify(m, null, 2)); return 0; }
    console.log(`${m.month}: $${m.total_usd.toFixed(2)} of $${m.cap_usd.toFixed(2)} (${m.pct_of_cap}%). ${m.rows} rows. State: ${m.state}.`);
    const w = budgetWarning(m);
    if (w) console.error(w);
    return 0;
  }
  console.error(USAGE);
  return cmd === undefined || cmd === 'help' || args.help ? 0 : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
