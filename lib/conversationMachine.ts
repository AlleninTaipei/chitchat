import type { MachineState, ConversationEvent, ConversationContext } from '@/types'

const INITIAL_CTX: ConversationContext = {
  isInterrupted: false,
  currentTurnId: 0,
  mode: { aiEnabled: true, teleprompter: false, scriptMode: false },
}

export function initialMachineState(): MachineState {
  return { state: 'idle', ctx: { ...INITIAL_CTX } }
}

export function conversationReducer(
  machine: MachineState,
  event: ConversationEvent,
): MachineState {
  const { state, ctx } = machine

  switch (event.type) {
    case 'START_SESSION':
      if (state === 'idle') return { state: 'ready', ctx: { ...ctx, isInterrupted: false } }
      break

    case 'STOP_SESSION':
      return { state: 'idle', ctx: { ...INITIAL_CTX, mode: ctx.mode } }

    case 'USER_SPEECH_START':
      if (state === 'ready' || state === 'turn_done') {
        return { state: 'listening', ctx: { ...ctx, userTranscript: undefined, aiResponse: undefined } }
      }
      // Interrupt if AI is responding
      if (state === 'thinking' || state === 'ai_streaming') {
        return { state: 'listening', ctx: { ...ctx, isInterrupted: true, userTranscript: undefined, aiResponse: undefined } }
      }
      break

    case 'SPEECH_END':
      if (state === 'listening') return { state: 'transcribing', ctx }
      break

    case 'TRANSCRIPT_READY': {
      if (state !== 'transcribing' && state !== 'listening') break
      const withTranscript = { ...ctx, userTranscript: event.text }
      // Teleprompter / AI disabled short-circuit → skip AI call
      if (!ctx.mode.aiEnabled || ctx.mode.teleprompter) {
        return { state: 'turn_done', ctx: withTranscript }
      }
      return { state: 'thinking', ctx: withTranscript }
    }

    case 'AI_FIRST_TOKEN':
      if (state === 'thinking') return { state: 'ai_streaming', ctx: { ...ctx, aiResponse: '' } }
      break

    case 'AI_STREAM_CHUNK':
      if (state === 'ai_streaming') {
        return { state: 'ai_streaming', ctx: { ...ctx, aiResponse: (ctx.aiResponse ?? '') + event.text } }
      }
      break

    case 'AI_STREAM_END':
      if (state === 'ai_streaming') return { state: 'turn_done', ctx }
      break

    case 'USER_INTERRUPT':
      if (state === 'thinking' || state === 'ai_streaming') {
        return { state: 'ready', ctx: { ...ctx, isInterrupted: true } }
      }
      break

    case 'MODE_CHANGED':
      return { state, ctx: { ...ctx, mode: { ...ctx.mode, ...event.mode } } }

    case 'RESET_TURN':
      if (state === 'turn_done') return { state: 'ready', ctx: { ...ctx, userTranscript: undefined, aiResponse: undefined, isInterrupted: false, currentTurnId: ctx.currentTurnId + 1 } }
      break
  }

  return machine
}

export function dispatchWithLog(
  machine: MachineState,
  event: ConversationEvent,
): MachineState {
  const next = conversationReducer(machine, event)
  if (process.env.NODE_ENV === 'development' && next !== machine) {
    console.log(`[conversation] ${machine.state} --(${event.type})-> ${next.state}`)
  }
  return next
}
