/** 图库 / 图片域 API：CoverProvider 注册表、Unsplash-Wallhaven 检索、SVG 文本修复与单张预检。 */
import { CoverCandidate, GalleryProvider, ImageCheckResult, Photo } from '../types';
import { apiFetch } from './http';

/** 拉取已注册的封面图片来源清单（来源 Tab 动态渲染）。 */
export async function fetchGalleryProviders(): Promise<GalleryProvider[]> {
  const res = await apiFetch('/api/gallery/providers');
  const data = await res.json();
  return data.providers || [];
}

/**
 * 通过 CoverProvider 注册表按 ID 检索候选封面图。
 * 返回值统一归一化为前端 Photo 形状，便于画廊 / 卡片直接渲染。
 */
export async function searchGalleryProvider(params: {
  provider: string;
  query: string;
  orientation?: string;
  size?: string;
  page?: number;
  pattern?: string;
  theme?: string;
  perline?: number;
  signal?: AbortSignal;
}): Promise<{ results: Photo[]; total: number; kind: string }> {
  const { provider, query, orientation, size, page, pattern, theme, perline, signal } = params;
  const qs = new URLSearchParams();
  qs.set('query', query);
  if (orientation) qs.set('orientation', orientation);
  if (size) qs.set('size', size);
  if (page && page > 1) qs.set('page', String(page));
  if (pattern) qs.set('pattern', pattern);
  if (theme) qs.set('theme', theme);
  if (perline && perline > 0) qs.set('perline', String(perline));

  const res = await apiFetch(`/api/gallery/provider/${encodeURIComponent(provider)}/search?${qs.toString()}`, { signal });
  const data = await res.json();
  const candidates: CoverCandidate[] = data.results || [];
  return {
    results: candidates.map(candidateToPhoto),
    total: data.total ?? candidates.length,
    kind: data.kind || '',
  };
}

/** CoverCandidate → Photo 形状归一化（注册表路径与旧 Unsplash 路径渲染统一）。 */
export function candidateToPhoto(c: CoverCandidate): Photo {
  const meta = c.meta || {};
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  return {
    id: str(meta.id) || c.url,
    width: c.width,
    height: c.height,
    description: str(meta.description),
    alt_description: str(meta.alt_description),
    source: c.source_id || c.url,
    urls: {
      raw: c.url,
      full: c.url,
      regular: c.url,
      small: c.thumbnail || c.url,
      thumb: c.thumbnail || c.url,
    },
    user: { name: c.author || '', username: '', link: '' },
  };
}

export async function searchPhotos(params: {
  query: string;
  page: number;
  source: string;
  orientation: string;
  size: string;
  signal?: AbortSignal;
}): Promise<{ results: Photo[]; total: number; total_pages: number }> {
  const { query, page, source, orientation, size, signal } = params;
  const url = `/api/unsplash/search?q=${encodeURIComponent(query)}&page=${page}&source=${source}&orientation=${encodeURIComponent(orientation)}&size=${encodeURIComponent(size)}`;
  const res = await apiFetch(url, { signal });
  return res.json();
}

/**
 * 拉取图片原始文本（SVG 矢量修复专用）：
 * 直连受 CORS / 防盗链限制时，回退到本地图像代理转发。
 * 返回 null 表示所有路径均不可用。
 */
export async function fetchImageText(url: string): Promise<string | null> {
  const candidates = [url];
  if (/^https?:\/\//i.test(url)) {
    candidates.push(`/api/image/proxy?url=${encodeURIComponent(url)}`);
  }
  for (const target of candidates) {
    try {
      const res = await apiFetch(target);
      if (!res.ok) continue;
      return await res.text();
    } catch {
      // 网络失败 / CORS 拒绝，尝试下一个目标
    }
  }
  return null;
}

// 单张图片健康连通性与防盗链预检
// 仅在确证失效（后端返回 is_broken）时判定破图；网络层异常一律归为 network_error，
// 避免断网/超时把可用图片误标为永久失效。
export async function checkImageHealth(url: string): Promise<ImageCheckResult> {
  try {
    const res = await apiFetch(`/api/image/check?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      return { url, ok: false, status_code: res.status, need_proxy: false, is_broken: false, network_error: true };
    }
    return res.json();
  } catch (e: any) {
    return { url, ok: false, status_code: 0, need_proxy: false, is_broken: false, network_error: true, error: e?.message };
  }
}
