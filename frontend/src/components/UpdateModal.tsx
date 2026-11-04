import React, { useState, useEffect } from 'react';
import { VersionInfo } from '../types';
import { api } from '../api';
import { Modal } from './Modal';
import { Sparkles, Copy, ExternalLink, ArrowRight, Check, RefreshCw, CheckCircle, Zap, History } from 'lucide-react';
import { useToast } from '../context/ToastContext';

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
  const [changelogContent, setChangelogContent] = useState<string>('');
  const [loadingChangelog, setLoadingChangelog] = useState(false);

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

  if (!isOpen) return null;

  // 手动重新检查
  const handleRecheck = async () => {
    setIsRechecking(true);
    setInstallSuccessMsg(null);
    try {
      const info = await api.checkVersion();
      onUpdateInfoChange?.(info);
      if (info.has_update) {
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
        // 更新本地已感知版本
        if (onUpdateInfoChange && versionInfo) {
          onUpdateInfoChange({
            ...versionInfo,
            current_version: versionInfo.latest_version,
            has_update: false,
          });
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
    : 'v0.0.1';

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
      size="md"
    >
      <div className="update-modal-body">
        {/* Tab 导航切换 */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          marginBottom: 16,
          gap: 16,
          paddingBottom: 2
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'current' ? '2px solid var(--accent-color)' : '2px solid transparent',
              color: activeTab === 'current' ? 'var(--accent-color)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Sparkles size={14} />
            <span>版本检测</span>
            {hasUpdate && (
              <span style={{
                background: '#a855f7',
                color: '#fff',
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 10,
                lineHeight: 1.2
              }}>NEW</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2px solid var(--accent-color)' : '2px solid transparent',
              color: activeTab === 'history' ? 'var(--accent-color)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <History size={14} />
            <span>版本历史 (CHANGELOG)</span>
          </button>
        </div>

        {/* Tab 1: 当前版本与更新 */}
        {activeTab === 'current' && (
          <>
            {/* 安装成功展示 */}
            {installSuccessMsg ? (
              <div className="update-success-banner image-fade-in">
                <CheckCircle size={32} color="#10b981" />
                <div className="success-text-group">
                  <div className="success-title">新版本已成功安装生效</div>
                  <div className="success-desc">{installSuccessMsg}</div>
                  <div className="success-hint">提示：重新启动应用即可体验最新功能。</div>
                </div>
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
                    {hasUpdate ? <ArrowRight size={18} /> : (noRelease ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>vs</span> : <Check size={18} />)}
                  </div>
                  <div className="ver-tag-pill ver-latest">
                    <span className="ver-label">GitHub 最新发布</span>
                    <span className="ver-number">{latestVer}</span>
                  </div>
                </div>

                {/* 仓库尚未发布 Release 的提示 */}
                {noRelease && (
                  <div style={{
                    margin: '12px 0',
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: 'rgba(148, 163, 184, 0.1)',
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    fontSize: 13,
                    color: 'var(--text-color)'
                  }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>ℹ️ 官方 GitHub 仓库暂无正式 Release 记录</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
                      当前已连接至仓库 <code>{versionInfo?.repo || 'bubao/hpic'}</code>。当开发者推送并发布新版本后，此处将自动展示更新日志并提供就地一键安装！
                    </div>
                  </div>
                )}

                {/* 发现新版本的更新日志说明 */}
                {hasUpdate ? (
                  <>
                    <div className="release-notes-card">
                      <div className="notes-header">
                        <span className="notes-title">
                          {versionInfo?.release_name ? versionInfo.release_name : `${versionInfo?.latest_version} 版本更新内容`}
                        </span>
                        {versionInfo?.published_at && (
                          <span className="notes-date">
                            {new Date(versionInfo.published_at).toLocaleDateString()} 发布
                          </span>
                        )}
                      </div>
                      <div className="notes-scroll-area">
                        {versionInfo?.release_notes ? (
                          <pre className="notes-text-pre">{versionInfo.release_notes}</pre>
                        ) : (
                          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 12 }}>
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
                      <div style={{ fontWeight: 600, fontSize: 14 }}>太棒了！当前已是最新版本 ({currentVer})</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
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
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 8,
            padding: '14px 16px',
            maxHeight: 380,
            overflowY: 'auto'
          }}>
            {loadingChangelog ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '36px 0', gap: 8, color: 'var(--text-muted)' }}>
                <RefreshCw size={16} className="spin" />
                <span>正在加载版本历史...</span>
              </div>
            ) : changelogContent ? (
              <pre style={{
                margin: 0,
                fontSize: 12.5,
                lineHeight: 1.6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                color: 'var(--text-color)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {changelogContent}
              </pre>
            ) : (
              <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)', fontSize: 13 }}>
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

          {hasUpdate && !installSuccessMsg && activeTab === 'current' && (
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
