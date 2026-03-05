import type { ScriptLine } from '@/types'

function isStageDirection(text: string): boolean {
  const t = text.trim()
  return t.startsWith('[') || t.startsWith('(')
}

export function parseTxt(content: string): ScriptLine[] {
  const lines: ScriptLine[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || isStageDirection(line)) continue
    // Match "Name: text" or "Name：text" (full-width colon)
    const match = line.match(/^([^:：]+)[：:]\s*(.+)$/)
    if (!match) continue
    const character = match[1].trim()
    const text = match[2].trim()
    if (!character || !text) continue
    lines.push({ id: String(lines.length), character, text, role: 'ai' })
  }
  return lines
}

export function parseHtml(content: string): ScriptLine[] {
  const lines: ScriptLine[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(content, 'text/html')
  for (const p of doc.querySelectorAll('p')) {
    const text = p.textContent?.trim() ?? ''
    if (!text || isStageDirection(text)) continue
    const bold = p.querySelector('b')
    if (!bold) continue
    const boldText = bold.textContent?.trim() ?? ''
    const charMatch = boldText.match(/^([^:：]+)[：:]$/)
    if (!charMatch) continue
    const character = charMatch[1].trim()
    // Dialogue is the full paragraph text minus the bold prefix
    const boldContent = bold.textContent ?? ''
    const full = p.textContent ?? ''
    const dialogue = full.slice(full.indexOf(boldContent) + boldContent.length).trim()
    if (!character || !dialogue) continue
    lines.push({ id: String(lines.length), character, text: dialogue, role: 'ai' })
  }
  return lines
}

export function assignRoles(lines: ScriptLine[], userCharacter: string): ScriptLine[] {
  const normalized = userCharacter.toLowerCase()
  return lines.map(line => ({
    ...line,
    role: line.character.toLowerCase() === normalized ? 'user' : 'ai',
  }))
}

export function extractCharacters(lines: ScriptLine[]): string[] {
  const seen = new Set<string>()
  const chars: string[] = []
  for (const line of lines) {
    if (!seen.has(line.character)) {
      seen.add(line.character)
      chars.push(line.character)
    }
  }
  return chars
}
