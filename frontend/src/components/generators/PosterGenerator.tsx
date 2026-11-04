import React, { useState, useEffect } from 'react';
import { PostInfo } from '../../types';
import { generatePosterSVG, posterSVGToDataURI, PosterOptions } from '../../utils/poster';
import { Star } from 'lucide-react';
import { useFavorites } from '../../context/FavoritesContext';
import { ImageFilenameTag } from '../ImageFilenameTag';
import { ApplyCoverButtons } from '../ApplyCoverButtons';

interface PosterGeneratorProps {
  post: PostInfo;
  coverFields: string[];
  defaultOwner: string;
  onApplyImage: (url: string, fields: string[]) => void;
  onOpenLightbox: (url: string, title: string) => void;
}

export const PosterGenerator: React.FC<PosterGeneratorProps> = ({
  post,
  coverFields,
  defaultOwner,
  onApplyImage,
  onOpenLightbox,
}) => {
  const { isFavorited, toggleFavorite } = useFavorites();
  const [posterTheme, setPosterTheme] = useState<PosterOptions['theme']>('glass');
  const [posterTitle, setPosterTitle] = useState(post.title);
  const [posterSubtitle, setPosterSubtitle] = useState('');
  const [posterCategory, setPosterCategory] = useState(post.categories || 'Technology');
  const [posterSVG, setPosterSVG] = useState('');

  useEffect(() => {
    setPosterTitle(post.title);
    setPosterCategory(post.categories || 'Technology');
  }, [post]);

  useEffect(() => {
    const rawTags = (post.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const svg = generatePosterSVG({
      title: posterTitle,
      subtitle: posterSubtitle,
      category: posterCategory,
      tags: rawTags,
      date: post.date || post.updated,
      author: defaultOwner || 'Hexo Blog',
      theme: posterTheme,
    });
    setPosterSVG(svg);
  }, [posterTitle, posterSubtitle, posterCategory, posterTheme, post, defaultOwner]);

  const posterDataURI = posterSVGToDataURI(posterSVG);

  return (
    <div className="gen-tab-pane">
      <div className="gen-config-form">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">海报视觉风格 (Theme):</label>
            <div className="filter-pill-tabs">
              {(['terminal', 'gradient', 'minimal', 'cyberpunk', 'glass'] as const).map(th => (
                <button
                  key={th}
                  type="button"
                  className={`filter-pill ${posterTheme === th ? 'active' : ''}`}
                  onClick={() => setPosterTheme(th)}
                >
                  {th === 'terminal' && '暗黑极客'}
                  {th === 'gradient' && '极光渐变'}
                  {th === 'minimal' && '纯净简约'}
                  {th === 'cyberpunk' && '赛博朋克'}
                  {th === 'glass' && '毛玻璃质感'}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">技术分类 (Category):</label>
            <input
              type="text"
              className="form-input"
              value={posterCategory}
              onChange={e => setPosterCategory(e.target.value)}
            />
          </div>
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">主标题文本:</label>
            <input
              type="text"
              className="form-input"
              value={posterTitle}
              onChange={e => setPosterTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">副标题 / 导语 (可选):</label>
            <input
              type="text"
              className="form-input"
              placeholder="一句话核心引言..."
              value={posterSubtitle}
              onChange={e => setPosterSubtitle(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* 海报即时预览卡片 */}
      <div className="poster-preview-box">
        <div
          key={posterTheme + posterTitle + posterSubtitle}
          className="poster-svg-render-container image-fade-in"
          dangerouslySetInnerHTML={{ __html: posterSVG }}
          onClick={() => onOpenLightbox(posterDataURI, `极客海报: ${posterTitle}`)}
          title="点击全屏预览海报"
        />
        <div className="poster-action-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
            <ImageFilenameTag url={posterDataURI} fallbackTitle="poster-cover.svg" maxWidth={180} />
            <span className="source-pill-badge">1200×630 · 16:9</span>
          </div>
          <div className="apply-btn-group">
            <button
              type="button"
              className={`btn btn-sm ${isFavorited(posterDataURI) ? 'btn-warning-ghost' : 'btn-ghost'}`}
              onClick={() => toggleFavorite({
                url: posterDataURI,
                title: `海报: ${posterTitle}`,
                source: 'poster',
                thumbUrl: posterDataURI,
              })}
              title={isFavorited(posterDataURI) ? '已收藏' : '加入灵感收藏夹'}
            >
              <Star size={12} fill={isFavorited(posterDataURI) ? '#f59e0b' : 'none'} color={isFavorited(posterDataURI) ? '#f59e0b' : 'currentColor'} />
              <span>{isFavorited(posterDataURI) ? '已收藏' : '收藏海报'}</span>
            </button>
            <ApplyCoverButtons
              url={posterDataURI}
              coverFields={coverFields}
              onApplyImage={onApplyImage}
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
