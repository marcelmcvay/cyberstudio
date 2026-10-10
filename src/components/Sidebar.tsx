import type { RefObject } from 'react'
import type { WorkspaceEntity, WorkspaceView } from '../types'
import { entityHash } from '../lib/route'
import { categoryIcon } from '../lib/categories'
import { contentUrl } from '../desktop/client'
import MakLogo from './MakLogo'
import MakText from './MakText'
import './views.css'

/** One card in a review view. step -1 means it does not have the view's tab yet. */
export interface ViewRow {
  entity: WorkspaceEntity
  step: number
  fresh: boolean
}

interface SidebarProps {
  pinned: WorkspaceEntity[]
  grouped: Map<string, WorkspaceEntity[]>
  activeId: string | null
  query: string
  onQuery: (q: string) => void
  searchRef: RefObject<HTMLInputElement | null>
  archivedCount: number
  showArchived: boolean
  onToggleArchived: () => void
  total: number
  offline: boolean
  lastSync: Date | null
  onCollapse: () => void
  views: WorkspaceView[]
  viewId: string | null
  onView: (id: string | null) => void
  viewCounts: Record<string, number>
  viewRows: Map<string, ViewRow[]> | null
  onOpenRow: (entity: WorkspaceEntity) => void
}

const heroUrl = (e: WorkspaceEntity) => contentUrl(`/workspace/${e.folder}/${e.hero}`)

function Item({ entity, active }: { entity: WorkspaceEntity; active: boolean }) {
  return (
    <a
      href={entityHash(entity.id)}
      className={`sidebar-item${active ? ' active' : ''}${entity.pinned ? ' pinned' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="item-icon" aria-hidden="true">
        {entity.icon ? <img src={contentUrl(`/workspace/${entity.folder}/${entity.icon}`)} width="24" height="24" alt="" decoding="async" />
          : entity.hero ? <img className="item-hero" src={heroUrl(entity)} width="24" height="24" alt="" loading="lazy" decoding="async" />
          : categoryIcon(entity.category)}
      </span>
      <span className="item-text">{entity.title}</span>
      <span className={`status-dot ${entity.status}`} title={entity.status} />
    </a>
  )
}

function ViewItem({ row, active, onOpen }: { row: ViewRow; active: boolean; onOpen: (e: WorkspaceEntity) => void }) {
  const { entity, step, fresh } = row
  const missing = step < 0
  return (
    <a
      href={entityHash(entity.id, step)}
      className={`sidebar-item view-item${active ? ' active' : ''}${missing ? ' missing' : ''}${fresh ? ' fresh' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={() => { if (!missing) onOpen(entity) }}
    >
      <span className="view-thumb" aria-hidden="true">
        {entity.hero ? <img src={heroUrl(entity)} alt="" loading="lazy" decoding="async" /> : categoryIcon(entity.category)}
      </span>
      <span className="item-text">
        <span className="view-title">{entity.title}</span>
        <small>{missing ? 'not yet' : `${entity.steps[step].name} · ${entity.updated ?? entity.created}`}</small>
      </span>
      {fresh && <span className="view-new">new</span>}
    </a>
  )
}

export default function Sidebar({
  pinned,
  grouped,
  activeId,
  query,
  onQuery,
  searchRef,
  archivedCount,
  showArchived,
  onToggleArchived,
  total,
  offline,
  lastSync,
  onCollapse,
  views,
  viewId,
  onView,
  viewCounts,
  viewRows,
  onOpenRow,
}: SidebarProps) {
  const empty = viewRows ? viewRows.size === 0 : pinned.length === 0 && grouped.size === 0

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <MakLogo size={54} animated={activeId !== 'my-dream-game'} />
        <div className="brand-text">
          <MakText height={26} animated={activeId !== 'my-dream-game'} />
          <span className="brand-sub">workspace</span>
        </div>
        <button
          className="sidebar-collapse"
          onClick={onCollapse}
          title="Hide menu ( [ )"
          aria-label="Hide menu"
        >
          ‹
        </button>
      </div>

      <div className="sidebar-search">
        <span className="search-icon" aria-hidden="true">
          {'⌕'}
        </span>
        <input
          ref={searchRef}
          value={query}
          onChange={ev => onQuery(ev.target.value)}
          onKeyDown={ev => {
            if (ev.key === 'Escape') {
              onQuery('')
              ev.currentTarget.blur()
            }
          }}
          placeholder="Search…  ( / )"
          aria-label="Search entities"
        />
        {query && (
          <button className="search-clear" onClick={() => onQuery('')} aria-label="Clear search">
            ×
          </button>
        )}
      </div>

      {views.length > 0 && (
        <div className="sidebar-views" role="group" aria-label="Menu view">
          <button className={viewId ? '' : 'on'} aria-pressed={!viewId} onClick={() => onView(null)}>
            Areas
          </button>
          {views.map(v => (
            <button key={v.id} className={viewId === v.id ? 'on' : ''} aria-pressed={viewId === v.id} onClick={() => onView(v.id)}>
              {v.label}
              <span className="sidebar-count">{viewCounts[v.id] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <nav className="sidebar-list">
        {viewRows && [...viewRows.entries()].map(([cat, rows]) => (
          <div key={cat}>
            <div className="sidebar-section">
              <span className="sidebar-label">{cat.replace(/-/g, ' ')}</span>
              <span className="sidebar-count">{rows.filter(r => r.step >= 0).length} / {rows.length}</span>
            </div>
            {rows.map(r => (
              <ViewItem key={r.entity.id} row={r} active={r.entity.id === activeId} onOpen={onOpenRow} />
            ))}
          </div>
        ))}

        {!viewRows && pinned.length > 0 && (
          <div>
            <div className="sidebar-section">
              <span className="sidebar-label">{'\u{1F4CC}'} pinned</span>
            </div>
            {pinned.map(e => (
              <Item key={e.id} entity={e} active={e.id === activeId} />
            ))}
          </div>
        )}

        {!viewRows && [...grouped.entries()].map(([cat, list]) => (
          <div key={cat}>
            <div className="sidebar-section">
              <span className="sidebar-label">{cat.replace(/-/g, ' ')}</span>
              <span className="sidebar-count">{list.length}</span>
            </div>
            {list.map(e => (
              <Item key={e.id} entity={e} active={e.id === activeId} />
            ))}
          </div>
        ))}

        {empty && <div className="sidebar-empty">Nothing matches, sir.</div>}

        {!viewRows && archivedCount > 0 && !query && (
          <button className="sidebar-archive-toggle" onClick={onToggleArchived}>
            {showArchived
              ? `▼ Hide archive (${archivedCount})`
              : `▶ Show archive (${archivedCount})`}
          </button>
        )}
      </nav>

      <footer className="sidebar-foot">
        <span className={`sync-dot${offline ? ' offline' : ''}`} />
        <span>
          {total} entities ·{' '}
          {offline
            ? 'offline'
            : lastSync
              ? `synced ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'syncing…'}
        </span>
      </footer>
    </aside>
  )
}
