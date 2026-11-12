/**
 * 配图主流程端到端用例。
 *
 * 覆盖：夹具博文加载与选择 → 侧边栏关键词过滤 → 手动外链一键设封面（含落盘断言）
 * → 覆盖已有封面的二次确认 → 撤销回写 → 关键词检索配图并应用单字段 → 收藏。
 *
 * 外部图片源（Unsplash / Wallhaven）需要真实网络与 API Key，因此在浏览器层用
 * page.route 拦截检索端点，返回固定夹具数据；其余所有链路（Go 后端、SQLite、
 * 前端构建产物、磁盘文件读写）均为真实实现。
 */
import { expect, test, type Page } from '@playwright/test';
import {
  FIXTURE_POSTS,
  POST_BY_TITLE,
  readFixturePost,
  readMeta,
  writeFixturePost,
  type E2eMeta,
} from '../fixtures';

let meta: E2eMeta;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  meta = readMeta();
});

// 用例共享同一份夹具博客，逐个用例重置，保证彼此互不影响
test.beforeEach(() => {
  for (const post of FIXTURE_POSTS) {
    writeFixturePost(meta.blogDir, post.relPath, post.content);
  }
});

/** 打开应用并等待文章列表渲染完成 */
async function openApp(page: Page): Promise<void> {
  await page.goto(meta.baseURL);
  await expect(page.getByTestId('post-list')).toBeVisible();
  await expect(page.getByTestId('post-list-item')).toHaveCount(FIXTURE_POSTS.length);
}

/** 在侧边栏选择指定标题的文章，并确认封面区已切换 */
async function selectPost(page: Page, title: string): Promise<void> {
  await page
    .getByTestId('post-list-item')
    .filter({ hasText: title })
    .locator('.post-item-title')
    .click();
  await expect(page.locator('.current-post-title')).toHaveText(title);
}

/** 通过「手动输入外链」把 url 应用到指定封面字段 */
async function applyManualUrl(page: Page, url: string): Promise<void> {
  await page.getByTestId('manual-url-button').click();
  await page.getByTestId('manual-url-input').fill(url);
  await page.getByTestId('apply-all-button').click();
}

/** 拦截外部图片源检索端点，返回两张固定的夹具图片 */
async function mockImageSearch(page: Page): Promise<void> {
  const candidates = [
    {
      id: 'e2e-1',
      width: 1920,
      height: 1080,
      description: 'E2E 检索图一',
      alt_description: 'E2E 检索图一',
      source: 'unsplash',
      urls: {
        raw: 'https://cdn.e2e.test/search-1.jpg',
        full: 'https://cdn.e2e.test/search-1.jpg',
        regular: 'https://cdn.e2e.test/search-1.jpg',
        small: 'https://cdn.e2e.test/search-1-thumb.jpg',
        thumb: 'https://cdn.e2e.test/search-1-thumb.jpg',
      },
      user: { name: 'E2E Author', username: 'e2e', link: '' },
    },
    {
      id: 'e2e-2',
      width: 2400,
      height: 1350,
      description: 'E2E 检索图二',
      alt_description: 'E2E 检索图二',
      source: 'unsplash',
      urls: {
        raw: 'https://cdn.e2e.test/search-2.jpg',
        full: 'https://cdn.e2e.test/search-2.jpg',
        regular: 'https://cdn.e2e.test/search-2.jpg',
        small: 'https://cdn.e2e.test/search-2-thumb.jpg',
        thumb: 'https://cdn.e2e.test/search-2-thumb.jpg',
      },
      user: { name: 'E2E Author', username: 'e2e', link: '' },
    },
  ];

  await page.route('**/api/unsplash/search**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results: candidates, total: candidates.length, total_pages: 1 }),
    }),
  );
}

test('夹具博文完整加载并可下钻选择', async ({ page }) => {
  await openApp(page);

  // date_desc 排序下草稿 Gamma 最新，启动时默认选中第一篇
  await expect(page.locator('.current-post-title')).toHaveText('Gamma 本地草稿');

  await selectPost(page, 'Beta 纯净文章');
  await expect(page.getByTestId('cover-card')).toHaveCount(2);
});

test('侧边栏关键词实时过滤博文列表', async ({ page }) => {
  await openApp(page);

  const search = page.getByTestId('sidebar-search-input');
  await search.fill('Alpha');
  await expect(page.getByTestId('post-list-item')).toHaveCount(1);
  await expect(page.getByTestId('post-list-item')).toContainText('Alpha 封面文章');

  // 清空关键词后恢复全量（输入为 180ms 防抖）
  await search.fill('');
  await expect(page.getByTestId('post-list-item')).toHaveCount(FIXTURE_POSTS.length);
});

test('手动外链一键设为全部封面并真实落盘', async ({ page }) => {
  await openApp(page);
  await selectPost(page, 'Beta 纯净文章');

  const url = 'https://cdn.e2e.test/beta-new-cover.jpg';
  await applyManualUrl(page, url);

  await expect(page.getByTestId('toast-container')).toContainText('封面已成功更新');

  const content = readFixturePost(meta.blogDir, POST_BY_TITLE['Beta 纯净文章']);
  expect(content).toContain(`index_img: ${url}`);
  expect(content).toContain(`banner_img: ${url}`);

  // 封面区两个字段卡片都应进入「已配置」态（不再显示空占位提示）
  await expect(page.locator('[data-testid="cover-card"] .cover-img-placeholder')).toHaveCount(0);
});

test('覆盖已有封面时弹出二次确认，取消不写入、确认才写入', async ({ page }) => {
  await openApp(page);
  await selectPost(page, 'Alpha 封面文章');

  const url = 'https://cdn.e2e.test/alpha-override.jpg';
  const relPath = POST_BY_TITLE['Alpha 封面文章'];

  // 第一次：取消覆盖，磁盘内容必须保持原样
  await applyManualUrl(page, url);
  await expect(page.getByTestId('confirm-button')).toBeVisible();
  await page.getByTestId('cancel-button').click();
  expect(readFixturePost(meta.blogDir, relPath)).toContain('alpha-original.jpg');

  // 第二次：确认覆盖
  await applyManualUrl(page, url);
  await expect(page.getByTestId('confirm-button')).toBeVisible();
  await page.getByTestId('confirm-button').click();
  await expect(page.getByTestId('toast-container')).toContainText('封面已成功更新');

  const content = readFixturePost(meta.blogDir, relPath);
  expect(content).toContain(url);
  expect(content).not.toContain('alpha-original.jpg');
});

test('撤销最近一次封面变更并回写磁盘', async ({ page }) => {
  await openApp(page);
  await selectPost(page, 'Beta 纯净文章');

  const url = 'https://cdn.e2e.test/beta-undo.jpg';
  const relPath = POST_BY_TITLE['Beta 纯净文章'];

  await applyManualUrl(page, url);
  await expect(page.getByTestId('toast-container')).toContainText('封面已成功更新');
  expect(readFixturePost(meta.blogDir, relPath)).toContain(url);

  const undoButton = page.getByTestId('cover-undo-button');
  await expect(undoButton).toBeEnabled();
  await undoButton.click();
  await expect(page.getByTestId('toast-container')).toContainText('已成功撤销上一步操作');

  expect(readFixturePost(meta.blogDir, relPath)).not.toContain(url);
});

test('关键词检索配图并仅应用单个封面字段', async ({ page }) => {
  await mockImageSearch(page);
  await openApp(page);
  await selectPost(page, 'Beta 纯净文章');

  await page.getByTestId('gallery-search-input').fill('mountain');
  await page.getByTestId('gallery-search-submit').click();

  const cards = page.getByTestId('gallery-card');
  await expect(cards).toHaveCount(2);

  const targetUrl = 'https://cdn.e2e.test/search-1.jpg';
  await cards
    .first()
    .locator('[data-testid="apply-field-button"][data-field="banner_img"]')
    .click();

  await expect(page.getByTestId('toast-container')).toContainText('封面已成功更新');

  const content = readFixturePost(meta.blogDir, POST_BY_TITLE['Beta 纯净文章']);
  expect(content).toContain(`banner_img: ${targetUrl}`);
  expect(content).not.toContain(`index_img: ${targetUrl}`);
});

test('收藏图片后在「我的收藏」中可见', async ({ page }) => {
  await mockImageSearch(page);
  await openApp(page);
  await selectPost(page, 'Beta 纯净文章');

  await page.getByTestId('gallery-search-input').fill('mountain');
  await page.getByTestId('gallery-search-submit').click();

  const cards = page.getByTestId('gallery-card');
  await expect(cards).toHaveCount(2);
  await cards.first().getByTestId('card-favorite-button').click();

  // 星标立即转为激活态（乐观更新）
  await expect(cards.first().getByTestId('card-favorite-button')).toHaveClass(/active/);

  await page.getByTestId('gallery-mode-favorites').click();
  // 检索词在切换 tab 后会作为收藏过滤器复用，先清空再断言收藏结果
  await page.getByTestId('gallery-search-input').fill('');
  // 手动外链用例默认勾选「同时收藏」，因此收藏夹里已有前序用例的条目，
  // 这里断言「包含刚收藏的这一张」而不是精确数量。
  const newCard = page.getByTestId('gallery-card').filter({ hasText: 'E2E 检索图一' });
  await expect(newCard).toHaveCount(1);
});
