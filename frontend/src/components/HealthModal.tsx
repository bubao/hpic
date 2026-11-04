import React, { useState } from 'react';
import { HealthCheckResult, PostInfo } from '../types';
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
  const [result, setResult] = useState<HealthCheckResult | null>(null);

  if (!isOpen) return null;

  const handleStartCheck = async () => {
    setIsRunning(true);
    onRunningChange?.(true);
    try {
      const res = await api.checkHealth();
      setResult(res);
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
          <span>{isRunning ? '正在全力并发体检中...' : (result ? '重新开始体检' : '开始全站体检')}</span>
        </button>
        {result && !isRunning && (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            耗时: {result.duration} · 检查了 {result.total_images} 张图片
          </span>
        )}
      </div>

      {/* 体检运行中：粉色发光心电波形动态流动 */}
      {isRunning && (
        <div className="probing-active-card image-fade-in">
          <div className="probing-header">
            <div className="probing-badge">
              <Activity size={15} className="pink-ecg-pulse" />
              <span>全站博文封面存活性探针并发检测中...</span>
            </div>
            <span className="probing-tag">HTTP HEAD</span>
          </div>

          {/* 实时粉色发光心电波形流 */}
          <div className="pink-ecg-waveform-wrap">
            <svg className="pink-ecg-svg" viewBox="0 0 600 44" preserveAspectRatio="none">
              <path
                className="pink-ecg-base-line"
                d="M 0 22 L 60 22 L 70 22 L 75 15 L 80 29 L 85 4 L 92 40 L 98 22 L 105 22 L 115 17 L 125 22 L 210 22 L 220 22 L 225 15 L 230 29 L 235 4 L 242 40 L 248 22 L 255 22 L 265 17 L 275 22 L 360 22 L 370 22 L 375 15 L 380 29 L 385 4 L 392 40 L 398 22 L 405 22 L 415 17 L 425 22 L 510 22 L 520 22 L 525 15 L 530 29 L 535 4 L 542 40 L 548 22 L 555 22 L 565 17 L 575 22 L 600 22"
              />
              <path
                className="pink-ecg-pulse-line"
                d="M 0 22 L 60 22 L 70 22 L 75 15 L 80 29 L 85 4 L 92 40 L 98 22 L 105 22 L 115 17 L 125 22 L 210 22 L 220 22 L 225 15 L 230 29 L 235 4 L 242 40 L 248 22 L 255 22 L 265 17 L 275 22 L 360 22 L 370 22 L 375 15 L 380 29 L 385 4 L 392 40 L 398 22 L 405 22 L 415 17 L 425 22 L 510 22 L 520 22 L 525 15 L 530 29 L 535 4 L 542 40 L 548 22 L 555 22 L 565 17 L 575 22 L 600 22"
              />
            </svg>
          </div>

          <div className="probing-meta-row">
            <span>正在并发探测全站 {posts.length} 篇博文中的封面链接</span>
            <span className="probing-hint">实时校验 HTTP 状态码 (200 / 404 / 超时)</span>
          </div>
        </div>
      )}

          {/* 体检指标面板 (体检就绪后展示) */}
          {result && !isRunning && (
            <div className="health-stats-row">
              <div className="stat-card">
                <span className="stat-num">{result.total_posts}</span>
                <span className="stat-label">扫描文章</span>
              </div>
              <div className="stat-card">
                <span className="stat-num">{result.total_images}</span>
                <span className="stat-label">总封面数</span>
              </div>
              <div className="stat-card stat-healthy">
                <span className="stat-num">{result.healthy_images}</span>
                <span className="stat-label">正常有效</span>
              </div>
              <div className={`stat-card ${result.broken_count > 0 ? 'stat-broken' : ''}`}>
                <span className="stat-num">{result.broken_count}</span>
                <span className="stat-label">404 失效</span>
              </div>
            </div>
          )}

          {/* 失效列表 (体检完成且非运行中时展示) */}
          {result && !isRunning && (
            <div className="broken-reports-list image-fade-in">
              {result.broken_count === 0 ? (
                <div className="all-healthy-box">
                  <CheckCircle size={28} style={{ color: '#10b981', marginBottom: 8 }} />
                  <div>太棒了！全站所有文章封面链接均正常存活，未发现 404 图片！</div>
                </div>
              ) : (
                result.broken_reports.map((b, idx) => (
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
                ))
              )}
            </div>
          )}
    </Modal>
  );
};
