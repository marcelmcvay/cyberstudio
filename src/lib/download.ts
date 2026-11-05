import { installFileActions } from '../../desktop/service/report-file-actions.mjs'
import { api, desktopState, isDesktop } from '../desktop/client'

export async function localFileAction(url: string, action: string): Promise<unknown> {
  const base = desktopState().contentBase
  if (!isDesktop || !base || !['http:', 'https:'].includes(new URL(url).protocol) || new URL(url).origin !== new URL(base).origin) {
    if (action === 'inspect') return null
    throw new Error('This is not a local Workspace file.')
  }
  return api('/files/action', { url, action })
}

export function workspaceFileActions() {
  return installFileActions(window, { local: localFileAction })
}

export function downloadImage(url: string, name?: string, trigger?: Element | null) {
  return workspaceFileActions().request(url, name, trigger)
}
