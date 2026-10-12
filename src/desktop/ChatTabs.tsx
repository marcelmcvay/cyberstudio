import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AgentInfo, ChatSession } from './types'
import { api, reportError } from './client'
import { chatActivityLabel, chatBadgeText, chatState } from './chatActivity'
import { Icon } from './Icons'
import SessionLogo from './SessionLogo'

type Drag = { id: string; pinned: boolean; startX: number; startY: number; moving: boolean }
type Drop = { id: string; position: 'before' | 'after' }

export default function ChatTabs({ items, selectedId, agents, choose, close }: {
  items: ChatSession[]; selectedId?: string; agents: AgentInfo[]; choose: (id: string) => void; close: (id: string) => void
}) {
  const gesture = useRef<Drag | null>(null)
  const drop = useRef<Drop | null>(null)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState<{ id: string; x: number; y: number } | null>(null)
  const [target, setTarget] = useState<Drop | null>(null)
  const clear = () => { gesture.current = null; drop.current = null; setDragging(null); setTarget(null) }
  const clearRef = useRef(clear)
  useEffect(() => { clearRef.current = clear })
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => { if (event.key === 'Escape') clearRef.current() }
    window.addEventListener('keydown', cancel)
    return () => window.removeEventListener('keydown', cancel)
  }, [])
  function begin(event: React.PointerEvent<HTMLButtonElement>, item: ChatSession) {
    if (event.button !== 0) return
    suppressClick.current = false
    gesture.current = { id: item.id, pinned: item.pinned, startX: event.clientX, startY: event.clientY, moving: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const current = gesture.current
    if (!current) return
    if (!current.moving && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return
    current.moving = true; suppressClick.current = true
    setDragging({ id: current.id, x: event.clientX, y: event.clientY })
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-chat-tab]')
    const item = items.find(item => item.id === element?.dataset.chatTab)
    let next: Drop | null = null
    if (element && item && item.id !== current.id && item.pinned === current.pinned) {
      const rect = element.getBoundingClientRect()
      next = { id: item.id, position: event.clientX >= rect.left + rect.width / 2 ? 'after' : 'before' }
    }
    drop.current = next; setTarget(next)
  }
  function finish() {
    const current = gesture.current, destination = drop.current
    clear()
    if (current?.moving && destination) api(`/sessions/${current.id}/reorder`, { targetId: destination.id, position: destination.position }).catch(reportError)
  }
  const strip = useRef<HTMLDivElement>(null)
  const closing = useRef<string | null>(null)
  function closeTab(id: string) { closing.current = id; close(id) }
  useEffect(() => {
    // After a close, keep keyboard focus in the strip instead of dropping it to the page.
    if (!closing.current || items.some(item => item.id === closing.current)) return
    closing.current = null
    const focused = document.activeElement
    if (focused && focused !== document.body && focused.isConnected) return
    strip.current?.querySelector<HTMLButtonElement>('.chat-tab.selected .chat-tab-select')?.focus()
  }, [items, selectedId])
  // One tab stop for the strip: arrows, Home and End move focus; Enter opens; Delete closes.
  function keys(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const tabs = [...(strip.current?.querySelectorAll<HTMLButtonElement>('.chat-tab-select') || [])]
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); closeTab(items[index].id) }
    else if (next >= 0) { event.preventDefault(); tabs[next]?.focus() }
  }
  // One row that scrolls sideways; tabs out of view are listed under "N more" (C-14).
  const [hidden, setHidden] = useState<string[]>([])
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)
  const measure = useCallback(() => {
    const element = strip.current
    if (!element) return
    const box = element.getBoundingClientRect()
    const next = [...element.querySelectorAll<HTMLElement>('[data-chat-tab]')].filter(tab => { const rect = tab.getBoundingClientRect(); return rect.left < box.left - 2 || rect.right > box.right + 2 }).map(tab => tab.dataset.chatTab || '')
    setHidden(current => current.length === next.length && current.every((id, index) => id === next[index]) ? current : next)
  }, [])
  useLayoutEffect(() => {
    const element = strip.current
    if (!element) return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    element.addEventListener('scroll', measure, { passive: true })
    // A mouse wheel scrolls the row sideways.
    const wheel = (event: WheelEvent) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && element.scrollWidth > element.clientWidth) { event.preventDefault(); element.scrollLeft += event.deltaY } }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('scroll', measure); element.removeEventListener('wheel', wheel) }
  }, [measure])
  useLayoutEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-chat-tab="${CSS.escape(selectedId || '')}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
  }, [items, selectedId, measure])
  useEffect(() => {
    if (!overflowOpen) return
    const outside = (event: PointerEvent) => { if (!overflowRef.current?.contains(event.target as Node)) setOverflowOpen(false) }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [overflowOpen])
  const hiddenItems = items.filter(item => hidden.includes(item.id))
  if (overflowOpen && !hiddenItems.length) setOverflowOpen(false)
  function overflowKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    const entries = [...(overflowRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || [])]
    const index = entries.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOverflowOpen(false); overflowRef.current?.querySelector<HTMLButtonElement>('.chat-tabs-more')?.focus() }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); entries[(index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length]?.focus() }
  }
  const dragged = items.find(item => item.id === dragging?.id)
  return <div className="chat-tabs-wrap"><div ref={strip} className={`chat-tabs ${dragging ? 'is-reordering' : ''}`} role="tablist" aria-label="Agent chats">
    {items.map((item, index) => <div key={item.id} data-chat-tab={item.id} className={`chat-tab tab-${chatState(item)} ${selectedId === item.id ? 'selected' : ''} ${item.tabColor ? 'has-color' : ''} ${dragging?.id === item.id ? 'dragging' : ''} ${target?.id === item.id ? `drop-${target.position}` : ''}`} style={{ '--tab-accent': item.tabColor || '#e2a7a0' } as React.CSSProperties}>
      <button role="tab" aria-selected={selectedId === item.id} tabIndex={selectedId === item.id ? 0 : -1} onKeyDown={event => keys(event, index)} onClick={event => { if (!suppressClick.current || event.detail === 0) choose(item.id) }} onPointerDown={event => begin(event, item)} onPointerMove={move} onPointerUp={finish} onPointerCancel={clear} onLostPointerCapture={clear}
        className="chat-tab-select" aria-label={`${item.name} · ${chatActivityLabel(item)}`} title={`${agents.find(a => a.id === item.agent)?.label} · ${item.name}\n${chatActivityLabel(item)}\nDrag to reorder ${item.pinned ? 'pinned' : 'unpinned'} tabs · Delete to close\n${item.cwd}`}>
        <span style={{ color: agents.find(a => a.id === item.agent)?.color }}><SessionLogo session={item} /></span><span className="chat-tab-name">{item.name}</span>{chatBadgeText(item) && <span className={`chat-tab-badge badge-${chatState(item)}`}>{chatBadgeText(item)}</span>}{item.pinned && <span className="tab-pinned" title="Pinned tab · stays first"><Icon name="pin" size={11} /></span>}
      </button>
      <button className="chat-tab-close" tabIndex={-1} onClick={() => closeTab(item.id)} aria-label={`Close ${item.name}`} title="Close tab · keep in History"><Icon name="close" size={12} /></button>
    </div>)}
    {dragging && dragged && <div className="chat-tab-ghost" style={{ left: dragging.x + 13, top: dragging.y + 13, color: dragged.tabColor || '#d8d0cb' }} aria-hidden="true"><SessionLogo session={dragged} /><span>{dragged.name}</span>{dragged.pinned && <Icon name="pin" size={12} />}</div>}
  </div>
  {hiddenItems.length > 0 && <div className="chat-tabs-overflow" ref={overflowRef} onKeyDown={overflowKeys}>
    <button className="chat-tabs-more" aria-haspopup="menu" aria-expanded={overflowOpen} onClick={() => { setOverflowOpen(value => !value); requestAnimationFrame(() => overflowRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()) }} title="Tabs out of view">{hiddenItems.length} more</button>
    {overflowOpen && <div className="chat-tabs-menu" role="menu" aria-label="Tabs out of view">{hiddenItems.map(item => <button key={item.id} role="menuitem" tabIndex={-1} className={selectedId === item.id ? 'selected' : ''} onClick={() => { setOverflowOpen(false); choose(item.id) }} style={{ '--tab-accent': item.tabColor || 'transparent' } as React.CSSProperties}><span style={{ color: agents.find(a => a.id === item.agent)?.color }}><SessionLogo session={item} size={15} /></span><span className="chat-tab-name">{item.name}</span>{chatBadgeText(item) && <small className={`badge-${chatState(item)}`}>{chatBadgeText(item)}</small>}</button>)}</div>}
  </div>}
  </div>
}
