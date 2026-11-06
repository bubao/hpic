import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Config, SelectDirectoryResult } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { AppTheme, applyTheme, applyCustomCSS, getCurrentCustomCSS, triggerThemeTransition } from '../utils/useTheme';
import { Icon } from './common/Icon';
import { FolderGit2, Image, Palette, Languages, Sparkles, Globe, Stethoscope, Info, ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import { BlogTab } from './settings/BlogTab';
import { GalleryTab } from './settings/GalleryTab';
import { AppearanceTab } from './settings/AppearanceTab';
import { I18nTab } from './settings/I18nTab';
import { SocialifyTab } from './settings/SocialifyTab';
import { NetworkTab } from './settings/NetworkTab';
import { DoctorTab } from './settings/DoctorTab';
import { AboutTab } from './settings/AboutTab';

export type SettingsCategory = 'blog' | 'gallery' | 'appearance' | 'i18n' | 'socialify' | 'network' | 'doctor' | 'about';

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
    id: 'i18n',
    label: '语言与国际化',
    description: '界面语言切换、本地语言包自定义覆盖与自主扩展多国语言',
    icon: Languages,
  },
  {
    id: 'socialify',
    label: '卡片生成器',
    description: 'GitHub 仓库分享卡片 (Socialify)、技术栈图标 (SkillIcons) 生成配置',
    icon: Sparkles,
  },
  {
    id: 'network',
    label: '网络与部署',
    description: '配置 HTTP/SOCKS5 代理加速、网络连通性检测与 Git 部署规则',
    icon: Globe,
  },
  {
    id: 'doctor',
    label: '诊断与自检',
    description: '只读检查运行时、Node/Hexo 环境、配置存储与网络连通性，并导出诊断包',
    icon: Stethoscope,
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
  onAppearanceChange?: (theme: AppTheme, customCSS: string) => void;
  initialCategory?: SettingsCategory;
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
  onAppearanceChange,
  initialCategory,
}) => {
  const toast = useToast();
  const [localConfig, setLocalConfig] = useState<Config | null>(null);
  const activeConfig = config || localConfig || FALLBACK_CONFIG;

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory || 'blog');
  const [isSaving, setIsSaving] = useState(false);

  // 1. Hexo 博客与封面字段
  const [hexoDir, setHexoDir] = useState(activeConfig.hexo_dir || '');
  const [coverFields, setCoverFields] = useState((activeConfig.cover_fields || ['index_img', 'banner_img']).join(', '));
  const [dateField, setDateField] = useState(activeConfig.date_field || 'date');
  const [updatedField, setUpdatedField] = useState(activeConfig.updated_field || 'updated');

  // 2. Unsplash / Wallhaven 壁纸偏好
  const [orientation, setOrientation] = useState(activeConfig.orientation || 'landscape');
  const [imageSize, setImageSize] = useState(activeConfig.image_size || 'large');
  const [minWidth, setMinWidth] = useState(activeConfig.min_width || 1200);
  const [minHeight, setMinHeight] = useState(activeConfig.min_height || 600);
  const [imageWidth, setImageWidth] = useState(activeConfig.image_width || 1200);
  const [imageQuality, setImageQuality] = useState(activeConfig.image_quality || 80);

  // 3. GitHub 与 Socialify
  const [githubOwner, setGithubOwner] = useState(activeConfig.github_owner || '');
  const [socialifyPattern, setSocialifyPattern] = useState(activeConfig.socialify_pattern || 'Signal');
  const [socialifyTheme, setSocialifyTheme] = useState(activeConfig.socialify_theme || 'Dark');

  // 4. 网络代理
  const [proxy, setProxy] = useState(activeConfig.proxy || '');

  // 5. 部署方式
  const [deployMode, setDeployMode] = useState<'git' | 'hexo'>(activeConfig.deploy_mode || 'git');
  const [gitCommitTemplate, setGitCommitTemplate] = useState(activeConfig.git_commit_template || 'chore(cover): update cover for {title}');

  // 6. 交互偏好
  const [autoSearch, setAutoSearch] = useState(!!activeConfig.auto_search);
  const [infiniteScroll, setInfiniteScroll] = useState(!!activeConfig.infinite_scroll);

  // 7. 外观与主题
  const [theme, setTheme] = useState<'dark' | 'light' | 'auto'>('dark');
  const [customCSS, setCustomCSS] = useState('');

  // 8. 路径选择器状态与代理测试
  const [isBrowsingDir, setIsBrowsingDir] = useState(false);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  // 9. 更新日志历史与版本检测
  const [changelogContent, setChangelogContent] = useState('');
  const [isLoadingChangelog, setIsLoadingChangelog] = useState(false);
  const [hasCopiedPath, setHasCopiedPath] = useState(false);
  const [versionResult, setVersionResult] = useState<any | null>(null);
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

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
      toast.error('检测版本失败');
    } finally {
      setIsCheckingVersion(false);
    }
  };

  const handleInstallUpdate = async () => {
    setIsInstalling(true);
    try {
      const res = await api.installVersion();
      if (res.success) {
        toast.success('升级包安装完成，请重启客户端');
      } else {
        toast.error('升级安装失败: ' + (res.message || '未知错误'));
      }
    } catch (e: any) {
      toast.error('升级异常: ' + (e?.message || '未知错误'));
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyConfigPath = () => {
    if (activeConfig.config_file_path) {
      navigator.clipboard.writeText(activeConfig.config_file_path);
      setHasCopiedPath(true);
      toast.success('配置文件路径已复制到剪贴板');
      setTimeout(() => setHasCopiedPath(false), 2000);
    }
  };

  // 10. 未保存状态拦截控制 (Unsaved Changes Guard)
  const baselineConfigRef = useRef<Config | null>(null);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    { type: 'switch_tab'; target: SettingsCategory } | { type: 'close' } | null
  >(null);

  const pendingRestartVersionRef = useRef<string | null>(null);

  const prevIsOpenRef = useRef(false);

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

  // 将外部配置装载到表单状态并同步记录基准快照
  const syncFromConfig = (cfg: Config) => {
    setHexoDir(cfg.hexo_dir || '');
    setCoverFields((cfg.cover_fields || ['index_img', 'banner_img']).join(', '));
    setDateField(cfg.date_field || 'date');
    setUpdatedField(cfg.updated_field || 'updated');
    setOrientation(cfg.orientation || 'landscape');
    setImageSize(cfg.image_size || 'large');
    setMinWidth(cfg.min_width || 1200);
    setMinHeight(cfg.min_height || 600);
    setImageWidth(cfg.image_width || 1200);
    setImageQuality(cfg.image_quality || 80);
    setGithubOwner(cfg.github_owner || '');
    setSocialifyPattern(cfg.socialify_pattern || 'Signal');
    setSocialifyTheme(cfg.socialify_theme || 'Auto');
    setProxy(cfg.proxy || '');
    setDeployMode(cfg.deploy_mode || 'git');
    setGitCommitTemplate(cfg.git_commit_template || 'chore(cover): update cover for {title}');
    setAutoSearch(Boolean(cfg.auto_search));
    setInfiniteScroll(Boolean(cfg.infinite_scroll));
    setTheme(cfg.theme || 'dark');
    setCustomCSS(cfg.custom_css || '');

    baselineConfigRef.current = JSON.parse(JSON.stringify(cfg));
  };

  // 关键修复：仅在弹窗从关闭变为打开（首次打开）时，才同步初始状态与定位到 initialCategory。
  // 在弹窗保持开启期间（例如保存配置后），绝对不跳回 initialCategory 首页，保证用户留在当前 Tab！
  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) {
        syncFromConfig(activeConfig);
        if (initialCategory) {
          setActiveCategory(initialCategory);
        }
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialCategory, activeConfig]);

  // 计算当前表单是否被修改 (Dirty Check)
  const isDirty = useMemo(() => {
    const base = baselineConfigRef.current;
    if (!base) return false;

    // 1. hexoDir
    if ((hexoDir || '').trim() !== (base.hexo_dir || '').trim()) return true;

    // 2. coverFields
    const currentRawCoverFields = coverFields
      .split(/[,，\s]+/)
      .map(f => f.trim())
      .filter(Boolean);
    const baseCoverFields = (base.cover_fields || []).map(f => f.trim()).filter(Boolean);
    if (
      currentRawCoverFields.length !== baseCoverFields.length ||
      !currentRawCoverFields.every((f, i) => f === baseCoverFields[i])
    ) {
      return true;
    }

    // 3. dateField & updatedField
    if ((dateField || 'date').trim() !== (base.date_field || 'date').trim()) return true;
    if ((updatedField || 'updated').trim() !== (base.updated_field || 'updated').trim()) return true;

    // 4. orientation & imageSize
    if ((orientation || 'landscape') !== (base.orientation || 'landscape')) return true;
    if ((imageSize || 'large') !== (base.image_size || 'large')) return true;

    // 5. numbers
    if (Number(minWidth || 1200) !== Number(base.min_width || 1200)) return true;
    if (Number(minHeight || 600) !== Number(base.min_height || 600)) return true;
    if (Number(imageWidth || 1200) !== Number(base.image_width || 1200)) return true;
    if (Number(imageQuality || 80) !== Number(base.image_quality || 80)) return true;

    // 6. githubOwner, socialifyPattern, socialifyTheme
    if ((githubOwner || '').trim() !== (base.github_owner || '').trim()) return true;
    if ((socialifyPattern || 'Signal') !== (base.socialify_pattern || 'Signal')) return true;
    if ((socialifyTheme || 'Auto').toLowerCase() !== (base.socialify_theme || 'Auto').toLowerCase()) return true;

    // 7. proxy
    if ((proxy || '').trim() !== (base.proxy || '').trim()) return true;

    // 8. deployMode & gitCommitTemplate
    if ((deployMode || 'git') !== (base.deploy_mode || 'git')) return true;
    const defaultTmpl = 'chore(cover): update cover for {title}';
    if ((gitCommitTemplate || defaultTmpl).trim() !== (base.git_commit_template || defaultTmpl).trim()) return true;

    // 9. booleans
    if (Boolean(autoSearch) !== Boolean(base.auto_search)) return true;
    if (Boolean(infiniteScroll) !== Boolean(base.infinite_scroll)) return true;

    // 10. theme & customCSS
    if ((theme || 'dark') !== (base.theme || 'dark')) return true;
    if ((customCSS || '').trim() !== (base.custom_css || '').trim()) return true;

    return false;
  }, [
    hexoDir,
    coverFields,
    dateField,
    updatedField,
    orientation,
    imageSize,
    minWidth,
    minHeight,
    imageWidth,
    imageQuality,
    githubOwner,
    socialifyPattern,
    socialifyTheme,
    proxy,
    deployMode,
    gitCommitTemplate,
    autoSearch,
    infiniteScroll,
    theme,
    customCSS,
  ]);

  // 拦截关闭请求
  const handleRequestClose = () => {
    if (isDirty) {
      setPendingAction({ type: 'close' });
      setShowUnsavedPrompt(true);
    } else {
      onClose();
    }
  };

  // 拦截 Tab 切换请求
  const handleRequestSwitchCategory = (catId: SettingsCategory) => {
    if (catId === activeCategory) return;
    if (isDirty) {
      setPendingAction({ type: 'switch_tab', target: catId });
      setShowUnsavedPrompt(true);
    } else {
      setActiveCategory(catId);
    }
  };

  // 键盘快捷键监听 (Escape 退出时若有未保存修改也予以拦截)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showUnsavedPrompt) {
          setShowUnsavedPrompt(false);
          setPendingAction(null);
        } else {
          handleRequestClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDirty, showUnsavedPrompt]);

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

  const handleSave = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const rawFields = coverFields
        .split(/[,，\s]+/)
        .map(f => f.trim())
        .filter(Boolean);

      const updated: Config = {
        hexo_dir: hexoDir.trim(),
        posts_dir: hexoDir.trim() ? `${hexoDir.trim()}/source/_posts` : '',
        drafts_dir: hexoDir.trim() ? `${hexoDir.trim()}/source/_drafts` : '',
        cover_fields: rawFields.length > 0 ? rawFields : ['index_img', 'banner_img'],
        date_field: dateField.trim() || 'date',
        updated_field: updatedField.trim() || 'updated',
        orientation,
        image_size: imageSize,
        min_width: Math.max(100, Number(minWidth) || 1200),
        min_height: Math.max(100, Number(minHeight) || 600),
        image_width: Math.max(100, Number(imageWidth) || 1200),
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
        const domTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const domCss = getCurrentCustomCSS();
        if (theme !== domTheme || customCSS !== domCss) {
          triggerThemeTransition(theme, { toCSS: customCSS });
        } else {
          applyTheme(theme);
          applyCustomCSS(customCSS);
        }
        toast.success('配置与外观样式已成功同步保存！');
        baselineConfigRef.current = JSON.parse(JSON.stringify(res.config));
        onSaved(res.config);
        return true;
      } else {
        toast.error('保存设置失败: ' + (res.error || '未知错误'));
        return false;
      }
    } catch {
      toast.error('请求失败，请检查网络或服务端状态');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // 弹窗确认 1：保存修改并继续
  const handlePromptSaveAndContinue = async () => {
    const success = await handleSave();
    if (success) {
      setShowUnsavedPrompt(false);
      if (pendingAction?.type === 'switch_tab') {
        setActiveCategory(pendingAction.target);
      } else if (pendingAction?.type === 'close') {
        onClose();
      }
      setPendingAction(null);
    }
  };

  // 弹窗确认 2：放弃修改并继续
  const handlePromptDiscardAndContinue = () => {
    if (baselineConfigRef.current) {
      syncFromConfig(baselineConfigRef.current);
    }
    setShowUnsavedPrompt(false);
    if (pendingAction?.type === 'switch_tab') {
      setActiveCategory(pendingAction.target);
    } else if (pendingAction?.type === 'close') {
      onClose();
    }
    setPendingAction(null);
  };

  // 弹窗确认 3：取消并留在此页
  const handlePromptCancel = () => {
    setShowUnsavedPrompt(false);
    setPendingAction(null);
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
      toast.info('请输入待检测的代理地址');
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await api.testProxy(proxy.trim());
      setProxyTestResult({
        success: res.success,
        message: res.message || (res.success ? '代理连接成功' : res.error || '连接超时'),
        latency: res.latency_ms,
      });
      if (res.success) {
        toast.success(`代理连通可用！延迟: ${res.latency_ms || 0}ms`);
      } else {
        toast.error(`代理检测失败: ${res.error || res.message}`);
      }
    } catch (e: any) {
      setProxyTestResult({
        success: false,
        message: e.message || '网络请求异常',
      });
      toast.error('代理测试异常');
    } finally {
      setIsTestingProxy(false);
    }
  };

  const computedPostsDir = hexoDir ? `${hexoDir}/source/_posts` : '未指定';
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
              onClick={handleRequestClose}
              title="返回主界面 (Esc)"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="settings-title-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 className="settings-main-title">偏好设置与系统配置</h1>
                {isDirty && (
                  <span className="unsaved-badge" style={{ fontSize: 11, background: 'rgba(245, 158, 11, 0.18)', color: '#f59e0b', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                    有未保存改动
                  </span>
                )}
              </div>
              <span className="settings-sub-title">定制 Hexo 自动化配图流程、网络代理、主题外观与图库检索约束</span>
            </div>
          </div>

          <div className="settings-top-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleRequestClose}
              disabled={isSaving}
            >
              取消
            </button>
            <button
              type="button"
              className={`btn ${isDirty ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleSave()}
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
                    onClick={() => handleRequestSwitchCategory(cat.id)}
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
                  computedPostsDir={computedPostsDir}
                  computedDraftsDir={computedDraftsDir}
                  isBrowsingDir={isBrowsingDir}
                  handleBrowseDir={handleBrowseDir}
                  coverFields={coverFields}
                  setCoverFields={setCoverFields}
                  dateField={dateField}
                  setDateField={setDateField}
                  updatedField={updatedField}
                  setUpdatedField={setUpdatedField}
                  autoSearch={autoSearch}
                  setAutoSearch={setAutoSearch}
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
                  onAppearanceChange={onAppearanceChange}
                />
              )}

              {activeCategory === 'i18n' && (
                <I18nTab />
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
                  isTestingProxy={isTestingProxy}
                  proxyTestResult={proxyTestResult}
                  setProxyTestResult={setProxyTestResult}
                  handleTestProxy={handleTestProxy}
                  deployMode={deployMode}
                  setDeployMode={setDeployMode}
                  gitCommitTemplate={gitCommitTemplate}
                  setGitCommitTemplate={setGitCommitTemplate}
                />
              )}

              {activeCategory === 'doctor' && (
                <DoctorTab />
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

      {/* 未保存修改拦截提示弹窗 (三选一确认：保存并继续 / 放弃修改 / 留在此页) */}
      {showUnsavedPrompt && (
        <div className="unsaved-prompt-overlay" role="dialog" aria-modal="true">
          <div className="unsaved-prompt-card">
            <div className="unsaved-prompt-header">
              <div className="unsaved-prompt-icon">
                <AlertTriangle size={20} color="#f59e0b" />
              </div>
              <div>
                <div className="unsaved-prompt-title">检测到未保存的设置更改</div>
              </div>
            </div>

            <div className="unsaved-prompt-body">
              您对当前页面的配置做出了修改。若不保存直接切换分类或离开，这些修改将会丢失。您希望如何处理？
            </div>

            <div className="unsaved-prompt-actions">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={handlePromptCancel}
              >
                取消 (留在此页)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger-ghost"
                onClick={handlePromptDiscardAndContinue}
              >
                放弃更改
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handlePromptSaveAndContinue}
                disabled={isSaving}
              >
                {isSaving ? '正在保存...' : '保存更改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
