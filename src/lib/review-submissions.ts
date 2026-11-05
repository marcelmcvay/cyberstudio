import { api } from '../desktop/client'

// Report review submissions: a report posts its decisions; the UI resolves the
// report's own registered step, asks for confirmation in trusted UI and only
// then records them through the service. Reports never get a token or a path.
interface ReviewTarget { form: string; owner: string; destination: string; entity: string; step: string }
interface Decision { questionId: string; title?: string; decision: 'approve' | 'request-edits'; note?: string }
interface Submission { id: string; form: string; decisions: Decision[] }

const waiting = new WeakSet<Window>()
const label = (decision: string) => decision === 'approve' ? 'Approve' : 'Request edits'

function confirmInWorkspace(target: ReviewTarget, submission: Submission, trigger: Element | null): Promise<boolean> {
  const doc = document
  if (!doc.getElementById('mak-review-confirm-style')) {
    const style = doc.createElement('style'); style.id = 'mak-review-confirm-style'
    style.textContent = `
      .mak-review-confirm{box-sizing:border-box;position:fixed;inset:0;margin:auto;height:fit-content;width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:24px;border:1px solid #544a43;border-radius:14px;background:#1c1815;color:#ede6df;font:14px/1.5 system-ui,sans-serif}
      .mak-review-confirm::backdrop{background:#0008}
      .mak-review-confirm h2{margin:0 0 8px;font:600 19px/1.3 system-ui,sans-serif;color:inherit;overflow-wrap:anywhere}
      .mak-review-confirm p{margin:8px 0;overflow-wrap:anywhere}
      .mak-review-confirm .meta{font-size:12px;opacity:.8}
      .mak-review-confirm ol{margin:12px 0;padding-left:20px;max-height:40vh;overflow:auto}
      .mak-review-confirm li{margin:6px 0;overflow-wrap:anywhere;white-space:pre-wrap}
      .mak-review-confirm .buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
      .mak-review-confirm button{border:1px solid #77685c;border-radius:7px;background:transparent;color:inherit;padding:9px 13px;font:500 13px system-ui,sans-serif;cursor:pointer}
      .mak-review-confirm button.primary{background:#edb1a9;color:#271b18;border-color:#edb1a9}
      .mak-review-confirm button:focus-visible{outline:3px solid #e58171;outline-offset:3px}
      [data-workspace-theme=light] .mak-review-confirm{background:#fffaf5;color:#261f19;border-color:#c5b6a9}`
    doc.head.append(style)
  }
  return new Promise(resolve => {
    const dialog = doc.createElement('dialog'); dialog.className = 'mak-review-confirm'; dialog.setAttribute('aria-label', 'Send review decisions')
    const count = submission.decisions.length
    const heading = doc.createElement('h2'); heading.textContent = `Send ${count} decision${count === 1 ? '' : 's'} from “${target.step}”?`
    const to = doc.createElement('p'); to.textContent = `To: ${target.owner || 'the project review owner'}`
    const where = doc.createElement('p'); where.className = 'meta'; where.textContent = `Recorded in ${target.destination}. Nothing else runs: no builds, jobs, pushes or messages.`
    const list = doc.createElement('ol')
    for (const item of submission.decisions) {
      const row = doc.createElement('li')
      row.textContent = `${item.questionId} · ${label(item.decision)}${item.title ? ` · ${item.title}` : ''}${item.note ? `\n“${item.note}”` : ''}`
      list.append(row)
    }
    const buttons = doc.createElement('div'); buttons.className = 'buttons'
    const send = doc.createElement('button'); send.type = 'button'; send.className = 'primary'; send.textContent = 'Send'
    const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel'
    buttons.append(send, cancel); dialog.append(heading, to, where, list, buttons); doc.body.append(dialog)
    let done = false
    const finish = (value: boolean) => {
      if (done) return; done = true
      dialog.close(); dialog.remove()
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true })
      resolve(value)
    }
    send.onclick = () => finish(true)
    cancel.onclick = () => finish(false)
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false) })
    dialog.showModal(); send.focus()
  })
}

export async function handleReviewMessage(event: MessageEvent, url: string, origin: string, frame: HTMLIFrameElement | null) {
  const source = event.source as Window
  const data = event.data
  const form = typeof data?.form === 'string' ? data.form.slice(0, 80) : ''
  const reply = (value: object) => source.postMessage({ form, ...value }, origin)
  if (data.type === 'mrmak:review-hello') {
    try { reply({ type: 'mrmak:review-ready', target: await api<ReviewTarget>('/reviews/describe', { url, form }) }) }
    catch (error) { reply({ type: 'mrmak:review-unavailable', error: error instanceof Error ? error.message : 'This report cannot send decisions.' }) }
    return
  }
  const id = typeof data.submission?.id === 'string' ? data.submission.id.slice(0, 64) : ''
  const result = (value: object) => reply({ type: 'mrmak:review-result', id, ...value })
  const submission = data.submission as Submission
  if (!id || !Array.isArray(submission?.decisions) || !submission.decisions.length) return result({ status: 'error', error: 'Nothing to send.' })
  if (waiting.has(source)) return result({ status: 'error', error: 'A send from this report is already waiting for confirmation.', busy: true })
  waiting.add(source)
  try {
    const target = await api<ReviewTarget>('/reviews/describe', { url, form: submission.form })
    if (!await confirmInWorkspace(target, submission, frame)) return result({ status: 'cancelled' })
    result({ status: 'recorded', receipt: await api('/reviews/submit', { url, submission }) })
  } catch (error) {
    result({ status: 'error', error: error instanceof Error ? error.message : 'The decisions were not sent.' })
  } finally { waiting.delete(source) }
}
