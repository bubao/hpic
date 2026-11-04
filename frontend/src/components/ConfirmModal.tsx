import React from 'react';
import { AlertCircle, Trash2, ArrowRight } from 'lucide-react';
import { Modal } from './Modal';

export interface DiffPreviewData {
  oldUrl?: string;
  newUrl: string;
  fields: string[];
  postTitle: string;
}

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  subMessage?: string;
  thumbUrl?: string;
  diffPreview?: DiffPreviewData;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  subMessage,
  thumbUrl,
  diffPreview,
  confirmText = '确定',
  cancelText = '取消',
  danger = true,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      icon={<AlertCircle size={16} color={danger ? '#f59e0b' : 'var(--primary-color)'} />}
      width={diffPreview ? 460 : 400}
      zIndex={1000}
      className="confirm-modal-backdrop"
    >
      <div style={{ padding: '4px 0' }}>
        {/* 新旧封面覆盖对比视窗 */}
        {diffPreview && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              检测到博文 <strong style={{ color: 'var(--text-primary)' }}>《{diffPreview.postTitle}》</strong> 已存在封面图片：
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-secondary)',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                gap: 12,
              }}
            >
              {/* 旧封面 */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                  当前已有封面
                </div>
                {diffPreview.oldUrl ? (
                  <img
                    src={diffPreview.oldUrl}
                    alt="current"
                    referrerPolicy="no-referrer"
                    style={{
                      width: '100%',
                      height: 76,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 76,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 6,
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}
                  >
                    无图片
                  </div>
                )}
              </div>

              {/* 箭头指示 */}
              <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                <ArrowRight size={18} />
              </div>

              {/* 新封面 */}
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--primary-color)', fontWeight: 500, marginBottom: 6 }}>
                  准备替换为
                </div>
                <img
                  src={diffPreview.newUrl}
                  alt="new"
                  referrerPolicy="no-referrer"
                  style={{
                    width: '100%',
                    height: 76,
                    objectFit: 'cover',
                    borderRadius: 6,
                    border: '2px solid var(--primary-color)',
                    display: 'block',
                  }}
                />
              </div>
            </div>

            {/* 影响字段标签列表 */}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span>将覆盖字段:</span>
              {diffPreview.fields.map(f => (
                <span
                  key={f}
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {thumbUrl && !diffPreview && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <img
              src={thumbUrl}
              alt="preview"
              referrerPolicy="no-referrer"
              style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-color)' }}
            />
          </div>
        )}
        {message && (
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        {subMessage && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {subMessage}
          </p>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          {cancelText}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
        >
          {danger && !diffPreview && <Trash2 size={12} style={{ marginRight: 4 }} />}
          {confirmText}
        </button>
      </div>
    </Modal>
  );
};
