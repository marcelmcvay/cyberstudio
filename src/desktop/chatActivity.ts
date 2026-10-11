import type { ChatSession } from './types'

export function chatActivityLabel(session: ChatSession) {
  const working = session.status === 'running' && session.activity === 'working'
  if (session.unread) return working ? 'Working · unread result' : 'Finished · unread result'
  if (working) return 'Working'
  if (session.status !== 'running') return session.status === 'starting' ? 'Starting' : 'Stopped'
  if (session.activity === 'waiting') return 'Needs attention · check terminal'
  return ['codex', 'claude', 'strix', 'opencode'].includes(session.agent) ? 'Ready' : 'Terminal open'
}

// Wording for a chat whose terminal is not running. "Reconnecting" is kept for a
// lost connection to the local service, never for an ended or failed terminal.
export function stoppedChatState(session: ChatSession) {
  const action = session.agent !== 'shell' && session.hasConversation ? 'Resume conversation' : 'Restart'
  if (session.restoreError) return { text: `Could not start: ${session.restoreError}`, short: 'Could not start', action }
  if (session.status === 'exited') {
    const ended = typeof session.exitCode === 'number' ? `Ended · exit ${session.exitCode}` : 'Ended'
    return { text: ended, short: ended, action }
  }
  if (session.status === 'starting') return { text: 'Starting…', short: 'Starting…', action: '' }
  return { text: 'Restoring your conversation…', short: 'Restoring…', action }
}
