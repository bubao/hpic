import React, { useState, useEffect, useMemo } from 'react';
import { PostInfo, OperationRecord } from '../types';
import { api } from '../api';
import { Modal } from './Modal';
import { Icon } from './common/Icon';
import { useToast } from '../context/ToastContext';
import { isSvgUrl } from '../utils/imageMeta';
import { SvgSafeImage } from './common/SvgSafeImage';

interface PostHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: PostInfo | null;
  /** post = 单篇文章变更历史；global = 全部文章操作历史（按批次分组，支持整批撤销） */
  mode?: 'post' | 'global';
  onPostUpdated: (updatedPost: PostInfo) => void;
  onHistoryChanged?: () => void;
}

interface HistoryBatchGroup {
  key: string;
  batchId: number | null;
  records: OperationRecord[];
}

export const PostHistoryModal: React.FC<PostHistoryModalProps> = ({
  isOpen,
  onClose,
  post,
  mode = 'post',
  onPostUpdated,
  onHistoryChanged,
}) => {
  const toast = useToast();
  const [history, setHistory] = useState<OperationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = mode === 'global'
        ? await api.getGlobalHistory(100)
        : await api.getPostHistory(post?.file_path || '');
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
    if (isOpen && (mode === 'global' || post?.file_path)) {
      fetchHistory();
      setConfirmDeleteId(null);
      setShowClearConfirm(false);
    }
  }, [isOpen, post?.file_path, mode]);

  // 全局模式：按 batch_id 聚合，同批操作（如一次改多个封面字段）共享一个撤销入口
  const groups = useMemo<HistoryBatchGroup[]>(() => {
    const list: HistoryBatchGroup[] = [];
    const index = new Map<string, number>();
    for (const item of history) {
      const key = item.batch_id ? `batch:${item.batch_id}` : `op:${item.id}`;
      const at = index.get(key);
      if (at === undefined) {
        index.set(key, list.length);
        list.push({ key, batchId: item.batch_id || null, records: [item] });
      } else {
        list[at].records.push(item);
      }
    }
    return list;
  }, [history]);

  if (!isOpen || (mode === 'post' && !post)) return null;

  const handleRollback = async (record: OperationRecord) => {
    const targetPath = record.file_path || post?.file_path || '';
    if (!targetPath) {
      toast.error('缺少文章路径，无法回滚');
      return;
    }
    setRevertingId(record.id);
    try {
      const res = await api.undoPostOperation(targetPath, record.id);
      if (res.success && res.post) {
        toast.success(record.batch_id ? '已成功撤销整批操作！' : '已成功回滚该次变动！');
        onPostUpdated(res.post);
        await fetchHistory();
        onHistoryChanged?.();
      } else {
        toast.error(res.error || '回滚未成功');
      }
    } catch (e: any) {
      toast.error('回滚操作失败: ' + (e?.message || '网络连接异常'));
    } finally {
      setRevertingId(null);
    }
  };

  const handleDeleteRecord = async (record: OperationRecord) => {
    setDeletingId(record.id);
    try {
      const res = await api.deletePostHistory(record.id);
      if (res.success) {
        toast.success('已移除该条操作记录');
        setHistory(prev => prev.filter(item => item.id !== record.id && (!record.batch_id || item.batch_id !== record.batch_id)));
        setConfirmDeleteId(null);
        onHistoryChanged?.();
      } else {
        toast.error(res.error || '删除失败');
      }
    } catch (e: any) {
      toast.error('删除操作记录失败: ' + (e?.message || '网络连接异常'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAllHistory = async () => {
    if (!post?.file_path) return;
    setIsClearing(true);
    try {
      const res = await api.clearPostHistory(post.file_path);
      if (res.success) {
        toast.success('已清空全部操作历史记录');
        setHistory([]);
        setShowClearConfirm(false);
        onHistoryChanged?.();
      } else {
        toast.error(res.error || '清空失败');
      }
    } catch (e: any) {
      toast.error('清空历史记录失败: ' + (e?.message || '网络连接异常'));
    } finally {
      setIsClearing(false);
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

  const renderRecordCard = (item: OperationRecord) => {
    const isUndoable = !item.is_undone;
    const isCoverOp = item.operation_type === 'update_cover';
    const isClearOp = item.operation_type === 'clear_cover';
    const isInsertOp = item.operation_type === 'insert_image';
    const isConfirmingDelete = confirmDeleteId === item.id;
    const isDeleting = deletingId === item.id;

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
                <Icon name="alertCircle" size="xs" variant="warning" />
                <span>已撤销</span>
              </span>
            ) : (
              <span className="history-status-pill active" title="当前该次变动正在生效">
                <Icon name="checkCircle" size="xs" variant="success" />
                <span>生效中</span>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="history-timestamp">
              <Icon name="clock" size="xs" variant="muted" />
              <span>{formatTime(item.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="history-card-diff">
          {isCoverOp && (
            <div className="history-diff-row">
              <div className="diff-side diff-old">
                <span className="diff-label">修改前：</span>
                {item.old_value ? (
                  <div className="diff-thumb-box" title={item.old_value}>
                    {isSvgUrl(item.old_value) ? (
                      <SvgSafeImage
                        src={item.old_value || ''}
                        alt="原封面"
                        fitMode="contain"
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <img src={item.old_value} alt="原封面" referrerPolicy="no-referrer" />
                    )}
                  </div>
                ) : (
                  <div className="diff-thumb-empty">此前无封面</div>
                )}
              </div>

              <div className="diff-arrow-icon">
                <Icon name="arrowRight" size="md" variant="muted" />
              </div>

              <div className="diff-side diff-new">
                <span className="diff-label">修改后：</span>
                {item.new_value ? (
                  <div className="diff-thumb-box" title={item.new_value}>
                    {isSvgUrl(item.new_value) ? (
                      <SvgSafeImage
                        src={item.new_value || ''}
                        alt="新封面"
                        fitMode="contain"
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <img src={item.new_value} alt="新封面" referrerPolicy="no-referrer" />
                    )}
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
                    {isSvgUrl(item.old_value) ? (
                      <SvgSafeImage
                        src={item.old_value || ''}
                        alt="原封面"
                        fitMode="contain"
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <img src={item.old_value} alt="原封面" referrerPolicy="no-referrer" />
                    )}
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
                    {isSvgUrl(item.field) ? (
                      <SvgSafeImage
                        src={item.field || ''}
                        alt="插入正文配图"
                        fitMode="contain"
                        style={{ width: '100%', height: '100%' }}
                      />
                    ) : (
                      <img src={item.field} alt="插入正文配图" referrerPolicy="no-referrer" />
                    )}
                  </div>
                ) : (
                  <div className="diff-thumb-empty">无图片地址</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="history-card-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="history-record-id-meta" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            #{item.id} {item.batch_id ? `(批次 ${item.batch_id})` : ''}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 移除单条记录 */}
            {isConfirmingDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--danger-color, #ef4444)' }}>确定移除？</span>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDeleteRecord(item)}
                  disabled={isDeleting}
                  style={{ padding: '2px 6px', fontSize: 11 }}
                >
                  {isDeleting ? '移除中...' : '确定'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setConfirmDeleteId(null)}
                  style={{ padding: '2px 6px', fontSize: 11 }}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-ghost history-delete-item-btn"
                onClick={() => setConfirmDeleteId(item.id)}
                title="从历史列表中移除此条记录"
                style={{ padding: '3px 8px', fontSize: 11.5, color: 'var(--text-muted)' }}
              >
                <Icon name="trash" size="xs" variant="muted" />
                <span>移除</span>
              </button>
            )}

            {/* 回退还原按钮 */}
            {isUndoable && (
              <button
                type="button"
                className="btn btn-sm btn-ghost highlight-rollback-btn"
                onClick={() => handleRollback(item)}
                disabled={revertingId === item.id}
                title="将此博文还原回退到此次操作之前的状态"
              >
                <Icon name="undo" size="xs" animation={revertingId === item.id ? 'spin' : 'none'} />
                <span>{revertingId === item.id ? '回退中...' : '撤销回退至此时'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'global' ? '全部文章操作历史' : `文章封面变更历史 - 《${post?.title}》`}
      icon={<Icon name="history" size="lg" variant="primary" />}
      size="lg"
    >
      <div className="post-history-modal-body">
        {mode === 'global' ? (
          <div className="history-head-banner">
            <div className="history-post-meta">
              <span className="history-meta-title">全部文章</span>
              <span className="history-meta-path">
                共 {history.length} 条记录 · {groups.length} 个操作批次
              </span>
            </div>

            <div className="history-head-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={fetchHistory}
                disabled={loading}
                title="刷新历史记录"
              >
                <Icon name="refresh" size="xs" animation={loading ? 'spin' : 'none'} />
                <span>刷新</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="history-head-banner">
            <div className="history-post-meta">
              <span className="history-meta-title">{post?.title}</span>
              <span className="history-meta-path">{post?.file_name}</span>
            </div>

            <div className="history-head-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {history.length > 0 && (
                <>
                  {showClearConfirm ? (
                    <div className="history-clear-confirm-group" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--danger-color, #ef4444)' }}>确定清空全部记录？</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={handleClearAllHistory}
                        disabled={isClearing}
                        style={{ padding: '2px 8px', fontSize: 12 }}
                      >
                        {isClearing ? '清空中...' : '确定'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setShowClearConfirm(false)}
                        style={{ padding: '2px 8px', fontSize: 12 }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost history-clear-btn"
                      onClick={() => setShowClearConfirm(true)}
                      title="清空当前文章的所有操作记录"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <Icon name="trash" size="xs" variant="muted" />
                      <span>清空记录</span>
                    </button>
                  )}
                </>
              )}

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={fetchHistory}
                disabled={loading}
                title="刷新历史记录"
              >
                <Icon name="refresh" size="xs" animation={loading ? 'spin' : 'none'} />
                <span>刷新</span>
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="history-empty-state">
            <Icon name="loading" size="xl" animation="spin" variant="primary" className="history-empty-icon" />
            <div className="history-loading-text">
              正在加载变更历史...
            </div>
          </div>
        ) : error ? (
          <div className="history-empty-state">
            <Icon name="alertCircle" size="xl" variant="danger" />
            <div className="history-empty-title" style={{ color: 'var(--danger-color, #ef4444)' }}>
              {error}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchHistory}
              style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="refresh" size="xs" />
              <span>重试加载</span>
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="history-empty-state">
            <Icon name="layers" size="xl" variant="muted" className="history-empty-icon" />
            <div className="history-empty-title">
              暂无历史变动记录
            </div>
            <div className="history-empty-desc">
              {mode === 'global'
                ? '在任何文章上替换封面、清空封面或追加正文配图后，系统会自动保存操作快照，支持按批次一键撤销。'
                : '在此文章上替换封面、清空封面或正文配图后，系统将在此自动保存完整的时光机快照，支持随时一键回退还原。'}
            </div>
          </div>
        ) : mode === 'global' ? (
          <div className="history-timeline-list">
            {groups.map(group => {
              const activeRecord = group.records.find(r => !r.is_undone);
              return (
                <div key={group.key} className="history-batch-group">
                  <div className="history-batch-header">
                    <span className="history-batch-pill">
                      {group.batchId ? `批次 ${group.batchId}` : '单条操作'}
                    </span>
                    <span className="history-batch-post" title={group.records[0].file_path}>
                      {group.records[0].post_title || '未知文章'}
                    </span>
                    <span className="history-batch-count">{group.records.length} 条记录</span>
                    <div className="history-batch-actions">
                      {activeRecord && (
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost highlight-rollback-btn"
                          onClick={() => handleRollback(activeRecord)}
                          disabled={revertingId === activeRecord.id}
                          title="撤销该批次全部操作，恢复到批次执行前的状态"
                        >
                          <Icon name="undo" size="xs" animation={revertingId === activeRecord.id ? 'spin' : 'none'} />
                          <span>{revertingId === activeRecord.id ? '回退中...' : '撤销整批'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                  {group.records.map(item => renderRecordCard(item))}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="history-timeline-list">
            {history.map(item => renderRecordCard(item))}
          </div>
        )}
      </div>
    </Modal>
  );
};
