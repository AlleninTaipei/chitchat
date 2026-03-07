# Chitchat

> 對著鏡頭和 AI 對話。字幕即時燒錄進你的影片——每一格畫面，不需要後製。

Chitchat 是一個完全跑在瀏覽器裡的 AI 視訊錄製工具。你說話、語音即時轉錄、Claude 回應、回應以字幕出現——全部即時合成到 canvas 錄影中，停止錄製就能下載成品。

不需要 FFmpeg。不需要等待。不需要管理字幕檔。按下錄製、開始對話、帶著做好的 `.webm` 影片離開。

---

## 為什麼不一樣

大多數「AI + 鏡頭」的示範都會掉入兩個陷阱之一：

- **後製流程**：先錄影、再轉譯、再用 FFmpeg 燒字幕。流程長、要等、容易出錯。
- **疊加 overlay**：在 `<video>` 上面貼一個字幕 `<div>`。簡單，但一匯出字幕就消失了。

Chitchat 走的是第三條路：**canvas 就是攝影棚**。攝影機畫面和 AI 字幕在同一個 `<canvas>` 元素上即時合成，錄的就是這個 canvas。停止錄製時，字幕已經永久嵌入每一格畫面。

```
攝影機 → <canvas>（攝影機 + 字幕即時合成）→ MediaRecorder → .webm
                                      ↑
麥克風 → SpeechRecognition → /api/chat → Claude → 串流文字 chunk
```

---

## 用 Vibe Coding 打造

這個專案從頭到尾都是 AI 協作開發的成果——一個真實示範，展示當你把 Claude 當成共同工程師而不是搜尋引擎時，能做出什麼東西。

如果你剛開始接觸 AI 輔助開發，這個 codebase 值得探索。每一個架構決定都有原因，而那些原因都有文件記錄。你會學到：

- 為什麼在動畫迴圈裡 `useRef` 勝過 `useState`
- 怎麼像操作混音台一樣組合 `MediaStream`
- 為什麼狀態機值得多花那一點設置成本
- 怎麼從伺服器路由串流純文字，不用跟 SSE 格式搏鬥

讀 [`LEARN-TW.md`](./LEARN-TW.md) 可以看到每個非直觀決策的白話說明。

---

## 功能清單

| 功能 | 狀態 |
|------|------|
| 即時語音對 AI 對話 | 已完成 |
| 字幕燒錄進 canvas 錄影 | 已完成 |
| AI 人設預設（教師、面試官、客服） | 已完成 |
| 自訂系統提示（System Prompt） | 已完成 |
| BYOK — 自帶 Anthropic API Key | 已完成 |
| 劇本模式（照劇本排練，AI 陪練） | 已完成 |
| 16:9 / 9:16 / 1:1 畫面比例 | 已完成 |
| 縮時轉存（Smart Timelapse Export） | 規劃中 |
| TTS 錄音支援（AI 聲音燒進影片） | 規劃中 |

---

## 快速開始

**1. Clone 並安裝**
```bash
git clone <this-repo>
cd chitchat
npm install
```

**2. 加入 API Key**
```bash
# 在專案根目錄建立 .env.local
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
```

從 [console.anthropic.com](https://console.anthropic.com) 取得你的 Key。Key 只存在伺服器端，永遠不會到達瀏覽器。

> 還沒有 API Key？App 啟動時會引導你輸入。

**3. 啟動**
```bash
npm run dev
```

用 Chrome 或 Edge 開啟 [http://localhost:3000](http://localhost:3000)，允許攝影機與麥克風存取，按下錄製，開始說話。

---

## 運作原理

按下錄製後，三件事同時發生：

**攝影機車道** — `getUserMedia` 取得攝影機與麥克風。Video track 餵給隱藏的 `<video>` 元素，canvas 從那裡讀取畫面。Audio track 單獨保存供錄製使用。

**AI 車道** — `SpeechRecognition` 監聽你的聲音。說完話停頓時，逐字稿送到 `/api/chat`，以純 UTF-8 文字串流回傳 Claude 的回應。每個 chunk 附加到一個 ref，canvas 在每一格都能讀到最新值。

**Canvas 車道** — `requestAnimationFrame` 迴圈持續運行。每一格：繪製鏡像攝影機畫面、從最新 AI 文字繪製字幕。`canvas.captureStream(30)` + 麥克風 audio track → `MediaRecorder` → `.webm` blob。

Canvas 同時是預覽畫面和錄影機。你看到的就是存下來的。

---

## 專案結構

```
src/
  app/
    page.tsx              # 根頁面 — 畫面比例狀態、動態載入
    api/chat/route.ts     # Claude 串流端點（純伺服器端）
  components/
    VideoRecorder.tsx     # 主要協調者，含對話狀態機
    ConversationOverlay.tsx  # Canvas 繪製迴圈（攝影機 + 字幕合成）
  hooks/
    useVoiceRecognition.ts
    useTextToSpeech.ts
    useCanvasRecorder.ts
    useAudioMixer.ts
    useConversation.ts
  lib/
    conversationMachine.ts  # 純函式狀態機 reducer
    subtitleStore.ts         # 帶時間戳的字幕追蹤
  types/
    index.ts                # AppState、SubtitleItem、ConversationState
```

---

## 指令

```bash
npm run dev      # 開發伺服器，localhost:3000
npm run build    # 正式環境建置
npm run lint     # ESLint
```

---

## 瀏覽器支援

| 瀏覽器 | 支援狀況 |
|--------|---------|
| Chrome / Edge | 完整支援 |
| Firefox | 錄製正常；SpeechRecognition 有限 |
| Safari / iOS | SpeechRecognition 不穩定，不建議使用 |

輸出格式為 `.webm`（VP9 + Opus），Chrome 和 Firefox 原生播放。

---

## 給 Vibe Coder 的話

不需要看懂每一行才能從這個專案得到收穫。選一個你感興趣的切入點：

- 好奇 canvas 錄影是怎麼做到的？從 `ConversationOverlay.tsx` 開始看。
- 想理解 AI 串流？讀 `app/api/chat/route.ts`——大約 30 行。
- 對狀態機有興趣？打開 `lib/conversationMachine.ts` 看 reducer。
- 搞不懂為什麼用 ref 而不是 state？看 `LEARN-TW.md` 的第 4a 節。

這個 codebase 設計上以可讀為優先。每個非直觀的選擇都有說明它取捨的註解或文件段落。

---

## 延伸閱讀

`idea.md` 包含未來各階段的完整架構設計——AI engine 抽象層、TTS 錄音用的 Audio Mixer bus、縮時轉存、劇本模式的 turn 管理。如果你想看有經驗的工程師怎麼思考「在不破壞現有功能的前提下擴充系統」，也值得一讀。

---

## 授權

MIT
