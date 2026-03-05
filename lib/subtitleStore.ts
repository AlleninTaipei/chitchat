import type { SubtitleItem } from '@/types'

let idCounter = 0
function nextId(): string {
  return `sub-${++idCounter}`
}

export class SubtitleStore {
  private items: SubtitleItem[] = []
  private openId: string | null = null

  addUserItem(text: string, startAt: number): SubtitleItem {
    const item: SubtitleItem = { id: nextId(), text, startAt, endAt: startAt, speaker: 'user' }
    this.items.push(item)
    return item
  }

  /** Opens a streaming AI item. Returns the new item's id. */
  openAiItem(startAt: number): string {
    const id = nextId()
    const item: SubtitleItem = { id, text: '', startAt, speaker: 'ai' }
    this.items.push(item)
    this.openId = id
    return id
  }

  appendToOpen(text: string): void {
    if (!this.openId) return
    const item = this.items.find((i) => i.id === this.openId)
    if (item) item.text += text
  }

  closeOpen(endAt: number): void {
    if (!this.openId) return
    const item = this.items.find((i) => i.id === this.openId)
    if (item) item.endAt = endAt
    this.openId = null
  }

  /** Called every frame by the canvas draw loop. */
  getRecentForCanvas(count = 4): SubtitleItem[] {
    return this.items.slice(-count)
  }

  /** Full history for UI overlay. */
  getAll(): SubtitleItem[] {
    return this.items
  }

  reset(): void {
    this.items = []
    this.openId = null
  }
}
