import React, { useState } from 'react';
import { PostInfo } from '../../types';
import { Globe, Star, Copy, Loader2 } from 'lucide-react';
import { useFavorites } from '../../context/FavoritesContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api';
import { SmoothImage } from '../SmoothImage';
import { ImageFilenameTag } from '../ImageFilenameTag';
import { ApplyCoverButtons } from '../ApplyCoverButtons';

interface OpenGraphGeneratorProps {
  post: PostInfo;
  coverFields: string[];
  defaultOwner: string;
  onApplyImage: (url: string, fields: string[]) => void;
  onOpenLightbox: (url: string, title: string) => void;
}

/**
 * OpenGraph 网页封面生成器：输入任意网页 URL，由后端抓取其 og:image 作为封面。
 * 抓取走防 SSRF 客户端，私网地址会被拒绝。
 */
export const OpenGraphGenerator: React.FC<OpenGraphGeneratorProps> = ({
  coverFields,
  onApplyImage,
  onOpenLightbox,
}) => {
  const { isFavorited, toggleFavorite } = useFavorites();
  const toast = useToast();

  const [targetUrl, setTargetUrl] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [imageUrl, setImageUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleGenerate = async () => {
    const target = targetUrl.trim();
    if (!target) return;
    setStatus('loading');
    setErrorMsg('');
    setImageUrl('');
    try {
      const res = await api.searchGalleryProvider({ provider: 'opengraph', query: target });
      const first = res.results[0];
      if (!first || !first.urls?.raw) {
        throw new Error('页面未找到 og:image');
      }
      setImageUrl(first.urls.raw);
      setStatus('success');
    } catch (e: any) {
      setStatus('error');
      setErrorMsg(e?.message || '抓取失败，请检查链接后重试');
    }
  };

  const favorited = isFavorited(imageUrl);

  return (
    <div className="gen-tab-pane">
      <div className="gen-config-form">
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          输入任意网页链接，自动抓取其 OpenGraph 封面图（og:image）。
        </div>
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">网页 URL <span style={{ color: 'var(--accent, #6366f1)', marginLeft: 2 }}>*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="例如 https://github.com/bubao/hpic"
              value={targetUrl}
              onChange={e => setTargetUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
          </div>
          <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={status === 'loading' || !targetUrl.trim()}
              onClick={handleGenerate}
            >
              {status === 'loading' ? <Loader2 size={12} className="spin" /> : <Globe size={12} />}
              <span>{status === 'loading' ? '抓取中...' : '抓取封面'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="poster-preview-box">
        {status === 'idle' && (
          <div className="socialify-placeholder">
            <Globe size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
            <div>输入网页链接后点击「抓取封面」</div>
          </div>
        )}

        {status === 'loading' && (
          <div className="socialify-loading-state">
            <div className="loading-spinner" />
            <span>正在抓取页面并解析 og:image...</span>
          </div>
        )}

        {status === 'error' && (
          <div className="socialify-error-card">
            <div className="socialify-error-badge">抓取失败</div>
            <div className="socialify-error-hint">{errorMsg}</div>
            <div className="socialify-error-actions">
              <button type="button" className="btn btn-sm btn-ghost" onClick={handleGenerate}>
                重试
              </button>
            </div>
          </div>
        )}

        {status === 'success' && imageUrl && (
          <>
            <SmoothImage
              src={imageUrl}
              alt="OpenGraph 封面"
              className="socialify-preview-img"
              showMetaBadge={true}
              onClick={() => onOpenLightbox(imageUrl, 'OpenGraph 封面')}
            />
            <div className="poster-action-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                <ImageFilenameTag url={imageUrl} fallbackTitle="opengraph-cover.jpg" maxWidth={180} />
                <span className="source-pill-badge">OpenGraph</span>
              </div>
              <div className="apply-btn-group">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(imageUrl);
                    toast.success('图片外链已复制到剪贴板');
                  }}
                >
                  <Copy size={12} />
                  <span>复制外链</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${favorited ? 'btn-warning-ghost' : 'btn-ghost'}`}
                  onClick={() => toggleFavorite({
                    url: imageUrl,
                    title: 'OpenGraph 封面',
                    source: 'opengraph',
                    thumbUrl: imageUrl,
                  })}
                >
                  <Star size={12} fill={favorited ? '#f59e0b' : 'none'} color={favorited ? '#f59e0b' : 'currentColor'} />
                  <span>{favorited ? '已收藏' : '收藏'}</span>
                </button>
                <ApplyCoverButtons url={imageUrl} coverFields={coverFields} onApplyImage={onApplyImage} size="sm" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
