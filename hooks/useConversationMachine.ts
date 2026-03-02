"use client"

import { useState, useCallback, useEffect } from 'react'
import type { AppMode, MachineState, ConversationEvent } from '@/types'
import { initialMachineState, dispatchWithLog } from '@/lib/conversationMachine'

type ModeSlice = Pick<AppMode, 'aiEnabled' | 'teleprompter' | 'scriptMode'>

export function useConversationMachine(mode: ModeSlice) {
  const [machine, setMachine] = useState<MachineState>(() => initialMachineState())

  const dispatch = useCallback((event: ConversationEvent) => {
    setMachine((prev) => dispatchWithLog(prev, event))
  }, [])

  // Propagate mode changes into the machine context
  useEffect(() => {
    dispatch({ type: 'MODE_CHANGED', mode })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.aiEnabled, mode.teleprompter, mode.scriptMode])

  return { machine, dispatch }
}
