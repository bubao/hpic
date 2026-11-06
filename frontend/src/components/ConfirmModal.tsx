import React from 'react';
import { AlertCircle, Trash2, ArrowRight } from 'lucide-react';
import { Modal } from './Modal';
import { isSvgUrl } from '../utils/imageMeta';
import { SvgSafeImage } from './common/SvgSafeImage';

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
      <div className="confirm-modal-body">
        {/* 新旧封面覆盖对比视窗 */}
        {diffPreview && (
          <div>
            <div className="confirm-diff-intro">
              检测到博文 <strong>《{diffPreview.postTitle}》</strong> 已存在封面图片：
            </div>

            <div className="confirm-diff-box">
              {/* 旧封面 */}
              <div className="confirm-diff-col">
                <div className="confirm-diff-label">
                  当前已有封面
                </div>
                {diffPreview.oldUrl ? (
                  isSvgUrl(diffPreview.oldUrl) ? (
                    <SvgSafeImage
                      src={diffPreview.oldUrl}
                      alt="current"
                      className="confirm-diff-img"
                      fitMode="contain"
                    />
                  ) : (
                    <img
                      src={diffPreview.oldUrl}
                      alt="current"
                      referrerPolicy="no-referrer"
                      className="confirm-diff-img"
                    />
                  )
                ) : (
                  <div className="confirm-diff-empty">
                    无图片
                  </div>
                )}
              </div>

              {/* 箭头指示 */}
              <div className="confirm-diff-arrow">
                <ArrowRight size={18} />
              </div>

              {/* 新封面 */}
              <div className="confirm-diff-col">
                <div className="confirm-diff-label highlight">
                  准备替换为
                </div>
                {isSvgUrl(diffPreview.newUrl) ? (
                  <SvgSafeImage
                    src={diffPreview.newUrl}
                    alt="new"
                    className="confirm-diff-img target"
                    fitMode="contain"
                  />
                ) : (
                  <img
                    src={diffPreview.newUrl}
                    alt="new"
                    referrerPolicy="no-referrer"
                    className="confirm-diff-img target"
                  />
                )}
              </div>
            </div>

            {/* 影响字段标签列表 */}
            <div className="confirm-fields-badge-box">
              <span>将覆盖字段:</span>
              {diffPreview.fields.map(f => (
                <span key={f} className="confirm-field-pill">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {thumbUrl && !diffPreview && (
          <div className="confirm-thumb-row">
            {isSvgUrl(thumbUrl) ? (
              <SvgSafeImage
                src={thumbUrl}
                alt="preview"
                className="confirm-thumb-img"
                fitMode="contain"
              />
            ) : (
              <img
                src={thumbUrl}
                alt="preview"
                referrerPolicy="no-referrer"
                className="confirm-thumb-img"
              />
            )}
          </div>
        )}
        {message && (
          <p className="confirm-message-text">
            {message}
          </p>
        )}
        {subMessage && (
          <p className="confirm-submessage-text">
            {subMessage}
          </p>
        )}
      </div>

      <div className="confirm-actions">
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
