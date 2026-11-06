import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PostInfo } from '../types';
import { Icon } from './common/Icon';
import { isSvgUrl } from '../utils/imageMeta';
import { SvgSafeImage } from './common/SvgSafeImage';

interface PostListItemProps {
  post: PostInfo;
  isSelected: boolean;
  isBroken: boolean;
  viewMode?: 'list' | 'gallery';
  onSelect: (post: PostInfo) => void;
  onSelectCategory?: (category: string) => void;
}

export const PostListItem: React.FC<PostListItemProps> = ({
  post,
  isSelected,
  isBroken,
  viewMode = 'list',
  onSelect,
  onSelectCategory,
}) => {
  const [isHoveringThumb, setIsHoveringThumb] = useState(false);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number } | null>(null);
  const [thumbLoadError, setThumbLoadError] = useState(false);
  const thumbWrapRef = useRef<HTMLDivElement>(null);

  let badgeClass = 'badge-missing';
  let badgeText = '待配图';
  let dotColor = '#94a3b8';

  if (isBroken) {
    badgeClass = 'badge-broken';
    badgeText = '配图失效';
    dotColor = '#ef4444';
  } else if (post.status === 'complete') {
    badgeClass = 'badge-complete';
    badgeText = '已配图';
    dotColor = '#10b981';
  } else if (post.status === 'partial') {
    badgeClass = 'badge-partial';
    badgeText = '部分配图';
    dotColor = '#f59e0b';
  }

  const primaryCat = (post.categories || '').split(/[,，]+/)[0]?.trim();
  const metaDateStr = (post.date || post.updated || '').substring(0, 10);

  // 1. 深度收集当前文章所有不同且有效的配图 (多图叠放数据源)
  const uniqueImages = useMemo(() => {
    const list: { field: string; url: string }[] = [];
    const seen = new Set<string>();

    const checkAndAdd = (field: string, url?: string) => {
      if (url && typeof url === 'string') {
        const trimmed = url.trim();
        if (trimmed && !seen.has(trimmed)) {
          seen.add(trimmed);
          list.push({ field, url: trimmed });
        }
      }
    };

    checkAndAdd('index_img', post.index_img);
    checkAndAdd('banner_img', post.banner_img);
    if (post.images) {
      for (const [k, v] of Object.entries(post.images)) {
        checkAndAdd(k, v);
      }
    }
    return list;
  }, [post]);

  const hasMultipleImages = uniqueImages.length > 1;
  const primaryCover = uniqueImages[0]?.url || '';
  const secondaryCover = uniqueImages[1]?.url || '';

  // 鼠标悬停缩略图时，计算屏幕绝对物理坐标以挂载 Portal 浮窗
  const handleMouseEnter = () => {
    if (uniqueImages.length === 0 || thumbLoadError) return;
    if (thumbWrapRef.current) {
      const rect = thumbWrapRef.current.getBoundingClientRect();
      // 计算弹出位置：位于缩略图右方 12px，垂直居中对齐，并防止溢出视口底部
      const popoverWidth = uniqueImages.length > 1 ? 340 : 290;
      const popoverHeight = uniqueImages.length > 1 ? 230 : 210;
      let left = rect.right + 12;
      if (left + popoverWidth > window.innerWidth) {
        left = Math.max(10, rect.left - popoverWidth - 12);
      }
      let top = rect.top + rect.height / 2 - popoverHeight / 2;
      top = Math.max(12, Math.min(window.innerHeight - popoverHeight - 12, top));

      setPopoverCoords({ top, left });
      setIsHoveringThumb(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHoveringThumb(false);
  };

  // 视口滚动时自动关闭浮层
  useEffect(() => {
    if (!isHoveringThumb) return;
    const handleScroll = () => setIsHoveringThumb(false);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isHoveringThumb]);

  // 画廊卡片视图 (Gallery Card Mode)
  if (viewMode === 'gallery') {
    return (
      <div
        className={`post-gallery-card ${isSelected ? 'active selected' : ''} ${isBroken ? 'has-broken-cover' : ''}`}
        onClick={() => onSelect(post)}
      >
        <div className="gallery-card-cover-wrap">
          {primaryCover && !thumbLoadError ? (
            <>
              {/* 高斯模糊氛围光影底衬：解决不同图片比例导致的左右留白/露灰底问题 */}
              <SvgSafeImage
                src={primaryCover}
                alt=""
                className="gallery-card-bg-blur"
                fitMode="cover"
              />
              {/* 核心清晰原图：保持原比例绝对水平垂直居中展示 */}
              {isSvgUrl(primaryCover) ? (
                <SvgSafeImage
                  src={primaryCover}
                  alt={post.title}
                  className="gallery-card-img fit-contain"
                  fitMode="contain"
                  style={{ width: '100%', height: '100%' }}
                  loading="lazy"
                  onError={() => setThumbLoadError(true)}
                />
              ) : (
                <img
                  src={primaryCover}
                  alt={post.title}
                  className="gallery-card-img fit-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setThumbLoadError(true)}
                />
              )}
            </>
          ) : (
            <div className="gallery-card-placeholder">
              <Icon name="image" size="lg" variant="muted" />
              <span className="placeholder-text">暂无封面</span>
            </div>
          )}

          {/* 多图堆叠标记 */}
          {hasMultipleImages && (
            <span className="gallery-multi-image-badge" title={`该文章共配置了 ${uniqueImages.length} 张封面`}>
              <Icon name="layers" size="xs" />
              <span>{uniqueImages.length} 图</span>
            </span>
          )}

          <div className="gallery-card-badges-overlay">
            <span className={`post-badge ${badgeClass}`}>
              <span className="badge-indicator-dot" style={{ backgroundColor: dotColor }} />
              {badgeText}
            </span>
            {isSelected && (
              <span className="post-selected-badge" title="当前已选中">
                <Icon name="check" size="xs" strokeWidth={2.5} />
              </span>
            )}
          </div>
        </div>

        <div className="gallery-card-content">
          <div className="post-title-text post-item-title" title={post.title}>
            {post.is_draft ? (
              <span className="post-type-tag draft">草稿</span>
            ) : post.file_path.includes('/source/_posts/') ? (
              <span className="post-type-tag post">文章</span>
            ) : null}
            {post.title}
          </div>

          <div className="item-row-meta">
            {metaDateStr && (
              <span className="meta-date">
                <Icon name="calendar" size="xs" variant="muted" />
                {metaDateStr}
              </span>
            )}
            {primaryCat && (
              <span
                className="post-category-tag"
                title={`分类: ${post.categories}`}
                onClick={e => {
                  e.stopPropagation();
                  onSelectCategory?.(primaryCat);
                }}
              >
                <Icon name="folder" size="xs" variant="muted" />
                {primaryCat}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 常规紧凑列表视图 (List Mode) - 带多图层叠 (Stacked) & Portal 悬浮大图预览
  return (
    <div
      className={`post-list-item ${isSelected ? 'active selected' : ''} ${isBroken ? 'has-broken-cover' : ''}`}
      onClick={() => onSelect(post)}
    >
      <div className="post-list-item-body">
        <div className="item-row-header item-row-top">
          <div className="post-title-wrapper" title={post.title}>
            <span className="post-title-text post-item-title">
              {post.is_draft ? (
                <span className="post-type-tag draft">草稿</span>
              ) : post.file_path.includes('/source/_posts/') ? (
                <span className="post-type-tag post">文章</span>
              ) : null}
              {post.title}
            </span>
          </div>

          <div className="post-item-right-badges">
            {isSelected && (
              <span className="post-selected-badge" title="当前已选中">
                <Icon name="check" size="xs" strokeWidth={2.5} />
              </span>
            )}
            <span className={`post-badge ${badgeClass}`}>
              <span className="badge-indicator-dot" style={{ backgroundColor: dotColor }} />
              {badgeText}
            </span>
          </div>
        </div>

        <div className="item-row-meta">
          {metaDateStr && (
            <span className="meta-date">
              <Icon name="calendar" size="xs" variant="muted" />
              {metaDateStr}
            </span>
          )}
          {primaryCat && (
            <span
              className="post-category-tag"
              title={`分类: ${post.categories}`}
              onClick={e => {
                e.stopPropagation();
                onSelectCategory?.(primaryCat);
              }}
            >
              <Icon name="folder" size="xs" variant="muted" />
              {primaryCat}
            </span>
          )}
          <span className="meta-filename" title={post.file_path}>
            <Icon name="fileText" size="xs" variant="muted" style={{ marginRight: 3 }} />
            {post.file_name}
          </span>
        </div>
      </div>

      {/* 缩略图区域：支持多张不同封面层叠呈现 (Stacked Deck) */}
      <div
        className={`post-thumb-preview-wrap ${hasMultipleImages ? 'is-stacked' : ''}`}
        ref={thumbWrapRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {uniqueImages.length > 0 && !thumbLoadError ? (
          <>
            {/* 多图堆叠底层衬图 */}
            {hasMultipleImages && secondaryCover && (
              <div className="thumb-stacked-layer layer-2">
                <SvgSafeImage
                  src={secondaryCover}
                  alt="底层封面"
                  className="post-thumb-img"
                  fitMode="cover"
                  loading="lazy"
                />
              </div>
            )}

            {/* 顶层主封面 */}
            {(() => {
              const isSvgThumb = isSvgUrl(primaryCover);
              return (
                <div className="thumb-stacked-layer layer-1">
                  {isSvgThumb && (
                    <SvgSafeImage
                      src={primaryCover}
                      alt=""
                      className="post-thumb-bg-blur"
                      fitMode="cover"
                    />
                  )}
                  {isSvgThumb ? (
                    <SvgSafeImage
                      src={primaryCover}
                      alt={post.title}
                      className="post-thumb-img fit-contain"
                      fitMode="contain"
                      loading="lazy"
                      onError={() => setThumbLoadError(true)}
                    />
                  ) : (
                    <img
                      src={primaryCover}
                      alt={post.title}
                      className="post-thumb-img"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => setThumbLoadError(true)}
                    />
                  )}
                </div>
              );
            })()}

            {/* 多图数量角标 */}
            {hasMultipleImages && (
              <span className="thumb-stack-badge" title={`配置了 ${uniqueImages.length} 张不同封面`}>
                {uniqueImages.length}
              </span>
            )}
          </>
        ) : (
          <div className="post-thumb-empty" title="尚未配置封面">
            <Icon name="image" size="xs" variant="muted" />
          </div>
        )}
      </div>

      {/* 通过 React Portal 挂载到 document.body，彻底杜绝任何父级 overflow/层叠裁切遮挡 */}
      {isHoveringThumb && popoverCoords && createPortal(
        <div
          className="post-thumb-popover-portal"
          style={{
            position: 'fixed',
            top: popoverCoords.top,
            left: popoverCoords.left,
            zIndex: 999999,
          }}
          onMouseEnter={() => setIsHoveringThumb(true)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="popover-portal-container">
            {hasMultipleImages ? (
              <div className="popover-multi-grid">
                {uniqueImages.slice(0, 3).map((item, i) => (
                  <div key={i} className="popover-multi-item">
                    {isSvgUrl(item.url) ? (
                      <SvgSafeImage
                        src={item.url}
                        alt=""
                        className="popover-media-blur"
                        fitMode="cover"
                      />
                    ) : (
                      <img src={item.url} alt="" className="popover-media-blur" aria-hidden="true" referrerPolicy="no-referrer" />
                    )}
                    {isSvgUrl(item.url) ? (
                      <SvgSafeImage
                        src={item.url}
                        alt={item.field}
                        className="popover-media-img"
                        fitMode="contain"
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <img src={item.url} alt={item.field} className="popover-media-img" referrerPolicy="no-referrer" />
                    )}
                    <span className="popover-field-tag">{item.field}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="popover-single-container">
                {isSvgUrl(primaryCover) ? (
                  <SvgSafeImage
                    src={primaryCover}
                    alt=""
                    className="popover-media-blur"
                    fitMode="cover"
                  />
                ) : (
                  <img src={primaryCover} alt="" className="popover-media-blur" aria-hidden="true" referrerPolicy="no-referrer" />
                )}
                {isSvgUrl(primaryCover) ? (
                  <SvgSafeImage
                    src={primaryCover}
                    alt={uniqueImages[0]?.field || '封面'}
                    className="popover-media-img"
                    fitMode="contain"
                    style={{ width: '100%', height: '100%' }}
                  />
                ) : (
                  <img src={primaryCover} alt={uniqueImages[0]?.field || '封面'} className="popover-media-img" referrerPolicy="no-referrer" />
                )}
                <span className="popover-field-tag">{uniqueImages[0]?.field || 'cover'}</span>
              </div>
            )}

            <div className="popover-portal-footer">
              <div className="popover-portal-title">{post.title}</div>
              <div className="popover-portal-sub">
                {hasMultipleImages ? `共 ${uniqueImages.length} 张封面配置` : '悬停免点击预览'}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
