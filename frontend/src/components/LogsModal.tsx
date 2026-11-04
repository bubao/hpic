import React, { useRef, useEffect, useState } from 'react';
import { HexoStatus } from '../types';
import { Terminal, Copy, Bug, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';

interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: HexoStatus | null;
}

export const LogsModal: React.FC<LogsModalProps> = ({ isOpen, onClose, status }) => {
  const toast = useToast();
  const logBoxRef = useRef<HTMLDivElement>(null);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [status?.recent_logs, isOpen]);

  if (!isOpen) return null;

  const logs = status?.recent_logs || ['[Postpic] 暂无控制台日志输出'];
  const env = status?.env;

  const handleCopyLogs = () => {
    const fullLog = [
      '=== Postpic Hexo 环境诊断 ===',
      `Node 路径: ${env?.node_path || '未检测到'}`,
      `Hexo 路径: ${env?.hexo_bin || '未检测到'}`,
      `Hexo 根目录: ${env?.hexo_root || status?.hexo_root || '未找到'}`,
      `服务端口: ${status?.port || 4000}`,
      `运行状态: ${status?.server_running ? 'RUNNING' : 'STOPPED'}`,
      '',
      '=== 终端日志 ===',
      ...logs,
    ].join('\n');
    navigator.clipboard.writeText(fullLog);
    toast.success('包含环境诊断的完整日志已复制到剪贴板');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hexo 终端控制台实时日志"
      icon={<Terminal size={18} />}
      size="lg"
      headerRight={
        <>
          <button
            type="button"
            className={`btn btn-xs ${showDebug ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowDebug(!showDebug)}
          >
            <Bug size={12} />
            <span>{showDebug ? '隐藏调试信息' : '环境诊断'}</span>
            {showDebug ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={handleCopyLogs}>
            <Copy size={13} />
            <span>复制全部</span>
          </button>
        </>
      }
    >
      {/* 调试诊断信息折叠区 */}
      {showDebug && (
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            borderBottom: '1px solid var(--border-color)',
            padding: '12px 16px',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Node 路径: </span>
                {env?.node_path ? (
                  <span style={{ color: '#86efac', fontFamily: 'monospace' }}>
                    <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {env.node_path}
                  </span>
                ) : (
                  <span style={{ color: '#f87171' }}>
                    <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />
                    未检测到 Node.js (请确认已安装并在登录Shell中可用)
                  </span>
                )}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Hexo 根目录: </span>
                <span style={{ fontFamily: 'monospace', color: env?.hexo_root ? 'var(--text-primary)' : '#f87171' }}>
                  {env?.hexo_root || status?.hexo_root || '未找到 _config.yml'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Hexo 可执行文件: </span>
                <span style={{ fontFamily: 'monospace', color: env?.hexo_bin ? '#86efac' : 'var(--text-secondary)' }}>
                  {env?.hexo_bin || env?.npx_path || '未检测到'}
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>运行状态: </span>
                <span style={{ color: status?.server_running ? '#86efac' : '#94a3b8', fontWeight: 600 }}>
                  {status?.server_running ? `服务中 (端口: ${status.port})` : '未启动'}
                </span>
              </div>
            </div>
            {env?.path_dirs && env.path_dirs.length > 0 && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px' }}>
                  查看已生效的环境变量 PATH ({env.path_dirs.length} 个目录)
                </summary>
                <div style={{
                  maxHeight: 120,
                  overflowY: 'auto',
                  marginTop: 6,
                  padding: 8,
                  background: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: 4,
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  color: '#94a3b8'
                }}>
                  {env.path_dirs.map((d, i) => <div key={i}>{d}</div>)}
                </div>
              </details>
            )}
          </div>
        )}

      <div className="terminal-box" ref={logBoxRef} style={{ marginTop: showDebug ? 12 : 0 }}>
        {logs.map((line, idx) => (
          <div key={idx} className="terminal-log-line">{line}</div>
        ))}
      </div>
    </Modal>
  );
};
