import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '../api';
import { Config, PostInfo, VersionInfo } from '../types';
import { useToast } from '../context/ToastContext';

interface UseAppBootstrapOptions {
  setConfig: (cfg: Config) => void;
  setPosts: (posts: PostInfo[]) => void;
  setSelectedPost: Dispatch<SetStateAction<PostInfo | null>>;
  fetchHexoStatus: () => void;
  openUpdateModal: (open: boolean) => void;
}

/**
 * 应用启动引导（App.tsx A1 提取）：
 * 首屏数据加载、版本更新 10min 轮询（同版本仅提醒一次）、前后端版本契约裂隙监听。
 */
export function useAppBootstrap({
  setConfig,
  setPosts,
  setSelectedPost,
  fetchHexoStatus,
  openUpdateModal,
}: UseAppBootstrapOptions) {
  const toast = useToast();
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  // 同一版本只提醒一次，不每 10 分钟重复打扰
  const lastRemindedVersionRef = useRef<string | null>(null);

  // 加载基础配置与文章列表
  const loadInitialData = useCallback(async () => {
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
  }, [setConfig, setPosts, setSelectedPost]);

  // 后台静默轮询版本更新（每 10 分钟轻量查询一次 GitHub Releases，失败静默忽略）
  const pollVersionUpdate = useCallback(async () => {
    try {
      const info = await api.checkVersion();
      setUpdateInfo(info);
    } catch {
      // 静默忽略
    }
  }, []);

  useEffect(() => {
    loadInitialData();
    fetchHexoStatus();
    pollVersionUpdate();
    const updateTimer = setInterval(pollVersionUpdate, 10 * 60 * 1000);
    return () => clearInterval(updateTimer);
  }, [loadInitialData, fetchHexoStatus, pollVersionUpdate]);

  // 轮询发现新版本时主动提醒一次
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
        onClick: () => openUpdateModal(true),
      },
      duration: 10000,
    });
  }, [updateInfo, toast, openUpdateModal]);

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

  return { updateInfo, setUpdateInfo, loadInitialData };
}
