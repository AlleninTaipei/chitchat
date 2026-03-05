# CLAUDE.md

本檔案為 Claude Code（claude.ai/code）在使用此儲存庫時提供指引。

## 指令

```bash
npm run dev      # 在 localhost:3000 啟動開發伺服器
npm run build    # 正式環境建置
npm run lint     # 執行 ESLint
```

**必要條件**：執行前請先建立 `.env.local` 並填入 `ANTHROPIC_API_KEY=<key>`。

## 架構

**Chitchat** 是一個 AI 影片對話錄製工具。使用者對著鏡頭說話，語音被轉譯後傳送給 Claude，AI 的回應則以字幕形式呈現——所有內容都燒進 canvas 錄製的影片中。

### 資料流

```
Camera/Mic → getUserMedia
  ├─ VideoTrack → <video>（隱藏預覽）
  └─ AudioTrack → micStream（用於錄製的獨立 MediaStream）

Canvas 繪製迴圈（requestAnimationFrame）
  ├─ 繪製鏡像攝影機畫面（cover-fill 裁切）
  └─ 從 refs 繪製字幕 overlay（aiTextRef、subtitleLinesRef）

SpeechRecognition（Web Speech API，lang: zh-TW）
  └─ onTranscript（僅最終結果）→ POST /api/chat

/api/chat（Next.js Route Handler）
  └─ Anthropic SDK 串流 → 純文字 ReadableStream → 客戶端

useMediaRecorder
  └─ canvas.captureStream(30fps) + micStream → MediaRecorder → Blob
```

### 過時閉包模式

Canvas 的 `requestAnimationFrame` 迴圈讀取 `aiTextRef` 和 `subtitleLinesRef`（refs，非 state），以便在不重啟迴圈的情況下永遠取得最新值。State 和 refs 透過 `useEffect` 保持同步。

### 關鍵限制

- `Recorder` 使用 `dynamic(..., { ssr: false })` 載入——它使用純瀏覽器 API（`getUserMedia`、`SpeechRecognition`、`canvas.captureStream`、`MediaRecorder`）。
- `/api/chat` 路由串流的是原始文字（非 SSE/JSON）。客戶端以普通的 `ReadableStream` 讀取，並直接將 chunk 附加到 `aiTextRef`，讓 canvas 在每一幀都能取得最新內容。
- `SubtitleOverlay` 是疊在 canvas 上方的純 UI overlay（不被錄製）。被錄製的字幕是直接繪製在 canvas 上的。
- 長寬比變更（`16:9` → 1280×720、`9:16` → 720×1280、`1:1` → 720×720）在繪製迴圈內每幀都會設定到 `canvas.width/height`。
