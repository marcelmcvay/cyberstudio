---
name: workspace-authoring
description: Create or maintain Workspace cards, report tabs and Markdown deliverables with consistent styling, working media previews and clear project organization.
---

# Workspace authoring

Read `AGENTS.md` and [the workflow](../../../processes/workspace-authoring.md).
Keep authored content in English unless the user explicitly requests another
language. Put related iterations in an existing card rather than creating
several cards for one task. Do not reorganize unrelated projects.

Use `workspace/_shared/report.css` and `report.js` in every HTML report, with
`data-mak-report="document"` on the root element. Use the shared tokens and
layout instead of inventing another visual theme. Basic cards and media grids
can use the sample CSS in `workspace/_shared/examples.css`.
Standard reports follow the reader's Dark, Light or System preference. Check
both dark and light when adding custom styles. An intentionally independent
design, such as a game demo, can keep its palette with `data-mak-theme="custom"`
on the root element. Do not invert or recolor media to implement a theme.

Every image must be clickable, preview at full size and offer a download.
Use local output paths, meaningful alt text and lazy loading. Keep motion
studies playable with native video controls. Wide tables must scroll within
the report. Never cover the document close button with the Files rail.

Update `workspace/workspace.json` with a stable ID, category, folder, readable
title, creation date, last updated date and steps. `sample: true` is reserved for
starter examples; ordinary work uses normal archiving behavior.

Give each card a `hero`: its newest whole-object image, relative to the card's
folder, as a small JPEG (about 720 px) rather than a full-size render. Mark 3D
tabs with `"viewer": "compare3d"` for side-by-side model comparison, or
`"viewer": "scene3d"` for several GLBs placed in one scene: a JSON manifest with
`models` (`path` relative to the manifest, `position` [x, y, z] in meters,
`rotationY` in degrees, `snap` bottom/top/none) and `cameras` presets
(`position`, `target`, optional `fov`). Point `path` at the canonical
`assets/<id>/<id>.glb` so the scene follows cleanups. A project with many cards can add top-level
`views`, such as `{"id": "models", "label": "3D", "viewer": "compare3d"}` or
`{"id": "references", "label": "References", "steps": ["References"]}`. Each view
becomes a menu tab that lists the cards with that tab, opens them on it, dims
the cards still missing it and marks new arrivals.

Open every changed tab at wide and narrow sizes. Check media and links, Markdown
rendering and image close/download controls. Preserve the selected surface during
loading. Report actual verification and any remaining limitations. Prepare
desktop changes without restarting active sessions until the user permits it.
