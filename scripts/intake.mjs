#!/usr/bin/env node
// Inbox intake. Files and share links (Dropbox, Google Drive, any public URL)
// become inbox/<id>/ folders with an asset.json sidecar (schemas/asset-v1.json).
//
//   node scripts/intake.mjs <file-or-url>... [--title "..."] [--from "AD team"]
//        [--tags a,b] [--root <project>] [--json]
//
// Without --title every source becomes its own asset. With --title all sources
// go into one asset folder. Files are copied, never moved. Links are limited to
// 500 MB; HTML answers (a sign-in page) are rejected. Dropbox folder links are
// saved as a zip and not unpacked.
import { intake } from '../desktop/service/intake.mjs';
import { loadEnv, projectRoot } from './lib/env.mjs';

function parse(argv) {
  const options = { sources: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { if (i + 1 >= argv.length) throw new Error(`${arg} needs a value.`); return argv[++i]; };
    if (arg === '--title') options.title = value();
    else if (arg === '--from') options.from = value();
    else if (arg === '--tags') options.tags = value();
    else if (arg === '--root') options.root = value();
    else if (arg === '--json') options.json = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}.`);
    else options.sources.push(/^https?:\/\//i.test(arg) ? { url: arg } : { file: arg });
  }
  return options;
}

const usage = 'Usage: node scripts/intake.mjs <file-or-url>... [--title "..."] [--from "AD team"] [--tags a,b] [--root <project>] [--json]';
let options;
try { options = parse(process.argv.slice(2)); } catch (error) { console.error(error.message); console.error(usage); process.exit(2); }
if (options.help || !options.sources.length) { console.log(usage); process.exit(options.help ? 0 : 2); }
loadEnv();
const root = options.root || projectRoot();
const groups = options.title ? [options.sources] : options.sources.map(source => [source]);
let failed = 0;
for (const sources of groups) {
  const label = sources.map(source => source.url || source.file).join(', ');
  try {
    const result = await intake({ root, sources, title: options.title, from: options.from, tags: options.tags });
    if (options.json) console.log(JSON.stringify({ ok: true, id: result.id, path: result.path, asset: result.asset }));
    else console.log(`${result.path}  (${result.asset.kind}, ${result.asset.files.length} file${result.asset.files.length === 1 ? '' : 's'})`);
  } catch (error) {
    failed++;
    if (options.json) console.log(JSON.stringify({ ok: false, source: label, error: error.message }));
    else console.error(`intake failed for ${label}: ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
