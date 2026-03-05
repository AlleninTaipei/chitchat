"use client";

import { useCallback, useRef, useState } from 'react'
import {
  generateTimelapseSegments,
  estimateSavingsMs,
} from '@/lib/timelapse'
import type { SubtitleItem } from '@/types'

export type TimelapseStatus =
  | 'idle'
  | 'loading_ffmpeg'
  | 'processing'
  | 'done'
  | 'error'
  | 'nothing_to_cut'  // timeline had no detectable silence

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FFmpegBundle = { ffmpeg: any; fetchFile: (src: Blob) => Promise<Uint8Array> }

type MemoryTier = 'low' | 'medium' | 'high'

/**
 * Detect approximate device RAM tier via navigator.deviceMemory (Chrome/Edge).
 * Safari/Firefox do not expose this API → fall back to 'medium' (conservative).
 * Values are rounded to: 0.25, 0.5, 1, 2, 4, 8 GB.
 */
function getMemoryTier(): MemoryTier {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory
  if (mem === undefined) return 'medium'   // unknown browser → conservative
  if (mem >= 4) return 'high'
  if (mem >= 2) return 'medium'
  return 'low'
}

/**
 * Maximum number of segment files held in WASM FS simultaneously during the
 * concat phase. Smaller values mean lower peak WASM heap usage.
 *
 * high  (≥4 GB): all segments at once  — one-pass concat
 * medium (2 GB): 6 segments per batch  — two-level concat
 * low   (≤1 GB): 3 segments per batch  — two-level concat, minimal peak
 */
const CONCAT_BATCH: Record<MemoryTier, number> = {
  high: Infinity,
  medium: 6,
  low: 3,
}

const safeDelete = async (ffmpeg: { deleteFile: (f: string) => Promise<void> }, ...files: string[]) => {
  for (const f of files) {
    try { await ffmpeg.deleteFile(f) } catch { /* already gone */ }
  }
}

export function useTimelapseExport() {
  const bundleRef = useRef<FFmpegBundle | null>(null)
  const [status, setStatus] = useState<TimelapseStatus>('idle')
  const [progress, setProgress] = useState(0)   // 0–100

  const exportTimelapse = useCallback(
    async (
      videoBlob: Blob,
      subtitleTimeline: SubtitleItem[],
      recordingDurationMs: number,
    ): Promise<Blob | null> => {
      try {
        // ── 1. Compute segments ─────────────────────────────────────
        const segments = generateTimelapseSegments(subtitleTimeline, recordingDurationMs)
        const savings = estimateSavingsMs(segments)

        if (savings < 1000) {
          setStatus('nothing_to_cut')
          return null
        }

        const originalActive = segments.filter((s) => s.type !== 'silent')
        const n = originalActive.length

        // ── 2. Detect memory tier ────────────────────────────────────
        const tier = getMemoryTier()
        const batchSize = CONCAT_BATCH[tier]
        console.log(
          `[timelapse] deviceMemory=${(navigator as { deviceMemory?: number }).deviceMemory ?? 'unknown'}GB` +
          ` → tier=${tier}, concatBatch=${batchSize === Infinity ? 'all' : batchSize}, segments=${n}`
        )

        // ── 3. Load ffmpeg lazily ────────────────────────────────────
        if (!bundleRef.current) {
          setStatus('loading_ffmpeg')
          setProgress(0)

          const { FFmpeg } = await import('@ffmpeg/ffmpeg')
          const { toBlobURL, fetchFile } = await import('@ffmpeg/util')

          const ffmpeg = new FFmpeg()
          const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
          await ffmpeg.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL:  await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
          })

          bundleRef.current = { ffmpeg, fetchFile: (blob: Blob) => fetchFile(blob) }
        }

        setStatus('processing')
        setProgress(0)

        const { ffmpeg, fetchFile } = bundleRef.current

        // Write source video to WASM FS once
        await ffmpeg.writeFile('input.webm', await fetchFile(videoBlob))

        // ── Strategy A: high memory — all segments in one pass ───────
        if (batchSize >= n) {
          const segFiles: string[] = []

          for (let i = 0; i < n; i++) {
            const seg = originalActive[i]
            const file = `seg${i}.webm`
            await ffmpeg.exec([
              '-ss', (seg.startAt / 1000).toFixed(3),
              '-to', (seg.endAt / 1000).toFixed(3),
              '-i', 'input.webm',
              '-c', 'copy', '-reset_timestamps', '1',
              file,
            ])
            segFiles.push(file)
            setProgress(Math.round(((i + 1) / n) * 80))
          }

          // Free input.webm before concat to reclaim WASM heap
          await safeDelete(ffmpeg, 'input.webm')

          const concatList = segFiles.map((f) => `file '${f}'`).join('\n')
          await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList))
          setProgress(85)
          await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.webm'])

          const data = await ffmpeg.readFile('output.webm') as Uint8Array
          const result = new Blob([data.buffer as ArrayBuffer], { type: 'video/webm' })
          await safeDelete(ffmpeg, 'concat.txt', 'output.webm', ...segFiles)

          setStatus('done')
          setProgress(100)
          return result
        }

        // ── Strategy B: medium / low memory — streaming cut → batched concat ─
        //
        // Phase 1 (cut): extract one segment at a time, immediately transfer to
        //   JS heap, delete from WASM FS.
        //   Peak WASM usage = input.webm + 1 segment (minimal).
        //
        // Phase 2 (concat): write ≤batchSize segments back to WASM, concat to a
        //   partial result, read partial to JS, clear WASM — repeat.
        //   Peak WASM usage = batchSize segments + 1 partial.
        //
        // Phase 3 (final): if >1 partial, concatenate them.

        // Phase 1 — cut segments one-by-one into JS buffers
        const segBuffers: Uint8Array[] = []
        for (let i = 0; i < n; i++) {
          const seg = originalActive[i]
          await ffmpeg.exec([
            '-ss', (seg.startAt / 1000).toFixed(3),
            '-to', (seg.endAt / 1000).toFixed(3),
            '-i', 'input.webm',
            '-c', 'copy', '-reset_timestamps', '1',
            'seg_tmp.webm',
          ])
          const data = await ffmpeg.readFile('seg_tmp.webm') as Uint8Array
          segBuffers.push(new Uint8Array(data))  // copy out of WASM heap
          await safeDelete(ffmpeg, 'seg_tmp.webm')
          setProgress(Math.round(((i + 1) / n) * 60))
        }

        // Free input.webm — no longer needed
        await safeDelete(ffmpeg, 'input.webm')

        // Phase 2 — batched concat
        const partialBuffers: Uint8Array[] = []
        const numBatches = Math.ceil(n / batchSize)

        for (let b = 0; b < numBatches; b++) {
          const lo = b * batchSize
          const hi = Math.min(lo + batchSize, n)
          const batchFiles: string[] = []

          for (let j = lo; j < hi; j++) {
            const fname = `b${b}s${j}.webm`
            await ffmpeg.writeFile(fname, segBuffers[j])
            batchFiles.push(fname)
          }

          const list = batchFiles.map((f) => `file '${f}'`).join('\n')
          await ffmpeg.writeFile('concat_b.txt', new TextEncoder().encode(list))
          await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat_b.txt', '-c', 'copy', 'partial_b.webm'])

          const data = await ffmpeg.readFile('partial_b.webm') as Uint8Array
          partialBuffers.push(new Uint8Array(data))
          await safeDelete(ffmpeg, 'concat_b.txt', 'partial_b.webm', ...batchFiles)
          setProgress(60 + Math.round(((b + 1) / numBatches) * 25))
        }

        setProgress(85)

        // Phase 3 — final concat (skipped if only one partial)
        let result: Blob
        if (partialBuffers.length === 1) {
          result = new Blob([partialBuffers[0].buffer as ArrayBuffer], { type: 'video/webm' })
        } else {
          const finalFiles: string[] = []
          for (let p = 0; p < partialBuffers.length; p++) {
            const fname = `pfinal${p}.webm`
            await ffmpeg.writeFile(fname, partialBuffers[p])
            finalFiles.push(fname)
          }
          const list = finalFiles.map((f) => `file '${f}'`).join('\n')
          await ffmpeg.writeFile('concat_final.txt', new TextEncoder().encode(list))
          await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat_final.txt', '-c', 'copy', 'output.webm'])

          const data = await ffmpeg.readFile('output.webm') as Uint8Array
          result = new Blob([data.buffer as ArrayBuffer], { type: 'video/webm' })
          await safeDelete(ffmpeg, 'concat_final.txt', 'output.webm', ...finalFiles)
        }

        setStatus('done')
        setProgress(100)
        return result

      } catch (err) {
        console.error('[timelapse] export failed', err)
        setStatus('error')
        return null
      }
    },
    [],
  )

  const resetStatus = useCallback(() => {
    setStatus('idle')
    setProgress(0)
  }, [])

  return { exportTimelapse, status, progress, resetStatus }
}
