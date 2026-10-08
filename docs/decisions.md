# Decisions

Newest first. Date, decision, who decided, why.

## 2026-10-08

- **M1 meshes go through Higgsfield's hosted Tripo (`tripo_h3_1_image_to_3d`), not the direct Tripo API.** Marcel's network has no IPv4 route and the Tripo API is IPv4-only. Higgsfield reaches over IPv6. 9 credits standard, 18 detailed (quoted 2026-10-08). Direct client `scripts/tripo/tripo.py` stays for the ROG or an IPv4 network. Fallback: Tripo web app (IPv6 via Cloudflare), manual import through `inbox/`. Same model family, so the mesh pipeline is unchanged.
- **Kit repo `marcelmcvay/cyberstudio` is public.** Marcel. Workspace setup only. No client material, no keys. VEC material lives in a separate private OCTO repo.
- **Blender MCP pinned to `mcp-for-blender@2.1.9`, add-on vendored at the matching commit.** Producer. The PyPI package was renamed from `blender-mcp`. The add-on in `vendor/blender-mcp/` is byte-identical to the one bundled in 2.1.9 (protocol 13). Upgrades are deliberate, not drift.
- **Blender MCP telemetry off.** Producer. `BLENDER_MCP_DISABLE_TELEMETRY=true` in `.mcp.json`. The add-on's data-sharing consent stays at its default (off). Client work flows through this server.
- **Blender MCP registered in the kit `.mcp.json`, not via the vendor's `setup` installer.** Producer. The installer edits global client configs. The kit should carry its own config.
- **glTF validation via `gltf-transform validate`.** Producer. It wraps Khronos glTF-Validator. Khronos ships no arm64 macOS binary.
- **Higgsfield vendor skills installed as a project-scoped Claude Code plugin.** Producer. Travels with the kit through `.claude/settings.json`. Mr. Mak's own `higgsfield-workflow` skill stays alongside it.
- **Higgsfield auth is OAuth (`higgsfield auth login`), not an API key.** Vendor fact. `.env` holds only a credit-to-USD rate for the ledger.
- **Kit started as a local clone of Mr. Mak 0.4.19 (`1e0c7c3`), remote `upstream`.** Producer, per brief. No `origin` until Marcel creates `marcelmcvay/cyberstudio`.

## 2026-10-07 (from the brief, Marcel)

- Reusable kit first, then the 3D profile, then the VEC project.
- Fork Mr. Mak. Keep its MIT attribution.
- Asset viewer is a local web dashboard. Not Obsidian.
- Large files in Git LFS. Blender driven through Blender MCP.
- Generation: Higgsfield and Tripo. Midjourney is manual import through the inbox.
- $300/month soft cap. Warn at 80%. Never hard-block.
- Engine fork reopened. Pipeline stays glTF-neutral up to the Blender scene. Engines install on the ROG.
- Kit on Marcel's personal GitHub. `vec-factory` on the OCTO org. Marcel creates both.
- M2 starts with discrete (motor assembly).
- Voice: Wispr Flow or typed text into the composer. Mr. Mak voice deferred (needs an OpenAI API key).
