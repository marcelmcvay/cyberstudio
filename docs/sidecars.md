# Asset sidecars

Every asset folder carries one `asset.json`: `assets/<id>/asset.json`, or
`inbox/<id>/asset.json` while it waits for triage. It says what the asset is,
which files make it up, where it came from, what it cost and whether it is
approved. The contract is `schemas/asset-v1.json`. Don't change it casually.
Other tools and the properties panel read it.

The ledger (`ledger/spend.csv`) stays the source of truth for money. The
sidecar only joins it.

## Who owns what

`scan` rewrites tool fields every run. It never touches people fields.

| Owner | Fields |
|---|---|
| People | `title`, `status`, `superseded_by`, `tags`, `ledger_ids`, `review`, `provenance.origin`, `provenance.inputs`, `provenance.link`, `provenance.imported_from`, `mesh.real_scale`, `mesh.origin`, `mesh.engine_ready` |
| Both | `cards`. Scan adds the cards it finds and keeps the ones people added |
| Tool | `files`, `provenance.jobs`, `cost`, `mesh` stats (`triangles`, `vertices`, `materials`, `textures`, `bbox_m`, `validator`), `image`, `updated` |

A new sidecar starts as `status: draft`. The title comes from the folder id,
`origin` is `generated` when ledger rows match and `manual` otherwise, and
`created` is the earliest file time or ledger row. `updated` only moves when
something actually changed, so a rescan leaves git clean.

## How scan reads a folder

- **files**: everything in the folder, recursively, except `asset.json`,
  `*.blend1` and `*.blend@`. Each file gets sha256, bytes and a role.
  - `*.glb` / `*.gltf` in the folder root: `output`. Tool variants such as
    `name_tripo_<job>.glb`, and meshes in sub-folders (parts, props): `source`.
  - `*.blend`: `source`. `textures/`: `texture`. `lod/`: `lod`.
  - Images under `refs/` or named `*_ref.*`: `reference`. Other images:
    `preview` (`output` for an image asset).
  - `receipts/` and job JSON: `receipt`.
- **kind**: `mesh` if there is any glTF, else `image`, else `video`, else
  `scene` for a lone `.blend`, else `document`.
- **mesh**: from the primary output, `<id>.glb` if present. `gltf-transform
  inspect` gives counts and the bounding box. `bbox_m` is width, depth,
  height in meters (glTF x, z, y). `gltf-transform validate` gives errors,
  warnings and when it was checked. A Git LFS pointer is listed with a note
  and gets no stats until the binary is pulled.
- **jobs and cost**: ledger rows whose `asset_id` is the asset id or one of
  its `ledger_ids`. Ledger `observed` maps to `actual`. All one basis gives
  that basis, a mix gives `mixed`, no rows gives `none`.
- **cards**: `workspace/workspace.json` entities whose folder files
  (`.html`, `.md`, `.json`) mention `assets/<id>/` or `<id>.glb`. Sub-folders
  that belong to another card count for that card only.

## Commands

```sh
node scripts/sidecar.mjs scan [--root DIR] [--dry-run] [--only ID]
node scripts/sidecar.mjs check [--root DIR]
node scripts/sidecar.mjs ledger-orphans [--root DIR] [--json]
node scripts/sidecar.mjs map <asset-id> <ledger-id>... [--root DIR]
```

The root is `--root`, else `CYBERSTUDIO_PROJECT_ROOT`, else the current
directory.

- `scan` creates or refreshes every sidecar and prints one line per asset.
- `check` validates each sidecar against the schema, confirms the id matches
  the folder, and warns on missing or resized files. It exits 1 on any error.
- `ledger-orphans` lists ledger `asset_id` values no sidecar covers, with row
  counts and cost. Each one is either a folder still to make or a part
  generation to roll up.
- `map` adds ledger ids to an asset's `ledger_ids` and rescans it. Example:
  part generations `cell-robot` and `cell-table` rolling up into `mfg-cell`.

`scripts/doctor` reports sidecar health under Budget.

## Editing by hand

Change people fields freely, then run `check`. Never delete an old asset.
Set `status: superseded` and `superseded_by: <new id>`. Review notes go in
`review.notes` as `{ at, by, text }`.
