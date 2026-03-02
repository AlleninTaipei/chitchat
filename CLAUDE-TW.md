# CLAUDE.md

本文件為 Claude Code（claude.ai/code）在操作此儲存庫時提供指引。

## 指令

```bash
npm run dev      # 在 localhost:3000 啟動開發伺服器
npm run build    # 產生正式環境建置
npm run lint     # 執行 ESLint
```

**必要步驟**：執行前請先建立 `.env.local`，並填入 `ANTHROPIC_API_KEY=<金鑰>`。

## 架構

**Chitchat** 是一個 AI 視訊錄製對話工具。使用者對著鏡頭說話，語音會被轉錄後送至 Claude，AI 的回應則以字幕形式顯示——所有內容都會燒錄至 canvas 錄影畫面中。

### 資料流程

```
相機/麥克風 → getUserMedia
  ├─ 視訊軌 → <video>（隱藏預覽）
  └─ 音訊軌 → micStream（獨立的 MediaStream 供錄製使用）

Canvas 繪製迴圈（requestAnimationFrame）
  ├─ 繪製鏡像相機畫面（cover-fill 裁切）
  └─ 從 refs 繪製字幕疊加層（aiTextRef、subtitleLinesRef）

SpeechRecognition（Web Speech API，語言：zh-TW）
  └─ onTranscript（僅限最終結果）→ POST /api/chat

/api/chat（Next.js Route Handler）
  └─ Anthropic SDK 串流 → 純文字 ReadableStream → 客戶端

useMediaRecorder
  └─ canvas.captureStream(30fps) + micStream → MediaRecorder → Blob
```

### 閉包陳舊值處理模式

Canvas 的 `requestAnimationFrame` 迴圈透過讀取 `aiTextRef` 和 `subtitleLinesRef`（refs，非 state）來取得最新值，避免重新啟動迴圈。state 與 refs 透過 `useEffect` 保持同步。

### 關鍵限制

- `Recorder` 使用 `dynamic(..., { ssr: false })` 載入——它依賴瀏覽器專屬 API（`getUserMedia`、`SpeechRecognition`、`canvas.captureStream`、`MediaRecorder`）。
- `/api/chat` 路由串流純文字（非 SSE/JSON）。客戶端以純 `ReadableStream` 讀取，並將資料塊直接附加至 `aiTextRef`，讓 canvas 在每一幀都能取得最新內容。
- `SubtitleOverlay` 是疊加在 canvas 上方的純 UI 層（不會被錄製）。錄製的字幕是直接繪製在 canvas 上的。
- 長寬比變更（`16:9` → 1280×720、`9:16` → 720×1280、`1:1` → 720×720）在繪製迴圈內的每一幀都會設定 `canvas.width/height`。
