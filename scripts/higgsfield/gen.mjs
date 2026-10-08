#!/usr/bin/env node
// Ledgered wrapper around `higgsfield generate create`.
//
//   node scripts/higgsfield/gen.mjs <job_type> [--param value]... \
//     [--asset-id ID] [--note TEXT] [--no-estimate] [--dry-run]
//
// Everything except the wrapper flags passes through to the CLI.
// The wrapper adds --wait --json, saves each job object to
// <projectRoot>/_gen/higgsfield/<job_id>.json, then appends one ledger row per job.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv, projectRoot } from '../lib/env.mjs';
import { append } from '../ledger.mjs';

const BIN = process.env.HIGGSFIELD_BIN || 'higgsfield';
const WRAPPER_FLAGS = new Set(['--dry-run', '--asset-id', '--note', '--no-estimate']);
const WRAPPER_VALUE_FLAGS = new Set(['--asset-id', '--note']);

function shellQuote(a) {
  return /^[A-Za-z0-9_./:=@%+-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
}

function splitArgs(argv) {
  const own = { dryRun: false, assetId: '', note: '', estimate: true };
  const pass = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.startsWith('--') && a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    if (!WRAPPER_FLAGS.has(flag)) { pass.push(a); continue; }
    const val = WRAPPER_VALUE_FLAGS.has(flag) ? (inline ?? argv[++i] ?? '') : undefined;
    if (flag === '--dry-run') own.dryRun = true;
    if (flag === '--no-estimate') own.estimate = false;
    if (flag === '--asset-id') own.assetId = val;
    if (flag === '--note') own.note = val;
  }
  return { own, pass };
}

function run(args, { timeout = 0 } = {}) {
  return spawnSync(BIN, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeout || undefined, stdio: ['ignore', 'pipe', 'pipe'] });
}

// The CLI may print progress lines before the JSON. Take the first JSON value we can parse.
export function extractJson(text) {
  if (!text) return undefined;
  try { return JSON.parse(text); } catch { /* fall through */ }
  for (const open of ['[', '{']) {
    let idx = text.indexOf(open);
    while (idx !== -1) {
      try { return JSON.parse(text.slice(idx)); } catch { /* keep looking */ }
      idx = text.indexOf(open, idx + 1);
    }
  }
  return undefined;
}

// --- Response-shape assumptions live here. See docs/m0-tooling.md. ---
// Assumed: `--wait --json` returns an array of job objects (or one object, or {jobs|items|data: [...]}).
export function jobsFrom(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    for (const k of ['jobs', 'items', 'data', 'results']) if (Array.isArray(json[k])) return json[k];
    return [json];
  }
  return [];
}

const pick = (obj, keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

export function jobId(job) {
  return pick(job, ['id', 'job_id', 'jobId', 'uuid', 'job.id']);
}

// Any http(s) URL found anywhere in the job object, de-duplicated.
export function outputUrls(job) {
  const urls = new Set();
  const walk = (v, depth) => {
    if (depth > 6 || v == null) return;
    if (typeof v === 'string') { if (/^https?:\/\//.test(v)) urls.add(v); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === 'object') for (const [k, x] of Object.entries(v)) {
      if (/^(params|input|inputs|request)$/i.test(k)) continue; // skip echoed inputs
      walk(x, depth + 1);
    }
  };
  walk(job, 0);
  return [...urls];
}

// Credits charged. Assumed names; first numeric hit wins.
export function creditsFrom(obj) {
  const v = pick(obj, ['credits', 'credits_used', 'credits_spent', 'credit_cost', 'cost', 'cost_credits', 'price', 'billing.credits', 'usage.credits', 'meta.credits']);
  const n = typeof v === 'object' ? undefined : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function modelFrom(job, fallback) {
  return pick(job, ['model', 'job_type', 'jobType', 'type', 'job_set_type']) ?? fallback;
}

function main(argv) {
  loadEnv();
  const { own, pass } = splitArgs(argv);
  const jobType = pass[0];
  if (!jobType || jobType.startsWith('-')) {
    console.error('usage: node scripts/higgsfield/gen.mjs <job_type> [--param value]... [--asset-id ID] [--note TEXT] [--no-estimate] [--dry-run]');
    return 2;
  }
  const params = pass.slice(1).filter((a) => a !== '--wait' && a !== '--json');
  const createArgs = ['generate', 'create', jobType, ...params, '--wait', '--json'];
  const costArgs = ['generate', 'cost', jobType, ...params.filter((a, i, arr) => !/^--wait/.test(a) && !/^--wait/.test(arr[i - 1] ?? '')), '--json'];

  if (own.dryRun) {
    console.log([BIN, ...createArgs].map(shellQuote).join(' '));
    return 0;
  }

  const status = run(['account', 'status', '--json'], { timeout: 15000 });
  if (status.error || status.status !== 0) {
    const why = (status.stderr || status.stdout || status.error?.message || '').trim().split('\n')[0];
    console.error(`higgsfield is not ready${why ? ` (${why})` : ''}.\nRun \`higgsfield auth login\`, then \`higgsfield workspace list\` and \`higgsfield workspace set <id>\` if asked.`);
    return 3;
  }

  // Pre-flight estimate. Read-only. Used only if the job JSON has no credit field.
  let estimate;
  if (own.estimate) {
    const c = run(costArgs, { timeout: 60000 });
    if (c.status === 0) estimate = creditsFrom(extractJson(c.stdout) ?? {});
  }

  const res = spawnSync(BIN, createArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['inherit', 'pipe', 'inherit'] });
  const outDir = join(projectRoot(), '_gen', 'higgsfield');
  mkdirSync(outDir, { recursive: true });
  const json = extractJson(res.stdout);
  const jobs = jobsFrom(json);

  if (!jobs.length) {
    const f = join(outDir, `unparsed-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
    writeFileSync(f, res.stdout || '');
    console.error(`higgsfield: no job JSON parsed (exit ${res.status}). Raw output saved to ${f}. No ledger row written. Check \`higgsfield generate list --json\`.`);
    return res.status || 1;
  }

  const usdPerCredit = Number(process.env.HIGGSFIELD_USD_PER_CREDIT);
  const summary = [];
  jobs.forEach((job, i) => {
    const id = String(jobId(job) ?? `unknown-${Date.now()}-${i}`);
    const file = join(outDir, `${id.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
    writeFileSync(file, JSON.stringify(job, null, 2)); // raw, first

    const observed = creditsFrom(job);
    const perJobEstimate = estimate !== undefined ? estimate / jobs.length : undefined;
    const credits = observed ?? perJobEstimate;
    const basis = observed !== undefined ? 'observed' : 'estimated';
    const notes = [];
    const jobStatus = pick(job, ['status', 'state']);
    if (jobStatus) notes.push(`status=${jobStatus}`);
    if (observed === undefined) notes.push(perJobEstimate !== undefined ? 'credits from generate cost' : 'no credit field in CLI JSON');
    let cost = 0;
    if (credits !== undefined && Number.isFinite(usdPerCredit)) cost = Math.round(credits * usdPerCredit * 10000) / 10000;
    else if (credits !== undefined) notes.push('HIGGSFIELD_USD_PER_CREDIT unset, usd=0');
    if (own.note) notes.push(own.note);

    const { warning } = append({
      tool: 'higgsfield', model: modelFrom(job, jobType), job_id: id, asset_id: own.assetId,
      units: credits ?? '', unit_type: 'credits', cost_usd: cost, cost_basis: basis, note: notes.join('; '),
    });
    if (warning) console.error(warning);
    summary.push({ job_id: id, status: jobStatus ?? null, urls: outputUrls(job), credits: credits ?? null, cost_usd: cost, basis, raw: file });
  });

  console.log(JSON.stringify(summary, null, 2));
  return res.status ?? 1;
}

process.exitCode = main(process.argv.slice(2));
