/** 文章域 API：列表 / 详情 / 变更与历史版本，以及全站封面健康探针。 */
import {
  HealthCheckResult,
  HealthProgressEvent,
  OperationRecord,
  PostInfo,
} from '../types';
import { apiFetch } from './http';

export async function getPosts(
  query = '',
  sort = 'date_desc'
): Promise<{ posts: PostInfo[]; total: number; last_modified?: number }> {
  const res = await apiFetch(`/api/posts?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`);
  if (!res.ok) throw new Error(`获取文章列表失败 (HTTP ${res.status})`);
  return res.json();
}

export async function getPostsStatus(dir?: string): Promise<{ success?: boolean; last_modified: number; count: number }> {
  const url = dir ? `/api/posts/status?dir=${encodeURIComponent(dir)}` : '/api/posts/status';
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`获取文章状态失败 (HTTP ${res.status})`);
  return res.json();
}

export async function getPost(path: string): Promise<PostInfo> {
  const res = await apiFetch(`/api/post?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(`获取文章详情失败 (HTTP ${res.status})`);
  return res.json();
}

export async function createPost(payload: {
  title: string;
  file_name?: string;
  categories?: string;
  tags?: string;
  is_draft?: boolean;
}): Promise<{ success: boolean; post?: PostInfo; error?: string }> {
  const res = await apiFetch('/api/post/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updatePost(payload: {
  file_path: string;
  raw_url?: string;
  apply_fields?: string[];
  clear_fields?: string[];
  updates?: Record<string, string>;
}): Promise<{ success: boolean; post?: PostInfo; error?: string }> {
  const res = await apiFetch('/api/post/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function insertPostImage(payload: {
  file_path: string;
  image_url: string;
  title: string;
}): Promise<{ success: boolean; post?: PostInfo; markdown?: string; error?: string }> {
  // 涉及到远端图片下载落盘，关闭默认 10s 超时避免大图被误掐断
  const res = await apiFetch('/api/post/insert-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 0,
  });
  return res.json();
}

export async function undoPostOperation(
  filePath: string,
  logId?: number
): Promise<{
  success: boolean;
  post?: PostInfo;
  operation?: OperationRecord;
  error?: string;
}> {
  const res = await apiFetch('/api/post/undo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath, log_id: logId }),
  });
  return res.json();
}

export async function getPostHistory(filePath: string): Promise<{
  success: boolean;
  history: OperationRecord[];
  error?: string;
}> {
  const res = await apiFetch(`/api/post/history?file_path=${encodeURIComponent(filePath)}`);
  if (!res.ok) throw new Error(`获取历史版本失败 (HTTP ${res.status})`);
  return res.json();
}

/** 拉取全部文章的操作历史（全局操作历史面板，新→旧）。 */
export async function getGlobalHistory(limit = 100): Promise<{
  success: boolean;
  history: OperationRecord[];
  error?: string;
}> {
  const res = await apiFetch(`/api/history?limit=${encodeURIComponent(limit)}`);
  if (!res.ok) throw new Error(`获取全局操作历史失败 (HTTP ${res.status})`);
  return res.json();
}

export async function deletePostHistory(id: number): Promise<{ success: boolean; error?: string }> {
  const res = await apiFetch('/api/post/history/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`删除历史记录失败 (HTTP ${res.status})`);
  return res.json();
}

export async function clearPostHistory(filePath: string): Promise<{ success: boolean; error?: string }> {
  const res = await apiFetch('/api/post/history/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath }),
  });
  if (!res.ok) throw new Error(`清空历史记录失败 (HTTP ${res.status})`);
  return res.json();
}

// 封面健康检查 (404 检测)
export async function checkHealth(): Promise<HealthCheckResult> {
  // 全站逐张探测耗时不确定，关闭默认超时避免误中断
  const res = await apiFetch('/api/posts/health-check', { timeout: 0 });
  if (!res.ok) throw new Error(`健康检查失败 (HTTP ${res.status})`);
  return res.json();
}

// 封面流式健康体检 (支持实时逐张动态进度与失效回调)
export function checkHealthStream(
  onProgress: (evt: HealthProgressEvent) => void,
  signal?: AbortSignal
): Promise<HealthCheckResult> {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource('/api/posts/health-check/stream');
    let isCompleted = false;

    let finalResult: HealthCheckResult = {
      total_posts: 0,
      total_images: 0,
      healthy_images: 0,
      broken_count: 0,
      broken_reports: [],
      duration: '0s',
    };

    const handleAbort = () => {
      cleanup();
      eventSource.close();
      reject(new Error('体检已取消'));
    };
    // 无论以何种方式结束，都移除 abort 监听，避免控制器复用时监听器泄漏
    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
    };
    if (signal) {
      signal.addEventListener('abort', handleAbort);
    }

    eventSource.onmessage = (e) => {
      try {
        const data: HealthProgressEvent = JSON.parse(e.data);
        onProgress(data);
        if (data.type === 'progress' || data.type === 'start') {
          finalResult.total_posts = data.total_posts;
          finalResult.total_images = data.total_images;
          finalResult.healthy_images = data.healthy_images;
          finalResult.broken_count = data.broken_count;
        } else if (data.type === 'done') {
          isCompleted = true;
          cleanup();
          eventSource.close();
          finalResult = {
            total_posts: data.total_posts,
            total_images: data.total_images,
            healthy_images: data.healthy_images,
            broken_count: data.broken_count,
            broken_reports: data.broken_reports || [],
            duration: data.duration || '',
          };
          resolve(finalResult);
        } else if (data.type === 'error') {
          isCompleted = true;
          cleanup();
          eventSource.close();
          reject(new Error(data.error || '体检异常'));
        }
      } catch {
        // ignore
      }
    };

    eventSource.onerror = () => {
      cleanup();
      eventSource.close();
      if (!isCompleted) {
        reject(new Error('体检连接中断'));
      }
    };
  });
}
