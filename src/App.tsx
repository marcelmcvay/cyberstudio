import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceEntity } from './types'
import { useWorkspace, archiveCutoff } from './lib/workspace'
import { parseHash, entityHash, resolveStep, type Route } from './lib/route'
import { viewStep, signature, loadSeen, saveSeen } from './lib/views'
import type { ViewRow } from './components/Sidebar'
import MakLogo from './components/MakLogo'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Readout from './components/Readout'
import HomeGrid from './components/HomeGrid'
import ReportBoundary from './components/ReportBoundary'
import { contentUrl, isDesktop } from './desktop/client'

const Compare3D = lazy(() => import('./components/Compare3D'))
const Scene3D = lazy(() => import('./components/Scene3D'))
const ReportViewer = lazy(() => import('./components/ReportViewer'))

// Freshly-touched work always burns at the top: sort by `updated` (falls back
// to `created`), regardless of status — a report Mak just edited must not sink
// under long-lived "active" entities. Status only breaks ties.
const lastTouched = (e: WorkspaceEntity) => e.updated ?? e.created
const statusRank = (e: WorkspaceEntity) => (e.status === 'active' ? 0 : 1)
const byFreshness = (a: WorkspaceEntity, b: WorkspaceEntity) =>
  lastTouched(b).localeCompare(lastTouched(a)) || statusRank(a) - statusRank(b)

export default function App() {
  const { workspace, offline, lastSync } = useWorkspace()
  const [route, setRoute] = useState<Route>(parseHash)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // A review view (References, 3D, …) keeps the menu open: it is the way you
  // step from card to card. The default grouping folds away on desktop as before.
  const [viewId, setViewId] = useState<string | null>(() => localStorage.getItem('mak.view'))
  const viewRef = useRef(viewId)
  const [collapsed, setCollapsed] = useState(
    () => (isDesktop && !localStorage.getItem('mak.view')) || localStorage.getItem('mak.sidebarCollapsed') === '1',
  )
  const [, setSeenTick] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    localStorage.setItem('mak.sidebarCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const chooseView = useCallback((id: string | null) => {
    viewRef.current = id
    setViewId(id)
    if (id) localStorage.setItem('mak.view', id)
    else localStorage.removeItem('mak.view')
  }, [])

  const entities = workspace?.entities ?? []
  const entity = entities.find(e => e.id === route.id) ?? null
  const views = workspace?.views ?? []
  const view = views.find(v => v.id === viewId) ?? null

  const markSeen = useCallback((e: WorkspaceEntity) => {
    const id = viewRef.current
    if (!id) return
    const seen = loadSeen(id) ?? new Set<string>()
    seen.add(signature(e))
    saveSeen(id, seen)
    setSeenTick(t => t + 1)
  }, [])

  const stepIndex = entity
    ? resolveStep(entity.steps.length, route.step, entity.defaultStep)
    : -1
  const step = entity?.steps[stepIndex]
  const reportUrl = entity && step ? contentUrl(`/workspace/${entity.folder}/${step.path}`) : null

  // Hash → state: entity links navigate natively; this also covers back/forward.
  useEffect(() => {
    const onHash = () => { setRoute(parseHash()); if (isDesktop && !viewRef.current) setCollapsed(true) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Reports run in a frame (sandboxed on desktop), so their "#/card/tab" links
  // arrive from report.js as a message instead of a navigation.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const frames = [...document.querySelectorAll('iframe')].map(f => f.contentWindow)
      if (!ev.source || !frames.includes(ev.source as Window)) return
      const hash = ev.data?.type === 'mrmak:open' ? ev.data.hash : null
      if (typeof hash === 'string' && /^#\/[\w.-]+(\/\d+)?$/.test(hash)) window.location.hash = hash
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // "/" focuses search; "[" toggles the sidebar (handy for a clean screen recording).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      const typing =
        t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (typing) return
      if (ev.key === '/') {
        ev.preventDefault()
        searchRef.current?.focus()
      } else if (ev.key === '[') {
        ev.preventDefault()
        setCollapsed(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = entity ? `CyberStudio — ${entity.title}` : 'CyberStudio — Workspace'
  }, [entity])

  const goHome = useCallback(() => {
    history.pushState(null, '', window.location.pathname + window.location.search)
    setRoute({ id: null, step: -1 })
  }, [])

  const selectStep = useCallback((id: string, index: number) => {
    history.replaceState(null, '', entityHash(id, index))
    setRoute({ id, step: index })
  }, [])

  if (!workspace) {
    return (
      <div className="boot">
        <MakLogo size={76} />
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const searching = q.length > 0
  const cutoff = archiveCutoff()
  // An explicit `archived` status always wins, so a card can be put away by hand
  // while it is still inside the 7-day window. Otherwise it is the date rule,
  // which `pinned` overrides in the other direction.
  const isArchived = (e: WorkspaceEntity) =>
    e.status === 'archived' || (!e.pinned && !e.sample && lastTouched(e) < cutoff)
  const matchesQuery = (e: WorkspaceEntity) =>
    !searching ||
    [e.title, e.description, e.category, e.id].some(s => s && s.toLowerCase().includes(q))

  // Search digs through everything, archive included; otherwise the
  // archive stays hidden behind the toggle.
  const visible = entities.filter(
    e => matchesQuery(e) && (searching || showArchived || !isArchived(e)),
  )
  const archivedCount = entities.filter(isArchived).length

  const pinned = visible.filter(e => e.pinned).sort(byFreshness)
  const rest = visible.filter(e => !e.pinned).sort(byFreshness)
  // Category grouping is for the short working set only. With the archive open or a
  // search running the list is long and the useful order is purely "what did I touch
  // last", so buckets are dropped and everything stays in one date-sorted run.
  const flat = showArchived || searching
  const grouped = new Map<string, WorkspaceEntity[]>()
  for (const e of rest) {
    const cat = flat ? 'by date' : e.category || 'other'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(e)
  }

  // Review view: the cards with the view's tab, plus every card in a category
  // that takes part in any view and does not have it yet, so the list fills in.
  // First visit to a view: everything already there counts as seen. Writing
  // that once is idempotent, so doing it while rendering is safe.
  let seen = view ? loadSeen(view.id) : null
  if (view && !seen) {
    seen = new Set(entities.filter(e => viewStep(e, view) >= 0).map(signature))
    saveSeen(view.id, seen)
  }
  const viewCounts: Record<string, number> = {}
  for (const v of views) viewCounts[v.id] = visible.filter(e => !isArchived(e) && viewStep(e, v) >= 0).length
  let viewRows: Map<string, ViewRow[]> | null = null
  if (view) {
    const pool = visible.filter(e => !isArchived(e)).sort(byFreshness)
    const cats = new Set(pool.filter(e => views.some(v => viewStep(e, v) >= 0)).map(e => e.category || 'other'))
    viewRows = new Map()
    for (const e of pool) {
      const cat = e.category || 'other'
      if (!cats.has(cat)) continue
      const step = viewStep(e, view)
      if (!viewRows.has(cat)) viewRows.set(cat, [])
      viewRows.get(cat)!.push({ entity: e, step, fresh: step >= 0 && !!seen && !seen.has(signature(e)) })
    }
    for (const rows of viewRows.values()) rows.sort((a, b) => Number(b.step >= 0) - Number(a.step >= 0))
    // Categories with something to review lead; the rest keep their order below.
    const ready = (rows: ViewRow[]) => rows.some(r => r.step >= 0)
    viewRows = new Map([...viewRows].sort(([, a], [, b]) => Number(ready(b)) - Number(ready(a))))
  }

  return (
    <div className={`app-layout${collapsed ? ' sidebar-collapsed' : ''}`} data-entity={route.id}>
      <Sidebar
        pinned={pinned}
        grouped={grouped}
        activeId={route.id}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        archivedCount={archivedCount}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived(v => !v)}
        total={entities.length}
        offline={offline}
        lastSync={lastSync}
        onCollapse={() => setCollapsed(true)}
        views={views}
        viewId={view?.id ?? null}
        onView={chooseView}
        viewCounts={viewCounts}
        viewRows={viewRows}
        onOpenRow={markSeen}
      />

      <button
        className="sidebar-reopen"
        onClick={() => setCollapsed(false)}
        title="Show menu — press the eye ( [ )"
        aria-label="Show menu"
      >
        <MakLogo size={38} animated={route.id !== 'my-dream-game'} />
      </button>

      <main className="main">
        <Topbar
          entity={entity}
          stepIndex={stepIndex}
          onStep={selectStep}
          onHome={goHome}
          // A 3D step's "report" is a JSON manifest — opening it raw in a
          // tab helps nobody, so the external link is hidden for those.
          reportUrl={step?.viewer ? null : reportUrl}
        />
        <Readout />

        <div className="content">
          <ReportBoundary key={reportUrl || 'home'} onHome={goHome}>
          {entity && reportUrl && step?.viewer === 'compare3d' ? (
            <Suspense fallback={<div className="boot"><MakLogo size={56} animated={false} /></div>}><Compare3D
              key={reportUrl}
              manifestUrl={reportUrl}
              baseUrl={reportUrl.slice(0, reportUrl.lastIndexOf('/'))}
            /></Suspense>
          ) : entity && reportUrl && step?.viewer === 'scene3d' ? (
            <Suspense fallback={<div className="boot"><MakLogo size={56} animated={false} /></div>}><Scene3D key={reportUrl} manifestUrl={reportUrl} /></Suspense>
          ) : entity && reportUrl ? (
            <Suspense fallback={<div className="boot"><MakLogo size={56} animated={false} /></div>}><ReportViewer key={reportUrl} url={reportUrl} title={step?.name ?? entity.title} relativePath={`workspace/${entity.folder}/${step?.path}`} /></Suspense>
          ) : (
            <HomeGrid
              entities={entities}
              pinned={pinned}
              grouped={grouped}
              offline={offline}
              searching={searching}
              query={query}
              viewRows={viewRows}
              viewLabel={view?.label}
              onOpenRow={markSeen}
            />
          )}
          </ReportBoundary>
        </div>
      </main>
    </div>
  )
}
