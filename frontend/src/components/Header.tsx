import React, { useState, useRef, useEffect } from 'react';
import { HexoStatus, VersionInfo } from '../types';
import { Icon } from './common/Icon';

interface HeaderProps {
  hexoStatus: HexoStatus | null;
  onToggleServer: () => void;
  onPreview: () => void;
  onGenerate: () => void;
  onClean: () => void;
  onDeploy: () => void;
  onOpenHealth: () => void;
  onOpenLogs: () => void;
  onOpenGlobalHistory: () => void;
  onOpenSettings: () => void;
  onOpenCommandPalette?: () => void;
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
  onOpenGlobalHistory,
  onOpenSettings,
  onOpenCommandPalette,
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
        <span className="brand-logo-badge">
          <Icon name="image" size="md" className="brand-logo-icon" />
        </span>
        <div className="brand-text">
          <h1 className="brand-title">hpic</h1>
          <span className="brand-badge">Hexo</span>
        </div>
        {updateInfo?.has_update && (
          <button
            className="header-update-badge"
            onClick={onOpenUpdate}
            title={`发现全新版本 ${updateInfo.latest_version}，点击查看详情并一键升级`}
          >
            <Icon name="sparkles" size="xs" variant="primary" />
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
              {isRunning ? `运行中 (:${port})` : '服务未启动'}
            </span>
          </div>

          <button
            className={`btn btn-sm btn-server-toggle ${isRunning ? 'btn-danger' : 'btn-primary'}`}
            onClick={onToggleServer}
            disabled={isGenerating}
            title={isGenerating ? '正在执行静态生成，已自动锁定服务操作以防冲突' : (isRunning ? '停止 Hexo 本地服务' : '启动 Hexo 本地服务 (自动 Watch 变化)')}
          >
            <Icon name={isRunning ? 'stop' : 'play'} size="xs" />
            <span>{isRunning ? '停止服务' : '启动服务'}</span>
          </button>

          {/* 预览按钮常驻：避免服务启停时出现突兀的按钮横向撑开与晃动 */}
          <button
            className="btn btn-sm btn-ghost"
            onClick={onPreview}
            disabled={!isRunning}
            title={isRunning ? `在浏览器中打开 http://localhost:${port} 预览博客` : "Hexo 本地服务未运行，启动服务后即可点击预览"}
          >
            <Icon name="external" size="xs" />
            <span>预览</span>
          </button>

          {/* 生成 & 清理 */}
          <button
            className="btn btn-sm btn-ghost"
            onClick={onGenerate}
            disabled={isGenerating}
            title={isRunning ? "检测到服务正在运行中，点击将安全联动：先关闭服务 -> 静态编译 -> 重新恢复启动本地服务" : "执行 hexo generate 全量静态页面打包"}
          >
            <Icon name={isGenerating ? 'loading' : 'zap'} size="xs" animation={isGenerating ? 'spin' : 'none'} />
            <span>{isGenerating ? '生成中...' : '生成'}</span>
          </button>

          <button
            className="btn btn-sm btn-ghost"
            onClick={onClean}
            disabled={isRunning}
            title={isRunning ? "Hexo 本地服务运行中不可清理缓存 (避免删除 db.json 导致服务崩溃)，请先停止服务" : "执行 hexo clean 清理缓存与公共文件"}
          >
            <Icon name="trash" size="xs" />
            <span>清理</span>
          </button>

          {/* 一键线上部署 */}
          <button
            className="btn btn-sm btn-ghost highlight-btn"
            onClick={onDeploy}
            disabled={isDeploying}
            title="一键部署到线上仓库/服务器 (hexo deploy)"
          >
            <Icon name={isDeploying ? 'loading' : 'send'} size="xs" animation={isDeploying ? 'spin' : 'none'} />
            <span>{isDeploying ? '部署中...' : '部署发布'}</span>
          </button>
        </div>

        {/* 404 健康体检 */}
        <button
          className={`btn btn-sm ${isHealthChecking ? 'btn-health-checking' : (brokenCount > 0 ? 'btn-warning-badge' : 'btn-ghost')}`}
          onClick={onOpenHealth}
          title={isHealthChecking ? '全站封面存活性体检进行中...' : '全站封面健康体检 (检测 404/失效封面)'}
        >
          <Icon name="activity" size="sm" animation={isHealthChecking ? 'pulse' : 'none'} />
          <span>{isHealthChecking ? '体检中...' : '体检'}</span>
          {brokenCount > 0 && !isHealthChecking && <span className="broken-pill">{brokenCount}</span>}
        </button>

        {/* 终端日志 */}
        <button className="btn btn-sm btn-ghost" onClick={onOpenLogs} title="查看 Hexo 终端实时运行日志">
          <Icon name="terminal" size="sm" />
          <span>日志</span>
        </button>

        {/* 全局操作历史（跨文章汇总，支持按批次撤销） */}
        <button
          className="btn btn-sm btn-ghost"
          onClick={onOpenGlobalHistory}
          title="查看全部文章的操作历史，支持按批次一键撤销"
        >
          <Icon name="history" size="sm" />
          <span>历史</span>
        </button>

        {/* 软件更新 (常驻顶部，点击检查最新 Release 并一键升级) */}
        <button
          className={`btn btn-sm ${updateInfo?.has_update ? 'btn-update-highlight' : 'btn-ghost'}`}
          onClick={onOpenUpdate}
          title={updateInfo?.has_update ? `发现新版本 ${updateInfo.latest_version}，点击查看并一键安装更新` : "检查 GitHub Releases 最新版本并更新"}
        >
          <Icon
            name={updateInfo?.has_update ? 'sparkles' : 'arrowUpCircle'}
            size="sm"
            animation={updateInfo?.has_update ? 'pulse' : 'none'}
            variant={updateInfo?.has_update ? 'primary' : 'default'}
          />
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
            <Icon name={theme === 'light' ? 'sun' : (theme === 'auto' ? 'laptop' : 'moon')} size="sm" />
          </button>

          {themeMenuOpen && (
            <div className="theme-dropdown-menu">
              <button
                className={`theme-dropdown-item ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handlePickTheme('light')}
              >
                <span className="theme-item-left">
                  <Icon name="sun" size="xs" />
                  <span>亮色清爽</span>
                </span>
                {theme === 'light' && <Icon name="check" size="xs" strokeWidth={2.5} />}
              </button>

              <button
                className={`theme-dropdown-item ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handlePickTheme('dark')}
              >
                <span className="theme-item-left">
                  <Icon name="moon" size="xs" />
                  <span>暗色黑夜</span>
                </span>
                {theme === 'dark' && <Icon name="check" size="xs" strokeWidth={2.5} />}
              </button>

              <button
                className={`theme-dropdown-item ${theme === 'auto' ? 'active' : ''}`}
                onClick={() => handlePickTheme('auto')}
              >
                <span className="theme-item-left">
                  <Icon name="laptop" size="xs" />
                  <span>跟随系统</span>
                </span>
                {theme === 'auto' && <Icon name="check" size="xs" strokeWidth={2.5} />}
              </button>
            </div>
          )}
        </div>

        {/* ⌘K 命令面板呼出按钮 */}
        {onOpenCommandPalette && (
          <button
            className="btn btn-sm btn-ghost header-command-btn"
            onClick={onOpenCommandPalette}
            title="打开命令面板 (快捷键 ⌘K 或 Ctrl+K)"
          >
            <Icon name="command" size="sm" />
            <span className="command-kbd-badge">⌘K</span>
          </button>
        )}

        {/* 偏好设置 */}
        <button className="btn btn-sm btn-ghost" onClick={onOpenSettings} title="打开偏好设置">
          <Icon name="settings" size="sm" />
        </button>
      </div>
    </header>
  );
};
