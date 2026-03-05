export type Locale = 'zh-TW' | 'en'

export const translations = {
  'zh-TW': {
    // App meta
    appTitle: 'Chitchat — AI 對談錄影',
    appDescription: '對著鏡頭說話，與 Claude AI 即時對談，錄製含字幕的影片',
    // Header
    headerSubtitle: 'AI 對談錄影工具',
    // Loading
    loading: '載入中...',
    // Footer
    footerText: '使用 Web Speech API 即時語音辨識 · Claude claude-sonnet-4-6 AI 回應',
    // Video section
    videoReady: '影片已準備好，可以下載了',
    downloadVideo: '下載原始影片',
    downloadTimelapse: '縮時下載',
    timelapseLoadingEngine: '載入處理引擎...',
    timelapseNothingToCut: '靜默段落不足 1 秒，無需縮時處理',
    timelapseError: '縮時處理失敗，請確認影片是否有效',
    timelapseDone: '縮時影片已下載',
    reRecord: '重新錄製',
    // Recording controls
    startRecording: '開始錄影',
    stopRecording: '停止錄影',
    skipLine: '跳過 →',
    // Button tooltips
    cameraDisable: '關閉鏡頭',
    cameraEnable: '開啟鏡頭',
    teleprompterDisable: '切換到對話模式',
    teleprompterEnable: '切換到提詞機模式',
    muteAi: '靜音',
    unmuteAi: '開啟語音',
    // Canvas overlay text
    scriptComplete: '劇本排練完成！',
    yourTurnPrompt: '你的輪次 — 說出台詞後繼續',
    // Script loader
    uploadScript: '上傳劇本',
    removeScript: '移除劇本',
    scriptParseError: '無法解析劇本，請確認格式正確（每行需為「角色名稱: 台詞」格式）',
    // Character picker
    chooseCharacter: '選擇你的角色',
    characterPickerBody: '你要扮演哪個角色？AI 將扮演其他所有角色。',
    cancel: '取消',
    // API Key modal
    apiKeyTitle: '設定 Anthropic API Key',
    apiKeyTitleUpdate: '更新 API Key',
    apiKeyDescSet: '此應用程式需要 Anthropic API Key 才能使用 AI 功能。',
    apiKeyDescUpdate: '輸入新的 Anthropic API Key 以取代目前儲存的金鑰。',
    apiKeyError: 'API Key 必須以 sk-ant- 開頭',
    apiKeyNote: 'Key 僅儲存於瀏覽器 localStorage，不會傳送至任何第三方伺服器。',
    apiKeyLinkPrefix: '前往 ',
    apiKeyLinkSuffix: ' 取得 API Key。',
    save: '儲存',
    // Persona picker
    aiRole: 'AI 角色',
    customPromptLabel: '自訂 Prompt',
    customPromptPlaceholder: '輸入自訂 System Prompt...',
    // Speech recognition language code
    speechLang: 'zh-TW',
  },
  'en': {
    appTitle: 'Chitchat — AI Video Chat',
    appDescription: 'Talk to the camera, chat with Claude AI in real time, record video with burned-in subtitles',
    headerSubtitle: 'AI Video Chat Recorder',
    loading: 'Loading...',
    footerText: 'Web Speech API real-time transcription · Claude claude-sonnet-4-6 AI responses',
    videoReady: 'Your video is ready to download',
    downloadVideo: 'Download Video',
    downloadTimelapse: 'Timelapse',
    timelapseLoadingEngine: 'Loading engine...',
    timelapseNothingToCut: 'Less than 1 s of silence — no timelapse needed',
    timelapseError: 'Timelapse failed — check if the video is valid',
    timelapseDone: 'Timelapse downloaded',
    reRecord: 'Re-record',
    startRecording: 'Start Recording',
    stopRecording: 'Stop Recording',
    skipLine: 'Skip →',
    cameraDisable: 'Turn off camera',
    cameraEnable: 'Turn on camera',
    teleprompterDisable: 'Switch to conversation mode',
    teleprompterEnable: 'Switch to teleprompter mode',
    muteAi: 'Mute AI voice',
    unmuteAi: 'Unmute AI voice',
    scriptComplete: 'Script complete!',
    yourTurnPrompt: 'Your turn — say your line to continue',
    uploadScript: 'Upload script',
    removeScript: 'Remove script',
    scriptParseError: 'Could not parse script — check format (each line: "Character: Line")',
    chooseCharacter: 'Choose your character',
    characterPickerBody: 'Which character will you play? The AI will play all other characters.',
    cancel: 'Cancel',
    apiKeyTitle: 'Set Anthropic API Key',
    apiKeyTitleUpdate: 'Update API Key',
    apiKeyDescSet: 'This app requires an Anthropic API Key to use AI features.',
    apiKeyDescUpdate: 'Enter a new Anthropic API Key to replace the currently saved one.',
    apiKeyError: 'API Key must start with sk-ant-',
    apiKeyNote: 'Your key is stored only in browser localStorage and never sent to any third-party server.',
    apiKeyLinkPrefix: 'Get your key at ',
    apiKeyLinkSuffix: '.',
    save: 'Save',
    aiRole: 'AI Role',
    customPromptLabel: 'Custom Prompt',
    customPromptPlaceholder: 'Enter a custom system prompt...',
    speechLang: 'en-US',
  },
} as const

export type Translations = { [K in keyof typeof translations['zh-TW']]: string }
