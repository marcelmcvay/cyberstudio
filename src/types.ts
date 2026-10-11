export interface WorkspaceStep {
  name: string
  path: string
  /**
   * Omitted = HTML in an iframe, formatted Markdown, or an image preview,
   * selected by file extension. `compare3d` = a Compare3DManifest JSON and
   * the step renders the side-by-side 3D viewer instead. `scene3d` = a
   * Scene3DManifest JSON: several GLBs placed in one scene, in meters.
   */
  viewer?: 'compare3d' | 'scene3d'
}

export interface WorkspaceEntity {
  id: string
  title: string
  description: string
  /** Optional project emblem, relative to this entity's folder. */
  icon?: string
  type: 'standalone' | 'group'
  category: string
  created: string
  /** Last day an agent touched this entity; dashboard sorts/archives by it. */
  updated?: string
  folder: string
  steps: WorkspaceStep[]
  /** Tab to open for a card link without an explicit step; otherwise use latest. */
  defaultStep?: number
  status: 'active' | 'done' | 'archived'
  pinned?: boolean
  /** Starter examples remain visible until explicitly archived. */
  sample?: boolean
  /** The card's hero: its newest whole-object image, relative to this entity's folder. */
  hero?: string
}

/**
 * A review view in the menu: every card with a matching tab, opened straight on
 * that tab, next to the cards that do not have it yet in any category that takes
 * part in a view.
 */
export interface WorkspaceView {
  id: string
  label: string
  /** Tab names that belong to the view, matched exactly. */
  steps?: string[]
  /** Or any tab rendered by this viewer. */
  viewer?: WorkspaceStep['viewer']
}

export interface WorkspaceState {
  entities: WorkspaceEntity[]
  /** Extra menu views next to the default grouping by category. */
  views?: WorkspaceView[]
}

/* ─── 3D comparison steps ─────────────────────────────────────────────────
   A manifest lives inside the entity folder next to a models/ directory. Paths
   in `file` are relative to the manifest. Model binaries stay local (gitignored,
   they run to tens of MB) — the manifest and the card are what get versioned. */

export interface Compare3DModel {
  /** Path to the .glb, relative to the manifest file. */
  file: string
  /** Shown above the pane — the generator name and version. */
  label: string
  /** Logo shown next to the label, relative to the manifest file. */
  logo?: string
  /** Optional second line: version, settings, generation time. */
  note?: string
  /** Optional colour for the pane label. */
  accent?: string
  /** Extra yaw in degrees, for exports that come out facing the wrong way. */
  rotationY?: number
  /**
   * Cover name shown instead of `label` while Redact is on. For models under
   * embargo: the card is filmed with the alias up, and the toggle reveals the
   * real name for the user's own use.
   */
  alias?: string
}

export interface Compare3DTest {
  id: string
  name: string
  /** `lowpoly` opens on the wireframe and hides texture-channel modes. */
  kind: 'lowpoly' | 'highpoly'
  /** Overrides the per-kind default opening mode. */
  defaultMode?: 'wire' | 'quads' | 'solid' | 'normals' | 'pbr' | 'albedo' | 'normalMap' | 'rough' | 'metal'
  note?: string
  /**
   * The reference image every model in this test was generated from, relative
   * to the manifest. Rendered as a thumbnail in the bar and full size on click
   * — without it there is no way to judge a result against its input.
   */
  input?: string
  models: Compare3DModel[]
}

export interface Compare3DManifest {
  title?: string
  tests: Compare3DTest[]
}

/* ─── 3D scene steps ──────────────────────────────────────────────────────
   One scene, several GLBs placed in meters. Paths are relative to the
   manifest and may point outside the card (for example ../../assets/x/x.glb),
   so the scene always shows the current canonical mesh. */

export interface Scene3DModel {
  /** Path to the .glb, relative to the manifest file. */
  path: string
  /** Readout name. Defaults to the file name. */
  label?: string
  /** Where the model's box bottom centre lands, in meters (x, y up, z). */
  position?: [number, number, number]
  /** Yaw in degrees. */
  rotationY?: number
  /**
   * `bottom` (default) stands the model on y; `top` sinks a slab so its top
   * face is y; `none` trusts the exported origin.
   */
  snap?: 'bottom' | 'top' | 'none'
  /** Centre the footprint on x/z (default true). False trusts the origin. */
  center?: boolean
}

export interface Scene3DCamera {
  id: string
  label: string
  /** Camera position in meters. */
  position: [number, number, number]
  /** Orbit target in meters. */
  target: [number, number, number]
  /** Vertical field of view in degrees. Default 45. */
  fov?: number
}

export interface Scene3DManifest {
  title?: string
  models: Scene3DModel[]
  /** Presets, switchable with the number keys. The first is the opening view. */
  cameras?: Scene3DCamera[]
  /** Opening shading. Default `pbr`. */
  defaultMode?: 'pbr' | 'solid' | 'wire'
  /** Key-light shadows. Default true. */
  shadows?: boolean
  /** Triangle budget for the readout's total line. */
  budget?: { triangles?: number }
}
