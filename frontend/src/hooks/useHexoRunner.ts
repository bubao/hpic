import { useState, useEffect, useCallback, useRef } from 'react';
import { HexoStatus } from '../types';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

interface UseHexoRunnerOptions {
  onOpenLogs?: () => void;
}

export function useHexoRunner(options: UseHexoRunnerOptions = {}) {
  const toast = useToast();
  const [hexoStatus, setHexoStatus] = useState<HexoStatus | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await api.getHexoStatus();
      setHexoStatus(s);
    } catch {
      // 忽略偶发网络或服务未启动错误
    }
  }, []);

  const handleToggleServer = async () => {
    if (isGenerating) {
      toast.info('Hexo 静态生成正在执行中，已自动锁定服务操作以防冲突');
      return;
    }

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
        options.onOpenLogs?.();
      }
      setTimeout(fetchStatus, 600);
      setTimeout(fetchStatus, 1500);
    }
  };

  const handlePreview = () => {
    api.openSystemURL(`http://localhost:${hexoStatus?.port || 4000}`);
  };

  const handleGenerate = async () => {
    if (isGenerating) return;

    const wasServerRunning = !!(hexoStatus?.server_running || hexoStatus?.running);
    const serverPort = hexoStatus?.port || 4000;

    setIsGenerating(true);
    try {
      if (wasServerRunning) {
        toast.info('检测到 Hexo 本地服务运行中，正在联动先关闭服务以执行静态生成...');
        const stopRes = await api.stopHexoServer();
        if (stopRes.success && stopRes.status) {
          setHexoStatus(stopRes.status);
        }
      }

      const res = await api.runHexoGenerate();
      if (res.success) {
        toast.success(`静态生成完成！耗时: ${res.duration}`);
      } else {
        toast.error('生成失败: ' + res.error);
        options.onOpenLogs?.();
      }

      if (wasServerRunning) {
        toast.info('正在自动恢复启动 Hexo 本地服务...');
        const startRes = await api.startHexoServer(serverPort);
        if (startRes.success && startRes.status) {
          setHexoStatus(startRes.status);
          toast.success('Hexo 本地服务已自动恢复运行！');
        } else {
          toast.error(`恢复启动 Hexo 服务失败: ${startRes.error || '未知错误'}`);
        }
      }
    } catch (err: any) {
      toast.error(`生成过程异常: ${err?.message || '未知错误'}`);
    } finally {
      setIsGenerating(false);
      setTimeout(fetchStatus, 600);
    }
  };

  const handleClean = async () => {
    const res = await api.runHexoClean();
    if (res.success) {
      toast.success(`清理完成！耗时: ${res.duration}`);
      fetchStatus();
    }
  };

  // 轮询服务状态
  const fetchStatusRef = useRef(fetchStatus);
  useEffect(() => {
    fetchStatusRef.current = fetchStatus;
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
    const isBusy = !!(hexoStatus?.generate_running || hexoStatus?.generate_watch || isGenerating || isDeploying);
    const pollInterval = isBusy ? 1000 : 3000;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchStatusRef.current();
    }, pollInterval);

    return () => clearInterval(timer);
  }, [fetchStatus, isGenerating, isDeploying, hexoStatus?.generate_running, hexoStatus?.generate_watch]);

  return {
    hexoStatus,
    setHexoStatus,
    isGenerating,
    setIsGenerating,
    isDeploying,
    setIsDeploying,
    deployError,
    setDeployError,
    fetchStatus,
    handleToggleServer,
    handlePreview,
    handleGenerate,
    handleClean,
  };
}
