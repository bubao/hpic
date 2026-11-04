import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { FavoriteItem, TagStat, getCanonicalImageKey } from '../types';
import { api } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';

export interface ToggleFavoriteParams {
  url: string;
  title?: string;
  thumbUrl?: string;
  source?: string;
  tags?: string[];
}

export interface FavoritesContextType {
  favorites: FavoriteItem[];
  favoritedUrls: Set<string>;
  favTags: TagStat[];
  isLoading: boolean;
  isFavorited: (url?: string) => boolean;
  toggleFavorite: (item: ToggleFavoriteParams) => Promise<boolean>;
  refreshFavorites: () => Promise<void>;
  updateTags: (id: string, tags: string[]) => Promise<boolean>;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [favTags, setFavTags] = useState<TagStat[]>([]);
  const [favoritedUrls, setFavoritedUrls] = useState<Set<string>>(new Set());
  const [favoritedKeys, setFavoritedKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // 取消收藏确认拦截状态
  const [pendingUnfavItem, setPendingUnfavItem] = useState<ToggleFavoriteParams | null>(null);

  const refreshFavorites = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getFavorites();
      if (res && res.items) {
        setFavorites(res.items);
        setFavTags(res.tags || []);
        const urls = new Set(res.items.map(it => it.url.trim()));
        const keys = new Set(res.items.map(it => getCanonicalImageKey(it.url)));
        setFavoritedUrls(urls);
        setFavoritedKeys(keys);
      }
    } catch (e) {
      console.error('Failed to load favorites:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFavorites();
  }, [refreshFavorites]);

  const isFavorited = useCallback((url?: string): boolean => {
    if (!url) return false;
    const trimmed = url.trim();
    return favoritedUrls.has(trimmed) || favoritedKeys.has(getCanonicalImageKey(trimmed));
  }, [favoritedUrls, favoritedKeys]);

  // 确认取消收藏的底层执行方法
  const executeRemoveFavorite = useCallback(async (rawUrl: string) => {
    const res = await api.removeFavorite(rawUrl);
    if (res && res.success) {
      setFavoritedUrls(prev => {
        const next = new Set(prev);
        next.delete(rawUrl);
        return next;
      });
      setFavoritedKeys(prev => {
        const next = new Set(prev);
        next.delete(getCanonicalImageKey(rawUrl));
        return next;
      });
      setFavorites(prev => prev.filter(f => f.url.trim() !== rawUrl && getCanonicalImageKey(f.url) !== getCanonicalImageKey(rawUrl)));
      refreshFavorites();
    }
    setPendingUnfavItem(null);
  }, [refreshFavorites]);

  // 对外暴露的切换收藏方法：如果是取消收藏，执行友好弹窗拦截！
  const toggleFavorite = useCallback(async (item: ToggleFavoriteParams): Promise<boolean> => {
    const rawUrl = (item.url || '').trim();
    if (!rawUrl) return false;

    const key = getCanonicalImageKey(rawUrl);
    const alreadyFav = favoritedUrls.has(rawUrl) || favoritedKeys.has(key);

    if (alreadyFav) {
      // 触发确认拦截弹窗，防止误触导致收藏数据丢失
      setPendingUnfavItem(item);
      return true;
    } else {
      // 新增收藏：直接保存
      const payload: Partial<FavoriteItem> = {
        url: rawUrl,
        thumb_url: (item.thumbUrl || rawUrl).trim(),
        title: item.title?.trim() || '收藏灵感图片',
        source: item.source || 'web',
        tags: item.tags || [],
      };
      const res = await api.addFavorite(payload);
      if (res && res.success) {
        setFavoritedUrls(prev => new Set(prev).add(rawUrl));
        setFavoritedKeys(prev => new Set(prev).add(key));
        refreshFavorites();
        return true;
      }
    }
    return alreadyFav;
  }, [favoritedUrls, favoritedKeys, refreshFavorites]);

  const updateTags = useCallback(async (id: string, tags: string[]): Promise<boolean> => {
    const res = await api.updateFavoriteTags(id, tags);
    if (res && res.success) {
      refreshFavorites();
      return true;
    }
    return false;
  }, [refreshFavorites]);

  return (
    <FavoritesContext.Provider
      value={{
        favorites,
        favoritedUrls,
        favTags,
        isLoading,
        isFavorited,
        toggleFavorite,
        refreshFavorites,
        updateTags,
      }}
    >
      {children}

      {/* 全局取消收藏安全拦截确认弹窗 */}
      <ConfirmModal
        isOpen={!!pendingUnfavItem}
        title="确认取消收藏？"
        message="取消收藏后，该图片将从您的灵感收藏夹中移除。"
        subMessage="您之后仍然可以通过文章封面、图库或外链重新收藏该图片。"
        thumbUrl={pendingUnfavItem?.thumbUrl || pendingUnfavItem?.url}
        confirmText="确认取消收藏"
        cancelText="保留收藏"
        danger={true}
        onConfirm={() => {
          if (pendingUnfavItem) {
            executeRemoveFavorite(pendingUnfavItem.url.trim());
          }
        }}
        onCancel={() => setPendingUnfavItem(null)}
      />
    </FavoritesContext.Provider>
  );
};

export const useFavorites = (): FavoritesContextType => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
