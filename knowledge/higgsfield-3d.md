# Higgsfield image-to-3D lessons

Learned on the 9 October 2026 pipeline test (a CNC mill, a factory floor, a machine-tending cell).

## Account limits

- The Plus plan runs at most 8 jobs at once. Extra submissions fail with
  `rate_limit_reached` before a job is created, so nothing is charged. Check
  `higgsfield generate list --json`, then resubmit only the missing ones.

## Multi-angle references

- `tripo_h3_1_multiview_to_3d` takes `--image-references` in the order front,
  left, back, right. Its left is the object's own left: the side on your right
  as you face the front. In that image the object's front faces the image's left
  edge. Swapping left and right duplicates side features (a pendant or conveyor on
  both sides) and inflates depth.
- `3d_jutsu_angles` kept the mill faithful in a front view but returned
  three-quarter views when asked for 90 degree sides.
- `gpt_image_2_5` with the front image as a reference handles side and back
  views when the prompt says which edge of the image the front faces and which
  features sit near or far.
- A turnaround sheet (four panels in one `gpt_image_2_5` image, 4k, 21:9) gives
  the most consistent set for props. Crop it into panels before upload. Check
  each panel: one of four can still be a mislabelled view.
- Articulated objects (a robot arm) need the end-on views asked for explicitly:
  "the forearm points straight at the camera". Otherwise every view is a profile.
- Inconsistent views do not fail the job. They produce a shattered mesh, so
  inspect every result in Blender before using it.

## Import into Blender

- Tripo meshes face +X. Rotate the mesh data by −90° about Z to face −Y.
- The glTF importer sets quaternion rotation. `rotation_euler` has no effect until
  `rotation_mode` is changed, so transform the mesh data instead.
- `auto_size` guesses scale. Scale from a real dimension.
- `face_limit` is respected closely: 20000 gave 17.7k, 12000 gave 11.1k faces.

## Hard-surface reference sheets

Learned on 9 October 2026, restyling and meshing a set of factory machines. The
`real-to-asset` skill turns these into a workflow.

- Write the real proportions into the sheet prompt as ratios ("the front view
  is about 1.8 times as wide as it is tall") and say the back is exactly as wide
  as the front with mirrored features. Without that, one back view came out at
  72% of the front's width; with it, 92%.
- Say which face is the front. A conveyor sheet drew its narrow end as the
  front until the prompt named the long side.
- GPT Image 2.5 compresses depth. Side views come out shallower than the real
  object, and a dedicated redraw asking for a matching width came back just as
  narrow. For a plain side panel, stretching it sideways to match the opposite
  side is cheaper and meshed cleanly.
- It also tends to mirror one side onto the other: equipment that belongs on one
  side appears on both. Check that each side view carries only its own parts.
- Measuring each cut panel's drawn width over height against the real footprint
  catches these problems for free, before any mesh credits are spent.
- Keep object bodies very light grey rather than pure white on a white studio
  background, so cropping and background removal can find the edges.
- A real product photo works as a form reference ("use it only for form,
  proportions, layout and mechanism"). Detailed products can be followed too
  closely, piping and all; simplify those in the build.

## CLI details

- Pass several images by repeating `--image-references` once per file. A list
  after one flag fails with "Too many positional args" before a job is created.
- Local paths resolve against the directory the CLI runs in. The ledgered
  wrapper runs from the kit root, so give absolute paths.

## Multiview meshes

- `tripo_h3_1_multiview_to_3d` with `face_limit` 6000 and standard geometry gave
  4,808 faces and one material with 2K colour, normal and ORM maps, for 9 credits.
- The mesh follows the drawn proportions, not the real ones. Scaled from its
  height, a cabinet came out 2.56 × 1.50 m against a real 3.0 × 2.0 m. Compare
  all three dimensions after scaling and decide whether to stretch it.
- Check meshes in a background Blender (`blender -b`), not in the user's open
  session.
