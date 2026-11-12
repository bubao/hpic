/**
 * Playwright 全局引导：
 * 1. 重建隔离的 Hexo 夹具博客与配置目录；
 * 2. 构建当前源码对应的前端产物（web/）与 E2E 后端二进制；
 * 3. 启动真实后端服务并等待其就绪，把运行时信息写入 meta.json 供用例读取；
 * 4. 返回的函数作为 globalTeardown 负责回收子进程。
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  FRONTEND_DIR,
  REPO_ROOT,
  WORK_DIR,
  META_PATH,
  type E2eMeta,
  prepareFixture,
} from './fixtures';

const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const STEP_TIMEOUT_MS = 600_000;

function runStep(command: string, args: string[], cwd: string): void {
  execFileSync(command, args, { cwd, stdio: 'inherit', timeout: STEP_TIMEOUT_MS });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const { blogDir, configDir } = prepareFixture();

  // 1. 前端产物必须来自当前源码，否则 E2E 只是在验证一份陈旧构建
  runStep(NPM, ['run', 'build'], FRONTEND_DIR);

  // 2. 构建 E2E 后端（复用 api.NewServer 的完整路由，绑定随机端口）
  const binary = path.join(WORK_DIR, 'bin', 'hpic-e2e-server');
  fs.mkdirSync(path.dirname(binary), { recursive: true });
  runStep('go', ['build', '-o', binary, './frontend/e2e/server'], REPO_ROOT);

  const pkg = JSON.parse(fs.readFileSync(path.join(FRONTEND_DIR, 'package.json'), 'utf8')) as {
    version: string;
  };

  // 3. 启动服务：HPIC_CONFIG_DIR 把数据库与收藏夹隔离到临时目录，
  //    避免污染开发者的真实 ~/.config/hpic。
  const child = spawn(
    binary,
    [
      '-web',
      path.join(REPO_ROOT, 'web'),
      '-hexo',
      blogDir,
      '-cover-fields',
      'index_img,banner_img',
      '-version',
      pkg.version,
    ],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, HPIC_CONFIG_DIR: configDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const baseURL = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('e2e-server 启动超时（60s）'));
    }, 60_000);

    let buf = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const matched = buf.match(/HPIC_E2E_URL=(http:\/\/\S+)/);
      if (matched) {
        clearTimeout(timer);
        resolve(matched[1]);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(`[e2e-server] ${chunk.toString()}`);
    });
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`e2e-server 在就绪前退出 (exit=${code})`));
    });
  });

  const meta: E2eMeta = {
    baseURL,
    workDir: WORK_DIR,
    blogDir,
    configDir,
    postsDir: path.join(blogDir, 'source', '_posts'),
    draftsDir: path.join(blogDir, 'source', '_drafts'),
    binary,
    version: pkg.version,
  };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2), 'utf8');

  // 4. 返回 teardown：Playwright 支持 globalSetup 返回清理函数
  return async function globalTeardown(): Promise<void> {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 5_000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  };
}
