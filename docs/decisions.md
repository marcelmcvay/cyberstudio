# Decisions

Newest first. Date, decision, who decided, why.

## 2026-10-12

- **Machines with moving parts are built in Blender, not split from a generated mesh.** Marcel. Tripo's part segmentation (segment v2, balanced) was tested on two machine meshes. It splits by shape, not by motion: one moving part came out as a usable body, the other broke into seven, and every part was an open shell with no pivot. The `segment` command stays in the Tripo client for inspection.

## 2026-10-11

- **No `cyberstudio-3d` branch.** Marcel. The brief never defined it, and the kit is 3D-first today, so 3D tooling stays on `main`. Revisit a profile split when the FUI profile arrives.
- **Asset sidecars follow `schemas/asset-v1.json`.** Producer. One `asset.json` per asset folder. Tools own files, jobs, cost and mesh stats; people own title, status, tags and review notes. The ledger stays the source of truth for money; `ledger_ids` rolls part generations into their asset.
- **The three M1 meshes are picked after the sidecars and properties panel land.** Marcel.
- **Claude on Strix chats and Blender on the Strix ship before the rest of M1.** Marcel. Pulled forward from M3: Tailscale + SSH, `scripts/strix`, `blender-strix` MCP over an SSH tunnel, verified from a different network.

## 2026-10-09

- **Images made for 3D come as multiple angles: front, left, back and right, then `tripo_h3_1_multiview_to_3d`.** Marcel. One view leaves Tripo to invent the back. Tripo's slot order is front, left, back, right, and its left is the object's own left: the side on your right as you face the front. Verified 2026-10-09: the reverse order duplicated the mill's pendant and conveyor on both sides. Applies to objects; a flat material source (floor) stays a single image.
- **Game-res assets use Tripo `face_limit`.** Marcel asked for a lower-poly CNC mill for game-like development. Budgets in this test: machine 20k faces, robot 12k, table and tool cart 6k, cabinet 3k. Standard 2K PBR textures.

## 2026-10-08

- **The pilot project lives in its own private repo, outside the kit.** Marcel. It sits under `~/cyberstudio-projects/` and is the kit's `CYBERSTUDIO_PROJECT_ROOT`. Large files through Git LFS.
- **App renamed to CyberStudio, assistant to Cy.** Marcel. Visible names only. Internal IDs (`com.mrmak.workspace`, `MRMAK_*`) and MIT attribution stay.
- **M1 meshes go through Higgsfield's hosted Tripo (`tripo_h3_1_image_to_3d`), not the direct Tripo API.** Marcel's network has no IPv4 route and the Tripo API is IPv4-only. Higgsfield reaches over IPv6. 9 credits standard, 18 detailed (quoted 2026-10-08). Direct client `scripts/tripo/tripo.py` stays for the ROG or an IPv4 network. Fallback: Tripo web app (IPv6 via Cloudflare), manual import through `inbox/`. Same model family, so the mesh pipeline is unchanged.
- **Kit repo `marcelmcvay/cyberstudio` is public.** Marcel. Workspace setup only. No client material, no keys. Project material lives in separate private repos.
- **Blender MCP pinned to `mcp-for-blender@2.1.9`, add-on vendored at the matching commit.** Producer. The PyPI package was renamed from `blender-mcp`. The add-on in `vendor/blender-mcp/` is byte-identical to the one bundled in 2.1.9 (protocol 13). Upgrades are deliberate, not drift.
- **Blender MCP telemetry off.** Producer. `BLENDER_MCP_DISABLE_TELEMETRY=true` in `.mcp.json`. The add-on's data-sharing consent stays at its default (off). Client work flows through this server.
- **Blender MCP registered in the kit `.mcp.json`, not via the vendor's `setup` installer.** Producer. The installer edits global client configs. The kit should carry its own config.
- **glTF validation via `gltf-transform validate`.** Producer. It wraps Khronos glTF-Validator. Khronos ships no arm64 macOS binary.
- **Higgsfield vendor skills installed as a project-scoped Claude Code plugin.** Producer. Travels with the kit through `.claude/settings.json`. Mr. Mak's own `higgsfield-workflow` skill stays alongside it.
- **Higgsfield auth is OAuth (`higgsfield auth login`), not an API key.** Vendor fact. `.env` holds only a credit-to-USD rate for the ledger.
- **Kit started as a local clone of Mr. Mak 0.4.19 (`1e0c7c3`), remote `upstream`.** Producer, per brief. No `origin` until Marcel creates `marcelmcvay/cyberstudio`.

## 2026-10-07 (from the brief, Marcel)

- Reusable kit first, then the 3D profile, then the pilot project.
- Fork Mr. Mak. Keep its MIT attribution.
- Asset viewer is a local web dashboard. Not Obsidian.
- Large files in Git LFS. Blender driven through Blender MCP.
- Generation: Higgsfield and Tripo. Midjourney is manual import through the inbox.
- $300/month soft cap. Warn at 80%. Never hard-block.
- Engine fork reopened. Pipeline stays glTF-neutral up to the Blender scene. Engines install on the ROG.
- Kit on Marcel's personal GitHub. The pilot project in a private org repo. Marcel creates both.
- M2 starts with a discrete-manufacturing scene.
- Voice: Wispr Flow or typed text into the composer. Mr. Mak voice deferred (needs an OpenAI API key).
