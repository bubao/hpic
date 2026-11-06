import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { FavoritesProvider, useFavorites, ToggleFavoriteParams } from './FavoritesContext';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    getFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    updateFavoriteTags: vi.fn(),
  },
}));

describe('FavoritesContext — 乐观更新', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const flushAsync = async () => {
    await act(async () => {
      await new Promise(r => setTimeout(r, 0));
    });
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <FavoritesProvider>{children}</FavoritesProvider>
  );

  it('初始加载并正确获取收藏列表', async () => {
    (api.getFavorites as any).mockResolvedValueOnce({
      items: [
        { url: 'https://example.com/img1.jpg', title: '测试图片', thumb_url: '', tags: [], source: 'web', created_at: '' },
      ],
      tags: [],
      total: 1,
    });

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await flushAsync();

    expect(result.current.favorites).toHaveLength(1);
    expect(result.current.isFavorited('https://example.com/img1.jpg')).toBe(true);
  });

  it('新增收藏通过乐观更新立即生效', async () => {
    (api.getFavorites as any).mockResolvedValueOnce({ items: [], tags: [], total: 0 });

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await flushAsync();

    expect(result.current.favorites).toHaveLength(0);

    // 配置后续调用
    (api.addFavorite as any).mockResolvedValueOnce({ success: true });
    const newItem = { url: 'https://example.com/new.jpg', title: '新图片', thumb_url: '', tags: [], source: 'web', created_at: '' };
    (api.getFavorites as any).mockResolvedValueOnce({ items: [newItem], tags: [], total: 1 });

    let toggleResult = false;
    await act(async () => {
      toggleResult = await result.current.toggleFavorite({ url: 'https://example.com/new.jpg', title: '新图片' });
    });

    expect(toggleResult).toBe(true);
    expect(result.current.isFavorited('https://example.com/new.jpg')).toBe(true);
  });

  it('新增收藏失败时执行正确的状态回滚', async () => {
    (api.getFavorites as any).mockResolvedValueOnce({ items: [], tags: [], total: 0 });

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await flushAsync();

    (api.addFavorite as any).mockResolvedValueOnce({ success: false });
    (api.getFavorites as any).mockResolvedValueOnce({ items: [], tags: [], total: 0 });

    await act(async () => {
      await result.current.toggleFavorite({ url: 'https://example.com/fail.jpg', title: '失败图片' });
    });

    expect(result.current.isFavorited('https://example.com/fail.jpg')).toBe(false);
  });

  it('API 异常导致的网络错误也会触发回滚', async () => {
    (api.getFavorites as any).mockResolvedValueOnce({ items: [], tags: [], total: 0 });

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await flushAsync();

    (api.addFavorite as any).mockRejectedValueOnce(new Error('Network error'));
    (api.getFavorites as any).mockResolvedValueOnce({ items: [], tags: [], total: 0 });

    await act(async () => {
      await result.current.toggleFavorite({ url: 'https://example.com/error.jpg', title: '异常图片' });
    });

    expect(result.current.isFavorited('https://example.com/error.jpg')).toBe(false);
  });
});
