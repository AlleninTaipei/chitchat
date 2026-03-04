# LEARN.md — Understanding Chitchat

> "What if you could have an AI conversation on camera and get the recorded video with subtitles already burned in?"

That's the one-line pitch — and it's deceptively tricky to pull off. Recording video in a browser is easy. Transcribing voice is easy. Calling an AI is easy. But doing all three simultaneously, keeping them in sync, and burning the AI's response into the video frame as it streams in? That requires some genuine engineering thinking. This document walks you through it.

---

## 1. The Problem Worth Solving

Most "AI + camera" demos fall into one of two traps:

1. **Post-process approach**: Record video, transcribe later, generate subtitles, run FFmpeg to burn them in. This works, but it's a pipeline with failure points and a waiting period.
2. **Overlay approach**: Show a subtitle `<div>` on top of a `<video>` element. Simple, but the subtitles are not in the video file — they disappear the moment you export.

Chitchat takes a third path: **the canvas is the studio**. The camera feed and the AI subtitles are composited together on a `<canvas>` element in real time. That canvas is then recorded directly. When recording stops, you get a `.webm` file with subtitles permanently baked into every frame — no post-processing, no FFmpeg, no waiting.

---

## 2. Architecture in Plain English

Think of the system as having three parallel "lanes" that converge at the canvas:

```
┌─────────────────────────────────────────────────────────┐
│  LANE 1: Camera / Mic (browser)                         │
│  getUserMedia → VideoTrack → <video> (hidden preview)   │
│              → AudioTrack → micStream (for recording)   │
├─────────────────────────────────────────────────────────┤
│  LANE 2: Voice → AI (browser + server)                  │
│  SpeechRecognition → final transcript                   │
│  → POST /api/chat → Claude streaming response           │
│  → chunks appended to aiTextRef                         │
├─────────────────────────────────────────────────────────┤
│  LANE 3: Canvas Studio (browser)                        │
│  requestAnimationFrame loop:                            │
│    draws mirrored camera frame (cover-fill crop)        │
│    + subtitle box from aiTextRef + subtitleLinesRef      │
│  canvas.captureStream(30) + micStream → MediaRecorder   │
└─────────────────────────────────────────────────────────┘
                         ↓
                   Recorded .webm file
```

The canvas is the TV studio control room. It receives a live camera signal, overlays graphics (subtitles), and sends the composite signal to the recorder. The recorder doesn't know or care that the "camera" is actually a canvas — it just sees a `MediaStream`.

---

## 3. Core Technologies & Why They Were Chosen

### Next.js App Router
The API route (`/api/chat`) runs on the server, which is the only place the `ANTHROPIC_API_KEY` should live. The App Router's edge-compatible `Response` with a `ReadableStream` is exactly what we need to pipe Claude's streaming output to the browser. Everything else (camera, canvas, recorder) runs client-side.

### Web Speech API (not Whisper)
The browser's built-in `SpeechRecognition` is free, requires no network round-trip for transcription, and starts returning `interimResults` within milliseconds of speech. Whisper would add at least 1–3 seconds of latency per turn because you'd need to: (a) buffer audio, (b) upload it, (c) wait for transcription. In a live conversation that latency is jarring. The trade-off: Web Speech API quality is good but not perfect, and it requires Chrome/Edge. For this use case, the speed wins.

### Canvas API + `captureStream()`
This is the key insight of the whole project. `HTMLCanvasElement.captureStream(fps)` returns a `MediaStream` containing a `VideoTrack` that updates at the specified frame rate. From `MediaRecorder`'s perspective, this is indistinguishable from a camera stream. By drawing subtitles onto the canvas each frame, they become part of the video signal before the recorder ever sees it.

### Anthropic Streaming SDK — plain text, not SSE
Most streaming tutorials use Server-Sent Events (SSE) with `text/event-stream` and JSON payloads like `{"type":"chunk","text":"Hello"}`. This project skips all of that. The API route extracts only `text_delta` chunks and writes raw UTF-8 bytes to a `ReadableStream`. The client reads it with a standard `Response.body.getReader()` and appends chunks directly. This is the simplest code that could possibly work, and for a subtitle use case, you don't need the metadata that SSE would carry.

### `dynamic(..., { ssr: false })`
`SpeechRecognition`, `getUserMedia`, `canvas.captureStream`, and `MediaRecorder` are all browser-only APIs. If Next.js tries to render `Recorder.tsx` on the server during SSR, it will crash with `ReferenceError: navigator is not defined` before the component even mounts. `dynamic(() => import('./Recorder'), { ssr: false })` tells Next.js to skip server rendering for this component entirely and only load it in the browser.

---

## 4. Five Things This Codebase Teaches You

### 4a. The Stale Closure Trap — and the Ref Escape Hatch

**The problem.** The canvas draw loop runs inside a `requestAnimationFrame` callback. If that callback captures React state directly, it captures the value at the time the effect ran — not the current value. This is a "stale closure." If the AI response updates `aiText` state, the draw loop never sees the new value because it's still holding onto the old closure.

**Why `useState` alone fails here.** If you restart the `requestAnimationFrame` loop every time `aiText` changes, you introduce jank (the loop briefly stops and restarts) and the effect cleanup/re-run cycle becomes a source of bugs.

**The solution.** Keep a `useRef` paired with each piece of state that the draw loop needs to read:

```typescript
// In Recorder.tsx
const [aiText, setAiText] = useState("");
const aiTextRef = useRef("");

// Keep them in sync
useEffect(() => {
  aiTextRef.current = aiText;
}, [aiText]);
```

The draw loop reads `aiTextRef.current` — a ref, not state. Refs are mutable objects; the loop always reads the latest value through the same reference. State drives React re-renders and UI; refs are the escape hatch for code that lives outside React's render cycle.

**Where to find it:** `Recorder.tsx` lines 51–68 (refs + sync effects), lines 161–162 (read in draw loop).

---

### 4b. Composing MediaStreams Like Audio Mixing

A `MediaStream` is a container. It holds tracks — `VideoTrack` objects, `AudioTrack` objects — and you can add/remove them freely. This lets you mix-and-match sources like an audio mixing board.

Here's how Chitchat uses this:

**Step 1 — Split the camera stream:**
```typescript
// camera stream has both video AND audio
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

// Give video to the hidden <video> element (canvas source)
videoRef.current.srcObject = new MediaStream(stream.getVideoTracks());

// Keep audio separate for recording
const audioStream = new MediaStream(stream.getAudioTracks());
setMicStream(audioStream);
```

Why separate them? Because the `<video>` element only needs the video track, and the recorder needs the mic audio to be explicitly added — it won't just "pick up" audio from the camera stream automatically.

**Step 2 — Create the recordable stream:**
```typescript
// canvas produces its own VideoTrack
const canvasStream = canvas.captureStream(30);
const tracks = [...canvasStream.getVideoTracks()];

// Add mic AudioTrack to the canvas VideoTrack
if (micStream) {
  micStream.getAudioTracks().forEach((track) => tracks.push(track));
}

const combinedStream = new MediaStream(tracks); // video from canvas, audio from mic
```

**Step 3 — Probe MIME type before committing:**
```typescript
const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
  ? "video/webm;codecs=vp9,opus"
  : MediaRecorder.isTypeSupported("video/webm")
    ? "video/webm"
    : "video/mp4";
```

Never hardcode `video/webm;codecs=vp9,opus` — Safari doesn't support it. Always probe.

**Where to find it:** `hooks/useMediaRecorder.ts` — the whole file.

---

### 4c. Streaming Plain Text from a Server Route

**The common approach** you'll see in tutorials: return `text/event-stream` with JSON lines:
```
data: {"type":"chunk","delta":"Hello"}
data: {"type":"chunk","delta":" world"}
data: [DONE]
```

**What this project does instead:**
```typescript
// app/api/chat/route.ts
const readable = new ReadableStream({
  async start(controller) {
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        controller.enqueue(encoder.encode(chunk.delta.text)); // raw bytes, no framing
      }
    }
    controller.close();
  },
});

return new Response(readable, {
  headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" },
});
```

**On the client:**
```typescript
const reader = res.body.getReader();
const decoder = new TextDecoder();
let full = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  full += decoder.decode(value, { stream: true });
  setAiText(full);
  aiTextRef.current = full; // canvas picks this up on next frame
}
```

**The trade-off.** This approach loses structured metadata — you can't tell the difference between a chunk and an error message from the server (though you'd handle errors via HTTP status codes). For a subtitle display use case, you want the raw text with minimal friction. The simplicity pays for itself.

**Where to find it:** `app/api/chat/route.ts` (server), `Recorder.tsx` `sendToAI` function (client).

---

### 4d. Drawing "TV-Style" Subtitles on Canvas

The canvas coordinate system has (0, 0) at the top-left, with x increasing right and y increasing down. Every draw operation applies to the current transformation matrix. `ctx.save()` and `ctx.restore()` push/pop the transformation stack — critical for applying transforms (like mirroring) to only one draw operation without corrupting everything that comes after.

**The mirror trick** (selfie view):
```typescript
ctx.save();
ctx.translate(width, 0);  // move origin to top-right
ctx.scale(-1, 1);          // flip x axis
ctx.drawImage(video, ...); // draws mirrored
ctx.restore();             // back to normal coordinates
```

**Text wrapping** — the browser's Canvas API has `ctx.measureText()` but no built-in word wrap. You have to implement it yourself:
```typescript
function wrapText(ctx, text, maxWidth): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
```

**The subtitle background** is drawn with `ctx.roundRect()` and `rgba(0,0,0,0.55)` — a semi-transparent rounded box. The box height is calculated *before* drawing it (by measuring all wrapped lines first), then filled, then text is rendered on top. Order matters on canvas: later draw calls paint over earlier ones.

User lines are white (`#ffffff`); AI lines are cyan (`#67e8f9`) — a quick visual cue for who's speaking.

**Where to find it:** `Recorder.tsx` lines 113–200.

---

### 4e. State Machines for Conversation Flow

**The problem with boolean flags.** Imagine you have:
```typescript
const [isListening, setIsListening] = useState(false);
const [isThinking, setIsThinking] = useState(false);
const [isStreaming, setIsStreaming] = useState(false);
```

How many valid combinations are there? 2³ = 8. But in reality, only a few make sense (you can't be listening *and* streaming at the same time). The rest are bugs waiting to happen. As you add more flags, the problem grows exponentially.

**The solution.** Encode the valid states explicitly, and define which events are allowed in each state:

```
idle → [START_SESSION] → ready
ready → [USER_SPEECH_START] → listening
listening → [SPEECH_END] → transcribing
transcribing → [TRANSCRIPT_READY] → thinking
thinking → [AI_FIRST_TOKEN] → ai_streaming
ai_streaming → [AI_STREAM_END] → turn_done
turn_done → [RESET_TURN] → ready

// Interruption path:
thinking/ai_streaming → [USER_INTERRUPT] → ready
```

The reducer `conversationReducer` in `lib/conversationMachine.ts` implements this as a pure function: `(state, event) => nextState`. Pure functions are trivially testable. In development, `dispatchWithLog` logs every transition to the console so you can watch the state machine work in real time:

```
[conversation] listening --(TRANSCRIPT_READY)-> thinking
[conversation] thinking --(AI_FIRST_TOKEN)-> ai_streaming
[conversation] ai_streaming --(AI_STREAM_END)-> turn_done
```

**The machine isn't wired to the UI yet** — that's Phase 2 work. But having it written now means Phase 2 is a refactor (connect existing logic) rather than a rewrite (figure out the logic from scratch).

**Where to find it:** `lib/conversationMachine.ts`, `types/index.ts`.

---

## 5. Pitfalls & How to Avoid Them

**Forgetting `{ ssr: false }`**

Symptom: `ReferenceError: SpeechRecognition is not defined` at build time or on first load.

Fix: Any component that touches `window`, `navigator`, `document`, `SpeechRecognition`, `MediaRecorder`, or canvas APIs must be loaded with:
```typescript
const Recorder = dynamic(() => import("@/components/Recorder"), { ssr: false });
```

---

**Recording video without audio**

If you pass a canvas's `captureStream()` directly to `MediaRecorder`, you get a video-only file — no sound, even though the user has a microphone. You must explicitly pull the `AudioTrack` from the camera stream and add it to the recording stream. See `useMediaRecorder.ts` for the pattern.

---

**Restarting the draw loop on every state change**

If you put a React state variable (not a ref) in the dependency array of the `useEffect` that starts `requestAnimationFrame`, the loop will cancel and restart every time that state changes. At 60fps, with AI text updating many times per second, this causes visible flicker and subtle timing bugs. Use refs inside the loop; state is for React re-renders only.

---

**MIME type guessing**

`video/webm;codecs=vp9,opus` records excellent quality but is unsupported on Safari. Hardcoding it means Safari users get a silent crash. Always probe with `MediaRecorder.isTypeSupported()` and fall back gracefully — see `useMediaRecorder.ts` lines 39–43.

---

**`URL.createObjectURL` memory leaks**

When you do `const url = URL.createObjectURL(blob)` to show a video preview, the browser holds a reference to the blob in memory until you call `URL.revokeObjectURL(url)`. In a React component, do this in a `useEffect` cleanup:
```typescript
useEffect(() => {
  if (!videoBlob) return;
  const url = URL.createObjectURL(videoBlob);
  setVideoUrl(url);
  return () => URL.revokeObjectURL(url);
}, [videoBlob]);
```

---

## 6. Why the "Over-Engineering" Is Actually Pre-Engineering

Open `types/index.ts`. You'll find `SubtitleItem` with `startAt` and `endAt` timestamps. You'll find `AppState` with a `persona` field and a `scriptMode` flag. Open `lib/subtitleStore.ts` and you'll see a class that tracks open/closed streaming items with precise timing.

None of this is used by the UI today.

This is intentional. Here's the reasoning:

**Phase 1** (current): A user speaks → Claude responds → subtitles appear on screen. Simple.

**Phase 2** (planned): Multiple AI personas, each with different system prompts. The `persona.presetId` field in `AppState` is the hook for this. Changing personas will be a matter of passing a different `presetId` to `/api/chat`, which already accepts a `systemPrompt` override.

**Phase 3** (planned): Script/teleprompter mode, where the user reads from a script and the AI provides coaching rather than conversation. The `scriptMode` flag in `AppMode` and the `teleprompter` branch in `conversationMachine.ts` are already stubbed:
```typescript
case 'TRANSCRIPT_READY': {
  if (!ctx.mode.aiEnabled || ctx.mode.teleprompter) {
    return { state: 'turn_done', ctx: withTranscript }; // skip AI call
  }
  return { state: 'thinking', ctx: withTranscript };
}
```

If these types and structures weren't planted now, adding Phase 2 would require a breaking refactor of the data model — changing `SubtitleLine` to `SubtitleItem` everywhere, retrofitting timestamps, restructuring state. Doing it upfront means Phase 2 is additive, not destructive.

The `SubtitleStore` class is similarly forward-looking: the canvas draw loop today calls `subtitleLinesRef.current.slice(-3)`. In Phase 2, it will call `subtitleStore.getRecentForCanvas(4)` and get properly timed subtitle items with speaker information, ready for effects like fade-out based on `endAt`.

---

## 7. Quick Reference

### File Map

| File | What it does |
|------|-------------|
| `app/page.tsx` | Main page shell — owns aspect ratio state, renders Recorder dynamically |
| `app/api/chat/route.ts` | Claude streaming proxy — receives messages, returns plain text stream |
| `components/Recorder.tsx` | Core engine — camera, canvas draw loop, speech, AI, recording state |
| `components/SubtitleOverlay.tsx` | UI-only subtitle overlay on top of canvas (not recorded) |
| `components/AspectRatioPicker.tsx` | 16:9 / 9:16 / 1:1 selector |
| `hooks/useSpeechRecognition.ts` | Wraps Web Speech API, fires `onTranscript` on final results |
| `hooks/useMediaRecorder.ts` | canvas.captureStream + mic → MediaRecorder → Blob |
| `hooks/useSpeechSynthesis.ts` | Text-to-speech for AI responses |
| `lib/conversationMachine.ts` | Pure reducer for conversation state machine |
| `lib/subtitleStore.ts` | Tracks subtitle items with timing, ready for Phase 2 |
| `lib/claude.ts` | Client-side streamChat helper (available for future direct use) |
| `types/index.ts` | Master type definitions — SubtitleItem, AppMode, AppState, ConversationState |

### Data Flow (text art)

```
[Microphone] ──────────────────────────────────────────────────────────────┐
                                                                            │
[Camera]                                                                    │
  │ VideoTrack                                                              │
  ↓                                                                         │
[hidden <video>] → canvas draw loop (requestAnimationFrame)                │
                         │ reads aiTextRef + subtitleLinesRef               │
                         ↓                                                  │
                   [<canvas>] ← composited frame (camera + subtitles)      │
                         │                                                  │
                   captureStream(30fps) → VideoTrack                        │
                         │                                                  ↓
                         └──────────── combined with AudioTrack ──→ [MediaRecorder]
                                                                            │
                                                                            ↓
                                                                      [.webm Blob]

[Voice] → SpeechRecognition (zh-TW) → final transcript
              │
              ↓
         POST /api/chat ──→ Anthropic SDK ──→ claude-sonnet-4-6
              │                                      │
              ←──── ReadableStream (plain text) ─────┘
              │
         reader.read() loop
              │
         setAiText(full) + aiTextRef.current = full
              │
         canvas draw loop reads aiTextRef → subtitles appear on frame
```

### Environment

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Required. Get from console.anthropic.com. Put in `.env.local`. |

### Commands

```bash
npm run dev    # localhost:3000
npm run build  # production build
npm run lint   # ESLint
```
