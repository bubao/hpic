import React, { useState, useEffect } from 'react';
import { Loader2, ImageOff } from 'lucide-react';
import { getImageAspectRatio } from '../utils/imageMeta';

export interface SmoothImageProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackSrc?: string;
  placeholderClassName?: string;
  showSpinner?: boolean;
  showMetaBadge?: boolean;
  onDimensionsLoaded?: (width: number, height: number) => void;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
  referrerPolicy?: React.HTMLAttributeReferrerPolicy;
  title?: string;
}

/**
 * 带有平滑过渡与旧图清空特性的图片展示组件
 * 当图片 URL 发生变化时，立即清空旧图（无任何残影残留），进入骨架/微光占位状态，
 * 直到新图完全下载就绪后挂载并播放细腻平滑的缩放模糊淡入动画。
 * 同时自动检测捕获渲染后的物理分辨率 (naturalWidth x naturalHeight)。
 */
export const SmoothImage: React.FC<SmoothImageProps> = ({
  src,
  alt = '',
  className = '',
  style,
  fallbackSrc,
  placeholderClassName = '',
  showSpinner = false,
  showMetaBadge = false,
  onDimensionsLoaded,
  onClick,
  referrerPolicy = 'no-referrer',
  title,
}) => {
  // 当前真正成功渲染出来的图片 URL (在下一张新图尚未 onload 前保持 null，杜绝旧图残影)
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!src) {
      setRenderedUrl(null);
      setStatus('loading');
      setDimensions(null);
      return;
    }

    // 核心步骤 1：只要图片 URL 改变，第一时间立即清空旧图，进入过渡状态！
    setRenderedUrl(null);
    setStatus('loading');
    setDimensions(null);

    let active = true;
    const img = new Image();
    img.referrerPolicy = referrerPolicy;
    img.src = src;

    img.onload = () => {
      if (!active) return;
      setRenderedUrl(src);
      setStatus('loaded');
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w > 0 && h > 0) {
        setDimensions({ width: w, height: h });
        onDimensionsLoaded?.(w, h);
      }
    };

    img.onerror = () => {
      if (!active) return;
      // 坚持纯净源站地址：失败即进入 error 状态，不再尝试本地代理
      setStatus('error');
    };

    return () => {
      active = false;
      img.onload = null;
      img.onerror = null;
    };
  }, [src, fallbackSrc, referrerPolicy, onDimensionsLoaded]);

  return (
    <div className={`smooth-image-wrapper ${status} ${placeholderClassName}`} style={style}>
      {/* 加载阶段：展示无旧图残留的流光骨架屏 */}
      {status === 'loading' && (
        <div className="smooth-image-skeleton">
          <div className="skeleton-shimmer" />
          {showSpinner && <Loader2 size={20} className="spin-icon" color="var(--primary-color)" />}
        </div>
      )}

      {/* 加载失败阶段 */}
      {status === 'error' && (
        <div className="smooth-image-error">
          <ImageOff size={22} style={{ opacity: 0.5 }} />
        </div>
      )}

      {/* 核心步骤 2：新图预载就绪后挂载全新 DOM 节点，触发 CSS 渐入动效 */}
      {status === 'loaded' && renderedUrl && (
        <>
          <img
            key={renderedUrl}
            src={renderedUrl}
            alt={alt}
            title={title}
            className={`image-fade-in ${className}`}
            onClick={onClick}
            referrerPolicy={referrerPolicy}
          />
          {showMetaBadge && dimensions && (
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
    </div>
  );
};
