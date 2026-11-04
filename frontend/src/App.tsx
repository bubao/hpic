import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Config, HexoStatus, PostInfo, BrokenReport, VersionInfo } from './types';
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
import { ConfirmModal, DiffPreviewData } from './components/ConfirmModal';
import { UpdateModal } from './components/UpdateModal';
import { FileText, ArrowUp } from 'lucide-react';
import { useToast } from './context/ToastContext';

export const App: React.FC = () => {
  const toast = useToast();
  const [config, setConfig] = useState<Config | null>(null);
  const [posts, setPosts] = useState<PostInfo[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostInfo | null>(null);
  const [hexoStatus, setHexoStatus] = useState<HexoStatus | null>(null);

  // 404 失效封面报告
  const [brokenReports, setBrokenReports] = useState<BrokenReport[]>([]);
  // 经实时探测确认已失效的原图 URL 集合（用于在预览退出后即时在所有界面标注 404 失效）
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());

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
      let updated = false;

      if (filePath && field) {
        const exists = newReports.some(r => r.file_path === filePath && r.field === field && r.url === brokenUrl);
        if (!exists) {
          const matchedPost = posts.find(p => p.file_path === filePath);
          const fName = matchedPost?.file_name || filePath.split(/[\\/]/).pop() || '';
          newReports.push({
            file_path: filePath,
            file_name: fName,
            post_title: postTitle || matchedPost?.title || '未命名文章',
            field: field,
            url: brokenUrl,
            status_code: 404,
            error: '原图源站 404 已失效',
          });
          updated = true;
        }
      }

      // 自动同步反查全局包含该 URL 的所有文章与字段
      posts.forEach(p => {
        if (!p.images) return;
        Object.entries(p.images).forEach(([f, u]) => {
          if (u === brokenUrl) {
            const exists = newReports.some(r => r.file_path === p.file_path && r.field === f);
            if (!exists) {
              newReports.push({
                file_path: p.file_path,
                file_name: p.file_name,
                post_title: p.title,
                field: f,
                url: brokenUrl,
                status_code: 404,
                error: '原图源站 404 已失效',
              });
              updated = true;
            }
          }
        });
      });

      return updated ? newReports : prev;
    });
  }, [posts]);

  // 自动版本检测与更新
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  // 状态栏
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');

  // 右侧核心内容区滚动引用与回到顶部按钮
  const mainContentRef = useRef<HTMLElement | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const handleMainScroll = (e: React.UIEvent<HTMLElement>) => {
    setShowBackToTop(e.currentTarget.scrollTop > 260);
  };

  const handleScrollToTop = () => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 状态操作标识
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isHealthChecking, setIsHealthChecking] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  // 弹窗状态
  const [isHealthOpen, setIsHealthOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    subMessage?: string;
    thumbUrl?: string;
    diffPreview?: DiffPreviewData;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    onConfirm: () => {},
  });
  const [lightboxState, setLightboxState] = useState<{ isOpen: boolean; url: string; title: string; fallbackUrl?: string }>({
    isOpen: false,
    url: '',
    title: '',
  });

  // 加载基础配置与文章列表
  const loadInitialData = async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
      const postsRes = await api.getPosts('', 'date_desc');
      setPosts(postsRes.posts || []);
      if (postsRes.posts && postsRes.posts.length > 0) {
        setSelectedPost(postsRes.posts[0]);
      }
    } catch (e) {
      console.error('Failed to load initial data:', e);
    }
  };

  // 静默检查版本更新 (定时轮询与初次加载共用)
  const pollVersionUpdate = async () => {
    try {
      const info = await api.checkVersion();
      setUpdateInfo(info);
    } catch {
      // 网络离线或波动时静默忽略，不弹窗打扰博主
    }
  };

  const loadPostsList = async (q = searchQuery, s = sortBy) => {
    try {
      const res = await api.getPosts(q, s);
      setPosts(res.posts || []);
    } catch (e) {
      console.error('Failed to load posts:', e);
    }
  };

  const fetchStatus = async () => {
    try {
      const s = await api.getHexoStatus();
      setHexoStatus(s);
    } catch {}
  };

  useEffect(() => {
    loadInitialData();
    fetchStatus();
    pollVersionUpdate();

    // 1. Hexo 本地服务状态每 3 秒检测一次
    const hexoTimer = setInterval(fetchStatus, 3000);

    // 2. GitHub Release 版本更新：每 10 分钟自动静默轮询一次
    const VERSION_POLL_INTERVAL = 10 * 60 * 1000;
    const versionTimer = setInterval(pollVersionUpdate, VERSION_POLL_INTERVAL);

    return () => {
      clearInterval(hexoTimer);
      clearInterval(versionTimer);
    };
  }, []);

  // 排序与搜索变更
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    loadPostsList(q, sortBy);
  };

  const handleSortChange = (s: string) => {
    setSortBy(s);
    loadPostsList(searchQuery, s);
  };

  // Hexo 服务与部署
  const handleToggleServer = async () => {
    const isRunning = !!(hexoStatus?.server_running || hexoStatus?.running);
    if (isRunning) {
      const res = await api.stopHexoServer();
      if (res.success && res.status) {
        setHexoStatus(res.status);
      }
      setTimeout(fetchStatus, 300);
      setTimeout(fetchStatus, 1000);
    } else {
      const res = await api.startHexoServer(4000);
      if (res.success && res.status) {
        setHexoStatus(res.status);
        toast.success('Hexo 本地服务启动成功！');
      } else {
        toast.error(`启动 Hexo 服务失败: ${res.error || '未知错误，请查看控制台日志'}`);
        setIsLogsOpen(true);
      }
      setTimeout(fetchStatus, 600);
      setTimeout(fetchStatus, 1500);
    }
  };

  const handlePreview = () => {
    api.openSystemURL(`http://localhost:${hexoStatus?.port || 4000}`);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await api.runHexoGenerate();
      if (res.success) {
        toast.success(`静态生成完成！耗时: ${res.duration}`);
        fetchStatus();
      } else {
        toast.error('生成失败: ' + res.error);
        setIsLogsOpen(true);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClean = async () => {
    const res = await api.runHexoClean();
    if (res.success) {
      toast.success(`清理完成！耗时: ${res.duration}`);
      fetchStatus();
    }
  };

  // 点击顶栏部署按钮：打开部署弹窗
  const handleOpenDeployModal = () => {
    setDeployError(null);
    setIsDeployModalOpen(true);
  };

  // 部署弹窗内提交
  const handleExecuteDeploy = async (opts: { mode: 'git' | 'hexo'; commitMsg: string; files: string[] }) => {
    setIsDeploying(true);
    setDeployError(null);
    try {
      const res = await api.runHexoDeploy({
        mode: opts.mode,
        commit_message: opts.commitMsg,
        files: opts.files,
      });
      if (res.success) {
        setIsDeployModalOpen(false);
        if (opts.mode === 'git') {
          toast.success(`Git 推送成功！已触发线上构建 (耗时: ${res.duration})`);
        } else {
          toast.success(`Hexo 部署成功！耗时: ${res.duration}`);
        }
        fetchStatus();
      } else {
        setDeployError(res.error || '发布未成功，请查看上方提示');
      }
    } catch (e: any) {
      setDeployError(e?.message || '网络连接失败');
    } finally {
      setIsDeploying(false);
    }
  };

  // 应用图片到文章封面
  // 底层执行封面写入
  const doApplyImage = async (url: string, fields: string[]) => {
    if (!selectedPost) return;
    const res = await api.updatePost({
      file_path: selectedPost.file_path,
      raw_url: url,
      apply_fields: fields,
    });
    if (res.success && res.post) {
      setSelectedPost(res.post);
      // 更新列表中的文章数据
      setPosts(prev => prev.map(p => p.file_path === res.post!.file_path ? res.post! : p));
      // 核心：用户已替换了正常照片，立即从体检失效列表中移除这几个字段的失效记录！
      setBrokenReports(prev => prev.filter(b => !(b.file_path === selectedPost.file_path && fields.includes(b.field))));
      toast.success('封面已成功更新');
    } else if (res.error) {
      toast.error(res.error);
    }
  };

  // 应用图片到文章封面 (安全拦截：1. 若目标原图 404 失效，阻断使用；2. 若源站防盗链，给出明确警示；3. 若覆盖已有图片，弹出前后对比确认)
  const handleApplyImage = async (url: string, fields: string[]) => {
    if (!selectedPost) {
      toast.info('请先在左侧选择一篇文章');
      return;
    }

    // 1. 严格使用资源自己的地址，点击使用时触发源站连通性与防盗链拦截检查
    if (url.startsWith('http')) {
      try {
        const check = await api.checkImageHealth(url);
        if (check.is_broken) {
          toast.error('【已拦截】该图片在源站已 404 失效，无法作为博客封面！请换选其他图片。');
          return;
        }
        if (check.need_proxy) {
          toast.error('【防盗链警告】该图床服务器限制外部直接引用 (Hotlink Protection)，发布到博客后很可能裂图，建议挑选其他可公开直连的壁纸！');
          // 给予用户二次确认或直接警示
        }
      } catch {
        // 网络异常时不强行阻断
      }
    }

    // 2. 检查是否有已有封面图片将被覆盖
    const existingOverrides = fields
      .map(f => {
        const oldUrl = (selectedPost.images && selectedPost.images[f]) ||
          (f === 'index_img' ? selectedPost.index_img : f === 'banner_img' ? selectedPost.banner_img : '') || '';
        return { field: f, oldUrl };
      })
      .filter(item => item.oldUrl && item.oldUrl.trim() !== '' && item.oldUrl !== url);

    if (existingOverrides.length > 0) {
      // 目标字段已有封面，触发覆盖确认对比弹窗，防误触防覆盖丢失
      const overrideFields = existingOverrides.map(o => o.field);
      const firstOldUrl = existingOverrides[0].oldUrl;

      setConfirmModalState({
        isOpen: true,
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
          setConfirmModalState(prev => ({ ...prev, isOpen: false }));
          await doApplyImage(url, fields);
        },
      });
      return;
    }

    // 若原先字段为空，直接写入应用，无需繁琐确认打扰用户
    await doApplyImage(url, fields);
  };

  // 清除单个封面字段
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
      toast.success(`已清除 ${field}`);
    }
  };

  // 清除所有封面字段 (使用 React ConfirmModal 代替原生 confirm)
  const handleClearAll = () => {
    if (!selectedPost) return;
    setConfirmModalState({
      isOpen: true,
      title: '清空封面确认',
      message: `确定清除《${selectedPost.title}》的所有封面图片吗？`,
      confirmText: '确认清空',
      cancelText: '取消',
      danger: true,
      onConfirm: async () => {
        setConfirmModalState(prev => ({ ...prev, isOpen: false }));
        const res = await api.updatePost({
          file_path: selectedPost.file_path,
          clear_fields: ['all'],
        });
        if (res.success && res.post) {
          setSelectedPost(res.post);
          setPosts(prev => prev.map(p => p.file_path === res.post!.file_path ? res.post! : p));
          setBrokenReports(prev => prev.filter(b => b.file_path !== selectedPost.file_path));
          toast.success('已清空该博文的所有封面图片');
        }
      },
    });
  };

  const handleOpenManualModal = () => {
    setIsManualOpen(true);
  };

  // 全局 ESC 快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxState(prev => ({ ...prev, isOpen: false }));
        setIsHealthOpen(false);
        setIsLogsOpen(false);
        setIsSettingsOpen(false);
        setIsManualOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const coverFields = config?.cover_fields || ['index_img', 'banner_img'];
  const brokenPostPaths = useMemo(() => {
    const paths = new Set(brokenReports.map(r => r.file_path));
    if (brokenUrls.size > 0) {
      posts.forEach(p => {
        if (p.images && Object.values(p.images).some(u => brokenUrls.has(u))) {
          paths.add(p.file_path);
        }
      });
    }
    return paths;
  }, [brokenReports, brokenUrls, posts]);

  return (
    <div className="app-layout">
      {/* 顶部控制栏 */}
      <Header
        hexoStatus={hexoStatus}
        onToggleServer={handleToggleServer}
        onPreview={handlePreview}
        onGenerate={handleGenerate}
        onClean={handleClean}
        onDeploy={handleOpenDeployModal}
        onOpenHealth={() => setIsHealthOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isGenerating={isGenerating}
        isDeploying={isDeploying}
        isHealthChecking={isHealthChecking}
        brokenCount={brokenReports.length}
        updateInfo={updateInfo}
        onOpenUpdate={() => setIsUpdateModalOpen(true)}
      />

      <div className="app-body">
        {/* 左侧文章列表与排序 */}
        <Sidebar
          posts={posts}
          selectedPost={selectedPost}
          onSelectPost={setSelectedPost}
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          sortBy={sortBy}
          onSortChange={handleSortChange}
          brokenPostPaths={brokenPostPaths}
        />

        {/* 右侧核心工作区 */}
        <main
          className="app-main-content"
          ref={mainContentRef}
          onScroll={handleMainScroll}
        >
          {selectedPost ? (
            <>
              {/* 动态封面展示与拖拽 */}
              <CoverArea
                post={selectedPost}
                coverFields={coverFields}
                brokenReports={brokenReports}
                brokenUrls={brokenUrls}
                onOpenLightbox={(url, title, fallbackUrl) => setLightboxState({ isOpen: true, url, title, fallbackUrl })}
                onClearField={handleClearField}
                onClearAll={handleClearAll}
                onDropImage={handleApplyImage}
                onCopyText={url => { navigator.clipboard.writeText(url); toast.success('链接已复制到剪贴板'); }}
                onOpenSystemURL={api.openSystemURL}
                onMarkBroken={(url, field) => handleMarkBroken(url, selectedPost.file_path, field, selectedPost.title)}
              />

              {/* 灵感配图与创作工作台 (内含 Unsplash摄影 / Wallhaven4K壁纸 / 极客生成器 / 灵感收藏夹 统一Tab) */}
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
                onOpenLightbox={(url, title, fallbackUrl) => setLightboxState({ isOpen: true, url, title, fallbackUrl })}
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

          {/* 滚动回到顶部悬浮按钮 */}
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

      {/* 弹窗与灯箱 */}
      <DeployModal
        isOpen={isDeployModalOpen}
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
        onClose={() => setIsDeployModalOpen(false)}
        onDeploy={handleExecuteDeploy}
        isDeploying={isDeploying}
        deployError={deployError}
      />

      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        subMessage={confirmModalState.subMessage}
        thumbUrl={confirmModalState.thumbUrl}
        diffPreview={confirmModalState.diffPreview}
        confirmText={confirmModalState.confirmText}
        cancelText={confirmModalState.cancelText}
        danger={confirmModalState.danger}
        onCancel={() => setConfirmModalState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModalState.onConfirm}
      />

      <HealthModal
        isOpen={isHealthOpen}
        onClose={() => setIsHealthOpen(false)}
        onSelectPostByPath={p => {
          const match = posts.find(x => x.file_path === p);
          if (match) setSelectedPost(match);
        }}
        posts={posts}
        onUpdateReports={setBrokenReports}
        onRunningChange={setIsHealthChecking}
      />

      <LogsModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
        status={hexoStatus}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaved={cfg => {
          setConfig(cfg);
          loadPostsList();
        }}
      />

      <Lightbox
        isOpen={lightboxState.isOpen}
        onClose={() => setLightboxState(prev => ({ ...prev, isOpen: false }))}
        url={lightboxState.url}
        fallbackUrl={lightboxState.fallbackUrl}
        title={lightboxState.title}
        coverFields={coverFields}
        onApplyImage={handleApplyImage}
        onMarkBroken={handleMarkBroken}
      />

      <ManualUrlModal
        isOpen={isManualOpen}
        onClose={() => setIsManualOpen(false)}
        coverFields={coverFields}
        postTitle={selectedPost?.title}
        onApplyImage={handleApplyImage}
      />

      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        versionInfo={updateInfo}
        onUpdateInfoChange={setUpdateInfo}
      />
    </div>
  );
};
