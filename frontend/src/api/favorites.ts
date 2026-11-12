/** 收藏域 API：收藏项增删、标签维护与重复图检测。 */
import { FavoriteItem, FavoriteDuplicatesResponse, TagStat } from '../types';
import { apiFetch } from './http';

export async function getFavorites(
  tag = '',
  query = ''
): Promise<{ items: FavoriteItem[]; tags: TagStat[]; total: number }> {
  const res = await apiFetch(`/api/favorites?tag=${encodeURIComponent(tag)}&q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`获取收藏列表失败 (HTTP ${res.status})`);
  return res.json();
}

export async function addFavorite(
  item: Partial<FavoriteItem>
): Promise<{ success: boolean; item?: FavoriteItem }> {
  const res = await apiFetch('/api/favorites/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  return res.json();
}

export async function removeFavorite(idOrUrl: string): Promise<{ success: boolean }> {
  const res = await apiFetch('/api/favorites/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: idOrUrl, url: idOrUrl }),
  });
  return res.json();
}

export async function updateFavoriteTags(id: string, tags: string[]): Promise<{ success: boolean }> {
  const res = await apiFetch('/api/favorites/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, tags }),
  });
  return res.json();
}

/**
 * 检测收藏夹中视觉重复的图片（服务端 pHash + 汉明距离聚类）。
 * threshold 为汉明距离阈值，缺省 6：同一张图的不同规格通常 ≤ 2，不同图片通常 ≥ 20。
 */
export async function getFavoriteDuplicates(threshold = 6): Promise<FavoriteDuplicatesResponse> {
  const res = await apiFetch(`/api/favorites/duplicates?threshold=${encodeURIComponent(threshold)}`);
  if (!res.ok) throw new Error(`检测重复图片失败 (HTTP ${res.status})`);
  return res.json();
}
