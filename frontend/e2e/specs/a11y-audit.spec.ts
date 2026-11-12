/**
 * 无障碍（a11y）审计用例。
 *
 * 用 axe-core 对配图主流程涉及的各个界面做自动化审计，断言不存在
 * critical / serious 级别的违规。审计覆盖：
 *   - 主壳（侧边栏 + 博文列表 + 配图区）
 *   - 手动外链弹窗
 *   - 覆盖确认弹窗
 *   - 设置弹窗（体检 Tab）
 *   - 命令面板（⌘K）
 *
 * 说明：minor / moderate 级别的问题不阻断用例，但会在失败时一并打印，
 * 便于后续渐进式改进。
 */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  FIXTURE_POSTS,
  POST_BY_TITLE,
  readMeta,
  writeFixturePost,
  type E2eMeta,
} from '../fixtures';

let meta: E2eMeta;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  meta = readMeta();
});

test.beforeEach(() => {
  for (const p of FIXTURE_POSTS) writeFixturePost(meta.blogDir, p.relPath, p.content);
});

const AUDIT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const BLOCKING_IMPACTS = ['critical', 'serious'];

// A11Y_REPORT_ONLY=1 时只输出报告不做断言，便于一次性收集所有界面待修项。
const REPORT_ONLY = process.env.A11Y_REPORT_ONLY === '1';

interface FilteredViolation {
  id: string;
  impact: string;
  description: string;
  nodes: { target: string[]; summary: string }[];
}

/**
 * 等当前所有有限时长的 CSS 动画/过渡结束。
 *
 * 弹窗与命令面板都带淡入动画（opacity 0→1）。若 axe 在动画中间态采样，
 * 会把半透明的前景/背景混合后当成真实配色，从而产生不稳定的对比度误报。
 * 无限循环动画（如加载转圈）会被过滤掉，避免永久等待。
 */
async function waitForCssAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter(a => {
      const timing = a.effect?.getTiming();
      return timing && timing.iterations !== Infinity;
    });
    await Promise.all(finite.map(a => a.finished.catch(() => undefined)));
  });
}

async function audit(page: Page, label: string): Promise<FilteredViolation[]> {
  await waitForCssAnimations(page);
  const result = await new AxeBuilder({ page }).withTags(AUDIT_TAGS).analyze();
  const blocking = result.violations
    .filter(v => BLOCKING_IMPACTS.includes(v.impact ?? ''))
    .map(v => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map(n => ({
        target: n.target,
        summary: n.failureSummary?.replace(/\s+/g, ' ').trim() ?? '',
      })),
    }));
  const minor = result.violations.filter(v => !BLOCKING_IMPACTS.includes(v.impact ?? ''));
  console.log(`[a11y] ${label}: blocking=${blocking.length} minor=${minor.length}`);
  for (const v of blocking) {
    console.log(`  ✗ [${v.impact}] ${v.id} — ${v.description} (${v.nodes.length} 处)`);
    for (const n of v.nodes) {
      console.log(`      ${n.target.join(' ')} ${n.summary}`);
    }
  }
  return blocking;
}

async function openApp(page: Page) {
  await page.goto(meta.baseURL);
  await expect(page.getByTestId('post-list')).toBeVisible();
  await expect(page.getByTestId('post-list-item')).toHaveCount(FIXTURE_POSTS.length);
}

async function selectPost(page: Page, title: string) {
  await page
    .getByTestId('post-list-item')
    .filter({ hasText: title })
    .locator('.post-item-title')
    .click();
  await expect(page.locator('.current-post-title')).toHaveText(title);
}

test('主壳与配图区无 critical/serious 级无障碍违规', async ({ page }) => {
  await openApp(page);
  await selectPost(page, 'Alpha 封面文章');
  const violations = await audit(page, '主壳 + 配图区');
  if (!REPORT_ONLY) expect(violations).toEqual([]);
});

test('手动外链弹窗无 critical/serious 级无障碍违规', async ({ page }) => {
  await openApp(page);
  await selectPost(page, 'Beta 纯净文章');
  await page.getByTestId('manual-url-button').click();
  await expect(page.getByTestId('manual-url-input')).toBeVisible();
  const violations = await audit(page, '手动外链弹窗');
  if (!REPORT_ONLY) expect(violations).toEqual([]);
});

test('覆盖确认弹窗无 critical/serious 级无障碍违规', async ({ page }) => {
  await openApp(page);
  await selectPost(page, 'Alpha 封面文章');
  await page.getByTestId('manual-url-button').click();
  await page.getByTestId('manual-url-input').fill('https://cdn.e2e.test/alpha-override.jpg');
  await page.getByTestId('apply-all-button').click();
  await expect(page.getByTestId('confirm-button')).toBeVisible();
  const violations = await audit(page, '覆盖确认弹窗');
  if (!REPORT_ONLY) expect(violations).toEqual([]);
});

test('设置弹窗（体检 Tab）无 critical/serious 级无障碍违规', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: '打开偏好设置' }).click();
  await page.getByTestId('settings-tab-doctor').click();
  await expect(page.getByText('只读自检诊断').first()).toBeVisible();
  const violations = await audit(page, '设置弹窗 · 体检');
  if (!REPORT_ONLY) expect(violations).toEqual([]);
});

test('命令面板无 critical/serious 级无障碍违规', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Meta+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  const violations = await audit(page, '命令面板');
  if (!REPORT_ONLY) expect(violations).toEqual([]);
});

test('文档语言与界面语言一致（中文界面应为 zh-CN）', async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('zh-CN');
  // 基准路径：夹具博文的封面域名
  expect(POST_BY_TITLE['Alpha 封面文章']).toContain('alpha.md');
});
