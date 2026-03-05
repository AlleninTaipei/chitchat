'use strict'

/**
 * Electron Main Process
 *
 * 職責：
 *  1. 用 child_process.fork() 啟動 Next.js standalone server
 *  2. 輪詢等待 server ready
 *  3. 建立 BrowserWindow，載入 http://127.0.0.1:<port>
 *  4. 處理相機 / 麥克風權限
 *  5. App 關閉時清除 server 子程序
 */

const { app, BrowserWindow, session, dialog } = require('electron')
const { fork } = require('child_process')
const path = require('path')
const net  = require('net')
const fs   = require('fs')

let mainWindow   = null
let serverProcess = null

// ─── 工具函數 ────────────────────────────────────────────────────────────────

/** 從 startPort 開始找第一個可用的 TCP port */
function findFreePort(startPort = 3000) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.on('error', () => resolve(findFreePort(startPort + 1)))
    srv.listen(startPort, '127.0.0.1', () => srv.close(() => resolve(startPort)))
  })
}

/** 輪詢 url 直到 server 回應（或 timeout） */
async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // AbortSignal.timeout 需要 Node.js ≥ 17.3 (Electron 33 內建 Node 20，OK)
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (res.status < 500) return
    } catch { /* server 尚未就緒，繼續等待 */ }
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error(`Server 在 ${timeoutMs / 1000}s 內未啟動`)
}

// ─── Next.js Standalone Server ───────────────────────────────────────────────

/**
 * 啟動 Next.js standalone server。
 *
 * 打包後路徑：  resources/nextjs/server.js
 * 開發模式路徑：.next/standalone/server.js
 */
function startNextServer(port) {
  const serverScript = app.isPackaged
    ? path.join(process.resourcesPath, 'nextjs', 'server.js')
    : path.join(__dirname, '../.next/standalone/server.js')

  if (!fs.existsSync(serverScript)) {
    dialog.showErrorBox(
      'Build Required',
      `找不到 Next.js 伺服器檔案：\n${serverScript}\n\n請先執行：npm run build:electron`,
    )
    app.quit()
    return
  }

  const env = {
    ...process.env,
    PORT:     String(port),
    HOSTNAME: '127.0.0.1',
    NODE_ENV: 'production',
  }

  // 嘗試讀取 .env.local（開發方便；打包版用 UI 輸入 API Key）
  const envLocalPath = app.isPackaged
    ? path.join(process.resourcesPath, '.env.local')
    : path.join(__dirname, '../.env.local')

  try {
    const lines = fs.readFileSync(envLocalPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
    }
  } catch { /* .env.local 是選項，不存在時跳過 */ }

  serverProcess = fork(serverScript, [], { env, stdio: 'pipe' })
  serverProcess.stdout?.on('data', d => process.stdout.write('[next] ' + d))
  serverProcess.stderr?.on('data', d => process.stderr.write('[next] ' + d))
  serverProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[next] server exited with code ${code}`)
    }
  })
}

// ─── BrowserWindow ────────────────────────────────────────────────────────────

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width:     1280,
    height:    800,
    minWidth:  900,
    minHeight: 620,
    title:          'Chitchat',
    backgroundColor: '#09090b',   // 與 app 背景色一致，避免白色閃爍
    show: false,                   // ready-to-show 後才顯示，無白屏閃爍
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,     // 安全：renderer 不直接存取 Node API
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // ── 授予相機 / 麥克風權限 ────────────────────────────────────────────────
  // Electron renderer 預設會詢問使用者；這裡直接允許 media 請求
  const ALLOWED = new Set(['media', 'mediaKeySystem'])

  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(ALLOWED.has(permission))
  })

  session.defaultSession.setPermissionCheckHandler((_, permission) => {
    return ALLOWED.has(permission)
  })

  mainWindow.loadURL(`http://127.0.0.1:${port}`)

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── App 生命週期 ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Dev 捷徑：ELECTRON_DEV=true 時直接連 next dev（port 3000）
  if (!app.isPackaged && process.env.ELECTRON_DEV === 'true') {
    createWindow(3000)
    return
  }

  try {
    const port = await findFreePort(3000)
    startNextServer(port)
    await waitForServer(`http://127.0.0.1:${port}`)
    createWindow(port)
  } catch (err) {
    console.error('啟動失敗：', err)
    dialog.showErrorBox('啟動失敗', String(err))
    app.quit()
  }
})

app.on('window-all-closed', () => {
  // macOS 習慣：關閉所有視窗不一定退出 app
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // macOS：Dock icon 點擊時重建視窗
  if (BrowserWindow.getAllWindows().length === 0) {
    // port 已知，直接重建（不重啟 server）
    // 這個情境極少發生，簡單重啟整個流程
    app.relaunch()
    app.quit()
  }
})

app.on('will-quit', () => {
  // 確保 Next.js server 子程序被清除
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM')
  }
})
