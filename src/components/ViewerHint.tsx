import { useState } from 'react'
import { VIEWER_HINT_KEY } from '../lib/viewerKeys'

function seen(): boolean {
  try {
    return localStorage.getItem(VIEWER_HINT_KEY) === 'dismissed'
  } catch {
    return false
  }
}

/**
 * First-use navigation hint over a 3D stage. Shown until dismissed once, then
 * never again on this machine. The keys stay in the toolbar titles and in Help.
 */
export default function ViewerHint({ keys }: { keys: string }) {
  const [hidden, setHidden] = useState(seen)
  if (hidden) return null
  const dismiss = () => {
    try {
      localStorage.setItem(VIEWER_HINT_KEY, 'dismissed')
    } catch {
      /* hidden for this view only */
    }
    setHidden(true)
  }
  return (
    <div className="viewer-hint" role="note">
      <span>Drag orbit · Right-drag pan · Wheel zoom · R reset</span>
      <span className="viewer-hint-keys">{keys}</span>
      <button type="button" className="viewer-hint-close" onClick={dismiss} aria-label="Dismiss the navigation hint" title="Got it">
        ×
      </button>
    </div>
  )
}
