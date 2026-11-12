import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 配置。
 *
 * 设计取舍：
 * - workers: 1 + fullyParallel: false：用例共享同一个夹具博客与后端数据库，
 *   串行执行避免相互污染；
 * - globalSetup 负责构建前端产物与 E2E 后端、拉起真实服务，并在 meta.json
 *   中记录 baseURL 与夹具路径（端口随机，无法在配置中写死）；
 * - 不使用 baseURL，用例统一从 fixtures.readMeta() 取地址；
 * - locale: 'zh-CN'：应用默认界面语言为简体中文，固定浏览器语言可让
 *   「文档语言标注」等与语言相关的用例保持确定性。
 */
export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: './e2e/global-setup.ts',
  outputDir: './e2e/test-results',
  use: {
    ...devices['Desktop Chrome'],
    locale: 'zh-CN',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
