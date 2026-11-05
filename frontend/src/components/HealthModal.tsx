import React, { useState, useMemo } from 'react';
import { BrokenReport, HealthCheckResult, HealthProgressEvent, PostInfo } from '../types';
import { api } from '../api';
import { Activity, CheckCircle, RefreshCw, ArrowRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { ImageFilenameTag } from './ImageFilenameTag';
import { Modal } from './Modal';

interface HealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPostByPath: (path: string) => void;
  posts: PostInfo[];
  onUpdateReports?: (reports: HealthCheckResult['broken_reports']) => void;
  onRunningChange?: (running: boolean) => void;
}

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

  if (!isOpen) return null;

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
              // 避免重复追加
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
      });

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
      toast.error('体检异常: ' + e.message);
    } finally {
      setIsRunning(false);
      onRunningChange?.(false);
    }
  };

  const progressPercent = totalImages > 0 ? Math.min(100, Math.round((scannedImages / totalImages) * 100)) : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="全站封面健康体检 (404 / 失效检测)"
      icon={<Activity size={18} className={isRunning ? 'pink-ecg-pulse' : 'text-warning'} />}
      size="lg"
    >
      <p className="modal-desc">
        并发探测所有博客文章的封面网络链接可用性，快速筛查并定位所有已返回 404 或超时失效的配图。
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0' }}>
        <button
          className="btn btn-primary"
          onClick={handleStartCheck}
          disabled={isRunning}
        >
          {isRunning ? (
            <Activity size={14} className="pink-ecg-pulse" style={{ marginRight: 4 }} />
          ) : (
            <RefreshCw size={14} />
          )}
          <span>{isRunning ? '正在全力并发体检中...' : (hasStarted ? '重新开始体检' : '开始全站体检')}</span>
        </button>
        {isCompleted && duration && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            耗时: {duration} · 共检查 {totalImages} 张封面图片
          </span>
        )}
      </div>

      {/* 1. 核心指标面板：直接显示出来，体检时动态实时跳动 */}
      <div className="health-stats-row">
        <div className="stat-card">
          <span className="stat-num">{totalPosts}</span>
          <span className="stat-label">扫描文章</span>
        </div>
        <div className="stat-card">
          <span className="stat-num">
            {isRunning ? `${scannedImages} / ${totalImages}` : totalImages}
          </span>
          <span className="stat-label">{isRunning ? '探测进度 (已查/总数)' : '总封面数'}</span>
        </div>
        <div className="stat-card stat-healthy">
          <span className="stat-num">{healthyImages}</span>
          <span className="stat-label">正常有效</span>
        </div>
        <div className={`stat-card ${brokenCount > 0 ? 'stat-broken' : ''}`}>
          <span className="stat-num">{brokenCount}</span>
          <span className="stat-label">失败数量</span>
        </div>
      </div>

      {/* 2. 体检进行中：真实动态进度条与当前探测 URL (彻底替换假心跳) */}
      {isRunning && (
        <div className="probing-active-card image-fade-in">
          <div className="probing-header">
            <div className="probing-badge">
              <Activity size={15} className="pink-ecg-pulse" />
              <span>全站封面存活性探针并发检测中...</span>
            </div>
            <span className="probing-tag">{progressPercent}%</span>
          </div>

          <div className="health-progress-bar-wrap">
            <div
              className="health-progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="probing-meta-row">
            {currentUrl ? (
              <div className="probing-current-url" title={currentUrl}>
                <span className="probing-url-prefix">正在探测:</span>
                <span className="probing-url-text">{currentUrl}</span>
              </div>
            ) : (
              <span className="probing-current-url" style={{ color: 'var(--text-muted)' }}>
                正在并发探测全站 {totalPosts} 篇博文中的封面链接...
              </span>
            )}
            <span className="probing-hint">HTTP HEAD / 1KB GET</span>
          </div>
        </div>
      )}

      {/* 3. 失效列表 / 正常提示 */}
      <div style={{ marginTop: 16 }}>
        {brokenReports.length > 0 && (
          <div className="broken-reports-list image-fade-in">
            {brokenReports.map((b, idx) => (
              <div key={idx} className="broken-report-item">
                <div className="broken-item-header">
                  <span className="broken-post-title">{b.post_title}</span>
                  <span className="broken-field-badge">{b.field}</span>
                  <span className="broken-code-badge">HTTP {b.status_code || 'Err'}</span>
                </div>
                <div style={{ margin: '6px 0' }}>
                  <ImageFilenameTag url={b.url} maxWidth="100%" />
                </div>
                <div className="broken-action-row">
                  <span className="broken-file-name">{b.file_name}</span>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      onSelectPostByPath(b.file_path);
                      onClose();
                    }}
                  >
                    <span>前往修复配图</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isCompleted && brokenReports.length === 0 && (
          <div className="all-healthy-box image-fade-in">
            <CheckCircle size={28} style={{ color: '#10b981', marginBottom: 8 }} />
            <div>太棒了！全站所有文章封面链接均正常存活，未发现 404 图片！</div>
          </div>
        )}
      </div>
    </Modal>
  );
};