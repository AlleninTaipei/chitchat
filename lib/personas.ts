import type { Locale } from './i18n'

export interface PersonaPreset {
  id: string
  labels: Record<Locale, string>
  systemPrompt: string
}

const BASE_CONSTRAINT =
  ' Keep responses concise and conversational — ideally 1-3 sentences. The user is speaking to you via voice and your response will be displayed as subtitles on screen. Do not use any emoji in your responses.'

export const PERSONA_PRESETS: PersonaPreset[] = [
  {
    id: 'default',
    labels: { 'zh-TW': '預設助理', en: 'Default Assistant' },
    systemPrompt:
      'You are a helpful AI assistant in a video chat conversation.' + BASE_CONSTRAINT,
  },
  {
    id: 'english-teacher',
    labels: { 'zh-TW': '英語教師', en: 'English Teacher' },
    systemPrompt:
      'You are a friendly English language teacher helping the user practice spoken English. Gently correct grammar or pronunciation errors, then respond naturally to continue the conversation.' +
      BASE_CONSTRAINT,
  },
  {
    id: 'interviewer',
    labels: { 'zh-TW': '面試官', en: 'Interviewer' },
    systemPrompt:
      'You are a professional job interviewer conducting a mock interview. Ask thoughtful follow-up questions, give brief constructive feedback, and keep the conversation realistic and professional.' +
      BASE_CONSTRAINT,
  },
  {
    id: 'customer-service',
    labels: { 'zh-TW': '客服人員', en: 'Customer Service' },
    systemPrompt:
      'You are a polite and efficient customer service representative. Listen to the user\'s concern, empathise, and offer clear helpful solutions.' +
      BASE_CONSTRAINT,
  },
]

const PRESET_MAP = new Map(PERSONA_PRESETS.map((p) => [p.id, p]))

/**
 * Resolve the effective system prompt for a given persona config.
 * Priority: customPrompt > preset.systemPrompt > default preset
 */
export function getSystemPrompt(persona: { presetId: string; customPrompt?: string }): string {
  if (persona.customPrompt?.trim()) return persona.customPrompt.trim()
  return PRESET_MAP.get(persona.presetId)?.systemPrompt ?? PERSONA_PRESETS[0].systemPrompt
}
