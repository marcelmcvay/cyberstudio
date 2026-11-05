import { useCallback, useEffect, useRef, useState, type IframeHTMLAttributes } from 'react'
import { useWorkspaceTheme } from '../lib/workspace-theme'
import { reportThemeCSS } from '../../desktop/service/report-theme.mjs'
import { installFileActions } from '../../desktop/service/report-file-actions.mjs'
import { workspaceFileActions } from '../lib/download'
import { handleReviewMessage } from '../lib/review-submissions'

type Props = Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'src' | 'onLoad'> & { url: string; onLoad?: () => void }

function ThemedFrame({ url, onLoad, ...props }: Props) {
  const { resolved } = useWorkspaceTheme()
  const frame = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    const origin = new URL(url, location.href).origin
    const receive = async (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return
      if (event.data?.type === 'mrmak:review-hello' || event.data?.type === 'mrmak:review-submit') return handleReviewMessage(event, url, origin, frame.current)
      if (event.data?.type !== 'mrmak:file-request') return
      const { id, action, url: target } = event.data
      if (typeof id !== 'string' || id.length > 100 || typeof target !== 'string' || action !== 'choose') return
      const reply = (value: object) => (event.source as Window).postMessage({ type: 'mrmak:file-result', id, ...value }, origin)
      try {
        const destination = new URL(target)
        if (!['http:', 'https:', 'blob:', 'data:'].includes(destination.protocol) || (destination.protocol === 'blob:' && destination.origin !== origin)) throw new Error('This file link is not supported.')
        // Fetch generated/remote bytes in their originating frame, then start
        // the explicitly chosen download outside its sandbox. No paths or
        // API credentials cross the report boundary.
        const bytes = () => new Promise<Blob>((resolve, reject) => {
          const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', accept) }
          const accept = (message: MessageEvent) => {
            if (message.source !== event.source || message.origin !== origin || message.data?.type !== 'mrmak:file-bytes' || message.data.id !== id) return
            cleanup()
            if (message.data.blob instanceof Blob) resolve(message.data.blob)
            else reject(new Error(typeof message.data.error === 'string' ? message.data.error : 'This file could not be downloaded.'))
          }
          const timer = setTimeout(() => { cleanup(); reject(new Error('The report did not return this file.')) }, 60_000)
          window.addEventListener('message', accept)
          ;(event.source as Window).postMessage({ type: 'mrmak:file-fetch', id }, origin)
        })
        reply({ result: await workspaceFileActions().request(target, typeof event.data.name === 'string' ? event.data.name.slice(0, 255) : undefined, frame.current, bytes) })
      } catch (error) { reply({ error: error instanceof Error ? error.message : 'The file action failed.' }) }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [url])
  // Set the initial colour before a desktop report paints. Later theme changes
  // use a message, preserving scroll position and the report's interactive state.
  const [src] = useState(() => {
    const target = new URL(url, location.href)
    target.searchParams.set('mrmak-theme', resolved)
    return target.href
  })
  const applyTheme = useCallback(() => {
    const element = frame.current
    if (!element) return
    // Vite serves reports on the same origin. Desktop content is isolated on a
    // second origin, whose prelude accepts theme messages only from its UI.
    try {
      const doc = element.contentDocument
      if (doc?.documentElement) {
        // WebKit may reuse the initial about:blank window. Install only in the
        // loaded report, so listeners and the controller belong to its document.
        if (element.contentWindow && doc.URL !== 'about:blank') installFileActions(element.contentWindow)
        if (!doc.querySelector('style[data-mrmak-report-theme]')) {
          const style = doc.createElement('style')
          style.dataset.mrmakReportTheme = ''
          style.textContent = reportThemeCSS
          ;(doc.head || doc.documentElement).append(style)
        }
        doc.documentElement.dataset.mrmakTheme = resolved
      }
    } catch { /* Cross-origin reports use the message below. */ }
    element.contentWindow?.postMessage({ type: 'mrmak:theme', theme: resolved }, new URL(url, location.href).origin)
  }, [resolved, url])
  useEffect(applyTheme, [applyTheme])
  return <iframe {...props} ref={frame} src={src} onLoad={() => { applyTheme(); onLoad?.() }} />
}

export default function ReportFrame(props: Props) {
  return <ThemedFrame key={props.url} {...props} />
}
