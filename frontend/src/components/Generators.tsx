import React, { useState } from 'react';
import { PostInfo } from '../types';
import { Sparkles, Layers, GitBranch, Code2 } from 'lucide-react';
import { PosterGenerator } from './generators/PosterGenerator';
import { SocialifyGenerator } from './generators/SocialifyGenerator';
import { SkillIconsGenerator } from './generators/SkillIconsGenerator';

interface GeneratorsProps {
  post: PostInfo;
  coverFields: string[];
  defaultOwner: string;
  defaultPattern?: string;
  defaultTheme?: string;
  embedded?: boolean;
  onApplyImage: (url: string, fields: string[]) => void;
  onOpenLightbox: (url: string, title: string) => void;
}

export const Generators: React.FC<GeneratorsProps> = ({
  post,
  coverFields,
  defaultOwner,
  defaultPattern = 'Signal',
  defaultTheme = 'Dark',
  embedded = false,
  onApplyImage,
  onOpenLightbox,
}) => {
  const [activeTab, setActiveTab] = useState<'poster' | 'socialify' | 'skillicons'>('socialify');

  return (
    <div className={embedded ? 'generators-embedded' : 'generators-card-section'}>
      <div className="gen-header-row" style={embedded ? { marginBottom: 12 } : undefined}>
        <div className="gen-title-group">
          {embedded ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>生成器类型:</span>
          ) : (
            <>
              <Sparkles size={16} className="sparkle-icon" />
              <h3 className="section-title">动态技术封面生成</h3>
            </>
          )}
        </div>

        <div className="filter-pill-tabs">
          <button
            type="button"
            className={`filter-pill ${activeTab === 'socialify' ? 'active' : ''}`}
            onClick={() => setActiveTab('socialify')}
            title="渲染 GitHub 仓库精美 Star 卡片"
          >
            <GitBranch size={13} style={{ marginRight: 4 }} />
            <span>Socialify 开源卡片</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeTab === 'skillicons' ? 'active' : ''}`}
            onClick={() => setActiveTab('skillicons')}
            title="组合渲染技术栈徽章"
          >
            <Code2 size={13} style={{ marginRight: 4 }} />
            <span>SkillIcons 技术栈</span>
          </button>
          <button
            type="button"
            className={`filter-pill ${activeTab === 'poster' ? 'active' : ''}`}
            onClick={() => setActiveTab('poster')}
            title="自动从博文标题、标签和分类渲染 SVG 海报"
          >
            <Layers size={13} style={{ marginRight: 4 }} />
            <span>极客海报 (Poster)</span>
          </button>
        </div>
      </div>

      {activeTab === 'poster' && (
        <PosterGenerator
          post={post}
          coverFields={coverFields}
          defaultOwner={defaultOwner}
          onApplyImage={onApplyImage}
          onOpenLightbox={onOpenLightbox}
        />
      )}

      {activeTab === 'socialify' && (
        <SocialifyGenerator
          post={post}
          coverFields={coverFields}
          defaultOwner={defaultOwner}
          defaultPattern={defaultPattern}
          defaultTheme={defaultTheme}
          onApplyImage={onApplyImage}
          onOpenLightbox={onOpenLightbox}
        />
      )}

      {activeTab === 'skillicons' && (
        <SkillIconsGenerator
          coverFields={coverFields}
          onApplyImage={onApplyImage}
          onOpenLightbox={onOpenLightbox}
        />
      )}
    </div>
  );
};
