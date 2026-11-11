import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Copy, X, Star, AlertTriangle, RefreshCw, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../api';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { getImageAspectRatio, isSvgUrl } from '../utils/imageMeta';
import { useSafeSvgUrl } from '../utils/svgFixer';
import { ImageFilenameTag } from './ImageFilenameTag';
import { ApplyCoverButtons } from './ApplyCoverButtons';
import { SvgSafeImage } from './common/SvgSafeImage';

interface LightboxProps {
  isOpen: boolean;
  url: string;
  fallbackUrl?: string;
  title: string;
  coverFields?: string[];
  onClose: () => void;
  onApplyImage?: (url: string, fields: string[]) => void;
  onMarkBroken?: (url: string) => void;
}

export const Lightbox: React.FC<LightboxProps> = ({
  isOpen,
  url,
  fallbackUrl,
  title,
  coverFields = [],
  onClose,
  onApplyImage,
  onMarkBroken,
}) => {
  const toast = useToast();
  const { isFavorited, toggleFavorite } = useFavorites();
  const [activeUrl, setActiveUrl] = useState(url);
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'direct_ok' | 'hotlink_blocked' | 'broken' | null>(null);
  // 探测请求序号：仅接受最新一次 checkImageHealth 的结果，避免快速切换图片时旧响应覆盖新状态
  const healthRequestSeq = useRef(0);

  const isSvg = isSvgUrl(activeUrl);
  const { safeUrl: safeSvgUrl, dimensions: svgDims } = useSafeSvgUrl(isSvg ? activeUrl : null, 'contain');
  const finalDims = dimensions || svgDims || null;

  // Esc 键关闭 Lightbox
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (url) {
      setActiveUrl(url);
      setIsError(false);
      setIsLoading(true);
      setDimensions(null);
      setHealthStatus('checking');

      // 预览时直接检测资源自身原图地址在源站的可用性
      if (url.startsWith('http')) {
        const seq = ++healthRequestSeq.current;
        api.checkImageHealth(url).then(res => {
          if (seq !== healthRequestSeq.current) return;
          if (res.is_broken) {
            setHealthStatus('broken');
            setIsError(true);
            setIsLoading(false);
            // 仅 404（源站确证删除）才写入永久破图标记；
            // 网络层失败（断网/超时）与防盗链拦截都不算永久失效。
            if (res.status_code === 404) {
              onMarkBroken?.(url);
            }
          } else if (res.need_proxy) {
            setHealthStatus('hotlink_blocked');
          } else {
            setHealthStatus('direct_ok');
          }
        }).catch(() => {
          if (seq !== healthRequestSeq.current) return;
          setHealthStatus(null);
        });
      } else {
        setHealthStatus('direct_ok');
      }

      if (isSvgUrl(url)) {
        const testImg = new Image();
        testImg.src = url;
        testImg.onload = () => {
          const w = testImg.naturalWidth || testImg.width || 0;
          const h = testImg.naturalHeight || testImg.height || 0;
          if (w > 0 && h > 0) {
            setDimensions({ width: w, height: h });
          }
          setIsLoading(false);
        };
      }
    }
  }, [url, isOpen]);

  if (!isOpen || !url) return null;

  const isFav = isFavorited(activeUrl) || isFavorited(url);

  const handleCopy = () => {
    navigator.clipboard.writeText(activeUrl);
    toast.success('图片原始链接已复制到剪贴板');
  };

  const handleOpenExternal = () => {
    api.openSystemURL(activeUrl);
  };

  const handleToggleFav = () => {
    toggleFavorite({
      url: activeUrl,
      thumbUrl: fallbackUrl || activeUrl,
      title: title || '全屏预览图片',
      source: activeUrl.startsWith('data:image') ? 'poster' : 'lightbox',
    });
  };

  // 资源图片加载失败处理（源站 404 或严格防盗链）
  const handleImageError = () => {
    setIsError(true);
    setIsLoading(false);
    if (healthStatus !== 'hotlink_blocked') {
      setHealthStatus('broken');
      onMarkBroken?.(url);
    }
  };

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-content-box" onClick={e => e.stopPropagation()}>
        <div className="lightbox-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
            <span className="lightbox-title-text" title={title}>{title}</span>
            <ImageFilenameTag url={activeUrl} fallbackTitle={title} maxWidth={260} />
            {finalDims && (
              <span className="lightbox-dim-badge">
                {finalDims.width}×{finalDims.height}
                {getImageAspectRatio(finalDims.width, finalDims.height) ? ` · ${getImageAspectRatio(finalDims.width, finalDims.height)}` : ''}
              </span>
            )}
            {isFav && (
              <span style={{ color: '#f59e0b', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                <Star size={11} fill="#f59e0b" color="#f59e0b" />
                已在灵感库
              </span>
            )}

            {/* 连通性与防盗链感知提示标签 */}
            {healthStatus === 'direct_ok' && !isError && (
              <span style={{ fontSize: 11, color: '#34d399', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.25)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={11} />
                源站可直连
              </span>
            )}
            {healthStatus === 'hotlink_blocked' && (
              <span style={{ fontSize: 11, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(245, 158, 11, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ShieldAlert size={11} />
                图床防盗链拦截 (博客发布后可能无法展示)
              </span>
            )}
            {(healthStatus === 'broken' || isError) && (
              <span style={{ fontSize: 11, color: '#f87171', background: 'rgba(239, 68, 68, 0.15)', padding: '2px 8px', borderRadius: 10, border: '1px solid rgba(239, 68, 68, 0.3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={11} />
                原图源站 404 已失效
              </span>
            )}
          </div>
          <button className="btn-close-icon" onClick={onClose}><X size={18} /></button>
        </div>

        <div
          className="lightbox-img-center"
          style={{
            position: 'relative',
            width: '92vw',
            height: 'calc(88vh - 140px)',
            minHeight: 320,
          }}
        >
          {isLoading && !isError && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}>
              <Loader2 size={28} className="spin-icon" color="var(--primary-color)" />
            </div>
          )}

          {isError ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', color: '#fca5a5', textAlign: 'center' }}>
              <AlertTriangle size={36} color="#ef4444" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {healthStatus === 'hotlink_blocked' ? '该图床限制外部直接引用 (防盗链拦截)' : '原图链接源站已 404 失效'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.5, marginBottom: 16 }}>
                {healthStatus === 'hotlink_blocked'
                  ? '该图片所属服务器禁止外部网页引用，即便写入文章在博客线上也会显示裂图。建议换选其他可直接引用的壁纸。'
                  : '该原图已被摄影师或源站删除。为保证博客访问体验，系统已禁止使用此失效链接。'}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => { setIsError(false); setIsLoading(true); setActiveUrl(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now()); }}
              >
                <RefreshCw size={12} style={{ marginRight: 4 }} />
                重试加载
              </button>
            </div>
          ) : isSvg ? (
            <SvgSafeImage
              key={safeSvgUrl || activeUrl}
              src={activeUrl}
              alt={title}
              className="lightbox-preview-img image-fade-in"
              fitMode="contain"
              clickThrough
              onLoad={() => {
                setIsLoading(false);
              }}
              onError={handleImageError}
              style={{
                display: isLoading || isError ? 'none' : 'block',
                maxWidth: '92vw',
                maxHeight: 'calc(88vh - 140px)',
                width: '100%',
                height: '100%',
                aspectRatio: finalDims ? `${finalDims.width} / ${finalDims.height}` : undefined,
              }}
            />
          ) : (
            <img
              key={activeUrl}
              src={activeUrl}
              alt={title}
              className="lightbox-preview-img image-fade-in"
              referrerPolicy="no-referrer"
              onLoad={(e) => {
                setIsLoading(false);
                const w = e.currentTarget.naturalWidth || e.currentTarget.width || 0;
                const h = e.currentTarget.naturalHeight || e.currentTarget.height || 0;
                if (w > 0 && h > 0) {
                  setDimensions({ width: w, height: h });
                }
              }}
              onError={handleImageError}
              style={{ display: isLoading || isError ? 'none' : 'block' }}
            />
          )}
        </div>

        <div className="lightbox-bottom-actions">
          <div className="lightbox-apply-btns">
            {onApplyImage && !isError && healthStatus !== 'broken' && (
              <ApplyCoverButtons
                url={activeUrl}
                coverFields={coverFields}
                onApplyImage={(u, fields) => {
                  onApplyImage(u, fields);
                  onClose();
                }}
                fullLabel={true}
                size="sm"
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${isFav ? 'btn-warning-ghost' : 'btn-ghost'}`}
              onClick={handleToggleFav}
              title={isFav ? '已在收藏夹 (点击取消)' : '收藏此图片'}
            >
              <Star size={13} fill={isFav ? '#f59e0b' : 'none'} color={isFav ? '#f59e0b' : 'currentColor'} />
              <span>{isFav ? '已收藏' : '收藏'}</span>
            </button>
            <button className="btn btn-sm btn-ghost" onClick={handleCopy}>
              <Copy size={13} />
              <span>复制链接</span>
            </button>
            <button className="btn btn-sm btn-ghost" onClick={handleOpenExternal}>
              <ExternalLink size={13} />
              <span>在新窗口打开</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
