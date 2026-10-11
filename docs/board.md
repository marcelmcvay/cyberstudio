# Milestone board

Producer keeps this current. Status: `todo` · `doing` · `done` · `blocked (Marcel)`.

## M0: Tooling (Mac)

| Item | Status | Notes |
|---|---|---|
| Blender (brew cask) | done | 5.2.2 LTS |
| Blender MCP add-on + server in `.mcp.json` | done | `mcp-for-blender@2.1.9`, :9876, telemetry off |
| Gate: cube via MCP, GLB export | done | `uv run scripts/blender/mcp-smoke.py`. 0 errors, 0 warnings |
| git-lfs | done | 3.8.0, hooks installed |
| `@gltf-transform/cli` + validator | done | 4.5.1, `gltf-transform validate` |
| Higgsfield CLI + vendor skills | done | CLI 1.1.26. Plugin `higgsfield@higgsfield`, project scope |
| Higgsfield login | done | Workspace Private, Plus plan |
| Tripo client | done | `scripts/tripo/tripo.py`, SDK 0.4.2 |
| Tripo route | done | Direct API unreachable here (IPv4-only host, IPv6-only net). Use Higgsfield `tripo_h3_1_image_to_3d` |
| `.env.example`, ledger, Higgsfield wrapper | done | `scripts/ledger.mjs`, `scripts/higgsfield/gen.mjs`. Higgsfield JSON fields unverified until first real job |
| `scripts/doctor` | done | 22 green, 2 yellow, 0 red (2 yellow = ROG engines) |
| Unity Hub / Unreal | deferred | Install on the ROG. Epic Launcher already on the Mac |

## M1: Kit + first assets

| Item | Status | Notes |
|---|---|---|
| Agent team in `.claude/agents/` | done | 6 subagents + Producer (main session); `docs/agents.md`; linked into projects by `scripts/studio` |
| CyberStudio on macOS (Tauri, 2 h box) | done | Rust 1.99 (brew rustup). `npm run desktop:prepare` + `cargo build` in `src-tauri`; Claude Code chats work. Finder-launched `.app` may not find nvm `claude` (PATH) |
| Re-skin, properties panel, GLB viewer, ledger widget, inbox/link intake | done | Shell + Nutrient reskin and HUD, readout spend widget, Properties panel, inbox + link intake, `scene3d` viewer (several GLBs in one scene, in meters) |
| Asset sidecar schema (extends `schema-v1.json`) | done | `schemas/asset-v1.json`, `scripts/sidecar.mjs` scan/check/ledger-orphans/map, `docs/sidecars.md`; VEC backfilled (6 assets) |
| `cyberstudio-3d` branch, `vec-factory-proto` project | done | Branch dropped (decision 2026-10-11). VEC repo is a CyberStudio Workspace; launch with `scripts/studio` |
| ~5 AD images, 3 Tripo meshes, three.js scene | done | QA 2026-10-11: PASS WITH NOTES. 6 AD images; haas-vf2-lp (real scale), motor-test-stand, mfg-cell cleaned on the Strix (`scripts/blender/clean-glb.py`), 0 validator errors, sidecars in review, three.js import test recorded (engine_ready for three.js); `m1-scene` card, 51k tris, 25 draw calls |
| ROG Strix job host (pulled forward from M3) | done | Tailscale (`strix`), OpenSSH key login, Git/LFS, Node, Claude Code, Blender 5.2.2 on the Strix; kit + VEC cloned. `scripts/strix` (status/sh/put/get/blender/pull). First GPU job: `scripts/blender/render-glb.py`, OptiX 5070 Ti, 17.8k tris 1600x900 128spp in ~4 s. Plus `blender-strix` MCP over SSH tunnel and Claude on Strix chats; verified cross-network. Job queue moves to M3 |

**M1 closed 2026-10-11.** Open notes carried into M2 or the backlog:
- AD images have no sidecars of their own; robot-station and pallet-conveyor generations ($1.38) are ledger orphans until their meshes exist.
- Brand marks on the haas-vf2-lp texture need painting out before approval (art call).
- mfg-cell is a composite (Tripo props plus a Blender fence), provenance origin manual.
- The app CSP blocks WebAssembly, so Draco or meshopt GLBs would fail. Decide before compressing assets.
- Strix Blender MCP add-on can wedge on long calls; headless `scripts/strix blender` is the fallback.

## M2: Discrete plant scene

todo
