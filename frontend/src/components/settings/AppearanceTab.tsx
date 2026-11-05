import React from 'react';
import { Palette, Moon, Sun, Laptop, Code } from 'lucide-react';

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

interface AppearanceTabProps {
  theme: 'dark' | 'light' | 'auto';
  setTheme: (val: 'dark' | 'light' | 'auto') => void;
  customCSS: string;
  setCustomCSS: (val: string) => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
  theme,
  setTheme,
  customCSS,
  setCustomCSS,
}) => {
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">
          <Palette size={16} style={{ color: '#ec4899' }} />
          <span>界面主题色彩模式</span>
        </div>

        <div className="theme-select-grid">
          <div
            className={`theme-select-card ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            <Moon size={22} className="theme-card-icon" />
            <div className="theme-card-title">暗色极客 (Dark)</div>
            <div className="theme-card-desc">深度沉浸黑灰，夜间舒适护眼</div>
          </div>

          <div
            className={`theme-select-card ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
          >
            <Sun size={22} className="theme-card-icon" />
            <div className="theme-card-title">亮色清爽 (Light)</div>
            <div className="theme-card-desc">纯净明亮纸白，日间清晰</div>
          </div>

          <div
            className={`theme-select-card ${theme === 'auto' ? 'active' : ''}`}
            onClick={() => setTheme('auto')}
          >
            <Laptop size={22} className="theme-card-icon" />
            <div className="theme-card-title">跟随系统 (Auto)</div>
            <div className="theme-card-desc">根据系统深浅色偏好自动切换</div>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Code size={16} style={{ color: '#ec4899' }} />
            <span>自定义 CSS 样式注入</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setCustomCSS(PRESET_CYBERPUNK)}
              title="注入赛博朋克深紫霓虹风格预设"
            >
              赛博霓虹
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setCustomCSS(PRESET_MINIMAL_LIGHT)}
              title="注入极简纸墨高雅风格预设"
            >
              极简墨水
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              onClick={() => setCustomCSS('')}
              title="清空自定义 CSS 还原默认设计系统"
            >
              清空还原
            </button>
          </div>
        </div>

        <div className="form-group">
          <textarea
            className="form-input"
            value={customCSS}
            onChange={e => setCustomCSS(e.target.value)}
            placeholder="例如自定义强调色与圆角等 CSS 变量&#10;:root {&#10;  --accent-color: #ec4899;&#10;}"
            rows={7}
            style={{ fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
          />
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            可在上方点击预设快速体验或编写自定义 CSS 规则，保存后将即时挂载并持久化在本地配置中
          </span>
        </div>
      </div>
    </>
  );
};
