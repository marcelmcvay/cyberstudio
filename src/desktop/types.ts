export type AgentId = 'codex' | 'claude' | 'strix' | 'opencode' | 'kimi' | 'shell'
export type Effort = 'medium' | 'high' | 'xhigh' | 'max'
export interface AgentInfo { id: AgentId; label: string; color: string; available: boolean; subscription: boolean; command?: string }
export interface ChatSession {
  id: string; name: string; agent: AgentId; cwd: string; bypass: boolean
  effort?: Effort
  status: 'starting' | 'running' | 'stopped' | 'exited'; createdAt: string
  lastOutputAt: string | null; lastInputAt: string | null; nativeId: string | null
  attention: boolean; cols: number; rows: number; exitCode?: number | null
  activity: 'idle' | 'working' | 'waiting'; unread: boolean; completionVersion: number
  tabOrder: number; tabColor: string | null
  open: boolean; pinned: boolean; updatedAt: string; preview?: string; hasConversation?: boolean; restoreError?: string | null
  // The native conversation is gone: the tab shows its saved screen read-only (C-18).
  conversationMissing?: boolean
  // Status details: Strix connect phase, what the waiting chat needs, the remote folder used, the raw ssh failure.
  connecting?: boolean; waitingText?: string | null; remoteCwd?: string | null; remoteFallback?: boolean; exitDetail?: string | null
}
export interface Notice { id: string; sessionId: string; name: string; kind: string; text: string; at: string }
export interface Operation { id: string; text: string; status: string; result?: string; at: string; images?: string[] }
export interface Settings { defaultAgent: AgentId; defaultBypass: boolean; terminalFontSize?: number; terminalAppearance?: 'focus' | 'original'; workspaceTheme?: 'dark' | 'light' | 'system'; workspaceRoute?: string | null; selectedId?: string | null; coordinatorEffort?: 'medium' | 'high'; voiceName?: string; voiceStyle?: string; recentFolders?: string[]; agentEffort?: Partial<Record<AgentId, Effort>> }
export interface VoiceOwner { clientId: string; surface: 'chats' | 'workspace' }
export interface FileEntry { name: string; path: string; directory: boolean; size: number; modifiedAt: string | null }
export interface Folder { path: string; parent: string; entries: FileEntry[]; truncated: boolean; mode: string }
export interface Preview { path: string; name: string; size: number; kind: 'document' | 'image' | 'video' | 'audio' | 'text' | 'unsupported'; url?: string; text?: string; revision?: string; reason?: string }
export interface DesktopState {
  ready: boolean; connected: boolean; disconnectedAt: number | null; error: string | null; repo: string; contentBase: string
  agents: AgentInfo[]; sessions: ChatSession[]; selectedId: string | null; notices: Notice[]
  settings: Settings; coordinator: string; voice: { configured: boolean; owner: VoiceOwner | null }
  operations: Operation[]; preview: Preview | null
  voiceHistory: { id: string; at: string; captions: { role: 'user' | 'assistant'; text: string; start: number; end: number }[] }[]
}
export interface ServiceEvent {
  type: string; id?: string; data?: string; sequence?: number; session?: ChatSession; sessions?: ChatSession[]
  selectedId?: string; sessionId?: string; state?: string; error?: string; notice?: Notice
  operation?: Operation; settings?: Settings; owner?: VoiceOwner | null; window?: string; route?: string; preview?: Preview
}
export interface BusyChat { id: string; name: string; agent: AgentId; reason: 'working' | 'waiting' | 'process'; command?: string }
export interface NativeConversation { id: string; updatedAt: string; prompt: string }
