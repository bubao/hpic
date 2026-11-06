import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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

  // 使用 ref 保持最新的收藏状态引用，避免在 toggleFavorite 中读取 stale closure
  const favoritedUrlsRef = useRef(favoritedUrls);
  const favoritedKeysRef = useRef(favoritedKeys);
  useEffect(() => {
    favoritedUrlsRef.current = favoritedUrls;
    favoritedKeysRef.current = favoritedKeys;
  }, [favoritedUrls, favoritedKeys]);

  const isFavorited = useCallback((url?: string): boolean => {
    if (!url) return false;
    const trimmed = url.trim();
    // 使用 ref 读取最新值，避免 stale closure 导致误判
    return favoritedUrlsRef.current.has(trimmed) || favoritedKeysRef.current.has(getCanonicalImageKey(trimmed));
  }, []);

  // 取消收藏确认时的真实执行（带乐观更新）
  const executeRemoveFavorite = useCallback(async (rawUrl: string) => {
    const key = getCanonicalImageKey(rawUrl);
    // 保存旧值用于失败回滚
    const oldUrls = new Set(Array.from(favoritedUrlsRef.current));
    const oldKeys = new Set(Array.from(favoritedKeysRef.current));

    // 乐观更新：立即从 UI 移除收藏状态
    setFavoritedUrls(prev => { const n = new Set(prev); n.delete(rawUrl); return n; });
    setFavoritedKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
    setFavorites(prev => prev.filter(f => f.url.trim() !== rawUrl && getCanonicalImageKey(f.url) !== key));
    setPendingUnfavItem(null);

    try {
      const res = await api.removeFavorite(rawUrl);
      if (!res || !res.success) {
        setFavoritedUrls(new Set(oldUrls));
        setFavoritedKeys(new Set(oldKeys));
        refreshFavorites();
      } else {
        refreshFavorites();
      }
    } catch {
      setFavoritedUrls(new Set(oldUrls));
      setFavoritedKeys(new Set(oldKeys));
      refreshFavorites();
    }
  }, [refreshFavorites]);

  // 切换收藏状态：取消走确认弹窗，新增走乐观更新
  const toggleFavorite = useCallback(async (item: ToggleFavoriteParams): Promise<boolean> => {
    const rawUrl = (item.url || '').trim();
    if (!rawUrl) return false;

    const key = getCanonicalImageKey(rawUrl);
    // 从 ref 读取最新状态，避免 stale closure
    const alreadyFav = favoritedUrlsRef.current.has(rawUrl) || favoritedKeysRef.current.has(key);

    if (alreadyFav) {
      // 触发确认拦截弹窗
      setPendingUnfavItem(item);
      return true;
    }

    // 新增收藏：乐观更新 —— 立即添加到 UI
    setFavoritedUrls(prev => new Set(prev).add(rawUrl));
    setFavoritedKeys(prev => new Set(prev).add(key));

    try {
      const payload: Partial<FavoriteItem> = {
        url: rawUrl,
        thumb_url: (item.thumbUrl || rawUrl).trim(),
        title: item.title?.trim() || '收藏灵感图片',
        source: item.source || 'web',
        tags: item.tags || [],
      };
      const res = await api.addFavorite(payload);
      if (res && res.success) {
        refreshFavorites();
        return true;
      }
      // 失败回滚
      setFavoritedUrls(prev => { const n = new Set(prev); n.delete(rawUrl); return n; });
      setFavoritedKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
    } catch {
      // 失败回滚
      setFavoritedUrls(prev => { const n = new Set(prev); n.delete(rawUrl); return n; });
      setFavoritedKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
    return false;
  }, [refreshFavorites]);

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
