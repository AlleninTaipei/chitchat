// Master Clock
export let sessionStartMs = 0
export function initClock() { sessionStartMs = performance.now() }
export function nowMs(): number { return performance.now() - sessionStartMs }

// Subtitle item — superset of legacy SubtitleLine
export interface SubtitleItem {
  id: string
  text: string
  startAt: number   // ms since session start
  endAt?: number    // undefined = still streaming
  speaker: 'user' | 'ai'
}

// Centralised app mode flags
export interface AppMode {
  cameraEnabled: boolean
  aiEnabled: boolean
  teleprompter: boolean
  scriptMode: boolean   // Phase 3 reserved, initial false
}

export interface AppState {
  mode: AppMode
  recording: { status: 'idle' | 'recording' | 'paused' }
  persona: { presetId: string; customPrompt?: string }  // Phase 2 reserved
}

export const DEFAULT_APP_STATE: AppState = {
  mode: { cameraEnabled: true, aiEnabled: true, teleprompter: false, scriptMode: false },
  recording: { status: 'idle' },
  persona: { presetId: 'default' },
}

// Conversation State Machine
export type ConversationState =
  | 'idle' | 'ready' | 'listening' | 'transcribing'
  | 'thinking' | 'ai_streaming' | 'turn_done'

export interface ConversationContext {
  userTranscript?: string
  aiResponse?: string
  isInterrupted: boolean
  currentTurnId: number
  mode: Pick<AppMode, 'aiEnabled' | 'teleprompter' | 'scriptMode'>
}

export type ConversationEvent =
  | { type: 'START_SESSION' }
  | { type: 'STOP_SESSION' }
  | { type: 'USER_SPEECH_START' }
  | { type: 'SPEECH_END' }
  | { type: 'TRANSCRIPT_READY'; text: string }
  | { type: 'AI_FIRST_TOKEN' }
  | { type: 'AI_STREAM_CHUNK'; text: string }
  | { type: 'AI_STREAM_END' }
  | { type: 'USER_INTERRUPT' }
  | { type: 'MODE_CHANGED'; mode: Partial<ConversationContext['mode']> }
  | { type: 'RESET_TURN' }

export interface MachineState {
  state: ConversationState
  ctx: ConversationContext
}
