import React, { useState, useEffect } from 'react';
import { PostInfo } from '../../types';
import { Star, GitBranch, ExternalLink, Copy } from 'lucide-react';
import { useFavorites } from '../../context/FavoritesContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api';
import { SmoothImage } from '../SmoothImage';
import { ImageFilenameTag } from '../ImageFilenameTag';
import { ApplyCoverButtons } from '../ApplyCoverButtons';

interface SocialifyGeneratorProps {
  post: PostInfo;
  coverFields: string[];
  defaultOwner: string;
  defaultPattern?: string;
  defaultTheme?: string;
  onApplyImage: (url: string, fields: string[]) => void;
  onOpenLightbox: (url: string, title: string) => void;
}

export const SocialifyGenerator: React.FC<SocialifyGeneratorProps> = ({
  post,
  coverFields,
  defaultOwner,
  defaultPattern = 'Signal',
  defaultTheme = 'Dark',
  onApplyImage,
  onOpenLightbox,
}) => {
  const { isFavorited, toggleFavorite } = useFavorites();
  const toast = useToast();

  const [socialifyOwner, setSocialifyOwner] = useState(defaultOwner || '');
  const [socialifyRepo, setSocialifyRepo] = useState('');
  const [socialifyPattern, setSocialifyPattern] = useState(defaultPattern || 'Signal');
  const [socialifyTheme, setSocialifyTheme] = useState(defaultTheme || 'Dark');
  const [socialifyStatus, setSocialifyStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  // 当外部默认配置或文章变更时，同步更新默认参数
  useEffect(() => {
    if (defaultOwner && !socialifyOwner) {
      setSocialifyOwner(defaultOwner);
    }
    if (defaultPattern) {
      setSocialifyPattern(defaultPattern);
    }
    if (defaultTheme) {
      setSocialifyTheme(defaultTheme);
    }
    const cleanTitle = (post.title || '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase();
    if (cleanTitle && !socialifyRepo) {
      setSocialifyRepo(cleanTitle);
    }
  }, [post, defaultOwner, defaultPattern, defaultTheme, socialifyRepo]);

  const socialifyURL = socialifyRepo
    ? `https://socialify.git.ci/${encodeURIComponent(socialifyOwner)}/${encodeURIComponent(socialifyRepo)}/image?font=Source%20Code%20Pro&language=1&name=1&owner=1&pattern=${encodeURIComponent(socialifyPattern)}&stargazers=1&theme=${encodeURIComponent(socialifyTheme)}`
    : '';

  // 监听 Socialify URL 变更，重置加载状态并预检
  useEffect(() => {
    if (!socialifyURL) {
      setSocialifyStatus('idle');
      return;
    }
    setSocialifyStatus('loading');
  }, [socialifyURL]);

  return (
    <div className="gen-tab-pane">
      <div className="gen-config-form">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">GitHub 用户 / 组织名 (Owner):</label>
            <input
              type="text"
              className="form-input"
              placeholder="例如: torvalds 或你的 GitHub ID"
              value={socialifyOwner}
              onChange={e => setSocialifyOwner(e.target.value.trim())}
            />
          </div>
          <div className="form-group">
            <label className="form-label">仓库名称 (Repo):</label>
            <input
              type="text"
              className="form-input"
              placeholder="例如: linux 或 hexo-theme-matery"
              value={socialifyRepo}
              onChange={e => setSocialifyRepo(e.target.value.trim())}
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">背景纹理 (Pattern):</label>
            <select
              className="form-input"
              value={socialifyPattern}
              onChange={e => setSocialifyPattern(e.target.value)}
            >
              <option value="Signal">Signal 信号脉冲 (极客)</option>
              <option value="Circuit Board">Circuit Board 电路板</option>
              <option value="Formal Invitation">Formal Invitation 严谨网格</option>
              <option value="Floating Cogs">Floating Cogs 运转齿轮</option>
              <option value="Solid">Solid 纯色极简</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">明暗主题 (Theme):</label>
            <div className="filter-pill-tabs">
              <button
                type="button"
                className={`filter-pill ${socialifyTheme === 'Dark' ? 'active' : ''}`}
                onClick={() => setSocialifyTheme('Dark')}
              >
                深色 (Dark)
              </button>
              <button
                type="button"
                className={`filter-pill ${socialifyTheme === 'Light' ? 'active' : ''}`}
                onClick={() => setSocialifyTheme('Light')}
              >
                浅色 (Light)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Socialify 卡片即时预览 */}
      <div className="poster-preview-box">
        <div className="socialify-render-wrap">
          {!socialifyRepo ? (
            <div className="socialify-placeholder">
              <GitBranch size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
              <div>在上方输入 GitHub 仓库名，即刻自动渲染精美开源项目卡片封面</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                支持实时统计 Star 数、分支网格与开发语言标识
              </div>
            </div>
          ) : (
            <>
              {socialifyStatus === 'loading' && (
                <div className="socialify-loading-state">
                  <div className="loading-spinner" />
                  <span>正在从 GitHub 请求项目卡片 ({socialifyOwner}/{socialifyRepo})...</span>
                </div>
              )}

              {socialifyStatus === 'error' && (
                <div className="socialify-error-card">
                  <div className="socialify-error-badge">仓库未找到或访问超时</div>
                  <div className="socialify-error-title">
                    无法从 GitHub 获取公开仓库: <span className="highlight-repo">{socialifyOwner}/{socialifyRepo}</span>
                  </div>
                  <div className="socialify-error-hint">
                    可能该项目尚未在 GitHub 创建、仓库名拼写有误，或者设为了私有仓库。请核对上方仓库名后重试。
                  </div>
                  <div className="socialify-error-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setSocialifyStatus('loading')}
                    >
                      重试加载
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => api.openSystemURL(`https://github.com/${socialifyOwner}/${socialifyRepo}`)}
                    >
                      在 GitHub 中检查
                    </button>
                  </div>
                </div>
              )}

              {/* 实际图片元素：平滑淡入并自动探测物理分辨率 */}
              <SmoothImage
                src={socialifyURL}
                alt={`${socialifyOwner}/${socialifyRepo}`}
                className="socialify-preview-img"
                showMetaBadge={true}
                onClick={() => onOpenLightbox(socialifyURL, `Socialify: ${socialifyOwner}/${socialifyRepo}`)}
                onDimensionsLoaded={(_w, _h) => setSocialifyStatus('success')}
              />
            </>
          )}
        </div>

        {socialifyURL && (
          <div className="poster-action-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
              <ImageFilenameTag url={socialifyURL} fallbackTitle={`${socialifyRepo}-socialify.png`} maxWidth={180} />
              <span className="source-pill-badge">Socialify GitHub</span>
            </div>

            <div className="apply-btn-group">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigator.clipboard.writeText(socialifyURL);
                  toast.success('Socialify 图片外链已复制到剪贴板');
                }}
                title="复制该项目卡片外链"
              >
                <Copy size={12} />
                <span>复制外链</span>
              </button>

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => api.openSystemURL(`https://github.com/${socialifyOwner}/${socialifyRepo}`)}
                title="在浏览器中查看 GitHub 仓库"
              >
                <ExternalLink size={12} />
                <span>仓库主页</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${isFavorited(socialifyURL) ? 'btn-warning-ghost' : 'btn-ghost'}`}
                onClick={() => toggleFavorite({
                  url: socialifyURL,
                  title: `Socialify: ${socialifyOwner}/${socialifyRepo}`,
                  source: 'socialify',
                  thumbUrl: socialifyURL,
                })}
              >
                <Star size={12} fill={isFavorited(socialifyURL) ? '#f59e0b' : 'none'} color={isFavorited(socialifyURL) ? '#f59e0b' : 'currentColor'} />
                <span>{isFavorited(socialifyURL) ? '已收藏' : '收藏卡片'}</span>
              </button>

              <ApplyCoverButtons
                url={socialifyURL}
                coverFields={coverFields}
                onApplyImage={onApplyImage}
                size="sm"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
