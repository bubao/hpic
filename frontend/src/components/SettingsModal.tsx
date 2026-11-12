import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Config, createDefaultConfig } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';
import { AppTheme, applyTheme, applyCustomCSS, getCurrentCustomCSS, triggerThemeTransition } from '../utils/useTheme';
import { FolderGit2, Image, Palette, Languages, Globe, Stethoscope, Info, ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import { SettingsTabProps } from './settings/types';
import { buildConfigUpdate } from './settings/configDiff';
import { ErrorBoundary } from './ErrorBoundary';
import { SectionErrorFallback } from './common/SectionErrorFallback';

export type SettingsCategory = 'blog' | 'gallery' | 'appearance' | 'i18n' | 'network' | 'doctor' | 'about';

/** 通过 React.lazy 按需分包加载的 Tab 组件（注册表统一契约） */
type LazySettingsTab = React.LazyExoticComponent<React.ComponentType<SettingsTabProps>>;

type SettingsGroup = 'content' | 'appearance' | 'system';

const GROUP_META: Record<SettingsGroup, string> = {
  content: '内容',
  appearance: '外观',
  system: '系统',
};

const CATEGORY_GROUPS: SettingsGroup[] = ['content', 'appearance', 'system'];

interface CategoryItem {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  group: SettingsGroup;
  tab: LazySettingsTab;
}

export const CATEGORIES: CategoryItem[] = [
  {
    id: 'blog',
    group: 'content',
    label: '博客与路径',
    description: '配置 Hexo 博客根目录、博文 Frontmatter 封面字段及时间元数据映射',
    icon: FolderGit2,
    tab: React.lazy(() => import('./settings/BlogTab').then(m => ({ default: m.BlogTab }))),
  },
  {
    id: 'gallery',
    group: 'content',
    label: '图库与尺寸',
    description: '设置 Unsplash / Wallhaven 壁纸尺寸阈值、构图比例、压缩参数与生成器默认值',
    icon: Image,
    tab: React.lazy(() => import('./settings/GalleryTab').then(m => ({ default: m.GalleryTab }))),
  },
  {
    id: 'appearance',
    group: 'appearance',
    label: '外观与样式',
    description: '深浅色视觉风格切换、预设皮肤注入与自定义 CSS 样式设计',
    icon: Palette,
    tab: React.lazy(() => import('./settings/AppearanceTab').then(m => ({ default: m.AppearanceTab }))),
  },
  {
    id: 'i18n',
    group: 'appearance',
    label: '语言与国际化',
    description: '界面语言切换、本地语言包自定义覆盖与自主扩展多国语言',
    icon: Languages,
    tab: React.lazy(() => import('./settings/I18nTab').then(m => ({ default: m.I18nTab }))),
  },
  {
    id: 'network',
    group: 'system',
    label: '网络与部署',
    description: '配置 HTTP/SOCKS5 代理加速、网络连通性检测与 Git 部署规则',
    icon: Globe,
    tab: React.lazy(() => import('./settings/NetworkTab').then(m => ({ default: m.NetworkTab }))),
  },
  {
    id: 'doctor',
    group: 'system',
    label: '诊断与自检',
    description: '只读检查运行时、Node/Hexo 环境、配置存储与网络连通性，并导出诊断包',
    icon: Stethoscope,
    tab: React.lazy(() => import('./settings/DoctorTab').then(m => ({ default: m.DoctorTab }))),
  },
  {
    id: 'about',
    group: 'system',
    label: '关于与更新',
    description: '查看当前应用版本、更新检测、Release Notes 及系统底层配置清单',
    icon: Info,
    tab: React.lazy(() => import('./settings/AboutTab').then(m => ({ default: m.AboutTab }))),
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

/** 深拷贝配置（草稿 / 基准快照相互隔离） */
const cloneConfig = (cfg: Config): Config => JSON.parse(JSON.stringify(cfg));

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
  const activeConfig = config || localConfig || createDefaultConfig();

  // A9 状态下沉：Modal 只持有「草稿 + 基准快照」，表单状态全部由各 Tab 内部维护
  const [draftConfig, setDraftConfig] = useState<Config>(() => createDefaultConfig());
  const [baselineConfig, setBaselineConfig] = useState<Config | null>(null);

  const [activeCategory, setActiveCategory] = useState<SettingsCategory>(initialCategory || 'blog');
  const [isSaving, setIsSaving] = useState(false);

  // 未保存状态拦截控制 (Unsaved Changes Guard)
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    { type: 'switch_tab'; target: SettingsCategory } | { type: 'close' } | null
  >(null);

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

  // 仅在弹窗从关闭变为打开（首次打开）时，才把外部配置装载为草稿并记录基准快照。
  // 弹窗保持开启期间（例如保存配置后）绝对不重新播种，保证用户留在当前 Tab 与草稿状态。
  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) {
        setDraftConfig(cloneConfig(activeConfig));
        setBaselineConfig(cloneConfig(activeConfig));
        if (initialCategory) {
          setActiveCategory(initialCategory);
        }
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialCategory, activeConfig]);

  // 各 Tab 的增量 patch 统一合并进草稿（onConfigChange 契约入口）
  const handleConfigChange = useCallback((patch: Partial<Config>) => {
    setDraftConfig(prev => ({ ...prev, ...patch }));
  }, []);

  // 草稿 vs 基准快照的 entries 差异 → 保存 patch，同时用于未保存拦截判定
  const pendingPatch = useMemo(
    () => (baselineConfig ? buildConfigUpdate(draftConfig, baselineConfig) : {}),
    [draftConfig, baselineConfig]
  );
  const isDirty = Object.keys(pendingPatch).length > 0;

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

  if (!isOpen) return null;

  const handleSave = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const res = await api.saveConfig(pendingPatch);
      if (res.success) {
        const theme = draftConfig.theme || 'dark';
        const customCSS = draftConfig.custom_css || '';
        const domTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const domCss = getCurrentCustomCSS();
        if (theme !== domTheme || customCSS !== domCss) {
          triggerThemeTransition(theme, { toCSS: customCSS });
        } else {
          applyTheme(theme);
          applyCustomCSS(customCSS);
        }
        toast.success('配置与外观样式已成功同步保存！');
        const saved = cloneConfig(res.config);
        setBaselineConfig(saved);
        setDraftConfig(saved);
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

  // 弹窗确认 2：放弃修改并继续（草稿回滚到基准快照，Tab 切换 / 关闭后重新播种）
  const handlePromptDiscardAndContinue = () => {
    if (baselineConfig) {
      setDraftConfig(cloneConfig(baselineConfig));
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

  const currentCategoryMeta = CATEGORIES.find(c => c.id === activeCategory);

  return (
    <div className="modal-overlay full-coverage" role="dialog" aria-modal="true" aria-label="偏好设置">
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
              {CATEGORY_GROUPS.map(group => (
                <div key={group} className="settings-nav-group">
                  <div className="settings-nav-group-title">{GROUP_META[group]}</div>
                  {CATEGORIES.filter(cat => cat.group === group).map(cat => {
                    const IconComponent = cat.icon;
                    const isActive = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`settings-nav-item ${isActive ? 'active' : ''}`}
                        onClick={() => handleRequestSwitchCategory(cat.id)}
                        data-testid={`settings-tab-${cat.id}`}
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
              ))}
            </div>
          </aside>

          <main className="settings-content-area">
            <div className="settings-content-inner">
              <div className="settings-section-header">
                <h2>{currentCategoryMeta?.label}</h2>
                <p>{currentCategoryMeta?.description}</p>
              </div>

              {/* C3：设置内容区局部边界（chunk 加载失败 / Tab 渲染异常仅替换该区） */}
              <ErrorBoundary
                fallback={props => <SectionErrorFallback title="设置面板" {...props} />}
              >
                {/* A9：Tab 懒加载 + 按需分包（config / onConfigChange 契约下发草稿） */}
                {currentCategoryMeta && (
                  <React.Suspense fallback={<div className="settings-tab-loading">加载中…</div>}>
                    <currentCategoryMeta.tab
                      config={draftConfig}
                      onConfigChange={handleConfigChange}
                      onAppearanceChange={onAppearanceChange}
                    />
                  </React.Suspense>
                )}
              </ErrorBoundary>
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
