import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FavoriteItem, GalleryProvider, Photo, PostInfo, getCanonicalImageKey } from '../types';
import { api } from '../api';
import { Search, Star, Tag, ChevronDown, ChevronUp, Sparkles, Camera, Monitor, Wand2, Link2, Loader2, Lightbulb, X, Check } from 'lucide-react';
import { Generators } from './Generators';
import { TagEditorModal } from './TagEditorModal';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { PhotoCard } from './PhotoCard';
import { extractTargetDimensions } from '../utils/imageMeta';

/** 未注册端点前端的默认搜索来源（接口失败时回落，保证 Tab 始终可用）。 */
const DEFAULT_SEARCH_PROVIDERS: GalleryProvider[] = [
  { id: 'unsplash', display_name: 'Unsplash 摄影', kind: 'search' },
  { id: 'wallhaven', display_name: 'Wallhaven 壁纸', kind: 'search' },
];

/** 旧版 /api/unsplash/search 端点已实现的来源 ID（保留兼容路径）。 */
const LEGACY_SEARCH_SOURCES: readonly string[] = ['unsplash', 'wallhaven'];
const isLegacySearchSource = (s: string) => LEGACY_SEARCH_SOURCES.includes(s);
const isImageSearchSource = (s: string) => s !== 'generators' && s !== 'favorites';

interface PhotoGalleryProps {
  post: PostInfo;
  defaultOwner: string;
  defaultPattern?: string;
  defaultTheme?: string;
  initialKeyword?: string;
  coverFields: string[];
  defaultOrientation: string;
  defaultSize: string;
  infiniteScrollEnabled: boolean;
  brokenUrls?: Set<string>;
  onApplyImage: (url: string, fields: string[]) => void;
  onInsertBodyImage?: (url: string, title: string) => void;
  onOpenLightbox: (url: string, title: string, fallbackUrl?: string) => void;
  onOpenManualModal: () => void;
}

export const PhotoGallery: React.FC<PhotoGalleryProps> = ({
  post,
  defaultOwner,
  defaultPattern = 'Signal',
  defaultTheme = 'Dark',
  initialKeyword = '',
  coverFields,
  defaultOrientation,
  defaultSize,
  infiniteScrollEnabled,
  brokenUrls,
  onApplyImage,
  onInsertBodyImage,
  onOpenLightbox,
  onOpenManualModal,
}) => {
  const {
    favorites: allFavorites,
    favTags,
    favoritedUrls,
    toggleFavorite,
    updateTags,
  } = useFavorites();
  const toast = useToast();

  // 来源 Tab 由 CoverProvider 注册表动态渲染（接口失败时保持默认列表）
  const [source, setSource] = useState<string>('unsplash');
  const [galleryProviders, setGalleryProviders] = useState<GalleryProvider[]>(DEFAULT_SEARCH_PROVIDERS);
  const [orientation, setOrientation] = useState(defaultOrientation || 'landscape');
  const [imageSize, setImageSize] = useState(defaultSize || 'large');

  // 搜索框默认保持为空，绝不强行将第一篇博文名写入搜索框
  const [searchKeyword, setSearchKeyword] = useState(initialKeyword || '');

  // 图片列表状态
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // 收藏夹标签多选筛选状态 (支持多选组合)
  const [selectedFavTags, setSelectedFavTags] = useState<string[]>([]);
  // 更多标签内嵌展开面板状态
  const [isTagPanelExpanded, setIsTagPanelExpanded] = useState(false);
  // 标签面板内搜索关键词
  const [tagSearchQuery, setTagSearchQuery] = useState('');

  // 标签编辑模态框状态
  const [editingFavItem, setEditingFavItem] = useState<FavoriteItem | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // 切换选中单个标签 (多选模式)
  const handleToggleFavTag = (tagName: string) => {
    setSelectedFavTags(prev =>
      prev.includes(tagName) ? prev.filter(t => t !== tagName) : [...prev, tagName]
    );
  };

  // 清空已选标签
  const handleClearFavTags = () => {
    setSelectedFavTags([]);
  };

  // 面板内搜索匹配过滤的标签列表
  const filteredFavTags = useMemo(() => {
    if (!tagSearchQuery.trim()) return favTags;
    const q = tagSearchQuery.toLowerCase().trim();
    return favTags.filter(t => t.name.toLowerCase().includes(q));
  }, [favTags, tagSearchQuery]);

  // 当前博文使用的所有封面 URL 与规范化 Key 集合 (用于收藏夹双向联动高亮)
  const currentPostCoverUrls = new Set(
    Object.values(post.images || {}).map(u => (u || '').trim()).filter(Boolean)
  );
  const currentPostCoverKeys = new Set(
    Object.values(post.images || {})
      .map(u => (u || '').trim())
      .filter(Boolean)
      .map(getCanonicalImageKey)
  );

  // 根据当前标签和搜索关键词过滤收藏夹列表，并根据图片特征自动去重
  const displayedFavorites = useMemo(() => {
    const filtered = allFavorites.filter(it => {
      // 多标签交集匹配 (AND): 包含所有选中的标签
      if (selectedFavTags.length > 0) {
        const itemTags = it.tags || [];
        const matchesAll = selectedFavTags.every(t => itemTags.includes(t));
        if (!matchesAll) return false;
      }
      if (searchKeyword.trim()) {
        const q = searchKeyword.toLowerCase();
        const matchTitle = (it.title || '').toLowerCase().includes(q);
        const matchTag = (it.tags || []).some(t => t.toLowerCase().includes(q));
        const matchSource = (it.source || '').toLowerCase().includes(q);
        if (!matchTitle && !matchTag && !matchSource) return false;
      }
      return true;
    });

    // 客户端防御性去重：同一张图片（不同尺寸/裁剪参数）只显示一个主卡片
    const seen = new Set<string>();
    const result: FavoriteItem[] = [];
    for (const it of filtered) {
      const key = getCanonicalImageKey(it.url);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(it);
      }
    }
    return result;
  }, [allFavorites, selectedFavTags, searchKeyword]);

  // 触发图片搜索
  const doSearch = async (
    kw = searchKeyword,
    p = 1,
    isAppend = false,
    targetSource = source,
    targetOrientation = orientation,
    targetSize = imageSize
  ) => {
    if (!kw.trim()) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    if (isAppend) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      // 只要开始全新搜索，立刻清空旧图片，绝不让上一次搜索的图片残留占位
      setPhotos([]);
    }

    try {
      let newPhotos: Photo[];
      if (isLegacySearchSource(targetSource)) {
        // 旧端点兼容：Unsplash / Wallhaven 保持原有检索与降级语义
        const res = await api.searchPhotos({
          query: kw.trim(),
          page: p,
          source: targetSource,
          orientation: targetOrientation,
          size: targetSize,
          signal: abortRef.current.signal,
        });
        newPhotos = res.results || [];
      } else {
        // 注册表分发：新增来源无需改动此处即可检索
        const res = await api.searchGalleryProvider({
          provider: targetSource,
          query: kw.trim(),
          page: p,
          orientation: targetOrientation,
          size: targetSize,
          signal: abortRef.current.signal,
        });
        newPhotos = res.results || [];
      }
      if (isAppend) {
        setPhotos(prev => {
          const seen = new Set(prev.map(x => x.urls?.regular || x.urls?.raw));
          const filtered = newPhotos.filter(x => !seen.has(x.urls?.regular || x.urls?.raw));
          return [...prev, ...filtered];
        });
      } else {
        setPhotos(newPhotos);
      }
      setPage(p);
      // 只要本次拿到了图片且在合理页数内，就允许继续加载下一页；只有返回 0 张图才算见底
      setHasMore(newPhotos.length > 0 && p < 35);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Search failed:', e);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  // 拉取 CoverProvider 注册表，动态渲染来源 Tab（失败时保持默认列表）
  useEffect(() => {
    let cancelled = false;
    api.fetchGalleryProviders()
      .then(list => {
        if (cancelled) return;
        const searchProviders = list.filter(p => p.kind === 'search');
        if (searchProviders.length > 0) setGalleryProviders(searchProviders);
      })
      .catch(() => { /* 网络异常时沿用默认来源，不打断用户 */ });
    return () => { cancelled = true; };
  }, []);

  // 切换博文时：重置图库状态，清空上一篇未完请求，但绝不强行将博文名写进搜索框
  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setPhotos([]);
    setPage(1);
    setHasMore(true);
  }, [post.file_path, post.title]);

  // 用户主动点击快捷建议填充文章标题并搜索
  const handleApplyPostTitleSearch = () => {
    if (!post.title) return;
    setSearchKeyword(post.title);
    doSearch(post.title, 1, false, source, orientation, imageSize);
  };

  // 切换图库数据源 Tab (注册表来源 / 极客生成器 / 收藏夹) 时自动清空旧图，若有搜索词则重新检索
  const handleSwitchSource = (newSource: string) => {
    if (source === newSource) return;
    setSource(newSource);
    setPhotos([]);
    setPage(1);
    setHasMore(true);
    if (isImageSearchSource(newSource) && searchKeyword.trim()) {
      doSearch(searchKeyword, 1, false, newSource, orientation, imageSize);
    }
  };

  // 切换构图比例时自动刷新
  const handleSwitchOrientation = (newOrient: string) => {
    setOrientation(newOrient);
    if (isImageSearchSource(source)) {
      if (searchKeyword.trim()) {
        setPhotos([]);
        doSearch(searchKeyword, 1, false, source, newOrient, imageSize);
      }
    }
  };

  // 切换尺寸范围时自动刷新
  const handleSwitchSize = (newSize: string) => {
    setImageSize(newSize);
    if (isImageSearchSource(source)) {
      if (searchKeyword.trim()) {
        setPhotos([]);
        doSearch(searchKeyword, 1, false, source, orientation, newSize);
      }
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (source !== 'favorites' && source !== 'generators') {
      doSearch(searchKeyword, 1, false);
    }
  };

  const handleLoadMore = useCallback(() => {
    if (source !== 'favorites' && source !== 'generators' && hasMore && !isLoadingMore && !isLoading) {
      doSearch(searchKeyword, page + 1, true);
    }
  }, [source, hasMore, isLoadingMore, isLoading, doSearch, searchKeyword, page]);

  // 使用 ref 保存 handleLoadMore，避免 scroll effect 频繁重建
  const handleLoadMoreRef = useRef(handleLoadMore);
  useEffect(() => {
    handleLoadMoreRef.current = handleLoadMore;
  }, [handleLoadMore]);

  // 触底自动加载支持 (根据用户配置开启)
  useEffect(() => {
    if (!infiniteScrollEnabled || source === 'generators' || source === 'favorites') {
      return;
    }

    const scrollContainer = document.querySelector('.app-main-content');

    const handleScroll = () => {
      // 触底检测：距底部 300px 时触发加载更多
      let isNearBottom = false;
      if (scrollContainer) {
        const { scrollTop, clientHeight, scrollHeight } = scrollContainer;
        isNearBottom = scrollTop + clientHeight >= scrollHeight - 300;
      } else {
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const docHeight = document.documentElement.scrollHeight;
        isNearBottom = scrollY + windowHeight >= docHeight - 300;
      }
      // 通过 ref 获取最新的 handleLoadMore，避免依赖变化导致 listener 频繁重建
      if (isNearBottom) handleLoadMoreRef.current();
    };

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    } else {
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }
  }, [infiniteScrollEnabled, source]);

  const handleSaveTags = async (idOrUrl: string, tags: string[]) => {
    await updateTags(idOrUrl, tags);
  };

  return (
    <section className="gallery-section">
      <div className="section-head-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h3 className="section-title"><Sparkles size={16} /> 灵感配图与创作</h3>
          <div className="filter-pill-tabs">
            {/* 搜索类来源 Tab 由 /api/gallery/providers 动态渲染 */}
            {galleryProviders.map(p => (
              <button
                key={p.id}
                type="button"
                className={`filter-pill ${source === p.id ? 'active' : ''}`}
                onClick={() => handleSwitchSource(p.id)}
                title={`来源: ${p.display_name}`}
              >
                {p.id === 'unsplash' && <Camera size={12} style={{ marginRight: 4 }} />}
                {p.id === 'wallhaven' && <Monitor size={12} style={{ marginRight: 4 }} />}
                {p.display_name}
              </button>
            ))}
            <button
              type="button"
              className={`filter-pill ${source === 'generators' ? 'active' : ''}`}
              onClick={() => handleSwitchSource('generators')}
            >
              <Wand2 size={12} style={{ marginRight: 4 }} />
              极客生成器
            </button>
            <button
              type="button"
              className={`filter-pill ${source === 'favorites' ? 'active' : ''}`}
              onClick={() => handleSwitchSource('favorites')}
            >
              <Star size={12} style={{ marginRight: 4 }} />
              灵感收藏夹
            </button>
          </div>
        </div>

        <button className="btn btn-sm btn-ghost" onClick={onOpenManualModal}>
          <Link2 size={13} style={{ marginRight: 4 }} />
          手动输入外链
        </button>
      </div>

      {/* 1. 当处于极客生成器 Tab 时：渲染 Generators 组件 */}
      {source === 'generators' && (
        <div style={{ marginTop: 14 }}>
          <Generators
            post={post}
            coverFields={coverFields}
            defaultOwner={defaultOwner}
            defaultPattern={defaultPattern}
            defaultTheme={defaultTheme}
            embedded={true}
            onApplyImage={onApplyImage}
            onOpenLightbox={onOpenLightbox}
          />
        </div>
      )}

      {/* 2. 当非极客生成器模式时：显示构图比例与画幅过滤栏 */}
      {source !== 'generators' && source !== 'favorites' && (
        <div className="filter-controls-bar">
          <div className="filter-item-group">
            <span className="ctrl-label">构图比例:</span>
            <div className="filter-pill-tabs">
              {(['landscape', 'ultrawide', 'all'] as const).map(o => (
                <button
                  key={o}
                  className={`filter-pill ${orientation === o ? 'active' : ''}`}
                  onClick={() => handleSwitchOrientation(o)}
                >
                  {o === 'landscape' && '横屏 Landscape'}
                  {o === 'ultrawide' && '超宽 16:9'}
                  {o === 'all' && '全部'}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-item-group">
            <span className="ctrl-label">尺寸范围:</span>
            <div className="filter-pill-tabs">
              {(['large', 'wallpaper', 'all'] as const).map(s => (
                <button
                  key={s}
                  className={`filter-pill ${imageSize === s ? 'active' : ''}`}
                  onClick={() => handleSwitchSize(s)}
                >
                  {s === 'large' && '高清 (≥1200px)'}
                  {s === 'wallpaper' && '2K/4K超清'}
                  {s === 'all' && '不限尺寸'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 收藏夹标签栏与展开面板 */}
      {source === 'favorites' && (
        <div className="fav-tags-section" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="fav-tags-filter-bar" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`filter-pill ${selectedFavTags.length === 0 ? 'active' : ''}`}
              onClick={handleClearFavTags}
            >
              全部标签
            </button>

            {favTags.slice(0, 6).map(t => {
              const isSelected = selectedFavTags.includes(t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  className={`filter-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => handleToggleFavTag(t.name)}
                  title={`点击${isSelected ? '取消' : '添加'}标签筛选`}
                >
                  {isSelected && <Check size={11} style={{ marginRight: 3 }} />}
                  #{t.name} ({t.count})
                </button>
              );
            })}

            {/* 若选中的标签排在第 6 个之后，单独列出以便直观取消 */}
            {selectedFavTags.filter(st => !favTags.slice(0, 6).some(t => t.name === st)).map(st => (
              <button
                key={st}
                type="button"
                className="filter-pill active"
                onClick={() => handleToggleFavTag(st)}
                title="点击取消选中"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Check size={11} />
                <span>#{st}</span>
                <X size={10} style={{ opacity: 0.8 }} />
              </button>
            ))}

            {favTags.length > 0 && (
              <button
                type="button"
                className={`filter-pill ${isTagPanelExpanded ? 'active' : ''}`}
                style={{
                  background: isTagPanelExpanded ? 'var(--accent-color)' : 'rgba(99, 102, 241, 0.12)',
                  borderColor: isTagPanelExpanded ? 'var(--accent-color)' : 'rgba(99, 102, 241, 0.35)',
                  color: isTagPanelExpanded ? '#fff' : '#a5b4fc',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                onClick={() => setIsTagPanelExpanded(prev => !prev)}
                title={isTagPanelExpanded ? "点击折叠标签多选面板" : "点击展开标签多选搜索面板"}
              >
                <Tag size={11} />
                <span>{isTagPanelExpanded ? '收起标签' : `+ 更多标签 (${favTags.length})`}</span>
                {isTagPanelExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}

            {selectedFavTags.length > 0 && (
              <button
                type="button"
                className="filter-pill"
                onClick={handleClearFavTags}
                style={{
                  background: 'transparent',
                  borderColor: 'rgba(239, 68, 68, 0.35)',
                  color: '#f87171',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 11,
                  padding: '2px 8px',
                }}
                title="清空当前所有选中的标签筛选"
              >
                <X size={11} />
                <span>清空已选 ({selectedFavTags.length})</span>
              </button>
            )}
          </div>

          {/* 点击“更多标签”后的内嵌展开搜索多选面板 */}
          {isTagPanelExpanded && (
            <div
              className="fav-tags-expand-panel"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              {/* 搜索框与快捷操作行 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', width: 240, maxWidth: '100%' }}>
                  <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="快速搜索标签名称..."
                    value={tagSearchQuery}
                    onChange={e => setTagSearchQuery(e.target.value)}
                    style={{ height: 28, fontSize: 11.5, paddingLeft: 26, paddingRight: 24, width: '100%' }}
                    autoFocus
                  />
                  {tagSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTagSearchQuery('')}
                      style={{
                        position: 'absolute',
                        right: 6,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  <span>已勾选 <strong style={{ color: 'var(--accent-color)' }}>{selectedFavTags.length}</strong> / {favTags.length} 个标签</span>
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => {
                      const visibleNames = filteredFavTags.map(t => t.name);
                      setSelectedFavTags(prev => Array.from(new Set([...prev, ...visibleNames])));
                    }}
                    style={{ fontSize: 11, padding: '2px 6px' }}
                  >
                    全选匹配
                  </button>
                  {selectedFavTags.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-xs btn-ghost"
                      onClick={handleClearFavTags}
                      style={{ fontSize: 11, padding: '2px 6px', color: '#f87171' }}
                    >
                      清空
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-xs btn-ghost"
                    onClick={() => setIsTagPanelExpanded(false)}
                    style={{ fontSize: 11, padding: '2px 6px' }}
                  >
                    收起
                  </button>
                </div>
              </div>

              {/* 标签网格 (复选框勾选，支持多选组合搜索) */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  maxHeight: 180,
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {filteredFavTags.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', padding: '6px 2px' }}>
                    未找到包含 "{tagSearchQuery}" 的标签
                  </div>
                ) : (
                  filteredFavTags.map(t => {
                    const isChecked = selectedFavTags.includes(t.name);
                    return (
                      <label
                        key={t.name}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 8px',
                          borderRadius: 5,
                          fontSize: 11.5,
                          background: isChecked ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
                          border: `1px solid ${isChecked ? 'var(--accent-color)' : 'var(--border-color)'}`,
                          color: isChecked ? 'var(--accent-color)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleFavTag(t.name)}
                          style={{ margin: 0, cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                        />
                        <span>#{t.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.65 }}>({t.count})</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 搜索行与瀑布流卡片 (仅非生成器模式下显示) */}
      {source !== 'generators' && (
        <>
          <form onSubmit={handleSearchSubmit} className="gallery-search-form">
            <input
              type="text"
              className="search-input"
              placeholder={source === 'favorites' ? '在我的收藏中搜索...' : '输入关键词 (如 coding, minimalist, mountain) 按回车搜索...'}
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <Loader2 size={14} className="spin-icon" /> : <Search size={14} />}
              <span>{isLoading ? '检索中...' : '搜索图片'}</span>
            </button>
          </form>

          {/* 可选的博文标题一键填入建议胶囊 (非强制自动填写，只提供便利建议) */}
          {source !== 'favorites' && post.title && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 14px 2px', fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Lightbulb size={12} color="#f59e0b" />
                推荐联想:
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ padding: '2px 8px', fontSize: 12, height: 24, borderRadius: 12, border: '1px dashed var(--border-color)' }}
                onClick={handleApplyPostTitleSearch}
                title="点击将当前博文标题填入搜索框并立即检索"
              >
                《{post.title}》
              </button>
            </div>
          )}

          {/* 瀑布流自适应卡片网格 */}
          <div className="masonry-grid-container">
            {source === 'favorites' ? (
              displayedFavorites.length === 0 ? (
                <div className="empty-hint">
                  {allFavorites.length === 0
                    ? '暂无收藏的图片。在任何地方（文章封面、海报生成器、Socialify、图库或全屏灯箱）点击星标即可一键加入收藏。'
                    : '没有找到匹配的收藏项，可尝试切换标签或清除搜索词'}
                </div>
              ) : (
                displayedFavorites.map(it => {
                  const isUsedByCurrent =
                    currentPostCoverUrls.has(it.url.trim()) ||
                    currentPostCoverKeys.has(getCanonicalImageKey(it.url));
                  const targetDim = extractTargetDimensions(it.url);

                  return (
                    <PhotoCard
                      key={it.id || it.url}
                      url={it.url}
                      thumbUrl={it.thumb_url}
                      title={it.title || '收藏图片'}
                      subtitle={
                        it.source === 'poster' ? '来源: 极客海报' :
                        it.source === 'socialify' ? '来源: Socialify' :
                        it.source === 'skillicons' ? '来源: 技能横幅' :
                        it.source === 'wallhaven' ? '来源: Wallhaven' :
                        it.source === 'unsplash' ? '来源: Unsplash' :
                        '来源: 灵感收藏'
                      }
                      sourceBadge={
                        it.source === 'wallhaven' ? 'Wallhaven' :
                        it.source === 'unsplash' ? 'Unsplash' :
                        it.source === 'poster' ? '海报' :
                        it.source === 'socialify' ? 'Socialify' :
                        it.source === 'skillicons' ? 'SkillIcons' :
                        undefined
                      }
                      isFavorited={true}
                      isUsedByCurrent={isUsedByCurrent}
                      isBroken={!!brokenUrls?.has(it.url)}
                      tags={it.tags}
                      coverFields={coverFields}
                      dimensions={targetDim}
                      onToggleFavorite={() => toggleFavorite({ url: it.url, thumbUrl: it.thumb_url, title: it.title, source: it.source })}
                      onOpenLightbox={() => onOpenLightbox(it.url, it.title || '收藏图片', it.thumb_url || it.url)}
                      onApplyImage={onApplyImage}
                      onEditTags={() => setEditingFavItem(it)}
                      onCopyUrl={() => {
                        navigator.clipboard.writeText(it.url);
                        toast.success('图片链接已复制');
                      }}
                      onCopyMarkdown={() => {
                        const md = `![${it.title || '配图'}](${it.url})`;
                        navigator.clipboard.writeText(md);
                        toast.success('已复制 Markdown: ' + md);
                      }}
                      onInsertBody={onInsertBodyImage ? () => onInsertBodyImage(it.url, it.title || '配图') : undefined}
                      onOpenExternal={() => api.openSystemURL(it.url)}
                    />
                  );
                })
              )
            ) : (
              isLoading && photos.length === 0 ? (
                /* 切换文章或新搜索时展示纯净的骨架屏占位，杜绝上一篇旧图残留 */
                <>
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="gallery-card-item skeleton-card">
                      <div className="skeleton-thumb-box">
                        <div className="skeleton-shine-sweep" />
                      </div>
                      <div className="card-detail-info" style={{ padding: '12px' }}>
                        <div className="skeleton-bar" style={{ width: '60%', height: 12, marginBottom: 8 }} />
                        <div className="skeleton-bar" style={{ width: '40%', height: 10 }} />
                      </div>
                    </div>
                  ))}
                  <div className="empty-hint" style={{ gridColumn: '1 / -1', marginTop: -10 }}>
                    <Loader2 size={16} className="spin-icon" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8 }} />
                    正在检索匹配的高清壁纸...
                  </div>
                </>
              ) : photos.length === 0 ? (
                <div className="empty-hint">
                  {searchKeyword.trim()
                    ? '未找到匹配图片，可尝试更换关键词或切换至 Wallhaven 搜索'
                    : '在上方输入关键词按回车搜索图片，或点击【推荐联想】按当前博文检索'}
                </div>
              ) : (
                photos.map(p => {
                  const fullUrl = p.urls.raw || p.urls.full || p.urls.regular;
                  const thumbUrl = p.urls.small || p.urls.thumb || p.urls.regular || fullUrl;
                  const targetDim = extractTargetDimensions(fullUrl, p.width, p.height);
                  const author = p.user?.name || (p.source === 'wallhaven' ? 'Wallhaven' : 'Unsplash');
                  const photoTitle = p.description || p.alt_description || `${author} (${p.id})`;
                  const isFav = favoritedUrls.has(fullUrl);
                  const isUsedByCurrent =
                    currentPostCoverUrls.has(fullUrl.trim()) ||
                    currentPostCoverKeys.has(getCanonicalImageKey(fullUrl));

                  const isBroken =
                    !!brokenUrls?.has(fullUrl) ||
                    !!brokenUrls?.has(thumbUrl) ||
                    !!brokenUrls?.has(p.urls.raw || '') ||
                    !!brokenUrls?.has(p.urls.full || '');

                  return (
                    <PhotoCard
                      key={p.id + fullUrl}
                      url={fullUrl}
                      thumbUrl={thumbUrl}
                      title={photoTitle}
                      subtitle={`摄影: ${author}`}
                      sourceBadge={p.source === 'wallhaven' ? 'Wallhaven' : 'Unsplash'}
                      isFavorited={isFav}
                      isUsedByCurrent={isUsedByCurrent}
                      isBroken={isBroken}
                      coverFields={coverFields}
                      dimensions={targetDim}
                      onToggleFavorite={() => toggleFavorite({ url: fullUrl, thumbUrl, title: photoTitle, source: p.source })}
                      onOpenLightbox={() => onOpenLightbox(fullUrl, photoTitle, thumbUrl)}
                      onApplyImage={onApplyImage}
                      onCopyUrl={() => {
                        navigator.clipboard.writeText(fullUrl);
                        toast.success('图片链接已复制');
                      }}
                      onCopyMarkdown={() => {
                        const md = `![${photoTitle || '配图'}](${fullUrl})`;
                        navigator.clipboard.writeText(md);
                        toast.success('已复制 Markdown: ' + md);
                      }}
                      onInsertBody={onInsertBodyImage ? () => onInsertBodyImage(fullUrl, photoTitle || '配图') : undefined}
                      onOpenExternal={() => api.openSystemURL(fullUrl)}
                    />
                  );
                })
              )
            )}
          </div>

          {/* 底部加载更多 */}
          {source !== 'favorites' && photos.length > 0 && (
            <div className="gallery-footer-more">
              <button
                className="btn btn-primary btn-load-more"
                onClick={handleLoadMore}
                disabled={isLoadingMore || !hasMore}
              >
                {isLoadingMore ? <Loader2 size={14} className="spin-icon" /> : <ChevronDown size={14} />}
                <span>{isLoadingMore ? '正在加载更多...' : (hasMore ? '查看更多配图' : '已呈现全部匹配图片')}</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* 自定义标签编辑模态框 */}
      <TagEditorModal
        isOpen={!!editingFavItem}
        item={editingFavItem}
        onClose={() => setEditingFavItem(null)}
        onSaveTags={handleSaveTags}
      />
    </section>
  );
};
