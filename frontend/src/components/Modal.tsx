import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  width?: number | string;
  zIndex?: number;
  className?: string;
  dialogClassName?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 统一的基础弹窗组件
 * 消除全站 7 个 Modal 中重复的遮罩、关闭按钮、冒泡处理与 ESC 监听
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  size = 'md',
  width,
  zIndex = 500,
  className = '',
  dialogClassName = '',
  headerRight,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeClass = size === 'sm' ? 'modal-sm' : size === 'lg' ? 'modal-lg' : size === 'xl' ? 'modal-xl' : '';

  return (
    <div
      className={`modal-backdrop ${className}`}
      onClick={onClose}
      style={zIndex ? { zIndex } : undefined}
    >
      <div
        className={`modal-dialog ${sizeClass} ${dialogClassName}`}
        onClick={e => e.stopPropagation()}
        style={width ? { width } : undefined}
      >
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {icon}
            <h3 className="modal-title">{title}</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {headerRight}
            <button
              type="button"
              className="btn-close-icon"
              onClick={onClose}
              title="关闭弹窗 (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="modal-body-content">
          {children}
        </div>
      </div>
    </div>
  );
};
