import React, { useState, useMemo } from 'react';
import { Palette, Code, ChevronRight, Check, Sparkles, Info } from 'lucide-react';
import { CssCodeEditor } from './CssCodeEditor';

export const PRESET_CYBERPUNK = `/* 赛博朋克深紫霓虹风格 */
[data-theme="dark"], :root {
  --accent-color: #ec4899;
  --accent-hover: #db2777;
  --accent-bg: rgba(236, 72, 153, 0.18);
  --bg-primary: #090614;
  --bg-secondary: #120b24;
  --bg-tertiary: #190f33;
  --border-color: rgba(236, 72, 153, 0.25);
  --radius-md: 14px;
}`;

export const PRESET_MINIMAL_LIGHT = `/* 极简纸墨高雅浅色风格 */
[data-theme="light"] {
  --bg-primary: #fcfbf9;
  --bg-secondary: #ffffff;
  --bg-tertiary: #f4f1ea;
  --text-primary: #1c1917;
  --text-secondary: #44403c;
  --border-color: rgba(0, 0, 0, 0.12);
  --accent-color: #292524;
  --accent-hover: #000000;
  --radius-sm: 4px;
  --radius-md: 6px;
}`;

/* ------------------------------------------------------------------ */
/* 外观预设                                                             */
/* ------------------------------------------------------------------ */

interface AppearancePreset {
  id: string;
  label: string;
  desc: string;
  theme: 'dark' | 'light' | 'auto';
  css: string;
  previewClass: string;
  blockBase: string;
  blockStrong: string;
}

const APPEARANCE_PRESETS: AppearancePreset[] = [
  {
    id: 'dark',
    label: '暗色极客',
    desc: '深黑沉浸 · 夜间护眼',
    theme: 'dark',
    css: '',
    previewClass: 'preset-preview-dark',
    blockBase: 'rgba(255, 255, 255, 0.13)',
    blockStrong: 'rgba(255, 255, 255, 0.24)',
  },
  {
    id: 'light',
    label: '亮色清爽',
    desc: '纸白纯净 · 日间清晰',
    theme: 'light',
    css: '',
    previewClass: 'preset-preview-light',
    blockBase: 'rgba(15, 23, 42, 0.11)',
    blockStrong: 'rgba(15, 23, 42, 0.19)',
  },
  {
    id: 'auto',
    label: '跟随系统',
    desc: '自动适配系统深浅色',
    theme: 'auto',
    css: '',
    previewClass: 'preset-preview-auto',
    blockBase: 'rgba(99, 102, 241, 0.5)',
    blockStrong: 'rgba(99, 102, 241, 0.8)',
  },
  {
    id: 'cyberpunk',
    label: '赛博霓虹',
    desc: '深紫霓虹 · 粉色强调',
    theme: 'dark',
    css: PRESET_CYBERPUNK,
    previewClass: 'preset-preview-cyberpunk',
    blockBase: 'rgba(236, 72, 153, 0.5)',
    blockStrong: 'rgba(236, 72, 153, 0.85)',
  },
  {
    id: 'minimal',
    label: '极简墨水',
    desc: '纸墨极简 · 高对比',
    theme: 'light',
    css: PRESET_MINIMAL_LIGHT,
    previewClass: 'preset-preview-minimal',
    blockBase: 'rgba(41, 37, 36, 0.5)',
    blockStrong: 'rgba(41, 37, 36, 0.85)',
  },
];

/** 归一化 CSS 文本，用于识别当前是否正在使用某个预设 */
const normalizeCss = (css: string): string => css.replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* 自定义 CSS 辅助                                                      */
/* ------------------------------------------------------------------ */

interface QuickVar {
  label: string;
  prop: string;
  value: string;
}

/** 常用可微调变量，取值随当前主题模式给出较协调的默认值 */
const buildQuickVars = (isLight: boolean): QuickVar[] => [
  { label: '强调色', prop: '--accent-color', value: isLight ? '#4f46e5' : '#6366f1' },
  { label: '悬停色', prop: '--accent-hover', value: isLight ? '#4338ca' : '#4f46e5' },
  { label: '主背景', prop: '--bg-primary', value: isLight ? '#f8fafc' : '#0a0c10' },
  { label: '次背景', prop: '--bg-secondary', value: isLight ? '#ffffff' : '#121620' },
  { label: '主文字', prop: '--text-primary', value: isLight ? '#0f172a' : '#f8fafc' },
  { label: '圆角', prop: '--radius-md', value: '12px' },
  { label: '边框色', prop: '--border-color', value: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)' },
];

const EXAMPLE_CSS = `/* 自定义示例：只写需要覆盖的变量，其余沿用当前预设 */
:root {
  --accent-color: #6366f1;
  --accent-hover: #4f46e5;
  --radius-md: 12px;
  --radius-sm: 6px;
}

/* 也可以追加任意 CSS 规则，例如让文章卡片更圆润 */
.post-list-item {
  border-radius: 14px;
}
`;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 将变量声明写入 CSS：
 * - 已存在同名变量 → 替换其值
 * - 已有 :root 块 → 追加到块内
 * - 否则 → 在末尾新建 :root 块（为空时直接生成）
 */
function insertDeclaration(css: string, prop: string, value: string): string {
  const decl = `${prop}: ${value};`;
  const re = new RegExp(`(${escapeRegExp(prop)}[ \t]*:[ \t]*)([^;\n]*)(;?)`);
  if (re.test(css)) {
    return css.replace(re, `$1${value}$3`);
  }
  const rootRe = /(:root[ \t]*\{)/;
  if (rootRe.test(css)) {
    return css.replace(rootRe, `$1\n  ${decl}`);
  }
  const trimmed = css.trim();
  if (!trimmed) {
    return `:root {\n  ${decl}\n}\n`;
  }
  return `${trimmed}\n\n:root {\n  ${decl}\n}\n`;
}

/* ------------------------------------------------------------------ */
/* 组件                                                                */
/* ------------------------------------------------------------------ */

interface AppearanceTabProps {
  theme: 'dark' | 'light' | 'auto';
  setTheme: (val: 'dark' | 'light' | 'auto') => void;
  customCSS: string;
  setCustomCSS: (val: string) => void;
  /** 外观变更回调：立即应用并持久化（由父级提供） */
  onAppearanceChange?: (theme: 'dark' | 'light' | 'auto', customCSS: string) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
  theme,
  setTheme,
  customCSS,
  setCustomCSS,
  onAppearanceChange,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const hasCustomCSS = customCSS.trim().length > 0;

  /** 当前生效的预设：主题与 CSS 双重匹配；若注入了无法识别的自定义 CSS 则归为「自定义」 */
  const activePresetId = useMemo(() => {
    const normalized = normalizeCss(customCSS);
    const match = APPEARANCE_PRESETS.find(
      p => p.theme === theme && normalizeCss(p.css) === normalized
    );
    if (match) return match.id;
    if (hasCustomCSS) return 'custom';
    return null;
  }, [theme, customCSS, hasCustomCSS]);

  const quickVars = useMemo(() => buildQuickVars(theme === 'light'), [theme]);

  const applyPreset = (preset: AppearancePreset) => {
    setTheme(preset.theme);
    setCustomCSS(preset.css);
    onAppearanceChange?.(preset.theme, preset.css);
  };

  const clearCustomCSS = () => {
    setCustomCSS('');
    onAppearanceChange?.(theme, '');
  };

  const insertVar = (v: QuickVar) => {
    const next = insertDeclaration(customCSS, v.prop, v.value);
    setCustomCSS(next);
    onAppearanceChange?.(theme, next);
  };

  const insertExample = () => {
    setCustomCSS(EXAMPLE_CSS);
    onAppearanceChange?.(theme, EXAMPLE_CSS);
  };

  const renderPreviewBlocks = (blockBase: string, blockStrong: string, dim = false) => (
    <>
      <div
        className="preset-block"
        style={{ height: '66%', background: blockBase, opacity: dim ? 0.75 : 1 }}
      />
      <div className="preset-block" style={{ height: '95%', background: blockStrong }} />
      <div
        className="preset-block"
        style={{ height: '50%', background: blockBase, opacity: dim ? 0.5 : 0.72 }}
      />
    </>
  );

  return (
    <div className="settings-card">
      <div className="settings-card-title" style={{ marginBottom: 14 }}>
        <Palette size={16} style={{ color: '#ec4899' }} />
        <span>外观样式</span>
        <span className="preset-status">
          <Sparkles size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
          {hasCustomCSS ? '已注入自定义样式' : '当前为预设外观'}
        </span>
      </div>

      {/* 外观预设网格 */}
      <div className="preset-grid">
        {APPEARANCE_PRESETS.map(preset => {
          const active = activePresetId === preset.id;
          return (
            <div
              key={preset.id}
              className={`preset-card ${active ? 'active' : ''}`}
              onClick={() => applyPreset(preset)}
              title={`${preset.label}：${preset.desc}`}
            >
              {active && (
                <span className="preset-check">
                  <Check size={11} strokeWidth={3} />
                </span>
              )}
              <div className={`preset-preview ${preset.previewClass}`}>
                {renderPreviewBlocks(preset.blockBase, preset.blockStrong)}
              </div>
              <div className="preset-card-name">{preset.label}</div>
              <div className="preset-card-desc">{preset.desc}</div>
            </div>
          );
        })}

        {/* 自定义卡片：展示当前自定义状态，点击进入高级微调 */}
        <div
          className={`preset-card preset-custom ${activePresetId === 'custom' ? 'active' : ''}`}
          onClick={() => setIsAdvancedOpen(v => !v)}
          title="已注入自定义样式？点击继续微调"
        >
          {activePresetId === 'custom' && (
            <span className="preset-check">
              <Check size={11} strokeWidth={3} />
            </span>
          )}
          <div className="preset-preview preset-preview-custom">
            {renderPreviewBlocks('var(--accent-color)', 'var(--accent-color)', true)}
          </div>
          <div className="preset-card-name">自定义</div>
          <div className="preset-card-desc">
            {hasCustomCSS ? '当前自定义样式 · 点击微调' : '进入自定义 CSS 微调'}
          </div>
        </div>
      </div>

      <p className="appearance-tip">
        点击卡片一键换肤；想微调颜色、圆角等细节，可在下方「自定义 CSS」中追加规则。
      </p>

      {/* 自定义 CSS 折叠面板 */}
      <div className="advanced-section">
        <button
          type="button"
          className="advanced-toggle"
          onClick={() => setIsAdvancedOpen(v => !v)}
          aria-expanded={isAdvancedOpen}
        >
          <ChevronRight size={14} className={`chevron ${isAdvancedOpen ? 'open' : ''}`} />
          <Code size={13} />
          <span>自定义 CSS</span>
          <span className="advanced-hint">
            {hasCustomCSS ? `${customCSS.length} 字符 · 已注入` : '可选 · 微调预设之外的细节'}
          </span>
        </button>

        {isAdvancedOpen && (
          <div className="advanced-body">
            <div className="advanced-desc">
              <Info size={13} className="advanced-desc-icon" />
              <span>
                在预设皮肤基础上<strong>追加</strong> CSS 规则：只写想改的变量即可，
                同名 <code>--变量</code> 会覆盖预设，改动即时生效并自动保存。
              </span>
            </div>

            <div className="advanced-toolbar">
              <span className="advanced-count">
                {hasCustomCSS ? `已注入自定义样式（${customCSS.length} 字符）` : '未注入自定义样式'}
              </span>
              <button
                type="button"
                className="btn btn-xs btn-ghost"
                onClick={clearCustomCSS}
                disabled={!hasCustomCSS}
                title="清空已注入的自定义 CSS，保留当前主题模式"
              >
                清空 CSS
              </button>
            </div>

            <CssCodeEditor
              value={customCSS}
              onChange={v => {
                setCustomCSS(v);
                onAppearanceChange?.(theme, v);
              }}
              placeholder={
                '例如自定义强调色与圆角等 CSS 变量\n:root {\n  --accent-color: #ec4899;\n  --radius-md: 14px;\n}'
              }
            />

            <div className="quick-vars">
              <span className="quick-vars-label">快速插入</span>
              <div className="quick-vars-list">
                {quickVars.map(v => (
                  <button
                    key={v.prop}
                    type="button"
                    className="quick-var-chip"
                    title={`${v.prop}: ${v.value};`}
                    onClick={() => insertVar(v)}
                  >
                    {v.label}
                  </button>
                ))}
                <button
                  type="button"
                  className="quick-var-chip quick-var-example"
                  onClick={insertExample}
                  title="插入一份完整示例，可在此基础上修改"
                >
                  查看示例
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
