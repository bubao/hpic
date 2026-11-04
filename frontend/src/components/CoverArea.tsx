import React, { useState, useEffect } from 'react';
import { BrokenReport, PostInfo } from '../types';
import { ExternalLink, Copy, Trash2, AlertTriangle, Image as ImageIcon, Star, RefreshCw, Loader2 } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';
import { getImageAspectRatio } from '../utils/imageMeta';
import { ImageFilenameTag } from './ImageFilenameTag';

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
}

// 独立的封面图片展示卡片组件，负责清空旧图、毛玻璃加载过渡与 404 容错
interface CoverImageDisplayProps {
  url: string;
  field: string;
  postFilePath: string;
  isFieldBroken: boolean;
  onOpenLightbox: (url: string, title: string, fallbackUrl?: string) => void;
  onMarkBroken?: (url: string, field: string) => void;
}

const CoverImageDisplay: React.FC<CoverImageDisplayProps> = ({
  url,
  field,
  postFilePath,
  isFieldBroken,
  onOpenLightbox,
  onMarkBroken,
}) => {
  const [retryKey, setRetryKey] = useState(0);

  // 唯一状态键：只要博文路径、封面字段、图片地址或手动重试发生变化，立即清空旧状态
  const targetKey = `${postFilePath}::${field}::${url}::${retryKey}`;
  const [prevTargetKey, setPrevTargetKey] = useState(targetKey);

  // loadStatus: 'loading' | 'loaded' | 'error' | 'empty'
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error' | 'empty'>(() => {
    if (!url) return 'empty';
    if (isFieldBroken) return 'error';
    return 'loading';
  });

  // 实际已预载成功并允许渲染出来的图片地址 (未完成预载前始终为 null，彻底防止旧图残影)
  const [activeLoadedUrl, setActiveLoadedUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  // 核心：在渲染阶段同步检测 targetKey 变化！
  // 一旦用户从一个博客点击到另一个博客，在提交给浏览器绘制的第 0 帧就立即将旧图清空为 null，杜绝异步 useEffect 造成的旧图残影！
  if (prevTargetKey !== targetKey) {
    setPrevTargetKey(targetKey);
    setActiveLoadedUrl(null); // 立即同步清空旧图！
    setDimensions(null);
    if (!url) {
      setLoadStatus('empty');
    } else if (isFieldBroken) {
      setLoadStatus('error');
    } else {
      setLoadStatus('loading');
    }
  }

  // 核心：后台通过内存 Image 对象预加载，保证只有新图真正就绪后才更新渲染
  useEffect(() => {
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

    let isCurrent = true;
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = url;

    img.onload = () => {
      if (!isCurrent) return;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
      }
      setActiveLoadedUrl(url);
      setLoadStatus('loaded');
    };

    img.onerror = () => {
      if (!isCurrent) return;
      // 直连失败（404 或防盗链），纯净报错并标记 error，绝不使用本地代理充数
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

  // 1. 无图片地址情况：展示标准占位卡片
  if (loadStatus === 'empty' || !url) {
    return (
      <div className="cover-img-placeholder">
        <ImageIcon size={28} style={{ opacity: 0.4 }} />
        <span style={{ fontSize: 12, opacity: 0.7 }}>未设置图片，可从下方选择或拖拽至此</span>
      </div>
    );
  }

  return (
    <>
      {/* 2. 毛玻璃微光过渡动画层 (旧图先清空，底层为干净深色背景，加载就绪前持续呈现毛玻璃流光动画) */}
      {loadStatus === 'loading' && (
        <div className="cover-frosted-loader">
          <div className="cover-frosted-shine" />
          <Loader2 size={22} className="spin-icon" color="var(--primary-color)" />
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', zIndex: 1, fontWeight: 500 }}>
            正在载入封面图片...
          </span>
        </div>
      )}

      {/* 3. 图片加载失败容错卡片 */}
      {loadStatus === 'error' && (
        <div
          className="cover-error-placeholder"
          onClick={() => setRetryKey(k => k + 1)}
          title="点击重新探测加载"
        >
          <AlertTriangle size={24} color="#ef4444" style={{ marginBottom: 2 }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fca5a5' }}>
            图片暂时无法载入 (防盗链或网络超时)
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            可点击重新检测，或从下方图库拖拽新配图替换
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 11, height: 24, padding: '0 8px' }}
              onClick={e => { e.stopPropagation(); setRetryKey(k => k + 1); }}
            >
              <RefreshCw size={11} style={{ marginRight: 4 }} /> 重新加载
            </button>
            {url.startsWith('http') && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 11, height: 24, padding: '0 8px', textDecoration: 'none' }}
                onClick={e => e.stopPropagation()}
              >
                <ExternalLink size={11} style={{ marginRight: 4 }} /> 浏览器直开
              </a>
            )}
          </div>
        </div>
      )}

      {/* 4. 只有预载成功后才挂载新图 (绝无旧图残影，自带平滑淡入动画与物理尺寸标牌) */}
      {loadStatus === 'loaded' && activeLoadedUrl && (
        <>
          <img
            key={activeLoadedUrl}
            src={activeLoadedUrl}
            alt={field}
            referrerPolicy="no-referrer"
            className="cover-img-display cover-fade-in"
            onClick={() => onOpenLightbox(activeLoadedUrl, `文章封面: ${field}`)}
            title="点击全屏大图预览"
          />
          {dimensions && (
            <div className="image-dimension-badge">
              <span>{dimensions.width}×{dimensions.height}</span>
              {getImageAspectRatio(dimensions.width, dimensions.height) && (
                <span className="ratio-sub-badge">
                  {getImageAspectRatio(dimensions.width, dimensions.height)}
                </span>
              )}
            </div>
          )}
        </>
      )}
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
}) => {
  const { isFavorited, toggleFavorite } = useFavorites();
  // 查找当前文章是否真正包含 404 封面 (严格比对当前字段的真实 URL 与体检报告的 URL，若用户已替换新照片则自动解除警告)
  const currentBroken = brokenReports.filter(r => {
    if (r.file_path !== post.file_path) return false;
    const currentUrl = (post.images && post.images[r.field]) || '';
    return currentUrl.trim() !== '' && currentUrl.trim() === r.url.trim();
  });

  // 计算当前博文中被确认失效的封面字段数量（综合健康报告与即时探测的 brokenUrls）
  const brokenFieldList = coverFields.filter(f => {
    const fUrl = (post.images && post.images[f]) || '';
    return currentBroken.some(b => b.field === f) || (!!fUrl && !!brokenUrls?.has(fUrl));
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, fields: string[]) => {
    e.preventDefault();
    let url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (!url) {
      const htmlText = e.dataTransfer.getData('text/html');
      const m = htmlText && htmlText.match(/src=["'](https?:\/\/[^"']+)["']/i);
      if (m) url = m[1];
    }
    if (url && (url.startsWith('http') || url.startsWith('data:image'))) {
      onDropImage(url.trim(), fields);
    }
  };

  return (
    <section className="post-cover-section">
      <div className="section-head-bar">
        <div>
          <h2 className="current-post-title">{post.title}</h2>
          <div className="current-post-path">{post.file_name}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={onClearAll} title="清空该文章的全部封面字段">
          <Trash2 size={13} style={{ marginRight: 4 }} />
          全部清空
        </button>
      </div>

      {brokenFieldList.length > 0 && (
        <div className="warning-banner-box">
          <AlertTriangle size={16} color="#ef4444" />
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

          return (
            <div
              key={field}
              className={`cover-card ${isFieldBroken ? 'card-broken' : ''}`}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, [field])}
            >
              <div className="cover-card-header">
                <span className="field-tag-name">{field}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {hasImage && isFav && (
                    <span style={{ color: '#f59e0b', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                      <Star size={11} fill="#f59e0b" color="#f59e0b" />
                      已收藏
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
                    <Star size={13} fill={isFav ? '#f59e0b' : 'none'} color={isFav ? '#f59e0b' : '#94a3b8'} />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => onOpenSystemURL(url)}
                    disabled={!hasImage}
                    title="在浏览器中查看原图"
                  >
                    <ExternalLink size={12} />
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => onCopyText(url)}
                    disabled={!hasImage}
                    title="复制图片链接"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    className="btn btn-sm btn-danger-ghost"
                    onClick={() => onClearField(field)}
                    disabled={!hasImage}
                    title="清除此封面字段"
                  >
                    <Trash2 size={12} />
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
