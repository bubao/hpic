import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Config, BrokenReport, VersionInfo, LegacyCheckResult, CommandItem } from './types';
import { api } from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CoverArea } from './components/CoverArea';
import { PhotoGallery } from './components/PhotoGallery';
import { HealthModal } from './components/HealthModal';
import { LogsModal } from './components/LogsModal';
import { SettingsModal } from './components/SettingsModal';
import { Lightbox } from './components/Lightbox';
import { ManualUrlModal } from './components/ManualUrlModal';
import { DeployModal } from './components/DeployModal';
import { ConfirmModal } from './components/ConfirmModal';
import { UpdateModal } from './components/UpdateModal';
import { CreatePostModal } from './components/CreatePostModal';
import { PostHistoryModal } from './components/PostHistoryModal';
import { CommandPalette } from './components/CommandPalette';
import { FileText, ArrowUp } from 'lucide-react';
import { useToast } from './context/ToastContext';
import { useTheme, AppTheme, applyTheme, applyCustomCSS, getCurrentCustomCSS, triggerThemeTransition } from './utils/useTheme';
import { useHexoRunner } from './hooks/useHexoRunner';
import { usePostList } from './hooks/usePostList';
import { useModalManager } from './hooks/useModalManager';

export const App: React.FC = () => {
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);

  // 1. 弹窗与对话框管理器
  const modals = useModalManager();

  // 2. Hexo 运行管理模型
  const hexo = useHexoRunner({
    onOpenLogs: () => modals.setIsLogsOpen(true),
  });

  // 3. 博文列表与操作历史模型
  const postList = usePostList();
  const {
    posts,
    setPosts,
    selectedPost,
    setSelectedPost,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    isRefreshingPosts,
    handleRefreshPosts,
    loadPostsList,
    postHistory,
    loadPostHistory,
  } = postList;

  // 旧版配置检测与平滑迁移状态
  const [legacyCheck, setLegacyCheck] = useState<LegacyCheckResult | null>(null);

  // 404 失效封面报告
  const [brokenReports, setBrokenReports] = useState<BrokenReport[]>([]);
  // 经实时探测确认已失效的原图 URL 集合
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());

  // 主题与自定义 CSS 动态挂载
  const currentTheme = config?.theme || 'dark';
  const customCSS = config?.custom_css || '';
  useTheme(currentTheme, customCSS);

  const handleSelectTheme = async (nextTheme: AppTheme) => {
    if (nextTheme === currentTheme) return;
    const nextLabel = nextTheme === 'light' ? '亮色清爽模式' : nextTheme === 'auto' ? '跟随系统' : '暗色黑夜模式';
    toast.info(`已切换至: ${nextLabel}`);
    if (config) {
      const updatedConfig = { ...config, theme: nextTheme };
      // 先播放扫屏动画，动画内部会立即应用新主题
      triggerThemeTransition(nextTheme);
      setConfig(updatedConfig);
      await api.saveConfig({ theme: nextTheme });
    }
  };

  const handleToggleTheme = async () => {
    const nextTheme: AppTheme = currentTheme === 'dark' ? 'light' : currentTheme === 'light' ? 'auto' : 'dark';
    handleSelectTheme(nextTheme);
  };

  /**
   * 外观持久化定时器：连续切换预设或微调 CSS 时合并请求
   */
  const saveAppearanceTimer = useRef<number | null>(null);

  /**
   * 外观（主题 / 自定义 CSS）变更：立即应用并持久化。
   * 由设置面板内的外观预设调用，面板保持展开不影响操作。
   */
  const handleAppearanceChange = useCallback(
    async (nextTheme: AppTheme, nextCss: string) => {
      const prevTheme = (document.documentElement.getAttribute('data-theme') as AppTheme) || 'dark';
      // 以当前 DOM 生效的自定义 CSS 为准，保证快照旧外观
      const prevCss = getCurrentCustomCSS();

      setConfig(prev => (prev ? { ...prev, theme: nextTheme, custom_css: nextCss } : prev));

      // 主题或自定义 CSS 任一变化都播放扫屏过渡（如 暗色 ↔ 赛博霓虹）
      if (nextTheme !== prevTheme || nextCss !== prevCss) {
        triggerThemeTransition(nextTheme, { toCSS: nextCss });
      } else {
        applyTheme(nextTheme);
        applyCustomCSS(nextCss);
      }

      // 外观变更防抖持久化，关闭或取消面板后仍然生效
      if (saveAppearanceTimer.current !== null) {
        window.clearTimeout(saveAppearanceTimer.current);
      }
      saveAppearanceTimer.current = window.setTimeout(() => {
        saveAppearanceTimer.current = null;
        api.saveConfig({ theme: nextTheme, custom_css: nextCss }).catch(() => {
          // 静默失败：下次整体保存时会再次同步
        });
      }, 600);
    },
    []
  );

  // 登记原图失效并同步注入博文体检报告与全局状态
  const handleMarkBroken = useCallback((brokenUrl: string, filePath?: string, field?: string, postTitle?: string) => {
    if (!brokenUrl) return;

    setBrokenUrls(prev => {
      if (prev.has(brokenUrl)) return prev;
      const next = new Set(prev);
      next.add(brokenUrl);
      return next;
    });

    setBrokenReports(prev => {
      const newReports = [...prev];
      if (filePath && field) {
        const exist = newReports.some(r => r.file_path === filePath && r.field === field);
        if (!exist) {
          newReports.push({
            file_path: filePath,
            file_name: filePath.split('/').pop() || '未命名文章',
            post_title: postTitle || '未命名文章',
            field: field,
            url: brokenUrl,
            status_code: 404,
            error: '图片资源失效 (404 Not Found)',
          });
        }
      }
      return newReports;
    });
  }, []);

  // 版本升级检测状态
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [isHealthChecking, setIsHealthChecking] = useState(false);

  // 右侧核心内容区滚动引用与回到顶部按钮
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleMainScroll = (e: React.UIEvent<HTMLElement>) => {
    setShowBackToTop(e.currentTarget.scrollTop > 260);
  };

  const handleScrollToTop = () => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const canUndo = postHistory.some(h => !h.is_undone);
  const undoDesc = useMemo(() => {
    const last = postHistory.find(h => !h.is_undone);
    if (!last) return '';
    if (last.operation_type === 'update_cover') return `恢复变更前的封面 (${last.field || '封面'})`;
    if (last.operation_type === 'clear_cover') return `恢复被清空的封面 (${last.field || '封面'})`;
    if (last.operation_type === 'insert_image') return '移除追加的正文配图';
    return '撤销上一变动';
  }, [postHistory]);

  // 加载基础配置与文章列表
  const loadInitialData = async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      const postsRes = await api.getPosts('', 'date_desc');
      const newPosts = postsRes.posts || [];
      setPosts(newPosts);
      setSelectedPost(prev => {
        if (!prev) return newPosts.length > 0 ? newPosts[0] : null;
        const found = newPosts.find(p => p.file_path === prev.file_path || p.title === prev.title);
        return found || prev;
      });
    } catch (e) {
      console.error('Failed to load initial data:', e);
    }
  };

  // 后台静默轮询版本更新（每 10 分钟轻量查询一次 GitHub Releases，失败静默忽略）
  const pollVersionUpdate = async () => {
    try {
      const info = await api.checkVersion();
      setUpdateInfo(info);
    } catch {
      // 静默忽略
    }
  };

  useEffect(() => {
    loadInitialData();
    hexo.fetchStatus();

    api.checkLegacyConfig().then(res => {
      if (res && res.has_legacy) {
        setLegacyCheck(res);
      }
    }).catch(() => {});

    pollVersionUpdate();
    const updateTimer = setInterval(pollVersionUpdate, 10 * 60 * 1000);
    return () => clearInterval(updateTimer);
  }, []);

  // 轮询发现新版本时主动提醒一次（同一版本只提示一次，不每 10 分钟重复打扰）
  const lastRemindedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!updateInfo?.has_update || !updateInfo.latest_version) return;
    if (lastRemindedVersionRef.current === updateInfo.latest_version) return;
    lastRemindedVersionRef.current = updateInfo.latest_version;
    const displayVer = updateInfo.latest_version.startsWith('v') || updateInfo.latest_version.startsWith('V')
      ? updateInfo.latest_version
      : `v${updateInfo.latest_version}`;
    toast.info(`发现新版本 ${displayVer}，可一键自动下载并安装更新`, {
      action: {
        label: '查看更新',
        onClick: () => modals.setIsUpdateModalOpen(true),
      },
      duration: 10000,
    });
  }, [updateInfo, toast]);

  // 监听前后端版本契约裂隙并轻提示刷新
  useEffect(() => {
    const unsubscribe = api.onVersionMismatch((newVersion: string) => {
      const displayVer = newVersion.startsWith('v') || newVersion.startsWith('V') ? newVersion : `v${newVersion}`;
      toast.info(`检测到后端服务已更新至 ${displayVer}，建议刷新页面以同步最新能力`, {
        action: {
          label: '刷新',
          onClick: () => window.location.reload(),
        },
        duration: 8000,
      });
    });
    return unsubscribe;
  }, [toast]);

  // 快捷键支持（⌘K 打开命令面板，⌘Z 撤销）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        modals.setIsCommandPaletteOpen(prev => !prev);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        const isInputFocused = ['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName || ''));
        if (!isInputFocused && canUndo && selectedPost?.file_path) {
          e.preventDefault();
          // 通过 ref 获取最新的函数，总是操作当前选中文件
          handleUndoPostRef.current?.(selectedPost.file_path);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, selectedPost?.file_path, modals]);

  const handleOpenDeployModal = () => {
    hexo.setDeployError(null);
    modals.setIsDeployModalOpen(true);
  };

  const handleExecuteDeploy = async (opts: { mode: 'git' | 'hexo'; commitMsg: string; files: string[] }) => {
    hexo.setIsDeploying(true);
    hexo.setDeployError(null);
    try {
      const res = await api.runHexoDeploy({
        mode: opts.mode,
        commit_message: opts.commitMsg,
        files: opts.files,
      });
      if (res.success) {
        modals.setIsDeployModalOpen(false);
        if (opts.mode === 'git') {
          toast.success(`Git 推送成功！已触发线上构建 (耗时: ${res.duration})`);
        } else {
          toast.success(`Hexo 部署成功！耗时: ${res.duration}`);
        }
        hexo.fetchStatus();
      } else {
        hexo.setDeployError(res.error || '发布未成功，请查看上方提示');
      }
    } catch (e: any) {
      hexo.setDeployError(e?.message || '网络连接失败');
    } finally {
      hexo.setIsDeploying(false);
    }
  };

  const doApplyImage = async (url: string, fields: string[]) => {
    if (!selectedPost) return;
    const res = await api.updatePost({
      file_path: selectedPost.file_path,
      raw_url: url,
      apply_fields: fields,
    });
    if (res.success && res.post) {
      setSelectedPost(res.post);
      setPosts(prev => prev.map(p => p.file_path === res.post!.file_path ? res.post! : p));
      setBrokenReports(prev => prev.filter(b => !(b.file_path === selectedPost.file_path && fields.includes(b.field))));
      loadPostHistory(selectedPost.file_path);
      toast.success('封面已成功更新');
    } else if (res.error) {
      toast.error(res.error);
    }
  };

  const handleUndoPost = async (filePath?: string) => {
    const targetPath = filePath || selectedPost?.file_path;
    if (!targetPath) return;

    try {
      const res = await api.undoPostOperation(targetPath);
      if (res.success && res.post) {
        setSelectedPost(res.post);
        setPosts(prev => prev.map(p => p.file_path === res.post!.file_path ? res.post! : p));
        loadPostHistory(targetPath);
        toast.success('已成功撤销上一步操作！');
      } else {
        toast.error(`撤销失败: ${res.error || '没有可撤销的操作'}`);
      }
    } catch (err: any) {
      toast.error(`撤销异常: ${err.message || '未知错误'}`);
    }
  };

  // 使用 ref 保存最新的 handleUndoPost，避免快捷键闭包捕获 stale 函数
  const handleUndoPostRef = useRef<((filePath: string) => Promise<void>) | null>(null);
  useEffect(() => {
    handleUndoPostRef.current = handleUndoPost;
  }, [handleUndoPost]);

  const handleInsertBodyImage = async (url: string, imageTitle: string) => {
    if (!selectedPost) {
      toast.info('请先在左侧选择一篇文章');
      return;
    }

    try {
      const res = await api.insertPostImage({
        file_path: selectedPost.file_path,
        image_url: url,
        title: imageTitle,
      });
      if (res.success && res.post) {
        setSelectedPost(res.post);
        setPosts(prev => prev.map(p => p.file_path === res.post!.file_path ? res.post! : p));
        loadPostHistory(selectedPost.file_path);
        toast.success(`已将图片追加插入至《${selectedPost.title}》正文末尾`);
      } else {
        toast.error(`追加插入失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      toast.error(`插入图片异常: ${err.message || '未知错误'}`);
    }
  };

  const handleApplyImage = async (url: string, fields: string[]) => {
    if (!selectedPost) return;

    const existingOverrides = fields
      .map(f => ({ field: f, oldUrl: selectedPost.images[f] }))
      .filter(item => Boolean(item.oldUrl));

    if (existingOverrides.length > 0) {
      const overrideFields = existingOverrides.map(o => o.field);
      const firstOldUrl = existingOverrides[0].oldUrl;

      modals.openConfirm({
        title: '覆盖封面确认',
        diffPreview: {
          oldUrl: firstOldUrl,
          newUrl: url,
          fields: overrideFields,
          postTitle: selectedPost.title,
        },
        confirmText: '确认覆盖',
        cancelText: '取消',
        danger: false,
        onConfirm: async () => {
          modals.closeConfirm();
          await doApplyImage(url, fields);
        },
      });
      return;
    }

    await doApplyImage(url, fields);
  };

  const handleClearField = async (field: string) => {
    if (!selectedPost) return;
    const res = await api.updatePost({
      file_path: selectedPost.file_path,
      clear_fields: [field],
    });
    if (res.success && res.post) {
      setSelectedPost(res.post);
      setPosts(prev => prev.map(p => p.file_path === res.post!.file_path ? res.post! : p));
      setBrokenReports(prev => prev.filter(b => !(b.file_path === selectedPost.file_path && b.field === field)));
      toast.success(`已清除 ${field}`, {
        action: {
          label: '撤销',
          onClick: () => handleUndoPost(selectedPost.file_path),
        },
      });
    }
  };

  const handleClearAll = () => {
    if (!selectedPost) return;
    modals.openConfirm({
      title: '清空封面确认',
      message: `确定清除《${selectedPost.title}》的所有封面图片吗？`,
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
      onConfirm: async () => {
        modals.closeConfirm();
        const res = await api.updatePost({
          file_path: selectedPost.file_path,
          clear_fields: ['all'],
        });
        if (res.success && res.post) {
          setSelectedPost(res.post);
          setPosts(prev => prev.map(p => p.file_path === res.post!.file_path ? res.post! : p));
          setBrokenReports(prev => prev.filter(b => b.file_path !== selectedPost.file_path));
          toast.success('已清空全部封面');
        }
      },
    });
  };

  const handleOpenManualModal = (field?: string) => {
    if (!selectedPost) {
      toast.info('请先选择一篇文章');
      return;
    }
    modals.setIsManualOpen(true);
  };

  const handlePostCreated = (newPost: any) => {
    setSelectedPost(newPost);
    setPosts(prev => [newPost, ...prev]);
    toast.success(`博文《${newPost.title}》创建成功！`);
  };

  const handleMigrateLegacy = async () => {
    try {
      const res = await api.migrateLegacyConfig();
      if (res && res.success) {
        toast.success(`成功迁移配置至标准 ~/.config/hpic/ 目录！`);
        setLegacyCheck(null);
        const cfg = await api.getConfig();
        setConfig(cfg);
        loadPostsList();
      } else {
        toast.error(`配置迁移失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      toast.error(`配置迁移异常: ${err.message || '未知错误'}`);
    }
  };

  const coverFields = config?.cover_fields || ['index_img', 'banner_img'];

  const brokenPostPaths = useMemo(() => new Set(brokenReports.map(r => r.file_path)), [brokenReports]);

  // 全局 ⌘K 命令面板条目模型定义
  const commandItems = useMemo<CommandItem[]>(() => {
    return [
      // 文章操作
      {
        id: 'posts.refresh',
        group: 'posts',
        title: '刷新博文列表',
        keywords: ['shuaxin', 'refresh', 'sx', 'liebiao'],
        shortcut: 'R',
        run: () => handleRefreshPosts(false),
      },
      {
        id: 'posts.create',
        group: 'posts',
        title: '新建文章草稿',
        keywords: ['xinjian', 'create', 'new', 'post', 'xj', 'wenzhang'],
        shortcut: 'N',
        run: () => modals.setIsCreatePostOpen(true),
      },
      {
        id: 'posts.undo',
        group: 'posts',
        title: '撤销上一步封面变更',
        keywords: ['chexiao', 'undo', 'cx'],
        shortcut: '⌘Z',
        enabled: canUndo && !!selectedPost,
        run: () => {
          if (selectedPost) handleUndoPost(selectedPost.file_path);
        },
      },
      {
        id: 'posts.history',
        group: 'posts',
        title: '查看当前文章封面变更历史',
        keywords: ['history', 'lishi', 'ls', 'shiguangji'],
        enabled: !!selectedPost,
        run: () => modals.setIsHistoryModalOpen(true),
      },
      {
        id: 'posts.manual_url',
        group: 'posts',
        title: '手动填入网络图片链接',
        keywords: ['url', 'shoutian', 'link', 'st', 'tupian'],
        enabled: !!selectedPost,
        run: () => handleOpenManualModal(),
      },
      {
        id: 'posts.clear_cover',
        group: 'posts',
        title: '清空当前文章所有封面',
        keywords: ['clear', 'qingkong', 'qk', 'shanchufengmian'],
        enabled: !!selectedPost,
        run: () => handleClearAll(),
      },

      // Hexo 服务与构建
      {
        id: 'hexo.toggle_server',
        group: 'hexo',
        title: hexo.hexoStatus?.server_running || hexo.hexoStatus?.running ? '停止 Hexo 本地服务' : '启动 Hexo 本地服务',
        keywords: ['server', 'fuwu', 'qidong', 'tingzhi', 'start', 'stop'],
        run: () => hexo.handleToggleServer(),
      },
      {
        id: 'hexo.preview',
        group: 'hexo',
        title: '在浏览器中预览 Hexo 博客',
        keywords: ['preview', 'yulan', 'yl', 'browser', 'liulanqi'],
        run: () => hexo.handlePreview(),
      },
      {
        id: 'hexo.generate',
        group: 'hexo',
        title: '重新打包生成静态页面',
        keywords: ['generate', 'shengcheng', 'sc', 'build', 'jingtai'],
        run: () => hexo.handleGenerate(),
      },
      {
        id: 'hexo.clean',
        group: 'hexo',
        title: '清理 Hexo 缓存与静态构建物',
        keywords: ['clean', 'qingli', 'ql', 'huancun'],
        run: () => hexo.handleClean(),
      },
      {
        id: 'hexo.deploy',
        group: 'hexo',
        title: '一键部署发布到远端',
        keywords: ['deploy', 'bushu', 'fabu', 'bs', 'git'],
        run: () => handleOpenDeployModal(),
      },
      {
        id: 'hexo.logs',
        group: 'hexo',
        title: '查看 Hexo 终端实时运行日志',
        keywords: ['logs', 'rizhi', 'terminal', 'zhongduan', 'rz'],
        run: () => modals.setIsLogsOpen(true),
      },

      // 外观与主题
      {
        id: 'theme.dark',
        group: 'theme',
        title: '切换为暗色夜间主题',
        keywords: ['dark', 'anhei', 'ah', 'heiye'],
        run: () => handleSelectTheme('dark'),
      },
      {
        id: 'theme.light',
        group: 'theme',
        title: '切换为亮色清爽主题',
        keywords: ['light', 'liangse', 'ls', 'qingshuang'],
        run: () => handleSelectTheme('light'),
      },
      {
        id: 'theme.auto',
        group: 'theme',
        title: '切换为跟随系统外观',
        keywords: ['auto', 'system', 'gensui', 'xitong'],
        run: () => handleSelectTheme('auto'),
      },
      {
        id: 'theme.toggle',
        group: 'theme',
        title: '轮换切换明暗主题',
        keywords: ['toggle', 'qiehuan', 'qh'],
        run: () => handleToggleTheme(),
      },
      {
        id: 'theme.settings',
        group: 'theme',
        title: '外观与自定义 CSS 偏好设置',
        keywords: ['css', 'style', 'waiguan', 'wg', 'pifu', 'yangshi'],
        run: () => modals.openSettings('appearance'),
      },

      // 设置与偏好
      {
        id: 'settings.open',
        group: 'settings',
        title: '打开偏好设置中心',
        keywords: ['settings', 'config', 'sz', 'shezhi'],
        shortcut: '⌘,',
        run: () => modals.openSettings('blog'),
      },
      {
        id: 'settings.blog',
        group: 'settings',
        title: '博客与路径设置',
        keywords: ['blog', 'hexo_dir', 'boke', 'lujing'],
        run: () => modals.openSettings('blog'),
      },
      {
        id: 'settings.gallery',
        group: 'settings',
        title: '图库与尺寸过滤设置',
        keywords: ['gallery', 'tuku', 'size', 'chicun'],
        run: () => modals.openSettings('gallery'),
      },
      {
        id: 'settings.socialify',
        group: 'settings',
        title: '卡片生成器与 Socialify 样式设置',
        keywords: ['socialify', 'github', 'kapian', 'kp', 'shengcheng'],
        run: () => modals.openSettings('socialify'),
      },
      {
        id: 'settings.network',
        group: 'settings',
        title: '网络代理与部署模式设置',
        keywords: ['network', 'proxy', 'daili', 'dl', 'wangluo'],
        run: () => modals.openSettings('network'),
      },
      {
        id: 'settings.doctor',
        group: 'settings',
        title: '系统健康体检与自检诊断',
        keywords: ['doctor', 'zhenduan', 'tijian', 'zd', 'jiankang'],
        run: () => modals.openSettings('doctor'),
      },
      {
        id: 'settings.about',
        group: 'settings',
        title: '关于 hpic 与软件版本升级',
        keywords: ['about', 'guanyu', 'banben', 'update', 'gy'],
        run: () => modals.openSettings('about'),
      },

      // 工具与诊断
      {
        id: 'tools.health',
        group: 'tools',
        title: '全站封面 404 死链存活性扫描',
        keywords: ['health', 'silian', 'tijian', 'sl', '404'],
        run: () => modals.setIsHealthOpen(true),
      },
      {
        id: 'tools.update',
        group: 'tools',
        title: '检查软件版本更新',
        keywords: ['update', 'gengxin', 'upgrade', 'gx', 'version'],
        run: () => modals.setIsUpdateModalOpen(true),
      },

      // 导航与页面
      {
        id: 'nav.scroll_top',
        group: 'navigation',
        title: '回到内容区顶部',
        keywords: ['top', 'dingbu', 'scroll', 'db', 'huidaodingbu'],
        run: () => handleScrollToTop(),
      },
    ];
  }, [
    canUndo,
    selectedPost,
    hexo,
    modals,
    handleRefreshPosts,
    handleUndoPost,
    handleClearAll,
    handleOpenManualModal,
    handleOpenDeployModal,
    handleSelectTheme,
    handleToggleTheme,
    handleScrollToTop,
  ]);

  return (
    <div className="app-container">
      <Header
        hexoStatus={hexo.hexoStatus}
        onToggleServer={hexo.handleToggleServer}
        onPreview={hexo.handlePreview}
        onGenerate={hexo.handleGenerate}
        onClean={hexo.handleClean}
        onDeploy={handleOpenDeployModal}
        onOpenHealth={() => modals.setIsHealthOpen(true)}
        onOpenLogs={() => modals.setIsLogsOpen(true)}
        onOpenSettings={() => modals.openSettings('blog')}
        onOpenCommandPalette={() => modals.setIsCommandPaletteOpen(true)}
        isGenerating={hexo.isGenerating}
        isDeploying={hexo.isDeploying}
        brokenCount={brokenReports.length}
        isHealthChecking={isHealthChecking}
        theme={currentTheme}
        onToggleTheme={handleToggleTheme}
        onSelectTheme={handleSelectTheme}
        updateInfo={updateInfo}
        onOpenUpdate={() => modals.setIsUpdateModalOpen(true)}
      />

      <div className="app-body">
        <Sidebar
          posts={posts}
          selectedPost={selectedPost}
          onSelectPost={setSelectedPost}
          searchQuery={searchQuery}
          onSearchChange={q => {
            setSearchQuery(q);
            loadPostsList(q, sortBy);
          }}
          sortBy={sortBy}
          onSortChange={s => {
            setSortBy(s);
            loadPostsList(searchQuery, s);
          }}
          brokenPostPaths={brokenPostPaths}
          isRefreshing={isRefreshingPosts}
          onRefreshPosts={() => handleRefreshPosts(false)}
          onOpenCreatePost={() => modals.setIsCreatePostOpen(true)}
        />

        <main
          className="app-main-content"
          ref={mainContentRef}
          onScroll={handleMainScroll}
        >
          {selectedPost ? (
            <>
              <CoverArea
                post={selectedPost}
                coverFields={coverFields}
                brokenReports={brokenReports}
                brokenUrls={brokenUrls}
                onOpenLightbox={(url, title, fallbackUrl) => modals.openLightbox(url, title, fallbackUrl)}
                onClearField={handleClearField}
                onClearAll={handleClearAll}
                onDropImage={handleApplyImage}
                onCopyText={url => { navigator.clipboard.writeText(url); toast.success('链接已复制到剪贴板'); }}
                onOpenSystemURL={api.openSystemURL}
                onMarkBroken={(url, field) => handleMarkBroken(url, selectedPost.file_path, field, selectedPost.title)}
                onUndo={() => handleUndoPost(selectedPost.file_path)}
                canUndo={canUndo}
                undoDesc={undoDesc}
                onOpenHistory={() => modals.setIsHistoryModalOpen(true)}
                historyCount={postHistory.length}
              />

              <PhotoGallery
                post={selectedPost}
                defaultOwner={config?.github_owner || ''}
                defaultPattern={config?.socialify_pattern || 'Signal'}
                defaultTheme={config?.socialify_theme || 'Dark'}
                initialKeyword=""
                coverFields={coverFields}
                defaultOrientation={config?.orientation || 'landscape'}
                defaultSize={config?.image_size || 'large'}
                infiniteScrollEnabled={!!config?.infinite_scroll}
                brokenUrls={brokenUrls}
                onApplyImage={handleApplyImage}
                onInsertBodyImage={handleInsertBodyImage}
                onOpenLightbox={(url, title, fallbackUrl) => modals.openLightbox(url, title, fallbackUrl)}
                onOpenManualModal={handleOpenManualModal}
              />
            </>
          ) : (
            <div className="empty-selection-view">
              <FileText size={48} style={{ opacity: 0.35, marginBottom: 8 }} />
              <div style={{ fontSize: 16, fontWeight: 500 }}>请在左侧选择一篇 Hexo 博客文章</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>可在上方搜索框实时过滤关键词</div>
            </div>
          )}

          <button
            type="button"
            className={`back-to-top-btn ${showBackToTop ? 'visible' : ''}`}
            onClick={handleScrollToTop}
            title="滚动回到顶部"
            aria-label="回到顶部"
          >
            <ArrowUp size={18} />
          </button>
        </main>
      </div>

      {/* 弹窗挂载层 */}
      <DeployModal
        isOpen={modals.isDeployModalOpen}
        deployMode={config?.deploy_mode || 'git'}
        defaultCommitMsg={(() => {
          const tmpl = config?.git_commit_template || 'chore(cover): update cover for {title}';
          const title = selectedPost?.title || 'blog posts';
          const filename = selectedPost?.file_name || '';
          const dateStr = selectedPost?.date ? selectedPost.date.substring(0, 10) : new Date().toISOString().substring(0, 10);
          return tmpl
            .replace(/\{title\}/g, title)
            .replace(/\{filename\}/g, filename)
            .replace(/\{date\}/g, dateStr);
        })()}
        postTitle={selectedPost?.title}
        onClose={() => modals.setIsDeployModalOpen(false)}
        onDeploy={handleExecuteDeploy}
        isDeploying={hexo.isDeploying}
        deployError={hexo.deployError}
      />

      <ConfirmModal
        isOpen={modals.confirmModalState.isOpen}
        title={modals.confirmModalState.title}
        message={modals.confirmModalState.message}
        subMessage={modals.confirmModalState.subMessage}
        thumbUrl={modals.confirmModalState.thumbUrl}
        diffPreview={modals.confirmModalState.diffPreview}
        confirmText={modals.confirmModalState.confirmText}
        cancelText={modals.confirmModalState.cancelText}
        danger={modals.confirmModalState.danger}
        onCancel={modals.closeConfirm}
        onConfirm={modals.confirmModalState.onConfirm}
      />

      <HealthModal
        isOpen={modals.isHealthOpen}
        onClose={() => modals.setIsHealthOpen(false)}
        onSelectPostByPath={p => {
          const match = posts.find(x => x.file_path === p);
          if (match) setSelectedPost(match);
        }}
        posts={posts}
        onUpdateReports={setBrokenReports}
        onRunningChange={setIsHealthChecking}
      />

      <LogsModal
        isOpen={modals.isLogsOpen}
        onClose={() => modals.setIsLogsOpen(false)}
        status={hexo.hexoStatus}
      />

      <SettingsModal
        isOpen={modals.isSettingsOpen}
        onClose={() => modals.setIsSettingsOpen(false)}
        config={config}
        onSaved={cfg => {
          setConfig(cfg);
          loadPostsList();
        }}
        onAppearanceChange={handleAppearanceChange}
        initialCategory={modals.settingsCategory}
      />

      <Lightbox
        isOpen={modals.lightboxState.isOpen}
        onClose={modals.closeLightbox}
        url={modals.lightboxState.url}
        fallbackUrl={modals.lightboxState.fallbackUrl}
        title={modals.lightboxState.title}
        coverFields={coverFields}
        onApplyImage={handleApplyImage}
        onMarkBroken={handleMarkBroken}
      />

      <ManualUrlModal
        isOpen={modals.isManualOpen}
        onClose={() => modals.setIsManualOpen(false)}
        coverFields={coverFields}
        postTitle={selectedPost?.title}
        onApplyImage={handleApplyImage}
      />

      <UpdateModal
        isOpen={modals.isUpdateModalOpen}
        onClose={() => modals.setIsUpdateModalOpen(false)}
        versionInfo={updateInfo}
        onUpdateInfoChange={setUpdateInfo}
      />

      <CreatePostModal
        isOpen={modals.isCreatePostOpen}
        onClose={() => modals.setIsCreatePostOpen(false)}
        onPostCreated={handlePostCreated}
      />

      <PostHistoryModal
        isOpen={modals.isHistoryModalOpen}
        onClose={() => modals.setIsHistoryModalOpen(false)}
        post={selectedPost}
        onPostUpdated={updated => {
          setSelectedPost(updated);
          setPosts(prev => prev.map(p => p.file_path === updated.file_path ? updated : p));
          loadPostHistory(updated.file_path);
        }}
        onHistoryChanged={() => {
          if (selectedPost) {
            loadPostHistory(selectedPost.file_path);
          }
        }}
      />

      {/* ⌘K 全局命令面板 */}
      <CommandPalette
        isOpen={modals.isCommandPaletteOpen}
        onClose={() => modals.setIsCommandPaletteOpen(false)}
        commands={commandItems}
      />
    </div>
  );
};
