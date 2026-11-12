import React, { useState, useEffect, useRef } from 'react';
import { BrokenReport, PostInfo } from '../types';
import { useFavorites } from '../context/FavoritesContext';
import { getImageAspectRatio, isSvgUrl } from '../utils/imageMeta';
import { useSafeSvgUrl } from '../utils/svgFixer';
import { ImageFilenameTag } from './ImageFilenameTag';
import { Icon } from './common/Icon';
import { SvgSafeImage } from './common/SvgSafeImage';

interface CoverAreaProps {
  post: PostInfo;
  coverFields: string[];
  brokenReports: BrokenReport[];
  brokenUrls?: Set<string>;
  onOpenLightbox: (url: string, title: string, fallbackUrl?: string) => void;
  onClearField: (field: string) => void;
  onClearAll: () => void;
  onDropImage: (url: string, targetFields: string[]) => void;
  onCopyText: (text: string) => void;
  onOpenSystemURL: (url: string) => void;
  onMarkBroken?: (url: string, field: string) => void;
  onUndo?: () => void;
  canUndo?: boolean;
  undoDesc?: string;
  onOpenHistory?: () => void;
  historyCount?: number;
}

// 独立的封面图片展示卡片组件，负责清空旧图、毛玻璃加载过渡与 404 容错
interface CoverImageDisplayProps {
  url: string;
  field: string;
  postFilePath: string;
  isFieldBroken: boolean;
  fitMode?: 'smart' | 'contain' | 'cover';
  onOpenLightbox: (url: string, title: string, fallbackUrl?: string) => void;
  onMarkBroken?: (url: string, field: string) => void;
}

const CoverImageDisplay: React.FC<CoverImageDisplayProps> = ({
  url,
  field,
  postFilePath,
  isFieldBroken,
  fitMode = 'smart',
  onOpenLightbox,
  onMarkBroken,
}) => {
  const [retryKey, setRetryKey] = useState(0);

  // 唯一状态键：只要博文路径、封面字段、图片地址或手动重试发生变化，立即清空旧状态
  const targetKey = `${postFilePath}::${field}::${url}::${retryKey}`;

  // loadStatus: 'loading' | 'loaded' | 'error' | 'empty'
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error' | 'empty'>(() => {
    if (!url) return 'empty';
    if (isFieldBroken) return 'error';
    return 'loading';
  });

  const [activeLoadedUrl, setActiveLoadedUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  const isSvg = isSvgUrl(url);
  const effectiveFit =
    fitMode === 'contain'
      ? 'contain'
      : fitMode === 'cover'
      ? 'cover'
      : isSvg || (dimensions && (dimensions.width / dimensions.height < 1.35 || dimensions.width / dimensions.height > 2.2))
      ? 'contain'
      : 'cover';

  const { dimensions: svgDims } = useSafeSvgUrl(
    isSvg ? (activeLoadedUrl || url) : null,
    effectiveFit
  );

  const finalDims = dimensions || svgDims || null;

  // 记录上一个有效目标键，避免非预期状态错位
  const prevTargetKeyRef = useRef(targetKey);

  useEffect(() => {
    if (prevTargetKeyRef.current !== targetKey) {
      prevTargetKeyRef.current = targetKey;
      if (!url) {
        setLoadStatus('empty');
        setActiveLoadedUrl(null);
        setDimensions(null);
        return;
      }
      if (isFieldBroken) {
        setLoadStatus('error');
        setActiveLoadedUrl(null);
        setDimensions(null);
        return;
      }
      setLoadStatus('loading');
      setActiveLoadedUrl(null);
      setDimensions(null);
    }
  }, [targetKey, url, isFieldBroken]);

  // 启动图片异步加载探测
  useEffect(() => {
    if (!url || isFieldBroken) return;

    let isCurrent = true;
    const img = new window.Image();
    img.referrerPolicy = 'no-referrer';
    img.src = url;

    if (img.complete && img.naturalWidth > 0) {
      setActiveLoadedUrl(url);
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setLoadStatus('loaded');
      return;
    }

    img.onload = () => {
      if (!isCurrent) return;
      setActiveLoadedUrl(url);
      setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      setLoadStatus('loaded');
    };

    img.onerror = () => {
      if (!isCurrent) return;
      setActiveLoadedUrl(null);
      setDimensions(null);
      setLoadStatus('error');
      onMarkBroken?.(url, field);
    };

    return () => {
      isCurrent = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [url, targetKey, isFieldBroken]);

  if (loadStatus === 'empty' || !url) {
    return (
      <div className="cover-img-placeholder">
        <Icon name="image" size="xl" variant="muted" className="cover-placeholder-icon" />
        <span className="cover-placeholder-text">未设置图片，可从下方选择或拖拽至此</span>
      </div>
    );
  }

  return (
    <>
      {loadStatus === 'loading' && (
        <div className="cover-frosted-loader">
          <div className="cover-frosted-shine" />
          <Icon name="loading" size="lg" animation="spin" variant="primary" className="spin-icon" />
          <span className="cover-loader-text">
            正在载入封面图片...
          </span>
        </div>
      )}

      {loadStatus === 'error' && (
        <div
          className="cover-error-placeholder"
          onClick={() => setRetryKey(k => k + 1)}
          title="点击重新探测加载"
        >
          <Icon name="warning" size="lg" variant="danger" />
          <div className="cover-error-title">
            图片暂时无法载入 (防盗链或网络超时)
          </div>
          <div className="cover-error-desc">
            可点击重新检测，或从下方图库拖拽新配图替换
          </div>
          <div className="cover-error-actions">
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={e => { e.stopPropagation(); setRetryKey(k => k + 1); }}
            >
              <Icon name="refresh" size="xs" />
              <span>重新加载</span>
            </button>
          </div>
        </div>
      )}

      {loadStatus === 'loaded' && activeLoadedUrl && (() => {
        return (
          <>
            {effectiveFit === 'contain' && (
              isSvg ? (
                <SvgSafeImage
                  src={activeLoadedUrl}
                  alt=""
                  aria-hidden="true"
                  className="cover-ambient-blur"
                  fitMode="cover"
                  clickThrough
                />
              ) : (
                <img
                  src={activeLoadedUrl}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="cover-ambient-blur"
                />
              )
            )}
            {isSvg ? (
              <SvgSafeImage
                key={activeLoadedUrl}
                src={activeLoadedUrl}
                alt={field}
                className={`cover-img-display ${effectiveFit === 'contain' ? 'fit-contain' : 'fit-cover'} cover-fade-in`}
                fitMode={effectiveFit}
                clickThrough={false}
                onClick={() => onOpenLightbox(activeLoadedUrl, `文章封面: ${field}`)}
                title={`点击全屏大图预览 (${effectiveFit === 'contain' ? '完整呈现模式' : '铺满裁切模式'})`}
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: effectiveFit === 'contain' ? '96%' : '100%',
                  maxHeight: effectiveFit === 'contain' ? '96%' : '100%',
                  aspectRatio:
                    effectiveFit === 'contain' && finalDims
                      ? `${finalDims.width} / ${finalDims.height}`
                      : undefined,
                }}
              />
            ) : (
              <img
                src={activeLoadedUrl}
                alt={field}
                referrerPolicy="no-referrer"
                className={`cover-img-display ${effectiveFit === 'contain' ? 'fit-contain' : 'fit-cover'} cover-fade-in`}
                onClick={() => onOpenLightbox(activeLoadedUrl, `文章封面: ${field}`)}
                title={`点击全屏大图预览 (${effectiveFit === 'contain' ? '完整呈现模式' : '铺满裁切模式'})`}
              />
            )}
            {finalDims && (
              <div className="image-dimension-badge">
                <span>{finalDims.width}×{finalDims.height}</span>
                {getImageAspectRatio(finalDims.width, finalDims.height) && (
                  <span className="ratio-sub-badge">
                    {getImageAspectRatio(finalDims.width, finalDims.height)}
                  </span>
                )}
              </div>
            )}
          </>
        );
      })()}
    </>
  );
};

export const CoverArea: React.FC<CoverAreaProps> = ({
  post,
  coverFields,
  brokenReports,
  brokenUrls,
  onOpenLightbox,
  onClearField,
  onClearAll,
  onDropImage,
  onCopyText,
  onOpenSystemURL,
  onMarkBroken,
  onUndo,
  canUndo = false,
  undoDesc = '',
  onOpenHistory,
  historyCount = 0,
}) => {
  const { isFavorited, toggleFavorite } = useFavorites();

  // 折叠吸顶状态支持 (方案 A: Sticky & Collapsible Cover Bar)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('hpic_cover_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const [fitModes, setFitModes] = useState<Record<string, 'contain' | 'cover'>>({});

  const toggleFitMode = (field: string, defaultMode: 'contain' | 'cover') => {
    setFitModes(prev => {
      const current = prev[field] || defaultMode;
      return {
        ...prev,
        [field]: current === 'contain' ? 'cover' : 'contain',
      };
    });
  };

  const toggleCollapsed = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('hpic_cover_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // 查找当前文章是否真正包含 404 封面
  const currentBroken = brokenReports.filter(r => {
    if (r.file_path !== post.file_path) return false;
    const currentUrl = (post.images && post.images[r.field]) || '';
    return currentUrl.trim() !== '' && currentUrl.trim() === r.url.trim();
  });

  // 计算当前博文中被确认失效的封面字段数量
  const brokenFieldList = coverFields.filter(f => {
    const fUrl = (post.images && post.images[f]) || '';
    return currentBroken.some(b => b.field === f) || (!!fUrl && !!brokenUrls?.has(fUrl));
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, fields: string[]) => {
    e.preventDefault();
    const url = e.dataTransfer.getData('text/plain');
    if (url) {
      onDropImage(url, fields);
    }
  };

  // 极简吸顶迷你状态栏 (精炼克制，绝不堆砌罗列操作)
  if (isCollapsed) {
    return (
      <section className="post-cover-section collapsed sticky-top-cover-bar">
        <div className="mini-cover-bar-content">
          {/* 左区：轻量展开指示器 + 标题与草稿标记 */}
          <div className="mini-bar-left" onClick={toggleCollapsed} title="点击展开完整封面工作台">
            <span className="mini-expand-icon">
              <Icon name="chevronDown" size="xs" variant="primary" />
            </span>
            <span className="mini-post-title" title={post.title}>
              {post.is_draft && <span className="post-type-tag draft">草稿</span>}
              {post.title}
            </span>
          </div>

          {/* 中区：精致封面槽位预览 (支持直接查看与拖拽覆盖) */}
          <div className="mini-slots-container">
            {coverFields.map(field => {
              const url = (post.images && post.images[field]) || '';
              const isBroken = brokenFieldList.includes(field);

              return (
                <div
                  key={field}
                  className={`mini-cover-slot ${url ? 'has-image' : 'empty'} ${isBroken ? 'broken' : ''}`}
                  onDragOver={handleDragOver}
                  onDrop={e => handleDrop(e, [field])}
                  onClick={() => url && onOpenLightbox(url, `${post.title} - ${field}`)}
                  title={url ? `[${field}] 点击看大图，可拖拽新图替换` : `[${field}] 暂未配置，可拖拽图片至此`}
                >
                  {url ? (
                    <SvgSafeImage src={url} alt={field} className="mini-slot-img" fitMode="cover" />
                  ) : (
                    <div className="mini-slot-empty">
                      <Icon name="image" size="xs" variant="muted" />
                    </div>
                  )}
                  <span className="mini-slot-field-label">{field}</span>
                </div>
              );
            })}
          </div>

          {/* 右区：极简克制的操作胶囊 (按需浮现，绝不冗余罗列) */}
          <div className="mini-bar-actions">
            {canUndo && (
              <button
                type="button"
                className="mini-action-pill undo-pill"
                onClick={onUndo}
                title={`撤销上一操作: ${undoDesc || '恢复变更前封面'}`}
              >
                <Icon name="undo" size="xs" />
                <span>撤销</span>
              </button>
            )}

            {historyCount > 0 && (
              <button
                type="button"
                className="mini-action-pill history-pill"
                onClick={onOpenHistory}
                title="查看时光机历史记录"
              >
                <Icon name="history" size="xs" />
                <span className="mini-history-badge">{historyCount}</span>
              </button>
            )}

            <button
              type="button"
              className="mini-expand-text-btn"
              onClick={toggleCollapsed}
              title="展开完整封面工作区"
            >
              <span>展开</span>
              <Icon name="chevronDown" size="xs" />
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 展开状态下的完整面板
  return (
    <section className="post-cover-section">
      <div className="section-head-bar">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 className="current-post-title">{post.title}</h2>
            {post.is_draft && <span className="post-type-tag draft">本地草稿</span>}
          </div>
          <div className="current-post-path">{post.file_name}</div>
        </div>

        <div className="post-head-actions">
          {/* 专属博文撤销按钮 */}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onUndo}
            disabled={!canUndo}
            title={canUndo ? `撤销上一操作: ${undoDesc || '恢复变更前封面'}` : '当前文章暂无可撤销操作'}
            data-testid="cover-undo-button"
          >
            <Icon name="undo" size="xs" />
            <span>撤销</span>
          </button>

          {/* 专属博文变更历史 */}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={onOpenHistory}
            title="查看此博文的所有封面演变历史与时光机快照"
          >
            <Icon name="history" size="xs" />
            <span>历史</span>
            {historyCount > 0 && <span className="tab-count-badge">{historyCount}</span>}
          </button>

          {/* 全部清空 */}
          <button className="btn btn-sm btn-ghost" onClick={onClearAll} title="清空该文章的全部封面字段">
            <Icon name="trash" size="xs" />
            <span>清空</span>
          </button>

          {/* 收起面板为吸顶栏 */}
          <button
            type="button"
            className="btn btn-sm btn-ghost collapse-toggle-btn"
            onClick={toggleCollapsed}
            title="收起封面面板，最大化下方图库可视面积"
          >
            <Icon name="chevronUp" size="xs" />
            <span>收起面板</span>
          </button>
        </div>
      </div>

      {brokenFieldList.length > 0 && (
        <div className="warning-banner-box">
          <Icon name="warning" size="md" variant="danger" />
          <span>检测到该文章有 {brokenFieldList.length} 个封面链接已失效 (404)，建议从下方重新挑选并替换。</span>
        </div>
      )}

      {/* 封面字段卡片网格 */}
      <div className="cover-cards-grid">
        {coverFields.map(field => {
          const url = (post.images && post.images[field]) || '';
          const hasImage = !!url;
          const isFieldBroken = currentBroken.some(b => b.field === field) || (hasImage && !!brokenUrls?.has(url));
          const isFav = isFavorited(url);

          const isSvg = isSvgUrl(url);
          const defaultFit = isSvg ? 'contain' : 'cover';
          const currentFit = fitModes[field] || defaultFit;

          return (
            <div
              key={field}
              className={`cover-card ${isFieldBroken ? 'card-broken' : ''}`}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, [field])}
              data-testid="cover-card"
              data-field={field}
            >
              <div className="cover-card-header">
                <span className="field-tag-name">{field}</span>
                <div className="cover-card-header-right">
                  {hasImage && !isFieldBroken && (
                    <button
                      type="button"
                      className={`cover-fit-mode-btn ${currentFit === 'contain' ? 'active' : ''}`}
                      onClick={() => toggleFitMode(field, defaultFit)}
                      title={
                        currentFit === 'contain'
                          ? '当前: 完整原貌模式 (带环境光，代码不裁切，点击切换为填满裁切)'
                          : '当前: 填满裁切模式 (点击切换为完整呈现)'
                      }
                    >
                      <Icon name={currentFit === 'contain' ? 'minimize' : 'maximize'} size="xs" />
                      <span>{currentFit === 'contain' ? '完整' : '铺满'}</span>
                    </button>
                  )}
                  {hasImage && isFav && (
                    <span className="cover-fav-pill">
                      <Icon name="star" size="xs" style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                      <span>已收藏</span>
                    </span>
                  )}
                  {isFieldBroken && <span className="broken-badge">404 失效</span>}
                </div>
              </div>

              <div className="cover-img-wrap">
                <CoverImageDisplay
                  key={`${post.file_path}::${field}::${url}`}
                  url={url}
                  field={field}
                  postFilePath={post.file_path}
                  isFieldBroken={isFieldBroken}
                  fitMode={currentFit}
                  onOpenLightbox={onOpenLightbox}
                  onMarkBroken={onMarkBroken}
                />
              </div>

              <div className="cover-card-actions">
                <ImageFilenameTag
                  url={url}
                  fallbackTitle={`${post.title}-${field}`}
                  maxWidth="55%"
                />
                <div className="action-buttons-group">
                  <button
                    type="button"
                    className={`btn btn-sm ${isFav ? 'btn-warning-ghost' : 'btn-ghost'}`}
                    onClick={() => toggleFavorite({
                      url,
                      title: `《${post.title}》${field}`,
                      source: 'blog',
                    })}
                    disabled={!hasImage}
                    title={isFav ? '已在灵感收藏夹 (点击取消)' : '收藏此封面到灵感库'}
                  >
                    <Icon name="star" size="xs" style={{ fill: isFav ? '#f59e0b' : 'none', color: isFav ? '#f59e0b' : 'var(--text-muted)' }} />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => onOpenSystemURL(url)}
                    disabled={!hasImage}
                    title="在浏览器中查看原图"
                  >
                    <Icon name="external" size="xs" />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => onCopyText(url)}
                    disabled={!hasImage}
                    title="复制图片链接"
                  >
                    <Icon name="copy" size="xs" />
                  </button>
                  <button
                    className="btn btn-sm btn-danger-ghost"
                    onClick={() => onClearField(field)}
                    disabled={!hasImage}
                    title="清除此封面字段"
                  >
                    <Icon name="trash" size="xs" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
