export interface LocalFileAction {
  name: string
  location: string
  native: boolean
  revealLabel: string
}
export interface FileActionController {
  request(url: string, name?: string, trigger?: Element | null, provider?: () => Promise<Blob>): Promise<string>
}
export function installFileActions(window: Window, options?: {
  local?: (url: string, action: string) => Promise<unknown>
  bridgeOrigin?: string
}): FileActionController
