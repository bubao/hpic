import React from 'react';
import { Info, Download, RefreshCw, Check, Copy } from 'lucide-react';
import { Config, VersionInfo, DEFAULT_APP_VERSION } from '../../types';
import { MarkdownView } from '../MarkdownView';

interface AboutTabProps {
  config: Config;
  isCheckingVersion: boolean;
  versionResult: VersionInfo | null;
  isInstalling: boolean;
  changelogContent: string;
  isLoadingChangelog: boolean;
  handleManualCheckVersion: () => void;
  handleInstallUpdate: () => void;
  handleCopyConfigPath: () => void;
  hasCopiedPath: boolean;
}

export const AboutTab: React.FC<AboutTabProps> = ({
  config,
  isCheckingVersion,
  versionResult,
  isInstalling,
  changelogContent,
  isLoadingChangelog,
  handleManualCheckVersion,
  handleInstallUpdate,
  handleCopyConfigPath,
  hasCopiedPath,
}) => {
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">
          <Info size={16} style={{ color: 'var(--accent-color)' }} />
          <span>软件版本与在线更新检测</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>hpic 桌面客户端</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
              当前本地构建运行版本：<code>v{config.version || DEFAULT_APP_VERSION}</code>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleManualCheckVersion}
              disabled={isCheckingVersion || isInstalling}
              style={{ border: '1px solid var(--border-color)' }}
            >
              <RefreshCw size={13} className={isCheckingVersion ? 'spin' : ''} />
              <span>{isCheckingVersion ? '检查中...' : '检查新版本'}</span>
            </button>

            {versionResult?.has_update && !versionResult?.install_pending_restart && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleInstallUpdate}
                disabled={isInstalling}
              >
                <Download size={13} className={isInstalling ? 'spin' : ''} />
                <span>{isInstalling ? '下载安装中...' : `一键升级至 ${versionResult.latest_version}`}</span>
              </button>
            )}

            {versionResult?.install_pending_restart && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ border: '1px solid var(--border-color)', color: 'var(--accent-color)' }}
                title="新版已安装到磁盘，退出当前应用后重启即可生效"
              >
                <RefreshCw size={13} />
                <span>请重启以应用更新</span>
              </button>
            )}
          </div>
        </div>

        {versionResult && (
          <div
            style={{
              marginTop: 12,
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12.5,
              background: versionResult.has_update ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              border: `1px solid ${versionResult.has_update ? 'rgba(59, 130, 246, 0.28)' : 'rgba(16, 185, 129, 0.28)'}`,
              color: versionResult.has_update ? '#60a5fa' : '#34d399',
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {versionResult.has_update
                ? `发现新版本 ${versionResult.latest_version}！`
                : `当前已是最新版本 (v${versionResult.current_version})`}
            </div>
            {versionResult.has_update && versionResult.release_notes && (
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                更新要点：{versionResult.release_notes}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="settings-card">
        <div className="settings-card-title">
          <Info size={16} style={{ color: '#818cf8' }} />
          <span>版本演进与发布日志 (Release Changelog)</span>
        </div>

        <div
          style={{
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--bg-tertiary)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)',
          }}
        >
          {isLoadingChangelog ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
              加载更新历史中...
            </div>
          ) : (
            <MarkdownView content={changelogContent} />
          )}
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-title">
          <Info size={16} style={{ color: '#94a3b8' }} />
          <span>本地底层持久化配置文件</span>
        </div>

        <div className="form-group">
          <label className="form-label">持久化存储路径 (JSON):</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="form-input"
              value={config.config_file_path || '~/.hpicrc'}
              disabled
              style={{ flex: 1, opacity: 0.8, background: 'var(--bg-tertiary)', fontSize: 12 }}
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleCopyConfigPath}
              style={{ border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
            >
              {hasCopiedPath ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
              <span>{hasCopiedPath ? '已复制' : '复制路径'}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
