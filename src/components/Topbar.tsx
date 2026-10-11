import type { KeyboardEvent } from 'react'
import type { WorkspaceEntity } from '../types'
import { isDesktop } from '../desktop/client'
import BrowserSettings from './BrowserSettings'

interface TopbarProps {
  entity: WorkspaceEntity | null
  stepIndex: number
  onStep: (id: string, index: number) => void
  onHome: () => void
  reportUrl: string | null
}

/** Arrow keys move focus along the tabs; Enter or Space opens the focused one. */
function tabKeys(event: KeyboardEvent<HTMLDivElement>) {
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
  if (current < 0) return
  const next = event.key === 'ArrowRight' ? current + 1 : event.key === 'ArrowLeft' ? current - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null
  if (next === null) return
  event.preventDefault()
  tabs[(next + tabs.length) % tabs.length].focus()
}

export default function Topbar({ entity, stepIndex, onStep, onHome, reportUrl }: TopbarProps) {
  return (
    <div className="topbar" tabIndex={-1}>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <button className="crumb-link" onClick={onHome}>
          Workspace
        </button>
        {entity && (
          <>
            <span className="crumb-sep">/</span>
            <span className="crumb-current">{entity.title}</span>
          </>
        )}
        {!isDesktop && <BrowserSettings />}
      </nav>

      {entity && (
        <div className="topbar-right">
          {entity.steps.length > 0 && (
            <div className="step-tabs" role="tablist" aria-label="Card tabs" onKeyDown={tabKeys}>
              {entity.steps.map((s, i) => (
                <button
                  key={i}
                  role="tab"
                  id={`step-tab-${i}`}
                  aria-controls="step-panel"
                  tabIndex={i === stepIndex ? 0 : -1}
                  aria-selected={i === stepIndex}
                  className={`step-tab${i === stepIndex ? ' active' : ''}`}
                  onClick={() => onStep(entity.id, i)}
                  title={s.name}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {reportUrl && (
            <a
              className="open-ext"
              href={reportUrl}
              target="_blank"
              rel="noreferrer"
              title="Open report in a new tab"
            >
              ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}
