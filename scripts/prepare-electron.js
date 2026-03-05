/**
 * scripts/prepare-electron.js
 *
 * 在 electron-builder 打包前，把 Next.js standalone 需要的
 * 靜態資源複製到正確位置。
 *
 * 為何需要手動複製？
 *   `next build --output standalone` 只產生伺服器程式碼，
 *   不會自動把 .next/static（JS/CSS 等前端資源）和 public/（圖片等）
 *   放進 standalone 目錄。Next.js 官方文件要求手動執行此步驟。
 *
 * 用法（由 package.json scripts 呼叫，勿直接執行）：
 *   node scripts/prepare-electron.js
 */

'use strict'

const fs   = require('fs')
const path = require('path')

const ROOT      = path.join(__dirname, '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')

function copy(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  ⚠  skip (not found): ${src}`)
    return
  }
  fs.cpSync(src, dest, { recursive: true, force: true })
  console.log(`  ✓  ${path.relative(ROOT, src)}  →  ${path.relative(ROOT, dest)}`)
}

// ── 前置檢查 ──────────────────────────────────────────────────────────────────
if (!fs.existsSync(STANDALONE)) {
  console.error('\n❌  .next/standalone 不存在，請先執行 next build\n')
  process.exit(1)
}

console.log('\n📦  準備 Electron 靜態資源...')

// .next/static  →  .next/standalone/.next/static
copy(
  path.join(ROOT, '.next', 'static'),
  path.join(STANDALONE, '.next', 'static'),
)

// public/  →  .next/standalone/public/
copy(
  path.join(ROOT, 'public'),
  path.join(STANDALONE, 'public'),
)

console.log('\n✅  準備完成，可以執行 electron-builder\n')
