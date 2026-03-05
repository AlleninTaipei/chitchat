
# Chitchat 功能擴充需求

## 一、專案概述

Chitchat 是一個 AI 視訊錄製對話工具。 使用者對著鏡頭說話，語音會被即時轉錄並送至雲端 AI，AI 回應以字幕形式顯示；所有畫面與字幕最終會燒錄至 canvas 錄影輸出中。

### 本次目標

- 在既有基本功能上進行功能擴充
- 提升錄影 pipeline 穩定性
- 預留未來多 AI provider、多角色、plugin 化的架構空間

## 二、功能擴充需求

### 1. 僅對話顯示模式（Conversation-only Mode）

- 支援無攝影機或選擇關閉攝影機的錄製情境
- 無影像來源時，以可設定或預設底色作為背景
- 匯出影片支援僅含對話字幕的版本

### 2. 提詞機模式（Teleprompter Mode）

- 可切換為「關閉 AI 回應」模式
- 僅錄製使用者語音轉錄內容
- 適用情境：演講練習、自錄教學、提詞機使用

### 3. AI 角色設定（AI Persona）

- 保留現有 default System Prompt
- 新增內建常用角色 presets（英語教師、面試官、客服人員）
- 使用者可選擇內建角色，或自訂並儲存 System Prompt
- 設計需考慮未來角色擴充的結構

```typescript
interface PersonaPreset {
  id: string
  label: string
  systemPrompt: string
}
```

### 4. 劇本模式（Script Mode）

- 使用者可上傳劇本（文字檔）
- 系統解析後，AI 根據劇本與使用者互動
- 支援段落或角色分段
- 預留多角色擴充結構（非本期必要，但結構需預留）

### 5. 縮時轉存（Smart Time-lapse Export）

- 匯出時提供：正常轉存 / 縮時轉存（Smart skip）
- 縮時規則：自動略過無語音、無字幕的區段

> ⚠️ 需注意音畫同步與字幕時間軸正確性

### 6. API Key 輸入與管理

- 啟動時自動檢查 `.env.local` 是否存在
- 不存在時引導使用者輸入 API Key，並安全地本地保存
- UI/UX 引導清楚，後續可更換 Key

> ⚠️ 三個坑：Key 不應被誤 commit、不應被打包進 client bundle、不應在 client 端暴露

### 7. AI 語音合成錄音支援（TTS Audio Recording）

**根本問題**：瀏覽器的 `SpeechSynthesis` (Web Speech API) 輸出直接送到系統喇叭，無法被 MediaRecorder 捕捉。錄影中 AI 聲音極小，原因是喇叭聲音漏回麥克風才進去的。有耳機時漏音更少，問題更明顯。

**解法方向**：以 TTS API 取得音訊資料（AudioBuffer），透過 AudioContext mixing bus 同時輸出到喇叭與錄影 stream，讓 AI 聲音真正錄進影片。

**Graceful degrade 設計**：

| 情況 | 行為 |
|------|------|
| 有 TTS API Key | AI 回覆 → TTS API → AudioBuffer → AudioContext → 喇叭 + 錄影 ✅ |
| 無 TTS API Key | 退回 SpeechSynthesis → 喇叭（即時可聽，但不錄進影片） |

**支援的 TTS Provider（依優先順序）**：
- OpenAI TTS（`tts-1` / `tts-1-hd`）
- ElevenLabs
- Google Cloud TTS
- Fallback：`SpeechSynthesis`（無 API，不錄音）

> ⚠️ 此功能需要 Audio Mixer bus 基礎建設，應在 Media Engine 重構後才實作

---

## 三、理想架構設計

### 設計原則

| 原則 | 說明 |
|------|------|
| Mode 不爆炸 | 集中管理 mode state，避免互相污染 |
| Pipeline 穩定 | 新功能不破壞既有錄影流程 |
| UI 無腦化 | UI 只顯示、收 input、發 intent |
| 一切時間戳化 | Single Master Clock → 事件帶 timestamp → Canvas render → Recorder |

### 高階架構圖

```plaintext
┌──────────────────────────────────────┐
│                UI Layer              │
│  Controls / Subtitle View /          │
│  Script Panel / Teleprompter View    │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│            App State Layer           │
│  mode / recording / persona / script │
└─────────────────┬────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────┐
│          Orchestration Layer         │  ← 核心大腦
│  Session Controller                  │
│  Conversation Manager                │
│  Mode Switcher                       │
└───────┬──────────────────┬───────────┘
        │                  │
        ▼                  ▼
┌──────────────┐  ┌──────────────────┐
│ Media Engine │  │   AI Engine      │
│ camera       │  │ provider adapter │
│ microphone   │  │ persona merge    │
│ canvas       │  │ streaming        │
│ recorder     │  │ script control   │
└──────┬───────┘  └──────────────────┘
       │
       ▼
┌──────────────┐
│ Export Engine│
│ normal       │
│ timelapse    │
└──────────────┘
```

### App State 最小核心

```typescript
interface AppState {
  mode: {
    cameraEnabled: boolean
    aiEnabled: boolean
    teleprompter: boolean
    scriptMode: boolean
  }
  recording: {
    status: 'idle' | 'recording' | 'paused'
  }
  persona: {
    presetId?: string
    customPrompt?: string
  }
}
```

### UI Layer 原則

UI 不應該：

- 直接 call AI
- 操作 MediaStream
- 控制 recorder

### Orchestration Layer

**Session Controller**：start/stop session、sync media + AI、管 lifecycle 與 mode 切換副作用。所有重操作都應經過它。

**Conversation Manager**：user turn、AI turn、script turn（未來）、streaming text、interrupt handling。未來 Script Mode 幾乎全靠它。

**Mode Switcher**：

| Mode | 行為 |
|------|------|
| teleprompter | AI pipeline short-circuit |
| no camera | 使用 background renderer |
| script | conversation 受限 |

### Media Engine 建議拆分

```
media/
  camera.ts
  microphone.ts
  audio-mixer.ts         ← mixing bus，合併 mic + TTS 進 Recorder
  canvas-compositor.ts   ← 最值得投資的模組
  recorder.ts
```

**Canvas Compositor** 負責合成：video、subtitles、background、teleprompter text。未來所有新視覺功能都會經過它。

**Audio Mixer** 負責：建立 `AudioContext` mixing bus，將 mic AudioTrack 與 TTS AudioBuffer 合併，輸出為單一 `MediaStreamTrack` 供 Recorder 使用。有 TTS API 時啟用 TTS channel；無時退回純 mic 直通。

```
mic MediaStream ──────────────────────────────┐
                                              ├──▶ AudioContext ──▶ MediaStreamDestination ──▶ Recorder
TTS AudioBuffer (from API) → AudioBufferSource┘         │
                                                         └──▶ AudioContext.destination（喇叭）
```

### AI Engine 結構

```plaintext
ai/
  provider/
    claude.ts
    openai.ts        ← 未來
  tts/
    tts-provider.ts  ← 介面定義
    openai-tts.ts
    elevenlabs-tts.ts
    browser-fallback.ts  ← SpeechSynthesis fallback（不錄音）
  persona/
    prompt-builder.ts
  streaming/
    stream-handler.ts
```

Provider 介面先定死，未來換模型不需大改：

```typescript
interface AIProvider {
  sendMessage(input: AIInput): Promise<AIStream>
}

interface TTSProvider {
  /** 回傳 AudioBuffer，供 Audio Mixer 播放並錄音 */
  synthesize(text: string, signal?: AbortSignal): Promise<AudioBuffer>
  /** false 時 Recorder 退回 SpeechSynthesis fallback */
  isAvailable(): boolean
}
```

### Export Engine

```plaintext
export/
  normal-exporter.ts
  timelapse-exporter.ts   ← 未來技術含量最高
  segment-detector.ts
```

---

## 四、Conversation State Machine

### 狀態定義

```typescript
export type ConversationState =
  | 'idle'
  | 'ready'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'ai_streaming'
  | 'turn_done'
```

### 狀態轉移圖

```plaintext
IDLE
  │ START_SESSION
  ▼
READY          ← 等待使用者開始說話
  │ USER_SPEECH_START
  ▼
LISTENING      ← 收音中
  │ SPEECH_END
  ▼
TRANSCRIBING
  │ TRANSCRIPT_READY
  ▼
THINKING       ← call AI（aiEnabled 且非 teleprompter 時）
  │ AI_FIRST_TOKEN
  ▼
AI_STREAMING   ← 字幕逐字出現
  │ AI_STREAM_END
  ▼
TURN_DONE
  │ RESET_TURN
  ▼
READY
```

### 為什麼需要這麼多狀態？

| State | 避免的問題 |
|-------|------------|
| `TRANSCRIBING` | 語音與 AI call 打架 |
| `THINKING` | 無法 cancel AI |
| `AI_STREAMING` | 字幕與錄影不同步 |
| `TURN_DONE` | turn 邏輯混亂 |

### Context（比 state 更重要）

```typescript
export interface ConversationContext {
  userTranscript?: string
  aiResponse?: string
  isInterrupted: boolean
  currentTurnId: number
  mode: {
    aiEnabled: boolean
    scriptMode: boolean
    teleprompter: boolean
  }
}
```

### Event 定義

```typescript
export type ConversationEvent =
  | { type: 'START_SESSION' }
  | { type: 'STOP_SESSION' }
  | { type: 'USER_SPEECH_START' }
  | { type: 'SPEECH_END' }
  | { type: 'TRANSCRIPT_READY'; text: string }
  | { type: 'AI_FIRST_TOKEN' }
  | { type: 'AI_STREAM_CHUNK'; text: string }
  | { type: 'AI_STREAM_END' }
  | { type: 'USER_INTERRUPT' }
  | { type: 'MODE_CHANGED'; mode: Partial<ConversationContext['mode']> }
  | { type: 'RESET_TURN' }
```

### Production Reducer

```typescript
interface MachineState {
  state: ConversationState
  ctx: ConversationContext
}

export function conversationReducer(
  machine: MachineState,
  event: ConversationEvent
): MachineState {
  const { state, ctx } = machine

  switch (state) {
    case 'idle': {
      if (event.type === 'START_SESSION') {
        return { state: 'ready', ctx: { ...ctx, currentTurnId: 0, isInterrupted: false } }
      }
      return machine
    }

    case 'ready': {
      if (event.type === 'USER_SPEECH_START') return { state: 'listening', ctx }
      if (event.type === 'STOP_SESSION') return { state: 'idle', ctx }
      return machine
    }

    case 'listening': {
      if (event.type === 'SPEECH_END') return { state: 'transcribing', ctx }
      return machine
    }

    case 'transcribing': {
      if (event.type === 'TRANSCRIPT_READY') {
        // teleprompter 或 AI 關閉 → 跳過 AI
        if (!ctx.mode.aiEnabled || ctx.mode.teleprompter) {
          return { state: 'turn_done', ctx: { ...ctx, userTranscript: event.text } }
        }
        return {
          state: 'thinking',
          ctx: { ...ctx, userTranscript: event.text, aiResponse: '', isInterrupted: false }
        }
      }
      return machine
    }

    case 'thinking': {
      if (event.type === 'AI_FIRST_TOKEN') return { state: 'ai_streaming', ctx }
      if (event.type === 'USER_INTERRUPT') return { state: 'listening', ctx: { ...ctx, isInterrupted: true } }
      return machine
    }

    case 'ai_streaming': {
      if (event.type === 'AI_STREAM_CHUNK') {
        return { state, ctx: { ...ctx, aiResponse: (ctx.aiResponse ?? '') + event.text } }
      }
      if (event.type === 'AI_STREAM_END') return { state: 'turn_done', ctx }
      if (event.type === 'USER_INTERRUPT') return { state: 'listening', ctx: { ...ctx, isInterrupted: true } }
      return machine
    }

    case 'turn_done': {
      if (event.type === 'RESET_TURN') {
        return {
          state: 'ready',
          ctx: { ...ctx, currentTurnId: ctx.currentTurnId + 1, userTranscript: undefined, aiResponse: undefined, isInterrupted: false }
        }
      }
      return machine
    }

    default:
      return machine
  }
}
```

### Transition Logger（必加）

```typescript
export function dispatchWithLog(
  machine: MachineState,
  event: ConversationEvent
) {
  const next = conversationReducer(machine, event)
  console.log(`[conversation] ${machine.state} --(${event.type})-> ${next.state}`)
  return next
}
```

### 必測 6 個場景

1. 使用者講話講一半停止
2. AI streaming 時開始講話（interrupt）
3. 關閉 AI 中途
4. Script mode 切換
5. 長時間 silence
6. 快速連續對話

---

## 五、Script Mode 設計

### 核心心智

Script Mode 的本質是**對話控制權的轉移**。

| Mode | 控制權 |
|------|--------|
| Normal | 即時對話（Human ↔ AI） |
| Script | Script 是真正的 driver |

這是整個設計最關鍵的一句話。沒建立這個心智，後面必然設計錯誤。

### 控制層級

```plaintext
Session Controller
       ↓
Conversation State Machine   ← 已有
       ↓
Script Orchestrator          ← 新增
       ↓
AI Engine / User Speech
```

### 資料結構

```typescript
export interface ScriptLine {
  id: string
  role: 'user' | 'ai'
  text: string
  optional?: boolean
}

export interface ScriptRuntime {
  enabled: boolean
  currentIndex: number
  lines: ScriptLine[]
  strictMode: boolean  // 是否必須逐句對齊
}
```

### 核心決策函式

```typescript
export function getExpectedActor(
  script: ScriptRuntime
): 'user' | 'ai' | null {
  if (!script.enabled) return null
  const line = script.lines[script.currentIndex]
  if (!line) return null
  return line.role
}
```

### 必加 Guards

#### Guard 1：AI 不該說話時禁止 call

```typescript
function shouldAIRespond(
  ctx: ConversationContext,
  script: ScriptRuntime
): boolean {
  if (!ctx.mode.scriptMode) return true
  return getExpectedActor(script) === 'ai'
}
```

#### Guard 2：統一 allowAI 判斷（升級原有邏輯

```typescript
// 原本：
if (!ctx.mode.aiEnabled || ctx.mode.teleprompter)

// 升級後：
const allowAI =
  ctx.mode.aiEnabled &&
  !ctx.mode.teleprompter &&
  shouldAIRespond(ctx, scriptRuntime)
```

### 使用者對齊策略

| 策略 | 說明 | 建議 |
|------|------|------|
| 寬鬆模式 | 使用者只要開口就算過關，推進 index | 起步推薦 |
| 半嚴格模式 | embedding 比對，相似度過門檻才算 | 中期 |
| 嚴格模式 | 必須講接近原文，否則卡住 | 最難 |

### 推進函式

```typescript
export function advanceScript(script: ScriptRuntime): ScriptRuntime {
  return { ...script, currentIndex: script.currentIndex + 1 }
}
```

### 與既有 Reducer 的最小侵入整合

只需改兩處：

1. `TRANSCRIPT_READY` 時，加 script gate 判斷是否推進 index
2. 進入 `THINKING` 前，使用升級後的 `allowAI` 判斷

### 必測 8 個地雷場景

1. 使用者跳過一句
2. 使用者講太快
3. AI streaming 時切 script
4. script 最後一行
5. 空白行
6. optional 行
7. 使用者打斷 AI
8. `strictMode` 開關

---

## 六、時間軸同步設計

### 三條時間線必須對齊

- 🎤 Audio timeline
- 🧠 Conversation timeline
- 🎥 Recording timeline

> ⚠️ 任一漂移都會導致：字幕早出/晚出、timelapse 壞掉、AI 被截斷、影片回放怪異

### 正確心智模型

```plaintext
❌ 錯誤模型（常見）
AI event → UI 更新 → 順便錄影

✅ 正確模型
Single Master Clock
        ↓
Timestamp every event
        ↓
Canvas render loop
        ↓
Recorder capture
```

### 唯一時間來源

```typescript
const sessionStartTime = performance.now()

export function nowMs(): number {
  return performance.now() - sessionStartTime
}
```

> ⚠️ 不要用 `Date.now()`，不要混多個 clock，全系統只信這一個

### TimedEvent 介面

```typescript
export interface TimedEvent<T = any> {
  type: string
  at: number  // ms since session start
  payload?: T
}
```

### AI Segment 設計

不要只 append 字串，用帶時間的結構：

```typescript
export interface AISegment {
  text: string
  startAt: number
  endAt?: number
}
```

未來做 timelapse、字幕重排、seek、export，全部依賴這個。

### Subtitle Timeline Store

```typescript
export interface SubtitleItem {
  id: string
  text: string
  startAt: number
  endAt?: number
  speaker: 'user' | 'ai'
}
```

### Canvas Render Loop 標準形

```typescript
function renderFrame() {
  const t = nowMs()
  drawVideoLayer(t)    // 1. 背景 / camera
  drawSubtitles(t)     // 2. 字幕（根據時間）
  drawTeleprompter(t)  // 3. teleprompter（未來）
  requestAnimationFrame(renderFrame)
}
```

> render loop 只讀時間，不讀 state 跳變。這是抗抖動關鍵。

### AI Streaming → Subtitle 正確流程

```typescript
// chunk 來時
function onAIChunk(text: string) {
  subtitleStore.updateOpenSegment({ appendText: text, at: nowMs() })
}

// 結束時
function onAIEnd() {
  subtitleStore.closeOpenSegment(nowMs())
}
```

### 三個高機率踩坑點

| 坑 | 說明 | 解法 |
|----|------|------|
| MediaRecorder 延遲啟動 | `recorder.start()` 不等於真的開始，第一幀常晚 | 提前 warmup，或記錄 first `dataavailable` 的 offset |
| AI token burst | Claude/GPT 一開始慢，然後突然噴大量 token | 永遠 append 到同一 segment，不要每 token 新建 item |
| Timelapse 破壞 naïve 設計 | 沒有 `startAt`/`endAt` 幾乎一定重寫 | 從一開始就用 `SubtitleItem` 結構 |

---

## 七、Smart Timelapse Export

### 核心定義

> Timelapse 不是「影片加快播放」，而是「重建新時間軸，去掉沒用的區段，保留所有對話和關鍵事件，並保持 A/V 同步」。

### Segment 資料結構

```typescript
export interface Segment {
  id: string
  startAt: number   // 原始時間
  endAt: number     // 原始時間
  type: 'user' | 'ai' | 'silent'
  text?: string
}
```

### 核心演算法流程

1. 收集所有帶 timestamp 的事件（user / AI / subtitle）
2. 依 silence 門檻（建議 500ms）生成 segments，無字幕段標記 `silent`
3. 過濾移除 `silent` segments
4. 重建 timeline：依序拼接，重新計算 `startAt`/`endAt`

### 生成 Segments

```typescript
export function generateTimelapseSegments(
  subtitles: SubtitleItem[],
  silenceThreshold = 500
): Segment[] {
  const segments: Segment[] = []
  let lastEnd = 0

  subtitles.forEach((s, idx) => {
    // 偵測 silence gap
    if (s.startAt - lastEnd > silenceThreshold) {
      segments.push({
        id: `silent-${idx}`,
        startAt: lastEnd,
        endAt: s.startAt,
        type: 'silent',
      })
    }

    segments.push({
      id: s.id,
      startAt: s.startAt,
      endAt: s.endAt ?? s.startAt + 1000,  // fallback 1s
      type: s.speaker,
      text: s.text,
    })

    lastEnd = s.endAt ?? s.startAt + 1000
  })

  return segments
}
```

### Timeline 重映射

```typescript
export function remapSegmentsToTimelapse(
  segments: Segment[]
): Segment[] {
  let timeCursor = 0
  return segments.map(s => {
    const duration = s.endAt - s.startAt
    const newSegment = { ...s, startAt: timeCursor, endAt: timeCursor + duration }
    timeCursor += duration
    return newSegment
  })
}
```

### 關鍵技巧

- **Segment Merge**：AI streaming token 可能被拆成多個短段 → 同 speaker 要 merge
- **Padding**：每個 segment 前後加 100–200ms，避免 abrupt cut
- **Audio Trim**：音訊剪輯必須對齊 segments

### 必測場景

1. 連續長 silence → 不應 crash
2. AI / user segment 交錯 → timing 對齊
3. segment padding 過小 → 不應截斷對話
4. streaming token 分段 → merge 正確
5. Script Mode 開啟時 → 仍遵守劇本順序
6. 長錄影（10–30 分鐘）→ 不應漂移
7. 縮時 export → audio sync 準確

---

## 八、五大高機率爆點

> 以下是 senior 才會先看的防雷清單。

### 爆點 1：Mode 組合爆炸

未來可能出現的組合：`camera off + script`、`teleprompter + recording`、`persona + script`。

**解法**：mode state 必須集中管理，禁止分散在各元件。

### 爆點 2：MediaStream 重建

常見災難：切 camera → recorder 壞掉、track replace timing 錯、canvas 尺寸漂移。

**解法**：Session Controller 統一管理 MediaStream 生命週期，不允許外部直接操作。

### 爆點 3：字幕時間軸

Timelapse 最容易炸在這裡。沒有正確的 `startAt`/`endAt`，幾乎一定重寫。

**解法**：從一開始就使用 `SubtitleItem` 結構，不要用純字串 append。

### 爆點 4：AI Streaming 中斷

使用者打斷、mode 切換、script 強制等情境，若 state machine 沒有明確處理，會導致 partial subtitle 殘留或 AI call 無法取消。

**解法**：State machine 必須在 `thinking` 和 `ai_streaming` 兩個 state 都處理 `USER_INTERRUPT`。

### 爆點 5：Script Mode 的 State Machine

整個專案最難的地方。對話 state machine 若沒設計好，Script Mode 進入後必然出現 turn 卡死或 AI 偏離劇本。

**解法**：Script Orchestrator 作為獨立上層控制器，`conversationReducer` 不直接耦合 script 邏輯，透過 `shouldAIRespond` guard 隔離。

---

## 附錄：分階 TODO 清單

### Phase 0：基礎建設

- [x] **TODO 0.1** — 畫出目前錄影資料流（audio stream / transcript timing / subtitle renderer / canvas recorder）
- [x] **TODO 0.2** — 建立集中式 AppState（確認或建立 single source of truth）

### Phase 1：基本擴充

- [x] **TODO 1.1** — Conversation-only mode
  - camera toggle state
  - fallback background renderer
  - recorder 不依賴 video track
- [x] **TODO 1.2** — Teleprompter mode
  - AI pipeline short-circuit
  - transcript source abstraction
  - UI mode switch

### Phase 2：使用性提升

- [x] **TODO 2.1** — AI persona presets
  - persona config schema
  - preset registry
  - prompt merge strategy
- [x] **TODO 2.2** — API Key management
  - env detection
  - secure local storage
  - runtime injection
- [x] **TODO 2.3** — TTS 錄音支援
  - Audio Mixer bus（`AudioContext` + `MediaStreamDestination`）
  - `TTSProvider` 介面 + 首個 provider（OpenAI TTS 優先）
  - `SpeechSynthesis` fallback（graceful degrade，無 API 時仍可即時聆聽）
  - TTS API Key 管理（與 TODO 2.2 整合）

### Phase 3：進階功能

- [x] **TODO 3.1** — Script mode（最容易做爆的功能）
  - script parser
  - turn manager
  - AI response constraint
  - UI script viewer
- [x] **TODO 3.2** — Smart timelapse export（技術含量最高）
  - silence detection
  - subtitle gap detection
  - segment stitching
  - audio sync preservation

## end
