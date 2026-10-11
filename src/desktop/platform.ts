// Platform-aware wording for the desktop UI. The service runs on the same machine.
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
export const isWindows = !isMac && /Win/.test(navigator.platform || navigator.userAgent)

export const pasteKey = isMac ? 'Cmd+V' : 'Ctrl+V'
export const osAccount = isMac ? 'your Mac account' : isWindows ? 'your Windows account' : 'your user account'
export const osName = isMac ? 'macOS' : isWindows ? 'Windows' : 'Local account'
export const fileManager = isMac ? 'Finder' : isWindows ? 'Explorer' : 'your file manager'
