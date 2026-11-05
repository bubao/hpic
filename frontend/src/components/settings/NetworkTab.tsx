import React from 'react';
import { Globe, GitBranch, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface NetworkTabProps {
  proxy: string;
  setProxy: (val: string) => void;
  deployMode: 'git' | 'hexo';
  setDeployMode: (val: 'git' | 'hexo') => void;
  gitCommitTemplate: string;
  setGitCommitTemplate: (val: string) => void;
  isTestingProxy: boolean;
  proxyTestResult: { success: boolean; message: string; latency?: number } | null;
  setProxyTestResult: (val: any) => void;
  handleTestProxy: () => void;
}

export const NetworkTab: React.FC<NetworkTabProps> = ({
  proxy,
  setProxy,
  deployMode,
  setDeployMode,
  gitCommitTemplate,
  setGitCommitTemplate,
  isTestingProxy,
  proxyTestResult,
  setProxyTestResult,
  handleTestProxy,
}) => {
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-title">
          <Globe size={16} style={{ color: '#06b6d4' }} />
          <span>网络代理与海外图床加速</span>
        </div>

        <div className="form-group">
          <label className="form-label">网络代理地址 (支持 HTTP / SOCKS5):</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="form-input"
              value={proxy}
              onChange={e => {
                setProxy(e.target.value);
                setProxyTestResult(null);
              }}
              placeholder="http://127.0.0.1:7890 或 socks5://user:pass@127.0.0.1:1080"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={handleTestProxy}
              disabled={isTestingProxy}
              style={{ border: '1px solid var(--border-color)', whiteSpace: 'nowrap' }}
            >
              <RefreshCw size={13} className={isTestingProxy ? 'spin' : ''} />
              <span>{isTestingProxy ? '测试中...' : '测试连通性'}</span>
            </button>
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
            用于加速访问 Unsplash、Wallhaven 及 GitHub Release API，支持 RFC 1929 密码认证
          </span>
        </div>

        {proxyTestResult && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: proxyTestResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${proxyTestResult.success ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.28)'}`,
              color: proxyTestResult.success ? '#34d399' : '#f87171',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {proxyTestResult.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{proxyTestResult.message}</span>
            </div>
            {proxyTestResult.latency && (
              <span style={{ fontSize: 11.5, opacity: 0.85, fontFamily: 'monospace' }}>
                {proxyTestResult.latency}ms
              </span>
            )}
          </div>
        )}
      </div>

      <div className="settings-card">
        <div className="settings-card-title">
          <GitBranch size={16} style={{ color: '#ec4899' }} />
          <span>博客更新与部署偏好</span>
        </div>

        <div className="form-group">
          <label className="form-label">发布模式 (deploy_mode):</label>
          <div style={{ display: 'flex', gap: 18, marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="deployMode"
                value="git"
                checked={deployMode === 'git'}
                onChange={() => setDeployMode('git')}
                style={{ accentColor: 'var(--accent-color)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                轻量 Git 增量勾选提交部署 (推荐 - 安全且支持选择性发布)
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="deployMode"
                value="hexo"
                checked={deployMode === 'hexo'}
                onChange={() => setDeployMode('hexo')}
                style={{ accentColor: 'var(--accent-color)' }}
              />
              <span style={{ fontSize: 13, fontWeight: 500 }}>
                调用 hexo deploy 命令行全量发布
              </span>
            </label>
          </div>
        </div>

        {deployMode === 'git' && (
          <div className="form-group" style={{ marginTop: 8 }}>
            <label className="form-label">Git Commit 默认提交说明模板 (git_commit_template):</label>
            <input
              type="text"
              className="form-input"
              value={gitCommitTemplate}
              onChange={e => setGitCommitTemplate(e.target.value)}
              placeholder="chore(cover): update cover for {title}"
            />
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              支持使用 <code>{'{title}'}</code> 动态占位符，执行单个文章提交时将自动替换为具体博文标题
            </span>
          </div>
        )}
      </div>
    </>
  );
};
