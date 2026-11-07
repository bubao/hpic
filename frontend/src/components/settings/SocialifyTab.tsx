import React from 'react';
import { Sparkles } from 'lucide-react';
import { Config } from '../../types';
import { useConfigField } from './useConfigField';

interface SocialifyTabProps {
  config: Config;
  onConfigChange: (patch: Partial<Config>) => void;
}

/**
 * 卡片生成器设置（A9 状态下沉）：
 * 表单草稿保存在 Tab 内部，编辑时通过 onConfigChange 增量上抛。
 */
export const SocialifyTab: React.FC<SocialifyTabProps> = ({ config, onConfigChange }) => {
  const [githubOwner, setGithubOwner] = useConfigField('github_owner', config, onConfigChange);
  const [socialifyPattern, setSocialifyPattern] = useConfigField('socialify_pattern', config, onConfigChange);
  const [socialifyTheme, setSocialifyTheme] = useConfigField('socialify_theme', config, onConfigChange);

  return (
    <div className="settings-card">
      <div className="settings-card-title">
        <Sparkles size={16} style={{ color: '#f59e0b' }} />
        <span>卡片生成器偏好配置 (Socialify / SkillIcons)</span>
      </div>

      <div className="form-group">
        <label className="form-label">GitHub 用户名或组织名 (github_owner):</label>
        <input
          type="text"
          className="form-input"
            value={githubOwner}
            onChange={e => setGithubOwner(e.target.value)}
          placeholder="your-github-username"
        />
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
          用于在极客生成器中快速补全项目仓库所有者，如 <code>https://github.com/owner/repo</code>
        </span>
      </div>

      <div className="form-row-2">
        <div className="form-group">
          <label className="form-label">Socialify 背景纹理偏好 (socialify_pattern):</label>
          <select
            className="form-input"
              value={socialifyPattern}
              onChange={e => setSocialifyPattern(e.target.value)}
          >
            <option value="Signal">Signal (数字信号 - 推荐)</option>
            <option value="Charlie Brown">Charlie Brown (动感锯齿)</option>
            <option value="Circuit Board">Circuit Board (集成电路)</option>
            <option value="Formal Invitation">Formal Invitation (优雅交叉)</option>
            <option value="Floating Cogs">Floating Cogs (浮动齿轮)</option>
            <option value="Overlapping Hexagons">Overlapping Hexagons (蜂巢六边形)</option>
            <option value="Plus">Plus (加号极简)</option>
            <option value="Solid">Solid (纯色无纹理)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Socialify 风格偏好 (socialify_theme):</label>
          <select
            className="form-input"
              value={socialifyTheme}
              onChange={e => setSocialifyTheme(e.target.value)}
          >
            <option value="Dark">深色暗夜 (Dark)</option>
            <option value="Light">明亮纯白 (Light)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
