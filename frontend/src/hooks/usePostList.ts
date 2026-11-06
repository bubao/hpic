import { useState, useCallback, useRef, useEffect } from 'react';
import { PostInfo, OperationRecord } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export interface UsePostListOptions {
  autoSync?: boolean;
  pollingInterval?: number;
}

export function usePostList(options?: UsePostListOptions) {
  const toast = useToast();
  const [posts, setPosts] = useState<PostInfo[]>([]);
  const [selectedPost, setSelectedPost] = useState<PostInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [isRefreshingPosts, setIsRefreshingPosts] = useState(false);
  const [postHistory, setPostHistory] = useState<OperationRecord[]>([]);

  // 记录最近一次探测到的目录最后修改时间戳与文件数
  const lastStatusRef = useRef<{ lastModified: number | null; count: number | null }>({
    lastModified: null,
    count: null,
  });
  const isCheckingRef = useRef(false);

  // 组件卸载保护 ref，避免在已卸载组件上调用 setState
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // 加载当前选中文章的变更历史与可撤销记录
  const loadPostHistory = useCallback(async (filePath?: string) => {
    const target = filePath || selectedPost?.file_path;
    if (!target) {
      if (isMountedRef.current) setPostHistory([]);
      return;
    }
    try {
      const res = await api.getPostHistory(target);
      if (res.success && isMountedRef.current) {
        setPostHistory(res.history || []);
      }
    } catch {
      // 容错处理
    }
  }, [selectedPost?.file_path]);

  useEffect(() => {
    if (selectedPost?.file_path) {
      loadPostHistory(selectedPost.file_path);
    }
  }, [selectedPost?.file_path, loadPostHistory]);

  const handleRefreshPosts = useCallback(async (silent = false, q = searchQuery, s = sortBy) => {
    setIsRefreshingPosts(true);
    try {
      const res = await api.getPosts(q, s);
      const newPosts = res.posts || [];
      if (!isMountedRef.current) return;

      setPosts(newPosts);

      if (typeof res.last_modified === 'number') {
        lastStatusRef.current.lastModified = res.last_modified;
        lastStatusRef.current.count = newPosts.length;
      }

      // 保持当前选中的文章；如果原选中的文章依然存在则维持选中，否则若列表不为空默认选中首篇
      setSelectedPost(prev => {
        if (!prev) return newPosts.length > 0 ? newPosts[0] : null;
        const found = newPosts.find(p => p.file_path === prev.file_path || p.title === prev.title);
        return found || prev;
      });

      if (!silent) {
        toast.success(`已刷新博文列表 (共 ${newPosts.length} 篇)`);
      }
    } catch (err: unknown) {
      if (!silent && isMountedRef.current) {
        const message = err instanceof Error ? err.message : '刷新博文列表失败';
        toast.error(message);
      }
    } finally {
      if (isMountedRef.current) setIsRefreshingPosts(false);
    }
  }, [searchQuery, sortBy, toast]);

  // 外部并发编辑感知检测逻辑
  const checkPostsChange = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    try {
      const status = await api.getPostsStatus();
      if (status && typeof status.last_modified === 'number') {
        const prev = lastStatusRef.current;
        const hasPrev = prev.lastModified !== null;
        const changed =
          hasPrev &&
          (status.last_modified !== prev.lastModified ||
            (typeof status.count === 'number' && status.count !== prev.count));

        lastStatusRef.current = {
          lastModified: status.last_modified,
          count: status.count,
        };

        if (changed) {
          // 外部文件发生变动，自动静默刷新博文列表并保留当前选中项
          await handleRefreshPosts(true);
        }
      }
    } catch {
      // 容错处理：网络抖动或轮询错误不干扰用户界面
    } finally {
      isCheckingRef.current = false;
    }
  }, [handleRefreshPosts]);

  // 监听外部并发变动（窗口切回 focus 与 10s 后台轻量轮询）
  useEffect(() => {
    if (options?.autoSync === false) return;

    // 1. 窗口激活 (从外部编辑器如 VS Code / Typora / Obsidian 切回 hpic)
    const handleFocus = () => {
      checkPostsChange();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        checkPostsChange();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // 2. 轻量后台轮询 (默认 10s)
    const intervalMs = options?.pollingInterval ?? 10000;
    const timer = setInterval(() => {
      checkPostsChange();
    }, intervalMs);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      clearInterval(timer);
    };
  }, [checkPostsChange, options?.autoSync, options?.pollingInterval]);

  const refreshPostsRef = useRef(handleRefreshPosts);
  useEffect(() => {
    refreshPostsRef.current = handleRefreshPosts;
  }, [handleRefreshPosts]);

  const loadPostsList = useCallback(async (q = searchQuery, s = sortBy) => {
    await handleRefreshPosts(true, q, s);
  }, [handleRefreshPosts, searchQuery, sortBy]);

  const handleUpdatePost = useCallback((updated: PostInfo) => {
    setSelectedPost(updated);
    setPosts(prev => prev.map(p => p.file_path === updated.file_path ? updated : p));
  }, []);

  return {
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
    handleUpdatePost,
    postHistory,
    setPostHistory,
    loadPostHistory,
    checkPostsChange,
  };
}
