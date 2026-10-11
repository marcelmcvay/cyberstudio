import { useState } from 'react'

// Arrow keys move a highlight through a filtered list; Enter opens it.
export function useListNavigation(count: number, open: (index: number) => void) {
  const [index, setIndex] = useState(0)
  const active = Math.min(index, Math.max(0, count - 1))
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || !count) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIndex((active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count) }
    else if (event.key === 'Enter') { event.preventDefault(); open(active) }
  }
  return { active, reset: () => setIndex(0), onKeyDown }
}
