import type { ChatSession } from './types'

// One state per chat, in order of precedence: waiting > working > done (unread) > ready.
export type ChatState = 'connecting' | 'starting' | 'stopped' | 'waiting' | 'working' | 'unread' | 'ready'

export function chatState(session: ChatSession): ChatState {
  if (session.status === 'starting') return 'starting'
  if (session.status !== 'running') return 'stopped'
  if (session.connecting) return 'connecting'
  if (session.activity === 'waiting') return 'waiting'
  if (session.activity === 'working') return 'working'
  if (session.unread) return 'unread'
  return 'ready'
}

// Chats that need the person: blocked on input, or holding an unread result.
export const needsYou = (session: ChatSession) => session.open && ((session.status === 'running' && session.activity === 'waiting') || session.unread)

// A short text badge for wide tab strips. Ready chats show none.
export const chatBadge: Record<ChatState, string> = { connecting: 'Connecting', starting: 'Starting', stopped: 'Stopped', waiting: 'Needs you', working: 'Working', unread: 'Done', ready: '' }

export const chatBadgeText = (session: ChatSession) => session.agent === 'strix' && session.status !== 'running' && session.exitCode === 255 ? 'Offline' : chatBadge[chatState(session)]

export function chatActivityLabel(session: ChatSession) {
  const state = chatState(session)
  const unread = session.unread ? ' · unread result' : ''
  if (state === 'connecting') return 'Connecting to Strix…'
  if (state === 'waiting') return `Needs you · ${session.waitingText || 'check terminal'}${unread}`
  if (state === 'working') return `Working${unread}`
  if (state === 'unread') return 'Finished · unread result'
  if (state === 'starting') return 'Starting'
  if (state === 'stopped') return session.unread ? 'Stopped · unread result' : 'Stopped'
  return ['codex', 'claude', 'strix', 'opencode'].includes(session.agent) ? 'Ready' : 'Terminal open'
}

export const STRIX_UNREACHABLE = "Can't reach Strix. Check that it is on and Tailscale is connected."

// Wording for a chat whose terminal is not running. "Reconnecting" is kept for a
// lost connection to the local service, never for an ended or failed terminal.
export function stoppedChatState(session: ChatSession): { text: string; short: string; action: string; detail?: string } {
  const action = session.agent !== 'shell' && session.hasConversation ? 'Resume conversation' : 'Restart'
  // The tab offers its own two actions: start a new conversation or pick one (C-18).
  if (session.conversationMissing) return { text: session.restoreError || `The conversation for ${session.name} could not be found.`, short: 'Conversation not found', action: '' }
  if (session.restoreError) return { text: `Could not start: ${session.restoreError}`, short: 'Could not start', action }
  // ssh exits 255 when the host cannot be reached or the link drops.
  if (session.agent === 'strix' && session.exitCode === 255) return { text: `${STRIX_UNREACHABLE}${session.hasConversation ? ' Your conversation resumes when it reconnects.' : ''}`, short: "Can't reach Strix", action: 'Retry', detail: session.exitDetail || 'ssh exited with status 255.' }
  if (session.status === 'exited') {
    const ended = typeof session.exitCode === 'number' ? `Ended · exit ${session.exitCode}` : 'Ended'
    return { text: ended, short: ended, action }
  }
  if (session.status === 'starting') return { text: 'Starting…', short: 'Starting…', action: '' }
  return { text: 'Restoring your conversation…', short: 'Restoring…', action }
}

// Closing a tab stops its terminal. Ask first only when that would stop work:
// the agent is working or waiting on the person, or a shell runs a foreground
// command. Routine closes stay one click (C-05).
export function closeConfirmation(session: ChatSession, agentLabel: string, foreground?: string | null): string | null {
  if (session.status !== 'running') return null
  if (session.activity === 'working') return `${agentLabel} is still working in ${session.name}. Stop it and close?`
  if (session.activity === 'waiting') return `${agentLabel} is waiting for your answer in ${session.name}. Stop it and close?`
  if (foreground) return `${foreground} is still running in ${session.name}. Stop it and close?`
  return null
}

// Only a running local shell needs the service to check its foreground process.
export const checksForeground = (session: ChatSession) => session.agent === 'shell' && session.status === 'running' && session.activity !== 'working' && session.activity !== 'waiting'
