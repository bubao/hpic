import React, { useState } from 'react';
import { Star, Code2, Copy } from 'lucide-react';
import { useFavorites } from '../../context/FavoritesContext';
import { useToast } from '../../context/ToastContext';
import { SmoothImage } from '../SmoothImage';
import { ImageFilenameTag } from '../ImageFilenameTag';
import { ApplyCoverButtons } from '../ApplyCoverButtons';

interface SkillIconsGeneratorProps {
  coverFields: string[];
  onApplyImage: (url: string, fields: string[]) => void;
  onOpenLightbox: (url: string, title: string) => void;
}

const COMMON_SKILLS = [
  'github', 'react', 'ts', 'js', 'bash', 'go', 'rust', 'python', 'vue',
  'docker', 'kubernetes', 'linux', 'git', 'redis', 'mysql', 'postgres',
  'nginx', 'tauri', 'electron', 'vite'
];

export const SkillIconsGenerator: React.FC<SkillIconsGeneratorProps> = ({
  coverFields,
  onApplyImage,
  onOpenLightbox,
}) => {
  const { isFavorited, toggleFavorite } = useFavorites();
  const toast = useToast();

  const [skillIcons, setSkillIcons] = useState('github,react,ts,docker,git,linux');
  const [skillTheme, setSkillTheme] = useState<'dark' | 'light'>('dark');
  const [skillPerLine, setSkillPerLine] = useState(15);

  const skillIconsURL = skillIcons.trim()
    ? `https://skillicons.dev/icons?i=${encodeURIComponent(skillIcons.trim())}&theme=${skillTheme}&perline=${skillPerLine}`
    : '';

  const toggleSkillChip = (skill: string) => {
    const list = skillIcons.split(',').map(s => s.trim()).filter(Boolean);
    if (list.includes(skill)) {
      setSkillIcons(list.filter(s => s !== skill).join(','));
    } else {
      setSkillIcons([...list, skill].join(','));
    }
  };

  return (
    <div className="gen-tab-pane">
      <div className="gen-config-form">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">每行图标展示数量 (perline):</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="range"
                min="1"
                max="25"
                className="form-range"
                style={{ flex: 1 }}
                value={skillPerLine}
                onChange={e => setSkillPerLine(Number(e.target.value))}
              />
              <input
                type="number"
                min="1"
                max="50"
                className="form-input"
                style={{ width: 68, textAlign: 'center' }}
                value={skillPerLine}
                onChange={e => setSkillPerLine(Math.max(1, Math.min(50, Number(e.target.value) || 15)))}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">图标主题配色 (theme):</label>
            <div className="filter-pill-tabs">
              <button
                type="button"
                className={`filter-pill ${skillTheme === 'dark' ? 'active' : ''}`}
                onClick={() => setSkillTheme('dark')}
              >
                深色 (dark)
              </button>
              <button
                type="button"
                className={`filter-pill ${skillTheme === 'light' ? 'active' : ''}`}
                onClick={() => setSkillTheme('light')}
              >
                浅色 (light)
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              黑白单色图标（如 GitHub、Bash、Next.js）在切换深/浅主题时会自动智能反转反差色
            </span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">技能列表 (以逗号分隔，如 go,docker,linux):</label>
          <input
            type="text"
            className="form-input"
            value={skillIcons}
            onChange={e => setSkillIcons(e.target.value)}
            placeholder="例如: go,rust,docker,kubernetes,linux,git,react,ts"
          />
        </div>

        <div className="chips-selector-row">
          {COMMON_SKILLS.map(s => {
            const active = skillIcons.split(',').map(x => x.trim()).includes(s);
            return (
              <button
                key={s}
                type="button"
                className={`chip-btn ${active ? 'active' : ''}`}
                onClick={() => toggleSkillChip(s)}
              >
                <span>{s}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* SkillIcons 即时预览 */}
      <div className="poster-preview-box">
        <div className={`skill-icons-render-wrap ${skillTheme === 'light' ? 'light-board' : 'dark-board'}`}>
          {!skillIcons.trim() ? (
            <div className="socialify-placeholder">
              <Code2 size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
              <div>在上方勾选或输入技能标识，组合渲染高辨识度的全栈技术栈封面徽章</div>
            </div>
          ) : (
            <SmoothImage
              src={skillIconsURL}
              alt="SkillIcons"
              className="skill-icons-preview-img"
              showMetaBadge={true}
              onClick={() => onOpenLightbox(skillIconsURL, `技术栈徽章: ${skillIcons}`)}
            />
          )}
        </div>

        {skillIconsURL && (
          <div className="poster-action-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
              <ImageFilenameTag url={skillIconsURL} fallbackTitle="skillicons.svg" maxWidth={180} />
              <span className="source-pill-badge">SkillIcons SVG</span>
            </div>

            <div className="apply-btn-group">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  navigator.clipboard.writeText(skillIconsURL);
                  toast.success('SkillIcons 链接已复制到剪贴板');
                }}
                title="复制该技术栈图标直链"
              >
                <Copy size={12} />
                <span>复制链接</span>
              </button>

              <button
                type="button"
                className={`btn btn-sm ${isFavorited(skillIconsURL) ? 'btn-warning-ghost' : 'btn-ghost'}`}
                onClick={() => toggleFavorite({
                  url: skillIconsURL,
                  title: `技术栈图标: ${skillIcons}`,
                  source: 'skillicons',
                  thumbUrl: skillIconsURL,
                })}
              >
                <Star size={12} fill={isFavorited(skillIconsURL) ? '#f59e0b' : 'none'} color={isFavorited(skillIconsURL) ? '#f59e0b' : 'currentColor'} />
                <span>{isFavorited(skillIconsURL) ? '已收藏' : '收藏徽章'}</span>
              </button>

              <ApplyCoverButtons
                url={skillIconsURL}
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
