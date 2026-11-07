/** Hexo 域 API：本地服务生命周期、生成/清理/部署与 Git 状态。 */
import { GitFileStatus, HexoStatus } from '../types';
import { apiFetch } from './http';

export async function getHexoStatus(): Promise<HexoStatus> {
  const res = await apiFetch('/api/hexo/status');
  return res.json();
}

export async function startHexoServer(
  port = 4000
): Promise<{ success: boolean; message?: string; status?: HexoStatus; error?: string }> {
  try {
    // 服务拉起依赖本地进程与端口就绪，关闭默认超时等待
    const res = await apiFetch('/api/hexo/server/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port }),
      timeout: 0,
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || `HTTP 错误 ${res.status}` };
    }
    return data;
  } catch (e: any) {
    return { success: false, error: e?.message || '网络连接失败' };
  }
}

export async function stopHexoServer(): Promise<{ success: boolean; status?: HexoStatus }> {
  const res = await apiFetch('/api/hexo/server/stop', { method: 'POST', timeout: 0 });
  return res.json();
}

export async function runHexoGenerate(): Promise<{ success: boolean; duration?: string; output?: string; error?: string }> {
  // Hexo 生成 / 部署可能持续较久，关闭默认超时
  const res = await apiFetch('/api/hexo/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ watch: false }),
    timeout: 0,
  });
  return res.json();
}

export async function runHexoClean(): Promise<{ success: boolean; duration?: string; error?: string }> {
  const res = await apiFetch('/api/hexo/clean', { method: 'POST', timeout: 0 });
  return res.json();
}

export async function getGitStatus(): Promise<{ success: boolean; clean: boolean; files: GitFileStatus[]; error?: string }> {
  try {
    const res = await apiFetch('/api/hexo/git/status');
    return res.json();
  } catch (e: any) {
    return { success: false, clean: false, files: [], error: e?.message || '获取 Git 状态失败' };
  }
}

export async function runHexoDeploy(opts?: {
  mode?: 'git' | 'hexo';
  commit_message?: string;
  files?: string[];
}): Promise<{ success: boolean; duration?: string; output?: string; error?: string }> {
  // 部署可能伴随大体积 git push / hexo deploy，关闭默认超时
  const res = await apiFetch('/api/hexo/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts || {}),
    timeout: 0,
  });
  return res.json();
}
