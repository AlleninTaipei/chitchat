# LEARN.md — 深入理解 Chitchat

> 「如果你能和 AI 在鏡頭前對話，而且錄好的影片就已經把字幕燒進去了，那會是什麼感覺？」

這是這個專案的一句話核心概念——聽起來簡單，做起來卻暗藏玄機。在瀏覽器裡錄影很容易，語音辨識很容易，呼叫 AI 也很容易。但要同時做三件事、讓它們保持同步，再把 AI 的回應在串流的當下燒進每一個影格？這需要一些真正的工程思維。本文件帶你一步步看懂它。

---

## 1. 值得解決的問題

大多數「AI + 鏡頭」的示範都會掉入兩個陷阱之一：

1. **後製流程**：先錄影、再轉譯、再生成字幕、再用 FFmpeg 燒進去。這條路可行，但流程長、容易出錯，而且要等。
2. **疊加 overlay**：在 `<video>` 元素上面疊一個字幕 `<div>`。簡單，但字幕不在影片檔案裡——一匯出就消失了。

Chitchat 走的是第三條路：**canvas 就是攝影棚**。攝影機畫面和 AI 字幕在同一個 `<canvas>` 元素上即時合成。這個 canvas 接著被直接錄製下來。錄影停止後，你會得到一個 `.webm` 檔案，字幕已永久嵌入每一格畫面——不需要後製、不需要 FFmpeg、不需要等待。

---

## 2. 白話架構說明

把整個系統想成三條平行的「車道」，在 canvas 交會：

```
┌─────────────────────────────────────────────────────────┐
│  第一道：攝影機 / 麥克風（瀏覽器）                       │
│  getUserMedia → VideoTrack → <video>（隱藏預覽）        │
│              → AudioTrack → micStream（用於錄製）       │
├─────────────────────────────────────────────────────────┤
│  第二道：語音 → AI（瀏覽器 + 伺服器）                   │
│  SpeechRecognition → 最終逐字稿                         │
│  → POST /api/chat → Claude 串流回應                     │
│  → 每個 chunk 附加到 aiTextRef                          │
├─────────────────────────────────────────────────────────┤
│  第三道：Canvas 攝影棚（瀏覽器）                        │
│  requestAnimationFrame 迴圈：                           │
│    繪製鏡像攝影機畫面（cover-fill 裁切）                │
│    + 從 aiTextRef + subtitleLinesRef 繪製字幕框         │
│  canvas.captureStream(30) + micStream → MediaRecorder   │
└─────────────────────────────────────────────────────────┘
                         ↓
                  錄製完成的 .webm 檔案
```

Canvas 就是電視台的導播室。它接收攝影機的即時訊號、疊加字幕圖形，再把合成後的訊號送給錄影機。錄影機不知道也不在乎「攝影機」其實是一個 canvas——它只看到一個 `MediaStream`。

---

## 3. 核心技術與選用理由

### Next.js App Router
API 路由（`/api/chat`）跑在伺服器上，這是 `ANTHROPIC_API_KEY` 唯一該存在的地方。App Router 支援 edge-compatible 的 `Response`，搭配 `ReadableStream` 可以直接把 Claude 的串流輸出 pipe 給瀏覽器。其餘所有東西（攝影機、canvas、錄影機）都跑在客戶端。

### Web Speech API（非 Whisper）
瀏覽器內建的 `SpeechRecognition` 免費、不需要網路來回、啟用 `interimResults` 後幾毫秒內就開始回傳結果。Whisper 每一輪至少要多 1–3 秒的延遲，因為你必須：(a) 緩衝音訊、(b) 上傳、(c) 等待轉譯。在即時對話中這種延遲非常突兀。代價是：Web Speech API 品質不錯但不完美，且需要 Chrome/Edge。對這個使用場景來說，速度勝出。

### Canvas API + `captureStream()`
這是整個專案的核心洞見。`HTMLCanvasElement.captureStream(fps)` 回傳一個 `MediaStream`，其中包含一個以指定幀率更新的 `VideoTrack`。從 `MediaRecorder` 的角度來看，這和攝影機串流沒有任何差異。每一幀把字幕畫到 canvas 上，它們就成為錄影機看到之前視訊訊號的一部分。

### Anthropic 串流 SDK — 純文字，非 SSE
多數串流教學使用 Server-Sent Events（SSE），搭配 `text/event-stream` 和 JSON payload，例如 `{"type":"chunk","text":"Hello"}`。這個專案全部跳過。API 路由只取出 `text_delta` 的 chunk，把原始 UTF-8 位元組寫入 `ReadableStream`。客戶端用標準的 `Response.body.getReader()` 讀取並直接附加 chunk。這是最簡單可行的程式碼，對字幕顯示的使用場景來說，不需要 SSE 才能攜帶的那些元數據。

### `dynamic(..., { ssr: false })`
`SpeechRecognition`、`getUserMedia`、`canvas.captureStream` 和 `MediaRecorder` 都是純瀏覽器 API。如果 Next.js 在 SSR 期間嘗試在伺服器上渲染 `Recorder.tsx`，在元件掛載之前就會因為 `ReferenceError: navigator is not defined` 而崩潰。`dynamic(() => import('./Recorder'), { ssr: false })` 告訴 Next.js 完全跳過這個元件的伺服器渲染，只在瀏覽器中載入它。

---

## 4. 這份程式碼教你的五件事

### 4a. 過時閉包陷阱——以及 Ref 逃生艙

**問題所在。** Canvas 的繪製迴圈跑在 `requestAnimationFrame` 的回呼函式裡。如果這個回呼直接捕捉 React 狀態，它捕捉的是 effect 執行當下的值——而不是當前值。這就是「過時閉包（stale closure）」。當 AI 回應更新了 `aiText` 狀態，繪製迴圈永遠看不到新的值，因為它還握著舊的閉包。

**為什麼單靠 `useState` 行不通。** 如果你每次 `aiText` 改變就重啟 `requestAnimationFrame` 迴圈，你會引入卡頓（迴圈短暫停止再重啟），而且 effect 的清除/重新執行週期會成為 bug 的溫床。

**解法。** 為每個繪製迴圈需要讀取的狀態維護一個配對的 `useRef`：

```typescript
// 在 Recorder.tsx 裡
const [aiText, setAiText] = useState("");
const aiTextRef = useRef("");

// 保持同步
useEffect(() => {
  aiTextRef.current = aiText;
}, [aiText]);
```

繪製迴圈讀取 `aiTextRef.current`——一個 ref，而非狀態。Ref 是可變物件；迴圈每次都透過同一個引用讀取最新的值。狀態驅動 React 的重新渲染和 UI；ref 則是那些活在 React 渲染週期之外的程式碼的逃生艙。

**程式碼位置：** `Recorder.tsx` 第 51–68 行（ref + 同步 effect），第 161–162 行（在繪製迴圈中讀取）。

---

### 4b. 像音訊混音一樣組合 MediaStream

`MediaStream` 是一個容器，可以容納多個 track——`VideoTrack` 物件、`AudioTrack` 物件——你可以自由新增或移除。這讓你能像操作音訊混音台一樣混搭不同來源。

以下是 Chitchat 的用法：

**第一步——拆分攝影機串流：**
```typescript
// 攝影機串流同時包含影像和音訊
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

// 把影像給隱藏的 <video> 元素（canvas 的圖像來源）
videoRef.current.srcObject = new MediaStream(stream.getVideoTracks());

// 把音訊單獨保存，供錄製使用
const audioStream = new MediaStream(stream.getAudioTracks());
setMicStream(audioStream);
```

為什麼要分開？因為 `<video>` 元素只需要影像 track，而錄影機需要明確加入麥克風音訊——它不會自動從攝影機串流中「抓取」音訊。

**第二步——建立可錄製的串流：**
```typescript
// canvas 產生自己的 VideoTrack
const canvasStream = canvas.captureStream(30);
const tracks = [...canvasStream.getVideoTracks()];

// 把麥克風 AudioTrack 加入 canvas VideoTrack
if (micStream) {
  micStream.getAudioTracks().forEach((track) => tracks.push(track));
}

const combinedStream = new MediaStream(tracks); // 影像來自 canvas，音訊來自麥克風
```

**第三步——確認 MIME type 再使用：**
```typescript
const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
  ? "video/webm;codecs=vp9,opus"
  : MediaRecorder.isTypeSupported("video/webm")
    ? "video/webm"
    : "video/mp4";
```

永遠不要把 `video/webm;codecs=vp9,opus` 寫死——Safari 不支援。務必先探測。

**程式碼位置：** `hooks/useMediaRecorder.ts`——整個檔案。

---

### 4c. 從伺服器路由串流純文字

**常見做法**是你在教學裡看到的：回傳 `text/event-stream` 搭配 JSON 行：
```
data: {"type":"chunk","delta":"Hello"}
data: {"type":"chunk","delta":" world"}
data: [DONE]
```

**這個專案改做什麼：**
```typescript
// app/api/chat/route.ts
const readable = new ReadableStream({
  async start(controller) {
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        controller.enqueue(encoder.encode(chunk.delta.text)); // 原始位元組，無封裝格式
      }
    }
    controller.close();
  },
});

return new Response(readable, {
  headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" },
});
```

**在客戶端：**
```typescript
const reader = res.body.getReader();
const decoder = new TextDecoder();
let full = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  full += decoder.decode(value, { stream: true });
  setAiText(full);
  aiTextRef.current = full; // canvas 在下一幀就會讀到這個值
}
```

**取捨。** 這個做法失去了結構化元數據——你無法從串流本身區分 chunk 和伺服器錯誤訊息（不過你可以透過 HTTP 狀態碼處理錯誤）。對字幕顯示的使用場景來說，你要的是最低摩擦的原始文字，簡潔的程式碼物超所值。

**程式碼位置：** `app/api/chat/route.ts`（伺服器端），`Recorder.tsx` 的 `sendToAI` 函式（客戶端）。

---

### 4d. 在 Canvas 上繪製「電視台風格」的字幕

Canvas 的座標系統以左上角為 (0, 0)，x 向右遞增，y 向下遞增。每個繪圖操作都會套用到當前的變換矩陣上。`ctx.save()` 和 `ctx.restore()` 可以推入/彈出變換堆疊——這對於只對某一個繪圖操作套用變換（例如鏡像）、而不影響後續所有操作非常關鍵。

**鏡像技巧**（自拍視角）：
```typescript
ctx.save();
ctx.translate(width, 0);  // 把原點移到右上角
ctx.scale(-1, 1);          // 翻轉 x 軸
ctx.drawImage(video, ...); // 繪製鏡像畫面
ctx.restore();             // 恢復正常座標
```

**文字換行**——瀏覽器的 Canvas API 有 `ctx.measureText()`，但沒有內建自動換行。你得自己實作：
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

**字幕背景**用 `ctx.roundRect()` 和 `rgba(0,0,0,0.55)` 繪製——一個半透明的圓角矩形。矩形的高度在繪製之前就先計算好（先量測所有換行後的行數），填色之後再在上面繪製文字。Canvas 上的繪製順序非常重要：後面的繪圖操作會蓋住前面的。

使用者的字幕是白色（`#ffffff`）；AI 的字幕是青色（`#67e8f9`）——讓人一眼看出誰在說話。

**程式碼位置：** `Recorder.tsx` 第 113–200 行。

---

### 4e. 用狀態機管理對話流程

**布林旗標的問題。** 假設你有：
```typescript
const [isListening, setIsListening] = useState(false);
const [isThinking, setIsThinking] = useState(false);
const [isStreaming, setIsStreaming] = useState(false);
```

有幾種有效的組合？2³ = 8 種。但實際上只有少數幾種有意義（你不可能同時在「聆聽」又在「串流」）。其餘的都是等待發生的 bug。隨著旗標增加，問題呈指數級增長。

**解法。** 明確列出有效狀態，並定義每個狀態下允許哪些事件：

```
idle → [START_SESSION] → ready
ready → [USER_SPEECH_START] → listening
listening → [SPEECH_END] → transcribing
transcribing → [TRANSCRIPT_READY] → thinking
thinking → [AI_FIRST_TOKEN] → ai_streaming
ai_streaming → [AI_STREAM_END] → turn_done
turn_done → [RESET_TURN] → ready

// 中斷路徑：
thinking/ai_streaming → [USER_INTERRUPT] → ready
```

`lib/conversationMachine.ts` 中的 reducer `conversationReducer` 以純函式實作這個機器：`(state, event) => nextState`。純函式天生易於測試。在開發環境中，`dispatchWithLog` 會把每次狀態轉換記錄到 console，讓你能即時觀察狀態機的運作：

```
[conversation] listening --(TRANSCRIPT_READY)-> thinking
[conversation] thinking --(AI_FIRST_TOKEN)-> ai_streaming
[conversation] ai_streaming --(AI_STREAM_END)-> turn_done
```

**狀態機還沒有接到 UI**——那是 Phase 2 的工作。但現在已經寫好，代表 Phase 2 是重構（連接已有的邏輯），而不是重寫（從頭搞清楚邏輯）。

**程式碼位置：** `lib/conversationMachine.ts`、`types/index.ts`。

---

## 5. 陷阱與避免方法

**忘記 `{ ssr: false }`**

症狀：`ReferenceError: SpeechRecognition is not defined`，出現在建置時或首次載入時。

修正：任何碰到 `window`、`navigator`、`document`、`SpeechRecognition`、`MediaRecorder` 或 canvas API 的元件都必須這樣載入：
```typescript
const Recorder = dynamic(() => import("@/components/Recorder"), { ssr: false });
```

---

**錄製影片時沒有音訊**

如果你直接把 canvas 的 `captureStream()` 傳給 `MediaRecorder`，你會得到一個只有影像的檔案——即使使用者有麥克風也沒有聲音。你必須明確地從攝影機串流中取出 `AudioTrack` 並加入錄製串流。參見 `useMediaRecorder.ts` 的做法。

---

**每次狀態改變都重啟繪製迴圈**

如果你把 React 狀態變數（而非 ref）放進啟動 `requestAnimationFrame` 的 `useEffect` 依賴陣列，每次狀態改變迴圈就會取消並重啟。在 60fps 下，AI 文字每秒更新多次，這會造成明顯的畫面閃爍和微妙的時序 bug。在迴圈裡只用 ref；狀態只用於 React 的重新渲染。

---

**猜測 MIME type**

`video/webm;codecs=vp9,opus` 錄製品質優異，但 Safari 不支援。寫死這個值會讓 Safari 使用者遭遇無聲的崩潰。務必用 `MediaRecorder.isTypeSupported()` 探測並優雅地降級——參見 `useMediaRecorder.ts` 第 39–43 行。

---

**`URL.createObjectURL` 的記憶體洩漏**

當你用 `const url = URL.createObjectURL(blob)` 來顯示影片預覽，瀏覽器會在記憶體中保留對那個 blob 的引用，直到你呼叫 `URL.revokeObjectURL(url)`。在 React 元件裡，應該在 `useEffect` 的清除函式中做這件事：
```typescript
useEffect(() => {
  if (!videoBlob) return;
  const url = URL.createObjectURL(videoBlob);
  setVideoUrl(url);
  return () => URL.revokeObjectURL(url);
}, [videoBlob]);
```

---

## 6. 為什麼「過度工程」其實是「預先工程」

打開 `types/index.ts`，你會看到 `SubtitleItem` 有 `startAt` 和 `endAt` 時間戳。你會看到 `AppState` 有 `persona` 欄位和 `scriptMode` 旗標。打開 `lib/subtitleStore.ts`，你會看到一個追蹤開啟/關閉串流項目及精確計時的類別。

這些目前都還沒被 UI 使用。

這是刻意為之的。理由如下：

**Phase 1**（目前）：使用者說話 → Claude 回應 → 字幕出現在螢幕上。簡單。

**Phase 2**（規劃中）：多個 AI 人設，各自有不同的系統提示。`AppState` 裡的 `persona.presetId` 欄位就是這個功能的掛鉤。切換人設只需要把不同的 `presetId` 傳給 `/api/chat`，而它已經接受 `systemPrompt` 覆寫參數了。

**Phase 3**（規劃中）：提詞機/腳本模式，使用者照著腳本唸，AI 提供指導而非對話。`AppMode` 中的 `scriptMode` 旗標和 `conversationMachine.ts` 中的 `teleprompter` 分支已經做好存根：
```typescript
case 'TRANSCRIPT_READY': {
  if (!ctx.mode.aiEnabled || ctx.mode.teleprompter) {
    return { state: 'turn_done', ctx: withTranscript }; // 跳過 AI 呼叫
  }
  return { state: 'thinking', ctx: withTranscript };
}
```

如果現在不預先建立這些型別和結構，加入 Phase 2 就需要破壞性的資料模型重構——把 `SubtitleLine` 改成 `SubtitleItem`、到處補上時間戳、重組狀態。預先做好代表 Phase 2 是累加的，而不是破壞性的。

`SubtitleStore` 類別同樣具有前瞻性：目前 canvas 繪製迴圈呼叫 `subtitleLinesRef.current.slice(-3)`。在 Phase 2，它將改為呼叫 `subtitleStore.getRecentForCanvas(4)`，取得帶有說話者資訊和精確計時的字幕項目，可以根據 `endAt` 實作淡出效果。

---

## 7. 快速參考

### 檔案清單

| 檔案 | 功能說明 |
|------|---------|
| `app/page.tsx` | 主頁面外殼——管理長寬比狀態、動態載入 Recorder |
| `app/api/chat/route.ts` | Claude 串流代理——接收訊息、回傳純文字串流 |
| `components/Recorder.tsx` | 核心引擎——攝影機、canvas 繪製迴圈、語音、AI、錄製狀態機 |
| `components/SubtitleOverlay.tsx` | UI 專用字幕 overlay，疊在 canvas 上方（不被錄製）|
| `components/AspectRatioPicker.tsx` | 16:9 / 9:16 / 1:1 選擇器 |
| `hooks/useSpeechRecognition.ts` | 封裝 Web Speech API，對最終結果觸發 `onTranscript` |
| `hooks/useMediaRecorder.ts` | canvas.captureStream + 麥克風 → MediaRecorder → Blob |
| `hooks/useSpeechSynthesis.ts` | AI 回應的文字轉語音 |
| `lib/conversationMachine.ts` | 對話狀態機的純 reducer |
| `lib/subtitleStore.ts` | 追蹤帶時間戳的字幕項目，為 Phase 2 預備 |
| `lib/claude.ts` | 客戶端 streamChat 輔助函式（供未來直接使用）|
| `types/index.ts` | 主型別定義——SubtitleItem、AppMode、AppState、ConversationState |

### 資料流（文字圖）

```
[麥克風] ──────────────────────────────────────────────────────────────┐
                                                                        │
[攝影機]                                                                │
  │ VideoTrack                                                          │
  ↓                                                                     │
[隱藏 <video>] → canvas 繪製迴圈（requestAnimationFrame）              │
                       │ 讀取 aiTextRef + subtitleLinesRef              │
                       ↓                                                │
                 [<canvas>] ← 合成畫面（攝影機 + 字幕）                │
                       │                                                │
               captureStream(30fps) → VideoTrack                        │
                       │                                                ↓
                       └──────────── 合併 AudioTrack ──→ [MediaRecorder]
                                                                        │
                                                                        ↓
                                                                 [.webm Blob]

[語音] → SpeechRecognition（zh-TW）→ 最終逐字稿
             │
             ↓
        POST /api/chat ──→ Anthropic SDK ──→ claude-sonnet-4-6
             │                                      │
             ←──── ReadableStream（純文字）─────────┘
             │
        reader.read() 迴圈
             │
        setAiText(full) + aiTextRef.current = full
             │
        canvas 繪製迴圈讀取 aiTextRef → 字幕出現在畫格上
```

### 環境變數

| 變數 | 用途 |
|------|------|
| `ANTHROPIC_API_KEY` | 必填。從 console.anthropic.com 取得，放入 `.env.local`。|

### 指令

```bash
npm run dev    # localhost:3000
npm run build  # 正式環境建置
npm run lint   # ESLint
```