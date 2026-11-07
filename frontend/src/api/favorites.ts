/** 收藏域 API：收藏项增删与标签维护。 */
import { FavoriteItem, TagStat } from '../types';
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
