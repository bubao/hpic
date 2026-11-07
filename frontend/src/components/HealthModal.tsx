import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BrokenReport, HealthCheckResult, HealthProgressEvent, PostInfo } from '../types';
import { api } from '../api';
import {
  Activity,
  CheckCircle,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Search,
  FileText,
  Image as ImageIcon,
  Download,
  Sparkles,
  StopCircle,
  Clock,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';

interface HealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPostByPath: (path: string) => void;
  posts: PostInfo[];
  onUpdateReports?: (reports: HealthCheckResult['broken_reports']) => void;
  onRunningChange?: (running: boolean) => void;
}

type FilterType = 'all' | '404' | '403' | 'other';

export const HealthModal: React.FC<HealthModalProps> = ({
  isOpen,
  onClose,
  onSelectPostByPath,
  posts,
  onUpdateReports,
  onRunningChange,
}) => {
  const toast = useToast();
  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // 估算初始总封面数 (统计已有 posts 中的 http 外链封面)
  const initialTotalImages = useMemo(() => {
    let count = 0;
    for (const p of posts) {
      if (p.images) {
        for (const u of Object.values(p.images)) {
          if (u && typeof u === 'string' && u.trim().startsWith('http')) {
            count++;
          }
        }
      }
    }
    return count;
  }, [posts]);

  // 实时体检状态数据
  const [totalPosts, setTotalPosts] = useState(posts.length);
  const [totalImages, setTotalImages] = useState(initialTotalImages);
  const [scannedImages, setScannedImages] = useState(0);
  const [healthyImages, setHealthyImages] = useState(0);
  const [brokenCount, setBrokenCount] = useState(0);
  const [brokenReports, setBrokenReports] = useState<BrokenReport[]>([]);
  const [currentUrl, setCurrentUrl] = useState('');
  const [duration, setDuration] = useState('');

  // 实时运行耗时计时器
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // 中止控制器
  const abortControllerRef = useRef<AbortController | null>(null);

  // 过滤与搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [copiedUrlIndex, setCopiedUrlIndex] = useState<number | null>(null);
  const [isCopiedAll, setIsCopiedAll] = useState(false);

  // 同步 posts 长度到 totalPosts
  useEffect(() => {
    if (!hasStarted) {
      setTotalPosts(posts.length);
      setTotalImages(initialTotalImages);
    }
  }, [posts, initialTotalImages, hasStarted]);

  // 运行耗时计时
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning]);

  // ⚠️ 以下 Hook 必须位于提前返回之前：否则 isOpen 由 false→true 时
  //    Hook 调用数量增加，会触发 React #310（Rendered more hooks than during the previous render）
  const filteredReports = useMemo(() => {
    return brokenReports.filter(report => {
      // 关键字搜索
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = report.post_title.toLowerCase().includes(q);
        const matchFile = report.file_name.toLowerCase().includes(q);
        const matchField = report.field.toLowerCase().includes(q);
        const matchUrl = report.url.toLowerCase().includes(q);
        const matchErr = (report.error || '').toLowerCase().includes(q);
        if (!matchTitle && !matchFile && !matchField && !matchUrl && !matchErr) {
          return false;
        }
      }

      // 标签过滤
      if (activeFilter === '404') {
        return report.status_code === 404;
      }
      if (activeFilter === '403') {
        return report.status_code === 403;
      }
      if (activeFilter === 'other') {
        return report.status_code !== 404 && report.status_code !== 403;
      }

      return true;
    });
  }, [brokenReports, searchQuery, activeFilter]);

  // 各分类数量统计
  const count404 = useMemo(() => brokenReports.filter(r => r.status_code === 404).length, [brokenReports]);
  const count403 = useMemo(() => brokenReports.filter(r => r.status_code === 403).length, [brokenReports]);

  if (!isOpen) return null;

  // 开始体检
  const handleStartCheck = async () => {
    setIsRunning(true);
    setHasStarted(true);
    setIsCompleted(false);
    onRunningChange?.(true);

    // 重置当前体检数据
    setScannedImages(0);
    setHealthyImages(0);
    setBrokenCount(0);
    setBrokenReports([]);
    setCurrentUrl('');
    setDuration('');
    setElapsedTime(0);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await api.checkHealthStream((evt: HealthProgressEvent) => {
        if (evt.type === 'start') {
          setTotalPosts(evt.total_posts);
          setTotalImages(evt.total_images);
        } else if (evt.type === 'progress') {
          setTotalPosts(evt.total_posts);
          setTotalImages(evt.total_images);
          setScannedImages(evt.scanned_images);
          setHealthyImages(evt.healthy_images);
          setBrokenCount(evt.broken_count);
          if (evt.current_url) {
            setCurrentUrl(evt.current_url);
          }
          if (evt.last_report) {
            setBrokenReports(prev => {
              const exists = prev.some(
                r => r.file_path === evt.last_report?.file_path && r.field === evt.last_report?.field
              );
              return exists ? prev : [...prev, evt.last_report!];
            });
          }
        } else if (evt.type === 'done') {
          setTotalPosts(evt.total_posts);
          setTotalImages(evt.total_images);
          setScannedImages(evt.total_images);
          setHealthyImages(evt.healthy_images);
          setBrokenCount(evt.broken_count);
          setBrokenReports(evt.broken_reports || []);
          if (evt.duration) {
            setDuration(evt.duration);
          }
        }
      }, controller.signal);

      setIsCompleted(true);
      setDuration(res.duration);
      setBrokenReports(res.broken_reports || []);
      if (onUpdateReports && res.broken_reports) {
        onUpdateReports(res.broken_reports);
      }
      if (res.broken_count === 0) {
        toast.success('体检完成，全站配图均正常！');
      } else {
        toast.info(`体检完成，发现 ${res.broken_count} 处异常配图`);
      }
    } catch (e: any) {
      if (e.message?.includes('取消') || controller.signal.aborted) {
        toast.info('已中止本次健康体检');
      } else {
        toast.error('体检异常: ' + e.message);
      }
    } finally {
      setIsRunning(false);
      onRunningChange?.(false);
      abortControllerRef.current = null;
    }
  };

  // 手动中止体检
  const handleAbortCheck = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  // 关闭弹窗：体检运行中不中止任务，保持后台继续检测（重新打开仍可见进度/结果）
  const handleClose = () => {
    if (isRunning) {
      toast.info('体检将在后台继续运行，关闭弹窗不会中止检测');
    }
    onClose();
  };

  // 进度百分比
  const progressPercent = totalImages > 0 ? Math.min(100, Math.round((scannedImages / totalImages) * 100)) : 0;

  // 健康率计算
  const healthRate = totalImages > 0
    ? Math.round((healthyImages / (isCompleted ? totalImages : (scannedImages || 1))) * 100)
    : 100;

  // 复制单张链接
  const handleCopyUrl = (url: string, index: number) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrlIndex(index);
      toast.success('已复制图片外链');
      setTimeout(() => setCopiedUrlIndex(null), 1500);
    });
  };

  // 复制所有失效链接
  const handleCopyAllBrokenUrls = () => {
    if (brokenReports.length === 0) return;
    const urlsText = brokenReports.map(b => b.url).join('\n');
    navigator.clipboard.writeText(urlsText).then(() => {
      setIsCopiedAll(true);
      toast.success(`已复制 ${brokenReports.length} 个失效 URL`);
      setTimeout(() => setIsCopiedAll(false), 2000);
    });
  };

  // 导出 Markdown 报告
  const handleExportMarkdownReport = () => {
    if (brokenReports.length === 0) return;
    const now = new Date().toLocaleString();
    let md = `# 全站封面健康体检诊断报告\n\n`;
    md += `- **检测时间**: ${now}\n`;
    md += `- **扫描文章**: ${totalPosts} 篇\n`;
    md += `- **检测封面**: ${totalImages} 张\n`;
    md += `- **正常有效**: ${healthyImages} 张\n`;
    md += `- **失效数量**: ${brokenCount} 张\n`;
    md += `- **检测耗时**: ${duration || elapsedTime + 's'}\n\n`;
    md += `## 失效封面清单\n\n`;
    md += `| 文章标题 | 文件 | 字段 | 状态码 | 错误说明 | 图片链接 |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    brokenReports.forEach(b => {
      const err = b.error ? b.error.replace(/\|/g, '/') : '-';
      const status = b.status_code ? `HTTP ${b.status_code}` : '超时/失败';
      md += `| ${b.post_title} | \`${b.file_name}\` | \`${b.field}\` | **${status}** | ${err} | ${b.url} |\n`;
    });

    navigator.clipboard.writeText(md).then(() => {
      toast.success('已生成并复制 Markdown 报告至剪贴板');
    });
  };

  // 各分类数量统计（count404 / count403 已上移至提前返回之前）
  const countOther = brokenReports.length - count404 - count403;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="health-modal-title">
          <span>全站封面健康体检</span>
          <span className="health-modal-badge">404 / 失效全网探针</span>
        </div>
      }
      icon={<Activity size={20} className={isRunning ? 'pink-ecg-pulse' : 'text-warning'} />}
      size="lg"
      width={780}
    >
      {/* 1. 顶部 Hero Banner 状态横幅 */}
      <div className="health-hero-container">
        {!hasStarted && !isRunning && (
          <div className="health-hero-card health-hero-idle">
            <div className="health-hero-left">
              <div className="health-hero-icon-box idle-icon-box">
                <Radio size={24} className="text-accent" />
              </div>
              <div className="health-hero-meta">
                <div className="health-hero-title">全站配图可用性深度巡检</div>
                <div className="health-hero-desc">
                  并发探测所有文章的外部图床及网络配图，毫秒级筛查 404 Not Found、防盗链拦截与超时失效。
                </div>
                <div className="health-features-tags">
                  <span className="feature-tag"><Sparkles size={11} /> HTTP HEAD/GET 探针</span>
                  <span className="feature-tag"><Radio size={11} /> 实时流式响应</span>
                  <span className="feature-tag"><ShieldCheck size={11} /> 防盗链拦截诊断</span>
                </div>
              </div>
            </div>
            <div className="health-hero-action">
              <button
                className="btn btn-primary health-btn-glow"
                onClick={handleStartCheck}
              >
                <RefreshCw size={15} />
                <span>开始全站体检</span>
              </button>
            </div>
          </div>
        )}

        {isRunning && (
          <div className="health-hero-card health-hero-running image-fade-in">
            <div className="running-top-row">
              <div className="running-status-indicator">
                <div className="pulsing-radar-dot" />
                <span className="running-title">正在全力并发探测中...</span>
                <span className="running-timer">
                  <Clock size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                  已耗时 {elapsedTime}s
                </span>
              </div>
              <div className="running-action-btns">
                <button
                  className="btn btn-sm btn-ghost btn-danger-ghost"
                  onClick={handleAbortCheck}
                  title="中止正在运行的体检任务"
                >
                  <StopCircle size={14} />
                  <span>中止体检</span>
                </button>
              </div>
            </div>

            {/* 流光渐变进度条 */}
            <div className="health-progress-section">
              <div className="progress-info-bar">
                <span className="progress-numbers">
                  已完成 <strong>{scannedImages}</strong> / {totalImages} 张封面
                </span>
                <span className="progress-percent-badge">{progressPercent}%</span>
              </div>
              <div className="health-progress-bar-wrap">
                <div
                  className="health-progress-bar-fill progress-shimmer"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* 正在探测的目标 URL 动态流 */}
            <div className="probing-realtime-box">
              <span className="probing-pulse-label">PROBING:</span>
              <div className="probing-realtime-url" title={currentUrl || '正在连接探针服务...'}>
                {currentUrl || `正在并发排查全站 ${totalPosts} 篇博文...`}
              </div>
            </div>
          </div>
        )}

        {!isRunning && hasStarted && (
          <div className={`health-hero-card ${brokenCount === 0 ? 'health-hero-perfect' : 'health-hero-warning'} image-fade-in`}>
            <div className="health-hero-left">
              <div className={`health-hero-icon-box ${brokenCount === 0 ? 'perfect-icon-box' : 'warning-icon-box'}`}>
                {brokenCount === 0 ? (
                  <CheckCircle size={28} className="text-success" />
                ) : (
                  <AlertTriangle size={28} className="text-warning" />
                )}
              </div>
              <div className="health-hero-meta">
                <div className="health-hero-title">
                  {brokenCount === 0 ? '全站封面存活状态极佳！' : `体检发现 ${brokenCount} 处失效配图`}
                </div>
                <div className="health-hero-desc">
                  {brokenCount === 0
                    ? `全站共 ${totalImages} 张封面外链均通过存活检测，无任何 404 或死链。耗时: ${duration || elapsedTime + 's'}。`
                    : `在 ${totalPosts} 篇博文中检测出 ${brokenCount} 处无法访问的配图，建议及时修复。耗时: ${duration || elapsedTime + 's'}。`}
                </div>
                <div className="health-features-tags">
                  <span className="feature-tag feature-tag-rate">
                    健康度: <strong>{healthRate}%</strong>
                  </span>
                  <span className="feature-tag">耗时: {duration || elapsedTime + 's'}</span>
                  {brokenCount > 0 && (
                    <span className="feature-tag feature-tag-alert">
                      失效: {brokenCount} 处
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="health-hero-action">
              <button
                className="btn btn-secondary health-btn-restart"
                onClick={handleStartCheck}
              >
                <RefreshCw size={14} />
                <span>重新开始体检</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. 核心指标面板 (Stats Grid) */}
      <div className="health-stats-row">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">扫描文章</span>
            <div className="stat-icon stat-icon-posts"><FileText size={14} /></div>
          </div>
          <span className="stat-num">{totalPosts}</span>
          <span className="stat-sublabel">已纳入体检范畴</span>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-label">{isRunning ? '探测进度' : '总封面数'}</span>
            <div className="stat-icon stat-icon-covers"><ImageIcon size={14} /></div>
          </div>
          <span className="stat-num">
            {isRunning ? `${scannedImages} / ${totalImages}` : totalImages}
          </span>
          <span className="stat-sublabel">
            {isRunning ? `已检测 ${progressPercent}%` : '全站外链图片'}
          </span>
        </div>

        <div className="stat-card stat-healthy">
          <div className="stat-card-header">
            <span className="stat-label">正常有效</span>
            <div className="stat-icon stat-icon-healthy"><ShieldCheck size={14} /></div>
          </div>
          <span className="stat-num">{healthyImages}</span>
          <span className="stat-sublabel stat-sublabel-success">
            {totalImages > 0 ? `存活率 ${Math.round((healthyImages / (totalImages || 1)) * 100)}%` : '正常存活'}
          </span>
        </div>

        <div className={`stat-card ${brokenCount > 0 ? 'stat-broken' : 'stat-zero-broken'}`}>
          <div className="stat-card-header">
            <span className="stat-label">失败数量</span>
            <div className="stat-icon stat-icon-broken">
              {brokenCount > 0 ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
            </div>
          </div>
          <span className="stat-num">{brokenCount}</span>
          <span className={`stat-sublabel ${brokenCount > 0 ? 'stat-sublabel-danger' : 'stat-sublabel-muted'}`}>
            {brokenCount > 0 ? '需要尽快处理' : '无异常配图'}
          </span>
        </div>
      </div>

      {/* 3. 失效列表 / 正常提示 */}
      <div className="health-reports-container">
        {brokenReports.length > 0 && (
          <div className="broken-reports-wrapper image-fade-in">
            {/* 工具栏与过滤筛选器 */}
            <div className="reports-toolbar">
              <div className="toolbar-left">
                <div className="reports-search-box">
                  <Search size={14} className="search-icon" />
                  <input
                    type="text"
                    placeholder="按文章标题、字段、URL 过滤..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="reports-search-input"
                  />
                  {searchQuery && (
                    <button
                      className="search-clear-btn"
                      onClick={() => setSearchQuery('')}
                      title="清空"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* 过滤药丸 */}
                <div className="filter-chips-group">
                  <button
                    className={`filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveFilter('all')}
                  >
                    全部 ({brokenReports.length})
                  </button>
                  {count404 > 0 && (
                    <button
                      className={`filter-chip filter-chip-404 ${activeFilter === '404' ? 'active' : ''}`}
                      onClick={() => setActiveFilter('404')}
                    >
                      404 Not Found ({count404})
                    </button>
                  )}
                  {count403 > 0 && (
                    <button
                      className={`filter-chip filter-chip-403 ${activeFilter === '403' ? 'active' : ''}`}
                      onClick={() => setActiveFilter('403')}
                    >
                      403 防盗链 ({count403})
                    </button>
                  )}
                  {countOther > 0 && (
                    <button
                      className={`filter-chip filter-chip-other ${activeFilter === 'other' ? 'active' : ''}`}
                      onClick={() => setActiveFilter('other')}
                    >
                      超时/其它 ({countOther})
                    </button>
                  )}
                </div>
              </div>

              {/* 批量操作按钮 */}
              <div className="toolbar-right">
                <button
                  className="btn btn-sm btn-ghost btn-copy-all"
                  onClick={handleCopyAllBrokenUrls}
                  title="复制所有失效 URL 到剪贴板"
                >
                  {isCopiedAll ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  <span>{isCopiedAll ? '已复制全部' : '复制所有链接'}</span>
                </button>
                <button
                  className="btn btn-sm btn-ghost btn-export-md"
                  onClick={handleExportMarkdownReport}
                  title="导出完整诊断报告为 Markdown 表格"
                >
                  <Download size={13} />
                  <span>导出诊断报告</span>
                </button>
              </div>
            </div>

            {/* 报告卡片列表 */}
            <div className="broken-reports-list">
              {filteredReports.length === 0 ? (
                <div className="reports-empty-filtered">
                  <SlidersHorizontal size={24} style={{ opacity: 0.4, marginBottom: 6 }} />
                  <div>没有找到符合筛选条件的失效记录</div>
                </div>
              ) : (
                filteredReports.map((b, idx) => {
                  const is404 = b.status_code === 404;
                  const is403 = b.status_code === 403;
                  const statusCodeText = b.status_code ? `HTTP ${b.status_code}` : 'HTTP Err';

                  return (
                    <div
                      key={idx}
                      className={`broken-report-item ${is404 ? 'border-404' : is403 ? 'border-403' : 'border-other'}`}
                    >
                      {/* 卡片头部 */}
                      <div className="broken-item-header">
                        <div className="broken-title-section">
                          <span
                            className="broken-post-title"
                            onClick={() => {
                              onSelectPostByPath(b.file_path);
                              onClose();
                            }}
                            title={`查看文章: ${b.post_title}`}
                          >
                            {b.post_title}
                          </span>
                          <span className="broken-field-badge" title="配图字段">
                            {b.field}
                          </span>
                        </div>

                        <div className="broken-badges-section">
                          <span className={`broken-code-badge ${is404 ? 'code-404' : is403 ? 'code-403' : 'code-other'}`}>
                            {statusCodeText}
                          </span>
                          {b.error && (
                            <span className="broken-error-hint" title={b.error}>
                              {b.error}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* URL 展示与便捷操作 */}
                      <div className="broken-url-box">
                        <span className="broken-url-text" title={b.url}>
                          {b.url}
                        </span>
                        <div className="broken-url-actions">
                          <button
                            className="btn-icon-action"
                            onClick={() => handleCopyUrl(b.url, idx)}
                            title="复制链接"
                          >
                            {copiedUrlIndex === idx ? (
                              <Check size={13} className="text-success" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                          <a
                            href={b.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-icon-action"
                            title="新标签页打开原始链接"
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </div>

                      {/* 底部文件归属与前往修复 */}
                      <div className="broken-action-row">
                        <span className="broken-file-name" title={b.file_path}>
                          <FileText size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                          {b.file_name}
                        </span>

                        <button
                          className="btn btn-sm btn-primary btn-jump-fix"
                          onClick={() => {
                            onSelectPostByPath(b.file_path);
                            onClose();
                            toast.info(`已定位至《${b.post_title}》，可直接更换配图`);
                          }}
                        >
                          <span>前往修复配图</span>
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {isCompleted && brokenReports.length === 0 && (
          <div className="all-healthy-box image-fade-in">
            <div className="healthy-illustration">
              <div className="healthy-glow-circle">
                <CheckCircle size={36} className="text-success" />
              </div>
            </div>
            <div className="healthy-title">太棒了！全站封面健康度 100%</div>
            <div className="healthy-desc">
              全站 {totalPosts} 篇博文中的所有封面图片链接均已通过网络可用性探针，未发现任何 404 或失效配图。
            </div>
            <div className="healthy-badge-row">
              <span className="healthy-sub-pill">总封面数: {totalImages}</span>
              <span className="healthy-sub-pill">正常响应: {healthyImages}</span>
              <span className="healthy-sub-pill">检测耗时: {duration || elapsedTime + 's'}</span>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
