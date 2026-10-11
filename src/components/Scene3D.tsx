import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Scene3DManifest, Scene3DModel } from '../types'
import { ModelViewer, type PlacedStats, type ShadingMode } from '../lib/three/viewer'

/**
 * Scene card: several GLBs placed in one three.js scene at real scale.
 *
 * The manifest lists each model with a position in meters and a yaw, plus
 * camera presets. Models are snapped onto the floor by their box, so a raw
 * export and its cleaned replacement land in the same spot. The mono readout
 * is measured in this browser: load time, triangles, size and file weight per
 * model. Same GLBs go to the other engines, so these are the three.js numbers.
 */

const MODES: { id: ShadingMode; label: string; key: string }[] = [
  { id: 'pbr', label: 'Textured', key: 't' },
  { id: 'solid', label: 'Clay', key: 'c' },
  { id: 'wire', label: 'Wireframe', key: 'w' },
]

type Row =
  | { state: 'loading' }
  | { state: 'ready'; stats: PlacedStats }
  | { state: 'error'; message: string }

const fmt = (n: number) => n.toLocaleString('en-US')
const ms = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`)
const mb = (n: number) => (n ? `${(n / 1048576).toFixed(1)} MB` : '?')
// Snap tiny values to zero so a cleaned pivot never reads as "-0.00".
const m2 = (n: number) => (Math.abs(n) < 0.005 ? 0 : n).toFixed(2)

function nameOf(model: Scene3DModel): string {
  return model.label ?? model.path.split('/').pop()?.replace(/\.glb$/i, '') ?? model.path
}

/** Pivot column: blank once the file's origin is at its floor centre. */
function pivotLabel(p: [number, number, number]): string {
  return p.every(v => Math.abs(v) < 0.01) ? 'origin ok' : `origin off ${p.map(m2).join(', ')}`
}

export default function Scene3D({ manifestUrl }: { manifestUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<ModelViewer | null>(null)
  const [manifest, setManifest] = useState<Scene3DManifest | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [mode, setMode] = useState<ShadingMode>('pbr')
  const [camIndex, setCamIndex] = useState(0)
  const [spin, setSpin] = useState(false)
  const [drawCalls, setDrawCalls] = useState(0)
  const [totalMs, setTotalMs] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${manifestUrl}${manifestUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((m: Scene3DManifest) => {
        if (cancelled) return
        if (!Array.isArray(m.models)) throw new Error('The manifest has no models list.')
        setManifest(m)
        setMode(m.defaultMode ?? 'pbr')
      })
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [manifestUrl])

  // One viewer for the card's lifetime; every model goes into its scene.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !manifest) return
    let cancelled = false
    const viewer = new ModelViewer(host, { maxDistance: 150, far: 500 })
    viewerRef.current = viewer
    viewer.setMode(manifest.defaultMode ?? 'pbr')
    if (manifest.shadows ?? true) viewer.setShadows(true, 16)

    const first = manifest.cameras?.[0]
    if (first) viewer.flyTo({ pos: first.position, target: first.target }, first.fov ?? 45, 0)

    // Resolve against the manifest so paths can reach the project's assets/.
    const base = new URL(manifestUrl, window.location.href)
    setRows(manifest.models.map(() => ({ state: 'loading' })))
    const t0 = performance.now()
    Promise.allSettled(
      manifest.models.map((model, i) =>
        viewer
          .addPlaced(new URL(model.path, base).href, model)
          .then(stats => {
            if (cancelled || !stats) return
            setRows(prev => prev.map((r, j) => (j === i ? { state: 'ready', stats } : r)))
          })
          .catch((e: unknown) => {
            if (cancelled) return
            const message = e instanceof Error ? e.message : String(e)
            setRows(prev => prev.map((r, j) => (j === i ? { state: 'error', message } : r)))
          }),
      ),
    ).then(() => {
      if (cancelled) return
      setTotalMs(performance.now() - t0)
      if (!first) viewer.frame()
    })

    // Draw calls are per frame; sample them rather than re-render React each tick.
    const timer = window.setInterval(() => setDrawCalls(viewer.renderer.info.render.calls), 1000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
      viewerRef.current = null
      viewer.dispose()
    }
  }, [manifest, manifestUrl])

  useEffect(() => {
    viewerRef.current?.setMode(mode)
  }, [mode])

  useEffect(() => {
    viewerRef.current?.setAutoRotate(spin)
  }, [spin])

  const cameras = useMemo(() => manifest?.cameras ?? [], [manifest])
  const goCamera = useCallback(
    (i: number) => {
      const cam = cameras[i]
      if (!cam) return
      setCamIndex(i)
      setSpin(false)
      viewerRef.current?.flyTo({ pos: cam.position, target: cam.target }, cam.fov ?? 45)
    },
    [cameras],
  )
  const reset = useCallback(() => {
    if (cameras.length) goCamera(camIndex)
    else viewerRef.current?.frame()
  }, [cameras.length, camIndex, goCamera])

  // Number keys pick a camera, T/C/W pick shading, R resets, Space spins.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable))
        return
      const n = Number(ev.key)
      const m = MODES.find(x => x.key === ev.key.toLowerCase())
      if (n >= 1 && n <= cameras.length) goCamera(n - 1)
      else if (m) setMode(m.id)
      else if (ev.key === 'r' || ev.key === 'R') reset()
      else if (ev.code === 'Space') {
        ev.preventDefault()
        setSpin(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cameras.length, goCamera, reset])

  if (loadError) {
    return (
      <div className="c3d-boot c3d-boot-error">
        <strong>Could not read the scene manifest</strong>
        <code>{manifestUrl}</code>
        <span>{loadError}</span>
      </div>
    )
  }
  if (!manifest) {
    return (
      <div className="c3d-boot">
        <div className="c3d-spinner" />
      </div>
    )
  }

  const ready = rows.filter((r): r is Extract<Row, { state: 'ready' }> => r.state === 'ready')
  const loading = rows.some(r => r.state === 'loading')
  const totalTris = ready.reduce((n, r) => n + r.stats.triangles, 0)
  const totalBytes = ready.reduce((n, r) => n + r.stats.bytes, 0)
  const budget = manifest.budget?.triangles

  return (
    <div className="c3d s3d">
      <div className="c3d-inner">
        <div className="c3d-bar">
          <span className="s3d-title">{manifest.title ?? 'Scene'}</span>

          {cameras.length > 0 && (
            <div className="c3d-modes" role="group" aria-label="Camera">
              {cameras.map((c, i) => (
                <button
                  key={c.id}
                  className={`c3d-mode${camIndex === i ? ' active' : ''}`}
                  onClick={() => goCamera(i)}
                  title={`${c.label}  ·  ${i + 1}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          <div className="c3d-modes" role="group" aria-label="Shading mode">
            {MODES.map(m => (
              <button
                key={m.id}
                className={`c3d-mode${mode === m.id ? ' active' : ''}`}
                onClick={() => setMode(m.id)}
                title={`${m.label}  ·  ${m.key.toUpperCase()}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="c3d-tools">
            <button className={`c3d-toggle${spin ? ' on' : ''}`} onClick={() => setSpin(v => !v)} title="Orbit the scene (Space)">
              Spin
            </button>
            <button className="c3d-toggle" onClick={reset} title="Back to the current camera preset (R)">
              Reset
            </button>
          </div>
        </div>

        <div className="c3d-panes s3d-panes">
          <div className="c3d-pane">
            <div className="c3d-stage">
              <div className="c3d-grid" aria-hidden />
              <div className="c3d-canvas" ref={hostRef} />
              {loading && ready.length === 0 && (
                <div className="c3d-overlay">
                  <div className="c3d-spinner" />
                  <span>loading {manifest.models.length} models</span>
                </div>
              )}

              <div className="s3d-readout" aria-label="Load measurements">
                <table>
                  <thead>
                    <tr>
                      <th>model</th>
                      <th>load</th>
                      <th>tris</th>
                      <th>w x d x h m</th>
                      <th>file</th>
                      <th>pivot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {manifest.models.map((model, i) => {
                      const row = rows[i]
                      return (
                        <tr key={`${model.path}:${i}`}>
                          <td className="s3d-name">{nameOf(model)}</td>
                          {row?.state === 'ready' ? (
                            <>
                              <td>{ms(row.stats.loadMs)}</td>
                              <td>{fmt(row.stats.triangles)}</td>
                              <td>{row.stats.size.map(m2).join(' x ')}</td>
                              <td>{mb(row.stats.bytes)}</td>
                              <td className={row.stats.pivotOffset.every(v => Math.abs(v) < 0.01) ? 's3d-ok' : 's3d-warn'}>
                                {pivotLabel(row.stats.pivotOffset)}
                              </td>
                            </>
                          ) : row?.state === 'error' ? (
                            <td colSpan={5} className="s3d-err" title={row.message}>
                              failed: {row.message}
                            </td>
                          ) : (
                            <td colSpan={5} className="s3d-dim">
                              loading
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="s3d-name">total</td>
                      <td>{totalMs === null ? '…' : ms(totalMs)}</td>
                      <td className={budget && totalTris > budget ? 's3d-warn' : undefined}>
                        {fmt(totalTris)}
                        {budget ? ` / ${fmt(budget)}` : ''}
                      </td>
                      <td>{drawCalls ? `${drawCalls} draw calls` : ''}</td>
                      <td>{mb(totalBytes)}</td>
                      <td className="s3d-dim">three.js, this browser</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
