import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Config, BrokenReport, VersionInfo, LegacyCheckResult } from './types';
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
import { FileText, ArrowUp } from 'lucide-react';
import { useToast } from './context/ToastContext';
import { useTheme, AppTheme } from './utils/useTheme';
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
      setConfig(updatedConfig);
      await api.saveConfig({ theme: nextTheme });
    }
  };

  const handleToggleTheme = async () => {
    const nextTheme: AppTheme = currentTheme === 'dark' ? 'light' : currentTheme === 'light' ? 'auto' : 'dark';
    handleSelectTheme(nextTheme);
  };

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

  // 静默检查版本更新
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
    const updateTimer = setInterval(pollVersionUpdate, 30 * 60 * 1000);
    return () => clearInterval(updateTimer);
  }, []);

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

  // 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        const isInputFocused = ['INPUT', 'TEXTAREA'].includes((document.activeElement?.tagName || ''));
        if (!isInputFocused && canUndo && selectedPost?.file_path) {
          e.preventDefault();
          handleUndoPost(selectedPost.file_path);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canUndo, selectedPost?.file_path]);

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
        onOpenSettings={() => modals.setIsSettingsOpen(true)}
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
      />
    </div>
  );
};
