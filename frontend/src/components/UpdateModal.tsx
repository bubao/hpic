import React, { useState, useEffect, useRef, useCallback } from 'react';
import { VersionInfo, DEFAULT_APP_VERSION } from '../types';
import { api } from '../api';
import { Modal } from './Modal';
import { Sparkles, Copy, ExternalLink, ArrowRight, Check, RefreshCw, CheckCircle, Zap, History, Info, RotateCcw, Power } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { MarkdownView } from './MarkdownView';

const PENDING_RESTART_TTL_MS = 2 * 60 * 60 * 1000; // 2 小时有效（期间若尚未重启则应已手动处理）

interface PendingRestartState {
  latestVersion: string;
  installedAt: number;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  versionInfo: VersionInfo | null;
  onUpdateInfoChange?: (info: VersionInfo) => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  versionInfo,
  onUpdateInfoChange,
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [copied, setCopied] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installSuccessMsg, setInstallSuccessMsg] = useState<string | null>(null);
  const [isRechecking, setIsRechecking] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState(0);
  const [changelogContent, setChangelogContent] = useState<string>('');
  const [loadingChangelog, setLoadingChangelog] = useState(false);

  // 使用 ref 管理待重启状态，避免模块级可变变量
  const pendingRestartRef = useRef<PendingRestartState | null>(null);
  // 使用 ref 管理重启倒计时 timer，避免污染 window 对象
  const restartTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 加载全量版本历史
  const loadChangelog = async () => {
    setLoadingChangelog(true);
    try {
      const res = await api.getChangelog();
      if (res.success && res.changelog) {
        setChangelogContent(res.changelog);
      }
    } catch {
      // 容错处理
    } finally {
      setLoadingChangelog(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadChangelog();
    }
  }, [isOpen]);

  // 清除重启倒计时 timer 的辅助函数
  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearInterval(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  // 组件卸载时清理 timer
  useEffect(() => {
    return () => {
      clearRestartTimer();
    };
  }, [clearRestartTimer]);

  if (!isOpen) return null;

  // 清除过期的 pending-restart 记录
  const clearExpiredPendingRestart = () => {
    const pendingRestart = pendingRestartRef.current;
    if (pendingRestart && Date.now() - pendingRestart.installedAt > PENDING_RESTART_TTL_MS) {
      pendingRestartRef.current = null;
    }
  };

  // 将 pending-restart 状态合并到 fresh check 结果
  const applyPendingRestart = (info: VersionInfo): VersionInfo => {
    clearExpiredPendingRestart();
    const pendingRestart = pendingRestartRef.current;
    if (pendingRestart && info.has_update) {
      // 版本号匹配（latest 未变）且仍在 TTL 窗口内 → 维持"待重启"标记
      const latestV = info.latest_version.startsWith('v') ? info.latest_version : `v${info.latest_version}`;
      if (latestV === pendingRestart.latestVersion ||
          info.latest_version === pendingRestart.latestVersion ||
          latestV === pendingRestart.latestVersion.replace(/^v/, '')) {
        return { ...info, install_pending_restart: true };
      }
    }
    // 如果 running version 已等于 latest 版本 → 真正已是最新，清除标记
    const curV = (info.current_version || '').replace(/^v/, '');
    const latV = (info.latest_version || '').replace(/^v/, '');
    if (!info.has_update && curV && latV && curV === latV) {
      pendingRestartRef.current = null;
    }
    return info;
  };

  // 手动重新检查
  const handleRecheck = async () => {
    setIsRechecking(true);
    setInstallSuccessMsg(null);
    try {
      const rawInfo = await api.checkVersion();
      const info = applyPendingRestart(rawInfo);
      onUpdateInfoChange?.(info);
      if (info.install_pending_restart) {
        toast.info(`已安装 ${info.latest_version}，重启后生效`);
      } else if (info.has_update) {
        toast.info(`发现新版本: ${info.latest_version}`);
      } else {
        toast.success(`当前已是最新版本 (${info.current_version})`);
      }
    } catch (e: any) {
      toast.error('检查更新失败: ' + e.message);
    } finally {
      setIsRechecking(false);
    }
  };

  // 核心功能：软件内自动下载并就地安装更新
  const handleAutoInstall = async () => {
    if (!versionInfo?.has_update) return;
    setIsInstalling(true);
    setInstallSuccessMsg(null);
    try {
      const res = await api.installVersion();
      if (res.success) {
        setInstallSuccessMsg(res.message || `已成功安装 ${versionInfo.latest_version}！`);
        toast.success('更新安装成功！');

        // 记录待重启状态到 ref（modal 重新打开后可恢复标记）
        if (res.need_restart) {
          pendingRestartRef.current = { latestVersion: versionInfo.latest_version, installedAt: Date.now() };
        }

        // 透传后端标记的 need_restart，由父组件依据此字段切换至"请重启"引导 UI
        if (onUpdateInfoChange && versionInfo) {
          onUpdateInfoChange({
            ...versionInfo,
            current_version: res.need_restart ? versionInfo.current_version : versionInfo.latest_version,
            has_update: res.need_restart ? true : false,
            install_pending_restart: res.need_restart === true,
          });
        }

        // 启动倒计时 5 秒后自动重启应用
        if (res.need_restart) {
          startAutoRestart();
        }
      } else {
        toast.error(res.message || '安装更新未成功');
      }
    } catch (e: any) {
      toast.error('自动升级安装失败: ' + (e?.message || '未知错误'));
    } finally {
      setIsInstalling(false);
    }
  };

  // 自动重启倒计时：安装成功后 5 秒内用户可手动取消，否则调用后端 restart 接口
  const startAutoRestart = () => {
    // 清除已有 timer
    clearRestartTimer();
    setIsRestarting(true);
    setRestartCountdown(5);
    let counter = 5;
    restartTimerRef.current = setInterval(() => {
      counter--;
      setRestartCountdown(counter);
      if (counter <= 0) {
        clearRestartTimer();
        doRestart();
      }
    }, 1000);
  };

  const cancelAutoRestart = () => {
    clearRestartTimer();
    setIsRestarting(false);
    setRestartCountdown(0);
    toast.info('已取消自动重启，您可稍后手动重启应用');
  };

  const doRestart = async () => {
    setIsRestarting(true);
    setRestartCountdown(0);
    try {
      await api.restartVersion();
      // 后端会在 300ms 内退出进程；前端无需额外操作
    } catch (e: any) {
      setIsRestarting(false);
      toast.error('自动重启失败: ' + (e?.message || '未知错误') + '，请手动重启应用');
    }
  };

  // 复制终端一键升级命令
  const handleCopyCmd = () => {
    const isWin = navigator.userAgent.toLowerCase().includes('windows');
    const cmd = isWin
      ? 'irm https://raw.githubusercontent.com/bubao/hpic/master/install.ps1 | iex'
      : 'curl -fsSL https://raw.githubusercontent.com/bubao/hpic/master/install.sh | bash';

    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      toast.success('终端在线更新命令已复制到剪贴板！');
      setTimeout(() => setCopied(false), 2200);
    }).catch(() => {
      toast.info(`升级命令: ${cmd}`);
    });
  };

  const currentVer = versionInfo?.current_version
    ? (versionInfo.current_version.startsWith('v') ? versionInfo.current_version : `v${versionInfo.current_version}`)
    : (DEFAULT_APP_VERSION.startsWith('v') ? DEFAULT_APP_VERSION : `v${DEFAULT_APP_VERSION}`);

  const noRelease = !versionInfo?.latest_version || !!versionInfo?.no_release;

  const latestVer = noRelease
    ? '暂无 Release'
    : (versionInfo.latest_version.startsWith('v') ? versionInfo.latest_version : `v${versionInfo.latest_version}`);

  const hasUpdate = !!versionInfo?.has_update && !noRelease;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="软件更新与版本管理"
      icon={<Sparkles size={18} style={{ color: hasUpdate ? '#a855f7' : (noRelease ? '#94a3b8' : '#10b981') }} />}
      size="lg"
    >
      <div className="update-modal-body">
        {/* Tab 导航切换 */}
        <div className="update-tabs-nav">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`update-tab-btn ${activeTab === 'current' ? 'active' : ''}`}
          >
            <Sparkles size={14} />
            <span>版本检测</span>
            {hasUpdate && (
              <span className="update-new-badge">NEW</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`update-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          >
            <History size={14} />
            <span>版本历史 (CHANGELOG)</span>
          </button>
        </div>

        {/* Tab 1: 当前版本与更新 */}
        {activeTab === 'current' && (
          <>
            {/* 安装成功展示（待重启/倒计时重启中） */}
            {installSuccessMsg ? (
              <div className="update-success-banner image-fade-in">
                {isRestarting ? (
                  <>
                    <Power size={32} color="#f59e0b" className={restartCountdown > 0 ? 'pulse-animation' : ''} />
                    <div className="success-text-group">
                      <div className="success-title">
                        {restartCountdown > 0
                          ? `应用将在 ${restartCountdown} 秒后自动重启`
                          : '正在重启应用...'}
                      </div>
                      <div className="success-desc">{installSuccessMsg}</div>
                      {restartCountdown > 0 && (
                        <button
                          className="btn btn-ghost restart-cancel-btn"
                          onClick={cancelAutoRestart}
                          title="取消自动重启"
                        >
                          <span>取消自动重启 ({restartCountdown}s)</span>
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <RotateCcw size={32} color="#a855f7" />
                    <div className="success-text-group">
                      <div className="success-title">新版本已安装到磁盘</div>
                      <div className="success-desc">{installSuccessMsg}</div>
                      <div className="success-hint">提示：<strong>请重新启动 hpic 应用</strong> 后即可运行最新功能。</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* 版本对比横幅 */}
                <div className={`version-hero-banner ${hasUpdate ? 'banner-has-update' : (noRelease ? 'banner-no-release' : 'banner-is-latest')}`}>
                  <div className="ver-tag-pill ver-current">
                    <span className="ver-label">当前运行版本</span>
                    <span className="ver-number">{currentVer}</span>
                  </div>
                  <div className="ver-arrow-flow">
                    {hasUpdate ? <ArrowRight size={18} /> : (noRelease ? <span className="ver-label">vs</span> : <Check size={18} />)}
                  </div>
                  <div className="ver-tag-pill ver-latest">
                    <span className="ver-label">GitHub 最新发布</span>
                    <span className="ver-number">{latestVer}</span>
                  </div>
                </div>

                {/* 仓库尚未发布 Release 的提示 */}
                {noRelease && (
                  <div className="update-no-release-card">
                    <div className="update-no-release-title">
                      <Info size={14} className="update-no-release-title-icon" />
                      <span>官方 GitHub 仓库暂无正式 Release 记录</span>
                    </div>
                    <div className="update-no-release-desc">
                      当前已连接至仓库 <code>{versionInfo?.repo || 'bubao/hpic'}</code>。当开发者推送并发布新版本后，此处将自动展示更新日志并提供就地一键安装！
                    </div>
                  </div>
                )}

                {/* 已安装新版、待重启 */}
                {hasUpdate && versionInfo?.install_pending_restart ? (
                  <div className="update-pending-restart-card image-fade-in">
                    <div className="pending-restart-icon-wrap">
                      <RotateCcw size={28} color="#a855f7" />
                    </div>
                    <div className="pending-restart-content">
                      <div className="pending-restart-title">已安装 v{versionInfo?.latest_version}，请重启以生效</div>
                      <div className="pending-restart-desc">
                        新版二进制已写入磁盘。当前运行的仍是旧版本 (<code>{currentVer}</code>)，
                        退出当前应用后重新启动即可切换到新版本。
                      </div>
                      <div className="pending-restart-hint">
                        <Info size={13} />
                        <span>关闭应用后重新启动 hpic</span>
                      </div>
                    </div>
                  </div>
                ) : hasUpdate ? (
                  <>
                    <div className="release-notes-card">
                      <div className="notes-header">
                        <span className="notes-title">
                          <Sparkles size={15} style={{ color: '#a855f7' }} />
                          <span>{versionInfo?.release_name ? versionInfo.release_name : `${versionInfo?.latest_version} 版本更新内容`}</span>
                        </span>
                        {versionInfo?.published_at && (
                          <span className="notes-date">
                            {new Date(versionInfo.published_at).toLocaleDateString()} 发布
                          </span>
                        )}
                      </div>
                      <div className="notes-scroll-area">
                        {versionInfo?.release_notes ? (
                          <MarkdownView content={versionInfo.release_notes} />
                        ) : (
                          <div className="update-notes-empty">
                            该版本暂无详细文字说明，主要包含性能优化与功能体验增强。
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 快捷命令提示 */}
                    <div className="cli-hint-box">
                      <span className="cli-hint-text">亦可在终端运行一键升级：</span>
                      <button className="copy-cmd-pill" onClick={handleCopyCmd} title="点击复制更新命令">
                        <code>hpic update</code>
                        {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                      </button>
                    </div>
                  </>
                ) : (
                  !noRelease && (
                    <div className="already-latest-box">
                      <CheckCircle size={28} color="#10b981" />
                      <div className="update-latest-title">太棒了！当前已是最新版本 ({currentVer})</div>
                      <div className="update-latest-desc">
                        已与 GitHub Releases 保持同步，暂无更新。
                      </div>
                    </div>
                  )
                )}
              </>
            )}
          </>
        )}

        {/* Tab 2: 完整版本历史 CHANGELOG */}
        {activeTab === 'history' && (
          <div className="update-changelog-card">
            {loadingChangelog ? (
              <div className="update-status-box">
                <RefreshCw size={16} className="spin" />
                <span>正在加载版本历史...</span>
              </div>
            ) : changelogContent ? (
              <MarkdownView content={changelogContent} />
            ) : (
              <div className="update-status-box">
                暂未加载到版本历史记录。
              </div>
            )}
          </div>
        )}

        {/* 底部按钮栏 */}
        <div className="update-actions-bar">
          <button
            className="btn btn-ghost"
            onClick={handleRecheck}
            disabled={isRechecking || isInstalling}
            title="立即向 GitHub 查询最新发布"
          >
            <RefreshCw size={13} className={isRechecking ? 'spin' : ''} />
            <span>{isRechecking ? '正在检查...' : '重新检查'}</span>
          </button>

          {versionInfo?.release_url && (
            <button
              className="btn btn-ghost"
              onClick={() => api.openSystemURL(versionInfo.release_url)}
              title="在浏览器中查看 GitHub Release 页面"
            >
              <ExternalLink size={13} />
              <span>Release 页面</span>
            </button>
          )}

          {hasUpdate && !installSuccessMsg && activeTab === 'current' && !versionInfo?.install_pending_restart && (
            <button
              className="btn btn-primary highlight-upgrade-btn"
              onClick={handleAutoInstall}
              disabled={isInstalling}
              title="自动下载最新产物并就地替换安装"
            >
              {isInstalling ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  <span>正在下载并安装更新...</span>
                </>
              ) : (
                <>
                  <Zap size={14} />
                  <span>一键自动更新并安装</span>
                </>
              )}
            </button>
          )}

          {hasUpdate && !installSuccessMsg && activeTab === 'current' && versionInfo?.install_pending_restart && (
            <button className="btn btn-primary" onClick={onClose} title="关闭窗口，退出应用后重启即可生效">
              <RotateCcw size={14} />
              <span>关闭，稍后重启</span>
            </button>
          )}

          {installSuccessMsg && (
            <button className="btn btn-primary" onClick={onClose}>
              完成
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
