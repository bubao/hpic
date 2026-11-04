import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { GitFileStatus } from '../types';
import { api } from '../api';
import { GitBranch, CheckSquare, Square, AlertCircle, Loader2, Copy, Check } from 'lucide-react';
import { Modal } from './Modal';

interface DeployModalProps {
  isOpen: boolean;
  deployMode: 'git' | 'hexo';
  defaultCommitMsg: string;
  postTitle?: string;
  onClose: () => void;
  onDeploy: (opts: { mode: 'git' | 'hexo'; commitMsg: string; files: string[] }) => Promise<void>;
  isDeploying: boolean;
  deployError?: string | null;
}

export const DeployModal: React.FC<DeployModalProps> = ({
  isOpen,
  deployMode,
  defaultCommitMsg,
  postTitle,
  onClose,
  onDeploy,
  isDeploying,
  deployError,
}) => {
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [commitMsg, setCommitMsg] = useState(defaultCommitMsg);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // 常见 Git Commit 快捷模板候选
  const targetTitle = postTitle ? `"${postTitle}"` : 'blog posts';
  const COMMIT_PRESETS = useMemo(() => [
    { label: '封面更新', text: `chore(cover): update cover for ${targetTitle}` },
    { label: '博文发布', text: `docs(post): publish ${targetTitle}` },
    { label: '样式排版', text: `style: refine layout and cover for ${targetTitle}` },
    { label: '全站部署', text: `deploy: site updates (${new Date().toISOString().substring(0, 10)})` },
  ], [targetTitle]);

  const loadGitStatus = useCallback(async () => {
    setLoadingFiles(true);
    setFetchError(null);
    try {
      const res = await api.getGitStatus();
      if (res.success) {
        setFiles(res.files || []);
        // 默认全选修改过的文件
        setSelectedPaths(new Set((res.files || []).map(f => f.path)));
      } else {
        setFetchError(res.error || '获取 Git 变更文件列表失败');
      }
    } catch (e: any) {
      setFetchError(e?.message || '网络连接异常');
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      // 优先使用当前博文定制的默认信息，若博主之前在当前会话输入过则保留
      setCommitMsg(defaultCommitMsg);
      setFetchError(null);
      if (deployMode === 'git') {
        loadGitStatus();
      }
    }
  }, [isOpen, deployMode, defaultCommitMsg, loadGitStatus]);

  if (!isOpen) return null;

  const toggleSelectAll = () => {
    if (selectedPaths.size === files.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(files.map(f => f.path)));
    }
  };

  const toggleFile = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (deployMode === 'git' && selectedPaths.size === 0) {
      return;
    }
    onDeploy({
      mode: deployMode,
      commitMsg: commitMsg.trim() || defaultCommitMsg,
      files: Array.from(selectedPaths),
    });
  };

  const fallbackCommand = `git add ${Array.from(selectedPaths).map(p => `"${p}"`).join(' ')} && git commit -m "${commitMsg.trim() || defaultCommitMsg}" && git push`;

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(fallbackCommand);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const getStatusBadge = (status: string) => {
    const s = status.trim();
    if (s === 'M') return <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 700, minWidth: 20 }}>修改</span>;
    if (s === '??' || s === 'A') return <span style={{ color: '#10b981', fontSize: 11, fontWeight: 700, minWidth: 20 }}>新增</span>;
    if (s === 'D') return <span style={{ color: '#ef4444', fontSize: 11, fontWeight: 700, minWidth: 20 }}>删除</span>;
    return <span style={{ color: '#6366f1', fontSize: 11, fontWeight: 700, minWidth: 20 }}>{s}</span>;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isDeploying ? () => {} : onClose}
      title={deployMode === 'git' ? 'Git 提交与线上发布' : '执行 Hexo 传统部署'}
      icon={<GitBranch size={16} color="var(--accent-color)" />}
      width={560}
      zIndex={120}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {deployMode === 'git' && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label className="form-label" style={{ fontSize: 12, margin: 0 }}>
                      Git Commit 提交信息 (可自由编辑):
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {commitMsg.length} 字符
                      </span>
                      {commitMsg !== defaultCommitMsg && !isDeploying && (
                        <button
                          type="button"
                          onClick={() => setCommitMsg(defaultCommitMsg)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-color)',
                            cursor: 'pointer',
                            fontSize: 11,
                            padding: 0,
                          }}
                          title="还原为默认模板生成的提交信息"
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    type="text"
                    className="form-input"
                    value={commitMsg}
                    disabled={isDeploying}
                    onChange={e => setCommitMsg(e.target.value)}
                    placeholder="输入自定义提交信息，如 docs: 完成新博文..."
                    style={{ width: '100%' }}
                  />

                  {/* 快捷模板 Chips */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>快捷模板:</span>
                    {COMMIT_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={isDeploying}
                        onClick={() => setCommitMsg(preset.text)}
                        style={{
                          fontSize: 11,
                          padding: '2px 7px',
                          borderRadius: 4,
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = 'var(--accent-color)';
                          e.currentTarget.style.color = '#fff';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                        title={preset.text}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                      选择要暂存提交的文件 ({selectedPaths.size}/{files.length}):
                    </span>
                    {files.length > 0 && !isDeploying && (
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-color)',
                          cursor: 'pointer',
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: 0,
                        }}
                      >
                        {selectedPaths.size === files.length ? <CheckSquare size={13} /> : <Square size={13} />}
                        {selectedPaths.size === files.length ? '取消全选' : '全部勾选'}
                      </button>
                    )}
                  </div>

                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      padding: '4px 8px',
                    }}
                  >
                    {loadingFiles && (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        <Loader2 size={16} className="spin" style={{ marginBottom: 4 }} />
                        <div>正在读取工作区 Git 状态...</div>
                      </div>
                    )}

                    {!loadingFiles && fetchError && (
                      <div style={{ padding: '14px 8px', color: '#ef4444', fontSize: 12 }}>
                        {fetchError}
                      </div>
                    )}

                    {!loadingFiles && !fetchError && files.length === 0 && (
                      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        工作区很干净，暂无任何变更文件
                      </div>
                    )}

                    {!loadingFiles && files.map(f => {
                      const isSelected = selectedPaths.has(f.path);
                      return (
                        <div
                          key={f.path}
                          onClick={() => !isDeploying && toggleFile(f.path)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 4px',
                            cursor: isDeploying ? 'default' : 'pointer',
                            fontSize: 12,
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isDeploying}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                          {getStatusBadge(f.status)}
                          <span
                            title={f.path}
                            style={{
                              color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                              fontFamily: 'monospace',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {f.path}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {deployMode === 'hexo' && (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                将直接运行本地配置的 <code>hexo deploy</code> 命令行指令发布到 Hexo 指定的部署源。
              </div>
            )}

            {deployError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 12, fontWeight: 600 }}>
                  <AlertCircle size={14} />
                  <span>部署中断或失败</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-word', lineHeight: 1.4 }}>
                  {deployError}
                </div>
                {deployMode === 'git' && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                      若因凭据授权或网络超时受阻，请在系统终端中直接运行以下命令：
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(0,0,0,0.4)',
                        padding: '6px 10px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: 'monospace',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                        {fallbackCommand}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCmd}
                        className="btn btn-xs btn-ghost"
                        style={{ padding: '2px 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {copiedCmd ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                        {copiedCmd ? '已复制' : '复制命令'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button type="button" className="btn btn-secondary btn-sm" disabled={isDeploying} onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={isDeploying || (deployMode === 'git' && selectedPaths.size === 0)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {isDeploying && <Loader2 size={13} className="spin" />}
            {isDeploying ? '正在发布中...' : deployMode === 'git' ? `提交并推送 (${selectedPaths.size})` : '确认部署'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
