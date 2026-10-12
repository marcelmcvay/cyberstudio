import { useSyncExternalStore } from 'react'
import type { DesktopState, Preview, ServiceEvent } from './types'

const params = new URLSearchParams(window.location.search)
export const isDesktop = params.get('desktop') === '1'
export const surface = params.get('surface') === 'chats' ? 'chats' : 'workspace'
export const clientId = crypto.randomUUID()
// Visible platform vocabulary: Finder and Trash on macOS, Explorer and Recycle Bin on Windows.
export const isMac = /Mac/i.test(navigator.platform || navigator.userAgent)
const isWindows = /Win/i.test(navigator.platform || navigator.userAgent)
export const fileManager = isMac ? 'Finder' : isWindows ? 'Explorer' : 'the file manager'
export const trashName = isMac ? 'Trash' : isWindows ? 'Recycle Bin' : 'Trash'
let token = params.get('token') || sessionStorage.getItem('mrmak.token') || ''
if (isDesktop && token) {
  sessionStorage.setItem('mrmak.token', token)
  params.delete('token')
  history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`)
}
const listeners = new Set<() => void>()
const events = new Set<(event: ServiceEvent) => void>()
let state: DesktopState = {
  ready: false, connected: false, disconnectedAt: null, error: null, repo: '', contentBase: '', agents: [], sessions: [], selectedId: null, notices: [],
  settings: { defaultAgent: 'codex', defaultBypass: false }, coordinator: 'idle', voice: { configured: false, owner: null }, operations: [], preview: null, voiceHistory: [],
}
let socket: WebSocket | null = null
let started = false
let reconnectTimer = 0
const update = (values: Partial<DesktopState>) => { state = { ...state, ...values }; listeners.forEach(listener => listener()) }
export const desktopState = () => state
export const useDesktop = () => useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, desktopState)
export const onServiceEvent = (listener: (event: ServiceEvent) => void) => { events.add(listener); return () => { events.delete(listener) } }
export const setPreview = (preview: Preview | null) => update({ preview })
export const dismissError = () => update({ error: null })
export const reportError = (error: unknown) => update({ error: error instanceof Error ? error.message : String(error) })
export const contentUrl = (relative: string) => isDesktop ? `${state.contentBase}${relative}` : relative

export async function api<T>(path: string, data?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method || (data === undefined ? 'GET' : 'POST'),
    headers: { Authorization: `Bearer ${token}`, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const value = await response.json()
  // The body travels with the error: a failed reopen still carries the tab it opened.
  if (!response.ok) throw Object.assign(new Error(value.error || `Request failed (${response.status})`), { status: response.status, data: value })
  return value as T
}
export const errorData = (error: unknown) => (error as { data?: Record<string, unknown> } | null)?.data
export function pickFiles(): Promise<string[]> {
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => { window.removeEventListener('mrmak-picked-files', picked); window.removeEventListener('pagehide', closed) }
    const picked = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; paths: string[] }>).detail
      if (detail?.requestId !== requestId) return
      cleanup(); resolve(detail.paths)
    }
    const closed = () => { cleanup(); reject(new Error('The file picker window was closed.')) }
    window.addEventListener('mrmak-picked-files', picked)
    window.addEventListener('pagehide', closed)
    api('/files/pick', { requestId }).catch(error => { cleanup(); reject(error) })
  })
}
// The shell's native folder picker (C-17). Resolves with null when cancelled.
export function pickFolder(directory?: string): Promise<string | null> {
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const cleanup = () => { window.removeEventListener('mrmak-picked-folder', picked); window.removeEventListener('pagehide', closed) }
    const picked = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; path: string | null }>).detail
      if (detail?.requestId !== requestId) return
      cleanup(); resolve(detail.path || null)
    }
    const closed = () => { cleanup(); reject(new Error('The folder picker window was closed.')) }
    window.addEventListener('mrmak-picked-folder', picked)
    window.addEventListener('pagehide', closed)
    api('/folders/pick', { requestId, directory }).catch(error => { cleanup(); reject(error) })
  })
}
export async function uploadImage(file: File): Promise<{ path: string; name: string }> {
  const response = await fetch('/api/attachments', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name || 'Screenshot.png') }, body: file })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'Image could not be saved')
  return value
}
export type IntakeResult = { id: string; path: string; relative: string; asset: { kind: string; title: string; files: { path: string; bytes: number }[] } }
export const addLink = (link: { url: string; title?: string; from?: string }) => api<IntakeResult>('/intake', link)
export async function uploadFile(file: File, folder: string): Promise<{ path: string; name: string; renamed: boolean; intake?: { id: string; path: string; kind: string } }> {
  const response = await fetch(`/api/files/import?folder=${encodeURIComponent(folder)}&name=${encodeURIComponent(file.name)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' }, body: file,
  })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || 'File could not be copied')
  return value
}
export function sendEvent(value: unknown) {
  if (socket?.readyState !== WebSocket.OPEN) return false
  socket.send(JSON.stringify(value)); return true
}
export function selectChat(id: string) {
  update({ selectedId: id }); sendEvent({ type: 'selected', id })
  localStorage.setItem('mrmak.selectedChat', id)
}
export const windowAction = (window: 'workspace' | 'chats', action = 'show', value?: boolean) => api('/window', { window, action, value }).catch(reportError)

export async function startDesktop() {
  if (started) return
  started = true
  try {
    const initial = await api<DesktopState>('/bootstrap')
    const selected = localStorage.getItem('mrmak.selectedChat')
    if (surface === 'workspace' && !location.hash && initial.settings.workspaceRoute?.startsWith('#/')) history.replaceState(null, '', location.pathname + location.search + initial.settings.workspaceRoute)
    update({ ...initial, ready: true, error: null, selectedId: initial.sessions.some(item => item.id === selected) ? selected : initial.selectedId })
    connect()
  } catch (error) { started = false; reportError(error) }
}
function connect() {
  socket = new WebSocket(`${location.origin.replace('http:', 'ws:')}/events`)
  socket.onopen = () => socket?.send(JSON.stringify({ type: 'auth', token, clientId, surface }))
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(data) as ServiceEvent
    if (event.type === 'connected') update({ connected: true, disconnectedAt: null, sessions: event.sessions || state.sessions, selectedId: event.selectedId ?? state.selectedId, coordinator: event.state || state.coordinator, error: null })
    if (event.type === 'selection') update({ selectedId: event.selectedId || null })
    if (event.type === 'session' && event.session) {
      const next = event.session
      update({ sessions: state.sessions.some(item => item.id === next.id) ? state.sessions.map(item => item.id === next.id ? next : item) : [...state.sessions, next] })
    }
    if (event.type === 'removed') {
      const sessions = state.sessions.filter(item => item.id !== event.id)
      update({ sessions, selectedId: state.selectedId === event.id ? sessions[0]?.id || null : state.selectedId })
    }
    if (event.type === 'service-error') reportError(event.error || 'Connection error')
    if (event.type === 'coordinator-state') update({ coordinator: event.state || 'idle' })
    if (event.type === 'coordinator-result' && event.operation) {
      const operation = event.operation
      update({ operations: [...state.operations.filter(item => item.id !== operation.id), operation].slice(-50) })
    }
    if (event.type === 'settings' && event.settings) update({ settings: event.settings })
    if (event.type === 'notice' && event.notice) update({ notices: [...state.notices, event.notice].slice(-100) })
    if (event.type === 'voice-owner') update({ voice: { ...state.voice, owner: event.owner || null } })
    if (event.type === 'navigate') {
      if (event.sessionId) selectChat(event.sessionId)
      if (surface === 'workspace' && event.window === 'workspace') {
        if (event.route !== undefined) { setPreview(null); location.hash = event.route || '' }
        if (event.preview) setPreview(event.preview)
      }
    }
    if (event.type === 'workspace-changed') window.dispatchEvent(new Event('mrmak-workspace-changed'))
    events.forEach(listener => listener(event))
  }
  socket.onclose = () => {
    update({ connected: false, disconnectedAt: state.disconnectedAt ?? Date.now() })
    clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(connect, 1500)
    events.forEach(listener => listener({ type: 'disconnected' }))
  }
  socket.onerror = () => socket?.close()
}

// Exposing a capability through a DOM attribute would give report pages access to it.
// It lives only in this UI origin, which is separate from the report server.
window.addEventListener('pagehide', () => { token = ''; socket?.close(); clearTimeout(reconnectTimer) })

// App menu (macOS): the shell forwards a chosen item to the focused window as
// a 'mrmak-menu' event with { action }. Each surface handles what applies to it.
export type MenuAction = 'new-chat' | 'close-tab' | 'history' | 'find-chat' | 'clear-terminal' | 'prev-tab' | 'next-tab' | 'chat-options' | 'settings' | 'help'
export function onMenu(listener: (action: MenuAction) => void) {
  const handle = (event: Event) => { const action = (event as CustomEvent<{ action?: MenuAction }>).detail?.action; if (action) listener(action) }
  window.addEventListener('mrmak-menu', handle)
  return () => window.removeEventListener('mrmak-menu', handle)
}
// A key handled in the page can also reach the menu as its key equivalent.
// The page marks it, and a menu event for the same action right after is ignored.
const handledKeys = new Map<MenuAction, number>()
export const markKeyHandled = (action: MenuAction) => { handledKeys.set(action, Date.now()) }
export const handledByKey = (action: MenuAction) => Date.now() - (handledKeys.get(action) || 0) < 400
if (surface === 'workspace') onMenu(action => {
  if (handledByKey(action)) return
  if (action === 'help') api<Preview>(`/preview?path=${encodeURIComponent(`${state.repo}/workspace/_shared/help.md`)}`).then(setPreview).catch(reportError)
  // The Settings panel lives in the Files rail; open it the way its own button does.
  if (action === 'settings') { const button = document.querySelector<HTMLButtonElement>('.files-rail [aria-label="Toggle settings"]'); if (button && button.getAttribute('aria-pressed') !== 'true') button.click() }
})

// Chats shortcuts. macOS uses Cmd like other Mac apps; the Ctrl+Shift keys keep
// working everywhere, and stay the only map on Windows and Linux (C-06, C-11).
export type ChatShortcut = MenuAction | 'focus-tabs'
export const chatKeys = isMac
  ? { newChat: 'Cmd+T', closeTab: 'Cmd+W', history: 'Cmd+Shift+H', find: 'Cmd+P', tabs: 'Cmd+Shift+L', options: 'Cmd+Shift+O', clear: 'Cmd+K', switchTabs: 'Cmd+Shift+[ ]' }
  : { newChat: 'Ctrl+Shift+T', closeTab: 'Ctrl+Shift+W', history: 'Ctrl+Shift+H', find: 'Ctrl+Shift+P', tabs: 'Ctrl+Shift+L', options: 'Ctrl+Shift+O', clear: '', switchTabs: 'Ctrl+Tab' }
export function chatShortcut(event: KeyboardEvent): ChatShortcut | null {
  const ctrlShift = event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
  const cmd = isMac && event.metaKey && !event.ctrlKey && !event.altKey
  const code = event.code
  if ((ctrlShift && code === 'KeyT') || (cmd && !event.shiftKey && code === 'KeyT')) return 'new-chat'
  if ((ctrlShift && code === 'KeyW') || (cmd && !event.shiftKey && code === 'KeyW')) return 'close-tab'
  if ((ctrlShift && code === 'KeyH') || (cmd && event.shiftKey && code === 'KeyH')) return 'history'
  if ((ctrlShift && code === 'KeyP') || (cmd && code === 'KeyP')) return 'find-chat'
  if ((ctrlShift && code === 'KeyL') || (cmd && event.shiftKey && code === 'KeyL')) return 'focus-tabs'
  if ((ctrlShift && code === 'KeyO') || (cmd && event.shiftKey && code === 'KeyO')) return 'chat-options'
  if (cmd && !event.shiftKey && code === 'KeyK') return 'clear-terminal'
  if (event.ctrlKey && !event.metaKey && !event.altKey && code === 'Tab') return event.shiftKey ? 'prev-tab' : 'next-tab'
  if (cmd && event.shiftKey && (code === 'BracketLeft' || code === 'BracketRight')) return code === 'BracketLeft' ? 'prev-tab' : 'next-tab'
  return null
}
