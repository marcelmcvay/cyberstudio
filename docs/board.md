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
| Higgsfield login | blocked (Marcel) | `higgsfield auth login` |
| Tripo client | done | `scripts/tripo/tripo.py`, SDK 0.4.2 |
| Tripo key | blocked (Marcel) | paste `TRIPO_API_KEY` into `.env` |
| `.env.example`, ledger, Higgsfield wrapper | done | `scripts/ledger.mjs`, `scripts/higgsfield/gen.mjs`. Higgsfield JSON fields unverified until first real job |
| `scripts/doctor` | done | 18 green, 6 yellow, 0 red |
| Unity Hub / Unreal | deferred | Install on the ROG. Epic Launcher already on the Mac |

## M1: Kit + first assets

| Item | Status | Notes |
|---|---|---|
| Agent team in `.claude/agents/` | todo | 7 roles from brief §5 |
| Mr. Mak on macOS (Tauri, 2 h box) | todo | Fallback: browser preview + Node PTY |
| Re-skin, properties panel, GLB viewer, ledger widget, inbox/link intake | todo | |
| Asset sidecar schema (extends `schema-v1.json`) | todo | |
| `cyberstudio-3d` branch, `vec-factory` project | todo | Marcel creates OCTO repo |
| ~5 AD images, 3 Tripo meshes, three.js scene | todo | Needs keys |

## M2: Discrete plant scene

todo
