import React, { useState } from 'react';
import { Globe, GitBranch, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Config } from '../../types';
import { api } from '../../api';
import { useToast } from '../../context/ToastContext';
import { useConfigField } from './useConfigField';

interface NetworkTabProps {
  config: Config;
  onConfigChange: (patch: Partial<Config>) => void;
}

/**
 * 网络与部署设置（A9 状态下沉）：
 * 代理 / 部署方式草稿与代理测试状态均保存在 Tab 内部。
 */
export const NetworkTab: React.FC<NetworkTabProps> = ({ config, onConfigChange }) => {
  const toast = useToast();
  const [proxy, setProxy] = useConfigField('proxy', config, onConfigChange);
  const [deployMode, setDeployMode] = useConfigField('deploy_mode', config, onConfigChange);
  const [gitCommitTemplate, setGitCommitTemplate] = useConfigField('git_commit_template', config, onConfigChange);
  const [isTestingProxy, setIsTestingProxy] = useState(false);
  const [proxyTestResult, setProxyTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  const handleTestProxy = async () => {
    if (!proxy.trim()) {
      toast.info('请输入待检测的代理地址');
      return;
    }
    setIsTestingProxy(true);
    setProxyTestResult(null);
    try {
      const res = await api.testProxy(proxy.trim());
      setProxyTestResult({
        success: res.success,
        message: res.message || (res.success ? '代理连接成功' : res.error || '连接超时'),
        latency: res.latency_ms,
      });
      if (res.success) {
        toast.success(`代理连通可用！延迟: ${res.latency_ms || 0}ms`);
      } else {
        toast.error(`代理检测失败: ${res.error || res.message}`);
      }
    } catch (e: any) {
      setProxyTestResult({
        success: false,
        message: e.message || '网络请求异常',
      });
      toast.error('代理测试异常');
    } finally {
      setIsTestingProxy(false);
    }
  };

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
