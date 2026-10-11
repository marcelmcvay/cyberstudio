import { useEffect, useState } from 'react'
import { api, isDesktop, useDesktop } from '../desktop/client'

interface Ledger { project: string; spend: number; cap: number; jobs: number }

/** HUD readout under the topbar: project, mode and month-to-date generation spend. */
export default function Readout() {
  const { connected } = useDesktop()
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [asOf, setAsOf] = useState<Date | null>(null)
  useEffect(() => {
    if (!isDesktop || !connected) return
    let alive = true
    const load = () => { api<Ledger>('/ledger').then(value => { if (alive) { setLedger(value); setAsOf(new Date()) } }).catch(() => {}) }
    load()
    const timer = window.setInterval(load, 60_000)
    window.addEventListener('mrmak-workspace-changed', load)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('mrmak-workspace-changed', load) }
  }, [connected])
  if (!ledger) return null
  const ratio = ledger.cap > 0 ? ledger.spend / ledger.cap : 0
  const level = ratio > 1 ? ' over' : ratio >= 0.8 ? ' warn' : ''
  const time = asOf?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const jobs = `${ledger.jobs} paid job${ledger.jobs === 1 ? '' : 's'} this month`
  return (
    <div className="hud-readout" aria-label="Project status">
      <span>Project : <b>{ledger.project}</b></span>
      <span>Mode : <b>local</b></span>
      <span
        className={`hud-spend${level}${connected ? '' : ' stale'}`}
        title={connected ? `Month to date as of ${time}. ${jobs}.` : `Stale: last read at ${time}. The local service is disconnected. ${jobs}.`}
      >
        Spend this month : <b>${ledger.spend.toFixed(2)} / ${ledger.cap.toFixed(0)}</b>
        {!connected && <em className="hud-stale"> stale</em>}
      </span>
    </div>
  )
}
