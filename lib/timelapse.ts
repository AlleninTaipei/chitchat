import type { SubtitleItem } from '@/types'

export interface Segment {
  id: string
  startAt: number  // ms, original recording timeline
  endAt: number    // ms, original recording timeline
  type: 'user' | 'ai' | 'silent'
  text?: string
}

/** ms of padding added around each active segment to avoid abrupt cuts */
const PADDING_MS = 200

/**
 * Given a list of subtitle items (with timestamps), produce a flat list of
 * Segment objects — alternating active and silent segments.
 *
 * @param subtitles  All SubtitleItems collected during the session
 * @param recordingDurationMs  Total recording length (to clip the last segment)
 * @param silenceThreshold  Gaps longer than this (ms) become a silent cut.
 *   Default is 3000 ms so that the AI API processing delay (~0.5-2 s) within
 *   a conversation turn is bridged rather than split into two separate clips.
 *   Only genuine pauses between topics (3 s+) are removed.
 */
export function generateTimelapseSegments(
  subtitles: SubtitleItem[],
  recordingDurationMs: number,
  silenceThreshold = 3000,
): Segment[] {
  if (subtitles.length === 0) return []

  const segments: Segment[] = []
  let lastEnd = 0

  for (let i = 0; i < subtitles.length; i++) {
    const s = subtitles[i]
    const itemEnd = s.endAt ?? s.startAt + 1000
    const padStart = Math.max(0, s.startAt - PADDING_MS)
    const padEnd = Math.min(recordingDurationMs, itemEnd + PADDING_MS)
    const gap = padStart - lastEnd

    if (gap > silenceThreshold) {
      // Long silence — cut it and start a new active segment
      segments.push({
        id: `silent-${i}`,
        startAt: lastEnd,
        endAt: padStart,
        type: 'silent',
      })
      segments.push({
        id: s.id,
        startAt: padStart,
        endAt: padEnd,
        type: s.speaker,
        text: s.text,
      })
    } else {
      // Short gap (e.g. API delay within a turn) — bridge it by extending the
      // previous active segment rather than creating a separate clip.
      const prev = segments[segments.length - 1]
      if (prev && prev.type !== 'silent') {
        prev.endAt = Math.max(prev.endAt, padEnd)
        if (s.text) prev.text = (prev.text ? prev.text + ' ' : '') + s.text
      } else {
        segments.push({
          id: s.id,
          startAt: padStart,
          endAt: padEnd,
          type: s.speaker,
          text: s.text,
        })
      }
    }

    lastEnd = Math.max(lastEnd, padEnd)
  }

  return segments
}

/** Filter to only active (non-silent) segments and remap their timestamps to a
 *  new continuous timeline starting at 0. */
export function remapSegmentsToTimelapse(segments: Segment[]): {
  active: Segment[]
  totalDurationMs: number
} {
  const active = segments.filter((s) => s.type !== 'silent')
  let cursor = 0
  const remapped = active.map((s) => {
    const duration = s.endAt - s.startAt
    const mapped: Segment = { ...s, startAt: cursor, endAt: cursor + duration }
    cursor += duration
    return mapped
  })
  return { active: remapped, totalDurationMs: cursor }
}

/** How many silent ms would be removed */
export function estimateSavingsMs(segments: Segment[]): number {
  return segments
    .filter((s) => s.type === 'silent')
    .reduce((sum, s) => sum + (s.endAt - s.startAt), 0)
}
