import React, { useState, useEffect } from 'react';
import { Config, VersionInfo } from '../types';
import { api } from '../api';
import { Settings, Copy, Globe, Image, GitBranch, Terminal, Sliders, Sparkles, RefreshCw, Download, CheckCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config | null;
  onSaved: (cfg: Config) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaved,
}) => {
  const toast = useToast();

  // 1. Hexo 博客与封面字段
  const [hexoDir, setHexoDir] = useState('');
  const [coverFields, setCoverFields] = useState('');
  const [dateField, setDateField] = useState('date');
  const [updatedField, setUpdatedField] = useState('updated');

  // 2. 图片搜索偏好与尺寸约束
  const [orientation, setOrientation] = useState('landscape');
  const [imageSize, setImageSize] = useState('large');
  const [minWidth, setMinWidth] = useState(1200);
  const [minHeight, setMinHeight] = useState(600);
  const [imageWidth, setImageWidth] = useState(1200);
  const [imageQuality, setImageQuality] = useState(80);

  // 3. GitHub 与开源卡片 (Socialify)
  const [githubOwner, setGithubOwner] = useState('');
  const [socialifyPattern, setSocialifyPattern] = useState('Signal');
  const [socialifyTheme, setSocialifyTheme] = useState('Dark');

  // 4. 网络代理与部署模式
  const [proxy, setProxy] = useState('');
  const [deployMode, setDeployMode] = useState<'git' | 'hexo'>('git');
  const [gitCommitTemplate, setGitCommitTemplate] = useState('chore(cover): update cover for {title}');

  // 5. 交互行为偏好
  const [autoSearch, setAutoSearch] = useState(false);
  const [infiniteScroll, setInfiniteScroll] = useState(false);

  // 6. 版本检测与更新状态
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);
  const [versionResult, setVersionResult] = useState<VersionInfo | null>(null);

  const handleManualCheckVersion = async () => {
    setIsCheckingVersion(true);
    try {
      const res = await api.checkVersion();
      setVersionResult(res);
      if (res.has_update) {
        toast.info(`发现新版本: ${res.latest_version}`);
      } else {
        toast.success(`当前已是最新版本 (${res.current_version})`);
      }
    } catch (e: any) {
      toast.error('检查更新失败: ' + e.message);
    } finally {
      setIsCheckingVersion(false);
    }
  };

  useEffect(() => {
    if (config) {
      setHexoDir(config.hexo_dir || '');
      setCoverFields((config.cover_fields || ['index_img', 'banner_img']).join(', '));
      setDateField(config.date_field || 'date');
      setUpdatedField(config.updated_field || 'updated');
      setOrientation(config.orientation || 'landscape');
      setImageSize(config.image_size || 'large');
      setMinWidth(config.min_width || 1200);
      setMinHeight(config.min_height || 600);
      setImageWidth(config.image_width || 1200);
      setImageQuality(config.image_quality || 80);
      setGithubOwner(config.github_owner || '');
      setSocialifyPattern(config.socialify_pattern || 'Signal');
      setSocialifyTheme(config.socialify_theme || 'Dark');
      setProxy(config.proxy || '');
      setDeployMode(config.deploy_mode || 'git');
      setGitCommitTemplate(config.git_commit_template || 'chore(cover): update cover for {title}');
      setAutoSearch(!!config.auto_search);
      setInfiniteScroll(!!config.infinite_scroll);
    }
  }, [config, isOpen]);

  if (!isOpen || !config) return null;

  const handleSave = async () => {
    const rawFields = coverFields.split(/[,，\s]+/).filter(Boolean);
    const updated: Partial<Config> = {
      hexo_dir: hexoDir.trim(),
      cover_fields: rawFields.length > 0 ? rawFields : ['index_img', 'banner_img'],
      date_field: dateField.trim() || 'date',
      updated_field: updatedField.trim() || 'updated',
      orientation,
      image_size: imageSize,
      min_width: Math.max(100, Number(minWidth) || 1200),
      min_height: Math.max(100, Number(minHeight) || 600),
      image_width: Math.max(200, Number(imageWidth) || 1200),
      image_quality: Math.max(1, Math.min(100, Number(imageQuality) || 80)),
      github_owner: githubOwner.trim(),
      socialify_pattern: socialifyPattern,
      socialify_theme: socialifyTheme,
      proxy: proxy.trim(),
      deploy_mode: deployMode,
      git_commit_template: gitCommitTemplate.trim() || 'chore(cover): update cover for {title}',
      auto_search: autoSearch,
      infinite_scroll: infiniteScroll,
    };

    const res = await api.saveConfig(updated);
    if (res.success) {
      toast.success('配置已成功同步并写入 RC 配置文件！');
      onSaved(res.config);
      onClose();
    } else {
      toast.error('保存设置失败: ' + (res.error || '未知错误'));
    }
  };

  const copyConfigPath = () => {
    navigator.clipboard.writeText(config.config_file_path || '~/.hpicrc');
    toast.success('RC 配置文件路径已复制');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="偏好与博客设置"
      icon={<Settings size={18} />}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Dotfile 路径展示 */}
        <div className="config-path-banner">
          <div>
            <span className="dotfile-tag">DOTFILE 配置文件路径:</span>
            <div className="dotfile-path">{config.config_file_path || '~/.hpicrc'}</div>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={copyConfigPath}>
            <Copy size={12} />
            <span>复制路径</span>
          </button>
        </div>

        {/* 1. Hexo 博客与封面字段 */}
        <div className="settings-section">
          <div className="settings-section-title">
            <Terminal size={14} />
            <span>Hexo 博客与文章配置</span>
          </div>

          <div className="form-group">
            <label className="form-label">Hexo 博客根目录 (包含 _config.yml，自动扫描 posts 与 drafts):</label>
            <input
              type="text"
              className="form-input"
              value={hexoDir}
              onChange={e => setHexoDir(e.target.value)}
              placeholder="/Users/.../my-hexo-blog"
            />
          </div>

          <div className="form-group">
            <label className="form-label">封面字段列表 (Frontmatter 字段，以逗号分隔):</label>
            <input
              type="text"
              className="form-input"
              value={coverFields}
              onChange={e => setCoverFields(e.target.value)}
              placeholder="index_img, banner_img, cover"
            />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              文章 frontmatter 中支持写入的所有封面字段，例如 Material/Butterfly 的 index_img、banner_img
            </span>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">创建时间属性 (Frontmatter 键名):</label>
              <input
                type="text"
                className="form-input"
                value={dateField}
                onChange={e => setDateField(e.target.value)}
                placeholder="date"
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                文章创建时间，默认 date (自动兜底 created, publishDate 等)
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">更新时间属性 (Frontmatter 键名):</label>
              <input
                type="text"
                className="form-input"
                value={updatedField}
                onChange={e => setUpdatedField(e.target.value)}
                placeholder="updated"
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                文章更新时间，默认 updated (自动兜底 lastmod, modified 等)
              </span>
            </div>
          </div>
        </div>

        {/* 2. 图片搜索与尺寸偏好 */}
        <div className="settings-section">
          <div className="settings-section-title">
            <Image size={14} />
            <span>图片搜索与分辨率约束</span>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">默认构图比例:</label>
              <select className="form-input" value={orientation} onChange={e => setOrientation(e.target.value)}>
                <option value="landscape">横屏 Landscape (推荐)</option>
                <option value="ultrawide">16:9 / 21:9 超宽横屏</option>
                <option value="all">不限比例</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">默认尺寸范围:</label>
              <select className="form-input" value={imageSize} onChange={e => setImageSize(e.target.value)}>
                <option value="large">高清大图 (≥1200px)</option>
                <option value="wallpaper">2K/4K 超清壁纸 (≥1920px)</option>
                <option value="all">不限尺寸</option>
              </select>
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">最小宽度过滤限制 (min_width):</label>
              <input
                type="number"
                min="100"
                step="50"
                className="form-input"
                value={minWidth}
                onChange={e => setMinWidth(Number(e.target.value) || 0)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">最小高度过滤限制 (min_height):</label>
              <input
                type="number"
                min="100"
                step="50"
                className="form-input"
                value={minHeight}
                onChange={e => setMinHeight(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">优化下载宽度 (image_width, px):</label>
              <input
                type="number"
                min="200"
                step="100"
                className="form-input"
                value={imageWidth}
                onChange={e => setImageWidth(Number(e.target.value) || 1200)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">压缩图片质量 (image_quality, 1-100):</label>
              <input
                type="number"
                min="1"
                max="100"
                className="form-input"
                value={imageQuality}
                onChange={e => setImageQuality(Math.max(1, Math.min(100, Number(e.target.value) || 80)))}
              />
            </div>
          </div>
        </div>

        {/* 3. GitHub 与开源卡片 (Socialify) */}
        <div className="settings-section">
          <div className="settings-section-title">
            <GitBranch size={14} />
            <span>GitHub 与开源卡片 (Socialify) 默认参数</span>
          </div>

          <div className="form-group">
            <label className="form-label">GitHub 默认用户名 / 组织名 (github_owner):</label>
            <input
              type="text"
              className="form-input"
              value={githubOwner}
              onChange={e => setGithubOwner(e.target.value)}
              placeholder="例如: your-github-id (用于自动推导 Socialify 开源卡片)"
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">默认背景纹理 (socialify_pattern):</label>
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
              <label className="form-label">默认主题配色 (socialify_theme):</label>
              <select
                className="form-input"
                value={socialifyTheme}
                onChange={e => setSocialifyTheme(e.target.value)}
              >
                <option value="Dark">深色 (Dark)</option>
                <option value="Light">浅色 (Light)</option>
                <option value="Auto">跟随系统 (Auto)</option>
              </select>
            </div>
          </div>
        </div>

        {/* 4. 网络代理与部署发布 */}
        <div className="settings-section">
          <div className="settings-section-title">
            <Globe size={14} />
            <span>网络代理与部署发布</span>
          </div>

          <div className="form-group">
            <label className="form-label">HTTP / SOCKS5 代理 (加速访问 Unsplash / Wallhaven / GitHub):</label>
            <input
              type="text"
              className="form-input"
              value={proxy}
              onChange={e => setProxy(e.target.value)}
              placeholder="例如: http://127.0.0.1:7890 或 socks5://127.0.0.1:7890"
            />
          </div>

          <div className="form-group">
            <label className="form-label">部署发布模式 (deploy_mode):</label>
            <select
              className="form-input"
              value={deployMode}
              onChange={e => setDeployMode(e.target.value as 'git' | 'hexo')}
            >
              <option value="git">Git 提交并推送 (触发 GitHub Actions 线上自动构建, 推荐)</option>
              <option value="hexo">本地 Hexo 传统部署 (运行 hexo deploy)</option>
            </select>
          </div>

          {deployMode === 'git' && (
            <div className="form-group">
              <label className="form-label">默认 Git Commit 提交模板 (git_commit_template):</label>
              <input
                type="text"
                className="form-input"
                value={gitCommitTemplate}
                onChange={e => setGitCommitTemplate(e.target.value)}
                placeholder="例如: chore(cover): update cover for {title}"
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                支持使用 <code>{'{title}'}</code> 动态占位符自动插入当前选中博文标题
              </span>
            </div>
          )}
        </div>

        {/* 5. 交互行为开关 */}
        <div className="settings-section">
          <div className="settings-section-title">
            <Sliders size={14} />
            <span>交互行为偏好</span>
          </div>

          <div className="form-checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={autoSearch}
                onChange={e => setAutoSearch(e.target.checked)}
              />
              <span>选中文章时自动触发图片搜索 (默认关闭)</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={infiniteScroll}
                onChange={e => setInfiniteScroll(e.target.checked)}
              />
              <span>瀑布流滚动触底自动加载图片 (默认关闭，手动点击更可控)</span>
            </label>
          </div>
        </div>

        {/* 6. 版本与自动升级 */}
        <div className="settings-section">
          <div className="settings-section-title">
            <Sparkles size={14} />
            <span>版本检测与在线更新</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>当前运行版本: </span>
              <code style={{ color: '#38bdf8', padding: '2px 6px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: 4, marginLeft: 6 }}>
                {config?.version ? `v${config.version.replace(/^v/, '')}` : 'v0.0.1'}
              </code>
            </div>

            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleManualCheckVersion}
              disabled={isCheckingVersion}
              style={{ border: '1px solid var(--border-color)' }}
            >
              <RefreshCw size={13} className={isCheckingVersion ? 'spin' : ''} />
              <span>{isCheckingVersion ? '正在查询 GitHub...' : '检查新版本'}</span>
            </button>
          </div>

          {versionResult && (
            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 6, background: versionResult.has_update ? 'rgba(168, 85, 247, 0.08)' : 'rgba(16, 185, 129, 0.08)', border: `1px solid ${versionResult.has_update ? 'rgba(168, 85, 247, 0.3)' : 'rgba(16, 185, 129, 0.25)'}` }}>
              {versionResult.has_update ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: '#c084fc', fontSize: 13 }}>
                      发现新版本 {versionResult.latest_version}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary highlight-upgrade-btn"
                      onClick={() => api.upgradeVersion().then(r => toast.success(r.message || '已打开下载链接'))}
                    >
                      <Download size={13} />
                      <span>立即升级</span>
                    </button>
                  </div>
                  {versionResult.release_notes && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxHeight: 100, overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: 8, borderRadius: 4 }}>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit' }}>{versionResult.release_notes}</pre>
                    </div>
                  )}
                </div>
              ) : versionResult.no_release ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                  <Globe size={15} />
                  <span>GitHub 仓库暂未发布过 Release，请先在终端运行 ./publish.sh 发布版本。</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#34d399', fontSize: 13 }}>
                  <CheckCircle size={15} />
                  <span>已是最新版本 ({versionResult.latest_version})，无需更新。</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>保存配置</button>
        </div>
      </div>
    </Modal>
  );
};
