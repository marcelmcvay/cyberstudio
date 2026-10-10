import { useEffect, useState } from 'react'
import { api, isDesktop } from '../desktop/client'

interface Ledger { project: string; spend: number; cap: number; jobs: number }

/** HUD readout under the topbar: project, mode and month-to-date generation spend. */
export default function Readout() {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  useEffect(() => {
    if (!isDesktop) return
    let alive = true
    const load = () => { api<Ledger>('/ledger').then(value => { if (alive) setLedger(value) }).catch(() => {}) }
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener('mrmak-workspace-changed', load)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('mrmak-workspace-changed', load) }
  }, [])
  if (!ledger) return null
  const ratio = ledger.cap > 0 ? ledger.spend / ledger.cap : 0
  const level = ratio > 1 ? ' over' : ratio >= 0.8 ? ' warn' : ''
  return (
    <div className="hud-readout" aria-label="Project status">
      <span>Project : <b>{ledger.project}</b></span>
      <span>Mode : <b>local</b></span>
      <span className={`hud-spend${level}`} title={`${ledger.jobs} paid job${ledger.jobs === 1 ? '' : 's'} this month`}>
        Spend : <b>${ledger.spend.toFixed(2)} / ${ledger.cap.toFixed(0)}</b>
      </span>
    </div>
  )
}
