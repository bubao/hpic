/**
 * E2E 测试工作区与夹具（fixture）定义。
 *
 * 夹具是一个最小可用的 Hexo 博客：包含 _config.yml、两篇正式文章与一篇草稿，
 * 用于驱动「选文章 → 应用封面 → 校验落盘 → 撤销恢复」主流程。
 * 测试进程（Node 侧）与 Go 后端读写的是同一份文件，因此可以直接断言磁盘内容，
 * 形成真正的端到端闭环。
 */
import fs from 'node:fs';
import path from 'node:path';

/** Playwright 从 frontend/ 目录启动，据此推导仓库根目录 */
export const FRONTEND_DIR = process.cwd();
export const REPO_ROOT = path.resolve(FRONTEND_DIR, '..');
export const E2E_DIR = path.join(FRONTEND_DIR, 'e2e');

/** 每次运行都会被重建的临时工作区 */
export const WORK_DIR = path.join(E2E_DIR, '.work');
export const META_PATH = path.join(WORK_DIR, 'meta.json');

export interface E2eMeta {
  baseURL: string;
  workDir: string;
  blogDir: string;
  configDir: string;
  postsDir: string;
  draftsDir: string;
  binary: string;
  version: string;
}

/** 夹具文章：relPath 相对 Hexo 根目录 */
export interface FixturePost {
  relPath: string;
  content: string;
}

const FM = (fields: Record<string, string>, body: string) => {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
};

export const FIXTURE_POSTS: FixturePost[] = [
  {
    relPath: 'source/_posts/alpha.md',
    content: FM(
      {
        title: 'Alpha 封面文章',
        date: '2026-01-01 10:00:00',
        categories: 'E2E 测试',
        tags: '[e2e, alpha]',
        index_img: 'https://cdn.e2e.test/alpha-original.jpg',
      },
      'Alpha 正文，用于验证已有封面被覆盖的流程。',
    ),
  },
  {
    relPath: 'source/_posts/beta.md',
    content: FM(
      {
        title: 'Beta 纯净文章',
        date: '2026-01-02 10:00:00',
        categories: 'E2E 测试',
        tags: '[e2e, beta]',
      },
      'Beta 正文，初始没有任何封面字段。',
    ),
  },
  {
    relPath: 'source/_drafts/gamma.md',
    content: FM(
      {
        title: 'Gamma 本地草稿',
        date: '2026-01-03 10:00:00',
        categories: 'E2E 测试',
        tags: '[e2e, gamma]',
      },
      'Gamma 草稿正文，用于验证草稿目录同样被扫描。',
    ),
  },
];

export const HEXO_CONFIG = 'title: E2E Fixture Blog\nauthor: e2e\n';

/** 文章标题 → 相对路径，便于测试按标题定位 */
export const POST_BY_TITLE: Record<string, string> = Object.fromEntries(
  FIXTURE_POSTS.map(p => {
    const title = p.content.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? '';
    return [title, p.relPath];
  }),
);

/**
 * 重建整个夹具目录，确保每个测试都从已知的初始状态出发。
 * 返回 Hexo 根目录与隔离配置目录。
 */
export function prepareFixture(): { blogDir: string; configDir: string } {
  fs.rmSync(WORK_DIR, { recursive: true, force: true });

  const blogDir = path.join(WORK_DIR, 'blog');
  const configDir = path.join(WORK_DIR, 'config');
  fs.mkdirSync(configDir, { recursive: true });

  for (const post of FIXTURE_POSTS) {
    const abs = path.join(blogDir, post.relPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, post.content, 'utf8');
  }
  fs.writeFileSync(path.join(blogDir, '_config.yml'), HEXO_CONFIG, 'utf8');

  return { blogDir, configDir };
}

/** 读取夹具文章内容（用于断言后端是否真的落盘） */
export function readFixturePost(blogDir: string, relPath: string): string {
  return fs.readFileSync(path.join(blogDir, relPath), 'utf8');
}

/** 强制重置某一篇文章的内容（测试内做用例级准备） */
export function writeFixturePost(blogDir: string, relPath: string, content: string): void {
  fs.writeFileSync(path.join(blogDir, relPath), content, 'utf8');
}

/** 读取 globalSetup 写入的运行时元数据 */
export function readMeta(): E2eMeta {
  return JSON.parse(fs.readFileSync(META_PATH, 'utf8')) as E2eMeta;
}
