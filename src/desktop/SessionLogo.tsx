import { AgentLogo } from './Icons'
import { chatActivityLabel, chatState } from './chatActivity'
import type { ChatSession } from './types'

// One shape per state, not color alone (C-15): stopped is dimmed, working and
// connecting spin, waiting carries "!", an unread result carries a dot.
export default function SessionLogo({ session, size = 17 }: { session: ChatSession; size?: number }) {
  const state = chatState(session)
  return <span className={`session-logo state-${state} ${state === 'working' ? 'is-working' : ''}`} style={{ width: size, height: size }} title={chatActivityLabel(session)} aria-hidden="true">
    <AgentLogo agent={session.agent} size={size} />
    {(state === 'working' || state === 'connecting' || state === 'starting') && <i className="session-spinner" />}
    {state === 'waiting' && <i className="session-waiting">!</i>}
    {state !== 'waiting' && session.unread && <i className="session-unread" />}
  </span>
}
