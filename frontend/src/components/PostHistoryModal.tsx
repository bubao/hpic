import React, { useState, useEffect } from 'react';
import { PostInfo, OperationRecord } from '../types';
import { api } from '../api';
import { Modal } from './Modal';
import { History, RotateCcw, Clock, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface PostHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: PostInfo | null;
  onPostUpdated: (updatedPost: PostInfo) => void;
}

export const PostHistoryModal: React.FC<PostHistoryModalProps> = ({
  isOpen,
  onClose,
  post,
  onPostUpdated,
}) => {
  const toast = useToast();
  const [history, setHistory] = useState<OperationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<number | null>(null);

  const fetchHistory = async () => {
    if (!post?.file_path) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPostHistory(post.file_path);
      if (res.success) {
        setHistory(res.history || []);
      } else {
        const errMsg = res.error || '获取历史记录失败';
        setError(errMsg);
        toast.error(errMsg);
      }
    } catch (e: any) {
      const errMsg = e?.message || '获取历史记录异常，请检查网络或本地服务';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && post?.file_path) {
      fetchHistory();
    }
  }, [isOpen, post?.file_path]);

  if (!isOpen || !post) return null;

  const handleRollback = async (record: OperationRecord) => {
    setRevertingId(record.id);
    try {
      const res = await api.undoPostOperation(post.file_path, record.id);
      if (res.success && res.post) {
        toast.success(`已成功回滚该次变动！`);
        onPostUpdated(res.post);
        await fetchHistory();
      } else {
        toast.error(res.error || '回滚未成功');
      }
    } catch (e: any) {
      toast.error('回滚操作失败: ' + (e?.message || '网络连接异常'));
    } finally {
      setRevertingId(null);
    }
  };

  const formatTime = (timeStr: string) => {
    try {
      const d = new Date(timeStr);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timeStr;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`文章封面变更历史 - 《${post.title}》`}
      icon={<History size={18} style={{ color: 'var(--accent-color)' }} />}
      size="lg"
    >
      <div className="post-history-modal-body">
        <div className="history-head-banner">
          <div className="history-post-meta">
            <span className="history-meta-title">{post.title}</span>
            <span className="history-meta-path">{post.file_name}</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={fetchHistory}
            disabled={loading}
            title="刷新历史记录"
          >
            <RefreshCw size={12} className={loading ? 'spin' : ''} />
            <span>刷新</span>
          </button>
        </div>

        {loading ? (
          <div className="history-empty-state">
            <RefreshCw size={24} className="spin history-empty-icon" />
            <div className="history-loading-text">
              正在加载变更历史...
            </div>
          </div>
        ) : error ? (
          <div className="history-empty-state">
            <AlertCircle size={36} style={{ color: '#ef4444', opacity: 0.8 }} />
            <div className="history-empty-title" style={{ color: '#ef4444' }}>
              {error}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchHistory}
              style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} />
              <span>重试加载</span>
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="history-empty-state">
            <Layers size={36} className="history-empty-icon" />
            <div className="history-empty-title">
              暂无历史变动记录
            </div>
            <div className="history-empty-desc">
              在此文章上替换封面、清空封面或正文配图后，系统将在此自动保存完整的时光机快照，支持随时一键回退还原。
            </div>
          </div>
        ) : (
          <div className="history-timeline-list">
            {history.map((item, idx) => {
              const isUndoable = !item.is_undone;
              const isCoverOp = item.operation_type === 'update_cover';
              const isClearOp = item.operation_type === 'clear_cover';
              const isInsertOp = item.operation_type === 'insert_image';

              return (
                <div key={item.id} className={`history-timeline-card ${item.is_undone ? 'is-undone' : ''}`}>
                  <div className="history-card-header">
                    <div className="history-op-badges">
                      <span className={`history-op-pill ${item.operation_type}`}>
                        {isCoverOp ? '替换封面' : isClearOp ? '清空封面' : '正文插图'}
                      </span>
                      {item.field && (
                        <span className="history-field-pill">{item.field}</span>
                      )}
                      {item.is_undone ? (
                        <span className="history-status-pill undone" title="该记录已被撤销回滚">
                          <AlertCircle size={10} />
                          <span>已撤销</span>
                        </span>
                      ) : (
                        <span className="history-status-pill active" title="当前该次变动正在生效">
                          <CheckCircle2 size={10} />
                          <span>生效中</span>
                        </span>
                      )}
                    </div>
                    <div className="history-timestamp">
                      <Clock size={11} />
                      <span>{formatTime(item.created_at)}</span>
                    </div>
                  </div>

                  <div className="history-card-diff">
                    {isCoverOp && (
                      <div className="history-diff-row">
                        <div className="diff-side diff-old">
                          <span className="diff-label">修改前：</span>
                          {item.old_value ? (
                            <div className="diff-thumb-box" title={item.old_value}>
                              <img src={item.old_value} alt="原封面" referrerPolicy="no-referrer" />
                            </div>
                          ) : (
                            <div className="diff-thumb-empty">原无配图</div>
                          )}
                        </div>

                        <div className="diff-arrow-indicator">
                          <ArrowRight size={16} />
                        </div>

                        <div className="diff-side diff-new">
                          <span className="diff-label">修改后：</span>
                          {item.new_value ? (
                            <div className="diff-thumb-box" title={item.new_value}>
                              <img src={item.new_value} alt="新封面" referrerPolicy="no-referrer" />
                            </div>
                          ) : (
                            <div className="diff-thumb-empty">已清空</div>
                          )}
                        </div>
                      </div>
                    )}

                    {isClearOp && (
                      <div className="history-diff-row">
                        <div className="diff-side diff-old">
                          <span className="diff-label">被清空的原图：</span>
                          {item.old_value ? (
                            <div className="diff-thumb-box" title={item.old_value}>
                              <img src={item.old_value} alt="原封面" referrerPolicy="no-referrer" />
                            </div>
                          ) : (
                            <div className="diff-thumb-empty">原值为空</div>
                          )}
                        </div>
                      </div>
                    )}

                    {isInsertOp && (
                      <div className="history-diff-row">
                        <div className="diff-side diff-insert">
                          <span className="diff-label">追加插入正文的图片：</span>
                          {item.field ? (
                            <div className="diff-thumb-box" title={item.field}>
                              <img src={item.field} alt="插入正文配图" referrerPolicy="no-referrer" />
                            </div>
                          ) : null}
                          <code className="diff-code-snippet">{item.new_value}</code>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="history-card-footer">
                    <span className="history-seq-text">记录 #{history.length - idx}</span>
                    {isUndoable && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost highlight-rollback-btn"
                        onClick={() => handleRollback(item)}
                        disabled={revertingId === item.id}
                        title="将此博文还原回退到此次操作之前的状态"
                      >
                        <RotateCcw size={12} className={revertingId === item.id ? 'spin' : ''} />
                        <span>{revertingId === item.id ? '回退中...' : '撤销回退至此时'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
