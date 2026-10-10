import type { WorkspaceEntity, WorkspaceView } from '../types'

/** Index of the entity's first tab that belongs to the view, or -1. */
export function viewStep(entity: WorkspaceEntity, view: WorkspaceView): number {
  return entity.steps.findIndex(
    s => (view.steps?.includes(s.name) ?? false) || (view.viewer !== undefined && s.viewer === view.viewer),
  )
}

// Arrivals. A card counts as new in a view until it is opened from there, and
// again when its hero image changes. The first visit to a view marks everything
// already present as seen, so only work that lands while you watch lights up.
const seenKey = (view: string) => `mak.seen.${view}`

export const signature = (e: WorkspaceEntity) => `${e.id}|${e.hero ?? ''}`

export function loadSeen(view: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(seenKey(view))
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

export function saveSeen(view: string, seen: Set<string>) {
  try {
    localStorage.setItem(seenKey(view), JSON.stringify([...seen]))
  } catch {
    /* Private mode or full storage: arrivals just stop being remembered. */
  }
}
