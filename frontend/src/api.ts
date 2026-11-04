import { Config, FavoriteItem, GitFileStatus, HealthCheckResult, HexoStatus, ImageCheckResult, Photo, PostInfo, TagStat, VersionInfo } from './types';

export const api = {
  // 配置
  getConfig: async (): Promise<Config> => {
    const res = await fetch('/api/config');
    return res.json();
  },
  saveConfig: async (cfg: Partial<Config>): Promise<{ success: boolean; config: Config; error?: string }> => {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg),
    });
    return res.json();
  },

  // 文章
  getPosts: async (query = '', sort = 'date_desc'): Promise<{ posts: PostInfo[]; total: number }> => {
    const res = await fetch(`/api/posts?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`);
    return res.json();
  },
  getPost: async (path: string): Promise<PostInfo> => {
    const res = await fetch(`/api/post?path=${encodeURIComponent(path)}`);
    return res.json();
  },
  updatePost: async (payload: {
    file_path: string;
    raw_url?: string;
    apply_fields?: string[];
    clear_fields?: string[];
    updates?: Record<string, string>;
  }): Promise<{ success: boolean; post?: PostInfo; error?: string }> => {
    const res = await fetch('/api/post/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // 封面健康检查 (404 检测)
  checkHealth: async (): Promise<HealthCheckResult> => {
    const res = await fetch('/api/posts/health-check');
    return res.json();
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
    const res = await fetch(url, { signal });
    return res.json();
  },

  // 收藏夹
  getFavorites: async (tag = '', query = ''): Promise<{ items: FavoriteItem[]; tags: TagStat[]; total: number }> => {
    const res = await fetch(`/api/favorites?tag=${encodeURIComponent(tag)}&q=${encodeURIComponent(query)}`);
    return res.json();
  },
  addFavorite: async (item: Partial<FavoriteItem>): Promise<{ success: boolean; item?: FavoriteItem }> => {
    const res = await fetch('/api/favorites/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return res.json();
  },
  removeFavorite: async (idOrUrl: string): Promise<{ success: boolean }> => {
    const res = await fetch('/api/favorites/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: idOrUrl, url: idOrUrl }),
    });
    return res.json();
  },
  updateFavoriteTags: async (id: string, tags: string[]): Promise<{ success: boolean }> => {
    const res = await fetch('/api/favorites/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags }),
    });
    return res.json();
  },

  // Hexo 操作
  getHexoStatus: async (): Promise<HexoStatus> => {
    const res = await fetch('/api/hexo/status');
    return res.json();
  },
  startHexoServer: async (port = 4000): Promise<{ success: boolean; message?: string; status?: HexoStatus; error?: string }> => {
    try {
      const res = await fetch('/api/hexo/server/start', {
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
    const res = await fetch('/api/hexo/server/stop', { method: 'POST' });
    return res.json();
  },
  runHexoGenerate: async (): Promise<{ success: boolean; duration?: string; output?: string; error?: string }> => {
    const res = await fetch('/api/hexo/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watch: false }),
    });
    return res.json();
  },
  runHexoClean: async (): Promise<{ success: boolean; duration?: string; error?: string }> => {
    const res = await fetch('/api/hexo/clean', { method: 'POST' });
    return res.json();
  },
  getGitStatus: async (): Promise<{ success: boolean; clean: boolean; files: GitFileStatus[]; error?: string }> => {
    try {
      const res = await fetch('/api/hexo/git/status');
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
    const res = await fetch('/api/hexo/deploy', {
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

    fetch('/api/system/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target }),
    }).catch(() => {
      window.open(target, '_blank');
    });
  },

  // 版本检测与在线升级
  checkVersion: async (): Promise<VersionInfo> => {
    const res = await fetch('/api/version/check');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  upgradeVersion: async (): Promise<{ success: boolean; download_url?: string; message?: string }> => {
    const res = await fetch('/api/version/upgrade', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  installVersion: async (): Promise<{ success: boolean; message: string; new_version?: string; already_latest?: boolean }> => {
    const res = await fetch('/api/version/install', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },
  getChangelog: async (): Promise<{ success: boolean; changelog: string; version: string }> => {
    const res = await fetch('/api/version/changelog');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  },

  // 单张图片健康连通性与防盗链预检
  checkImageHealth: async (url: string): Promise<ImageCheckResult> => {
    try {
      const res = await fetch(`/api/image/check?url=${encodeURIComponent(url)}`);
      if (!res.ok) {
        return { url, ok: false, status_code: res.status, need_proxy: false, is_broken: true };
      }
      return res.json();
    } catch (e: any) {
      return { url, ok: false, status_code: 0, need_proxy: false, is_broken: true, error: e?.message };
    }
  },
};
