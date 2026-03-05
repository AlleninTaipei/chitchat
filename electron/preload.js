'use strict'

/**
 * Preload Script
 *
 * contextIsolation: true  → renderer 與 Node 環境完全隔離
 * nodeIntegration:  false → renderer 無法直接 require Node 模組
 *
 * 本 app 所有後端溝通都透過 fetch() → Next.js API routes，
 * 不需要額外的 IPC bridge，所以這個檔案維持空白即可。
 */
