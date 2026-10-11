import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, contentUrl, reportError, setPreview, useDesktop } from './client'
import type { Preview } from './types'
import { Icon } from './Icons'
import { parseHash } from '../lib/route'
import './properties.css'

// Reads asset.json sidecars (schemas/asset-v1.json) through /api/assets.
type Status = 'draft' | 'review' | 'approved' | 'superseded'
type AssetBrief = {
  id: string; title: string; kind: string | null; status: Status; folder: 'assets' | 'inbox'
  cost: { usd: number; jobs: number }; cards: string[]; tags: string[]; output: string | null; preview: string | null; updated: string | null
}
type Job = { job_id: string; tool: string; model?: string; ts?: string; cost_usd?: number; note?: string }
type AssetFile = { path: string; role: string; sha256: string; bytes: number; note?: string }
type Asset = AssetBrief & {
  created: string; superseded_by?: string; ledger_ids?: string[]; files: AssetFile[]
  provenance: { origin: string; inputs?: string[]; link?: string; imported_from?: string; jobs?: Job[] }
  cost: { usd: number; jobs: number; basis?: string }
  mesh?: { triangles?: number; vertices?: number; materials?: number; textures?: number; bbox_m?: number[]; origin?: string; real_scale?: boolean; validator?: { errors?: number; warnings?: number; checked?: string }; engine_ready?: boolean }
  image?: { width?: number; height?: number; format?: string }
  review?: { notes?: { at: string; by: string; text: string }[]; approved_by?: string; approved_at?: string }
}
type Listing = { assets: AssetBrief[]; problems: { path: string; message: string }[] }

const STATUSES: Status[] = ['review', 'draft', 'approved', 'superseded']
const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i
const usd = (value: number | undefined) => `$${(Number(value) || 0).toFixed(2)}`
const count = (value: number | undefined) => value == null ? '—' : value.toLocaleString()
const bytes = (value: number) => value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`
const when = (value: string | undefined | null) => value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const day = (value: string | undefined) => value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'
const fileName = (value: string) => value.split('/').pop() || value
const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const cardId = () => parseHash().id

function Row({ label, children, tone }: { label: string; children: ReactNode; tone?: 'amber' | 'alert' | 'live' | 'muted' }) {
  return <div className={`prop-row${tone ? ' ' + tone : ''}`}><span>{label}</span><i>:</i><b>{children}</b></div>
}
function Flag({ on, children }: { on?: boolean; children: ReactNode }) {
  return <span className={`prop-flag${on ? ' on' : ''}`}>{on ? '■' : '□'} {children}</span>
}

function AssetDetail({ asset, repo, onChanged }: { asset: Asset; repo: string; onChanged: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const patch = async (value: Partial<{ status: Status; note: string }>) => {
    setBusy(true); setError('')
    try { await api(`/assets/${encodeURIComponent(asset.id)}`, value, 'PATCH'); if (value.note) setNote(''); onChanged() }
    catch (error) { setError(message(error)) }
    finally { setBusy(false) }
  }
  const open = (path: string) => api<Preview>(`/preview?path=${encodeURIComponent(`${repo}/${path}`)}`).then(setPreview).catch(reportError)
  const { provenance, mesh, review } = asset
  const jobs = provenance?.jobs || []
  const notes = review?.notes || []
  const thumb = ['preview', 'reference', 'output'].map(role => asset.files.find(file => file.role === role && IMAGE.test(file.path))).find(Boolean)
  const validator = mesh?.validator
  return <div className="prop-detail">
    {thumb && <button className="prop-thumb" onClick={() => void open(thumb.path)} title={`Open ${fileName(thumb.path)}`}><img src={contentUrl(`/${thumb.path.split('/').map(encodeURIComponent).join('/')}`)} alt="" loading="lazy" decoding="async" /><span>{thumb.role}</span></button>}
    <section><h4>Asset</h4>
      <Row label="ID">{asset.id}</Row>
      <Row label="Kind">{asset.kind || '—'}</Row>
      <Row label="Cost" tone={asset.cost.usd > 0 ? 'amber' : undefined}>{usd(asset.cost.usd)} · {asset.cost.jobs} job{asset.cost.jobs === 1 ? '' : 's'}{asset.cost.basis && asset.cost.basis !== 'none' ? ` · ${asset.cost.basis}` : ''}</Row>
      <Row label="Folder">{asset.folder}/{asset.id}</Row>
      <Row label="Updated">{when(asset.updated)}</Row>
      {asset.tags?.length > 0 && <Row label="Tags">{asset.tags.join(' · ')}</Row>}
      {asset.cards.length > 0 && <Row label="Cards">{asset.cards.join(' · ')}</Row>}
      {asset.superseded_by && <Row label="Replaced by" tone="muted">{asset.superseded_by}</Row>}
    </section>
    <section><h4>Provenance</h4>
      <Row label="Origin">{provenance?.origin || '—'}</Row>
      {provenance?.imported_from && <Row label="From">{provenance.imported_from}</Row>}
      {provenance?.inputs?.length ? <Row label="Inputs">{provenance.inputs.join(' · ')}</Row> : null}
      {provenance?.link && <Row label="Link"><a href={provenance.link} target="_blank" rel="noreferrer">{provenance.link.replace(/^https?:\/\//, '')}</a></Row>}
      {jobs.length > 0 && <ol className="prop-jobs">{jobs.map(job => <li key={job.job_id} title={job.note || job.job_id}>
        <span>{job.tool}{job.model ? <small> / {job.model}</small> : null}</span><time>{day(job.ts)}</time><b>{job.cost_usd == null ? '—' : usd(job.cost_usd)}</b>
      </li>)}</ol>}
    </section>
    {mesh && <section><h4>Mesh</h4>
      <Row label="Triangles">{count(mesh.triangles)}</Row>
      {mesh.vertices != null && <Row label="Vertices">{count(mesh.vertices)}</Row>}
      {(mesh.materials != null || mesh.textures != null) && <Row label="Mat / Tex">{count(mesh.materials)} / {count(mesh.textures)}</Row>}
      {mesh.bbox_m?.length === 3 && <Row label="Size W×D×H">{mesh.bbox_m.map(value => value.toFixed(2)).join(' × ')} m</Row>}
      {mesh.origin && <Row label="Pivot">{mesh.origin}</Row>}
      {validator && <Row label="Validator" tone={validator.errors ? 'alert' : validator.warnings ? 'amber' : undefined}>{validator.errors ?? 0} err · {validator.warnings ?? 0} warn</Row>}
      <div className="prop-flags"><Flag on={mesh.real_scale}>Real scale</Flag><Flag on={mesh.engine_ready}>Engine ready</Flag></div>
    </section>}
    {asset.image && <section><h4>Image</h4><Row label="Pixels">{asset.image.width ?? '—'} × {asset.image.height ?? '—'}{asset.image.format ? ` · ${asset.image.format}` : ''}</Row></section>}
    <section><h4>Files <small>{asset.files.length}</small></h4>
      <ul className="prop-files">{asset.files.map(file => <li key={file.path}><button onClick={() => void open(file.path)} title={file.note || file.path}>
        <span className={`prop-role ${file.role}`}>{file.role}</span><span className="prop-file-name">{fileName(file.path)}</span><small>{bytes(file.bytes)}</small>
      </button></li>)}</ul>
    </section>
    <section><h4>Review <small>{notes.length}</small></h4>
      {asset.status === 'approved' && review?.approved_by && <Row label="Approved" tone="live">{review.approved_by} · {when(review.approved_at)}</Row>}
      {notes.length > 0 ? <ol className="prop-notes">{notes.map((item, index) => <li key={`${item.at}:${index}`}><header><b>{item.by}</b><time>{when(item.at)}</time></header><p>{item.text}</p></li>)}</ol> : <p className="prop-empty-line">No notes yet.</p>}
      <div className="prop-status-set" role="group" aria-label={`Set status for ${asset.title}`}>{(['draft', 'review', 'approved', 'superseded'] as Status[]).map(status => <button key={status} className={status} aria-pressed={asset.status === status} disabled={busy || asset.status === status} onClick={() => void patch({ status })}>{status}</button>)}</div>
      <form className="prop-note" onSubmit={event => { event.preventDefault(); if (note.trim()) void patch({ note }) }}>
        <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={2} placeholder="Add a review note…" aria-label={`Review note for ${asset.title}`} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit() }} />
        <button type="submit" disabled={busy || !note.trim()}>Add note</button>
      </form>
      {error && <p className="desk-error-inline" role="alert">{error}</p>}
    </section>
  </div>
}

function AssetItem({ brief, expanded, toggle, repo, revision, onChanged }: { brief: AssetBrief; expanded: boolean; toggle: () => void; repo: string; revision: number; onChanged: () => void }) {
  const [asset, setAsset] = useState<Asset | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!expanded) return
    let alive = true
    api<Asset>(`/assets/${encodeURIComponent(brief.id)}`).then(value => { if (alive) { setAsset(value); setError('') } }).catch(error => { if (alive) setError(message(error)) })
    return () => { alive = false }
  }, [expanded, brief.id, revision])
  return <article className={`prop-asset ${brief.status}${expanded ? ' open' : ''}`} data-asset-id={brief.id}>
    <button className="prop-asset-head" onClick={toggle} aria-expanded={expanded}>
      {brief.preview ? <img src={contentUrl(`/${brief.preview.split('/').map(encodeURIComponent).join('/')}`)} alt="" loading="lazy" decoding="async" /> : <span className="prop-glyph">{brief.kind || 'asset'}</span>}
      <span className="prop-asset-title"><strong>{brief.title}</strong><small>{brief.kind || 'asset'} · {usd(brief.cost.usd)} · {brief.cost.jobs} job{brief.cost.jobs === 1 ? '' : 's'}{brief.folder === 'inbox' ? ' · inbox' : ''}</small></span>
      <span className={`prop-chip ${brief.status}`}>{brief.status}</span>
    </button>
    {expanded && (asset ? <AssetDetail asset={asset} repo={repo} onChanged={onChanged} /> : <p className={error ? 'desk-error-inline prop-loading' : 'prop-loading'}>{error || 'Reading asset.json…'}</p>)}
  </article>
}

export default function PropertiesPanel({ onClose }: { onClose: () => void }) {
  const { repo } = useDesktop()
  const [listing, setListing] = useState<Listing | null>(null)
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [card, setCard] = useState<string | null>(cardId)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const [value, registry] = await Promise.all([api<Listing>('/assets'), api<{ entities: { id: string; title: string }[] }>('/workspace').catch(() => ({ entities: [] }))])
      if (request !== generation.current) return
      setListing(value); setTitles(Object.fromEntries(registry.entities.map(item => [item.id, item.title]))); setError(''); setRevision(current => current + 1)
    } catch (error) { if (request === generation.current) setError(message(error)) }
  }, [])
  useEffect(() => {
    void Promise.resolve().then(refresh)
    const changed = () => { void refresh() }
    const route = () => { setCard(cardId()); setShowAll(false) }
    window.addEventListener('mrmak-workspace-changed', changed)
    window.addEventListener('focus', changed)
    window.addEventListener('hashchange', route)
    const timer = window.setInterval(changed, 20000)
    return () => { invalidate(); window.removeEventListener('mrmak-workspace-changed', changed); window.removeEventListener('focus', changed); window.removeEventListener('hashchange', route); clearInterval(timer) }
  }, [refresh, invalidate])
  const all = listing?.assets || []
  const scoped = card && !showAll ? all.filter(asset => asset.cards.includes(card)) : all
  // A card with one or two assets opens them; longer lists stay compact until picked.
  const isOpen = (id: string) => expanded.has(id) !== (!!card && !showAll && scoped.length <= 2)
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const total = scoped.reduce((sum, asset) => sum + asset.cost.usd, 0)
  const pending = scoped.filter(asset => asset.status === 'review').length
  const item = (asset: AssetBrief) => <AssetItem key={asset.id} brief={asset} expanded={isOpen(asset.id)} toggle={() => toggle(asset.id)} repo={repo} revision={revision} onChanged={() => void refresh()} />
  return <div className="files-panel properties-panel"><header><h2>Properties</h2><div>
    <button className="desk-icon" onClick={() => void refresh()} title="Refresh properties" aria-label="Refresh properties"><Icon name="refresh" size={15} /></button>
    <button className="desk-icon" onClick={onClose} aria-label="Close properties"><Icon name="close" size={17} /></button>
  </div></header>
    <div className="prop-scope">
      <Row label="Scope" tone={card && !showAll ? 'live' : undefined}>{card && !showAll ? titles[card] || card : 'All assets'}</Row>
      <Row label="Assets">{listing ? scoped.length : '…'}{pending ? <em> · {pending} in review</em> : null}</Row>
      <Row label="Spend" tone={total > 0 ? 'amber' : undefined}>{usd(total)}</Row>
      {card && <button className="prop-scope-toggle" onClick={() => setShowAll(value => !value)}>{showAll ? 'This card only' : 'Show all assets'}</button>}
    </div>
    <div className="prop-scroll">
      {error && <p className="desk-error-inline" role="alert">{error}</p>}
      {listing?.problems.map(problem => <p key={problem.path} className="prop-problem">{problem.message}<small>{problem.path}</small></p>)}
      {!listing && !error && <p className="prop-empty">Reading asset sidecars…</p>}
      {listing && !all.length && <p className="prop-empty">No asset.json sidecars yet. Tools write them to assets/&lt;id&gt;/ and inbox/&lt;id&gt;/.</p>}
      {listing && all.length > 0 && !scoped.length && <p className="prop-empty">No assets list this card. <button onClick={() => setShowAll(true)}>Show all assets</button></p>}
      {card && !showAll ? scoped.map(item) : STATUSES.map(status => {
        const group = scoped.filter(asset => asset.status === status)
        return group.length ? <section key={status} className="prop-group"><h3 className={status}>{status}<small>{group.length}</small></h3>{group.map(item)}</section> : null
      })}
    </div>
  </div>
}
