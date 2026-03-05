import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * output: 'standalone'
   *
   * next build 時額外產生 .next/standalone/ 目錄，
   * 內含一個自給自足的 Node.js server（server.js），
   * 不需要完整的 node_modules 就能獨立執行。
   * 這是 Electron 打包 Next.js 的標準做法。
   */
  output: 'standalone',
};

export default nextConfig;
