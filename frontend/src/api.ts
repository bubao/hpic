import { Config, FavoriteItem, GitFileStatus, HealthCheckResult, HealthProgressEvent, HexoStatus, ImageCheckResult, LegacyCheckResult, Photo, PostInfo, SelectDirectoryResult, TagStat, VersionInfo, OperationRecord, DEFAULT_APP_VERSION } from './types';

export type VersionMismatchCallback = (newVersion: string, currentVersion: string) => void;

const versionMismatchCallbacks = new Set<VersionMismatchCallback>();
let lastNotifiedVersion: string | null = null;

export function normalizeVersion(v?: string | null): string {
  if (!v) return '';
  return v.trim().replace(/^v/i, '');
}

export function isVersionMismatch(backendVersion: string, frontendVersion: string = DEFAULT_APP_VERSION): boolean {
  const cleanBackend = normalizeVersion(backendVersion);
  const cleanFrontend = normalizeVersion(frontendVersion);
  if (!cleanBackend || !cleanFrontend) return false;
  return cleanBackend !== cleanFrontend;
}

export function notifyVersionMismatch(newVersion: string, currentVersion: string = DEFAULT_APP_VERSION): void {
  const cleanNew = normalizeVersion(newVersion);
  if (lastNotifiedVersion === cleanNew) {
    return;
  }
  lastNotifiedVersion = cleanNew;

  for (const cb of versionMismatchCallbacks) {
    try {
      cb(newVersion, currentVersion);
    } catch (e) {
      console.error('Error in version mismatch callback:', e);
    }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent('hpic:version-mismatch', {
        detail: { newVersion, currentVersion },
      })
    );
  }
}

export function onVersionMismatch(callback: VersionMismatchCallback): () => void {
  versionMismatchCallbacks.add(callback);
  return () => {
    versionMismatchCallbacks.delete(callback);
  };
}

export function resetVersionMismatchState(): void {
  lastNotifiedVersion = null;
  versionMismatchCallbacks.clear();
}

export function checkResponseVersion(response: Response): void {
  try {
    const versionHeader = response.headers?.get('X-Hpic-Version') || response.headers?.get('x-hpic-version');
    if (versionHeader && isVersionMismatch(versionHeader, DEFAULT_APP_VERSION)) {
      notifyVersionMismatch(versionHeader, DEFAULT_APP_VERSION);
    }
  } catch {
    // 忽略异常
  }
}

async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  checkResponseVersion(res);
  return res;
}

export const api = {
  // 版本契约与裂隙防护监听
  onVersionMismatch,
  normalizeVersion,
  isVersionMismatch,
  notifyVersionMismatch,
  resetVersionMismatchState,
  checkResponseVersion,

  // 配置
  getConfig: async (): Promise<Config> => {
    const res = await apiFetch('/api/config');
    return res.json();
  },
  saveConfig: async (cfg: Partial<Config>): Promise<{ success: boolean; config: Config; error?: string }> => {
    const res = await apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return res.json();
  },
  checkLegacyConfig: async (): Promise<LegacyCheckResult> => {
    const res = await apiFetch('/api/config/check-legacy');
    return res.json();
  },
  migrateLegacyConfig: async (backupOld = true): Promise<{ success: boolean; migrated_files: string[]; backup_files: string[]; target_dir: string; error?: string }> => {
    const res = await apiFetch('/api/config/migrate-legacy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup_legacy: backupOld }),
    });
    return res.json();
  },
  selectDirectory: async (prompt = '选择 Hexo 博客根目录', initialDir = ''): Promise<SelectDirectoryResult> => {
    const res = await apiFetch('/api/system/select-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, initial_dir: initialDir }),
    });
    return res.json();
  },
  testProxy: async (proxy: string): Promise<{ success: boolean; message?: string; latency_ms?: number; error?: string }> => {
    const res = await apiFetch('/api/config/proxy-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy }),
    });
    return res.json();
  },

  // 文章
  getPosts: async (query = '', sort = 'date_desc'): Promise<{ posts: PostInfo[]; total: number; last_modified?: number }> => {
    const res = await apiFetch(`/api/posts?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`);
    return res.json();
  },
  getPostsStatus: async (dir?: string): Promise<{ success?: boolean; last_modified: number; count: number }> => {
    const url = dir ? `/api/posts/status?dir=${encodeURIComponent(dir)}` : '/api/posts/status';
    const res = await apiFetch(url);
    return res.json();
  },
  getPost: async (path: string): Promise<PostInfo> => {
    const res = await apiFetch(`/api/post?path=${encodeURIComponent(path)}`);
    return res.json();
  },
  createPost: async (payload: {
    title: string;
    file_name?: string;
    categories?: string;
    tags?: string;
    is_draft?: boolean;
  }): Promise<{ success: boolean; post?: PostInfo; error?: string }> => {
    const res = await apiFetch('/api/post/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  updatePost: async (payload: {
    file_path: string;
    raw_url?: string;
    apply_fields?: string[];
    clear_fields?: string[];
    updates?: Record<string, string>;
  }): Promise<{ success: boolean; post?: PostInfo; error?: string }> => {
    const res = await apiFetch('/api/post/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  insertPostImage: async (payload: {
    file_path: string;
    image_url: string;
    title: string;
  }): Promise<{ success: boolean; post?: PostInfo; markdown?: string; error?: string }> => {
    const res = await apiFetch('/api/post/insert-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  undoPostOperation: async (filePath: string, logId?: number): Promise<{
    success: boolean;
    post?: PostInfo;
    operation?: OperationRecord;
    error?: string;
  }> => {
    const res = await apiFetch('/api/post/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath, log_id: logId }),
    });
    return res.json();
  },
  getPostHistory: async (filePath: string): Promise<{
    success: boolean;
    history: OperationRecord[];
    error?: string;
  }> => {
    const res = await apiFetch(`/api/post/history?file_path=${encodeURIComponent(filePath)}`);
    return res.json();
  },

  // 封面健康检查 (404 检测)
  checkHealth: async (): Promise<HealthCheckResult> => {
    const res = await apiFetch('/api/posts/health-check');
    return res.json();
  },

  // 封面流式健康体检 (支持实时逐张动态进度与失效回调)
  checkHealthStream: (
    onProgress: (evt: HealthProgressEvent) => void,
    signal?: AbortSignal
  ): Promise<HealthCheckResult> => {
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

      if (signal) {
        signal.addEventListener('abort', () => {
          eventSource.close();
          reject(new Error('体检已取消'));
        });
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
            eventSource.close();
            reject(new Error(data.error || '体检异常'));
          }
        } catch {
          // ignore
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (!isCompleted) {
          reject(new Error('体检连接中断'));
        }
      };
    });
  },

  // 图片搜索
  searchPhotos: async (params: {
    query: string;
    page: number;
    source: string;
    orientation: string;
    size: string;
    signal?: AbortSignal;
  }): Promise<{ results: Photo[]; total: number; total_pages: number }> => {
    const { query, page, source, orientation, size, signal } = params;
    const url = `/api/unsplash/search?q=${encodeURIComponent(query)}&page=${page}&source=${source}&orientation=${encodeURIComponent(orientation)}&size=${encodeURIComponent(size)}`;
    const res = await apiFetch(url, { signal });
    return res.json();
  },

  // 收藏夹
  getFavorites: async (tag = '', query = ''): Promise<{ items: FavoriteItem[]; tags: TagStat[]; total: number }> => {
    const res = await apiFetch(`/api/favorites?tag=${encodeURIComponent(tag)}&q=${encodeURIComponent(query)}`);
    return res.json();
  },
  addFavorite: async (item: Partial<FavoriteItem>): Promise<{ success: boolean; item?: FavoriteItem }> => {
    const res = await apiFetch('/api/favorites/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return res.json();
  },
  removeFavorite: async (idOrUrl: string): Promise<{ success: boolean }> => {
    const res = await apiFetch('/api/favorites/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idOrUrl, url: idOrUrl }),
    });
    return res.json();
  },
  updateFavoriteTags: async (id: string, tags: string[]): Promise<{ success: boolean }> => {
    const res = await apiFetch('/api/favorites/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags }),
    });
    return res.json();
  },

  // Hexo 操作
  getHexoStatus: async (): Promise<HexoStatus> => {
    const res = await apiFetch('/api/hexo/status');
    return res.json();
  },
  startHexoServer: async (port = 4000): Promise<{ success: boolean; message?: string; status?: HexoStatus; error?: string }> => {
    try {
      const res = await apiFetch('/api/hexo/server/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `HTTP 错误 ${res.status}` };
      }
      return data;
    } catch (e: any) {
      return { success: false, error: e?.message || '网络连接失败' };
    }
  },
  stopHexoServer: async (): Promise<{ success: boolean; status?: HexoStatus }> => {
    const res = await apiFetch('/api/hexo/server/stop', { method: 'POST' });
    return res.json();
  },
  runHexoGenerate: async (): Promise<{ success: boolean; duration?: string; output?: string; error?: string }> => {
    const res = await apiFetch('/api/hexo/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watch: false }),
    });
    return res.json();
  },
  runHexoClean: async (): Promise<{ success: boolean; duration?: string; error?: string }> => {
    const res = await apiFetch('/api/hexo/clean', { method: 'POST' });
    return res.json();
  },
  getGitStatus: async (): Promise<{ success: boolean; clean: boolean; files: GitFileStatus[]; error?: string }> => {
    try {
      const res = await apiFetch('/api/hexo/git/status');
      return res.json();
    } catch (e: any) {
      return { success: false, clean: false, files: [], error: e?.message || '获取 Git 状态失败' };
    }
  },
  runHexoDeploy: async (opts?: {
    mode?: 'git' | 'hexo';
    commit_message?: string;
    files?: string[];
  }): Promise<{ success: boolean; duration?: string; output?: string; error?: string }> => {
    const res = await apiFetch('/api/hexo/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts || {}),
    });
    return res.json();
  },

  // 系统打开外部链接 (通过后端调用操作系统默认浏览器，或前端降级处理)
  openSystemURL: (url: string) => {
    let target = (url || '').trim();
    if (!target) return;

    if (target.startsWith('/')) {
      target = window.location.origin + target;
    }

    if (target.startsWith('data:image')) {
      const win = window.open('');
      if (win) {
        win.document.write(`<body style="margin:0;background:#0d1117;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${target}" style="max-width:95vw;max-height:95vh;object-fit:contain;box-shadow:0 8px 24px rgba(0,0,0,0.5);border-radius:8px;" /></body>`);
      }
      return;
    }

    apiFetch('/api/system/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target }),
    }).catch(() => {
      window.open(target, '_blank');
    });
  },

  // 版本检测与在线升级
  checkVersion: async (): Promise<VersionInfo> => {
    const res = await apiFetch('/api/version/check');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  upgradeVersion: async (): Promise<{ success: boolean; download_url?: string; message?: string }> => {
    const res = await apiFetch('/api/version/upgrade', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  installVersion: async (): Promise<{ success: boolean; message: string; new_version?: string; already_latest?: boolean }> => {
    const res = await apiFetch('/api/version/install', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },
  getChangelog: async (): Promise<{ success: boolean; changelog: string; version: string }> => {
    const res = await apiFetch('/api/version/changelog');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  },

  // 单张图片健康连通性与防盗链预检
  checkImageHealth: async (url: string): Promise<ImageCheckResult> => {
    try {
      const res = await apiFetch(`/api/image/check?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        return { url, ok: false, status_code: res.status, need_proxy: false, is_broken: true };
      }
      return res.json();
    } catch (e: any) {
      return { url, ok: false, status_code: 0, need_proxy: false, is_broken: true, error: e?.message };
    }
  },
};
