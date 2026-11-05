import React, { useState, useEffect } from 'react';
import { Config, VersionInfo } from '../types';
import { api } from '../api';
import {
  ArrowLeft,
  Check,
  Globe,
  Image,
  FolderGit2,
  Sparkles,
  Info,
  Palette,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { applyTheme, applyCustomCSS } from '../utils/useTheme';
import { BlogTab } from './settings/BlogTab';
import { GalleryTab } from './settings/GalleryTab';
import { AppearanceTab, PRESET_CYBERPUNK, PRESET_MINIMAL_LIGHT } from './settings/AppearanceTab';
import { SocialifyTab } from './settings/SocialifyTab';
import { NetworkTab } from './settings/NetworkTab';
import { AboutTab } from './settings/AboutTab';

export type SettingsCategory = 'blog' | 'gallery' | 'appearance' | 'socialify' | 'network' | 'about';

export { PRESET_CYBERPUNK, PRESET_MINIMAL_LIGHT };

interface CategoryItem {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
}

export const CATEGORIES: CategoryItem[] = [
  {
    id: 'blog',
    label: '博客与路径',
    description: '配置 Hexo 博客根目录、博文 Frontmatter 封面字段及时间元数据映射',
    icon: FolderGit2,
  },
  {
    id: 'gallery',
    label: '图库与尺寸',
    description: '设置 Unsplash / Wallhaven 壁纸尺寸阈值、构图比例与压缩参数',
    icon: Image,
  },
  {
    id: 'appearance',
    label: '外观与样式',
    description: '深浅色视觉风格切换、预设皮肤注入与自定义 CSS 样式设计',
    icon: Palette,
  },
  {
    id: 'socialify',
    label: '开源与生成器',
    description: 'GitHub 极客卡片、Socialify 纹理背景与技术栈徽章样式',
    icon: Sparkles,
  },
  {
    id: 'network',
    label: '网络与部署',
    description: '配置 HTTP/SOCKS5 代理加速、网络连通性检测与 Git 部署规则',
    icon: Globe,
  },
  {
    id: 'about',
    label: '关于与更新',
    description: '查看当前应用版本、更新检测、Release Notes 及系统底层配置清单',
    icon: Info,
  },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config | null;
  onSaved: (cfg: Config) => void;
}

const FALLBACK_CONFIG: Config = {
  hexo_dir: '',
  posts_dir: '',
  cover_fields: ['index_img', 'banner_img'],
  date_field: 'date',
  updated_field: 'updated',
  orientation: 'landscape',
  image_size: 'large',
  min_width: 1200,
  min_height: 600,
  image_width: 1200,
  image_quality: 80,
  github_owner: '',
  socialify_pattern: 'Signal',
  socialify_theme: 'Dark',
  proxy: '',
  deploy_mode: 'git',
  git_commit_template: 'chore(cover): update cover for {title}',
  auto_search: false,
  infinite_scroll: false,
  theme: 'dark',
  custom_css: '',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaved,
}) => {
  const toast = useToast();
  const [localConfig, setLocalConfig] = useState<Config | null>(null);
  const activeConfig = config || localConfig || FALLBACK_CONFIG;

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('blog');
  const [isSaving, setIsSaving] = useState(false);

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
  const [isInstalling, setIsInstalling] = useState(false);

  // 7. 外观与主题
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('dark');
  const [customCSS, setCustomCSS] = useState('');

  // 8. 路径选择器状态与代理测试
  const [isBrowsingDir, setIsBrowsingDir] = useState(false);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  // 9. 更新日志历史
  const [changelogContent, setChangelogContent] = useState('');
  const [isLoadingChangelog, setIsLoadingChangelog] = useState(false);
  const [hasCopiedPath, setHasCopiedPath] = useState(false);

  // 初始化加载配置数据：支持本地自动拉取兜底
  useEffect(() => {
    if (!config && isOpen && typeof api?.getConfig === 'function') {
      api.getConfig()
        .then(res => {
          if (res) setLocalConfig(res);
        })
        .catch(() => {});
    }
  }, [config, isOpen]);

  useEffect(() => {
    setHexoDir(activeConfig.hexo_dir || '');
    setCoverFields((activeConfig.cover_fields || ['index_img', 'banner_img']).join(', '));
    setDateField(activeConfig.date_field || 'date');
    setUpdatedField(activeConfig.updated_field || 'updated');
    setOrientation(activeConfig.orientation || 'landscape');
    setImageSize(activeConfig.image_size || 'large');
    setMinWidth(activeConfig.min_width || 1200);
    setMinHeight(activeConfig.min_height || 600);
    setImageWidth(activeConfig.image_width || 1200);
    setImageQuality(activeConfig.image_quality || 80);
    setGithubOwner(activeConfig.github_owner || '');
    setSocialifyPattern(activeConfig.socialify_pattern || 'Signal');
    setSocialifyTheme(activeConfig.socialify_theme || 'Dark');
    setProxy(activeConfig.proxy || '');
    setDeployMode(activeConfig.deploy_mode || 'git');
    setGitCommitTemplate(activeConfig.git_commit_template || 'chore(cover): update cover for {title}');
    setAutoSearch(!!activeConfig.auto_search);
    setInfiniteScroll(!!activeConfig.infinite_scroll);
    setTheme(activeConfig.theme || 'dark');
    setCustomCSS(activeConfig.custom_css || '');
  }, [config, localConfig, isOpen]);

  // 键盘快捷键监听 (Escape 退出)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 切换至关于页面时自动加载更新日志
  useEffect(() => {
    if (activeCategory === 'about' && !changelogContent && typeof api?.getChangelog === 'function') {
      setIsLoadingChangelog(true);
      api.getChangelog()
        .then(res => {
          if (res?.success && res.changelog) {
            setChangelogContent(res.changelog);
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingChangelog(false));
    }
  }, [activeCategory, changelogContent]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const rawFields = coverFields
        .split(/[,，\s]+/)
        .map(f => f.trim())
        .filter(Boolean);

      const updated: Config = {
        ...activeConfig,
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
        theme,
        custom_css: customCSS,
      };

      const res = await api.saveConfig(updated);
      if (res.success) {
        applyTheme(theme);
        applyCustomCSS(customCSS);
        toast.success('配置与外观样式已成功同步保存！');
        onSaved(res.config);
        onClose();
      } else {
        toast.error('保存设置失败: ' + (res.error || '未知错误'));
      }
    } catch {
      toast.error('请求失败，请检查网络或服务端状态');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBrowseDir = async () => {
    setIsBrowsingDir(true);
    try {
      const res = await api.selectDirectory('请选择本地 Hexo 博客根目录', hexoDir || undefined);
      if (res.success && res.path) {
        setHexoDir(res.path);
        if (res.is_hexo_root) {
          toast.success('已识别有效 Hexo 根目录 (_config.yml 存在)');
        } else {
          toast.info('已选择目录，未检测到 _config.yml');
        }
      }
    } catch {
      toast.error('调用原生目录选择器失败');
    } finally {
      setIsBrowsingDir(false);
    }
  };

  const handleTestProxy = async () => {
    if (!proxy.trim()) {
      toast.error('请先填写代理服务器地址');
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    const start = Date.now();
    try {
      const res = await api.testProxy(proxy.trim());
      const latency = Date.now() - start;
      setProxyTestResult({
        success: res.success,
        message: res.message || (res.success ? '代理连通正常' : '代理测试失败'),
        latency,
      });
      if (res.success) {
        toast.success(`代理连通正常 (${latency}ms)`);
      } else {
        toast.error('代理不可达: ' + (res.message || '连接超时'));
      }
    } catch (e: any) {
      setProxyTestResult({
        success: false,
        message: '连接错误: ' + (e?.message || '网络超时'),
      });
      toast.error('代理测试异常');
    } finally {
      setIsTestingProxy(false);
    }
  };

  const handleManualCheckVersion = async () => {
    setIsCheckingVersion(true);
    try {
      const res = await api.checkVersion();
      setVersionResult(res);
      if (res.has_update) {
        toast.info(`发现新版本 ${res.latest_version}`);
      } else {
        toast.success('当前已是最新版本');
      }
    } catch {
      toast.error('检查更新失败');
    } finally {
      setIsCheckingVersion(false);
    }
  };

  const handleInstallUpdate = async () => {
    setIsInstalling(true);
    try {
      const res = await api.installVersion();
      if (res.success) {
        toast.success(res.message || '更新安装完成！');
      } else {
        toast.error('自动升级未完成: ' + (res.message || '请手动下载'));
      }
    } catch (e: any) {
      toast.error('更新安装请求失败: ' + (e?.message || '未知错误'));
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyConfigPath = () => {
    const p = activeConfig.config_file_path || '~/.hpicrc';
    navigator.clipboard.writeText(p);
    setHasCopiedPath(true);
    toast.success('配置文件路径已复制到剪贴板');
    setTimeout(() => setHasCopiedPath(false), 2000);
  };

  const computedPostsDir = hexoDir ? `${hexoDir}/source/_posts` : (activeConfig.posts_dir || '未指定');
  const computedDraftsDir = hexoDir ? `${hexoDir}/source/_drafts` : '未指定';
  const currentCategoryMeta = CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div className="modal-overlay full-coverage" role="dialog" aria-modal="true">
      <div className="settings-page-container">
        {/* 顶部标题栏与全局快捷保存 */}
        <header className="settings-top-header">
          <div className="settings-top-left">
            <button
              type="button"
              className="btn btn-icon btn-ghost btn-back"
              onClick={onClose}
              title="返回主界面 (Esc)"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="settings-title-group">
              <h1 className="settings-main-title">偏好设置与系统配置</h1>
              <span className="settings-sub-title">定制 Hexo 自动化配图流程、网络代理、主题外观与图库检索约束</span>
            </div>
          </div>

          <div className="settings-top-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isSaving}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={isSaving}
            >
              <Check size={16} />
              <span>{isSaving ? '正在保存...' : '保存并应用'}</span>
            </button>
          </div>
        </header>

        {/* 侧边导航分类与主面板 */}
        <div className="settings-main-layout">
          <aside className="settings-sidebar-nav">
            <div className="settings-nav-list">
              {CATEGORIES.map(cat => {
                const IconComponent = cat.icon;
                const isActive = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`settings-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    <IconComponent size={18} className="settings-nav-icon" />
                    <div className="settings-nav-info">
                      <div className="settings-nav-label">{cat.label}</div>
                      <div className="settings-nav-desc">{cat.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="settings-content-area">
            <div className="settings-content-inner">
              <div className="settings-section-header">
                <h2>{currentCategoryMeta?.label}</h2>
                <p>{currentCategoryMeta?.description}</p>
              </div>

              {activeCategory === 'blog' && (
                <BlogTab
                  hexoDir={hexoDir}
                  setHexoDir={setHexoDir}
                  coverFields={coverFields}
                  setCoverFields={setCoverFields}
                  dateField={dateField}
                  setDateField={setDateField}
                  updatedField={updatedField}
                  setUpdatedField={setUpdatedField}
                  autoSearch={autoSearch}
                  setAutoSearch={setAutoSearch}
                  isBrowsingDir={isBrowsingDir}
                  handleBrowseDir={handleBrowseDir}
                  computedPostsDir={computedPostsDir}
                  computedDraftsDir={computedDraftsDir}
                />
              )}

              {activeCategory === 'gallery' && (
                <GalleryTab
                  orientation={orientation}
                  setOrientation={setOrientation}
                  imageSize={imageSize}
                  setImageSize={setImageSize}
                  minWidth={minWidth}
                  setMinWidth={setMinWidth}
                  minHeight={minHeight}
                  setMinHeight={setMinHeight}
                  imageWidth={imageWidth}
                  setImageWidth={setImageWidth}
                  imageQuality={imageQuality}
                  setImageQuality={setImageQuality}
                  infiniteScroll={infiniteScroll}
                  setInfiniteScroll={setInfiniteScroll}
                />
              )}

              {activeCategory === 'appearance' && (
                <AppearanceTab
                  theme={theme}
                  setTheme={setTheme}
                  customCSS={customCSS}
                  setCustomCSS={setCustomCSS}
                />
              )}

              {activeCategory === 'socialify' && (
                <SocialifyTab
                  githubOwner={githubOwner}
                  setGithubOwner={setGithubOwner}
                  socialifyPattern={socialifyPattern}
                  setSocialifyPattern={setSocialifyPattern}
                  socialifyTheme={socialifyTheme}
                  setSocialifyTheme={setSocialifyTheme}
                />
              )}

              {activeCategory === 'network' && (
                <NetworkTab
                  proxy={proxy}
                  setProxy={setProxy}
                  deployMode={deployMode}
                  setDeployMode={setDeployMode}
                  gitCommitTemplate={gitCommitTemplate}
                  setGitCommitTemplate={setGitCommitTemplate}
                  isTestingProxy={isTestingProxy}
                  proxyTestResult={proxyTestResult}
                  setProxyTestResult={setProxyTestResult}
                  handleTestProxy={handleTestProxy}
                />
              )}

              {activeCategory === 'about' && (
                <AboutTab
                  config={activeConfig}
                  isCheckingVersion={isCheckingVersion}
                  versionResult={versionResult}
                  isInstalling={isInstalling}
                  changelogContent={changelogContent}
                  isLoadingChangelog={isLoadingChangelog}
                  handleManualCheckVersion={handleManualCheckVersion}
                  handleInstallUpdate={handleInstallUpdate}
                  handleCopyConfigPath={handleCopyConfigPath}
                  hasCopiedPath={hasCopiedPath}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
