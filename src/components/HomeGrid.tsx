import type { WorkspaceEntity } from '../types'
import MakCard from './MakCard'
import MakLogo from './MakLogo'
import type { ViewRow } from './Sidebar'

interface HomeGridProps {
  entities: WorkspaceEntity[]
  pinned: WorkspaceEntity[]
  grouped: Map<string, WorkspaceEntity[]>
  offline: boolean
  searching: boolean
  query: string
  /** A review view's cards by category; null shows the normal home. */
  viewRows?: Map<string, ViewRow[]> | null
  viewLabel?: string
  onOpenRow?: (entity: WorkspaceEntity) => void
}

function ViewGallery({ rows, label, onOpen }: { rows: Map<string, ViewRow[]>; label: string; onOpen?: (e: WorkspaceEntity) => void }) {
  const all = [...rows.values()].flat()
  const ready = all.filter(r => r.step >= 0)
  const fresh = ready.filter(r => r.fresh).length
  return (
    <div className="home">
      <header className="home-hero view-hero">
        <div>
          <h1 className="home-title">{label}</h1>
          <p className="home-sub">
            <b>{ready.length}</b> of <b>{all.length}</b> ready
            {fresh > 0 && <> · <b className="view-new-count">{fresh}</b> new since you last looked</>}
            {' '}· this page refreshes as work lands
          </p>
        </div>
      </header>
      {[...rows.entries()].map(([cat, list]) => {
        const have = list.filter(r => r.step >= 0)
        const missing = list.filter(r => r.step < 0)
        return (
          <section key={cat} className="home-section">
            <div className="section-head">
              <span className="section-title">
                {cat.replace(/-/g, ' ')}
              </span>
              <span className="section-count">{have.length} / {list.length}</span>
            </div>
            {have.length > 0 && (
              <div className="card-grid">
                {have.map(r => (
                  <MakCard key={r.entity.id} entity={r.entity} step={r.step} fresh={r.fresh} onOpen={() => onOpen?.(r.entity)} />
                ))}
              </div>
            )}
            {missing.length > 0 && (
              <p className="view-missing">Not yet: {missing.map(r => r.entity.title).join(', ')}</p>
            )}
          </section>
        )
      })}
      {all.length === 0 && <div className="home-empty">Nothing in this view yet, sir.</div>}
    </div>
  )
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Burning the midnight oil, sir?'
  if (h < 12) return 'Good morning, sir.'
  if (h < 18) return 'Good day, sir.'
  return 'Good evening, sir.'
}

export default function HomeGrid({
  entities,
  pinned,
  grouped,
  offline,
  searching,
  query,
  viewRows = null,
  viewLabel = '',
  onOpenRow,
}: HomeGridProps) {
  if (viewRows) return <ViewGallery rows={viewRows} label={viewLabel} onOpen={onOpenRow} />
  const activeCount = entities.filter(e => e.status === 'active').length
  const categoryCount = new Set(entities.map(e => e.category || 'other')).size
  const shown = pinned.length + [...grouped.values()].reduce((n, list) => n + list.length, 0)

  return (
    <div className="home">
      <header className="home-hero">
        <MakLogo size={84} />
        <div>
          <h1 className="home-title">{greeting()}</h1>
          <p className="home-sub">
            <b>{activeCount}</b> active · <b>{entities.length}</b> entities ·{' '}
            <b>{categoryCount}</b> categories
            {offline && <span className="home-offline"> · workspace.json unreachable</span>}
          </p>
        </div>
      </header>

      {searching && (
        <p className="home-filter">
          {shown === 0 ? 'No matches for' : `${shown} match${shown === 1 ? '' : 'es'} for`}{' '}
          “{query.trim()}” — archive included
        </p>
      )}

      {pinned.length > 0 && (
        <section className="home-section">
          <div className="section-head">
            <span className="section-title">pinned</span>
            <span className="section-count">{pinned.length}</span>
          </div>
          <div className="card-grid">
            {pinned.map(e => (
              <MakCard key={e.id} entity={e} />
            ))}
          </div>
        </section>
      )}

      {[...grouped.entries()].map(([cat, list]) => (
        <section key={cat} className="home-section">
          <div className="section-head">
            <span className="section-title">
              {cat.replace(/-/g, ' ')}
            </span>
            <span className="section-count">{list.length}</span>
          </div>
          <div className="card-grid">
            {list.map(e => (
              <MakCard key={e.id} entity={e} />
            ))}
          </div>
        </section>
      ))}

      {shown === 0 && !searching && (
        <div className="home-empty">
          {offline
            ? 'Could not load workspace.json — is the public/workspace link in place? Run npm run dev again, sir.'
            : 'Nothing here yet. New work will appear as cards, sir.'}
        </div>
      )}
    </div>
  )
}
