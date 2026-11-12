import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Config } from './types';
import { api } from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CoverArea } from './components/CoverArea';
import { PhotoGallery } from './components/PhotoGallery';
import { ModalsLayer } from './components/ModalsLayer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SectionErrorFallback } from './components/common/SectionErrorFallback';
import { FileText, ArrowUp } from 'lucide-react';
import { useToast } from './context/ToastContext';
import { useTheme } from './utils/useTheme';
import { useHexoRunner } from './hooks/useHexoRunner';
import { usePostList } from './hooks/usePostList';
import { useModalManager } from './hooks/useModalManager';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useAppearanceController } from './hooks/useAppearanceController';
import { useBrokenImageRegistry } from './hooks/useBrokenImageRegistry';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useBackToTop } from './hooks/useBackToTop';
import { usePostMutator } from './hooks/usePostMutator';
import { buildCommandItems } from './commands';

export const App: React.FC = () => {
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);

  // 1. 弹窗与对话框管理器
  const modals = useModalManager();

  // 命令面板开合（稳定引用，供全局快捷键使用）
  const toggleCommandPalette = useCallback(() => {
    modals.setIsCommandPaletteOpen(prev => !prev);
  }, [modals.setIsCommandPaletteOpen]);

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

  // 侧边栏搜索变更：useCallback 固定引用。
  // 否则 App 每次重渲染（如 useHexoRunner 每 3s 轮询）都会生成新回调，
  // 触发 Sidebar 的防抖 effect 重建计时器，导致输入迟滞。
  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    loadPostsList(q, sortBy);
  }, [setSearchQuery, loadPostsList, sortBy]);

  // 博文本地状态单一同步入口（见 usePostMutator）
  const { applyLocalPost } = usePostMutator({
    setSelectedPost,
    setPosts,
    loadPostHistory,
  });

  // 旧版配置检测：原状态与迁移入口已确认为死代码（全库无消费点），随 A1 一并移除

  // 404 失效封面报告（见 useBrokenImageRegistry）
  const { brokenReports, setBrokenReports, mergeBrokenReports, brokenUrls, handleMarkBroken } = useBrokenImageRegistry();

  // 主题与自定义 CSS 动态挂载（外观控制逻辑见 useAppearanceController）
  const { currentTheme, handleSelectTheme, handleToggleTheme, handleAppearanceChange } = useAppearanceController({ config, setConfig });
  const customCSS = config?.custom_css || '';
  useTheme(currentTheme, customCSS);

  
  // 版本升级检测状态（轮询与提醒逻辑见 useAppBootstrap）
  const { updateInfo, setUpdateInfo } = useAppBootstrap({
    setConfig,
    setPosts,
    setSelectedPost,
    fetchHexoStatus: hexo.fetchStatus,
    openUpdateModal: modals.setIsUpdateModalOpen,
  });
  const [isHealthChecking, setIsHealthChecking] = useState(false);

  // 右侧核心内容区滚动引用与回到顶部按钮（见 useBackToTop）
  const mainContentRef = useRef<HTMLElement | null>(null);
  const { showBackToTop, handleMainScroll, handleScrollToTop } = useBackToTop(mainContentRef);

  const canUndo = postHistory.some(h => !h.is_undone);
  const undoDesc = useMemo(() => {
    const last = postHistory.find(h => !h.is_undone);
    if (!last) return '';
    if (last.operation_type === 'update_cover') return `恢复变更前的封面 (${last.field || '封面'})`;
    if (last.operation_type === 'clear_cover') return `恢复被清空的封面 (${last.field || '封面'})`;
    if (last.operation_type === 'insert_image') return '移除追加的正文配图';
    return '撤销上一变动';
  }, [postHistory]);

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
      applyLocalPost(res.post, selectedPost.file_path);
      setBrokenReports(prev => prev.filter(b => !(b.file_path === selectedPost.file_path && fields.includes(b.field))));
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
        applyLocalPost(res.post, targetPath);
        toast.success('已成功撤销上一步操作！');
      } else {
        toast.error(`撤销失败: ${res.error || '没有可撤销的操作'}`);
      }
    } catch (err: any) {
      toast.error(`撤销异常: ${err.message || '未知错误'}`);
    }
  };

  // 全局快捷键（⌘K / ⌘Z），见 useKeyboardShortcuts
  useKeyboardShortcuts({
    canUndo,
    selectedPostPath: selectedPost?.file_path,
    onToggleCommandPalette: toggleCommandPalette,
    onUndo: handleUndoPost,
  });

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
        applyLocalPost(res.post, selectedPost.file_path);
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
      applyLocalPost(res.post, selectedPost.file_path);
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
          applyLocalPost(res.post, selectedPost.file_path);
          setBrokenReports(prev => prev.filter(b => b.file_path !== selectedPost.file_path));
          toast.success('已清空全部封面');
        }
      },
    });
  };

  const handleOpenManualModal = () => {
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

  const coverFields = config?.cover_fields || ['index_img', 'banner_img'];

  const brokenPostPaths = useMemo(() => new Set(brokenReports.map(r => r.file_path)), [brokenReports]);

  // 全局 ⌘K 命令面板条目模型（注册表装配，见 commands/）
  const commandItems = useMemo(() => buildCommandItems({
    canUndo,
    selectedPost,
    hexoStatus: hexo.hexoStatus,
    onRefreshPosts: () => handleRefreshPosts(false),
    onCreatePost: () => modals.setIsCreatePostOpen(true),
    onUndoSelectedPost: () => {
      if (selectedPost) handleUndoPost(selectedPost.file_path);
    },
    onOpenHistory: () => modals.setIsHistoryModalOpen(true),
    onOpenGlobalHistory: () => modals.setIsGlobalHistoryOpen(true),
    onOpenManualUrl: () => handleOpenManualModal(),
    onClearAll: () => handleClearAll(),
    onToggleServer: () => hexo.handleToggleServer(),
    onPreview: () => hexo.handlePreview(),
    onGenerate: () => hexo.handleGenerate(),
    onClean: () => hexo.handleClean(),
    onOpenDeploy: () => handleOpenDeployModal(),
    onOpenLogs: () => modals.setIsLogsOpen(true),
    onSelectTheme: handleSelectTheme,
    onToggleTheme: handleToggleTheme,
    onOpenSettings: modals.openSettings,
    onOpenHealth: () => modals.setIsHealthOpen(true),
    onOpenUpdate: () => modals.setIsUpdateModalOpen(true),
    onScrollToTop: handleScrollToTop,
  }), [
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
        onOpenGlobalHistory={() => modals.setIsGlobalHistoryOpen(true)}
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
        <ErrorBoundary
          fallback={props => <SectionErrorFallback title="侧边栏" fill {...props} />}
        >
          <Sidebar
            posts={posts}
            selectedPost={selectedPost}
            onSelectPost={setSelectedPost}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
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
        </ErrorBoundary>

        <main
          className="app-main-content"
          ref={mainContentRef}
          onScroll={handleMainScroll}
        >
          {selectedPost ? (
            <>
              <ErrorBoundary
                fallback={props => <SectionErrorFallback title="封面区" fill {...props} />}
              >
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
              </ErrorBoundary>

              <ErrorBoundary
                fallback={props => <SectionErrorFallback title="图库区" fill {...props} />}
              >
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
              </ErrorBoundary>
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

      {/* 弹窗挂载层（集中装配 11 个全局 Modal，见 ModalsLayer） */}
      <ModalsLayer
        modals={modals}
        hexo={hexo}
        config={config}
        posts={posts}
        selectedPost={selectedPost}
        coverFields={coverFields}
        updateInfo={updateInfo}
        setUpdateInfo={setUpdateInfo}
        setConfig={setConfig}
        mergeBrokenReports={mergeBrokenReports}
        setIsHealthChecking={setIsHealthChecking}
        loadPostsList={loadPostsList}
        setSelectedPost={setSelectedPost}
        onDeploy={handleExecuteDeploy}
        onApplyImage={handleApplyImage}
        onMarkBroken={handleMarkBroken}
        onAppearanceChange={handleAppearanceChange}
        onPostCreated={handlePostCreated}
        onPostUpdated={applyLocalPost}
        onHistoryChanged={() => {
          if (selectedPost) {
            loadPostHistory(selectedPost.file_path);
          }
        }}
        commandItems={commandItems}
      />
    </div>
  );
};
