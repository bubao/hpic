import React, { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, ChevronDown, Sparkles } from 'lucide-react';
import { GENERATOR_REGISTRY, DEFAULT_GENERATOR_KEY } from './generators/registry';
import type { GeneratorDescriptor, GeneratorProps } from './generators/registry';

interface GeneratorsProps extends GeneratorProps {
  embedded?: boolean;
}

/** 主区域直接展示的常用生成器；其余收进「更多」下拉。 */
const PRIMARY_GENERATOR_KEYS = ['socialify', 'skillicons', 'poster', 'opengraph'];

/** 「更多」下拉内按用途分组的生成器。 */
const MORE_GENERATOR_GROUPS: { label: string; keys: string[] }[] = [
  { label: '图片生成', keys: ['picsum', 'loremflickr', 'pollinations', 'dicebear'] },
  { label: '徽章与统计', keys: ['shields', 'github-stats'] },
  { label: '图表与工具', keys: ['quickchart', 'placeholder', 'qr'] },
];

const findGenerator = (key: string): GeneratorDescriptor | undefined =>
  GENERATOR_REGISTRY.find(g => g.key === key);

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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);

  // 点击「更多」面板外部或按 Escape 时关闭下拉
  useEffect(() => {
    if (!isMoreOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (moreWrapRef.current && !moreWrapRef.current.contains(e.target as Node)) {
        setIsMoreOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMoreOpen]);

  const ActiveGenerator = findGenerator(activeTab)?.Component;
  const primaryGenerators = PRIMARY_GENERATOR_KEYS.map(findGenerator).filter(
    (g): g is GeneratorDescriptor => !!g,
  );
  // 当前选中的生成器位于「更多」分组时，高亮「更多」入口
  const moreActive = !PRIMARY_GENERATOR_KEYS.includes(activeTab);

  // 生成器选择器：主 Tab 横向滚动 + 右侧固定「更多」下拉
  const renderTabs = () => (
    <div className="gen-tabs-row">
      <div className="filter-pill-tabs" role="tablist" aria-label="生成器类型">
        {primaryGenerators.map(g => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={activeTab === g.key}
            className={`filter-pill ${activeTab === g.key ? 'active' : ''}`}
            onClick={() => setActiveTab(g.key)}
            title={g.title}
          >
            <g.icon size={13} style={{ marginRight: 4 }} />
            <span>{g.label}</span>
          </button>
        ))}
      </div>

      <div className="gen-more-wrap" ref={moreWrapRef}>
        <button
          type="button"
          className={`filter-pill ${moreActive ? 'active' : ''}`}
          onClick={() => setIsMoreOpen(v => !v)}
          aria-haspopup="true"
          aria-expanded={isMoreOpen}
          title="更多生成器"
        >
          <MoreHorizontal size={13} style={{ marginRight: 4 }} />
          <span>更多</span>
          <ChevronDown size={12} style={{ marginLeft: 2 }} />
        </button>
        {isMoreOpen && (
          <div className="gen-more-panel" role="menu">
            {MORE_GENERATOR_GROUPS.map(group => (
              <div key={group.label} className="gen-more-group">
                <div className="gen-more-group-title">{group.label}</div>
                <div className="gen-more-group-items">
                  {group.keys.map(key => {
                    const g = findGenerator(key);
                    if (!g) return null;
                    return (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        className={`gen-more-item ${activeTab === key ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab(key);
                          setIsMoreOpen(false);
                        }}
                        title={g.title}
                      >
                        <g.icon size={12} style={{ marginRight: 4 }} />
                        <span>{g.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderActive = () =>
    ActiveGenerator ? (
      <ActiveGenerator
        post={post}
        coverFields={coverFields}
        defaultOwner={defaultOwner}
        defaultPattern={defaultPattern}
        defaultTheme={defaultTheme}
        onApplyImage={onApplyImage}
        onOpenLightbox={onOpenLightbox}
      />
    ) : null;

  // 嵌入模式：去掉卡片外壳与重复标题，仅保留紧凑选择器 + 生成器面板
  if (embedded) {
    return (
      <div className="generators-embedded">
        {renderTabs()}
        {renderActive()}
      </div>
    );
  }

  return (
    <div className="generators-card-section">
      <div className="gen-header-row">
        <div className="gen-title-group">
          <Sparkles size={16} className="sparkle-icon" />
          <h3 className="section-title">动态技术封面生成</h3>
        </div>
      </div>
      {renderTabs()}
      {renderActive()}
    </div>
  );
};
