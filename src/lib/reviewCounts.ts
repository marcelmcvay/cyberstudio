import { useSyncExternalStore } from 'react'
import { api, isDesktop } from '../desktop/client'

// Shared count of assets waiting for review per workspace card, read from asset sidecars
// (GET /api/assets). One fetch serves every card and menu row.
type Listing = { assets: { status: string; cards: string[] }[] }
let counts: Record<string, number> = {}
let total = 0
let started = false
const listeners = new Set<() => void>()

async function load() {
  try {
    const { assets } = await api<Listing>('/assets')
    const next: Record<string, number> = {}
    for (const asset of assets) if (asset.status === 'review') for (const card of asset.cards || []) next[card] = (next[card] || 0) + 1
    const sum = assets.filter(asset => asset.status === 'review').length
    if (sum === total && JSON.stringify(next) === JSON.stringify(counts)) return
    counts = next; total = sum
    listeners.forEach(listener => listener())
  } catch { /* the service may be starting; keep the last counts */ }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!started && isDesktop) {
    started = true
    void load()
    window.addEventListener('mrmak-workspace-changed', () => { void load() })
    window.addEventListener('focus', () => { void load() })
    window.setInterval(() => { void load() }, 30_000)
  }
  return () => { listeners.delete(listener) }
}

/** Number of assets in review that list this card; 0 when nothing needs the user. */
export const useReviewCount = (card: string) => useSyncExternalStore(subscribe, () => counts[card] || 0)

/** Assets in review across the project, each counted once. */
export const useReviewTotal = () => useSyncExternalStore(subscribe, () => total)

export const reviewLabel = (count: number) => `${count} in review`
