# M0 tooling

The Mac side of CyberStudio. Generation, Blender, glTF, spend. Engines live on the ROG.

## Installed

| Tool | Version | Notes |
|---|---|---|
| Blender | 5.2.2 LTS | `/Applications/Blender.app`, `blender` on PATH |
| Blender MCP add-on | module `blender_mcp` | Blender 5.2 user addons. Socket on `localhost:9876` while Blender is open |
| Blender MCP server | `mcp-for-blender@2.1.9` | Registered in `.mcp.json` as `blender`, run via `uvx` |
| git-lfs | 3.8.0 | `git lfs install` done |
| glTF Transform CLI | 4.5.1 | Global npm. `gltf-transform validate` is the validator (wraps Khronos glTF-Validator) |
| Higgsfield CLI | 1.1.26 | brew. OAuth login, no key |
| Higgsfield skills | plugin `higgsfield@higgsfield` | Enabled in `.claude/settings.json` |
| Tripo SDK | `tripo3d==0.4.2` | Pinned inside `scripts/tripo/tripo.py`. uv fetches it |
| uv / uvx | 0.11 | Runs the Tripo script and the MCP server |

Unity Hub and Unreal are not on the Mac. That is intended. They go on the ROG in M3.

## Doctor

```sh
scripts/doctor
```

One line per check. Green is ready. Yellow is a next step. Red is broken. Exits 1 on any red.
`NO_COLOR=1` or a pipe gives plain `ok / warn / FAIL` tags.

## Ledger

Every paid call lands in `<project>/ledger/spend.csv`. One writer: `scripts/ledger.mjs`.

```sh
node scripts/ledger.mjs append --tool tripo --model v2.5 --job-id X \
  --units 30 --unit-type credits --cost-usd 0.30 --basis estimated [--asset-id ID] [--note TEXT]
node scripts/ledger.mjs mtd [--json]
```

- Project root is `$CYBERSTUDIO_PROJECT_ROOT`, else the current directory.
- Soft cap. `$CYBERSTUDIO_MONTHLY_CAP_USD` (300). Warns at `$CYBERSTUDIO_WARN_PCT` (80) and when over. Never blocks.
- Month is the UTC calendar month.
- `cost_basis` is `observed` when the tool reported credits, else `estimated`.
- Node scripts can `import { append, monthToDate } from './scripts/ledger.mjs'`.

## Higgsfield

```sh
node scripts/higgsfield/gen.mjs nano_banana_2 --prompt "..." [--asset-id ID] [--note TEXT] [--dry-run]
```

Passes through to `higgsfield generate create ... --wait --json`. Runs `generate cost` first (read only) for a fallback estimate. Saves each job to `_gen/higgsfield/<job_id>.json`. One ledger row per job. `--dry-run` prints the command and stops.

## Tripo

```sh
uv run scripts/tripo/tripo.py check
uv run scripts/tripo/tripo.py image-to-model --image ref.png [--asset-id ID] [--out DIR] [--dry-run]
uv run scripts/tripo/tripo.py segment --input (TASK_ID|mesh.glb|URL) [--granularity simple|balanced|detailed] [--asset-id ID] [--dry-run]
uv run scripts/tripo/tripo.py get TASK_ID [--out DIR]
```

Submit writes `_gen/tripo/<task_id>.json` at once. Then it waits, downloads to `_gen/tripo/<task_id>/`, and records sha256 per file. If it dies mid-wait, `get` resumes. It never resubmits. Credits come from the task's own report when it gives one, otherwise from the balance before and after the task. `segment` defaults to segment v2 (beta), which runs on Tripo's v3 host and takes an uploaded mesh, so meshes generated elsewhere can be split; v1 takes only a Tripo task ID.

## Marcel next steps

1. `cp .env.example .env`.
2. Paste `TRIPO_API_KEY` (starts with `tsk_`). Set `TRIPO_USD_PER_CREDIT` from your plan.
3. `higgsfield auth login`. Then `higgsfield workspace list` and `higgsfield workspace set <id>`.
4. Set `HIGGSFIELD_USD_PER_CREDIT` from your plan.
5. Optional: `DROPBOX_ACCESS_TOKEN` for link assets in M1.
6. Run `scripts/doctor`. Higgsfield and Tripo lines should turn green.

## MCP gate

Open Blender, then:

```
uv run scripts/blender/mcp-smoke.py
```

Talks real MCP over stdio to the server in `.mcp.json`. Builds an orange 1 m cube, exports `_gen/smoke/mcp-cube.glb`. Check it with `gltf-transform validate _gen/smoke/mcp-cube.glb`.
