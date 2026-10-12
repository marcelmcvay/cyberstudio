import type { ShadingMode } from './three/viewer'

/**
 * Viewer shortcuts listen on the window. They must not take keys that belong
 * to the focused control (Space on a button, arrows in a tab list) or to the
 * system (Cmd+C, Cmd+W, Ctrl and Option chords).
 */
export function ignoreViewerKey(ev: KeyboardEvent): boolean {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return true
  const t = ev.target as HTMLElement | null
  if (!t || !t.tagName) return false
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) return true
  return !!t.closest('button, a[href], summary, [role="tab"]')
}

/*
 * One key map for every 3D viewer (compare3d and scene3d):
 *   1-8          shading, in the order below
 *   Shift+1..9   camera presets (scene3d)
 *   R reset · Space spin · arrows step tests (compare3d) · S sync · I input
 * Digits are read from `ev.code`, so Shift+1 is a camera on any keyboard layout
 * (on US layouts `ev.key` would be "!").
 */

export interface ShadingDef {
  id: ShadingMode
  label: string
  hint: string
}

export const SHADING_MODES: ShadingDef[] = [
  { id: 'wire', label: 'Wireframe', hint: 'The mesh. Quads where the export keeps them' },
  { id: 'solid', label: 'Clay', hint: 'Untextured clay. Shape and silhouette only' },
  { id: 'normals', label: 'Normals', hint: 'Geometry normals. Smoothing and flipped faces' },
  // A channel the generator never baked shows as its flat fallback (blue for a
  // missing normal map, grey for roughness). That is a finding worth filming, so
  // these stay switchable even when the map is absent.
  { id: 'pbr', label: 'Textured', hint: 'Authored materials with environment lighting' },
  { id: 'albedo', label: 'Base color', hint: 'Base color map, unlit' },
  { id: 'normalMap', label: 'Normal map', hint: 'The normal map itself. Flat blue means none was baked' },
  { id: 'rough', label: 'Roughness', hint: 'Roughness map, or the flat material value' },
  { id: 'metal', label: 'Metalness', hint: 'Metalness map, or the flat material value' },
]

/** The 1-9 digit of a key event from its physical key, or 0. */
function digitOf(ev: KeyboardEvent): number {
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(ev.code)
  if (m) return Number(m[1])
  // Synthetic events and some remote keyboards carry no code.
  return !ev.code && /^[1-9]$/.test(ev.key) ? Number(ev.key) : 0
}

/** Shading mode for a plain 1-8, or null. */
export function shadingFromKey(ev: KeyboardEvent): ShadingMode | null {
  if (ev.shiftKey) return null
  const n = digitOf(ev)
  return n >= 1 && n <= SHADING_MODES.length ? SHADING_MODES[n - 1].id : null
}

/** Zero-based camera index for Shift+1..9, or -1. */
export function cameraFromKey(ev: KeyboardEvent): number {
  if (!ev.shiftKey) return -1
  const n = digitOf(ev)
  return n ? n - 1 : -1
}

export const VIEWER_HINT_KEY = 'mak.viewerHint'
