import React, { useState } from 'react';
import { PostInfo } from '../types';
import { Sparkles } from 'lucide-react';
import { GENERATOR_REGISTRY, DEFAULT_GENERATOR_KEY, GeneratorProps } from './generators/registry';

interface GeneratorsProps extends GeneratorProps {
  embedded?: boolean;
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
  const [activeTab, setActiveTab] = useState(DEFAULT_GENERATOR_KEY);
  const ActiveGenerator = GENERATOR_REGISTRY.find(g => g.key === activeTab)?.Component;

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
          {GENERATOR_REGISTRY.map(g => (
            <button
              key={g.key}
              type="button"
              className={`filter-pill ${activeTab === g.key ? 'active' : ''}`}
              onClick={() => setActiveTab(g.key)}
              title={g.title}
            >
              <g.icon size={13} style={{ marginRight: 4 }} />
              <span>{g.label}</span>
            </button>
          ))}
        </div>
      </div>

      {ActiveGenerator && (
        <ActiveGenerator
          post={post}
          coverFields={coverFields}
          defaultOwner={defaultOwner}
          defaultPattern={defaultPattern}
          defaultTheme={defaultTheme}
          onApplyImage={onApplyImage}
          onOpenLightbox={onOpenLightbox}
        />
      )}
    </div>
  );
};
