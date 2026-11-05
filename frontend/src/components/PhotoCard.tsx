import React from 'react';
import { Star, Tag, ExternalLink, Copy, AlertTriangle, Code, FilePlus } from 'lucide-react';
import { SmoothImage } from './SmoothImage';
import { ImageFilenameTag } from './ImageFilenameTag';
import { ApplyCoverButtons } from './ApplyCoverButtons';

export interface PhotoCardProps {
  url: string;
  thumbUrl?: string;
  title: string;
  subtitle?: string;
  sourceBadge?: string;
  isFavorited: boolean;
  isUsedByCurrent?: boolean;
  isBroken?: boolean;
  tags?: string[];
  coverFields: string[];
  dimensions?: { width: number; height: number; quality?: string } | null;
  onToggleFavorite: () => void;
  onOpenLightbox: () => void;
  onApplyImage: (url: string, fields: string[]) => void;
  onEditTags?: () => void;
  onCopyUrl?: () => void;
  onCopyMarkdown?: () => void;
  onInsertBody?: () => void;
  onOpenExternal?: () => void;
}

/**
 * 统一的图片画廊与收藏夹卡片组件
 * 彻底消除搜图结果与收藏夹卡片之间的样式与结构差异
 */
export const PhotoCard: React.FC<PhotoCardProps> = ({
  url,
  thumbUrl,
  title,
  subtitle,
  sourceBadge,
  isFavorited,
  isUsedByCurrent = false,
  isBroken = false,
  tags,
  coverFields,
  dimensions,
  onToggleFavorite,
  onOpenLightbox,
  onApplyImage,
  onEditTags,
  onCopyUrl,
  onCopyMarkdown,
  onInsertBody,
  onOpenExternal,
}) => {
  const activeThumb = thumbUrl || url;

  return (
    <div className={`gallery-card-item ${isUsedByCurrent ? 'card-highlight-active' : ''} ${isBroken ? 'card-broken' : ''}`}>
      {/* 1. 缩略图区域 */}
      <div className="thumb-container">
        {isBroken && (
          <div className="badge-broken-corner" title="原图在源站已失效 (404)">
            <AlertTriangle size={11} /> 404 失效
          </div>
        )}

        <SmoothImage
          src={activeThumb}
          alt={title}
          className="thumb-image"
          showMetaBadge={true}
          badgeDimensions={dimensions}
          onClick={onOpenLightbox}
        />

        <button
          type="button"
          className={`fav-star-btn ${isFavorited ? 'active' : ''}`}
          onClick={e => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={isFavorited ? '已在灵感收藏夹 (点击取消)' : '收藏此图片'}
        >
          <Star size={14} fill={isFavorited ? '#f59e0b' : 'none'} color={isFavorited ? '#f59e0b' : '#94a3b8'} />
        </button>

        {isUsedByCurrent && (
          <div style={{ position: 'absolute', bottom: 6, left: 6, zIndex: 2 }}>
            <span className="used-badge-tag">
              当前博文使用中
            </span>
          </div>
        )}
      </div>

      {/* 2. 信息详情区域 */}
      <div className="card-detail-info">
        {/* 文件名透视标签 */}
        <div className="card-filename-row">
          <ImageFilenameTag url={url} fallbackTitle={title} />
        </div>

        {/* 标题 / 作者 与 来源或标签编辑 */}
        <div className="card-author-row">
          <span
            className="card-main-title"
            title={title}
          >
            {title}
          </span>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {sourceBadge && (
              <span className="source-pill-badge">
                {sourceBadge}
              </span>
            )}
            {onEditTags && (
              <button
                type="button"
                className="btn btn-xs btn-ghost btn-tag-edit"
                onClick={e => {
                  e.stopPropagation();
                  onEditTags();
                }}
                title="编辑此图片的标签"
              >
                <Tag size={10} style={{ marginRight: 2 }} /> 标签
              </button>
            )}
          </div>
        </div>

        {/* 副标题或描述 (若有) */}
        {subtitle && (
          <div className="card-subtitle-row" title={subtitle}>
            {subtitle}
          </div>
        )}

        {/* 标签列表 (收藏模式下可选展示) */}
        {tags && (
          <div className="fav-tags-display">
            {tags.length === 0 ? (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>无标签</span>
            ) : (
              tags.map(t => (
                <span key={t} className="fav-tag-pill">#{t}</span>
              ))
            )}
          </div>
        )}

        {/* 3. 统一操作按钮栏 */}
        <div className="card-bottom-actions-row">
          <ApplyCoverButtons
            url={url}
            coverFields={coverFields}
            onApplyImage={onApplyImage}
            size="sm"
            fullLabel={false}
          />

          {(onCopyUrl || onCopyMarkdown || onInsertBody || onOpenExternal) && (
            <div className="card-extra-actions">
              {onCopyMarkdown && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost btn-icon-only"
                  onClick={e => {
                    e.stopPropagation();
                    onCopyMarkdown();
                  }}
                  title="复制 Markdown 图片语法: ![标题](URL)"
                >
                  <Code size={12} />
                </button>
              )}
              {onInsertBody && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost btn-icon-only"
                  onClick={e => {
                    e.stopPropagation();
                    onInsertBody();
                  }}
                  title="一键插入此图到当前文章正文末尾"
                >
                  <FilePlus size={12} />
                </button>
              )}
              {onCopyUrl && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost btn-icon-only"
                  onClick={e => {
                    e.stopPropagation();
                    onCopyUrl();
                  }}
                  title="复制图片链接"
                >
                  <Copy size={12} />
                </button>
              )}
              {onOpenExternal && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost btn-icon-only"
                  onClick={e => {
                    e.stopPropagation();
                    onOpenExternal();
                  }}
                  title="在浏览器中查看原图"
                >
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
