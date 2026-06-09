# Chitchat

> Talk to an AI on camera. The subtitles burn into your recording — live, frame by frame, no post-processing.

Chitchat is an AI-powered video recording tool built entirely in the browser. You speak; your voice is transcribed in real-time; Claude responds; the response appears as subtitles — all permanently composited into a canvas recording that you can download the moment you stop.

No FFmpeg. No waiting. No subtitle files to manage. Just press record, have a conversation, and walk away with a finished `.webm` video.

---

## What makes it different

Most "AI + camera" demos fall into one of two traps:

- **Post-processing**: record first, transcribe later, burn subtitles with FFmpeg. Long pipeline, lots of waiting.
- **Overlay trick**: put a `<div>` on top of `<video>`. Easy to build, but the subtitles disappear the moment you export.

Chitchat takes a third path: **the canvas is the studio**. Camera feed and AI subtitles are composited onto a single `<canvas>` element in real-time. That canvas is what gets recorded. When you stop, the subtitles are already baked into every frame.

```
Camera → <canvas> (camera + subtitles composited live) → MediaRecorder → .webm
                                                ↑
Mic → SpeechRecognition → /api/chat → Claude → streaming text chunks
```

---

## Agentic coding workflows

This project was built end-to-end using AI assistance, and it deliberately demonstrates five agentic coding patterns that are repeatable and teachable. Each one addresses a different phase of the development lifecycle.

---

### 1. Spec-first (PRD-driven development)

Before writing a single line of code, co-author a complete Product Requirements Document (PRD) with the AI. Describe the problem, debate tradeoffs, clarify scope, and let the AI push back on assumptions — all in natural language. The PRD becomes a precise, shared mental model of what you're building and why.

**Why it works:** Ambiguity compounds in code but dissolves in conversation. A scope error caught in a document costs seconds; the same error caught after three days of implementation costs days. The PRD also gives the AI stable context across long sessions — it doesn't need to re-derive intent from fragmented code comments.

**Artifacts from this build:**

| File | Description |
|------|-------------|
| [`AI_Video_PRD.docx`](./AI_Video_PRD.docx) | Original PRD (Traditional Chinese) — co-authored with Claude before any code was written |
| [`AI_Video_PRD_EN.docx`](./AI_Video_PRD_EN.docx) | English translation for international reference |

If you're using this project as a teaching resource, read the PRD first and then trace how each requirement manifested in the code — that mapping exercise is more instructive than reading the code alone.

---

### 2. Atomic tasking (incremental delegation)

Break the PRD into the smallest independently verifiable units, then delegate one at a time. Never hand the AI a vague instruction like "build the app" — hand it a scoped task with a clear acceptance criterion.

**Why it works:** The smaller the task, the easier it is to verify correctness and the less damage a misunderstanding can do. Each completed task also narrows the context for the next one.

**In this repo:** The git log is a direct record of this practice. Features were shipped as discrete atomic commits — persona presets, BYOK key management, and script mode were each a separate, bounded task, not a single "add features" dump.

---

### 3. Context engineering

Deliberately manage what the AI can see at the start of every session. Don't rely on memory or re-explanation — encode context as machine-readable documents that load automatically.

**Why it works:** An AI without context makes assumptions. Those assumptions are often wrong in ways that are invisible until late in the session. Explicit context files eliminate whole categories of misunderstanding before they happen.

**In this repo:** `CLAUDE.md` defines architecture constraints and commands. `LEARN-TW.md` documents every non-obvious design decision. `.env.local` conventions are specified. The AI arrives at each session already knowing the rules.

---

### 4. Scaffold-and-fill

For large features, ask the AI to generate the full structural skeleton first — type definitions, interfaces, empty function signatures, component shells — before writing any logic. Review the scaffold as a design document. Only after approving the shape do you ask the AI to fill in the implementation.

**Why it works:** The scaffold is a low-cost, high-signal artifact. It makes the AI's interpretation of the design visible and auditable before any logic is committed. Disagreements at the scaffold stage are cheap to resolve; disagreements after a full implementation are expensive.

**In this repo:** The `types/index.ts` file (`AppState`, `SubtitleItem`, `ConversationState`) and `lib/conversationMachine.ts` were designed as scaffolds first — the type shapes were agreed on before the runtime logic was written.

---

### 5. Review-and-iterate loop

Treat AI-generated code the same way you treat a junior engineer's pull request: read it carefully, identify the precise location of any issue, and give structured feedback. Vague feedback ("this doesn't look right") produces vague fixes. Precise feedback ("the `useEffect` on line 42 will create a stale closure because it captures `aiText` at mount time — use a ref instead") produces targeted, reliable changes.

**Why it works:** The quality of AI output is bounded by the quality of the review. The bottleneck is never the AI's ability to fix something — it's the human's ability to identify exactly what needs fixing and articulate it unambiguously.

**In this repo:** The `requestAnimationFrame` loop and the stale closure pattern documented in `CLAUDE.md` are direct outcomes of this review discipline — caught in review, explained precisely, fixed correctly.

---

## Built with vibe coding

This project was built with AI assistance from the ground up — a real-world example of what's possible when you treat Claude as a co-engineer rather than a search engine.

If you're new to AI-assisted development, this codebase is worth exploring. Every architectural decision has a reason, and those reasons are documented. You'll find:

- Why `useRef` beats `useState` inside animation loops
- How to compose a `MediaStream` like an audio mixing board
- Why a state machine is worth the extra setup
- How to stream raw text from a server route instead of wrestling with SSE

Read [`LEARN-TW.md`](./LEARN-TW.md) for a plain-language walkthrough of every non-obvious decision in the code.

---

## Features

| Feature | Status |
|---------|--------|
| Live voice-to-AI conversation | Shipped |
| Subtitles burned into canvas recording | Shipped |
| AI persona presets (teacher, interviewer, support) | Shipped |
| Custom system prompt | Shipped |
| BYOK — bring your own Anthropic API key | Shipped |
| Script mode (rehearse from a script with AI coaching) | Shipped |
| 16:9 / 9:16 / 1:1 aspect ratio | Shipped |
| Smart timelapse export | Planned |
| TTS audio recording (AI voice burned into video) | Planned |

---

## Quickstart

**1. Clone and install**
```bash
git clone <this-repo>
cd chitchat
npm install
```

**2. Add your API key**
```bash
# Create .env.local in the project root
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

Get your key at [console.anthropic.com](https://console.anthropic.com). The key lives only on the server — it never reaches the browser.

> No API key yet? The app will guide you through entering one at startup.

**3. Run**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome or Edge. Allow camera and microphone access. Press record, start talking.

---

## How it works

Three things happen in parallel the moment you press record:

**Camera lane** — `getUserMedia` captures your camera and mic. The video track feeds a hidden `<video>` element that the canvas reads from. The audio track is held separately for the recorder.

**AI lane** — `SpeechRecognition` listens for your voice. When you pause, the transcript is sent to `/api/chat`, which streams Claude's response back as plain UTF-8 text. Each chunk is appended to a ref that the canvas reads on every frame.

**Canvas lane** — A `requestAnimationFrame` loop runs continuously. Each frame: draw the mirrored camera feed, draw the subtitle overlay from the latest AI text. `canvas.captureStream(30)` + the mic audio track → `MediaRecorder` → `.webm` blob.

The canvas is both the preview and the recorder. What you see is exactly what gets saved.

---

## Project structure

```
src/
  app/
    page.tsx              # Root — aspect ratio state, dynamic import
    api/chat/route.ts     # Claude streaming endpoint (server-side only)
  components/
    VideoRecorder.tsx     # Main orchestrator with conversation state machine
    ConversationOverlay.tsx  # Canvas render loop (camera + subtitle compositing)
  hooks/
    useVoiceRecognition.ts
    useTextToSpeech.ts
    useCanvasRecorder.ts
    useAudioMixer.ts
    useConversation.ts
  lib/
    conversationMachine.ts  # Pure reducer state machine
    subtitleStore.ts         # Timestamped subtitle tracking
  types/
    index.ts                # AppState, SubtitleItem, ConversationState
```

---

## Commands

```bash
npm run dev      # Dev server at localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

---

## Browser support

| Browser | Support |
|---------|---------|
| Chrome / Edge | Full support |
| Firefox | Recording works; SpeechRecognition limited |
| Safari / iOS | Unreliable SpeechRecognition — not recommended |

Output format is `.webm` (VP9 + Opus). Chrome and Firefox play it natively.

---

## For vibe coders

You don't need to understand every line to get value from this project. Pick one thing that interests you and dig into it:

- Curious about the canvas recording trick? Start with `ConversationOverlay.tsx`.
- Want to understand the AI streaming? Read `app/api/chat/route.ts` — it's about 30 lines.
- Interested in state machines? Open `lib/conversationMachine.ts` and read the reducer.
- Confused about why refs are used instead of state? See section 4a in `LEARN-TW.md`.

The codebase was designed to be readable. Every non-obvious choice has a comment or a doc entry explaining the tradeoff.

---

## Going further

The `idea.md` file contains a full architecture design for future phases — AI engine abstraction, audio mixer bus for TTS recording, smart timelapse export, script mode with turn management. It's also a good read if you want to see how experienced engineers think about expanding a system without breaking what already works.

---

## License

MIT
