import React, { useState, useRef, useEffect } from 'react';
import { HexoStatus, VersionInfo } from '../types';
import { Play, Square, ExternalLink, Zap, Trash2, Send, Activity, Terminal, Settings, Image, Sparkles, ArrowUpCircle, Moon, Sun, Laptop, Check } from 'lucide-react';

interface HeaderProps {
  hexoStatus: HexoStatus | null;
  onToggleServer: () => void;
  onPreview: () => void;
  onGenerate: () => void;
  onClean: () => void;
  onDeploy: () => void;
  onOpenHealth: () => void;
  onOpenLogs: () => void;
  onOpenSettings: () => void;
  isGenerating: boolean;
  isDeploying: boolean;
  brokenCount?: number;
  isHealthChecking?: boolean;
  updateInfo?: VersionInfo | null;
  onOpenUpdate?: () => void;
  theme?: 'dark' | 'light' | 'auto';
  onToggleTheme?: () => void;
  onSelectTheme?: (theme: 'dark' | 'light' | 'auto') => void;
}

export const Header: React.FC<HeaderProps> = ({
  hexoStatus,
  onToggleServer,
  onPreview,
  onGenerate,
  onClean,
  onDeploy,
  onOpenHealth,
  onOpenLogs,
  onOpenSettings,
  isGenerating,
  isDeploying,
  brokenCount = 0,
  isHealthChecking = false,
  updateInfo,
  onOpenUpdate,
  theme = 'dark',
  onToggleTheme,
  onSelectTheme,
}) => {
  const isRunning = !!(hexoStatus?.server_running || hexoStatus?.running);
  const port = hexoStatus?.port || 4000;
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部自动收起主题下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    if (themeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [themeMenuOpen]);

  const handlePickTheme = (t: 'dark' | 'light' | 'auto') => {
    setThemeMenuOpen(false);
    if (onSelectTheme) {
      onSelectTheme(t);
    } else if (onToggleTheme) {
      onToggleTheme();
    }
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="brand-logo"><Image size={18} /></span>
        <div>
          <h1 className="brand-title">hpic</h1>
          <span className="brand-badge">Hexo</span>
        </div>
        {updateInfo?.has_update && (
          <button
            className="header-update-badge"
            onClick={onOpenUpdate}
            title={`发现全新版本 ${updateInfo.latest_version}，点击查看详情并一键升级`}
          >
            <Sparkles size={12} />
            <span>可升级 {updateInfo.latest_version}</span>
          </button>
        )}
      </div>

      <div className="header-controls">
        {/* Hexo 状态与服务开关 */}
        <div className="hexo-bar">
          <div className="server-indicator">
            <span className={`status-dot ${isRunning ? 'running' : ''}`} />
            <span className="server-text">
              {isRunning ? `服务中 (:${port})` : '未启动'}
            </span>
          </div>

          <button
            className={`btn btn-sm ${isRunning ? 'btn-danger' : 'btn-primary'}`}
            onClick={onToggleServer}
            disabled={isGenerating}
            title={isGenerating ? '正在执行静态生成，已自动锁定服务操作以防冲突' : (isRunning ? '停止 Hexo 本地服务' : '启动 Hexo 本地服务 (自动 Watch 变化)')}
          >
            {isRunning ? <Square size={13} /> : <Play size={13} />}
            <span>{isRunning ? '停止' : '启动服务'}</span>
          </button>

          {isRunning && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={onPreview}
              title="在浏览器中打开 http://localhost:4000 预览博客"
            >
              <ExternalLink size={13} />
              <span>预览</span>
            </button>
          )}

          <div className="divider-v" />

          {/* 生成 & 清理 */}
          <button
            className="btn btn-sm btn-ghost"
            onClick={onGenerate}
            disabled={isGenerating}
            title={isRunning ? "检测到服务正在运行中，点击将安全联动：先关闭服务 -> 静态编译 -> 重新恢复启动本地服务" : "执行 hexo generate 全量静态页面打包"}
          >
            <Zap size={13} />
            <span>{isGenerating ? '生成中 (联动服务)...' : '生成'}</span>
          </button>

          <button
            className="btn btn-sm btn-ghost"
            onClick={onClean}
            disabled={isRunning}
            title={isRunning ? "Hexo 本地服务运行中不可清理缓存 (避免删除 db.json 导致服务崩溃)，请先停止服务" : "执行 hexo clean 清理缓存与公共文件"}
          >
            <Trash2 size={13} />
            <span>清理</span>
          </button>

          {/* 一键线上部署 */}
          <button
            className="btn btn-sm btn-ghost highlight-btn"
            onClick={onDeploy}
            disabled={isDeploying}
            title="一键部署到线上仓库/服务器 (hexo deploy)"
          >
            <Send size={13} />
            <span>{isDeploying ? '部署中...' : '部署发布'}</span>
          </button>
        </div>

        {/* 404 健康体检 */}
        <button
          className={`btn btn-sm ${isHealthChecking ? 'btn-health-checking' : (brokenCount > 0 ? 'btn-warning-badge' : 'btn-ghost')}`}
          onClick={onOpenHealth}
          title={isHealthChecking ? '全站封面存活性体检进行中...' : '全站封面健康体检 (检测 404/失效封面)'}
        >
          <Activity size={14} className={isHealthChecking ? 'pink-ecg-pulse' : ''} />
          <span>{isHealthChecking ? '体检中...' : '体检'}</span>
          {brokenCount > 0 && !isHealthChecking && <span className="broken-pill">{brokenCount}</span>}
        </button>

        {/* 终端日志 */}
        <button className="btn btn-sm btn-ghost" onClick={onOpenLogs} title="查看 Hexo 终端实时运行日志">
          <Terminal size={14} />
          <span>日志</span>
        </button>

        {/* 软件更新 (常驻顶部，点击检查最新 Release 并一键升级) */}
        <button
          className={`btn btn-sm ${updateInfo?.has_update ? 'btn-update-highlight' : 'btn-ghost'}`}
          onClick={onOpenUpdate}
          title={updateInfo?.has_update ? `发现新版本 ${updateInfo.latest_version}，点击查看并一键安装更新` : "检查 GitHub Releases 最新版本并更新"}
        >
          {updateInfo?.has_update ? (
            <Sparkles size={14} className="sparkle-icon" />
          ) : (
            <ArrowUpCircle size={14} />
          )}
          <span>{updateInfo?.has_update ? `更新 (${updateInfo.latest_version})` : '更新'}</span>
          {updateInfo?.has_update && <span className="update-pulse-dot" />}
        </button>

        {/* 主题选择菜单 */}
        <div className="theme-menu-container" ref={themeMenuRef}>
          <button
            className={`btn btn-sm btn-ghost btn-icon-only ${themeMenuOpen ? 'active' : ''}`}
            onClick={() => setThemeMenuOpen(prev => !prev)}
            title={`当前主题: ${theme === 'light' ? '亮色清爽模式' : (theme === 'auto' ? '跟随系统' : '暗色黑夜模式')} (点击选择)`}
          >
            {theme === 'light' ? <Sun size={14} /> : (theme === 'auto' ? <Laptop size={14} /> : <Moon size={14} />)}
          </button>

          {themeMenuOpen && (
            <div className="theme-dropdown-menu">
              <button
                className={`theme-dropdown-item ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handlePickTheme('light')}
              >
                <span className="theme-item-left">
                  <Sun size={13} />
                  <span>亮色清爽</span>
                </span>
                {theme === 'light' && <Check size={13} strokeWidth={2.5} />}
              </button>

              <button
                className={`theme-dropdown-item ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handlePickTheme('dark')}
              >
                <span className="theme-item-left">
                  <Moon size={13} />
                  <span>暗色黑夜</span>
                </span>
                {theme === 'dark' && <Check size={13} strokeWidth={2.5} />}
              </button>

              <button
                className={`theme-dropdown-item ${theme === 'auto' ? 'active' : ''}`}
                onClick={() => handlePickTheme('auto')}
              >
                <span className="theme-item-left">
                  <Laptop size={13} />
                  <span>跟随系统</span>
                </span>
                {theme === 'auto' && <Check size={13} strokeWidth={2.5} />}
              </button>
            </div>
          )}
        </div>

        {/* 设置 */}
        <button className="btn btn-sm btn-ghost" onClick={onOpenSettings} title="打开配置与偏好设置">
          <Settings size={14} />
        </button>
      </div>
    </header>
  );
};
