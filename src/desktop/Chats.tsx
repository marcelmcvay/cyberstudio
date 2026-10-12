import { useCallback, useEffect, useRef, useState } from 'react'
import { api, chatKeys, chatShortcut, desktopState, errorData, handledByKey, markKeyHandled, onMenu, pickFolder, reportError, selectChat, sendEvent, useDesktop, windowAction, type ChatShortcut } from './client'
import type { AgentId, AgentInfo, BusyChat, ChatSession, Effort, NativeConversation } from './types'
import { AgentLogo, Icon, Nose } from './Icons'
import TerminalPane from './TerminalPane'
import SessionLogo from './SessionLogo'
import { chatActivityLabel, checksForeground, closeConfirmation, needsYou, stoppedChatState } from './chatActivity'
import ChatTabs from './ChatTabs'
import { orderedChats, tabColors } from './chatOrder'
import { osAccount, osName, pasteKey } from './platform'
import { useListNavigation } from './useListNavigation'

function agentNote(item: AgentInfo) {
  if (!item.available) return item.id === 'strix' ? 'Add Host strix to ~/.ssh/config' : item.id === 'shell' ? 'No local shell found' : `Install the ${item.command || item.id} CLI`
  return item.id === 'shell' ? 'Local terminal' : item.id === 'opencode' ? 'Your providers' : item.id === 'strix' ? 'ROG Strix GPU' : 'Your CLI account'
}

// Reasoning effort, for the agents whose CLI takes one (C-27).
const effortAgents: AgentId[] = ['codex', 'claude', 'strix']
const efforts: { value: Effort; label: string }[] = [{ value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'xhigh', label: 'Extra high' }, { value: 'max', label: 'Max' }]
const effortLabel = (value?: string) => efforts.find(item => item.value === value)?.label || value || ''

const focusable = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,a[href],[tabindex]')]
  .filter(element => element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length > 0 && !(element.tagName !== 'SUMMARY' && element.closest('details:not([open])')))

// A modal dialog: focus moves in and stays in (Tab and Shift+Tab cycle), Escape
// closes, and focus returns to where it was. Tab is handled here so every
// control is reachable in WebKit, whatever the system keyboard setting (C-21).
function useModal(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close)
  useEffect(() => { closeRef.current = close })
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = ref.current
    if (element && !element.contains(document.activeElement)) (element.querySelector<HTMLElement>('[data-autofocus]') || focusable(element)[0])?.focus()
    const keys = (event: KeyboardEvent) => {
      if (!element || event.defaultPrevented) return
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      const items = focusable(element)
      if (!items.length) return
      event.preventDefault()
      const index = items.indexOf(document.activeElement as HTMLElement)
      // Move to the next control that actually takes focus.
      for (let step = 1; step <= items.length; step++) {
        const next = items[index < 0 ? (event.shiftKey ? items.length - step : step - 1) : (index + (event.shiftKey ? -step : step) + items.length * 2) % items.length]
        next.focus()
        if (document.activeElement === next) break
      }
    }
    document.addEventListener('keydown', keys, true)
    return () => { document.removeEventListener('keydown', keys, true); if (previous?.isConnected) previous.focus() }
  }, [ref])
}

function NewChat({ close }: { close: () => void }) {
  const state = useDesktop()
  const [agent, setAgent] = useState<AgentId>(state.settings.defaultAgent)
  const [name, setName] = useState('')
  const [cwd, setCwd] = useState(state.repo)
  const [bypass, setBypass] = useState(state.settings.defaultBypass)
  const [resumeId, setResumeId] = useState('')
  const [chosenEffort, setChosenEffort] = useState<Partial<Record<AgentId, Effort>>>(() => state.settings.agentEffort || {})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const folderField = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLFormElement>(null)
  const picker = useRef<HTMLDivElement>(null)
  useModal(dialog, close)
  const folderError = /^That (folder|path) /.test(error)
  const hasEffort = effortAgents.includes(agent)
  const effort = chosenEffort[agent] || 'xhigh'
  const recent = (state.settings.recentFolders || []).filter(folder => folder !== cwd).slice(0, 5)
  async function launch(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const session = await api<ChatSession>('/sessions', { agent, name: name.trim() || undefined, cwd, bypass, resumeId: resumeId.trim() || undefined, effort: hasEffort ? effort : undefined })
      await api('/settings', { defaultAgent: agent, defaultBypass: bypass, ...(hasEffort ? { agentEffort: { [agent]: effort } } : {}) })
      selectChat(session.id); close()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message); setBusy(false)
      if (/^That (folder|path) /.test(message)) folderField.current?.focus()
    }
  }
  async function chooseFolder() {
    try { const folder = await pickFolder(cwd); if (folder) { setCwd(folder); setError('') } }
    catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }
  // One tab stop for the agent picker; arrow keys choose (radio group).
  function agentKeys(event: React.KeyboardEvent) {
    const available = state.agents.filter(item => item.available)
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const current = Math.max(0, available.findIndex(item => item.id === agent))
    const next = available[event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (current + step + available.length) % available.length]
    if (!next) return
    setAgent(next.id)
    requestAnimationFrame(() => picker.current?.querySelector<HTMLButtonElement>(`[data-agent="${next.id}"]`)?.focus())
  }
  return <div className="desk-scrim" onClick={close}><form ref={dialog} className="desk-dialog" role="dialog" aria-modal="true" aria-labelledby="new-chat-title" onClick={event => event.stopPropagation()} onSubmit={launch}>
    <div className="desk-dialog-heading"><div><span className="desk-eyebrow">A PLACE FOR THE NEXT THING</span><h2 id="new-chat-title">New chat</h2></div><button type="button" className="desk-icon" onClick={close} aria-label="Close"><Icon name="close" /></button></div>
    <div ref={picker} className="agent-picker" role="radiogroup" aria-label="Agent" onKeyDown={agentKeys}>{state.agents.map(item => <button type="button" role="radio" aria-checked={agent === item.id} tabIndex={agent === item.id ? 0 : -1} data-agent={item.id} key={item.id} className={`agent-choice ${agent === item.id ? 'selected' : ''}`} onClick={() => setAgent(item.id)} disabled={!item.available} style={{ '--agent-color': item.color } as React.CSSProperties}><span className="agent-mark"><AgentLogo agent={item.id} size={23} /></span><span>{item.label}<small>{agentNote(item)}</small></span>{agent === item.id && <span className="choice-check" aria-hidden="true">✓</span>}</button>)}</div>
    <label className="desk-field">Chat name <small>English only</small><input data-autofocus autoFocus placeholder="e.g. Dream Game · animations" value={name} onChange={event => setName(event.target.value)} maxLength={100} /></label>
    <div className="desk-field folder-field"><label htmlFor="new-chat-folder">Working folder</label><div className="folder-row"><input id="new-chat-folder" ref={folderField} value={cwd} onChange={event => setCwd(event.target.value)} required spellCheck={false} aria-invalid={folderError || undefined} aria-describedby={folderError ? 'new-chat-error' : undefined} /><button type="button" className="desk-secondary folder-choose" onClick={chooseFolder} disabled={!state.connected}>Choose folder…</button></div>
      {recent.length > 0 && <div className="recent-folders" role="group" aria-label="Recent folders"><small>Recent</small>{recent.map(folder => <button type="button" key={folder} title={folder} onClick={() => { setCwd(folder); setError('') }}><Icon name="folder" size={12} />{folder.split(/[\\/]/).filter(Boolean).slice(-1)[0] || folder}</button>)}</div>}
    </div>
    {hasEffort && <label className="desk-field effort-field">Reasoning effort <small>Remembered for {state.agents.find(item => item.id === agent)?.label}</small><select value={effort} onChange={event => setChosenEffort(current => ({ ...current, [agent]: event.target.value as Effort }))}>{efforts.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>}
    {agent !== 'shell' && <><label className="desk-check"><input type="checkbox" tabIndex={0} checked={bypass} onChange={event => setBypass(event.target.checked)} /><span>{agent === 'opencode' ? 'Auto-approve permission prompts' : 'Bypass agent permission prompts'}<small>{agent === 'opencode' ? 'Explicit deny rules in OpenCode still apply.' : `Same access as your usual terminal: ${osAccount} and its files.`}</small></span></label><details className="desk-details"><summary>Resume an existing CLI conversation</summary><p>For a conversation started outside CyberStudio, copy its ID from your CLI's session details or resume picker. Chats created here return automatically.</p><label className="desk-field">Native session ID<input value={resumeId} onChange={event => setResumeId(event.target.value)} placeholder="Optional session ID" /></label></details></>}
    {error && <p id="new-chat-error" className="desk-error-inline" role="alert">{error}</p>}
    {!state.connected && <p id="new-chat-offline" className="desk-offline-inline" role="status">The local service is offline. Open chat comes back when it reconnects.</p>}
    <button className="desk-primary" disabled={busy || !state.connected} aria-describedby={!state.connected ? 'new-chat-offline' : undefined}>{busy ? 'Opening…' : 'Open chat'}<Icon name="arrow" size={16} /></button>
  </form></div>
}

// Closing a working chat stops it. Ask first (C-05).
function CloseConfirm({ text, confirm, cancel }: { text: string; confirm: () => void; cancel: () => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  useModal(dialog, cancel)
  return <div className="desk-scrim" onClick={cancel}><div ref={dialog} className="desk-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="close-confirm-text" onClick={event => event.stopPropagation()}>
    <p id="close-confirm-text">{text}</p>
    <div className="confirm-actions"><button type="button" className="desk-secondary" data-autofocus onClick={cancel}>Cancel</button><button type="button" className="desk-primary danger" onClick={confirm}>Stop and close</button></div>
  </div></div>
}

// The chat's own conversation is missing: pick another one the CLI kept for this folder (C-18).
function ConversationPicker({ session, close, pick }: { session: ChatSession; close: () => void; pick: (nativeId: string) => void }) {
  const dialog = useRef<HTMLDivElement>(null)
  useModal(dialog, close)
  const [result, setResult] = useState<{ conversations: NativeConversation[]; note?: string } | null>(null)
  const [failed, setFailed] = useState('')
  const [typed, setTyped] = useState('')
  useEffect(() => {
    let live = true
    api<{ conversations: NativeConversation[]; note?: string }>(`/sessions/${session.id}/conversations`).then(value => { if (live) setResult(value) }).catch(error => { if (live) setFailed(error instanceof Error ? error.message : String(error)) })
    return () => { live = false }
  }, [session.id])
  const folder = session.cwd.split(/[\\/]/).filter(Boolean).slice(-1)[0] || session.cwd
  return <div className="desk-scrim" onClick={close}><div ref={dialog} className="desk-dialog conversation-picker" role="dialog" aria-modal="true" aria-labelledby="pick-conversation-title" onClick={event => event.stopPropagation()}>
    <div className="desk-dialog-heading"><div><span className="desk-eyebrow">{session.name}</span><h2 id="pick-conversation-title">Pick a conversation</h2></div><button type="button" className="desk-icon" onClick={close} aria-label="Close"><Icon name="close" /></button></div>
    <p className="desk-muted">Recent conversations in {folder}, newest first.</p>
    <div className="conversation-list">{!result && !failed && <p className="desk-muted">Looking for conversations…</p>}{failed && <p className="desk-error-inline" role="alert">{failed}</p>}
      {result?.conversations.map(item => <button type="button" key={item.id} onClick={() => pick(item.id)}><strong>{item.prompt || 'No prompt text'}</strong><small>{new Date(item.updatedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {item.id.slice(0, 8)}</small></button>)}
      {result && !result.conversations.length && <p className="desk-muted">{result.note || 'No other conversations found for this folder.'}</p>}</div>
    <form className="conversation-manual" onSubmit={event => { event.preventDefault(); if (typed.trim()) pick(typed.trim()) }}><label className="desk-field">Or paste a session ID<input value={typed} onChange={event => setTyped(event.target.value)} spellCheck={false} placeholder="Session ID from the CLI" /></label><button className="desk-secondary" disabled={!typed.trim()}>Resume</button></form>
  </div></div>
}

function History({ close, choose }: { close: () => void; choose: (id: string) => void }) {
  const state = useDesktop()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [opening, setOpening] = useState<string | null>(null)
  const items = [...state.sessions].filter(item => (filter === 'all' || (filter === 'pinned' ? item.pinned : item.agent === filter)) && `${item.name} ${item.agent} ${item.cwd} ${item.preview || ''}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || String(b.updatedAt).localeCompare(String(a.updatedAt)))
  async function open(item: ChatSession) {
    if (opening) return
    setOpening(item.id)
    try { if (!item.open || item.status !== 'running') await api(`/sessions/${item.id}/resume`, { fromHistory: true }); choose(item.id); close() }
    // A failed reopen still opens the tab, with its saved screen and the reason (C-01, C-18).
    catch (error) { if (errorData(error)?.session) { choose(item.id); close() } else reportError(error) } finally { setOpening(null) }
  }
  const keys = useListNavigation(items.length, index => open(items[index]))
  // A filter for each installed agent, or one with saved conversations, in agent order.
  const filters = [['all', 'All'], ['pinned', 'Pinned'], ...state.agents.filter(agent => agent.available || state.sessions.some(item => item.agent === agent.id)).map(agent => [agent.id, agent.label])]
  const filterLabel = state.agents.find(agent => agent.id === filter)?.label
  return <section className="chat-history" aria-label="Chat history">
    <header><span><Icon name="history" /><strong>History</strong><small>{state.sessions.length} conversations</small></span><button className="desk-icon" aria-label="Close history" onClick={close}><Icon name="close" /></button></header>
    <div className="history-search"><Icon name="search" size={16} /><input autoFocus value={query} onChange={event => { setQuery(event.target.value); keys.reset() }} onKeyDown={keys.onKeyDown} placeholder="Find a conversation…" aria-label="Search chat history" /></div>
    <div className="history-filters">{filters.map(([value, label]) => <button key={value} className={filter === value ? 'selected' : ''} onClick={() => { setFilter(value); keys.reset() }}>{label}</button>)}</div>
    <div className="history-list">{items.map((item, index) => <article key={item.id} className={`history-item ${index === keys.active ? 'highlighted' : ''}`} ref={element => { if (element && index === keys.active) element.scrollIntoView({ block: 'nearest' }) }}>
      <button className="history-open" onClick={() => open(item)} disabled={!!opening} title={`Open ${item.name} · ${chatActivityLabel(item)}`}><span className="history-agent" style={{ color: state.agents.find(agent => agent.id === item.agent)?.color }}><SessionLogo session={item} size={24} /></span><span><strong>{item.name}</strong><small>{state.agents.find(agent => agent.id === item.agent)?.label} · {item.open ? 'Open' : new Date(item.updatedAt || item.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {item.cwd.split(/[\\/]/).filter(Boolean).slice(-1)[0]}</small>{item.preview && <p>{item.preview}</p>}</span><Icon name={opening === item.id ? 'refresh' : 'arrow'} size={16} /></button>
      <button className={`desk-icon history-pin ${item.pinned ? 'active' : ''}`} aria-label={`${item.pinned ? 'Unpin' : 'Pin'} ${item.name}`} title={item.pinned ? 'Unpin tab' : 'Pin tab (stays first)'} onClick={() => api(`/sessions/${item.id}`, { pinned: !item.pinned }, 'PATCH').catch(reportError)}><Icon name="pin" size={15} /></button>
    </article>)}{!items.length && <p className="desk-muted">{query ? 'No matching conversations.' : filter === 'pinned' ? 'Pin a conversation to keep it close at hand.' : filterLabel ? `No ${filterLabel} conversations yet.` : 'Closed chats will be here when you need them.'}</p>}</div>
    <footer>Close a tab to put it away. Its conversation stays here.</footer>
  </section>
}

function Switcher({ items, selectedId, query, setQuery, choose }: { items: ChatSession[]; selectedId?: string; query: string; setQuery: (value: string) => void; choose: (id: string) => void }) {
  const state = useDesktop()
  const keys = useListNavigation(items.length, index => choose(items[index].id))
  // Read during render, before autoFocus moves focus into the search field.
  const [previous] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null)
  // Escape or a second shortcut press returns focus to where it was.
  useEffect(() => () => { if (previous?.isConnected) previous.focus() }, [previous])
  return <div className="chat-switcher"><div className="switcher-search"><Icon name="search" size={16} /><input autoFocus placeholder="Find any chat…" value={query} onChange={event => { setQuery(event.target.value); keys.reset() }} onKeyDown={keys.onKeyDown} aria-label="Find a chat" /></div><div className="switcher-list">{items.map((item, index) => <button key={item.id} onClick={() => choose(item.id)} className={`${selectedId === item.id ? 'selected' : ''} ${index === keys.active ? 'highlighted' : ''}`} ref={element => { if (element && index === keys.active) element.scrollIntoView({ block: 'nearest' }) }}><span className="agent-letter" style={{ color: state.agents.find(a => a.id === item.agent)?.color }}><SessionLogo session={item} size={19} /></span><span><strong>{item.name}</strong><small>{item.cwd}</small></span><span className="switcher-state">{chatActivityLabel(item)}</span></button>)}{!items.length && <p className="desk-muted">No matching chats.</p>}</div></div>
}

// "Keep Chats above other windows": stacked windows, not the tab pin (C-30).
const OnTopIcon = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9h12v12H3Z" opacity=".55" /><path d="M8 3h13v13H8Z" /><path d="M14.5 12.5v-6M12 9l2.5-2.5L17 9" /></svg>

export default function Chats() {
  const state = useDesktop()
  const [newChat, setNewChat] = useState(false)
  const [switcher, setSwitcher] = useState(false)
  const [history, setHistory] = useState(false)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState('')
  const [pinned, setPinned] = useState(false)
  const [fontSize, setFontSize] = useState(() => state.settings.terminalFontSize || 13)
  const [attachmentNotice, setAttachmentNotice] = useState({ id: '', text: '' })
  const [confirmClose, setConfirmClose] = useState<{ id: string; text: string } | null>(null)
  const [pickingConversation, setPickingConversation] = useState(false)
  const [effortMenu, setEffortMenu] = useState(false)
  const attachmentStatus = useCallback((id: string, text: string) => setAttachmentNotice(current => text || current.id === id ? { id, text } : current), [])
  const active = orderedChats(state.sessions)
  // "Needs you" filters the strip to chats waiting on input or holding an unread result (C-29).
  const [needsFilter, setNeedsFilter] = useState(false)
  const needing = active.filter(needsYou)
  if (needsFilter && !needing.length) setNeedsFilter(false)
  const strip = needsFilter ? needing : active
  const session = active.find(item => item.id === state.selectedId) || active[0]
  const agent = state.agents.find(item => item.id === session?.agent)
  const running = session?.status === 'running' || session?.status === 'starting'
  const stopped = session ? stoppedChatState(session) : null
  const filtered = active.filter(item => `${item.name} ${item.agent} ${item.cwd}`.toLowerCase().includes(query.toLowerCase()))
  const choose = (id: string) => { selectChat(id); setSwitcher(false); setMenu(false); setHistory(false); setRenaming(false); setEffortMenu(false) }
  const closeChat = (id: string) => api(`/sessions/${id}`, {}, 'DELETE').catch(reportError)
  // Every close (×, Delete, the shortcut, the menus) asks first when it would stop work (C-05).
  const requestClose = useCallback(async (id: string) => {
    const current = desktopState()
    const item = current.sessions.find(chat => chat.id === id)
    if (!item) return
    const label = current.agents.find(entry => entry.id === item.agent)?.label || 'The agent'
    let text = closeConfirmation(item, label)
    if (!text && checksForeground(item)) {
      try { const { busy } = await api<{ busy: BusyChat | null }>(`/sessions/${id}/busy`); if (busy) text = closeConfirmation(item, label, busy.command) }
      catch { /* The service is unreachable; the close below reports that. */ }
    }
    if (text) setConfirmClose({ id, text }); else closeChat(id)
  }, [])
  // A resume that fails leaves the reason on the tab; only other errors need the banner.
  const resumeChat = (id: string, body: Record<string, unknown> = {}) => api(`/sessions/${id}/resume`, body).catch(error => { if (!errorData(error)?.session) reportError(error) })
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!effortMenu) return
    const outside = (event: PointerEvent) => { if (!(event.target as Element).closest?.('.effort-menu, .effort-button')) setEffortMenu(false) }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [effortMenu])
  // Opened from the keyboard: focus its first item, so the menu is usable without a mouse.
  const focusMenu = useRef(false)
  useEffect(() => {
    if (!focusMenu.current) return
    focusMenu.current = false
    if (menu) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [menu])
  useEffect(() => {
    if (!menu) return
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !menuButton.current?.contains(target)) { setMenu(false); setRenaming(false) }
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [menu])
  useEffect(() => {
    if (!state.connected || !session?.unread || history || switcher || newChat) return
    let timer = 0
    const viewed = () => {
      clearTimeout(timer)
      if (document.visibilityState !== 'visible' || !document.hasFocus()) return
      timer = window.setTimeout(() => {
        if (document.visibilityState === 'visible' && document.hasFocus()) sendEvent({ type: 'seen', id: session.id, completionVersion: session.completionVersion })
      }, 600)
    }
    viewed()
    window.addEventListener('focus', viewed)
    window.addEventListener('blur', viewed)
    document.addEventListener('visibilitychange', viewed)
    return () => { clearTimeout(timer); window.removeEventListener('focus', viewed); window.removeEventListener('blur', viewed); document.removeEventListener('visibilitychange', viewed) }
  }, [state.connected, session?.id, session?.unread, session?.completionVersion, history, switcher, newChat])
  // One place for keyboard shortcuts and app menu items (C-06, C-11, C-24).
  const run = useCallback((action: ChatShortcut, repeat = false) => {
    const current = desktopState()
    const openChats = orderedChats(current.sessions)
    const selected = openChats.find(item => item.id === current.selectedId) || openChats[0]
    if (action === 'new-chat') setNewChat(true)
    else if (action === 'close-tab') { if (repeat) return; if (selected) requestClose(selected.id); else windowAction('chats', 'hide') }
    else if (action === 'history') { setHistory(value => !value); setSwitcher(false); setMenu(false) }
    else if (action === 'find-chat') { setSwitcher(value => !value); setHistory(false) }
    else if (action === 'clear-terminal') { if (selected && !repeat) api(`/sessions/${selected.id}/clear`, {}).catch(reportError) }
    else if (action === 'chat-options') { if (!selected) return; focusMenu.current = true; setMenu(value => !value); setRenaming(false) }
    else if (action === 'focus-tabs') {
      setSwitcher(false); setHistory(false); setMenu(false)
      requestAnimationFrame(() => (document.querySelector<HTMLButtonElement>('.chat-tab.selected .chat-tab-select') || document.querySelector<HTMLButtonElement>('.chat-tab-select') || document.querySelector<HTMLButtonElement>('.new-chat-button'))?.focus())
    } else if ((action === 'prev-tab' || action === 'next-tab') && openChats.length) {
      const index = openChats.findIndex(item => item.id === selected?.id)
      selectChat(openChats[(index + (action === 'prev-tab' ? -1 : 1) + openChats.length) % openChats.length].id)
    }
  }, [requestClose])
  useEffect(() => {
    document.title = 'CyberStudio — Chats'
    const shortcut = (event: KeyboardEvent) => {
      const action = chatShortcut(event)
      if (action) { event.preventDefault(); if (action !== 'focus-tabs') markKeyHandled(action); run(action, event.repeat); return }
      if (event.key === 'Escape') { setSwitcher(false); setMenu(false); setNewChat(false); setHistory(false); setEffortMenu(false) }
      // Match the physical key: Option+1 types "¡" on a macOS keyboard.
      if (event.altKey && /^Digit[1-9]$/.test(event.code)) {
        const target = orderedChats(desktopState().sessions)[Number(event.code.slice(5)) - 1]
        if (target) { event.preventDefault(); selectChat(target.id) }
      }
    }
    window.addEventListener('keydown', shortcut)
    const offMenu = onMenu(action => { if (!handledByKey(action)) run(action) })
    return () => { window.removeEventListener('keydown', shortcut); offMenu() }
  }, [run])
  // The service connection: after 30 s offline, say it stopped and offer Restart (C-20).
  const [clock, setClock] = useState(() => Date.now())
  const [restartNote, setRestartNote] = useState('')
  useEffect(() => {
    if (state.connected) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [state.connected])
  const serviceStopped = !state.connected && !!state.disconnectedAt && clock - state.disconnectedAt >= 30000
  async function restart() {
    setRestartNote('')
    try {
      const response = await fetch('/health', { cache: 'no-store' })
      if (response.ok) { location.reload(); return }
    } catch { /* Still down. */ }
    setRestartNote('Still not responding. Quit CyberStudio from the menu bar icon and open it again.')
  }
  const changeFont = (delta: number) => { const value = Math.max(10, Math.min(24, fontSize + delta)); setFontSize(value); api('/settings', { terminalFontSize: value }).catch(reportError) }
  async function rename(event: React.FormEvent) { event.preventDefault(); if (!session) return; try { await api(`/sessions/${session.id}`, { name: title }, 'PATCH'); setRenaming(false); setMenu(false) } catch (error) { reportError(error) } }
  const modal = newChat || !!confirmClose || pickingConversation
  const hasEffort = !!session && effortAgents.includes(session.agent)

  return <div className="chats-surface">
    <header className="chats-header" inert={modal}><div className="chats-brand"><Nose size={25} tone="black" /><span>CyberStudio <b>Chats</b></span></div><div className="chats-header-actions"><button className={`desk-icon ${pinned ? 'active' : ''}`} title={pinned ? 'Chats stays above other windows · click to stop' : 'Keep Chats above other windows'} aria-label="Keep Chats above other windows" aria-pressed={pinned} onClick={() => { setPinned(!pinned); windowAction('chats', 'pin', !pinned) }}><OnTopIcon /></button><button className="desk-icon" title="Show Workspace" onClick={() => windowAction('workspace')}><Icon name="workspace" size={18} /></button></div></header>
    {!state.connected && <div className={`chats-offline ${serviceStopped ? 'stopped' : ''}`} role={serviceStopped ? 'alert' : 'status'}>{serviceStopped ? <><span><strong>The CyberStudio service stopped.</strong> Chats keep their saved screens. {restartNote}</span><button onClick={restart}>Restart</button></> : <span>Reconnecting to the local service… Typing is paused.</span>}</div>}
    <div className="chat-tabs-row" inert={modal}><ChatTabs items={strip} selectedId={session?.id} agents={state.agents} choose={choose} close={requestClose} /><div className="chat-tab-actions">{needing.length > 0 && <button className={`needs-you-button ${needsFilter ? 'active' : ''}`} aria-pressed={needsFilter} onClick={() => setNeedsFilter(value => !value)} title={needsFilter ? 'Show all chats' : 'Show only chats waiting on you or with an unread result'}><span>Needs you</span><b>{needing.length}</b></button>}<button className="desk-icon new-chat-button" onClick={() => setNewChat(true)} title={`New chat · ${chatKeys.newChat}`} aria-label="New chat"><Icon name="plus" /></button><button className={`desk-icon ${switcher ? 'active' : ''}`} onClick={() => { setSwitcher(value => !value); setHistory(false) }} title={`Find a chat · ${chatKeys.find}`} aria-label="Find a chat"><Icon name="search" size={16} /></button><button className={`history-button ${history ? 'active' : ''}`} onClick={() => { setHistory(value => !value); setSwitcher(false); setMenu(false) }} title={`History · ${chatKeys.history}`}><Icon name="history" size={15} /><span>History</span></button></div></div>
    <div className="chat-body" inert={modal}>
    {history && <History close={() => setHistory(false)} choose={choose} />}
    {switcher && <Switcher items={filtered} selectedId={session?.id} query={query} setQuery={setQuery} choose={choose} />}
    {session ? <>
      <div className="chat-context"><span className="agent-label" style={{ color: agent?.color }}>{agent?.label}</span>{session.agent === 'strix' && session.remoteCwd ? <span className={`chat-folder ${session.remoteFallback ? 'remote-fallback' : ''}`} title={`On Strix: ${session.remoteCwd}${session.remoteFallback ? `\nNo matching folder for ${session.cwd}` : ''}`}>{session.remoteFallback ? `Folder not found on Strix, using home · ${session.remoteCwd}` : session.remoteCwd.split(/[\\/]/).filter(Boolean).slice(-1)[0]}</span> : <span className="chat-folder" title={session.cwd}>{session.cwd.split(/[\\/]/).filter(Boolean).slice(-1)[0]}</span>}<button className="desk-icon" title={`Attach file paths · drop files or folders · ${pasteKey} for screenshots`} aria-label="Attach files" onClick={() => window.dispatchEvent(new Event('mrmak-attach-file'))}><Icon name="attach" size={16} /></button><button ref={menuButton} className="desk-icon" title={`Chat options · ${chatKeys.options}`} aria-label="Chat options" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="more" size={18} /></button></div>
      {menu && <div className="chat-options" ref={menuRef}>{renaming ? <form className="inline-rename" onSubmit={rename}><input autoFocus value={title} onChange={event => setTitle(event.target.value)} aria-label="English chat name" /><button type="submit">Save</button></form> : <button onClick={() => { setTitle(session.name); setRenaming(true) }}>Rename chat</button>}<button onClick={() => { setMenu(false); api(`/sessions/${session.id}`, { pinned: !session.pinned }, 'PATCH').catch(reportError) }} title="A pinned tab stays at the front of the strip and at the top of History">{session.pinned ? 'Unpin tab' : 'Pin tab (stays first)'}</button><button onClick={() => { setMenu(false); api('/reveal', { path: session.cwd }).catch(reportError) }}>Show working folder</button><button onClick={() => api(`/sessions/${session.id}/clear`, {}).then(() => setMenu(false)).catch(reportError)} title="Clear visible scrollback; keep the agent conversation">Clear terminal scrollback{chatKeys.clear && <kbd>{chatKeys.clear}</kbd>}</button><div className="chat-color-setting"><span>Tab color</span><div role="group" aria-label="Tab color"><button className={`tab-color-swatch no-color ${!session.tabColor ? 'selected' : ''}`} aria-label="No tab color" aria-pressed={!session.tabColor} onClick={() => api(`/sessions/${session.id}`, { tabColor: null }, 'PATCH').catch(reportError)} title="No color" />{tabColors.map(color => <button key={color.value} className={`tab-color-swatch ${session.tabColor === color.value ? 'selected' : ''}`} style={{ '--swatch': color.value } as React.CSSProperties} aria-label={`${color.name} tab color`} aria-pressed={session.tabColor === color.value} title={color.name} onClick={() => api(`/sessions/${session.id}`, { tabColor: color.value }, 'PATCH').catch(reportError)} />)}</div></div><div className="terminal-appearance-setting"><span>Terminal appearance <small>All chats</small></span><div role="group" aria-label="Terminal appearance">{[['focus', 'Focus'], ['original', 'CLI colors']].map(([value, label]) => <button key={value} aria-pressed={(state.settings.terminalAppearance || 'focus') === value} onClick={() => api('/settings', { terminalAppearance: value }).catch(reportError)}>{label}</button>)}</div><p><i className="legend-user" />You <i className="legend-agent" />Agent <i className="legend-detail" />Details</p></div><div className="font-control"><span>Terminal text</span><button onClick={() => changeFont(-1)}>−</button><span>{fontSize}</span><button onClick={() => changeFont(1)}>+</button></div><button onClick={() => { setMenu(false); requestClose(session.id) }}>Close tab · keep in History<kbd>{chatKeys.closeTab}</kbd></button></div>}
      <TerminalPane key={session.id} id={session.id} agent={session.agent} fontSize={fontSize} appearance={state.settings.terminalAppearance || 'focus'} onAttachmentStatus={attachmentStatus} offline={!state.connected} readOnly={!!session.conversationMissing && !running} />
      {!running && stopped && (session.conversationMissing
        ? <div className="terminal-reconnect conversation-missing" role="status"><span>{stopped.text}</span><span className="reconnect-actions"><button onClick={() => resumeChat(session.id, { fresh: true })} disabled={!state.connected}>Start a new conversation here</button><button onClick={() => setPickingConversation(true)} disabled={!state.connected}>Pick a conversation</button></span></div>
        : <div className="terminal-reconnect" role="status"><span>{stopped.text}{stopped.detail && <details className="reconnect-details"><summary>Details</summary><code>{stopped.detail}</code></details>}</span>{stopped.action && <button onClick={() => resumeChat(session.id)} disabled={!state.connected}>{stopped.action}</button>}</div>)}
      {effortMenu && hasEffort && <div className="effort-menu" role="radiogroup" aria-label="Reasoning effort for this chat"><p>Reasoning effort · applies the next time this chat starts or resumes</p>{efforts.map(item => <button key={item.value} role="radio" aria-checked={session.effort === item.value} onClick={() => { setEffortMenu(false); api(`/sessions/${session.id}`, { effort: item.value }, 'PATCH').catch(reportError) }}>{item.label}{session.effort === item.value && <span aria-hidden="true">✓</span>}</button>)}</div>}
      <footer className="chat-status">{attachmentNotice.id === session.id && attachmentNotice.text ? <span className="attachment-status" role="status"><Icon name="attach" size={12} /><span>{attachmentNotice.text}</span></span> : <><span><i className={!state.connected ? 'disconnected-dot' : session.connecting ? 'connecting-dot' : running ? 'connected-dot' : 'stopped-dot'} />{!state.connected ? 'Reconnecting…' : session.connecting ? 'Connecting to Strix…' : running ? 'Connected · autosaved' : stopped?.short}</span><span>{hasEffort && session.effort && <><button className="effort-button" aria-expanded={effortMenu} onClick={() => setEffortMenu(value => !value)} title="Reasoning effort · click to change. Applies the next time this chat starts or resumes.">{effortLabel(session.effort)}</button> · </>}<span title="Terminal permissions">{session.agent === 'shell' ? osName : session.bypass ? 'Bypass' : 'CLI permissions'}</span></span><span className="status-shortcut" title="Move focus from the terminal to the tab strip">{chatKeys.tabs} · tabs</span><span className="status-shortcut">{pasteKey} · image</span></>}</footer>
    </> : <div className="chats-empty"><div className="empty-orbit"><Nose size={64} tone="black" /></div><span className="desk-eyebrow">ROOM TO THINK</span><h1>Your agents,<br />close at hand.</h1><p>A chat for each task.<br />Keep this window beside whatever<br />you are working on.</p><button className="desk-primary" onClick={() => setNewChat(true)}><Icon name="plus" size={17} />Open your first chat</button><div className="empty-agent-names">{state.agents.filter(item => item.available && item.id !== 'shell').map(item => <span key={item.id}>{item.label}</span>)}</div><small>Your CLI accounts. Your local files.</small></div>}
    </div>
    {newChat && <NewChat close={() => setNewChat(false)} />}
    {confirmClose && <CloseConfirm text={confirmClose.text} cancel={() => setConfirmClose(null)} confirm={() => { const { id } = confirmClose; setConfirmClose(null); closeChat(id) }} />}
    {pickingConversation && session && <ConversationPicker session={session} close={() => setPickingConversation(false)} pick={nativeId => { setPickingConversation(false); resumeChat(session.id, { nativeId }) }} />}
  </div>
}
