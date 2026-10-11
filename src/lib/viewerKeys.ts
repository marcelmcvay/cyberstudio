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
