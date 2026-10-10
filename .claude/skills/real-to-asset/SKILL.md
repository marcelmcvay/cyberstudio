---
name: real-to-asset
description: Turn real machines, equipment or props into art-directed, abstracted 3D assets. Set a project look guide, ground each asset on real products, make four-view reference sheets, check their proportions, choose a mesh route, then scale and review the mesh. Use for factory, lab, retail or vehicle scenes built from many real objects.
---

# Real product to scene asset

Use this when a scene needs many hard-surface assets that should feel real but
belong to one designed family: machines on a factory floor, lab equipment,
store fixtures, vehicles. The real product grounds size, mechanism and layout.
The project's look guide sets colour, finish and what is left out.

Read [the Higgsfield lessons](../../../knowledge/higgsfield-3d.md) before the
first paid job, and the project's own rules for spend and storage.

## 1. Look guide first

Before the first paid image, write a look guide in the project, not in the kit:

- **Principle.** How far assets abstract from reality: what they keep
  (proportions, mechanism, operator position, materials) and drop (logos, trade
  colours, decals, fine fasteners).
- **Palette.** Every painted surface from a short list with roles: main body,
  secondary panels, frames, bases, floor, one accent. Derive it from the
  client's brand palette when there is one.
- **Accent rules.** Where the accent goes (one to three parts per asset: what
  moves, what people touch, what the story points at) and where it never goes.
- **States and safety.** Status and safety colours keep their real meaning and
  stay visibly apart from the accent. An amber warning must not read as a brand
  orange.
- **A prompt style block** with an `{accent}` slot, a studio sentence and a
  sheet template. Keep them in a machine-readable file next to the guide, so
  every prompt is built from the same words.
  [templates/style.json](templates/style.json) is a starting point.

Keep main bodies very light grey rather than pure white when the studio
background is white. Cropping and background removal need the edge.

## 2. Ground each asset on real products

For each asset type, find one to three real products: maker page, published
dimensions with their source, and the visual traits worth borrowing. Write
**keep**, **drop**, **accent** and a **size check** against the planned
footprint. Save a few product photos for internal reference with their source
and licence. Never publish third-party images or put them in a public repo.

## 3. Design render

One three-quarter render per asset from the catalog description plus the style
block, with the real size written out. A real product photo can go in as a
reference with "use it only for form, proportions, layout and mechanism; do not
copy its logos, colours or text". Strip colour words from the catalog
description so the style block alone sets colour. Watch for renders that copy
one maker's form too closely, and simplify those in the build.

## 4. Four-view sheet, cut and check

Make one sheet from the accepted design render: four views in a row, front,
own left, back, own right. Write the real proportions into the prompt as ratios
("the front view is about 1.8 times as wide as it is tall"), say which face is
the front, and state that the back is exactly as wide as the front with
mirrored features. Name where key parts sit in each view.

Cut the sheet with [scripts/crop_sheet.py](scripts/crop_sheet.py). It finds the
four objects by their white gaps and prints each panel's width over height.
Compare those with the spec footprint: front and back against w/h, sides
against d/h. Views from one sheet share a scale, so also compare front with back
and left with right. This catches a narrow back, a mislabelled side or a short
module before anything is meshed.

When one plain side keeps coming back too shallow, stretching it sideways to
match the opposite side with [scripts/match_view.py](scripts/match_view.py) is
cheaper than more redraws. Record that you did it.

## 5. Choose the mesh route

| The object is mostly | Route |
| --- | --- |
| Solid enclosures, cabinets, cast frames | Multiview image-to-3D (Tripo through Higgsfield), slots front, own left, back, own right |
| Frames, guarding, mesh, clear panels, conveyors, racking | Parametric build in Blender to the spec size; images set the look only |
| A mix | Split it: enclose the solid part with multiview, build the rest |

Record the route and the reason with the references. Ask the user to approve
the route before the first mesh.

## 6. Orient, scale and review the mesh

Run [scripts/check_mesh.py](scripts/check_mesh.py) in a background Blender, not
the user's open session. It reports faces, materials and texture sizes, turns
a Tripo mesh to face −Y, scales it from the height, renders five orthographic
review shots and exports the normalised glTF. Multiview meshes follow the
drawn proportions, not the real ones, so compare the scaled width and depth with
the spec and decide with the user whether to stretch the mesh or adjust the
spec.

## 7. Record and present

Keep one record per asset with every image, its job ID, prompt, settings,
credits, status (source, used, look reference, rejected, superseded), the
measured proportions, the review notes, the build route and the mesh. Group
images by revision round, so a restyle does not erase the history. Generate the
asset's card tabs from that record: Spec, References, Real world and 3D model.

At the end of every run, update a **review queue** page in the project: what
the run made, each item that needs the user's eyes with a link to its tab, the
spend, and what was not done. A finished generation is not an accepted asset.

Example: "Ground the stretch wrapper on two real products, make its design
render and sheet in the house style, and tell me whether it should be meshed or
built." Expected result: a Real world tab with sources and a size check, a
References tab with measured views, and a route recommendation waiting for
approval.
