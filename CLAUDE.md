# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
```

**Required**: create `.env.local` with `ANTHROPIC_API_KEY=<key>` before running.

## Architecture

**Chitchat** is an AI video chat recording tool. The user speaks to the camera; their voice is transcribed, sent to Claude, and the AI response appears as subtitles — all burned into a canvas recording.

### Data flow

```
Camera/Mic → getUserMedia
  ├─ VideoTrack → <video> (hidden preview)
  └─ AudioTrack → micStream (separate MediaStream for recording)

Canvas draw loop (requestAnimationFrame)
  ├─ Draws mirrored camera feed (cover-fill crop)
  └─ Draws subtitle overlay from refs (aiTextRef, subtitleLinesRef)

SpeechRecognition (Web Speech API, lang: zh-TW)
  └─ onTranscript (final results only) → POST /api/chat

/api/chat (Next.js Route Handler)
  └─ Anthropic SDK streaming → plain text ReadableStream → client

useMediaRecorder
  └─ canvas.captureStream(30fps) + micStream → MediaRecorder → Blob
```

### Stale closure pattern

The canvas `requestAnimationFrame` loop reads `aiTextRef` and `subtitleLinesRef` (refs, not state) to always have current values without restarting the loop. State and refs are kept in sync via `useEffect`.

### Key constraints

- `Recorder` is loaded with `dynamic(..., { ssr: false })` — it uses browser-only APIs (`getUserMedia`, `SpeechRecognition`, `canvas.captureStream`, `MediaRecorder`).
- The `/api/chat` route streams raw text (not SSE/JSON). The client reads it as a plain `ReadableStream` and appends chunks to `aiTextRef` directly for the canvas to pick up each frame.
- `SubtitleOverlay` is a UI-only overlay on top of the canvas (not recorded). The recorded subtitles are drawn directly on the canvas.
- Aspect ratio changes (`16:9` → 1280×720, `9:16` → 720×1280, `1:1` → 720×720) are set on `canvas.width/height` each frame inside the draw loop.
