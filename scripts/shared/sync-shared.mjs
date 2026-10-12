#!/usr/bin/env node
// Keeps a project's workspace/_shared/ files current with the kit.
//
//   node scripts/shared/sync-shared.mjs <kit> <project>   copy where safe
//   node scripts/shared/sync-shared.mjs --record           add the kit's current hashes
//   node scripts/shared/sync-shared.mjs --check            fail if they are not recorded
//
// A project file is replaced only when it is missing or byte-identical to a
// version the kit shipped before (kit-shared-hashes.json). Anything else is a
// local edit and is left alone. Run --record after changing one of the files.
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHARED = ['help.md', 'report.css', 'report.js', 'examples.css']
const here = path.dirname(fileURLToPath(import.meta.url))
const kitRoot = path.resolve(here, '../..')
const hashFile = path.join(here, 'kit-shared-hashes.json')
const sha = buffer => createHash('sha256').update(buffer).digest('hex')
const read = file => readFile(file).catch(error => { if (error.code === 'ENOENT') return null; throw error })

async function known() {
  return JSON.parse(await readFile(hashFile, 'utf8'))
}

export async function syncShared(kit, project) {
  const hashes = await known(), results = []
  for (const name of SHARED) {
    const source = path.join(kit, 'workspace', '_shared', name)
    const target = path.join(project, 'workspace', '_shared', name)
    const fresh = await read(source)
    if (!fresh) continue
    const current = await read(target)
    if (current && sha(current) === sha(fresh)) { results.push([name, 'current']); continue }
    if (current && !(hashes[name] || []).includes(sha(current))) { results.push([name, 'kept local edits']); continue }
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
    results.push([name, current ? 'updated' : 'added'])
  }
  return results
}

async function record(check) {
  const hashes = await known(), missing = []
  for (const name of SHARED) {
    const value = sha(await readFile(path.join(kitRoot, 'workspace', '_shared', name)))
    if ((hashes[name] ||= []).includes(value)) continue
    missing.push(name); hashes[name].push(value)
  }
  if (check) {
    if (missing.length) { console.error(`Unrecorded kit versions of workspace/_shared: ${missing.join(', ')}. Run node scripts/shared/sync-shared.mjs --record`); process.exit(1) }
    console.log('Kit workspace/_shared hashes recorded.')
    return
  }
  await writeFile(hashFile, `${JSON.stringify(hashes, null, 2)}\n`)
  console.log(missing.length ? `Recorded ${missing.join(', ')}.` : 'Nothing new to record.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [first, second] = process.argv.slice(2)
  if (first === '--record' || first === '--check') await record(first === '--check')
  else if (first && second) {
    if (path.resolve(first) === path.resolve(second)) process.exit(0)
    for (const [name, result] of await syncShared(path.resolve(first), path.resolve(second))) {
      if (result !== 'current') console.log(`workspace/_shared/${name}: ${result}`)
    }
  } else { console.error('Usage: sync-shared.mjs <kit> <project> | --record | --check'); process.exit(2) }
}
