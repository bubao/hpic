/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import pkg from './package.json' with { type: 'json' }

// web/ 被 Go //go:embed web/* 直接内嵌进二进制，且仓库以 web/placeholder.txt 作为
// 保底文件（防止空目录导致 embed 失败并被 git 跟踪）。emptyOutDir 会在构建开始时
// 清空 outDir，因此在 closeBundle 阶段把 placeholder.txt 补写回来。
const keepPlaceholderPlugin: Plugin = {
  name: 'hpic-keep-placeholder',
  closeBundle() {
    fs.mkdirSync(path.resolve(__dirname, '../web'), { recursive: true })
    fs.writeFileSync(path.resolve(__dirname, '../web/placeholder.txt'), '')
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), keepPlaceholderPlugin],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: '../web',
    // web/ 被 Go //go:embed 直接内嵌进二进制：构建前必须清空历史产物，
    // 否则每次增量构建的哈希文件都会累积，导致发布二进制体积成倍膨胀。
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:38120',
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test-setup.ts'],
    // E2E 用例由 Playwright 承载，不纳入 Vitest 单测范围
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
