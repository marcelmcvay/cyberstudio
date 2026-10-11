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
  review?: { notes?: Note[]; approved_by?: string; approved_at?: string; history?: HistoryEntry[] }
  job_previews?: Record<string, string>
}
type Note = { at: string; by: string; text: string; edited_at?: string; retracted_at?: string }
type HistoryEntry = { at: string; by: string; status: Status; from?: Status; approved_by?: string; approved_at?: string }
type NotePatch = { noteEdit: { index: number; text: string } } | { noteDelete: number } | { noteRetract: number }
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

type Notify = (toast: Toast) => void
type Toast = { text: string; undo?: () => Promise<void> }
type Ledger = { spend: number; jobs: number }

const OWNER = 'Marcel'
const NOTE_EDIT_MS = 10 * 60 * 1000
const STATUS_ORDER: Status[] = ['draft', 'review', 'approved', 'superseded']
const short = (id: string) => id.split(/[-_]/)[0].slice(0, 12) || id.slice(0, 12)
// Ledger notes mix tool bookkeeping ("status=completed; credits from generate cost") with the prompt.
const excerpt = (note: string | undefined) => (note || '').split(';').map(part => part.trim()).filter(part => part && !/^[\w.-]+=\S*$/.test(part) && !/^(credits from|no credit field)/i.test(part)).join('; ')
const historyLine = (entry: HistoryEntry) => `${entry.status} by ${entry.by}, ${when(entry.at)}`
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return }
  catch {
    const area = Object.assign(document.createElement('textarea'), { value: text })
    area.style.position = 'fixed'; area.style.opacity = '0'
    document.body.append(area); area.select()
    try { document.execCommand('copy') } finally { area.remove() }
  }
}
// The output a job made: a file whose name carries the job id, or the image a receipt maps to it.
function jobFile(asset: Asset, job: Job) {
  const id = job.job_id.toLowerCase(), head = short(job.job_id).toLowerCase()
  const named = asset.files.filter(file => { const name = fileName(file.path).toLowerCase(); return name.includes(id) || (head.length >= 8 && name.includes(head)) })
  const mapped = asset.job_previews?.[job.job_id]
  return named.find(file => IMAGE.test(file.path))?.path || mapped || named[0]?.path || null
}

/** The header status chip is the picker: a menu button with radio items, arrow keys and Escape. */
function StatusPicker({ status, title, busy, onPick }: { status: Status; title: string; busy: boolean; onPick: (status: Status) => void }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLUListElement>(null)
  const focusItem = (index: number) => { const items = menu.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]'); items?.[(index + STATUS_ORDER.length) % STATUS_ORDER.length]?.focus() }
  useEffect(() => { if (open) focusItem(Math.max(0, STATUS_ORDER.indexOf(status))) }, [open, status])
  const close = (refocus = true) => { setOpen(false); if (refocus) button.current?.focus() }
  const pick = (next: Status) => { close(); if (next !== status) onPick(next) }
  return <div className="prop-status-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
    <button ref={button} type="button" className={`prop-chip ${status}`} aria-haspopup="menu" aria-expanded={open} disabled={busy}
      aria-label={`Status ${status}. Change status for ${title}`} title="Change status"
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true) } }}>
      {status}<span className="prop-chip-caret" aria-hidden="true" />
    </button>
    {open && <ul ref={menu} className="prop-status-menu" role="menu" aria-label={`Status for ${title}`}
      onKeyDown={event => {
        const index = STATUS_ORDER.findIndex(item => item === (document.activeElement as HTMLElement | null)?.dataset.status)
        if (event.key === 'ArrowDown') { event.preventDefault(); focusItem(index + 1) }
        else if (event.key === 'ArrowUp') { event.preventDefault(); focusItem(index - 1) }
        else if (event.key === 'Home') { event.preventDefault(); focusItem(0) }
        else if (event.key === 'End') { event.preventDefault(); focusItem(STATUS_ORDER.length - 1) }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
        else if (event.key === 'Tab') close(false)
      }}>
      {STATUS_ORDER.map(item => <li key={item} role="none"><button type="button" role="menuitemradio" aria-checked={item === status} data-status={item} className={item} tabIndex={-1} onClick={() => pick(item)}>
        <span aria-hidden="true">{item === status ? '■' : '□'}</span>{item}
      </button></li>)}
    </ul>}
  </div>
}

function JobRow({ asset, job, repo, notify }: { asset: Asset; job: Job; repo: string; notify: Notify }) {
  const file = jobFile(asset, job)
  const text = excerpt(job.note)
  const model = `${job.tool}${job.model ? `/${job.model}` : ''}`
  const open = (path: string) => api<Preview>(`/preview?path=${encodeURIComponent(`${repo}/${path}`)}`).then(setPreview).catch(reportError)
  const copy = (value: string, label: string) => { void copyText(value).then(() => notify({ text: label })).catch(error => notify({ text: message(error) })) }
  return <li className="prop-job">
    {file && IMAGE.test(file)
      ? <button type="button" className="prop-job-thumb" onClick={() => void open(file)} title={`Open ${fileName(file)}`}><img src={contentUrl(`/${file.split('/').map(encodeURIComponent).join('/')}`)} alt="" loading="lazy" decoding="async" /></button>
      : null}
    <div className="prop-job-body">
      <div className="prop-job-line"><span>{job.tool}{job.model ? <small> / {job.model}</small> : null}</span><time>{day(job.ts)}</time><b>{job.cost_usd == null ? '—' : usd(job.cost_usd)}</b></div>
      {text && <p className="prop-job-note" title={job.note}>{text}</p>}
      <div className="prop-job-actions">
        <button type="button" className="prop-job-id" title={`Job ${job.job_id}. Click to copy the id.`} aria-label={`Copy job id ${job.job_id}`} onClick={() => copy(job.job_id, `Copied job id ${short(job.job_id)}.`)}>id {short(job.job_id)}</button>
        {file && !IMAGE.test(file) && <button type="button" className="prop-job-file" title={`Open ${file}`} onClick={() => void open(file)}>{fileName(file)}</button>}
        <button type="button" onClick={() => copy(`Job ${job.job_id} (${model}) for asset ${asset.id}: ${text || job.note || 'no note'}`, 'Job copied. Paste it into a chat.')}>Copy job to chat</button>
      </div>
    </div>
  </li>
}

function NoteItem({ item, index, now, busy, patch }: { item: Note; index: number; now: number; busy: boolean; patch: (value: NotePatch) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.text)
  const own = item.by === OWNER
  const fresh = own && !item.retracted_at && now - Date.parse(item.at) <= NOTE_EDIT_MS
  return <li className={item.retracted_at ? 'retracted' : undefined}>
    <header><b>{item.by}</b><time>{when(item.at)}{item.edited_at ? ' · edited' : ''}</time></header>
    {editing
      ? <form className="prop-note prop-note-edit" onSubmit={event => { event.preventDefault(); void patch({ noteEdit: { index, text } }).then(ok => { if (ok) setEditing(false) }) }}>
        <textarea value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={3} aria-label="Edit note" autoFocus onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(false) } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit() }} />
        <div><button type="button" className="quiet" onClick={() => setEditing(false)}>Cancel</button><button type="submit" disabled={busy || !text.trim()}>Save</button></div>
      </form>
      : <p>{item.text}</p>}
    {item.retracted_at && <small className="prop-note-meta">Retracted {when(item.retracted_at)}</small>}
    {own && !item.retracted_at && !editing && <div className="prop-note-actions">
      {fresh ? <>
        <button type="button" disabled={busy} onClick={() => { setText(item.text); setEditing(true) }}>Edit</button>
        <button type="button" disabled={busy} onClick={() => void patch({ noteDelete: index })}>Delete</button>
      </> : <button type="button" disabled={busy} title="Keeps the note, struck through" onClick={() => void patch({ noteRetract: index })}>Retract</button>}
    </div>}
  </li>
}

function AssetDetail({ asset, repo, onChanged, notify, cards, onStatus }: { asset: Asset; repo: string; onChanged: () => void; notify: Notify; cards: Record<string, string>; onStatus: (status: Status) => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [assign, setAssign] = useState('')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer) }, [])
  const patch = async (value: NotePatch | { note: string } | { cards: string[] }) => {
    setBusy(true); setError('')
    try { await api(`/assets/${encodeURIComponent(asset.id)}`, value, 'PATCH'); if ('note' in value) setNote(''); setNow(Date.now()); onChanged(); return true }
    catch (error) { setError(message(error)); return false }
    finally { setBusy(false) }
  }
  const open = (path: string) => api<Preview>(`/preview?path=${encodeURIComponent(`${repo}/${path}`)}`).then(setPreview).catch(reportError)
  const { provenance, mesh, review } = asset
  const jobs = provenance?.jobs || []
  const jobCost = jobs.reduce((sum, job) => sum + (Number(job.cost_usd) || 0), 0)
  const notes = review?.notes || []
  const history = (review?.history || []).slice(-3).reverse()
  const thumb = ['preview', 'reference', 'output'].map(role => asset.files.find(file => file.role === role && IMAGE.test(file.path))).find(Boolean)
  const validator = mesh?.validator
  const choices = Object.entries(cards).filter(([id]) => !asset.cards.includes(id)).sort((a, b) => a[1].localeCompare(b[1]))
  return <div className="prop-detail">
    <p className="prop-history" aria-label="Status history">
      {history.length ? history.map((entry, index) => <span key={`${entry.at}:${index}`}>{historyLine(entry)}</span>)
        : review?.approved_by ? <span>approved by {review.approved_by}, {when(review.approved_at)}</span>
        : <span>No status changes yet. Tools never approve.</span>}
    </p>
    {asset.folder === 'inbox' && <section className="prop-triage" aria-label="Triage"><h4>Triage <small>inbox</small></h4>
      <form className="prop-triage-row" onSubmit={event => { event.preventDefault(); if (assign) void patch({ cards: [...asset.cards, assign] }).then(ok => { if (ok) { notify({ text: `Assigned to ${cards[assign] || assign}.` }); setAssign('') } }) }}>
        <select value={assign} onChange={event => setAssign(event.target.value)} aria-label={`Assign ${asset.title} to a card`} disabled={busy || !choices.length}>
          <option value="">{choices.length ? 'Assign to card…' : 'No cards to assign'}</option>
          {choices.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
        <button type="submit" disabled={busy || !assign}>Assign</button>
      </form>
      <div className="prop-triage-row" role="group" aria-label="Set status">
        {(['review', 'draft'] as Status[]).filter(status => status !== asset.status).map(status => <button key={status} type="button" disabled={busy} onClick={() => onStatus(status)}>Mark {status}</button>)}
      </div>
    </section>}
    {thumb && <button className="prop-thumb" onClick={() => void open(thumb.path)} title={`Open ${fileName(thumb.path)}`}><img src={contentUrl(`/${thumb.path.split('/').map(encodeURIComponent).join('/')}`)} alt="" loading="lazy" decoding="async" /><span>{thumb.role}</span></button>}
    <section><h4>Asset</h4>
      <Row label="ID">{asset.id}</Row>
      <Row label="Kind">{asset.kind || '—'}</Row>
      <Row label="Cost (est.)" tone={asset.cost.usd > 0 ? 'amber' : undefined}>{usd(asset.cost.usd)} · {asset.cost.jobs} job{asset.cost.jobs === 1 ? '' : 's'}{asset.cost.basis && asset.cost.basis !== 'none' ? ` · ${asset.cost.basis}` : ''}</Row>
      <Row label="Folder">{asset.folder}/{asset.id}</Row>
      <Row label="Updated">{when(asset.updated)}</Row>
      {asset.tags?.length > 0 && <Row label="Tags">{asset.tags.join(' · ')}</Row>}
      {asset.cards.length > 0 && <Row label="Cards">{asset.cards.map(id => cards[id] || id).join(' · ')}</Row>}
      {asset.superseded_by && <Row label="Replaced by" tone="muted">{asset.superseded_by}</Row>}
    </section>
    <section><h4>Provenance</h4>
      <Row label="Origin">{provenance?.origin || '—'}</Row>
      {provenance?.imported_from && <Row label="From">{provenance.imported_from}</Row>}
      {provenance?.inputs?.length ? <Row label="Inputs">{provenance.inputs.join(' · ')}</Row> : null}
      {provenance?.link && <Row label="Link"><a href={provenance.link} target="_blank" rel="noreferrer">{provenance.link.replace(/^https?:\/\//, '')}</a></Row>}
      {jobs.length > 0 && <details className="prop-jobs-fold">
        <summary>{jobs.length} job{jobs.length === 1 ? '' : 's'} · {usd(jobCost)}</summary>
        <ol className="prop-jobs">{jobs.map(job => <JobRow key={job.job_id} asset={asset} job={job} repo={repo} notify={notify} />)}</ol>
      </details>}
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
      {notes.length > 0 ? <ol className="prop-notes">{notes.map((item, index) => <NoteItem key={`${item.at}:${index}:${item.text.length}`} item={item} index={index} now={now} busy={busy} patch={patch} />)}</ol> : <p className="prop-empty-line">No notes yet.</p>}
      <form className="prop-note" onSubmit={event => { event.preventDefault(); if (note.trim()) void patch({ note }) }}>
        <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={2} placeholder="Add a review note…" aria-label={`Review note for ${asset.title}`} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) event.currentTarget.form?.requestSubmit() }} />
        <button type="submit" disabled={busy || !note.trim()}>Add note</button>
      </form>
      <p className="prop-empty-line">Your notes can be edited or deleted for 10 minutes. After that, retract.</p>
      {error && <p className="desk-error-inline" role="alert">{error}</p>}
    </section>
  </div>
}

function AssetItem({ brief, expanded, toggle, repo, revision, onChanged, notify, cards, setStatus, busy }: { brief: AssetBrief; expanded: boolean; toggle: () => void; repo: string; revision: number; onChanged: () => void; notify: Notify; cards: Record<string, string>; setStatus: (brief: AssetBrief, status: Status) => void; busy: boolean }) {
  const [asset, setAsset] = useState<Asset | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!expanded) return
    let alive = true
    // Raw sidecars may omit optional arrays (an intake sidecar has no cards yet).
    api<Asset>(`/assets/${encodeURIComponent(brief.id)}`).then(value => { if (alive) { setAsset({ ...value, cards: value.cards || [], tags: value.tags || [], files: value.files || [] }); setError('') } }).catch(error => { if (alive) setError(message(error)) })
    return () => { alive = false }
  }, [expanded, brief.id, revision])
  return <article className={`prop-asset ${brief.status}${expanded ? ' open' : ''}`} data-asset-id={brief.id}>
    <div className="prop-asset-head">
      <button type="button" className="prop-asset-toggle" onClick={toggle} aria-expanded={expanded}>
        {brief.preview ? <img src={contentUrl(`/${brief.preview.split('/').map(encodeURIComponent).join('/')}`)} alt="" loading="lazy" decoding="async" /> : <span className="prop-glyph">{brief.kind || 'asset'}</span>}
        <span className="prop-asset-title"><strong>{brief.title}</strong><small>{brief.kind || 'asset'} · {usd(brief.cost.usd)} · {brief.cost.jobs} job{brief.cost.jobs === 1 ? '' : 's'}{brief.folder === 'inbox' ? ' · inbox' : ''}</small></span>
      </button>
      <StatusPicker status={brief.status} title={brief.title} busy={busy} onPick={status => setStatus(brief, status)} />
    </div>
    {expanded && (asset ? <AssetDetail asset={asset} repo={repo} onChanged={onChanged} notify={notify} cards={cards} onStatus={status => setStatus(brief, status)} /> : <p className={error ? 'desk-error-inline prop-loading' : 'prop-loading'}>{error || 'Reading asset.json…'}</p>)}
  </article>
}

export default function PropertiesPanel({ onClose, focus }: { onClose: () => void; focus?: { id: string; at: number } | null }) {
  const { repo } = useDesktop()
  const [listing, setListing] = useState<Listing | null>(null)
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [titles, setTitles] = useState<Record<string, string>>({})
  const [card, setCard] = useState<string | null>(cardId)
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<Toast | null>(null)
  const [writing, setWriting] = useState(false)
  const [target, setTarget] = useState<string | null>(null)
  const generation = useRef(0)
  const toastTimer = useRef(0)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const [value, registry, spend] = await Promise.all([api<Listing>('/assets'), api<{ entities: { id: string; title: string }[] }>('/workspace').catch(() => ({ entities: [] })), api<Ledger>('/ledger').catch(() => null)])
      if (request !== generation.current) return
      setListing(value); setLedger(spend); setTitles(Object.fromEntries(registry.entities.map(item => [item.id, item.title]))); setError(''); setRevision(current => current + 1)
    } catch (error) { if (request === generation.current) setError(message(error)) }
  }, [])
  const notify = useCallback((next: Toast) => {
    clearTimeout(toastTimer.current); setToast(next)
    toastTimer.current = window.setTimeout(() => setToast(null), next.undo ? 8000 : 3500)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])
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
  // Intake hands over a new asset: show everything, open it and scroll to it once it is listed.
  useEffect(() => {
    if (!focus) return
    void Promise.resolve().then(refresh).then(() => { setShowAll(true); setExpanded(current => new Set([...current, focus.id])); setTarget(focus.id) })
  }, [focus, refresh])
  useEffect(() => {
    if (!target || !listing?.assets.some(asset => asset.id === target)) return
    const frame = requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>(`.properties-panel [data-asset-id="${CSS.escape(target)}"]`)
      node?.scrollIntoView({ block: 'start', behavior: 'smooth' }); node?.querySelector<HTMLElement>('.prop-asset-toggle')?.focus({ preventScroll: true })
      setTarget(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, listing])
  const setStatus = useCallback(async (brief: AssetBrief, status: Status) => {
    const from = brief.status
    setWriting(true)
    try {
      await api(`/assets/${encodeURIComponent(brief.id)}`, { status }, 'PATCH')
      await refresh()
      notify({
        text: `${brief.title}: ${from} to ${status}.`,
        undo: async () => {
          try { await api(`/assets/${encodeURIComponent(brief.id)}`, { status: from, undo: true }, 'PATCH'); await refresh(); notify({ text: `${brief.title} is back to ${from}.` }) }
          catch (error) { notify({ text: message(error) }) }
        },
      })
    } catch (error) { notify({ text: message(error) }) }
    finally { setWriting(false) }
  }, [refresh, notify])
  const all = listing?.assets || []
  const scoped = card && !showAll ? all.filter(asset => asset.cards.includes(card)) : all
  // A card with one or two assets opens them; longer lists stay compact until picked.
  const isOpen = (id: string) => expanded.has(id) !== (!!card && !showAll && scoped.length <= 2)
  const toggle = (id: string) => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const total = scoped.reduce((sum, asset) => sum + asset.cost.usd, 0)
  // Ledger month total vs everything the sidecars account for. The rest is spend no asset claims yet.
  const unlinked = ledger ? ledger.spend - all.reduce((sum, asset) => sum + asset.cost.usd, 0) : 0
  const pending = scoped.filter(asset => asset.status === 'review').length
  const item = (asset: AssetBrief) => <AssetItem key={asset.id} brief={asset} expanded={isOpen(asset.id)} toggle={() => toggle(asset.id)} repo={repo} revision={revision} onChanged={() => void refresh()} notify={notify} cards={titles} setStatus={(brief, status) => void setStatus(brief, status)} busy={writing} />
  return <div className="files-panel properties-panel"><header><h2>Properties</h2><div>
    <button className="desk-icon" onClick={() => void refresh()} title="Refresh properties" aria-label="Refresh properties"><Icon name="refresh" size={15} /></button>
    <button className="desk-icon" onClick={onClose} aria-label="Close properties"><Icon name="close" size={17} /></button>
  </div></header>
    <div className="prop-scope">
      <Row label="Scope" tone={card && !showAll ? 'live' : undefined}>{card && !showAll ? titles[card] || card : 'All assets'}</Row>
      <Row label="Assets">{listing ? scoped.length : '…'}{pending ? <em> · {pending} in review</em> : null}</Row>
      <Row label="Asset cost (est.)" tone={total > 0 ? 'amber' : undefined}>{usd(total)}</Row>
      {unlinked > 0.01 && <p className="prop-unlinked" title="Ledger month to date minus the cost recorded in asset sidecars">{usd(unlinked)} of this month's spend is not linked to an asset.</p>}
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
    <div className="prop-toast-slot" role="status" aria-live="polite">{toast && <div className="prop-toast">
      <span>{toast.text}</span>
      {toast.undo && <button type="button" onClick={() => { const undo = toast.undo; clearTimeout(toastTimer.current); setToast(null); void undo?.() }}>Undo</button>}
      <button type="button" className="prop-toast-close" aria-label="Dismiss" onClick={() => { clearTimeout(toastTimer.current); setToast(null) }}>×</button>
    </div>}</div>
  </div>
}
